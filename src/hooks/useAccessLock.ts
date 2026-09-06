import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { usePlanEntitlements } from "@/features/admin/hooks/usePlanEntitlements";

export type AccessLockReason = "admin_blocked" | "plan_expired" | "past_due" | null;

interface AccessLockState {
  loading: boolean;
  locked: boolean;
  reason: AccessLockReason;
  blockedReason: string | null; // texto livre do admin
  planExpiresAt: Date | null;
}

/**
 * Fonte única de verdade para o bloqueio global do aplicativo.
 *
 * O usuário fica bloqueado quando:
 *   - o admin marcou `profiles.is_blocked = true` para o dono da conta; ou
 *   - o plano/teste expirou e não há assinatura paga ativa.
 *
 * O admin (`role === 'admin'`) nunca é bloqueado — precisa continuar
 * gerenciando a conta.
 */
export function useAccessLock(): AccessLockState {
  const { user, dataOwnerId, role, loading: authLoading } = useAuth();
  const { trial, isPaid, loading: planLoading } = usePlanEntitlements();
  const ownerId = dataOwnerId ?? user?.id ?? null;

  const [adminBlocked, setAdminBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [serverState, setServerState] = useState<{
    locked: boolean;
    reason: AccessLockReason;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!ownerId) {
      setAdminBlocked(false);
      setBlockedReason(null);
      setServerState(null);
      setProfileLoading(false);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    (async () => {
      // Fonte única de verdade: mesma regra usada pela RLS (`is_access_blocked`).
      const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
        "my_access_state",
      );
      if (cancelled) return;

      if (!rpcError && rpcData) {
        const raw = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        const s = raw as {
          locked?: boolean;
          blocked?: boolean;
          reason?: AccessLockReason;
          blocked_reason?: string | null;
        };
        const locked = Boolean(s.locked ?? s.blocked);
        setServerState({ locked, reason: s.reason ?? null });
        setAdminBlocked(s.reason === "admin_blocked");
        setBlockedReason(s.blocked_reason ?? null);
        setProfileLoading(false);
        return;
      }

      // Fallback (RPC ainda não aplicada no banco): lê o flag no perfil.
      const { data } = await supabase
        .from("profiles")
        .select("is_blocked, blocked_reason")
        .eq("user_id", ownerId)
        .maybeSingle();
      if (cancelled) return;
      const row = (data ?? null) as { is_blocked?: boolean | null; blocked_reason?: string | null } | null;
      setServerState(null);
      setAdminBlocked(Boolean(row?.is_blocked));
      setBlockedReason(row?.blocked_reason ?? null);
      setProfileLoading(false);
    })();

    // Realtime: reage a bloqueio/desbloqueio feito pelo admin sem F5.
    const channel = supabase
      .channel(`access-lock-${ownerId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${ownerId}` },
        () => setReloadTick((n) => n + 1),
      )
      .subscribe();

    const onBump = () => setReloadTick((n) => n + 1);
    window.addEventListener("subscription:changed", onBump);
    window.addEventListener("focus", onBump);

    return () => {
      cancelled = true;
      try { supabase.removeChannel(channel); } catch { /* noop */ }
      window.removeEventListener("subscription:changed", onBump);
      window.removeEventListener("focus", onBump);
    };
  }, [ownerId, reloadTick]);

  const loading = authLoading || planLoading || profileLoading;

  // Explicit administrative blocks take precedence, including for account admins.
  if (role === "admin" && !adminBlocked) {
    return { loading, locked: false, reason: null, blockedReason: null, planExpiresAt: trial.endsAt };
  }

  // Se a RPC respondeu, ela manda (mesma regra da RLS).
  if (serverState) {
    return {
      loading,
      locked: !loading && serverState.locked,
      reason: serverState.locked ? serverState.reason : null,
      blockedReason,
      planExpiresAt: trial.endsAt,
    };
  }

  const planExpired = !isPaid && trial.expired;
  const locked = !loading && (adminBlocked || planExpired);
  const reason: AccessLockReason = !locked
    ? null
    : adminBlocked
    ? "admin_blocked"
    : "plan_expired";

  return {
    loading,
    locked,
    reason,
    blockedReason,
    planExpiresAt: trial.endsAt,
  };
}
