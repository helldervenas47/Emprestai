import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getReportsBotId } from "../_shared/reports-bot.ts";
import { getExternalAdmin, getExternalUserClient } from "../_shared/external-supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const userClient = getExternalUserClient();
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
  const userId = user?.id;
  if (userErr || !userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const admin = getExternalAdmin();
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  if (body?.action === "status") {
    const { data: linked, error: linkedErr } = await admin.from("telegram_reports_links")
      .select("chat_id, bot_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (linkedErr && linkedErr.code !== "42P01" && linkedErr.code !== "PGRST205") {
      return new Response(JSON.stringify({ error: linkedErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ linked: linked ? { chat_id: linked.chat_id, bot_id: linked.bot_id ?? null } : null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const reportsBotId = await getReportsBotId(admin);
  if (!reportsBotId) {
    return new Response(JSON.stringify({ error: "Bot de relatórios não configurado." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: existing, error: existingErr } = await admin.from("telegram_reports_links")
    .select("chat_id, bot_id, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existingErr && (existingErr.code === "42P01" || existingErr.code === "PGRST205")) {
    return new Response(JSON.stringify({
      error: "Estrutura de dupla conexão ausente. Execute a restauração das tabelas de relatórios para habilitar bot de despesas e relatórios em paralelo.",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (existingErr && existingErr.code !== "42P01" && existingErr.code !== "PGRST205") {
    return new Response(JSON.stringify({ error: existingErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (existing) {
    return new Response(JSON.stringify({ alreadyLinked: true, chat_id: existing.chat_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin.from("telegram_reports_link_codes").delete().eq("user_id", userId).eq("bot_id", reportsBotId);

  let code = "";
  for (let i = 0; i < 5; i++) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const { data: clash } = await admin.from("telegram_reports_link_codes").select("id").eq("code", code).maybeSingle();
    if (!clash) break;
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error: insErr } = await admin.from("telegram_reports_link_codes").insert({
    code, user_id: userId, bot_id: reportsBotId, expires_at: expiresAt,
  });
  if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: corsHeaders });

  return new Response(JSON.stringify({ code, expiresAt }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
