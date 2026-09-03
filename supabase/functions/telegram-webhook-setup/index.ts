// Configura automaticamente:
//  - Bot de DESPESAS (TELEGRAM_BOT_TOKEN): webhook -> /functions/v1/telegram-webhook
//  - Bot de RELATÓRIOS (TELEGRAM_BOT_TOKEN_REPORTS): webhook -> /functions/v1/telegram-webhook
// Registra resultado em public.telegram_job_logs e em system_telegram_bots.last_*.
//
// Versão auto-contida (sem imports de ../_shared) para deploy manual no Dashboard.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`[telegram-webhook-setup] secret ${name} não configurado.`);
  return v;
}

function getExternalSupabaseUrl(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (external?.includes(EXTERNAL_PROJECT_REF)) return external;
  const nativeUrl = Deno.env.get("SUPABASE_URL");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF)) return nativeUrl;
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

function getExternalAdmin(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey(), {
    auth: { persistSession: false },
  });
}

async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let admin: SupabaseClient;
  try {
    admin = getExternalAdmin();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server misconfigured", detail: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return { userId: userData.user.id };
}

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

type BotCandidate = {
  token: string;
  dbId?: string;
  source: "secret" | "database";
};

function addCandidate(list: BotCandidate[], seen: Set<string>, candidate: BotCandidate) {
  const token = candidate.token?.trim();
  if (!token || seen.has(token)) return;
  seen.add(token);
  list.push({ ...candidate, token });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;

  const startedAt = Date.now();
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

    const { data: dbBots, error: dbBotsErr } = await supabase
      .from("system_telegram_bots")
      .select("id, purpose, token")
      .eq("active", true)
      .not("token", "is", null);
    if (dbBotsErr) throw dbBotsErr;

    const expenseCandidates: BotCandidate[] = [];
    const reportCandidates: BotCandidate[] = [];
    const seenExpenses = new Set<string>();
    const seenReports = new Set<string>();

    addCandidate(expenseCandidates, seenExpenses, { token: expensesToken ?? "", source: "secret" });
    addCandidate(reportCandidates, seenReports, { token: reportsToken ?? "", source: "secret" });

    for (const bot of (dbBots ?? []) as Array<{ id: string; purpose: string; token: string | null }>) {
      if (bot.purpose === "expenses") {
        addCandidate(expenseCandidates, seenExpenses, { token: bot.token ?? "", dbId: bot.id, source: "database" });
      }
      if (bot.purpose === "reports") {
        addCandidate(reportCandidates, seenReports, { token: bot.token ?? "", dbId: bot.id, source: "database" });
      }
    }

    if (expenseCandidates.length > 0) {
      for (const candidate of expenseCandidates) {
        const expensesToken = candidate.token;
        const me = await tgGetMe(expensesToken);
        const username = me?.result?.username ?? null;
        const botId = me?.result?.id ? String(me.result.id) : null;
        if (username && botId) {
          const patch = {
            token: expensesToken,
            bot_username: username,
            active: true,
            validation_status: "valid",
            last_validated_at: new Date().toISOString(),
            update_offset: 0,
          };
          if (candidate.dbId) {
            await supabase.from("system_telegram_bots").update(patch).eq("id", candidate.dbId);
          } else {
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
        }
        const secret = await deriveTelegramWebhookSecret(expensesToken);
        const { ok: setOk, data } = await telegramPostForm(expensesToken, "setWebhook", {
          url: webhookUrl,
          secret_token: secret,
          allowed_updates: ["message", "edited_message", "callback_query"],
          drop_pending_updates: false,
        });
        results.push({ kind: "expenses", action: "setWebhook", source: candidate.source, token: maskToken(expensesToken), ok: setOk, telegram: data, username });
        if (username) {
          const successPatch = { last_success_at: new Date().toISOString(), last_error: null, last_error_at: null };
          if (candidate.dbId) {
            await supabase.from("system_telegram_bots").update(successPatch).eq("id", candidate.dbId);
          } else {
            await supabase.from("system_telegram_bots")
              .update(successPatch)
              .eq("purpose", "expenses").eq("bot_username", username);
          }
        }
      }
    } else {
      results.push({ kind: "expenses", skipped: true, reason: "Nenhum bot de despesas ativo em Secrets ou system_telegram_bots" });
    }

    if (reportCandidates.length > 0) {
      for (const candidate of reportCandidates) {
        const reportsToken = candidate.token;
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
          if (candidate.dbId) {
            await supabase.from("system_telegram_bots").update(patch).eq("id", candidate.dbId);
          } else {
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
        }
        const secret = await deriveTelegramWebhookSecret(reportsToken);
        const { ok: setOk, data } = await telegramPostForm(reportsToken, "setWebhook", {
          url: webhookUrl,
          secret_token: secret,
          allowed_updates: ["message", "edited_message"],
          drop_pending_updates: false,
        });
        results.push({ kind: "reports", action: "setWebhook", source: candidate.source, token: maskToken(reportsToken), ok: setOk, telegram: data, username });
      }
    } else {
      results.push({ kind: "reports", skipped: true, reason: "Nenhum bot de relatórios ativo em Secrets ou system_telegram_bots" });
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
