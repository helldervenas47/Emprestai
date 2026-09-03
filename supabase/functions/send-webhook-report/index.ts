import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all enabled webhook settings
    const { data: webhookSettings, error: wsErr } = await supabase
      .from("webhook_settings")
      .select("user_id, webhook_url")
      .eq("enabled", true)
      .neq("webhook_url", "");

    if (wsErr) throw new Error(`Error fetching webhook settings: ${wsErr.message}`);
    if (!webhookSettings || webhookSettings.length === 0) {
      return new Response(JSON.stringify({ message: "No active webhooks" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const todayStr = getTodayStr();
    const results: { userId: string; status: string }[] = [];

    for (const ws of webhookSettings) {
      try {
        // Fetch loans for this user
        const { data: loans } = await supabase
          .from("loans")
          .select("borrower_name, due_date, remaining_amount, status")
          .eq("user_id", ws.user_id)
          .neq("status", "paid");

        const overdue = (loans || []).filter((l: any) => l.due_date < todayStr);
        const dueToday = (loans || []).filter((l: any) => l.due_date === todayStr);

        const totalOverdue = overdue.reduce(
          (s: number, l: any) => s + Number(l.remaining_amount || 0),
          0
        );
        const totalDueToday = dueToday.reduce(
          (s: number, l: any) => s + Number(l.remaining_amount || 0),
          0
        );

        // Fetch payments made today
        const { data: paymentsToday } = await supabase
          .from("payments")
          .select("amount")
          .eq("user_id", ws.user_id)
          .eq("date", todayStr);

        const totalPaidToday = (paymentsToday || []).reduce(
          (s: number, p: any) => s + Number(p.amount || 0),
          0
        );

        const report = {
          date: todayStr,
          summary: {
            overdue_count: overdue.length,
            overdue_total: totalOverdue,
            overdue_total_formatted: formatCurrency(totalOverdue),
            due_today_count: dueToday.length,
            due_today_total: totalDueToday,
            due_today_total_formatted: formatCurrency(totalDueToday),
            payments_today_count: (paymentsToday || []).length,
            payments_today_total: totalPaidToday,
            payments_today_total_formatted: formatCurrency(totalPaidToday),
          },
          overdue_loans: overdue.map((l: any) => ({
            borrower: l.borrower_name,
            amount: formatCurrency(Number(l.remaining_amount || 0)),
            due_date: l.due_date,
          })),
          due_today_loans: dueToday.map((l: any) => ({
            borrower: l.borrower_name,
            amount: formatCurrency(Number(l.remaining_amount || 0)),
            due_date: l.due_date,
          })),
          message: `📊 *Relatório Diário - ${new Date(todayStr).toLocaleDateString("pt-BR")}*\n\n`
            + `🔴 *Atrasados:* ${overdue.length} empréstimo(s) — ${formatCurrency(totalOverdue)}\n`
            + `🟡 *Vencendo Hoje:* ${dueToday.length} empréstimo(s) — ${formatCurrency(totalDueToday)}\n`
            + `💰 *Recebido Hoje:* ${(paymentsToday || []).length} pagamento(s) — ${formatCurrency(totalPaidToday)}\n`
            + (overdue.length > 0
              ? `\n📋 *Detalhes Atrasados:*\n${overdue.map((l: any) => `• ${l.borrower_name} — ${formatCurrency(Number(l.remaining_amount || 0))}`).join("\n")}`
              : ""),
        };

        // Send to webhook
        const webhookRes = await fetch(ws.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(report),
        });

        results.push({
          userId: ws.user_id,
          status: webhookRes.ok ? "sent" : `error: ${webhookRes.status}`,
        });
      } catch (err: any) {
        results.push({ userId: ws.user_id, status: `error: ${err.message}` });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
