import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";
import { invalidateSharedResource } from "@/lib/sharedResource";

export interface AdminSubRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  trial_started_at: string | null;
  trial_plan_name: string | null;
  trial_days_override: number | null;
  is_blocked?: boolean;
  blocked_reason?: string | null;
  blocked_at?: string | null;
  blocked_by?: string | null;
  subscription: {
    id: string;
    product_id: string;
    price_id: string;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    environment: string;
    manual_override: boolean;
    manual_override_at: string | null;
    manual_note: string | null;
    asaas_subscription_id: string | null;
  } | null;
}

export interface AdminPlanRow {
  id: string;
  name: string;
  trial_days: number;
  active: boolean;
}

export interface AuditRow {
  id: string;
  action: string;
  before: any;
  after: any;
  note: string | null;
  created_at: string;
  admin_user_id: string;
}

async function invoke(body: Record<string, unknown>) {
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? session;
  }
  if (!session?.access_token) throw new Error("Sessão expirada");
  const { data: verified, error: verifyError } = await supabase.auth.getUser(session.access_token);
  if (verifyError || !verified?.user) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    Object.keys(localStorage).forEach((k) => { if (k.startsWith("sb-")) localStorage.removeItem(k); });
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  const { data, error } = await supabase.functions.invoke("admin-subscription-manage", {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    if (/401|unauthorized|invalid_token/i.test(error.message)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      Object.keys(localStorage).forEach((k) => { if (k.startsWith("sb-")) localStorage.removeItem(k); });
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    throw new Error(error.message);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export function useAdminSubscriptions() {
  const [rows, setRows] = useState<AdminSubRow[]>([]);
  const [plans, setPlans] = useState<AdminPlanRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke({
        action: "list",
        search: search || undefined,
        status_filter: statusFilter || undefined,
        limit: 100,
        offset: 0,
      });
      setRows(data.rows ?? []);
      setPlans(data.plans ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const runAction = useCallback(async (payload: Record<string, unknown>) => {
    try {
      const res = await invoke(payload);
      toast.success("Alteração aplicada");
      // Invalida cache de assinatura do usuário afetado (ambos ambientes)
      const uid = payload.target_user_id as string | undefined;
      if (uid) {
        invalidateSharedResource(`subscription:${uid}:live`);
        invalidateSharedResource(`subscription:${uid}:sandbox`);
      }
      window.dispatchEvent(new Event("subscription:changed"));
      await fetchRows();
      return res;
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  }, [fetchRows]);

  const fetchAudit = useCallback(async (userId: string): Promise<AuditRow[]> => {
    try {
      const data = await invoke({ action: "audit", target_user_id: userId });
      return data.rows ?? [];
    } catch (e) {
      toast.error((e as Error).message);
      return [];
    }
  }, []);

  return { rows, plans, total, loading, search, setSearch, statusFilter, setStatusFilter, fetchRows, runAction, fetchAudit };
}
