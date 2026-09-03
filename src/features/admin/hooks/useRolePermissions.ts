/**
 * Hook de permissões granulares por papel.
 *
 * - `usePermissions()` retorna `{ can, loading, rows }` para o usuário logado,
 *   onde `can(module, action)` resolve em runtime usando a matriz salva em
 *   `public.role_permissions`.
 * - `useAllRolePermissions()` retorna a matriz completa (todas as linhas), para
 *   uso no painel admin.
 * - `useRolePermissionsAudit()` retorna o histórico de mudanças.
 *
 * Usa o cliente Supabase do app e ouve realtime para refletir alterações no
 * painel admin sem reload.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import type { PermissionAction } from "@/features/admin/lib/permissionModules";

export interface RolePermissionRow {
  id: string;
  role: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface RolePermissionAuditRow {
  id: string;
  role: string;
  module: string;
  before_state: Record<string, boolean> | null;
  after_state: Record<string, boolean> | null;
  changed_by: string | null;
  changed_at: string;
}

const COLUMN_BY_ACTION: Record<PermissionAction, keyof RolePermissionRow> = {
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete",
};

const ROLE_PERMISSION_COLUMNS =
  "id, role, module, can_view, can_create, can_edit, can_delete, updated_at, updated_by";
const ROLE_PERMISSION_AUDIT_COLUMNS =
  "id, role, module, before_state, after_state, changed_by, changed_at";

/** Permissões do usuário logado, com cache em memória e realtime. */
export function usePermissions() {
  const { role } = useAuth();
  const [rows, setRows] = useState<RolePermissionRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!role) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("role_permissions" as any)
      .select(ROLE_PERMISSION_COLUMNS)
      .eq("role", role);
    if (!error) setRows((data as any) || []);
    setLoading(false);
  }, [role]);

  useEffect(() => {
    refresh();
    // Realtime removido (P0-02 egress): permissões mudam raramente; escuta evento local.
    const handler = () => refresh();
    window.addEventListener("role-permissions:changed", handler);
    return () => window.removeEventListener("role-permissions:changed", handler);
  }, [refresh]);

  const can = useCallback(
    (module: string, action: PermissionAction): boolean => {
      if (role === "admin") return true; // admin sempre tudo
      if (!rows) return false;
      const row = rows.find((r) => r.module === module);
      if (!row) return false;
      return !!row[COLUMN_BY_ACTION[action]];
    },
    [rows, role],
  );

  return { can, loading, rows: rows || [] };
}

/** Matriz completa para o painel admin. */
export function useAllRolePermissions() {
  const [rows, setRows] = useState<RolePermissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("role_permissions" as any)
      .select(ROLE_PERMISSION_COLUMNS)
      .order("role", { ascending: true })
      .order("module", { ascending: true });
    if (!error) setRows((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // Realtime removido (P0-02 egress): escuta evento local disparado por upsert/reset.
    const handler = () => refresh();
    window.addEventListener("role-permissions:changed", handler);
    return () => window.removeEventListener("role-permissions:changed", handler);
  }, [refresh]);

  const upsertMany = useCallback(
    async (changes: Array<Pick<RolePermissionRow, "role" | "module"> & Partial<Pick<RolePermissionRow, "can_view" | "can_create" | "can_edit" | "can_delete">>>) => {
      if (changes.length === 0) return;
      const { error } = await (supabase as any)
        .from("role_permissions")
        .upsert(changes, { onConflict: "role,module" });
      if (error) throw error;
      await refresh();
      window.dispatchEvent(new CustomEvent("role-permissions:changed"));
    },
    [refresh],
  );

  const byRole = useMemo(() => {
    const map = new Map<string, RolePermissionRow[]>();
    rows.forEach((r) => {
      const list = map.get(r.role) || [];
      list.push(r);
      map.set(r.role, list);
    });
    return map;
  }, [rows]);

  return { rows, byRole, loading, upsertMany, refresh };
}

/** Histórico de mudanças (admin). */
export function useRolePermissionsAudit(limit = 50) {
  const [rows, setRows] = useState<RolePermissionAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("role_permissions_audit" as any)
      .select(ROLE_PERMISSION_AUDIT_COLUMNS)
      .order("changed_at", { ascending: false })
      .limit(limit);
    if (!error) setRows((data as any) || []);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, refresh };
}
