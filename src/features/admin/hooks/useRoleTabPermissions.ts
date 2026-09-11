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
  cliente: ["overview", "dashboard", "products", "vehicles", "calendar", "clients", "expenses", "boletos", "salary", "accountant", "telegram_reports", "metas", "video_lessons", "settings", "help"],
  gerente: ["overview", "dashboard", "products", "vehicles", "calendar", "clients", "expenses", "boletos", "salary", "accountant", "telegram_reports", "metas", "video_lessons", "settings", "help"],
  visualizador: ["overview", "dashboard", "clients", "calendar", "telegram_reports", "video_lessons", "help"],
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
    const handler = () => refresh();
    window.addEventListener("role-tab-permissions:changed", handler);
    return () => window.removeEventListener("role-tab-permissions:changed", handler);
  }, [refresh]);

  const setAllowed = useCallback(async (role: string, tabId: string, allowed: boolean) => {
    const existingForRole = rows.filter((r) => r.role === role);

    if (existingForRole.length === 0) {
      // Se ainda não existiam linhas salvas para esse papel no banco, inicializamos com os defaults
      const baseDefaults = DEFAULT_ROLE_TABS[role] || [];
      const tabsToSave = allowed
        ? Array.from(new Set([...baseDefaults, tabId]))
        : baseDefaults.filter((id) => id !== tabId);

      const items = tabsToSave.map((id) => ({ role, tab_id: id }));
      if (items.length > 0) {
        const { error } = await (supabase as any)
          .from("role_tab_permissions")
          .upsert(items, { onConflict: "role,tab_id" });
        if (error) throw error;
      }
    } else {
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
    }

    await refresh();
    window.dispatchEvent(new CustomEvent("role-tab-permissions:changed"));
  }, [rows, refresh]);

  const allowedFor = useCallback(
    (role: string) => {
      const roleRows = rows.filter((r) => r.role === role);
      if (roleRows.length > 0) {
        return new Set(roleRows.map((r) => r.tab_id));
      }
      return new Set(DEFAULT_ROLE_TABS[role] || []);
    },
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
      const loadedTabs = error || !data || (data as any[]).length === 0
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
