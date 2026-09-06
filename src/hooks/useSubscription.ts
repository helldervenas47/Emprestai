import { BILLING_ENVIRONMENT, hasSubscriptionAccess } from "@/lib/billing/subscriptionState";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import {
  loadSharedResource,
  invalidateSharedResource,
  readSharedResource,
  writeSharedResource,
  subscribeSharedResource,
} from "@/lib/sharedResource";
import { fetchRemoteSubscription, syncSubscriptionState } from "@/lib/billing/subscriptionSync";

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

// Assinatura ativa tem cache de 5 minutos.
// Usuário sem assinatura/em trial tem cache ágil de 15s para detectar pagamentos instantaneamente.
const STALE_PAID_MS = 5 * 60_000;
const STALE_TRIAL_MS = 15_000;

export function useSubscription() {
  const { user, dataOwnerId, loading: authLoading } = useAuth();
  const environment = BILLING_ENVIRONMENT;
  const effectiveUserId = dataOwnerId ?? user?.id ?? null;
  const cacheKey = effectiveUserId ? `subscription:${effectiveUserId}:${environment}` : "";

  const [subscription, setSubscription] = useState<Subscription | null>(
    () => readSharedResource<Subscription | null>(cacheKey) ?? null,
  );
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(
    async (force = true) => {
      if (!effectiveUserId) return null;
      invalidateSharedResource(cacheKey);
      try {
        const data = await loadSharedResource(
          cacheKey,
          () => fetchRemoteSubscription(effectiveUserId, environment),
          { staleTime: 0, force: true },
        );
        setSubscription(data);
        setLoading(false);
        return data;
      } catch (err) {
        setLoading(false);
        return null;
      }
    },
    [cacheKey, effectiveUserId, environment]
  );

  const sync = useCallback(
    async (waitForActive = true) => {
      if (!effectiveUserId) return null;
      const res = await syncSubscriptionState(effectiveUserId, {
        waitForActive,
        maxWaitMs: 8000,
      });
      if (res) {
        setSubscription(res);
      }
      return res;
    },
    [effectiveUserId]
  );

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
        const cached = readSharedResource<Subscription | null>(cacheKey);
        const currentStale = cached && cached.status === "active" && cached.product_id !== "free_plan"
          ? STALE_PAID_MS
          : STALE_TRIAL_MS;

        const data = await loadSharedResource(
          cacheKey,
          () => fetchRemoteSubscription(effectiveUserId, environment),
          { staleTime: currentStale, force },
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

    // Evento de alteração de assinatura com suporte a snapshot direto no CustomEvent
    const changed = (event?: Event) => {
      const custom = event as CustomEvent<{ subscription?: Subscription | null }>;
      if (custom?.detail?.subscription !== undefined) {
        if (!cancelled) {
          setSubscription(custom.detail.subscription);
          setLoading(false);
        }
      }
      invalidateSharedResource(cacheKey);
      run(true);
    };

    const focused = () => run(false);
    window.addEventListener("subscription:changed", changed);
    window.addEventListener("focus", focused);

    // Realtime dedicado: escuta APENAS a própria linha em `profiles`
    const channel = supabase
      .channel(`profile-bump-${effectiveUserId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${effectiveUserId}` },
        () => changed(),
      )
      .subscribe();

    // Assina o cache compartilhado para sincronização cruzada de instâncias
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

  return {
    subscription,
    loading,
    isActive,
    daysRemaining,
    planTier,
    planLimits,
    hasFeature,
    environment,
    refetch,
    sync,
  };
}
