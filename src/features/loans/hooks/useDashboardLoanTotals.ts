/**
 * useDashboardLoanTotals — hook para consumir a RPC agregada
 * `public.dashboard_loan_totals(_start, _end)` criada no P0-03 (etapa A).
 *
 * Uso: SOMENTE no Dashboard. Não substitui os dados do useLoans — no
 * momento é usado em paralelo, para comparação e validação.
 *
 * A migração real de UI (trocar os cards para consumirem esses totais)
 * acontece só depois da validação (comparação sem divergências).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";

export interface DashboardLoanTotals {
  owner_id: string;
  loans_count: number;
  loans_active_count: number;
  loans_paid_count: number;
  total_lent: number;
  total_lent_period: number;
  total_received: number;
  total_interest_received: number;
  remaining_capital: number;
  overdue_count: number;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useDashboardLoanTotals(range: { start: Date; end: Date }) {
  const [data, setData] = useState<DashboardLoanTotals | null>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data: rows, error } = await supabase.rpc(
          "dashboard_loan_totals" as any,
          { _start: toIsoDate(range.start), _end: toIsoDate(range.end) },
        );
        if (cancelled) return;
        if (error) {
          const msg = String(error.message || "");
          if (/dashboard_loan_totals|function .* does not exist|PGRST202/i.test(msg)) {
            setMissing(true);
          } else {
            setError(error);
          }
          setData(null);
          return;
        }
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row) { setData(null); return; }
        setData({
          owner_id: row.owner_id,
          loans_count: Number(row.loans_count) || 0,
          loans_active_count: Number(row.loans_active_count) || 0,
          loans_paid_count: Number(row.loans_paid_count) || 0,
          total_lent: Number(row.total_lent) || 0,
          total_lent_period: Number(row.total_lent_period) || 0,
          total_received: Number(row.total_received) || 0,
          total_interest_received: Number(row.total_interest_received) || 0,
          remaining_capital: Number(row.remaining_capital) || 0,
          overdue_count: Number(row.overdue_count) || 0,
        });
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.start.getTime(), range.end.getTime()]);

  return { data, error, loading, missing };
}
