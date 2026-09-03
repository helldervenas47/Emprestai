import { getReportsBotId, getReportsLinkForUser } from "../_shared/reports-bot.ts";
import { getExternalAdmin, getExternalUserClient } from "../_shared/external-supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://api.telegram.org";

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1) Require a valid Supabase JWT.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = getExternalUserClient();
    const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authUser = userRes.user;

    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!TELEGRAM_API_KEY) {
      return new Response(JSON.stringify({ ok: true, skipped: "telegram_not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Derive recipient/content from the SERVER-SIDE approval row keyed by
    //    the authenticated user id. NEVER trust owner_id / display_name /
    //    email sent by the caller — an authenticated user could otherwise
    //    spam or phish any owner via the official bot.
    const supabase = getExternalAdmin();
    const { data: approval, error: apErr } = await supabase
      .from("user_approvals")
      .select("owner_id, display_name, email, status")
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (apErr) {
      console.error("[notify-approval-request] approval lookup failed", apErr.message);
      return new Response(JSON.stringify({ error: "lookup_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!approval || approval.status !== "pending") {
      // Nothing to notify about — do not send any Telegram message.
      return new Response(JSON.stringify({ ok: true, skipped: "no_pending_approval" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerId: string = approval.owner_id;
    const displayName = approval.display_name ?? authUser.user_metadata?.display_name ?? "(sem nome)";
    const email = approval.email ?? authUser.email ?? "(sem email)";

    // 3) Resolve chat: prefer reports bot link, fallback to expenses bot link.
    const reportsLink = await getReportsLinkForUser(supabase, ownerId);
    const reportsBotId = await getReportsBotId(supabase);
    let expensesChat: number | null = null;
    if (!reportsLink) {
      let q = supabase.from("telegram_links").select("chat_id").eq("user_id", ownerId);
      if (reportsBotId) q = q.or(`bot_id.is.null,bot_id.neq.${reportsBotId}`);
      const { data: mainLink } = await q.maybeSingle();
      expensesChat = mainLink?.chat_id ? Number(mainLink.chat_id) : null;
    }
    const chatId = reportsLink?.chat_id || expensesChat;
    if (!chatId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_telegram_link" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text =
      `🔔 <b>Novo cadastro aguardando aprovação</b>\n\n` +
      `👤 <b>Nome:</b> ${escapeHtml(displayName)}\n` +
      `📧 <b>Email:</b> ${escapeHtml(email)}\n\n` +
      `Acesse o app e abra o sino de aprovações no topo para aprovar ou rejeitar.`;

    const tgRes = await fetch(`${GATEWAY_URL}/bot${TELEGRAM_API_KEY}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });

    const tgData = await tgRes.json().catch(() => ({}));
    if (!tgRes.ok) {
      console.error("Telegram send failed", tgRes.status);
      return new Response(JSON.stringify({ ok: false, error: "telegram_send_failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("notify-approval-request error", msg);
    return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
