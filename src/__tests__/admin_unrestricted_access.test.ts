import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSubscription } from "@/hooks/useSubscription";
import { usePlanEntitlements } from "@/features/admin/hooks/usePlanEntitlements";
import { useReadOnlyMode } from "@/hooks/useReadOnlyMode";
import { useAccessLock } from "@/hooks/useAccessLock";

// Mock useAuth com perfil ADMIN
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-user-id", email: "admin@emprestai.com" },
    dataOwnerId: "admin-user-id",
    role: "admin",
    loading: false,
  }),
}));

vi.mock("@/integrations/supabase/userClient", () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: { locked: false, reason: null } }),
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [] }),
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: () => {},
  },
}));

describe("Acesso Total e Desbloqueado para Usuários ADMIN", () => {
  it("useSubscription: garante acesso ativo, tier máximo e sem expiração para admin", () => {
    const { result } = renderHook(() => useSubscription());

    expect(result.current.isActive).toBe(true);
    expect(result.current.daysRemaining).toBeNull();
    expect(result.current.planTier).toBe(3);
    expect(result.current.planLimits).toBeNull();
    expect(result.current.hasFeature(1)).toBe(true);
    expect(result.current.hasFeature(2)).toBe(true);
    expect(result.current.hasFeature(3)).toBe(true);
  });

  it("usePlanEntitlements: garante que admin não expira, tem permissão total (can=true) e sem limites", () => {
    const { result } = renderHook(() => usePlanEntitlements());

    expect(result.current.trial.expired).toBe(false);
    expect(result.current.trial.active).toBe(false);
    expect(result.current.isPaid).toBe(true);
    expect(result.current.can("anything")).toBe(true);
    expect(result.current.withinLimit("max_loans", 999999)).toBe(true);
    expect(result.current.allowedTabs).toBeNull();
  });

  it("useReadOnlyMode: garante que admin nunca entra em modo somente leitura", () => {
    const { result } = renderHook(() => useReadOnlyMode());

    expect(result.current.readOnly).toBe(false);
    expect(result.current.reason).toBeNull();
  });

  it("useAccessLock: garante que admin nunca é bloqueado por plano ou expiração", () => {
    const { result } = renderHook(() => useAccessLock());

    expect(result.current.locked).toBe(false);
    expect(result.current.reason).toBeNull();
  });
});
