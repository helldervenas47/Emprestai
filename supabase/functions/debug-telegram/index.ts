import { getExternalAdmin } from "../_shared/external-supabase.ts";
import { requireAdmin, adminCors as corsHeaders } from "../_shared/require-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;

  const supabase = getExternalAdmin();

  // Auto-populate system_telegram_bots if empty
  const { data: currentBots } = await supabase.from("system_telegram_bots").select("id");
  if (!currentBots || currentBots.length === 0) {
    const expensesToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const reportsToken = Deno.env.get("TELEGRAM_BOT_TOKEN_REPORTS");
    
    if (expensesToken) {
      await supabase.from("system_telegram_bots").insert({
        name: "Bot de Despesas",
        token: expensesToken,
        purpose: "expenses",
        active: true
      });
    }
    
    if (reportsToken) {
      await supabase.from("system_telegram_bots").insert({
        name: "Bot de Relatórios",
        token: reportsToken,
        purpose: "reports",
        active: true
      });
    }
  }

  const { data: botsRaw, error: botsErr } = await supabase.from("system_telegram_bots").select("id, name, purpose, active, bot_id, created_at");
  const bots = botsRaw ?? [];
  const { data: expenseCodes, error: ucErr } = await supabase.from("telegram_link_codes").select("*").order("created_at", { ascending: false });
  const { data: expenseLinks, error: ulErr } = await supabase.from("telegram_links").select("*").order("created_at", { ascending: false }).limit(20);
  const { data: recentMessages, error: msgErr } = await supabase.from("telegram_messages")
    .select("update_id, chat_id, text, bot_id, processed, processed_at, created_at, raw_update")
    .order("created_at", { ascending: false })
    .limit(20);
  const messages = (recentMessages ?? []).map((m: any) => ({
    update_id: m.update_id,
    chat_id: m.chat_id,
    text: m.text,
    bot_id: m.bot_id,
    processed: m.processed,
    processed_at: m.processed_at,
    created_at: m.created_at,
    system_bot_id: m.raw_update?._system_bot_id ?? null,
    bot_link_kind: m.raw_update?._bot_link_kind ?? null,
    has_bot_link_code: Boolean(m.raw_update?._bot_link_code),
    bot_link_code_preview: m.raw_update?._bot_link_code ? `${String(m.raw_update._bot_link_code).slice(0, 2)}…` : null,
  }));
  // Reports e despesas agora compartilham telegram_links / telegram_link_codes,
  // diferenciados por bot_id (system_telegram_bots.purpose).
  const reportCodes = (expenseCodes ?? []).filter((c: any) => bots?.some?.((b: any) => b.id === c.bot_id && b.purpose === "reports"));
  const reportLinks = (expenseLinks ?? []).filter((l: any) => bots?.some?.((b: any) => b.id === l.bot_id && b.purpose === "reports"));

  return new Response(JSON.stringify({
    bots,
    messages,
    expenseCodes, expenseLinks,
    reportCodes, reportLinks,
    errors: { botsErr, ucErr, ulErr, msgErr },
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

