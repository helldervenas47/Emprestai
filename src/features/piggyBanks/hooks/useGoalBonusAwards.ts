import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { assertWritable } from "@/lib/readOnlyState";

export interface GoalBonusAward {
  id: string;
  employeeId: string;
  bonusConfigId: string | null;
  referenceMonth: string;
  payrollMonth: string;
  scoreObtained: number;
  minScoreRequired: number;
  bonusAmount: number;
  status: "gerado" | "pago" | "cancelado";
  payrollId: string | null;
  generatedAt: string;
}

const COLUMNS =
  "id, employee_id, bonus_config_id, reference_month, payroll_month, score_obtained, min_score_required, bonus_amount, status, payroll_id, generated_at";

function rowToAward(r: any): GoalBonusAward {
  return {
    id: r.id,
    employeeId: r.employee_id,
    bonusConfigId: r.bonus_config_id,
    referenceMonth: r.reference_month,
    payrollMonth: r.payroll_month,
    scoreObtained: Number(r.score_obtained ?? 0),
    minScoreRequired: Number(r.min_score_required ?? 0),
    bonusAmount: Number(r.bonus_amount ?? 0),
    status: r.status,
    payrollId: r.payroll_id,
    generatedAt: r.generated_at,
  };
}

export function useGoalBonusAwards() {
  const { user, dataOwnerId } = useAuth();
  const [awards, setAwards] = useState<GoalBonusAward[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("goal_bonus_awards" as any)
      .select(COLUMNS)
      .order("generated_at", { ascending: false });
    setAwards(((data as any[]) ?? []).map(rowToAward));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const ch = supabase
      .channel(`goal_bonus_awards:${dataOwnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "goal_bonus_awards", filter: `user_id=eq.${dataOwnerId}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, dataOwnerId, fetchAll]);

  const cancel = useCallback(async (id: string) => {
    assertWritable();
    await supabase.from("goal_bonus_awards" as any).update({ status: "cancelado" }).eq("id", id);
    await fetchAll();
  }, [fetchAll]);

  const markPaidByPayroll = useCallback(async (payrollId: string) => {
    await supabase.from("goal_bonus_awards" as any).update({ status: "pago" }).eq("payroll_id", payrollId);
  }, []);

  return { awards, loading, refresh: fetchAll, cancel, markPaidByPayroll };
}
