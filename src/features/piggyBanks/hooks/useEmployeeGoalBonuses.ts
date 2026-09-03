import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { assertWritable } from "@/lib/readOnlyState";

let cachedBonuses: EmployeeGoalBonus[] = [];

export interface EmployeeGoalBonus {
  id: string;
  employeeId: string;
  enabled: boolean;
  minScore: number;
  bonusAmount: number;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS =
  "id, employee_id, enabled, min_score, bonus_amount, start_date, end_date, notes, created_at, updated_at";

function rowToBonus(r: any): EmployeeGoalBonus {
  return {
    id: r.id,
    employeeId: r.employee_id,
    enabled: !!r.enabled,
    minScore: Number(r.min_score ?? 0),
    bonusAmount: Number(r.bonus_amount ?? 0),
    startDate: r.start_date,
    endDate: r.end_date,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function useEmployeeGoalBonuses() {
  const { user, dataOwnerId } = useAuth();
  const [bonuses, setBonuses] = useState<EmployeeGoalBonus[]>(cachedBonuses);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) {
      cachedBonuses = [];
      setBonuses([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("employee_goal_bonuses" as any)
      .select(COLUMNS)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[employee_goal_bonuses] fetch", error.message);
      setLoading(false);
      return;
    }
    const next = ((data as any[]) ?? []).map(rowToBonus);
    cachedBonuses = next;
    setBonuses(next);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const ch = supabase
      .channel(`employee_goal_bonuses:${dataOwnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_goal_bonuses", filter: `user_id=eq.${dataOwnerId}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, dataOwnerId, fetchAll]);

  const getForEmployee = useCallback(
    (employeeId: string) => bonuses.find((b) => b.employeeId === employeeId) ?? null,
    [bonuses],
  );

  const upsertForEmployee = useCallback(async (
    employeeId: string,
    patch: Omit<EmployeeGoalBonus, "id" | "employeeId" | "createdAt" | "updatedAt">,
  ) => {
    assertWritable();
    if (!dataOwnerId) return;
    const payload: any = {
      user_id: dataOwnerId,
      employee_id: employeeId,
      enabled: patch.enabled,
      min_score: patch.minScore,
      bonus_amount: patch.bonusAmount,
      start_date: patch.startDate,
      end_date: patch.endDate,
      notes: patch.notes,
    };

    const syncSavedRow = (row: any) => {
      if (!row) return;
      const saved = rowToBonus(row);
      cachedBonuses = [
        saved,
        ...cachedBonuses.filter((b) => b.employeeId !== saved.employeeId),
      ];
      setBonuses(cachedBonuses);
    };

    // Atualiza por funcionário em vez de depender apenas do estado local.
    // Assim, ao sair/voltar da aba ou salvar logo após o carregamento, a config
    // existente não é perdida nem duplicada e o flag `enabled` fica persistido.
    const { data: updatedRows, error: updateError } = await supabase
      .from("employee_goal_bonuses" as any)
      .update(payload)
      .eq("user_id", dataOwnerId)
      .eq("employee_id", employeeId)
      .select(COLUMNS);
    if (updateError) throw updateError;

    if (!updatedRows || (updatedRows as any[]).length === 0) {
      const { data: insertedRow, error: insertError } = await supabase
        .from("employee_goal_bonuses" as any)
        .insert(payload)
        .select(COLUMNS)
        .single();
      if (insertError) throw insertError;
      syncSavedRow(insertedRow);
    } else {
      syncSavedRow((updatedRows as any[])[0]);
    }
    await fetchAll();
  }, [dataOwnerId, fetchAll]);

  const removeForEmployee = useCallback(async (employeeId: string) => {
    assertWritable();
    const existing = bonuses.find((b) => b.employeeId === employeeId);
    if (!existing) return;
    const { error } = await supabase.from("employee_goal_bonuses" as any).delete().eq("id", existing.id);
    if (error) throw error;
    await fetchAll();
  }, [bonuses, fetchAll]);

  return { bonuses, loading, getForEmployee, upsertForEmployee, removeForEmployee, refresh: fetchAll };
}
