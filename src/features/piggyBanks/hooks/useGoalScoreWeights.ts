import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useDataOwner } from "@/hooks/useDataOwner";
import type { GoalType } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { toast } from "sonner";

// Pesos padrão iniciais somando 100.
export const DEFAULT_WEIGHTS: Record<GoalType, number> = {
  interest_rate:      5,
  profit:             5,
  loan_volume:        10,
  new_loans_count:    5,
  received_total:     0,
  interest_received:  20,
  active_capital:     10,
  net_profit:         0,
  max_default_rate:   10,
  new_clients_count:  5,
  renegotiation_rate: 10,
  daily_received_avg: 10,
  monthly_variation:  10,
};

const cacheKey = (ownerId: string) => `metas_score_weights_v1_${ownerId}`;

export function useGoalScoreWeights() {
  const ownerId = useDataOwner();
  const [weights, setWeights] = useState<Record<GoalType, number>>(DEFAULT_WEIGHTS);
  const [loaded, setLoaded] = useState(false);

  // Carrega do banco; cai para cache local se ainda não houver dados.
  useEffect(() => {
    if (!ownerId) return;
    let alive = true;
    (async () => {
      // 1) Cache local imediato (evita flash)
      try {
        const raw = localStorage.getItem(cacheKey(ownerId));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (alive) setWeights({ ...DEFAULT_WEIGHTS, ...parsed });
        }
      } catch {}

      // 2) Fonte de verdade: banco
      const { data, error } = await (supabase as any)
        .from("user_goal_score_weights")
        .select("goal_type, weight")
        .eq("user_id", ownerId);

      if (!alive) return;

      if (error) {
        // Se a migração ainda não foi aplicada, seguimos com defaults/cache.
        console.warn("user_goal_score_weights indisponível, usando cache local:", error.message);
        setLoaded(true);
        return;
      }

      if (data && data.length > 0) {
        const next: Record<GoalType, number> = { ...DEFAULT_WEIGHTS };
        (data as Array<{ goal_type: string; weight: number }>).forEach((row) => {
          if (row.goal_type in next) next[row.goal_type as GoalType] = Number(row.weight) || 0;
        });
        setWeights(next);
        try { localStorage.setItem(cacheKey(ownerId), JSON.stringify(next)); } catch {}
      }
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [ownerId]);

  const persist = useCallback(async (next: Record<GoalType, number>) => {
    if (!ownerId) return;
    try { localStorage.setItem(cacheKey(ownerId), JSON.stringify(next)); } catch {}

    const rows = (Object.keys(next) as GoalType[]).map((gt) => ({
      user_id: ownerId,
      goal_type: gt,
      weight: Math.max(0, Math.round(next[gt] || 0)),
    }));

    const { error } = await (supabase as any)
      .from("user_goal_score_weights")
      .upsert(rows, { onConflict: "user_id,goal_type" });

    if (error) {
      // Migração ausente ou erro pontual: mantém salvo localmente.
      console.warn("Falha ao salvar pontuações no banco:", error.message);
      toast.error(
        error.code === "42P01"
          ? "Tabela de pontuações ainda não foi criada no banco. Aplique a migração SQL."
          : "Erro ao salvar pontuações no banco (salvo localmente).",
      );
      return false;
    }
    return true;
  }, [ownerId]);

  const setWeight = useCallback((type: GoalType, value: number) => {
    setWeights((prev) => {
      const next = { ...prev, [type]: Math.max(0, Math.round(value || 0)) };
      // Não persiste a cada tecla — o Salvar é explícito via saveAll.
      return next;
    });
  }, []);

  const saveAll = useCallback(async (next: Record<GoalType, number>) => {
    setWeights(next);
    return persist(next);
  }, [persist]);

  const total = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0);

  return { weights, setWeight, saveAll, total, loaded };
}
