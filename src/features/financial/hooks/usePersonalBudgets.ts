import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { assertWritable } from "@/lib/readOnlyState";

export interface PersonalBudget {
  id: string;
  category: string;
  amount: number;
  /** Mês ao qual o limite pertence (formato YYYY-MM). */
  month: string;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Resolve o mês de origem dos limites a serem usados para `targetMonth`,
 * aplicando a regra de herança: usa o próprio mês se houver limites,
 * senão o mês mais recente anterior; se não existir, o próximo mês posterior.
 */
export function resolveInheritedMonth(
  targetMonth: string,
  monthsWithBudgets: string[],
): string | null {
  if (monthsWithBudgets.length === 0) return null;
  if (monthsWithBudgets.includes(targetMonth)) return targetMonth;

  const sorted = [...monthsWithBudgets].sort();
  const previous = [...sorted].reverse().find((m) => m < targetMonth);
  if (previous) return previous;
  const next = sorted.find((m) => m > targetMonth);
  return next ?? null;
}

/**
 * Hook de orçamentos pessoais com escopo mensal e herança automática.
 *
 * - `month` opcional: se não informado, usa o mês corrente.
 * - `budgets`: limites efetivos para `month` (já aplicada a herança).
 * - `effectiveMonth`: o mês de onde os `budgets` vieram (pode ser diferente
 *   de `month` quando há herança).
 * - `isInherited`: indica se os limites exibidos foram herdados de outro mês.
 */
export function usePersonalBudgets(enabled = true, month?: string) {
  const { user, dataOwnerId } = useAuth();
  const [allBudgets, setAllBudgets] = useState<PersonalBudget[]>([]);

  const targetMonth = month ?? currentMonth();

  const fetchBudgets = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("personal_budgets" as any)
      .select("id, category, amount, month");
    if (data) {
      setAllBudgets(
        (data as any[]).map((b) => ({
          id: b.id,
          category: b.category,
          amount: Number(b.amount),
          month: b.month ?? currentMonth(),
        })),
      );
    }
  }, [user]);

  useEffect(() => { if (enabled) fetchBudgets(); }, [fetchBudgets, enabled]);

  // Realtime removido (P0-02 egress): mutações locais chamam fetchBudgets() diretamente.

  const monthsWithBudgets = useMemo(() => {
    const set = new Set<string>();
    allBudgets.forEach((b) => set.add(b.month));
    return [...set];
  }, [allBudgets]);

  const effectiveMonth = useMemo(
    () => resolveInheritedMonth(targetMonth, monthsWithBudgets),
    [targetMonth, monthsWithBudgets],
  );

  const budgets = useMemo(
    () => (effectiveMonth ? allBudgets.filter((b) => b.month === effectiveMonth) : []),
    [allBudgets, effectiveMonth],
  );

  const monthBudgets = useMemo(
    () => allBudgets.filter((b) => b.month === targetMonth),
    [allBudgets, targetMonth],
  );

  /** Define/remove um limite SEMPRE para `targetMonth` (nunca altera meses anteriores). */
  const setBudget = useCallback(
    async (category: string, amount: number) => {
      assertWritable();
      if (!dataOwnerId) return;
      const existing = monthBudgets.find((b) => b.category === category);

      if (amount <= 0) {
        if (existing) {
          setAllBudgets((prev) => prev.filter((b) => b.id !== existing.id));
          await supabase.from("personal_budgets" as any).delete().eq("id", existing.id);
        }
        return;
      }

      if (existing) {
        setAllBudgets((prev) =>
          prev.map((b) => (b.id === existing.id ? { ...b, amount } : b)),
        );
        await supabase
          .from("personal_budgets" as any)
          .update({ amount })
          .eq("id", existing.id);
      } else {
        const tempId = crypto.randomUUID();
        setAllBudgets((prev) => [
          ...prev,
          { id: tempId, category, amount, month: targetMonth },
        ]);
        const { data } = await supabase
          .from("personal_budgets" as any)
          .insert({
            user_id: dataOwnerId,
            category,
            amount,
            month: targetMonth,
          } as any)
          .select()
          .single();
        if (data) {
          setAllBudgets((prev) =>
            prev.map((b) => (b.id === tempId ? { ...b, id: (data as any).id } : b)),
          );
        }
      }
    },
    [monthBudgets, dataOwnerId, targetMonth],
  );

  /** Apaga um limite específico do mês alvo (ou herdado, conforme o id). */
  const deleteBudget = useCallback(async (id: string) => {
    assertWritable();
    setAllBudgets((prev) => prev.filter((b) => b.id !== id));
    await supabase.from("personal_budgets" as any).delete().eq("id", id);
  }, []);

  /** Copia os limites do mês `effectiveMonth` para o `targetMonth` (cria registros próprios). */
  const inheritIntoMonth = useCallback(async () => {
    assertWritable();
    if (!dataOwnerId || !effectiveMonth || effectiveMonth === targetMonth) return;
    const source = allBudgets.filter((b) => b.month === effectiveMonth);
    if (source.length === 0) return;

    const rows = source.map((b) => ({
      user_id: dataOwnerId,
      category: b.category,
      amount: b.amount,
      month: targetMonth,
    }));
    const { data } = await supabase
      .from("personal_budgets" as any)
      .insert(rows as any)
      .select();
    if (data) {
      setAllBudgets((prev) => [
        ...prev,
        ...(data as any[]).map((b) => ({
          id: b.id,
          category: b.category,
          amount: Number(b.amount),
          month: b.month,
        })),
      ]);
    }
  }, [allBudgets, dataOwnerId, effectiveMonth, targetMonth]);

  return {
    budgets,
    monthBudgets,
    effectiveMonth,
    isInherited: !!effectiveMonth && effectiveMonth !== targetMonth,
    targetMonth,
    setBudget,
    deleteBudget,
    inheritIntoMonth,
  };
}
