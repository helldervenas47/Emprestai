import { BILLING_ENVIRONMENT, hasSubscriptionAccess } from "@/lib/billing/subscriptionState";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import {
  loadSharedResource,
  invalidateSharedResource,
  readSharedResource,
  subscribeSharedResource,
} from "@/lib/sharedResource";

export interface Subscription {
  id: string;
  plan_id?: string | null;
  current_period_start?: string | null;
  product_id: string;
  price_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  manual_override: boolean;
  environment: string;
  asaas_subscription_id?: string | null;
}

export const PLAN_TIERS: Record<string, number> = {
  free_plan: 0,
  basico_plan: 1,
  básico: 1,
  basico: 1,
  profissional_plan: 2,
  profissional: 2,
  empresarial_plan: 3,
  empresarial: 3,
};

const PLAN_LIMITS: Record<string, { maxLoans: number; maxUsers: number }> = {
  basico_plan: { maxLoans: 50, maxUsers: 1 },
  profissional_plan: { maxLoans: 200, maxUsers: 3 },
  empresarial_plan: { maxLoans: 9999, maxUsers: 5 },
};

// P1-01: assinatura muda muito raramente; cache global evita refetch a cada
// troca de rota / focus / remount. Um refetch a cada 5 min é mais que suficiente.
const STALE_MS = 5 * 60_000;

async function fetchSubscription(userId: string, environment: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, plan_id, product_id, price_id, status, current_period_start, current_period_end, cancel_at_period_end, manual_override, environment, asaas_subscription_id")
    .eq("user_id", userId).eq("environment", environment).maybeSingle();
  if (error) throw error;
  return data as unknown as Subscription | null;
}

export function useSubscription() {
  const { user, dataOwnerId, loading: authLoading } = useAuth();
  const environment = BILLING_ENVIRONMENT;
  const effectiveUserId = dataOwnerId ?? user?.id ?? null;
  const cacheKey = effectiveUserId ? `subscription:${effectiveUserId}:${environment}` : "";

  const [subscription, setSubscription] = useState<Subscription | null>(
    () => readSharedResource<Subscription | null>(cacheKey) ?? null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!effectiveUserId) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async (force = false) => {
      try {
        const data = await loadSharedResource(
          cacheKey,
          () => fetchSubscription(effectiveUserId, environment),
          { staleTime: STALE_MS, force },
        );
        if (!cancelled) {
          setSubscription(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    // Realtime removido (P0-02 egress): assinatura muda raramente.
    // Refetch em foco e via evento local disparado pelo checkout/webhook client-side.
    // Ambos passam por `loadSharedResource`, então respeitam staleTime e deduplicação.
    const changed = () => {
      invalidateSharedResource(cacheKey);
      run(true);
    };
    const focused = () => run(false);
    window.addEventListener("subscription:changed", changed);
    window.addEventListener("focus", focused);

    // Realtime dedicado: escuta APENAS a própria linha em `profiles`. Custo mínimo
    // (uma linha por usuário) e permite o admin sinalizar mudança de assinatura
    // via `subscription_bump_at` sem precisar assinar a tabela subscriptions inteira.
    const channel = supabase
      .channel(`profile-bump-${effectiveUserId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${effectiveUserId}` },
        () => changed(),
      )
      .subscribe();

    // Assina o cache para receber updates disparados por outros hooks/instâncias.
    const unsub = subscribeSharedResource(cacheKey, () => {
      if (cancelled) return;
      const next = readSharedResource<Subscription | null>(cacheKey);
      setSubscription(next ?? null);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("subscription:changed", changed);
      window.removeEventListener("focus", focused);
      try { supabase.removeChannel(channel); } catch { /* noop */ }
      unsub();
    };
  }, [user?.id, effectiveUserId, environment, authLoading, cacheKey]);

  const [, setClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClock((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const isActive = hasSubscriptionAccess(subscription);

  const daysRemaining = subscription?.current_period_end 
    ? Math.ceil((new Date(subscription.current_period_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const planTier = subscription ? PLAN_TIERS[subscription.product_id] || 0 : 0;
  const planLimits = subscription ? PLAN_LIMITS[subscription.product_id] : null;
  const hasFeature = (requiredTier: number) => isActive && planTier >= requiredTier;

  return { subscription, loading, isActive, daysRemaining, planTier, planLimits, hasFeature, environment };
}
