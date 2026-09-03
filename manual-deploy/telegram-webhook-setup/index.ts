// AUTO-GENERATED STANDALONE — cole este arquivo inteiro no Supabase Dashboard.
// Todas as dependências de _shared estão embutidas abaixo.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============= _shared/cors.ts =============
// CORS headers padronizados para todas as Edge Functions do app.
// Uso:
//   import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
//   const pre = handleCorsPreflight(req); if (pre) return pre;
//   return new Response(..., { headers: { ...corsHeaders, "Content-Type": "application/json" } });
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

/** Retorna a resposta 200 de preflight se `req` for OPTIONS; caso contrário, null. */
function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

// ============= _shared/external-supabase.ts =============
// Helper para acessar EXCLUSIVAMENTE o banco externo do usuário
// (syyxnqzxqabeuqbuptkh). Quando a function roda no projeto Lovable Cloud,
// usa EXTERNAL_*; quando roda diretamente no projeto externo, usa SUPABASE_*.

// Permite sobrescrever via secret EXTERNAL_PROJECT_REF; mantém o valor
// histórico como fallback para não quebrar deploys existentes.
const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(
      `[external-supabase] secret ${name} não configurado. Configure-o em Settings → Secrets para apontar ao projeto externo (syyxnqzxqabeuqbuptkh).`,
    );
  }
  return v;
}

function getExternalSupabaseUrl(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (external?.includes(EXTERNAL_PROJECT_REF)) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF)) return nativeUrl;

  // Evita registrar webhooks no projeto antigo quando EXTERNAL_SUPABASE_URL
  // ficou stale em Secrets. A URL pública do projeto é derivável pelo ref.
  return `https://${EXTERNAL_PROJECT_REF}.supabase.co`;
}

function getExternalServiceRoleKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return required("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
}

function getExternalAnonKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return required("EXTERNAL_SUPABASE_ANON_KEY");
}

/** Admin client (service role) apontando ao Supabase EXTERNO. */
function getExternalAdmin(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey(), {
    auth: {
      persistSession: false,
    },
  });
}

/** Anon client usado para validar JWTs emitidos pelo Supabase EXTERNO. */
function getExternalUserClient(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalAnonKey(), {
    auth: {
      persistSession: false,
    },
  });
}


// ============= _shared/require-admin.ts =============
// Shared helper to require an authenticated user with the 'admin' role
// (via the public.user_roles table). Returns a Response on failure, or
// the verified user id on success.
// ⚠️ Sempre opera no Supabase EXTERNO (banco principal do app).

const adminCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  let admin;
  try {
    admin = getExternalAdmin();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server misconfigured", detail: (e as Error).message }), {
      status: 500, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace(/^Bearer\s+/i, "");
  // Valida o JWT contra o próprio Supabase externo usando o service role do servidor.
  // Isso evita falso 401 quando a anon key usada para validação está ausente/rotacionada
  // nos secrets da Edge Function, sem reduzir a checagem de papel admin abaixo.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  return { userId: userData.user.id };
}


// ============= _shared/require-cron-or-admin.ts =============
// Shared guard for cron-triggered edge functions. Accepts either:
//   - Header `x-cron-secret` matching env CRON_SECRET (constant-time compare); or
//   - An authenticated admin (via requireAdmin).
// On failure returns a Response (401/403). On success returns { via }.

const cronCors = {
  ...adminCors,
  "Access-Control-Allow-Headers":
    adminCors["Access-Control-Allow-Headers"] + ", x-cron-secret",
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function requireCronOrAdmin(
  req: Request,
): Promise<{ via: "cron" | "admin"; userId?: string } | Response> {
  const provided = req.headers.get("x-cron-secret") ?? "";
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  if (expected && provided && safeEqual(provided, expected)) {
    return { via: "cron" };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (token) {
    const serviceKeys = [
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ];

    try {
      const externalServiceKey = getExternalServiceRoleKey();
      if (!serviceKeys.includes(externalServiceKey)) serviceKeys.push(externalServiceKey);
    } catch {
      // Se o projeto externo ainda não estiver configurado, seguimos para a validação admin normal.
    }

    if (serviceKeys.some((key) => key && safeEqual(token, key))) {
      return { via: "cron" };
    }
  }

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const res = await requireAdmin(req);
    if (!(res instanceof Response)) return { via: "admin", userId: res.userId };
    return res;
  }

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...cronCors, "Content-Type": "application/json" },
  });
}

// ============= FUNCTION BODY =============
// Configura automaticamente:
//  - Bot de DESPESAS (TELEGRAM_BOT_TOKEN): webhook -> /functions/v1/telegram-webhook
//  - Bot de RELATÓRIOS (TELEGRAM_BOT_TOKEN_REPORTS): deleteWebhook (usa polling/cron)
// Registra resultado em public.telegram_job_logs e em system_telegram_bots.last_*.

