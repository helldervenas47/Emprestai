import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getReportsBotId } from "../_shared/reports-bot.ts";
import { getExternalAdmin, getExternalUserClient } from "../_shared/external-supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Unauthorized" }, 401);
  }

  const userClient = getExternalUserClient();
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = getExternalAdmin();

  const reportsBotId = await getReportsBotId(admin);
  const { data: activeExpenseBot } = await admin.from("system_telegram_bots")
    .select("id")
    .eq("purpose", "expenses")
    .eq("active", true)
    .order("bot_id", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const expensesBotId = (activeExpenseBot as any)?.id ?? null;

  // Already linked to the active expenses bot? Do not treat the reports bot as a blocker.
  let existQ = admin.from("telegram_links")
    .select("chat_id").eq("user_id", user.id);
  if (expensesBotId) existQ = existQ.eq("bot_id", expensesBotId);
  else if (reportsBotId) existQ = existQ.or(`bot_id.is.null,bot_id.neq.${reportsBotId}`);
  const { data: existing } = await existQ.maybeSingle();
  if (existing) {
    return json({ alreadyLinked: true, chat_id: existing.chat_id });
  }

  // Cleanup old codes for this user (somente do bot de despesas atual)
  let delQ = admin.from("telegram_link_codes").delete().eq("user_id", user.id);
  if (expensesBotId) delQ = delQ.eq("bot_id", expensesBotId);
  else if (reportsBotId) delQ = delQ.or(`bot_id.is.null,bot_id.neq.${reportsBotId}`);
  await delQ;


  // Generate unique 6-digit code
  let code = "";
  for (let i = 0; i < 5; i++) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const { data: clash } = await admin.from("telegram_link_codes").select("id").eq("code", code).maybeSingle();
    if (!clash) break;
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error: insErr } = await admin.from("telegram_link_codes").insert({
    code,
    user_id: user.id,
    bot_id: expensesBotId,
    expires_at: expiresAt,
  });
  if (insErr) {
    return json({ error: insErr.message }, 500);
  }

  return json({ code, expiresAt, expiresInMinutes: 30 });
});
