// Shared helpers for the GLOBAL "reports" Telegram bot.
// Reports prefer dedicated `telegram_reports_links/codes` so they never compete
// with expense links. Legacy fallback uses `telegram_links` filtered by bot_id.

let _cachedReportsBotId: { id: string | null; ts: number } | null = null;

/** Returns the active GLOBAL reports bot id (cached 5 min). */
export async function getReportsBotId(supabase: any): Promise<string | null> {
  if (_cachedReportsBotId && Date.now() - _cachedReportsBotId.ts < 5 * 60 * 1000) {
    return _cachedReportsBotId.id;
  }
  const { data } = await supabase
    .from("system_telegram_bots")
    .select("id")
    .eq("purpose", "reports")
    .eq("active", true)
    .order("bot_id", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const id = (data as any)?.id ?? null;
  _cachedReportsBotId = { id, ts: Date.now() };
  return id;
}

/** Returns { chat_id } for the user's reports-bot link, or null. */
export async function getReportsLinkForUser(
  supabase: any,
  userId: string,
): Promise<{ chat_id: number } | null> {
  const botId = await getReportsBotId(supabase);
  if (!botId) return null;
  const { data: dedicated, error: dedicatedErr } = await supabase
    .from("telegram_reports_links")
    .select("chat_id")
    .eq("user_id", userId)
    .eq("bot_id", botId)
    .maybeSingle();
  if (dedicated) return { chat_id: Number((dedicated as any).chat_id) };
  if (dedicatedErr && dedicatedErr.code !== "42P01" && dedicatedErr.code !== "PGRST205") return null;

  const { data } = await supabase
    .from("telegram_links")
    .select("chat_id")
    .eq("user_id", userId)
    .eq("bot_id", botId)
    .maybeSingle();
  if (!data) return null;
  return { chat_id: Number((data as any).chat_id) };
}

export interface ReportsBot {
  id: string;
  token: string;
  name: string;
  bot_username: string | null;
}

/**
 * Returns the active GLOBAL "reports" bot.
 * The same bot is shared by every account in the system.
 */
export async function getReportsBot(supabase: any): Promise<ReportsBot | null> {
  const { data, error } = await supabase
    .from("system_telegram_bots")
    .select("id, token, name, bot_username, purpose")
    .eq("active", true)
    .eq("purpose", "reports")
    .order("bot_id", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getReportsBot] query error", error);
    return null;
  }
  if (!data?.length) return null;

  const chosen = (data as any[])[0];
  if (!chosen?.token) return null;
  return {
    id: chosen.id,
    token: chosen.token,
    name: chosen.name,
    bot_username: chosen.bot_username,
  };
}

/**
 * Backwards-compatible alias. The userId argument is ignored — the bot is global.
 */
export async function getReportsBotForUser(
  supabase: any,
  _userId: string,
): Promise<ReportsBot | null> {
  return getReportsBot(supabase);
}

/**
 * Sends a Telegram message via the raw Bot API, with a Markdown-fallback retry
 * on parse errors and clear logging.
 */
export async function tgDirectSend(
  token: string,
  chatId: number | string,
  text: string,
  opts?: { parse_mode?: "Markdown" | "HTML" },
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const parse_mode = opts?.parse_mode ?? "Markdown";

  const send = async (payload: Record<string, unknown>) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  try {
    let r = await send({ chat_id: chatId, text, parse_mode });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error(`[reports-bot] sendMessage failed ${r.status}`, body);
      if (r.status === 400) {
        r = await send({ chat_id: chatId, text });
        if (!r.ok) {
          const body2 = await r.text().catch(() => "");
          console.error(`[reports-bot] plain retry failed ${r.status}`, body2);
          return false;
        }
        return true;
      }
      return false;
    }
    return true;
  } catch (e) {
    console.error("[reports-bot] sendMessage exception", e);
    return false;
  }
}

/**
 * Resolves the reports bot that the given chat was linked through (via /start).
 * Only telegram_reports_links is considered here; reports must never fall back
 * to the expenses link, even if both links share the same chat_id.
 */
