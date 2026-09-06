import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncSubscriptionState } from "@/lib/billing/subscriptionSync";
import { clearAllSharedResources, invalidateSharedResource, readSharedResource, writeSharedResource } from "@/lib/sharedResource";
import { BILLING_ENVIRONMENT } from "@/lib/billing/subscriptionState";

vi.mock("@/integrations/supabase/userClient", () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-123", email: "teste@exemplo.com" } },
        }),
      },
      from: vi.fn((table: string) => {
        const queryBuilder: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: table === "subscriptions" ? {
              id: "sub-123",
              user_id: "user-123",
              status: "active",
              product_id: "pro_plan",
              current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
              cancel_at_period_end: false,
              price_id: "price_monthly",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } : null,
            error: null,
          }),
        };
        return queryBuilder;
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

describe("⚡ Sincronização Instantânea de Assinatura sem Reload (Zero-Refresh Flow)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllSharedResources();
    vi.clearAllMocks();
  });

  it("1. Grava e recupera cache no sharedResource corretamente", () => {
    const key = "subscription:user-123";
    const subData = {
      id: "sub-1",
      user_id: "user-123",
      status: "active",
      product_id: "pro_plan",
      current_period_end: "2026-10-06T00:00:00.000Z",
    };

    writeSharedResource(key, subData);
    const cached = readSharedResource(key);
    expect(cached).toEqual(subData);

    const updatedSubData = {
      ...subData,
      status: "active",
      product_id: "ultra_plan",
    };
    writeSharedResource(key, updatedSubData);
    expect(readSharedResource(key)).toEqual(updatedSubData);
  });

  it("2. syncSubscriptionState atualiza o cache e emite evento subscription:changed com payload", async () => {
    let capturedDetail: any = null;
    const listener = (e: Event) => {
      const customEvent = e as CustomEvent;
      capturedDetail = customEvent.detail;
    };

    window.addEventListener("subscription:changed", listener);

    const mockQueryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      setQueryData: vi.fn(),
    };

    const sub = await syncSubscriptionState("user-123", {
      waitForActive: true,
      maxAttempts: 2,
      pollIntervalMs: 50,
      queryClient: mockQueryClient as any,
    });

    expect(sub).not.toBeNull();
    expect(sub?.status).toBe("active");
    expect(sub?.product_id).toBe("pro_plan");

    // Verifica que o cache sharedResource foi populado
    const cached = readSharedResource(`subscription:user-123:${BILLING_ENVIRONMENT}`);
    expect(cached).toEqual(sub);

    // Verifica que queryClient foi invalidado
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["subscription"] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["profile"] });
    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(["subscription", "user-123"], sub);

    // Verifica se o evento foi recebido com o detail do subscription
    expect(capturedDetail).toBeDefined();
    expect(capturedDetail.subscription.product_id).toBe("pro_plan");

    window.removeEventListener("subscription:changed", listener);
  });

  it("3. Transição de estado: quando assinatura ativa é detectada, trial é desativado", () => {
    // Simula a lógica de usePlanEntitlements
    const computeEntitlements = (subscription: any, profile: any) => {
      const isSubActive = subscription && subscription.status === "active" && subscription.product_id && subscription.product_id !== "free_plan";
      const isTrial = !isSubActive && (profile?.is_trial || profile?.trial_ends_at);
      
      return {
        isActive: Boolean(isSubActive || isTrial),
        isPaid: Boolean(isSubActive),
        trialActive: Boolean(isTrial && !isSubActive),
        planId: isSubActive ? subscription.product_id : "free_plan",
      };
    };

    // Estado inicial: Usuário no Trial
    const profileInitial = { is_trial: true, trial_ends_at: "2026-09-10T00:00:00.000Z" };
    const initialEntitlements = computeEntitlements(null, profileInitial);

    expect(initialEntitlements.trialActive).toBe(true);
    expect(initialEntitlements.isPaid).toBe(false);

    // Estado após confirmação do pagamento recebendo a nova assinatura
    const paidSubscription = { status: "active", product_id: "pro_plan" };
    const paidEntitlements = computeEntitlements(paidSubscription, profileInitial);

    expect(paidEntitlements.trialActive).toBe(false);
    expect(paidEntitlements.isPaid).toBe(true);
    expect(paidEntitlements.planId).toBe("pro_plan");
  });
});
