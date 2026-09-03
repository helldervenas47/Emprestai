import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getExternalAdmin, getExternalSupabaseUrl, getExternalAnonKey } from "../_shared/external-supabase.ts";

import { isTimeDueToday } from "../_shared/schedule.ts";
import {
  buildMonthlySummarySVG,
  svgToPng,
  tgSendPhoto,
  type BrandInfo,
} from "../_shared/renderReportImage.ts";
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
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
    day: Number(get("day")),
  };
}

function monthBounds(yyyymm: string): { start: string; end: string; daysInMonth: number } {
  const [y, m] = yyyymm.split("-").map(Number);
  const start = `${yyyymm}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${yyyymm}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, daysInMonth: lastDay };
}

function prevMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthNamePt(yyyymm: string): string {
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [y, m] = yyyymm.split("-").map(Number);
  return `${names[m - 1]}/${String(y).slice(2)}`;
}

function variation(curr: number, prev: number): string {
  if (prev === 0) return curr === 0 ? "0%" : "novo";
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct > 0 ? "+" : "";
  const arrow = pct > 0 ? "🔺" : pct < 0 ? "🔻" : "▪️";
  return `${arrow} ${sign}${pct.toFixed(0)}%`;
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

async function buildAndSendMonthly(
  admin: any,
  userId: string,
  today: string,
  brand: BrandInfo,
  format: "text" | "image" = "text",
): Promise<boolean> {
  const link = await getReportsLinkForUser(admin, userId);
  if (!link) return false;

  const currMonth = today.slice(0, 7);
  const prev = prevMonth(currMonth);
  const curr = monthBounds(currMonth);
  const prevB = monthBounds(prev);

  const [{ data: currExp }, { data: prevExp }, { data: budgets }] = await Promise.all([
    admin.from("expenses")
      .select("amount, category, paid_date")
      .eq("user_id", userId).eq("scope", "personal").eq("paid", true)
      .gte("paid_date", curr.start).lte("paid_date", curr.end),
    admin.from("expenses")
      .select("amount, category")
      .eq("user_id", userId).eq("scope", "personal").eq("paid", true)
      .gte("paid_date", prevB.start).lte("paid_date", prevB.end),
    admin.from("personal_budgets")
      .select("category, amount").eq("user_id", userId).eq("month", currMonth),
  ]);

  const sumBy = (rows: any[] | null) => {
    const total = (rows ?? []).reduce((s, e: any) => s + Number(e.amount || 0), 0);
    const byCat = new Map<string, number>();
    for (const e of rows ?? []) {
      const cat = (e as any).category || "Outros";
      byCat.set(cat, (byCat.get(cat) ?? 0) + Number((e as any).amount || 0));
    }
    return { total, byCat };
  };

  const currS = sumBy(currExp as any[]);
  const prevS = sumBy(prevExp as any[]);

  // days elapsed in current month based on today's date
  const todayDay = Number(today.slice(8, 10));
  const isCurrentMonth = today.slice(0, 7) === currMonth;
  const daysElapsed = isCurrentMonth ? todayDay : curr.daysInMonth;
  const dailyAvg = currS.total / Math.max(1, daysElapsed);

  // Top categories
  const allCats = new Set<string>([...currS.byCat.keys(), ...prevS.byCat.keys()]);
  const catRows = [...allCats].map((c) => ({
    cat: c,
    curr: currS.byCat.get(c) ?? 0,
    prev: prevS.byCat.get(c) ?? 0,
  })).sort((a, b) => a.cat.localeCompare(b.cat, "pt-BR"));

  // Image format
  if (format === "image") {
    try {
      const svg = buildMonthlySummarySVG(
        {
          monthLabel: monthNamePt(currMonth),
          total: currS.total,
          prevTotal: prevS.total,
          dailyAvg,
          daysElapsed,
          topCategories: catRows.map((r) => ({ name: r.cat, curr: r.curr, prev: r.prev })),
          budgets: [...(budgets ?? [])]
            .sort((a: any, b: any) => a.category.localeCompare(b.category, "pt-BR"))
            .map((b: any) => ({
              name: b.category,
              spent: currS.byCat.get(b.category) ?? 0,
              budget: Number(b.amount || 0),
            })),
        },
        brand,
      );
      const png = await svgToPng(svg);
      const monthlyPrefs = await getImageDeliveryPrefs(admin, userId);
      const caption = monthlyPrefs.includeText
        ? `📆 *${brand.name} — Resumo mensal* — ${monthNamePt(currMonth)}\n💸 Total: *${fmtBRL(currS.total)}*  ${variation(currS.total, prevS.total)}`
        : "";
      const photoRes = await sendReportsPhoto(admin, userId, Number((link as any).chat_id), png, caption);
      if (!photoRes.sent) throw new Error(photoRes.reason ?? "send_photo_failed");
      return true;
    } catch (e) {
      console.error("image render failed, falling back to text", e);
      // fallthrough to text
    }
  }

  // Text format (default / fallback)
  const lines: string[] = [];
  lines.push(`📆 *${brand.name} — Resumo mensal* — ${monthNamePt(currMonth)}`);
  lines.push("");
  lines.push(`💸 Total: *${fmtBRL(currS.total)}*  ${variation(currS.total, prevS.total)}`);
  lines.push(`   Mês passado: ${fmtBRL(prevS.total)}`);
  lines.push(`📈 Média diária: *${fmtBRL(dailyAvg)}* (${daysElapsed} ${daysElapsed === 1 ? "dia" : "dias"})`);

  if (catRows.length > 0) {
    lines.push("");
    lines.push("📂 *Top categorias:*");
    for (const r of catRows) {
      lines.push(`   • ${r.cat}: ${fmtBRL(r.curr)} ${variation(r.curr, r.prev)}`);
    }
  }

  if ((budgets ?? []).length > 0) {
    lines.push("");
    lines.push("🎯 *Orçamentos:*");
    const sorted = [...(budgets ?? [])].sort((a: any, b: any) => a.category.localeCompare(b.category, "pt-BR"));
    for (const b of sorted) {
      const budget = Number((b as any).amount || 0);
      const spent = currS.byCat.get((b as any).category) ?? 0;
      const left = budget - spent;
      const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
      const icon = left < 0 ? "🔴" : pct >= 80 ? "🟡" : "🟢";
      lines.push(`${icon} ${(b as any).category}: ${fmtBRL(spent)} / ${fmtBRL(budget)} (${pct}%)`);
    }
  }

  const textRes = await sendReportsMessage(admin, userId, Number((link as any).chat_id), lines.join("\n"));
  if (!textRes.sent) throw new Error(textRes.reason ?? "send_message_failed");
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = getExternalAdmin();

  // Fetch brand once for this invocation
  const brand: BrandInfo = { name: "EmprestAI", primaryHsl: null };
  try {
    const { data: bRow } = await admin.from("app_branding").select("brand_name").limit(1).maybeSingle();
    if ((bRow as any)?.brand_name) brand.name = (bRow as any).brand_name;
  } catch (_) { /* ignore */ }

  const url = new URL(req.url);
  const forceUserId = url.searchParams.get("user_id");
  const { date: today, hhmm, day } = nowInTZ();
  const currMonth = today.slice(0, 7);

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

    // Read user format preference
    const { data: pref } = await admin
      .from("telegram_summary_prefs")
      .select("monthly_format")
      .eq("user_id", forceUserId)
      .maybeSingle();
    const format = ((pref as any)?.monthly_format === "image" ? "image" : "text") as "text" | "image";

    const ok = await buildAndSendMonthly(admin, forceUserId, today, brand, format);
    return new Response(JSON.stringify({ ok: true, sent: ok ? 1 : 0, format }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Cron mode
  const [hh, mm] = hhmm.split(":").map(Number);
  const nowMin = hh * 60 + mm;

  const { data: prefs, error } = await admin
    .from("telegram_summary_prefs")
    .select("user_id, monthly_enabled, monthly_send_time, monthly_send_day, monthly_format, last_monthly_sent_month")
    .eq("monthly_enabled", true);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  // Compute last day of current month for "day=31" rollover when month is shorter
  const lastDayOfMonth = monthBounds(currMonth).daysInMonth;

  let sent = 0;
  for (const pref of prefs ?? []) {
    try {
      const targetDay = Math.min(Number((pref as any).monthly_send_day), lastDayOfMonth);
      if (day !== targetDay) continue;

      if (!isTimeDueToday((pref as any).monthly_send_time as string, nowMin)) continue;
      if ((pref as any).last_monthly_sent_month === currMonth) continue;

      const format = ((pref as any).monthly_format === "image" ? "image" : "text") as "text" | "image";
      const ok = await buildAndSendMonthly(admin, (pref as any).user_id, today, brand, format);
      if (ok) {
        await admin.from("telegram_summary_prefs")
          .update({ last_monthly_sent_month: currMonth })
          .eq("user_id", (pref as any).user_id);
        sent++;
      }
    } catch (e) {
      console.error("monthly summary error for", (pref as any).user_id, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: prefs?.length ?? 0, hhmm, day }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