export async function getBotForChat(
  supabase: any,
  userId: string,
  chatId: number | string,
): Promise<ReportsBot | null> {
  const numericChat = Number(chatId);
  const reportsBotId = await getReportsBotId(supabase);
  if (!reportsBotId) return null;

  // Prefer the reports link for this user+chat from the dedicated reports table.
  const { data: dedicatedLink, error: dedicatedErr } = await supabase
    .from("telegram_reports_links")
    .select("bot_id")
    .eq("user_id", userId)
    .eq("chat_id", numericChat)
    .eq("bot_id", reportsBotId)
    .maybeSingle();

  let botId: string | null = (dedicatedLink as any)?.bot_id ?? null;
  if (!botId && (!dedicatedErr || dedicatedErr.code === "42P01" || dedicatedErr.code === "PGRST205")) {
    const { data: legacyLink } = await supabase
      .from("telegram_links")
      .select("bot_id")
      .eq("user_id", userId)
      .eq("chat_id", numericChat)
      .eq("bot_id", reportsBotId)
      .maybeSingle();
    botId = (legacyLink as any)?.bot_id ?? null;
  }

  if (botId) {
    const { data: bot } = await supabase
      .from("system_telegram_bots")
      .select("id, token, name, bot_username, active, purpose")
      .eq("id", botId)
      .maybeSingle();
    if (bot && (bot as any).active && (bot as any).purpose === "reports" && (bot as any).token) {
      return {
        id: (bot as any).id,
        token: (bot as any).token,
        name: (bot as any).name,
        bot_username: (bot as any).bot_username,
      };
    }
  }
  return null;
}

/**
 * Combined helper: routes the message through the SAME bot the user linked
 * with /start (resolved via chat_id). Falls back to the default global reports
 * bot only if the link has no bot_id (legacy rows).
 */
export async function sendReportsMessage(
  supabase: any,
  userId: string,
  chatId: number | string,
  text: string,
  opts?: { parse_mode?: "Markdown" | "HTML" },
): Promise<{ sent: boolean; reason?: string }> {
  let bot = await getBotForChat(supabase, userId, chatId);
  if (!bot) {
    bot = await getReportsBot(supabase);
    if (bot) {
      console.warn(
        `[reports-bot] No bot_id on link for user=${userId} chat=${chatId}; ` +
          `falling back to default global reports bot=${bot.id}`,
      );
    }
  }
  if (!bot) {
    console.warn(
      "[reports-bot] No bot resolved for chat and no GLOBAL reports bot configured. " +
        "Ask the user to /start again, or an admin to register a bot.",
    );
    return { sent: false, reason: "no_reports_bot_configured" };
  }
  const ok = await tgDirectSend(bot.token, chatId, text, opts);
  return ok ? { sent: true } : { sent: false, reason: "telegram_send_failed" };
}

/**
 * Sends a PNG photo via the raw Bot API (multipart/form-data).
 */
export async function tgDirectSendPhoto(
  token: string,
  chatId: number | string,
  pngBytes: Uint8Array,
  caption: string,
): Promise<boolean> {
  try {
    const cleanCaption = caption.trim();
    const fd = new FormData();
    fd.append("chat_id", String(chatId));
    if (cleanCaption) {
      fd.append("caption", cleanCaption);
      fd.append("parse_mode", "Markdown");
    }
    fd.append("photo", new Blob([pngBytes], { type: "image/png" }), "report.png");

    let r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: fd,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error(`[reports-bot] sendPhoto failed ${r.status}`, body);
      // retry without parse_mode (caption may have invalid Markdown)
      const fd2 = new FormData();
      fd2.append("chat_id", String(chatId));
      if (cleanCaption) fd2.append("caption", cleanCaption);
      fd2.append("photo", new Blob([pngBytes], { type: "image/png" }), "report.png");
      r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        body: fd2,
      });
      if (!r.ok) {
        const body2 = await r.text().catch(() => "");
        console.error(`[reports-bot] sendPhoto plain retry failed ${r.status}`, body2);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error("[reports-bot] sendPhoto exception", e);
    return false;
  }
}

/**
 * Combined helper: sends a PNG photo + caption via the same bot the user linked
 * with /start (resolved via chat_id). Falls back to the GLOBAL reports bot when
 * the link has no bot_id.
 */
export async function sendReportsPhoto(
  supabase: any,
  userId: string,
  chatId: number | string,
  pngBytes: Uint8Array,
  caption: string,
): Promise<{ sent: boolean; reason?: string }> {
  let bot = await getBotForChat(supabase, userId, chatId);
  if (!bot) bot = await getReportsBot(supabase);
  if (!bot) {
    return { sent: false, reason: "no_reports_bot_configured" };
  }
  const ok = await tgDirectSendPhoto(bot.token, chatId, pngBytes, caption);
  return ok ? { sent: true } : { sent: false, reason: "telegram_send_failed" };
}

/**
 * Renders the given lines into an SVG report, converts to PNG, and sends as
 * a Telegram photo via the reports bot. Falls back to a plain text message if
 * image generation or sendPhoto fails. `lines` is the full markdown-style
 * report (used both to render and as fallback text).
 */
export type ImageReportKey =
  | "billing"
  | "accumulated_delinquency"
  | "daily_planning"
  | "incomes_expenses"
  | "manager_weekly"
  | "personal_insights"
  | "daily_summary"
  | "weekly_summary"
  | "monthly_summary";

export interface ImageDeliveryPrefs {
  reports: Partial<Record<ImageReportKey, boolean>>;
  includeText: boolean;
}

