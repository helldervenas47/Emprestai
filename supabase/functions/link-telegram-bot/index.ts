// Vincula o usuário autenticado a um chat do Telegram a partir de um código.
// Fluxos aceitos:
// 1) /start no bot -> usuário cola o código alfanumérico no app.
// 2) código numérico do app -> usuário enviou /start CODE ao bot.
import { getReportsBotId } from "../_shared/reports-bot.ts";
import { getExternalAdmin, getExternalServiceRoleKey, getExternalUserClient } from "../_shared/external-supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeTelegramBotCode(input: string) {
  const commandMatch = input.match(/\/start(?:@\w+)?\s+(\d{6})\b/i);
  if (commandMatch) return commandMatch[1];
  for (const line of input.split(/\r?\n/)) {
    const candidate = line.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z0-9]{6,12}$/.test(candidate)) return candidate;
  }
  const tokens = input.toUpperCase().match(/[A-Z0-9]{6,12}/g) ?? [];
  const mixedToken = tokens.find((token) => /[A-Z]/.test(token) && /\d/.test(token));
  if (mixedToken) return mixedToken;
  const numericToken = tokens.find((token) => /^\d{6}$/.test(token));
  if (numericToken) return numericToken;
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function foldAmbiguousCode(code: string) {
  return code.toUpperCase().replace(/[IL|]/g, "1").replace(/[OQ]/g, "0");
}

function codesEquivalent(a: string, b: string) {
  return a === b || foldAmbiguousCode(a) === foldAmbiguousCode(b);
}

