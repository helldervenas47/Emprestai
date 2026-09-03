import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwner } from "@/hooks/useDataOwner";
import { toast } from "sonner";
import { assertWritable } from "@/lib/readOnlyState";

export interface BalanceAdjustment {
  amount: number;
  previousAmount: number;
  adjustedAt: string;
  adjustedBy: string | null;
  adjustedByName?: string | null;
  notes?: string | null;
}

export type BalanceAdjustmentsMap = Record<string, BalanceAdjustment>;

/**
 * Ajustes manuais do "saldo base" — substituem o saldo previsto do dia
 * informado e tornam-se nova âncora para a projeção diária.
 * Chave do mapa: data (YYYY-MM-DD).
 */
export function useBalanceAdjustments() {
  const { user } = useAuth();
  const ownerId = useDataOwner();
  const [map, setMap] = useState<BalanceAdjustmentsMap>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ownerId) return;
    const { data, error } = await supabase
      .from("balance_adjustments")
      .select("adjustment_date, amount, previous_amount, adjusted_by, created_at, notes")
      .order("adjustment_date", { ascending: true });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    const userIds = Array.from(
      new Set(rows.map((r) => r.adjusted_by).filter(Boolean) as string[]),
    );
    let nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);
      nameById = new Map(
        (profs ?? []).map((p) => [p.user_id, p.display_name ?? ""]),
      );
    }
    const next: BalanceAdjustmentsMap = {};
    for (const r of rows) {
      next[r.adjustment_date as string] = {
        amount: Number(r.amount) || 0,
        previousAmount: Number(r.previous_amount) || 0,
        adjustedAt: r.created_at as string,
        adjustedBy: (r.adjusted_by as string | null) ?? null,
        adjustedByName: r.adjusted_by ? nameById.get(r.adjusted_by) ?? null : null,
        notes: (r.notes as string | null) ?? null,
      };
    }
    setMap(next);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (user && ownerId) load();
  }, [user, ownerId, load]);

  const setAdjustment = useCallback(
    async (date: string, amount: number, previousAmount: number, notes?: string) => {
      assertWritable();
      if (!ownerId) return;
      const prev = map;
      const optimistic: BalanceAdjustment = {
        amount,
        previousAmount,
        adjustedAt: new Date().toISOString(),
        adjustedBy: user?.id ?? null,
        adjustedByName: prev[date]?.adjustedByName ?? null,
        notes: notes ?? null,
      };
      setMap((m) => ({ ...m, [date]: optimistic }));
      const { error } = await supabase
        .from("balance_adjustments")
        .upsert(
          {
            owner_id: ownerId,
            adjustment_date: date,
            amount,
            previous_amount: previousAmount,
            adjusted_by: user?.id ?? null,
            notes: notes ?? null,
          } as never,
          { onConflict: "owner_id,adjustment_date" },
        );
      if (error) {
        setMap(prev);
        toast.error("Erro ao salvar ajuste de saldo");
        return;
      }
      // Recarrega para obter created_at e nome do usuário.
      load();
    },
    [ownerId, map, user, load],
  );

  const clearAdjustment = useCallback(
    async (date: string) => {
      assertWritable();
      if (!ownerId) return;
      const prev = map;
      setMap((m) => {
        const next = { ...m };
        delete next[date];
        return next;
      });
      const { error } = await supabase
        .from("balance_adjustments")
        .delete()
        .eq("owner_id", ownerId)
        .eq("adjustment_date", date);
      if (error) {
        setMap(prev);
        toast.error("Erro ao remover ajuste de saldo");
      }
    },
    [ownerId, map],
  );

  return { adjustments: map, loading, setAdjustment, clearAdjustment };
}