async function deriveTelegramWebhookSecret(telegramApiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${telegramApiKey}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function maskToken(token: string) {
  const parts = token.split(":");
  if (parts.length !== 2) return "bot_token";
  return `${parts[0]}:****${parts[1].slice(-4)}`;
}

async function tgGetMe(token: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  return await r.json().catch(() => ({}));
}

async function telegramPostForm(token: string, method: string, params: Record<string, string | boolean | string[]>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
  }

  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok && data?.ok !== false, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // AuthN/AuthZ: require an authenticated admin BEFORE touching Telegram or DB.
  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;

  const startedAt = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = getExternalAdmin();

  const results: any[] = [];

  async function logRun(ok: boolean, error: string | null, details: any) {
    await supabase.from("telegram_job_logs").insert({
      job: "telegram-webhook-setup",
      ok, error,
      processed: results.length,
      duration_ms: Date.now() - startedAt,
      details,
    }).then(() => null).catch(() => null);
  }

  try {
    const expensesToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const reportsToken = Deno.env.get("TELEGRAM_BOT_TOKEN_REPORTS");
    const webhookUrl = `${getExternalSupabaseUrl()}/functions/v1/telegram-webhook`;

    // 1) DESPESAS -> setWebhook
    if (expensesToken) {
      const me = await tgGetMe(expensesToken);
      const username = me?.result?.username ?? null;
      const botId = me?.result?.id ? String(me.result.id) : null;
      // Sync token into DB so polling/processing uses the new token, keeping
      // only one active row per purpose to avoid ambiguous bot resolution.
      if (username && botId) {
        const patch = {
          token: expensesToken,
          bot_username: username,
          active: true,
          validation_status: "valid",
          last_validated_at: new Date().toISOString(),
          update_offset: 0,
        };
        const { data: canonical } = await supabase.from("system_telegram_bots")
          .select("id")
          .eq("purpose", "expenses")
          .or(`bot_username.eq.${username},bot_id.eq.${botId}`)
          .order("bot_id", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if ((canonical as any)?.id) {
          await supabase.from("system_telegram_bots").update(patch).eq("id", (canonical as any).id);
          await supabase.from("system_telegram_bots").update({ active: false }).eq("purpose", "expenses").neq("id", (canonical as any).id);
        } else {
          await supabase.from("system_telegram_bots").insert({ purpose: "expenses", ...patch });
        }
      }

      const secret = await deriveTelegramWebhookSecret(expensesToken);
      const { ok: setOk, data } = await telegramPostForm(expensesToken, "setWebhook", {
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message", "edited_message", "callback_query"],
        drop_pending_updates: false,
      });
      results.push({ kind: "expenses", action: "setWebhook", token: maskToken(expensesToken), ok: setOk, telegram: data, username });
      if (username) {
        await supabase.from("system_telegram_bots")
          .update({ last_success_at: new Date().toISOString(), last_error: null, last_error_at: null })
          .eq("purpose", "expenses").eq("bot_username", username);
      }
    } else {
      results.push({ kind: "expenses", skipped: true, reason: "TELEGRAM_BOT_TOKEN ausente" });
    }

    // 2) RELATÓRIOS -> deleteWebhook (usa polling/cron)
    if (reportsToken) {
      const me = await tgGetMe(reportsToken);
      const username = me?.result?.username ?? null;
      const botId = me?.result?.id ? String(me.result.id) : null;
      if (username && botId) {
        const patch = {
          token: reportsToken,
          bot_username: username,
          active: true,
          validation_status: "valid",
          last_validated_at: new Date().toISOString(),
          update_offset: 0,
        };
        const { data: canonical } = await supabase.from("system_telegram_bots")
          .select("id")
          .eq("purpose", "reports")
          .or(`bot_username.eq.${username},bot_id.eq.${botId}`)
          .order("bot_id", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if ((canonical as any)?.id) {
          await supabase.from("system_telegram_bots").update(patch).eq("id", (canonical as any).id);
          await supabase.from("system_telegram_bots").update({ active: false }).eq("purpose", "reports").neq("id", (canonical as any).id);
        } else {
          await supabase.from("system_telegram_bots").insert({ purpose: "reports", ...patch });
        }
      }

      const { ok: deleteOk, data } = await telegramPostForm(reportsToken, "deleteWebhook", {
        drop_pending_updates: false,
      });
      results.push({ kind: "reports", action: "deleteWebhook", token: maskToken(reportsToken), ok: deleteOk, telegram: data, username });
    } else {
      results.push({ kind: "reports", skipped: true, reason: "TELEGRAM_BOT_TOKEN_REPORTS ausente" });
    }


    const ok = results.every((r) => r.skipped || r.ok);
    await logRun(ok, ok ? null : "alguma operação falhou", { webhook_url: webhookUrl, results });

    return new Response(JSON.stringify({ ok, webhook_url: webhookUrl, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    await logRun(false, e?.message ?? "setup failed", { results });
    return new Response(JSON.stringify({ error: e?.message ?? "Setup failed", results }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});