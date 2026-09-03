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

function todayInTZ(tz = "America/Sao_Paulo") {
  // returns { hhmm: "HH:MM", date: "YYYY-MM-DD" } in given TZ
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
  };
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = getExternalAdmin();

  // Fetch brand name once for this invocation
  let brandName = "EmprestAI";
  try {
    const { data: bRow } = await admin.from("app_branding").select("brand_name").limit(1).maybeSingle();
    if (bRow?.brand_name) brandName = bRow.brand_name;
  } catch (_) { /* ignore */ }

  const url = new URL(req.url);
  let forceUserId = url.searchParams.get("user_id");

  // If forcing for a specific user, require that user to be authenticated as themselves
  if (forceUserId) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Auth required" }), { status: 401, headers: corsHeaders });
    }
    const userClient = createClient(getExternalSupabaseUrl(), getExternalAnonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }
    if (user.id !== forceUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }
  }
  const { date: today, hhmm } = todayInTZ();
  const [hh, mm] = hhmm.split(":").map(Number);
  const nowMin = hh * 60 + mm;

  // Load enabled prefs
  let query = admin.from("telegram_summary_prefs").select("user_id, enabled, send_time, last_sent_date");
  if (forceUserId) query = query.eq("user_id", forceUserId);
  else query = query.eq("enabled", true);

  const { data: prefs, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  let sent = 0;

  for (const pref of prefs ?? []) {
    try {
      if (!forceUserId) {
        if (!isTimeDueToday(pref.send_time as string, nowMin)) continue;
        if (pref.last_sent_date === today) continue;
      }

      // Resolve chat
      const link = await getReportsLinkForUser(admin, pref.user_id);
      if (!link) continue;

      // Today's personal expenses paid today
      const { data: expenses } = await admin.from("expenses")
        .select("amount, category")
        .eq("user_id", pref.user_id)
        .eq("scope", "personal")
        .eq("paid", true)
        .eq("paid_date", today);

      const totalToday = (expenses ?? []).reduce((s, e: any) => s + Number(e.amount || 0), 0);

      // Month total per category
      const monthPrefix = today.slice(0, 7); // YYYY-MM
      const { data: monthExpenses } = await admin.from("expenses")
        .select("amount, category, paid_date")
        .eq("user_id", pref.user_id)
        .eq("scope", "personal")
        .eq("paid", true)
        .gte("paid_date", `${monthPrefix}-01`)
        .lte("paid_date", `${monthPrefix}-31`);

      const spentByCategory = new Map<string, number>();
      let monthTotal = 0;
      for (const e of monthExpenses ?? []) {
        const cat = (e as any).category || "Outros";
        const amt = Number((e as any).amount || 0);
        spentByCategory.set(cat, (spentByCategory.get(cat) ?? 0) + amt);
        monthTotal += amt;
      }

      // Previous month same-period (day 1 .. same day-of-month) comparison
      const [yStr, mStr, dStr] = today.split("-");
      const y = Number(yStr), m = Number(mStr), d = Number(dStr);
      const prevDate = new Date(Date.UTC(y, m - 2, 1));
      const prevYear = prevDate.getUTCFullYear();
      const prevMonth = prevDate.getUTCMonth() + 1; // 1-12
      const lastDayPrev = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
      const prevDay = Math.min(d, lastDayPrev);
      const prevPrefix = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
      const prevEnd = `${prevPrefix}-${String(prevDay).padStart(2, "0")}`;

      const { data: prevExpenses } = await admin.from("expenses")
        .select("amount")
        .eq("user_id", pref.user_id)
        .eq("scope", "personal")
        .eq("paid", true)
        .gte("paid_date", `${prevPrefix}-01`)
        .lte("paid_date", prevEnd);

      const prevTotal = (prevExpenses ?? []).reduce((s, e: any) => s + Number(e.amount || 0), 0);

      // Budgets — filter by current month to avoid duplicates across months
      const { data: budgets } = await admin.from("personal_budgets")
        .select("category, amount")
        .eq("user_id", pref.user_id)
        .eq("month", monthPrefix);

      const lines: string[] = [];
      lines.push(`📊 *${brandName} — Resumo do dia* — ${today.split("-").reverse().join("/")}`);
      lines.push("");
      lines.push(`💸 Total gasto hoje: *${fmtBRL(totalToday)}*`);
      lines.push(`   (${(expenses ?? []).length} ${(expenses ?? []).length === 1 ? "despesa" : "despesas"})`);

      // Month-to-date + comparison with previous month same period
      lines.push("");
      lines.push(`📅 Acumulado do mês: *${fmtBRL(monthTotal)}*`);
      if (prevTotal > 0) {
        const diff = monthTotal - prevTotal;
        const pctVar = (diff / prevTotal) * 100;
        const arrow = diff > 0 ? "🔺" : diff < 0 ? "🔻" : "➖";
        const sign = diff > 0 ? "+" : "";
        lines.push(`${arrow} ${sign}${pctVar.toFixed(1)}% vs mês anterior (${fmtBRL(prevTotal)} até dia ${String(prevDay).padStart(2, "0")})`);
      } else if (monthTotal > 0) {
        lines.push(`_Sem gastos no mês anterior para comparar._`);
      }

      if ((budgets ?? []).length > 0) {
        lines.push("");
        lines.push("📂 *Orçamentos do mês:*");
        const sorted = [...(budgets ?? [])].sort((a: any, b: any) => a.category.localeCompare(b.category, "pt-BR"));
        for (const b of sorted) {
          const budget = Number((b as any).amount || 0);
          const spent = spentByCategory.get((b as any).category) ?? 0;
          const left = budget - spent;
          const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
          const icon = left < 0 ? "🔴" : pct >= 80 ? "🟡" : "🟢";
          lines.push(`${icon} ${(b as any).category}: ${fmtBRL(left)} ${left < 0 ? "acima" : "restante"} (${pct}%)`);
        }
      } else {
        lines.push("");
        lines.push("_Sem orçamentos configurados._");
      }

      // Try image first; fall back to text on any failure.
      try {
        const dailyPrefs = await getImageDeliveryPrefs(admin, pref.user_id);
        const svg = buildTextReportSVG(lines, { name: brandName });
        const png = await svgToPng(svg);
        const caption = dailyPrefs.includeText ? buildCaptionFromLines(lines, { name: brandName }) : "";
        const photoRes = await sendReportsPhoto(admin, pref.user_id, Number(link.chat_id), png, caption);
        if (!photoRes.sent) throw new Error(photoRes.reason ?? "send_photo_failed");
      } catch (e) {
        console.error("daily-summary image render failed, falling back to text", e);
        const textRes = await sendReportsMessage(admin, pref.user_id, Number(link.chat_id), lines.join("\n"));
        if (!textRes.sent) throw new Error(textRes.reason ?? "send_message_failed");
      }

      if (!forceUserId) {
        await admin.from("telegram_summary_prefs")
          .update({ last_sent_date: today })
          .eq("user_id", pref.user_id);
      }

      sent++;
    } catch (e) {
      console.error("summary error for", pref.user_id, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: prefs?.length ?? 0, hhmm }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
