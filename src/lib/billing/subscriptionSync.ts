import { supabase } from "@/integrations/supabase/userClient";
import { BILLING_ENVIRONMENT } from "@/lib/billing/subscriptionState";
import {
  invalidateSharedResource,
  writeSharedResource,
  readSharedResource,
} from "@/lib/sharedResource";
import type { Subscription } from "@/hooks/useSubscription";
import type { QueryClient } from "@tanstack/react-query";

export interface SyncSubscriptionOptions {
  /** Se true, faz polling até encontrar uma assinatura paga ativa */
  waitForActive?: boolean;
  /** Tempo máximo em milissegundos para o polling ativo (padrão: 8000ms) */
  maxWaitMs?: number;
  /** Instância opcional do QueryClient para invalidar caches */
  queryClient?: QueryClient;
}

/**
 * Consulta a tabela subscriptions diretamente do Supabase
 */
export async function fetchRemoteSubscription(
  userId: string,
  environment: string = BILLING_ENVIRONMENT
): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, plan_id, product_id, price_id, status, current_period_start, current_period_end, cancel_at_period_end, manual_override, environment, asaas_subscription_id"
    )
    .eq("user_id", userId)
    .eq("environment", environment)
    .maybeSingle();

  if (error) {
    console.error("[subscriptionSync] Erro ao buscar assinatura remota:", error);
    return null;
  }

  return data as unknown as Subscription | null;
}

/**
 * Reconcilia e sincroniza ativamente o estado da assinatura em todo o frontend.
 * Elimina a necessidade de recarregar a página (F5) após o pagamento.
 */
export async function syncSubscriptionState(
  userId?: string | null,
  options: SyncSubscriptionOptions = {}
): Promise<Subscription | null> {
  let targetUserId = userId;

  if (!targetUserId) {
    const { data: sessionData } = await supabase.auth.getSession();
    targetUserId = sessionData.session?.user?.id ?? null;
  }

  if (!targetUserId) {
    return null;
  }

  const environment = BILLING_ENVIRONMENT;
  const cacheKey = `subscription:${targetUserId}:${environment}`;

  // 1. Invalida o cache compartilhado imediatamente
  invalidateSharedResource(cacheKey);

  // 2. Invalida os caches do React Query se fornecido
  if (options.queryClient) {
    await Promise.all([
      options.queryClient.invalidateQueries({ queryKey: ["profile"] }),
      options.queryClient.invalidateQueries({ queryKey: ["subscription"] }),
      options.queryClient.invalidateQueries({ queryKey: ["plans"] }),
      options.queryClient.invalidateQueries({ queryKey: ["system_settings"] }),
      options.queryClient.invalidateQueries({ queryKey: ["admin_subscriptions"] }),
    ]).catch(() => {});
  }

  const maxWait = options.maxWaitMs ?? 8000;
  const startTime = Date.now();
  let latestSub: Subscription | null = null;

  // 3. Polling de confirmação garantida (Active Reconciliation Loop)
  if (options.waitForActive) {
    while (Date.now() - startTime < maxWait) {
      latestSub = await fetchRemoteSubscription(targetUserId, environment);

      const isPaidActive =
        latestSub &&
        latestSub.status === "active" &&
        latestSub.product_id !== "free_plan";

      if (isPaidActive) {
        break;
      }

      // Aguarda 600ms antes de tentar novamente
      await new Promise((res) => setTimeout(res, 600));
    }
  } else {
    latestSub = await fetchRemoteSubscription(targetUserId, environment);
  }

  // 4. Grava o novo snapshot com autoridade no cache global
  if (latestSub) {
    writeSharedResource(cacheKey, latestSub);
    if (options.queryClient) {
      try {
        options.queryClient.setQueryData(["subscription", targetUserId], latestSub);
        options.queryClient.setQueryData(["subscription"], latestSub);
      } catch {}
    }
  } else {
    invalidateSharedResource(cacheKey);
  }

  // 5. Notifica todos os componentes e abas da aplicação
  try {
    window.dispatchEvent(
      new CustomEvent("subscription:changed", {
        detail: { subscription: latestSub, timestamp: Date.now() },
      })
    );
  } catch {
    window.dispatchEvent(new Event("subscription:changed"));
  }

  return latestSub;
}
