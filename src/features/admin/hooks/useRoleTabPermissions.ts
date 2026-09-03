/**
 * Hook de abas permitidas por papel (role_tab_permissions).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";

export interface RoleTabRow { role: string; tab_id: string; }

// Defaults aplicados APENAS quando a tabela role_tab_permissions ainda não foi
// configurada para o papel (nenhuma linha jamais criada). Se o admin
// desmarcar todas as abas explicitamente, respeitamos o bloqueio total.
const DEFAULT_ROLE_TABS: Record<string, string[]> = {
  cliente: ["overview", "dashboard", "products", "vehicles", "calendar", "clients", "expenses", "boletos", "salary", "accountant", "overdue", "settings"],
  gerente: ["overview", "dashboard", "products", "vehicles", "calendar", "clients", "expenses", "boletos", "salary", "accountant", "overdue", "settings"],
  visualizador: ["overview", "dashboard", "clients", "calendar", "overdue"],
};


export function useRoleTabPermissions() {
  const [rows, setRows] = useState<RoleTabRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("role_tab_permissions" as any)
      .select("role, tab_id");
    if (!error) setRows((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // Realtime removido (P0-02 egress): abas mudam raramente; escuta evento local.
    const handler = () => refresh();
    window.addEventListener("role-tab-permissions:changed", handler);
    return () => window.removeEventListener("role-tab-permissions:changed", handler);
  }, [refresh]);

  const setAllowed = useCallback(async (role: string, tabId: string, allowed: boolean) => {
    if (allowed) {
      const { error } = await (supabase as any)
        .from("role_tab_permissions")
        .upsert({ role, tab_id: tabId }, { onConflict: "role,tab_id" });
      if (error) throw error;
    } else {
      const { error } = await (supabase as any)
        .from("role_tab_permissions")
        .delete()
        .eq("role", role)
        .eq("tab_id", tabId);
      if (error) throw error;
    }
    await refresh();
    window.dispatchEvent(new CustomEvent("role-tab-permissions:changed"));
  }, [refresh]);

  const allowedFor = useCallback(
    (role: string) => new Set(rows.filter((r) => r.role === role).map((r) => r.tab_id)),
    [rows],
  );

  return { rows, loading, setAllowed, allowedFor, refresh };
}

/** Para o usuário logado: lista de tab_ids permitidos pelo papel, ou null se ainda carregando. */
export function useMyRoleTabs(role: string | null) {
  const [tabs, setTabs] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!role) { setTabs(null); return; }
    const loadOnce = async () => {
      const { data, error } = await supabase
        .from("role_tab_permissions" as any)
        .select("tab_id")
        .eq("role", role);
      const loadedTabs = error
        ? (DEFAULT_ROLE_TABS[role] ?? [])
        : ((data as any) || []).map((r: any) => r.tab_id);
      if (!cancelled) setTabs(loadedTabs);


    };
    loadOnce();
    // Realtime removido (P0-02 egress): reage a evento local disparado por setAllowed.
    const handler = () => loadOnce();
    window.addEventListener("role-tab-permissions:changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("role-tab-permissions:changed", handler);
    };
  }, [role]);

  return tabs;
}
