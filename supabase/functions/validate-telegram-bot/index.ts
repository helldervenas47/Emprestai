import { getExternalUserClient } from "../_shared/external-supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: require a logged-in user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = getExternalUserClient();
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    if (!token || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return new Response(JSON.stringify({ ok: false, error: "Formato de token inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: data?.description || "Token rejeitado pelo Telegram",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = data.result ?? {};
    return new Response(JSON.stringify({
      ok: true,
      bot_id: result.id,
      bot_username: result.username,
      first_name: result.first_name,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
