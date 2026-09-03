import { useCallback, useEffect, useState } from "react";
import { onAppUIEvent } from "@/lib/appUIEvents";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwner } from "@/hooks/useDataOwner";
import type { GoalType } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { assertWritable } from "@/lib/readOnlyState";

export interface GoalSnapshot {
  id: string;
  ownerId: string;
  month: string; // YYYY-MM
  goalType: GoalType;
  targetValue: number | null;
  realizedValue: number;
  attainmentPct: number | null;
  finalized: boolean;
  snapshotDate: string;
}

export function useGoalSnapshots() {
  const { user } = useAuth();
  const ownerId = useDataOwner();
  const [snapshots, setSnapshots] = useState<GoalSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ownerId) return;
    const { data, error } = await supabase
      .from("monthly_goal_snapshots")
      .select("id, owner_id, month, goal_type, target_value, realized_value, attainment_pct, finalized, snapshot_date")
      .order("month", { ascending: false });
    if (error) {
      console.error("Erro ao carregar snapshots de metas:", error);
      setLoading(false);
      return;
    }
    setSnapshots(
      (data || []).map((d: any) => ({
        id: d.id,
        ownerId: d.owner_id,
        month: d.month,
        goalType: d.goal_type as GoalType,
        targetValue: d.target_value != null ? Number(d.target_value) : null,
        realizedValue: Number(d.realized_value || 0),
        attainmentPct: d.attainment_pct != null ? Number(d.attainment_pct) : null,
        finalized: !!d.finalized,
        snapshotDate: d.snapshot_date,
      }))
    );
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (ownerId) {
      load();
      return onAppUIEvent("METAS_RELOAD", () => {
        load();
      });
    }
  }, [ownerId, load]);

  const getSnapshot = useCallback(
    (goalType: GoalType, month: string): GoalSnapshot | undefined =>
      snapshots.find((s) => s.goalType === goalType && s.month === month),
    [snapshots]
  );

  const upsertSnapshot = useCallback(async (
    goalType: GoalType,
    month: string,
    realizedValue: number,
    targetValue: number | null,
    attainmentPct: number | null,
    options?: { allowFinalizedUpdate?: boolean },
  ) => {
    assertWritable();
    if (!ownerId) return;
    // Se já está finalizado, não tenta sobrescrever — exceto correções explícitas
    // de snapshots antigos gravados com dado indisponível.
    const existing = snapshots.find((s) => s.goalType === goalType && s.month === month);
    if (existing?.finalized && !options?.allowFinalizedUpdate) return;
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("monthly_goal_snapshots")
      .upsert(
        {
          user_id: user?.id || ownerId,
          owner_id: ownerId,
          month,
          goal_type: goalType,
          realized_value: realizedValue,
          target_value: targetValue,
          attainment_pct: attainmentPct,
          finalized: true,
          snapshot_date: nowIso,
        },
        { onConflict: "owner_id,month,goal_type" },
      )
      .select("id, owner_id, month, goal_type, target_value, realized_value, attainment_pct, finalized, snapshot_date")
      .maybeSingle();
    if (error) {
      console.error("Erro ao salvar snapshot de meta:", error);
      return;
    }
    // Atualiza estado local imediatamente para refletir o snapshot recém-gravado
    // (ex.: badge "TRAVADO" após auto-fechamento retroativo).
    const row: GoalSnapshot = data
      ? {
          id: (data as any).id,
          ownerId: (data as any).owner_id,
          month: (data as any).month,
          goalType: (data as any).goal_type as GoalType,
          targetValue: (data as any).target_value != null ? Number((data as any).target_value) : null,
          realizedValue: Number((data as any).realized_value || 0),
          attainmentPct: (data as any).attainment_pct != null ? Number((data as any).attainment_pct) : null,
          finalized: !!(data as any).finalized,
          snapshotDate: (data as any).snapshot_date,
        }
      : {
          id: existing?.id || `${ownerId}-${month}-${goalType}`,
          ownerId,
          month,
          goalType,
          targetValue,
          realizedValue,
          attainmentPct,
          finalized: true,
          snapshotDate: nowIso,
        };
    setSnapshots((prev) => {
      const idx = prev.findIndex((s) => s.goalType === goalType && s.month === month);
      if (idx === -1) return [...prev, row];
      const next = prev.slice();
      next[idx] = row;
      return next;
    });
  }, [ownerId, snapshots]);

  return { snapshots, loading, getSnapshot, upsertSnapshot, reload: load };
}