async function getActiveSystemBotId(admin: any, purpose: "expenses" | "reports") {
  const { data } = await admin.from("system_telegram_bots")
    .select("id")
    .eq("purpose", purpose)
    .eq("active", true)
    .order("bot_id", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

async function linkByBotCode(admin: any, userId: string, rawCode: string, requestedKind?: string) {
  const botCode = normalizeTelegramBotCode(rawCode);
  const rawIsCodeCommand = /^\/c(?:ode|odigo|ódigo)?(?:@\w+)?\s*$/i.test(rawCode.trim());
  if (!rawIsCodeCommand && !/^[A-Z0-9]{6,12}$/.test(botCode)) return null;

  let kind = requestedKind === "reports" ? "reports" : "expenses";
  const since = new Date(Date.now() - 16 * 60 * 1000).toISOString();
  const { data: recentMessages, error: msgErr } = await admin
    .from("telegram_messages")
    .select("chat_id, text, raw_update, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (msgErr) throw msgErr;

  let matched: any = null;
  for (const message of recentMessages ?? []) {
    const text = String(message.text ?? "").trim();
    if (!/^\/c(?:ode|odigo|ódigo)?(?:@\w+)?\s*$/i.test(text)) continue;
    const savedCode = normalizeTelegramBotCode(String(message.raw_update?._bot_link_code ?? ""));
    const savedKind = message.raw_update?._bot_link_kind === "reports" ? "reports" : message.raw_update?._bot_link_kind === "expenses" ? "expenses" : null;
    if (rawIsCodeCommand && savedCode && (!requestedKind || savedKind === requestedKind)) {
      if (savedKind) kind = savedKind;
      matched = message;
      break;
    }
    if (savedCode && codesEquivalent(savedCode, botCode)) {
      if (savedKind) kind = savedKind;
      matched = message;
      break;
    }

    const chatId = Number(message.chat_id);
    const validCodes = [
      await generateChatLinkCode(chatId, kind, getExternalServiceRoleKey()),
      await generateChatLinkCode(chatId, kind, getExternalServiceRoleKey(), Date.now() - 15 * 60 * 1000),
    ];

    if (validCodes.some((code) => codesEquivalent(code, botCode))) {
      matched = message;
      break;
    }
  }

  const hasLetters = /[A-Z]/.test(botCode);
  if (!matched) {

    const { data: legacyRow, error: legacyErr } = await admin
      .from("telegram_bots")
      .select("id, kind, chat_id, bot_id, expires_at")
      .eq("bot_code", botCode)
      .maybeSingle();
    if (legacyErr && legacyErr.code !== "PGRST205" && legacyErr.code !== "42P01") throw legacyErr;
    if (!legacyRow) {
      if (hasLetters) {
        return json({
          error: "Código não encontrado ou expirado. Gere um novo */start* no app e envie ao bot do Telegram em até 15 min.",
        }, 404);
      }
      return null;
    }

    kind = legacyRow.kind === "reports" ? "reports" : "expenses";
    if (legacyRow.expires_at && new Date(legacyRow.expires_at).getTime() < Date.now()) {
      await admin.from("telegram_bots").delete().eq("id", legacyRow.id);
      return json({ error: "Código expirado. Gere um novo no Telegram." }, 410);
    }
    matched = {
      chat_id: legacyRow.chat_id,
      raw_update: { _system_bot_id: legacyRow.bot_id },
      legacy_id: legacyRow.id,
    };
  }
  if (requestedKind && requestedKind !== kind) {
    return json({ error: `Esse código é de ${kind === "reports" ? "relatórios" : "despesas"}.` }, 400);
  }

  // Both expenses and reports links live in telegram_links, distinguished by bot_id.
  const rawBotId = matched.raw_update?._system_bot_id ?? null;
  const { data: systemBot } = rawBotId
    ? await admin.from("system_telegram_bots").select("id, bot_username, name").eq("id", rawBotId).maybeSingle()
    : { data: { id: await getActiveSystemBotId(admin, kind as "expenses" | "reports") } };
  const chatId = Number(matched.chat_id);
  const targetBotId = systemBot?.id ?? null;

  if (kind === "reports") {
    const linkPayload = { user_id: userId, chat_id: chatId, bot_id: targetBotId };
    const { error: delErr } = await admin
      .from("telegram_reports_links")
      .delete()
      .or(`chat_id.eq.${chatId},user_id.eq.${userId}`);
    if (delErr && delErr.code !== "42P01" && delErr.code !== "PGRST205") return json({ error: delErr.message }, 500);
    const { error: repInsErr } = await admin.from("telegram_reports_links").insert(linkPayload);
    if (!repInsErr) {
      if (matched.legacy_id) await admin.from("telegram_bots").delete().eq("id", matched.legacy_id);
      return json({ ok: true, kind, chat_id: chatId, message: "Bot vinculado com sucesso." });
    }
    if (repInsErr.code === "42P01" || repInsErr.code === "PGRST205") {
      return json({
        error: "Estrutura de dupla conexão ausente. Restaure as tabelas telegram_reports_links e telegram_reports_link_codes antes de conectar o bot de relatórios.",
      }, 500);
    }
    return json({ error: repInsErr.message }, 500);
  }

  // Remove apenas o link do MESMO bot para este usuário/chat. Se não conseguimos
  // resolver targetBotId, NÃO apagamos nada (para não derrubar outro bot com bot_id nulo).
  if (targetBotId) {
    await admin
      .from("telegram_links")
      .delete()
      .eq("bot_id", targetBotId)
      .or(`chat_id.eq.${chatId},user_id.eq.${userId}`);
  }
  const { error: insErr } = await admin.from("telegram_links").insert({
    user_id: userId,
    chat_id: chatId,
    bot_id: targetBotId,
  });
  if (insErr) return json({ error: insErr.message }, 500);

  if (matched.legacy_id) {
    await admin.from("telegram_bots").delete().eq("id", matched.legacy_id);
  }

  return json({ ok: true, kind, chat_id: chatId, message: "Bot vinculado com sucesso." });
}

async function generateChatLinkCode(chatId: number, kind: string, secret: string, now = Date.now()): Promise<string> {
  const bucket = Math.floor(now / (15 * 60 * 1000));
  const payload = `${kind}:${chatId}:${bucket}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const bytes = Array.from(new Uint8Array(signature.slice(0, 8)));
  const value = bytes.reduce((acc, byte) => acc * 256n + BigInt(byte), 0n);
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let n = value;
  let code = "";
  for (let i = 0; i < 6; i++) {
    code = alphabet[Number(n % BigInt(alphabet.length))] + code;
    n /= BigInt(alphabet.length);
  }
  return code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = getExternalUserClient();
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    const userId = user?.id;
    if (userErr || !userId) return json({ error: "Unauthorized" }, 401);

    let body: any = {};
    let rawBodyText = "";
    try { rawBodyText = await req.text(); body = rawBodyText ? JSON.parse(rawBodyText) : {}; } catch { body = {}; }

    const rawCode = typeof body?.bot_code === "string" ? body.bot_code : "";
    const requestedKind = body?.kind === "reports" || body?.kind === "expenses" ? body.kind : undefined;
    console.log("[link-telegram-bot] received", { userId, requestedKind, rawCodeLen: rawCode.length, rawBodyLen: rawBodyText.length, bodyKeys: Object.keys(body ?? {}) });
    const admin = getExternalAdmin();

    // Flush pending Telegram updates so the recent /start message is persisted.
    await Promise.all([
      fetch(`${SUPABASE_URL}/functions/v1/telegram-poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: "{}",
      }).catch(() => null),
      fetch(`${SUPABASE_URL}/functions/v1/telegram-reports-poll?force=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: "{}",
      }).catch(() => null),
    ]);
    await fetch(`${SUPABASE_URL}/functions/v1/telegram-process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: "{}",
    }).catch(() => null);

    const botCodeResult = await linkByBotCode(admin, userId, rawCode, requestedKind);
    if (botCodeResult) return botCodeResult;


    const code = normalizeTelegramBotCode(rawCode).replace(/[^0-9]/g, "");
    if (!code || code.length !== 6) {
      if (rawCode.trim()) {
        const isAlphanumeric = /[A-Z]/.test(rawCode.toUpperCase());
        return json({
          error: isAlphanumeric
            ? `Código não encontrado ou expirado. Gere um novo */start* no app e envie ao bot. (recebido: "${rawCode.slice(0, 32)}")`
            : `Código numérico inválido. No app, gere um novo código e envie /start CÓDIGO ao bot. (recebido: "${rawCode.slice(0, 32)}")`,
        }, 404);
      }
      return json({
        error: `Código inválido. Gere um código no app e envie /start CÓDIGO ao bot do Telegram. (debug: body vazio recebido — bodyLen=${rawBodyText.length}, keys=[${Object.keys(body ?? {}).join(",")}])`,
      }, 400);
    }

    // Aciona o processamento das mensagens pendentes (caso o webhook ainda não tenha rodado).
    await fetch(`${SUPABASE_URL}/functions/v1/telegram-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch(() => null);

    const reportsBotId = await getReportsBotId(admin);
    const activeExpenseBotId = await getActiveSystemBotId(admin, "expenses");

    // Localiza o código gerado pelo app para o bot de despesas atual.
    let codeQuery = admin
      .from("telegram_link_codes")
      .select("code, user_id, expires_at, bot_id")
      .eq("code", code);
    if (activeExpenseBotId) codeQuery = codeQuery.eq("bot_id", activeExpenseBotId);
    else if (reportsBotId) codeQuery = codeQuery.or(`bot_id.is.null,bot_id.neq.${reportsBotId}`);
    const { data: codeRow } = await codeQuery.maybeSingle();

    if (!codeRow) {
      if (activeExpenseBotId) {
        const { data: existingLink } = await admin
          .from("telegram_links")
          .select("chat_id")
          .eq("user_id", userId)
          .eq("bot_id", activeExpenseBotId)
          .maybeSingle();
        if (existingLink) {
          return json({ ok: true, chat_id: existingLink.chat_id, already_linked: true });
        }
      }
      return json({ error: `Código ${code} não encontrado. Gere um novo no app.` }, 404);
    }
    if (codeRow.user_id !== userId) {
      return json({ error: "Esse código pertence a outro usuário." }, 403);
    }
    if (new Date(codeRow.expires_at).getTime() < Date.now()) {
      await admin.from("telegram_link_codes").delete().eq("code", code);
      return json({ error: "Código expirado. Gere um novo no app." }, 410);
    }

    // Procura uma mensagem recente contendo o código
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: messages } = await admin
      .from("telegram_messages")
      .select("chat_id, text, created_at, raw_update, bot_id")
      .gte("created_at", since)
      .ilike("text", `%${code}%`)
      .order("created_at", { ascending: false })
      .limit(10);

    const message = (messages ?? []).find((m: any) => {
      const messageBotId = m.bot_id ?? m.raw_update?._system_bot_id ?? null;
      if (codeRow.bot_id) return messageBotId === codeRow.bot_id;
      if (activeExpenseBotId) return messageBotId === activeExpenseBotId;
      if (reportsBotId && messageBotId === reportsBotId) return false;
      return true;
    }) ?? null;
    const chatId = message?.chat_id;
    if (!chatId) {
      return json({
        error: "Ainda não recebemos sua mensagem. Envie /start " + code + " ao bot no Telegram e tente de novo.",
      }, 404);
    }

    const rawMessageBotId = (message as any)?.bot_id ?? (message as any)?.raw_update?._system_bot_id ?? null;
    let targetBotId = codeRow.bot_id ?? rawMessageBotId ?? activeExpenseBotId ?? null;
    if (!targetBotId) {
      const { data: activeExpenseBot } = await admin.from("system_telegram_bots")
        .select("id")
        .eq("purpose", "expenses")
        .eq("active", true)
        .order("bot_id", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      targetBotId = (activeExpenseBot as any)?.id ?? null;
    }

    // Remove somente o vínculo do MESMO bot. Se targetBotId for nulo, não apagamos
    // nada para evitar derrubar outros bots conectados.
    if (targetBotId) {
      await admin
        .from("telegram_links")
        .delete()
        .eq("bot_id", targetBotId)
        .or(`chat_id.eq.${chatId},user_id.eq.${userId}`);
    }

    const { error: insErr } = await admin
      .from("telegram_links")
      .insert({ user_id: userId, chat_id: chatId, bot_id: targetBotId });
    if (insErr) return json({ error: insErr.message }, 500);

    await admin.from("telegram_link_codes").delete().eq("code", code);

    return json({ ok: true, chat_id: chatId, message: "Bot vinculado com sucesso." });
  } catch (e: any) {
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
});
