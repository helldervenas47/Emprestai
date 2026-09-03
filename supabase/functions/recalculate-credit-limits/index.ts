// Edge function: recalculate-credit-limits
// Runs monthly (cron) to adjust credit limits for all clients based on payment behavior.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_INITIAL_LIMIT = 300;
const MIN_LIMIT = 0;
const MAX_INCREASE_PCT = 0.10;
const MAX_DECREASE_PCT = 0.10;

interface LoanRow {
  id: string;
  borrower_id: string | null;
  user_id: string;
  start_date: string;
  status: string;
}
interface PaymentRow {
  id: string;
  loan_id: string;
  installment_number: number;
  date: string;
}

function computeMetrics(clientId: string, loans: LoanRow[], payments: PaymentRow[]) {
  const clientLoans = loans.filter((l) => l.borrower_id === clientId);
  const paidLoans = clientLoans.filter((l) => l.status === "paid").length;

  let onTime = 0;
  let late = 0;
  let totalLateDays = 0;

  for (const loan of clientLoans) {
    const lp = payments.filter(
      (p) => p.loan_id === loan.id && p.installment_number > 0,
    );
    for (const p of lp) {
      const start = new Date(loan.start_date + "T00:00:00");
      const expected = new Date(
        start.getFullYear(),
        start.getMonth() + p.installment_number,
        start.getDate(),
      );
      const paid = new Date(p.date + "T00:00:00");
      const days = Math.floor(
        (paid.getTime() - expected.getTime()) / 86400000,
      );
      if (days <= 0) onTime++;
      else {
        late++;
        totalLateDays += days;
      }
    }
  }

  const total = onTime + late;
  return {
    paidLoans,
    onTime,
    late,
    totalInstallmentsPaid: total,
    onTimePct: total > 0 ? onTime / total : 1,
    avgLateDays: late > 0 ? totalLateDays / late : 0,
  };
}

function computeAdjustment(currentLimit: number, m: ReturnType<typeof computeMetrics>) {
  if (m.totalInstallmentsPaid === 0) {
    return { newLimit: currentLimit, pct: 0, reason: "Sem histórico de pagamentos suficiente" };
  }
  let pct = 0;
  let reason = "";
  if (m.onTimePct >= 0.9 && m.avgLateDays < 5) {
    pct = MAX_INCREASE_PCT;
    reason = `Bom histórico (${Math.round(m.onTimePct * 100)}% em dia) — aumento de 10%`;
  } else if (m.onTimePct >= 0.7) {
    pct = 0;
    reason = `Histórico regular (${Math.round(m.onTimePct * 100)}% em dia) — limite mantido`;
  } else {
    pct = -MAX_DECREASE_PCT;
    reason = `Histórico ruim (${Math.round(m.onTimePct * 100)}% em dia) — redução de 10%`;
  }
  const base = Math.max(currentLimit, DEFAULT_INITIAL_LIMIT);
  let newLimit = Math.max(MIN_LIMIT, currentLimit + Math.round(base * pct));
  if (pct > 0) {
    newLimit = Math.min(newLimit, Math.round(currentLimit + base * MAX_INCREASE_PCT));
  }
  return { newLimit, pct, reason };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth: require shared cron secret (header or query) matching app_internal_config.cron_secret
    const cronToken =
      req.headers.get("X-Cron-Secret") ||
      new URL(req.url).searchParams.get("cron_secret") ||
      "";
    const { data: cfg } = await supabase
      .from("app_internal_config")
      .select("value")
      .eq("key", "cron_secret")
      .maybeSingle();
    if (!cfg?.value || !cronToken || cronToken !== cfg.value) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all auto-mode credit limits
    const { data: limits, error: limitsErr } = await supabase
      .from("credit_limits")
      .select("id, user_id, client_id, current_limit, mode")
      .eq("mode", "auto");

    if (limitsErr) throw limitsErr;
    if (!limits || limits.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by user_id (data owner) to fetch loans/payments efficiently
    const ownerIds = Array.from(new Set(limits.map((l: any) => l.user_id)));

    let processed = 0;
    let updates = 0;
    const errors: string[] = [];

    for (const ownerId of ownerIds) {
      const { data: loans } = await supabase
        .from("loans")
        .select("id, borrower_id, user_id, start_date, status")
        .eq("user_id", ownerId);
      const loanIds = (loans ?? []).map((l: any) => l.id);
      let payments: PaymentRow[] = [];
      if (loanIds.length > 0) {
        const { data: pays } = await supabase
          .from("payments")
          .select("id, loan_id, installment_number, date")
          .in("loan_id", loanIds);
        payments = (pays ?? []) as any;
      }

      const ownerLimits = limits.filter((l: any) => l.user_id === ownerId);

      for (const cl of ownerLimits) {
        processed++;
        const metrics = computeMetrics(cl.client_id, (loans ?? []) as any, payments);
        const adj = computeAdjustment(Number(cl.current_limit), metrics);

        if (adj.newLimit === Number(cl.current_limit)) continue;

        const { error: upErr } = await supabase
          .from("credit_limits")
          .update({
            current_limit: adj.newLimit,
            last_auto_calculated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", cl.id);
        if (upErr) {
          errors.push(`limit ${cl.id}: ${upErr.message}`);
          continue;
        }

        await supabase.from("credit_limit_history").insert([{
          user_id: ownerId,
          client_id: cl.client_id,
          change_type: "automatic",
          previous_limit: Number(cl.current_limit),
          new_limit: adj.newLimit,
          reason: adj.reason,
          metadata: {
            on_time_pct: metrics.onTimePct,
            avg_late_days: metrics.avgLateDays,
            paid_loans: metrics.paidLoans,
            total_installments_paid: metrics.totalInstallmentsPaid,
          },
        }]);
        updates++;
      }
    }

    return new Response(
      JSON.stringify({ processed, updates, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("recalculate-credit-limits error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
