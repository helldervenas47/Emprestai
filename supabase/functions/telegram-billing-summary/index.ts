import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getExternalAdmin, getExternalSupabaseUrl, getExternalAnonKey } from "../_shared/external-supabase.ts";

import { dueSlotKeys } from "../_shared/schedule.ts";

const GATEWAY_URL = "https://api.telegram.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function todayInTZ(tz = "America/Sao_Paulo") {
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

function formatDateBR(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function getDayOfWeek(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"][d.getDay()];
}

function getPaymentType(t: string) {
  return ({ monthly:"Mensal", biweekly:"Quinzenal", weekly:"Semanal", daily:"Diário" } as Record<string,string>)[t] || t;
}

function escapeMd(s: string) {
  // Escape Telegram Markdown (legacy) special chars to avoid parse errors
  return s.replace(/([_*`\[\]])/g, "\\$1");
}

function calculateInstallment(principal: number, rate: number, installments: number) {
  const total = principal * (1 + rate / 100);
  return installments > 0 ? total / installments : total;
}

function getDaysOverdue(dueDate: string, today: string) {
  const due = new Date(dueDate + "T00:00:00Z").getTime();
  const tdy = new Date(today + "T00:00:00Z").getTime();
  return Math.max(0, Math.floor((tdy - due) / 86400000));
}

function calcLateFees(loan: any, baseAmount: number, today: string) {
  const days = getDaysOverdue(loan.due_date, today);
  if (days === 0) return 0;
  let lateInterest = 0;
  if (loan.late_interest_value && loan.late_interest_value > 0) {
    if (loan.late_interest_type === "fixed") lateInterest = loan.late_interest_value * days;
    else lateInterest = baseAmount * (loan.late_interest_value / 100) * days;
  }
  const penalty = (loan.penalty_value && loan.penalty_value > 0) ? loan.penalty_value : 0;
  return lateInterest + penalty;
}

function getInstallmentAmount(loan: any, schedules: any[]) {
  if (Number(loan.installments) === 1 && Number(loan.remaining_amount) > 0) return Number(loan.remaining_amount);

  const paid = Number(loan.paid_installments || 0);
  const nextNum = paid + 1;
  const schedule = schedules.find(s => s.loan_id === loan.id && Number(s.installment_number) === nextNum);

  if (schedule) {
    if (loan.remaining_amount != null && Number(loan.remaining_amount) >= 0) {
      const futureSum = schedules
        .filter(s => s.loan_id === loan.id && Number(s.installment_number) > nextNum)
        .reduce((sum, s) => sum + Number(s.amount || 0), 0);
      const currentBalance = Math.max(0, Number(loan.remaining_amount) - futureSum);
      return Math.min(currentBalance, Number(schedule.amount || 0));
    }
    return Number(schedule.amount || 0);
  }

  if (Number(loan.remaining_amount) > 0) return Number(loan.remaining_amount);
  return Number(loan.custom_installment_value || 0) || calculateInstallment(Number(loan.amount), Number(loan.interest_rate), Number(loan.installments));
}

function getOverdueInstallments(loan: any, schedules: any[], today: string) {
  const paid = Number(loan.paid_installments || 0);
  if (Number(loan.installments) === 1) {
    if (loan.due_date < today && paid < 1) {
      return [{ installment_number: 1, due_date: loan.due_date, amount: getInstallmentAmount(loan, schedules) }];
    }
    return [];
  }

  const loanScheds = schedules
    .filter(s => s.loan_id === loan.id && Number(s.installment_number) > paid && s.due_date < today)
    .sort((a, b) => Number(a.installment_number) - Number(b.installment_number));

  if (loanScheds.length > 0) {
    const nextNum = paid + 1;
    return loanScheds.map(s => ({
      installment_number: Number(s.installment_number),
      due_date: s.due_date,
      amount: Number(s.installment_number) === nextNum ? getInstallmentAmount(loan, schedules) : Number(s.amount || 0),
    }));
  }

  if (loan.due_date < today) {
    return [{ installment_number: paid + 1, due_date: loan.due_date, amount: getInstallmentAmount(loan, schedules) }];
  }

  return [];
}

async function buildBillingReport(admin: any, ownerId: string, today: string, brandName: string): Promise<string> {
  const [{ data: loans }, { data: payments }, { data: schedules }] = await Promise.all([
    admin.from("loans").select("*").eq("user_id", ownerId).neq("status", "paid"),
    admin.from("payments").select("loan_id, amount, installment_number").eq("user_id", ownerId),
    admin.from("loan_installments").select("loan_id, installment_number, due_date, amount").eq("user_id", ownerId),
  ]);

  const active = loans ?? [];
  const pays = payments ?? [];
  const schs = schedules ?? [];

  type Row = { loan: any; amount: number; lateFees: number };

  const sortFn = (a: Row, b: Row) => {
    const n = String(a.loan.borrower_name).localeCompare(String(b.loan.borrower_name), "pt-BR");
    return n !== 0 ? n : String(a.loan.due_date).localeCompare(String(b.loan.due_date));
  };

  const due: Row[] = active
    .filter((l: any) => l.due_date === today)
    .map((l: any) => {
      const base = getInstallmentAmount(l, schs);
      const lateFees = calcLateFees(l, base, today);
      return { loan: l, amount: base + lateFees, lateFees };
    })
    .sort(sortFn);

  const overdue: Row[] = active
    .filter((l: any) => l.due_date < today)
    .map((l: any) => {
      const installments = getOverdueInstallments(l, schs, today);
      const base = installments.reduce((sum, inst) => sum + Number(inst.amount || 0), 0)
        || getInstallmentAmount(l, schs);
      const lateFees = calcLateFees(l, base, today);
      return { loan: l, amount: base + lateFees, lateFees };
    })
    .sort(sortFn);

  const totDue = due.reduce((s, r) => s + r.amount, 0);
  const totOver = overdue.reduce((s, r) => s + r.amount, 0);
  const totPending = totDue + totOver;

  const lines: string[] = [];
  lines.push(`📊 *${brandName} — RELATÓRIO DIÁRIO*`);
  lines.push(`🗓 ${formatDateBR(today)} • ${getDayOfWeek(today)}`);
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`—`);
  lines.push(``);
  lines.push(`💰 *RESUMO DO DIA*`);
  lines.push(`▸ A cobrar hoje: ${fmtBRL(totDue)} (${due.length} parcelas)`);
  lines.push(`▸ Em atraso: ${fmtBRL(totOver)} (${overdue.length} parcelas)`);
  lines.push(`▸ Total pendente: ${fmtBRL(totPending)}`);
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`—`);
  lines.push(``);
  lines.push(`⏰ *VENCE HOJE — ${fmtBRL(totDue)}*`);
  lines.push(``);
  if (due.length === 0) {
    lines.push(`Nenhum empréstimo vencendo hoje.`);
  } else {
    lines.push(`💵 Empréstimos (${due.length})`);
    for (const { loan, amount, lateFees } of due) {
      const fees = lateFees > 0 ? ` (inclui ${fmtBRL(lateFees)} juros/multa)` : "";
      lines.push(`• *${loan.borrower_name}*  — ${fmtBRL(amount)}${fees}`);
      lines.push(`  └ ${getPaymentType(loan.payment_type)}`);
      if (loan.notes && String(loan.notes).trim()) {
        lines.push(`  📝 _${escapeMd(String(loan.notes).trim())}_`);
      }
    }
  }
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`—`);
  lines.push(``);
  lines.push(`🚨 *EM ATRASO — ${fmtBRL(totOver)}*`);
  lines.push(``);
  if (overdue.length === 0) {
    lines.push(`Nenhum empréstimo em atraso!`);
  } else {
    lines.push(`💵 Empréstimos (${overdue.length})`);
    for (const { loan, amount, lateFees } of overdue) {
      const fees = lateFees > 0 ? ` (inclui ${fmtBRL(lateFees)} juros/multa)` : "";
      lines.push(`• *${loan.borrower_name}*  — ${fmtBRL(amount)}${fees}`);
      lines.push(`  └ ${getPaymentType(loan.payment_type)} • Venc. ${formatDateBR(loan.due_date)}`);
      if (loan.notes && String(loan.notes).trim()) {
        lines.push(`  📝 _${escapeMd(String(loan.notes).trim())}_`);
      }
    }
  }

  return lines.join("\n");
}

import { sendReportsAsImage, getReportsLinkForUser } from "../_shared/reports-bot.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = getExternalAdmin();

  const url = new URL(req.url);
  const forceUserId = url.searchParams.get("user_id");
  const returnText = url.searchParams.get("return_text") === "1";

  // If forcing for a specific user, require that user to be authenticated as themselves
  if (forceUserId) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Auth required" }), { status: 401, headers: corsHeaders });
    const userClient = createClient(getExternalSupabaseUrl(), getExternalAnonKey());
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsErr || !userId) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    if (userId !== forceUserId) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  // return_text mode: build text and return without sending to Telegram.
  if (forceUserId && returnText) {
    let brandName2 = "EmprestAI";
    try {
      const { data: bRow } = await admin.from("app_branding").select("brand_name").limit(1).maybeSingle();
      if (bRow?.brand_name) brandName2 = bRow.brand_name;
    } catch { /* ignore */ }
    const { date: today2 } = todayInTZ();
    const text = await buildBillingReport(admin, forceUserId, today2, brandName2);
    return new Response(JSON.stringify({ ok: true, text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { date: today, hhmm } = todayInTZ();
  const [hh, mm] = hhmm.split(":").map(Number);
  const nowMin = hh * 60 + mm;

  let query = admin.from("telegram_billing_prefs").select("user_id, enabled, send_time_1, send_time_2, send_time_3, last_sent");
  if (forceUserId) query = query.eq("user_id", forceUserId);
  else query = query.eq("enabled", true);

  const { data: prefs, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  // Fetch brand name (singleton)
  let brandName = "EmprestAI";
  try {
    const { data: bRow } = await admin.from("app_branding").select("brand_name").limit(1).maybeSingle();
    if (bRow?.brand_name) brandName = bRow.brand_name;
  } catch { /* ignore */ }

  let sent = 0;
  const errors: string[] = [];

  for (const pref of prefs ?? []) {
    try {
      const slots = [
        { key: "send_time_1", time: (pref as any).send_time_1 },
        { key: "send_time_2", time: (pref as any).send_time_2 },
        { key: "send_time_3", time: (pref as any).send_time_3 },
      ] as const;
      const lastSent = (pref.last_sent ?? {}) as Record<string, string>;
      const slotsToSend: string[] = forceUserId ? ["manual"] : dueSlotKeys(slots, nowMin, today, lastSent);

      if (slotsToSend.length === 0) continue;

      // Resolve telegram chat from the dedicated reports bot link
      const link = await getReportsLinkForUser(admin, pref.user_id);
      if (!link) continue;

      const report = await buildBillingReport(admin, pref.user_id, today, brandName);

      const sendRes = await sendReportsAsImage(
        admin,
        pref.user_id,
        Number(link.chat_id),
        report.split("\n"),
        { name: brandName },
        { fallbackText: report, reportKey: "billing" },
      );
      if (!sendRes.sent) {
        errors.push(`${pref.user_id}: ${sendRes.reason ?? "send_failed"}`);
        continue;
      }

      if (!forceUserId) {
        const merged = { ...lastSent } as Record<string, string>;
        for (const slot of slotsToSend) merged[slot] = today;
        await admin.from("telegram_billing_prefs")
          .update({ last_sent: merged })
          .eq("user_id", pref.user_id);
      }

      sent++;
    } catch (e) {
      console.error("billing summary error for", pref.user_id, e);
      errors.push(`${pref.user_id}: ${(e as Error).message}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: prefs?.length ?? 0, hhmm, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
