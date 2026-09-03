import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwner } from "@/hooks/useDataOwner";
import { toast } from "sonner";
import { assertWritable } from "@/lib/readOnlyState";

export type MonthlyOpeningBalances = Record<string, number>;

const LEGACY_KEY = "calendar:incomeMonthDay1BalanceOverrides";

function readLegacy(): MonthlyOpeningBalances {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

export function useMonthlyOpeningBalances() {
  const { user } = useAuth();
  const ownerId = useDataOwner();
  const [map, setMap] = useState<MonthlyOpeningBalances>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    assertWritable();
    if (!ownerId) return;
    const { data, error } = await supabase
      .from("monthly_opening_balances")
      .select("month, amount");
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const next: MonthlyOpeningBalances = {};
    for (const r of data ?? []) {
      next[r.month] = Number(r.amount) || 0;
    }
    // Backfill: migrar entradas antigas do localStorage uma única vez.
    const legacy = readLegacy();
    const missing = Object.entries(legacy).filter(([m]) => next[m] === undefined);
    if (missing.length > 0) {
      const rows = missing.map(([month, amount]) => ({
        user_id: user?.id || ownerId,
        owner_id: ownerId,
        month,
        amount,
      }));
      const { error: upErr } = await supabase
        .from("monthly_opening_balances")
        .upsert(rows, { onConflict: "owner_id,month" });
      if (!upErr) {
        for (const [m, a] of missing) next[m] = a;
        try { window.localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
      }
    }
    setMap(next);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (user && ownerId) load();
  }, [user, ownerId, load]);

  const setBalance = useCallback(
    async (month: string, amount: number) => {
      assertWritable();
      if (!ownerId) return;
      const prev = map;
      setMap((m) => ({ ...m, [month]: amount }));
      const { error } = await (supabase
        .from("monthly_opening_balances") as any)
        .upsert(
          { owner_id: ownerId, month, amount },
          { onConflict: "owner_id,month" },
        );
      if (error) {
        setMap(prev);
        toast.error("Erro ao salvar saldo de abertura");
      }
    },
    [ownerId, map],
  );

  const clearBalance = useCallback(
    async (month: string) => {
      assertWritable();
      if (!ownerId) return;
      const prev = map;
      setMap((m) => {
        const next = { ...m };
        delete next[month];
        return next;
      });
      const { error } = await supabase
        .from("monthly_opening_balances")
        .delete()
        .eq("owner_id", ownerId)
        .eq("month", month);
      if (error) {
        setMap(prev);
        toast.error("Erro ao remover saldo de abertura");
      }
    },
    [ownerId, map],
  );

  return { overrides: map, loading, setBalance, clearBalance };
}
