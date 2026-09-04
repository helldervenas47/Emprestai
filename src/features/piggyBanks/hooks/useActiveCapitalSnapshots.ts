import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAppUIEvent } from "@/lib/appUIEvents";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwner } from "@/hooks/useDataOwner";
import { todayInAppTz } from "@/lib/timezone";

export interface ActiveCapitalSnapshot {
  id: string;
  month: string;
  amount: number;
  finalized: boolean;
  snapshotDate: string;
  lastCalculatedAt: string;
}

function previousMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function mapRow(row: any): ActiveCapitalSnapshot {
  return {
    id: row.id,
    month: row.month,
    amount: Number(row.amount) || 0,
    finalized: Boolean(row.finalized),
    snapshotDate: row.snapshot_date,
    lastCalculatedAt: row.last_calculated_at,
  };
}

const ACTIVE_CAPITAL_COLUMNS =
  "id, month, amount, finalized, snapshot_date, last_calculated_at";

export function useActiveCapitalSnapshots(currentAmount?: number) {
  const { user } = useAuth();
  const ownerId = useDataOwner();
  const [snapshots, setSnapshots] = useState<Record<string, ActiveCapitalSnapshot>>({});
  const syncingRef = useRef(false);
  const currentMonth = todayInAppTz().slice(0, 7);

  const load = useCallback(async () => {
    if (!ownerId) return;

    const { data, error } = await supabase
      .from("active_capital_snapshots")
      .select(ACTIVE_CAPITAL_COLUMNS)
      .eq("user_id", ownerId)
      .order("month", { ascending: false });

    if (error) {
      console.error("Erro ao carregar snapshots de capital ativo:", error);
      return;
    }

    const next: Record<string, ActiveCapitalSnapshot> = {};
    for (const row of data || []) {
      next[row.month] = mapRow(row);
    }
    setSnapshots(next);
  }, [ownerId]);

  const upsertSnapshot = useCallback(
    async (month: string, amount: number, finalized = false) => {
      if (!ownerId) return null;

      const payload = {
        user_id: ownerId,
        month,
        amount,
        finalized,
        snapshot_date: todayInAppTz(),
        last_calculated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("active_capital_snapshots")
        .upsert(payload, { onConflict: "user_id,month" })
        .select(ACTIVE_CAPITAL_COLUMNS)
        .single();

      if (error || !data) return null;
      const mapped = mapRow(data);
      setSnapshots((current) => ({ ...current, [mapped.month]: mapped }));
      return mapped;
    },
    [ownerId]
  );

  useEffect(() => {
    if (user && ownerId) {
      void load();
      return onAppUIEvent("METAS_RELOAD", () => {
        void load();
      });
    }
  }, [user, ownerId, load]);

  useEffect(() => {
    if (!ownerId || syncingRef.current || currentAmount === undefined || typeof currentAmount !== "number" || isNaN(currentAmount)) return;

    const currentSnapshot = snapshots[currentMonth];
    const roundedAmount = Number((currentAmount ?? 0).toFixed(2));
    const shouldSyncCurrent = !currentSnapshot || !currentSnapshot.finalized || Math.abs(currentSnapshot.amount - roundedAmount) > 0.009;
    const staleOpenMonths = Object.values(snapshots).filter((snapshot) => snapshot.month < currentMonth && !snapshot.finalized);

    if (!shouldSyncCurrent && staleOpenMonths.length === 0) return;

    syncingRef.current = true;

    void (async () => {
      try {
        for (const snapshot of staleOpenMonths) {
          await upsertSnapshot(snapshot.month, snapshot.amount, true);
        }

        if (shouldSyncCurrent) {
          await upsertSnapshot(currentMonth, roundedAmount, false);
        }
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [ownerId, currentAmount, currentMonth, snapshots, upsertSnapshot]);

  const previousMonth = useMemo(() => previousMonthKey(currentMonth), [currentMonth]);

  const getSnapshotAmount = useCallback((month: string) => snapshots[month]?.amount ?? null, [snapshots]);

  return {
    currentMonth,
    previousMonth,
    snapshots,
    getSnapshotAmount,
  };
}