/**
 * Reads the per-user image delivery prefs (table: telegram_image_delivery_prefs).
 * Defaults: every report sends as image, includeText = true.
 */
export async function getImageDeliveryPrefs(
  supabase: any,
  userId: string,
): Promise<ImageDeliveryPrefs> {
  try {
    const { data } = await supabase
      .from("telegram_image_delivery_prefs")
      .select("reports, include_text")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      reports: (data?.reports as any) ?? {},
      includeText: data?.include_text !== false,
    };
  } catch (e) {
    console.error("[getImageDeliveryPrefs] error", e);
    return { reports: {}, includeText: true };
  }
}

/**
 * Resolves whether the recipient `userId` is allowed (by the admin/owner) to
 * receive reports as image. The admin maintains a list of allowed users in
 * their own row of telegram_image_delivery_prefs.allowed_user_ids.
 *
 * - If the owner's list is null/empty → every user is allowed (back-compat).
 * - Otherwise → only users in the list receive images; others fall back to text.
 */
export async function isImageDeliveryAllowedForUser(
  supabase: any,
  userId: string,
): Promise<boolean> {
  try {
    const { data: ownerRow } = await supabase.rpc("get_data_owner_id", {
      _user_id: userId,
    });
    const ownerId: string = (ownerRow as any) ?? userId;
    const { data } = await supabase
      .from("telegram_image_delivery_prefs")
      .select("allowed_user_ids")
      .eq("user_id", ownerId)
      .maybeSingle();
    const list: string[] | null = (data?.allowed_user_ids as any) ?? null;
    if (!Array.isArray(list) || list.length === 0) return true;
    return list.includes(userId);
  } catch (e) {
    console.error("[isImageDeliveryAllowedForUser] error", e);
    return true;
  }
}

export async function sendReportsAsImage(
  supabase: any,
  userId: string,
  chatId: number | string,
  lines: string[],
  brand: { name: string; primaryHsl?: string | null },
  opts?: { title?: string; subtitle?: string; fallbackText?: string; reportKey?: ImageReportKey },
): Promise<{ sent: boolean; reason?: string; mode?: "image" | "text" }> {
  const tag = `[reports-bot][${opts?.reportKey ?? "unknown"}][user=${userId}]`;
  try {
    const prefs = await getImageDeliveryPrefs(supabase, userId);
    const key = opts?.reportKey;
    // Per-report toggle: if explicitly disabled, send as plain text.
    if (key && prefs.reports[key] === false) {
      console.log(`${tag} mode=text reason=report_toggle_disabled`);
      const text = opts?.fallbackText ?? lines.join("\n");
      const r = await sendReportsMessage(supabase, userId, chatId, text);
      return { sent: r.sent, reason: r.reason, mode: "text" };
    }
    // Admin-controlled allow-list: if recipient not allowed, send as text.
    const allowed = await isImageDeliveryAllowedForUser(supabase, userId);
    if (!allowed) {
      console.log(`${tag} mode=text reason=not_in_allowed_user_ids`);
      const text = opts?.fallbackText ?? lines.join("\n");
      const r = await sendReportsMessage(supabase, userId, chatId, text);
      return { sent: r.sent, reason: r.reason, mode: "text" };
    }

    let png: Uint8Array;
    try {
      const { buildTextReportSVG, svgToPng } = await import("./renderReportImage.ts");
      const svg = buildTextReportSVG(lines, brand, { title: opts?.title, subtitle: opts?.subtitle });
      png = await svgToPng(svg);
    } catch (renderErr) {
      console.error(`${tag} mode=text reason=render_failed`, renderErr);
      const text = opts?.fallbackText ?? lines.join("\n");
      const r = await sendReportsMessage(supabase, userId, chatId, text);
      return { sent: r.sent, reason: `render_failed: ${(renderErr as Error).message}`, mode: "text" };
    }

    const { buildCaptionFromLines } = await import("./renderReportImage.ts");
    const caption = prefs.includeText ? buildCaptionFromLines(lines, brand) : "";
    const res = await sendReportsPhoto(supabase, userId, chatId, png, caption);
    if (res.sent) {
      console.log(`${tag} mode=image sent=ok`);
      return { sent: true, mode: "image" };
    }
    console.error(`${tag} mode=text reason=sendPhoto_failed (${res.reason})`);
    const text = opts?.fallbackText ?? lines.join("\n");
    const r2 = await sendReportsMessage(supabase, userId, chatId, text);
    return { sent: r2.sent, reason: r2.reason, mode: "text" };
  } catch (e) {
    console.error(`${tag} mode=text reason=unexpected_exception`, e);
    const text = opts?.fallbackText ?? lines.join("\n");
    const r = await sendReportsMessage(supabase, userId, chatId, text);
    return { sent: r.sent, reason: r.reason, mode: "text" };
  }
}
