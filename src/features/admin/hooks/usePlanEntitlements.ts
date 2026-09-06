import { productIdFromPlanName } from "@/lib/billing/subscriptionState";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import {
  ALL_PERMISSION_KEYS,
  isPermitted,
  isWithinLimit,
  LimitKey,
  PlanLimits,
  PlanPermissions,
} from "@/features/admin/lib/planEntitlements";

export type ExpirationAction = "block_all" | "readonly" | "force_upgrade";

interface PlanLite {
  id: string;
  name: string;
  trial_days: number;
  limits: PlanLimits;
  permissions: PlanPermissions;
  allowed_tabs: string[] | null;
  expiration_action: ExpirationAction;
}

interface ProfilePlanFields {
  created_at?: string | null;
  trial_plan_name?: string | null;
  trial_started_at?: string | null;
  trial_days_override?: number | null;
}

type PlanEntitlementRow = PlanLite & {
  active?: boolean | null;
  sort_order?: number | null;
};

export function usePlanEntitlements() {
  const { user, dataOwnerId, role, loading: authLoading } = useAuth();
  const { subscription, isActive, loading: subscriptionLoading } = useSubscription();
  const [plan, setPlan] = useState<PlanLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [trialStartedAt, setTrialStartedAt] = useState<Date | null>(null);
  const [trialDaysOverride, setTrialDaysOverride] = useState<number | null>(null);
  const effectiveUserId = dataOwnerId ?? user?.id ?? null;

  // Contador que força re-fetch quando o admin dispara `bumpTarget` no perfil
  // (Realtime UPDATE em `profiles`) ou quando outra parte da app emite
  // `subscription:changed` (checkout, webhook client-side).
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    if (!effectiveUserId) return;
    const bump = () => setRefetchTick((n) => n + 1);
    window.addEventListener("subscription:changed", bump);
    const channel = supabase
      .channel(`plan-entitlements-bump-${effectiveUserId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${effectiveUserId}` },
        () => bump(),
      )
      .subscribe();
    return () => {
      window.removeEventListener("subscription:changed", bump);
      try { supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [effectiveUserId]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      if (authLoading) return;

      const [{ data: allPlans }, profileRes] = await Promise.all([
        supabase
          .from("plans")
          .select("id, name, trial_days, limits, permissions, allowed_tabs, expiration_action, active, sort_order")
          .order("sort_order", { ascending: true }),
        effectiveUserId
          ? supabase
              .from("profiles")
              .select("created_at, trial_plan_name, trial_started_at, trial_days_override")
              .eq("user_id", effectiveUserId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const list = (allPlans ?? []) as unknown as PlanEntitlementRow[];
      const activePlans = list.filter((candidate) => candidate.active !== false);
      const prof = (profileRes?.data ?? null) as ProfilePlanFields | null;
      let picked: PlanEntitlementRow | null = null;

      if (subscription?.product_id) {
        picked = list.find((p) => subscription.plan_id ? p.id === subscription.plan_id : productIdFromPlanName(p.name) === subscription.product_id) ?? null;
      }
      if (!picked && (!subscription || subscription.product_id === "free_plan") && prof?.trial_plan_name) {
        picked = activePlans.find((p) => (p.name || "").toLowerCase() === String(prof.trial_plan_name).toLowerCase()) ?? null;
      }
      if (!picked && (!subscription || subscription.product_id === "free_plan")) picked = activePlans[0] ?? null;

      if (!cancel) {
        setPlan(
          picked
            ? {
                id: picked.id,
                name: picked.name,
                trial_days: picked.trial_days ?? 0,
                limits: picked.limits ?? {},
                permissions: picked.permissions ?? {},
                allowed_tabs: picked.allowed_tabs ?? null,
                expiration_action: (picked.expiration_action ?? "force_upgrade") as ExpirationAction,
              }
            : null
        );
        const ts = prof?.trial_started_at || prof?.created_at || user?.created_at;
        setTrialStartedAt(ts ? new Date(ts) : null);
        setTrialDaysOverride(
          prof && prof.trial_days_override !== null && prof.trial_days_override !== undefined
            ? Number(prof.trial_days_override)
            : null,
        );
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [effectiveUserId, user?.created_at, subscription, authLoading, refetchTick]);


  // Tick a cada 60s para que o contador de trial atualize sozinho no UI
  // sem depender de navegação ou refetch. Barato: um setState/min.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const trial = useMemo(() => {
    // Prioridade: override manual do admin > default do plano.
    // Isso garante que "Iniciar teste" / "Prorrogar teste" na Administração
    // reflitam imediatamente no contador do usuário.
    const days = trialDaysOverride ?? plan?.trial_days ?? 7;
    const action = plan?.expiration_action ?? "force_upgrade";
    const stillResolving = authLoading || subscriptionLoading || loading;
    if (!plan || !trialStartedAt || stillResolving) {
      return { active: false, daysLeft: 0, hoursLeft: 0, msLeft: 0, endsAt: null as Date | null, expired: false, expirationAction: action };
    }
    // An explicit subscription period replaces the registration trial, including zero days.
    const hasExplicitPlan = subscription && subscription.product_id !== "free_plan";
    const endsAt = hasExplicitPlan
      ? new Date(subscription.current_period_end ?? 0)
      : new Date(trialStartedAt.getTime() + days * 86400_000);
    const msLeft = endsAt.getTime() - now;
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86400_000));
    const hoursLeft = Math.max(0, Math.ceil(msLeft / 3600_000));
    const expired = msLeft <= 0 && !isActive;
    return { active: !hasExplicitPlan && !isActive && msLeft > 0, daysLeft, hoursLeft, msLeft: Math.max(0, msLeft), endsAt, expired, expirationAction: action };
  }, [plan, trialStartedAt, trialDaysOverride, isActive, authLoading, subscriptionLoading, loading, now, subscription]);

  const lockdown = trial.expired && trial.expirationAction === "readonly";
  const hasPlanAccess = role === "admin" || isActive;

  const can = (action: string) => {
    if (!plan || loading || (!hasPlanAccess && !trial.active)) return false;
    return isPermitted(plan?.permissions, action);
  };
  const withinLimit = (key: LimitKey, current: number) => {
    if (!plan || loading || (!hasPlanAccess && !trial.active)) return false;
    return isWithinLimit(plan?.limits, key, current);
  };

  return {
    loading: loading || authLoading || subscriptionLoading,
    plan, limits: plan?.limits ?? {}, permissions: plan?.permissions ?? {},
    allowedTabs: plan ? plan.allowed_tabs : [], trial, can, withinLimit,
    isPaid: hasPlanAccess, allKnownPermissions: ALL_PERMISSION_KEYS,
  };
}
