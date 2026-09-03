import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getExternalAdmin } from "../_shared/external-supabase.ts";
import { requireCronOrAdmin } from "../_shared/require-cron-or-admin.ts";

// Keep polling short and non-overlapping. The UI can call this while the
// dialog is open, so long-polling here creates Telegram 409 conflicts.
const MAX_RUNTIME_MS = 8_000;
const MIN_REMAINING_MS = 1_500;
const POLL_LOCK_MS = 8_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ExpenseBot = {
  id: string;
  token: string;
  bot_username: string | null;
  update_offset: number;
};

async function deleteWebhook(token: string): Promise<{ ok: boolean; info: any }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    const info = await r.json().catch(() => ({}));
    return { ok: r.ok && info?.ok !== false, info };
  } catch (e) {
    return { ok: false, info: { error: String(e) } };
  }
}

async function processBot(supabase: any, bot: ExpenseBot, budgetMs: number) {
  const startedAt = Date.now();
  let currentOffset = Number(bot.update_offset || 0);
  let recovered = false;
  let totalProcessed = 0;
  let hasNew = false;

  while (true) {
    const remainingMs = budgetMs - (Date.now() - startedAt);
    if (remainingMs < MIN_REMAINING_MS) break;
    const timeout = Math.min(2, Math.max(0, Math.floor(remainingMs / 1000) - 1));
    if (timeout < 1) break;

    let resp: Response;
    try {
      resp = await fetch(`https://api.telegram.org/bot${bot.token}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset: currentOffset, timeout, allowed_updates: ["message", "callback_query"] }),
      });
    } catch (e) {
      console.error(`[telegram-poll] getUpdates fetch error bot=${bot.id}`, e);
      break;
    }

    const data = await resp.json().catch(() => ({}));
    const is409 =
      resp.status === 409 ||
      data?.error_code === 409 ||
      (typeof data?.description === "string" && data.description.includes("terminated by other getUpdates"));

    if (!resp.ok || data?.ok === false) {
      if (is409 && !recovered) {
        console.warn(`[telegram-poll] bot=${bot.id} 409 — limpando webhook e tentando novamente`);
        const rec = await deleteWebhook(bot.token);
        console.warn(`[telegram-poll] deleteWebhook result bot=${bot.id}`, rec);
        recovered = true;
        continue;
      }
      if (resp.status === 401) {
        await supabase
          .from("system_telegram_bots")
          .update({ validation_status: "invalid", last_validated_at: new Date().toISOString() })
          .eq("id", bot.id);
      }
      console.error(`[telegram-poll] bot=${bot.id} getUpdates failed`, resp.status, data);
      break;
    }

    const updates = data.result ?? [];
    if (updates.length === 0) break;

    const rows = updates
      .map((u: any) => {
        if (u.message) {
          const rawUpdate = { ...u, _system_bot_id: bot.id };
          return {
            update_id: u.update_id,
            chat_id: u.message.chat.id,
            text: u.message.text ?? u.message.caption ?? null,
            raw_update: rawUpdate,
          };
        }
        if (u.callback_query?.message?.chat?.id) {
          const rawUpdate = { ...u, _system_bot_id: bot.id };
          return {
            update_id: u.update_id,
            chat_id: u.callback_query.message.chat.id,
            text: null,
            raw_update: rawUpdate,
          };
        }
        return null;
      })
      .filter((r: any) => r !== null);

    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from("telegram_messages")
        .upsert(rows, { onConflict: "update_id" });
      if (insertErr) throw new Error(insertErr.message);
      totalProcessed += rows.length;
      hasNew = true;
    }

    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    currentOffset = newOffset;
    await supabase
      .from("system_telegram_bots")
      .update({ update_offset: newOffset, last_polled_at: new Date().toISOString() })
      .eq("id", bot.id);
  }

  return { processed: totalProcessed, hasNew };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // AuthZ: allow only cron (via x-cron-secret) or admin JWT.
  const gate = await requireCronOrAdmin(req);
  if (gate instanceof Response) return gate;


  const startTime = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Missing env" }), { status: 500, headers: corsHeaders });
  }

  // O bot de despesas usa WEBHOOK. Não podemos chamar getUpdates nele:
  // Telegram retorna 409 quando há webhook ativo e a lógica antiga removia o
  // webhook, quebrando a vinculação pela aba Financeiro. Mantemos esta função
  // como compatibilidade para crons antigos: ela só aciona o processador das
  // mensagens já recebidas pelo webhook.
  const triggerPromise = fetch(`${SUPABASE_URL}/functions/v1/telegram-process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch((e) => console.error("trigger process failed", e));
  // @ts-ignore - EdgeRuntime is available in Supabase edge runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(triggerPromise);
  }

  return new Response(JSON.stringify({
    ok: true,
    processed: 0,
    bots: 0,
    skipped: true,
    note: "expense bot uses webhook; polling disabled to avoid Telegram 409",
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  const supabase = getExternalAdmin();

  const { data: bots, error: botsErr } = await supabase
    .from("system_telegram_bots")
    .select("id, token, bot_username, update_offset")
    .eq("active", true)
    .eq("purpose", "expenses")
    .order("created_at", { ascending: true });

  if (botsErr) {
    console.error("[telegram-poll] failed to list expense bots", botsErr);
    return new Response(JSON.stringify({ error: botsErr.message }), { status: 500, headers: corsHeaders });
  }

  const list = (bots ?? []) as ExpenseBot[];
  if (list.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, bots: 0, note: "no active expense bots" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let totalProcessed = 0;
  let hasNew = false;

  const perBotBudget = Math.max(8_000, Math.floor((MAX_RUNTIME_MS - 2_000) / list.length));
  for (const bot of list) {
    console.log(`[telegram-poll] polling bot=${bot.id} username=${bot.bot_username} token=${bot.token?.slice(0, 4)}...`);
    const remaining = MAX_RUNTIME_MS - (Date.now() - startTime);
    if (remaining < MIN_REMAINING_MS) break;
    try {
      const lockCutoff = new Date(Date.now() - POLL_LOCK_MS).toISOString();
      const { data: locked, error: lockErr } = await supabase
        .from("system_telegram_bots")
        .update({ last_polled_at: new Date().toISOString() })
        .eq("id", bot.id)
        .or(`last_polled_at.is.null,last_polled_at.lt.${lockCutoff}`)
        .select("id")
        .maybeSingle();
      if (lockErr || !locked) {
        console.log(`[telegram-poll] skip bot=${bot.id}; outro polling está em andamento`);
        continue;
      }

      const result = await processBot(supabase, bot, Math.min(perBotBudget, remaining));
      totalProcessed += result.processed;
      hasNew = hasNew || result.hasNew;
    } catch (e) {
      console.error(`[telegram-poll] processBot failed bot=${bot.id}`, e);
    }
  }

  // Trigger processor (fire-and-forget) if we got new messages.
  if (hasNew) {
    const triggerPromise = fetch(`${SUPABASE_URL}/functions/v1/telegram-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch((e) => console.error("trigger process failed", e));
    // @ts-ignore - EdgeRuntime is available in Supabase edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(triggerPromise);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: totalProcessed, bots: list.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
