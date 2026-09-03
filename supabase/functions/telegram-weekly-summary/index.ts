import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getExternalAdmin, getExternalSupabaseUrl, getExternalAnonKey } from "../_shared/external-supabase.ts";

import { isTimeDueToday } from "../_shared/schedule.ts";
import { buildTextReportSVG, svgToPng, tgSendPhoto, buildCaptionFromLines } from "../_shared/renderReportImage.ts";
import { getImageDeliveryPrefs, sendReportsMessage, sendReportsPhoto, getReportsLinkForUser } from "../_shared/reports-bot.ts";

const GATEWAY_URL = "https://api.telegram.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function nowInTZ(tz = "America/Sao_Paulo") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // weekday short en: Sun, Mon, Tue, Wed, Thu, Fri, Sat
  const wkMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
    weekday: wkMap[get("weekday")] ?? 0,
  };
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDateBR(iso: string) {
  return iso.split("-").reverse().join("/");
}

async function tgSend(chatId: number, text: string, telegramKey: string) {
  const r = await fetch(`${GATEWAY_URL}/bot${telegramKey}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  if (!r.ok) console.error("sendMessage failed", r.status, await r.text());
}

async function buildAndSendWeekly(
  admin: any,
  userId: string,
  today: string,
  brandName: string,
): Promise<boolean> {
  const link = await getReportsLinkForUser(admin, userId);
  if (!link) return false;

  const weekStart = addDaysISO(today, -6);

  const { data: expenses } = await admin.from("expenses")
    .select("amount, category, paid_date")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .eq("paid", true)
    .gte("paid_date", weekStart)
    .lte("paid_date", today);

  const totalWeek = (expenses ?? []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  const byDay = new Map<string, number>();
  for (let i = 0; i < 7; i++) byDay.set(addDaysISO(weekStart, i), 0);
  for (const e of expenses ?? []) {
    const d = (e as any).paid_date as string;
    if (byDay.has(d)) byDay.set(d, (byDay.get(d) ?? 0) + Number((e as any).amount || 0));
  }

  const byCategory = new Map<string, number>();
  for (const e of expenses ?? []) {
    const cat = (e as any).category || "Outros";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number((e as any).amount || 0));
  }

  const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const lines: string[] = [];
  lines.push(`📅 *${brandName} — Resumo semanal* — ${fmtDateBR(weekStart)} a ${fmtDateBR(today)}`);
  lines.push("");
  lines.push(`💸 Total da semana: *${fmtBRL(totalWeek)}*`);
  lines.push(`   (${(expenses ?? []).length} ${(expenses ?? []).length === 1 ? "despesa" : "despesas"})`);

  lines.push("");
  lines.push("🗓️ *Por dia:*");
  for (const [iso, amt] of byDay) {
    const d = new Date(`${iso}T12:00:00Z`);
    const dayName = dayNames[d.getUTCDay()];
    lines.push(`   ${dayName} ${iso.slice(8, 10)}/${iso.slice(5, 7)}: ${fmtBRL(amt)}`);
  }

  if (byCategory.size > 0) {
    lines.push("");
    lines.push("📂 *Por categoria:*");
    const sorted = [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
    for (const [cat, amt] of sorted) {
      const pct = totalWeek > 0 ? Math.round((amt / totalWeek) * 100) : 0;
      lines.push(`   • ${cat}: ${fmtBRL(amt)} (${pct}%)`);
    }
  }

  try {
    const prefs = await getImageDeliveryPrefs(admin, userId);
    const svg = buildTextReportSVG(lines, { name: brandName });
    const png = await svgToPng(svg);
    const caption = prefs.includeText ? buildCaptionFromLines(lines, { name: brandName }) : "";
    const photoRes = await sendReportsPhoto(admin, userId, Number(link.chat_id), png, caption);
    if (!photoRes.sent) throw new Error(photoRes.reason ?? "send_photo_failed");
  } catch (e) {
    console.error("weekly-summary image render failed, falling back to text", e);
    const textRes = await sendReportsMessage(admin, userId, Number(link.chat_id), lines.join("\n"));
    if (!textRes.sent) throw new Error(textRes.reason ?? "send_message_failed");
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = getExternalAdmin();

  // Fetch brand name once for this invocation
  let brandName = "EmprestAI";
  try {
    const { data: bRow } = await admin.from("app_branding").select("brand_name").limit(1).maybeSingle();
    if ((bRow as any)?.brand_name) brandName = (bRow as any).brand_name;
  } catch (_) { /* ignore */ }

  const url = new URL(req.url);
  const forceUserId = url.searchParams.get("user_id");
  const { date: today, hhmm, weekday } = nowInTZ();

  // Manual mode (force user_id) — auth required
  if (forceUserId) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Auth required" }), { status: 401, headers: corsHeaders });

    const userClient = createClient(getExternalSupabaseUrl(), getExternalAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    if (user.id !== forceUserId) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    const ok = await buildAndSendWeekly(admin, forceUserId, today, brandName);
    return new Response(JSON.stringify({ ok: true, sent: ok ? 1 : 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Cron mode — iterate enabled prefs and check weekday + time window
  const [hh, mm] = hhmm.split(":").map(Number);
  const nowMin = hh * 60 + mm;

  const { data: prefs, error } = await admin
    .from("telegram_summary_prefs")
    .select("user_id, weekly_enabled, weekly_send_time, weekly_send_weekday, last_weekly_sent_date")
    .eq("weekly_enabled", true);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let sent = 0;
  for (const pref of prefs ?? []) {
    try {
      if ((pref as any).weekly_send_weekday !== weekday) continue;
      if (!isTimeDueToday((pref as any).weekly_send_time as string, nowMin)) continue;
      if ((pref as any).last_weekly_sent_date === today) continue;

      const ok = await buildAndSendWeekly(admin, (pref as any).user_id, today, brandName);
      if (ok) {
        await admin.from("telegram_summary_prefs")
          .update({ last_weekly_sent_date: today })
          .eq("user_id", (pref as any).user_id);
        sent++;
      }
    } catch (e) {
      console.error("weekly summary error for", (pref as any).user_id, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: prefs?.length ?? 0, hhmm, weekday }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
