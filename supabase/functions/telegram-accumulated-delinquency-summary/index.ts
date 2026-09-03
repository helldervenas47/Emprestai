import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getExternalAdmin, getExternalSupabaseUrl, getExternalAnonKey } from "../_shared/external-supabase.ts";

import { dueSlotKeys } from "../_shared/schedule.ts";

const GATEWAY_URL = "https://api.telegram.org";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type LoanRow = {
  id: string;
  user_id: string;
  borrower_id: string | null;
  borrower_name: string;
  due_date: string;
  installments: number;
  paid_installments: number;
  remaining_amount: number | null;
  custom_installment_value: number | null;
  amount: number;
  interest_rate: number;
  status: string;
  late_interest_type: string | null;
  late_interest_value: number | null;
  penalty_value: number | null;
};

type ScheduleRow = {
  loan_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
};

type ClientRow = {
  id: string;
  name: string;
  phone: string;
};

type ReportItem = {
  clientKey: string;
  clientName: string;
  phone: string;
  baseAmount: number;
  lateInterest: number;
  penalty: number;
  installmentAmount: number;
  dueDate: string;
  daysOverdue: number;
};

function calcLateFeesFor(loan: LoanRow, baseAmount: number, daysOverdue: number) {
  if (daysOverdue <= 0) return { lateInterest: 0, penalty: 0 };
  const lateValue = loan.late_interest_value != null ? Number(loan.late_interest_value) : 0;
  const lateInterest = lateValue > 0
    ? loan.late_interest_type === "fixed"
      ? lateValue * daysOverdue
      : baseAmount * (lateValue / 100) * daysOverdue
    : 0;
  const penaltyValue = loan.penalty_value != null ? Number(loan.penalty_value) : 0;
  const penalty = penaltyValue > 0 ? penaltyValue : 0;
  return { lateInterest, penalty };
}

function fmtBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function normalizeName(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getCurrentDateParts(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const today = `${get("year")}-${get("month")}-${get("day")}`;

  return {
    today,
    currentMonthStart: `${get("year")}-${get("month")}-01`,
    hhmm: `${get("hour")}:${get("minute")}`,
  };
}

function getDaysOverdue(dueDate: string, today: string) {
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const current = new Date(`${today}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((current - due) / 86400000));
}

function getFallbackInstallmentAmount(loan: LoanRow) {
  if (loan.custom_installment_value && Number(loan.custom_installment_value) > 0) {
    return Number(loan.custom_installment_value);
  }

  if (loan.remaining_amount && Number(loan.remaining_amount) > 0) {
    return Number(loan.remaining_amount);
  }

  const total = Number(loan.amount) + (Number(loan.amount) * Number(loan.interest_rate) / 100 * Math.max(1, Number(loan.installments)));
  return total / Math.max(1, Number(loan.installments));
}

function buildAccumulatedDelinquencyItems(loans: LoanRow[], schedules: ScheduleRow[], clients: ClientRow[], today: string, currentMonthStart: string) {
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const schedulesByLoan = new Map<string, ScheduleRow[]>();

  for (const schedule of schedules) {
    const existing = schedulesByLoan.get(schedule.loan_id) ?? [];
    existing.push(schedule);
    schedulesByLoan.set(schedule.loan_id, existing);
  }

  const items: ReportItem[] = [];

  for (const loan of loans) {
    if (loan.status === "paid") continue;

    const relatedClient = loan.borrower_id ? clientById.get(loan.borrower_id) : undefined;
    const clientName = relatedClient?.name || loan.borrower_name;
    const phone = relatedClient?.phone || "";
    const clientKey = loan.borrower_id || normalizeName(clientName);
    const loanSchedules = (schedulesByLoan.get(loan.id) ?? []).sort((a, b) => a.installment_number - b.installment_number);
    const unpaidSchedules = loanSchedules.filter((schedule) => schedule.installment_number > Number(loan.paid_installments) && schedule.due_date < currentMonthStart);

    const loanRemaining = Math.max(0, Number(loan.remaining_amount ?? 0));
    let remainingForLoan = loanRemaining;

    if (unpaidSchedules.length > 0) {
      for (const schedule of unpaidSchedules) {
        if (remainingForLoan <= 0) break;
        const scheduleAmount = Number(schedule.amount || 0);
        const base = Math.min(scheduleAmount, remainingForLoan);
        if (base <= 0) continue;
        remainingForLoan -= base;
        const days = getDaysOverdue(schedule.due_date, today);
        const fees = calcLateFeesFor(loan, base, days);
        items.push({
          clientKey,
          clientName,
          phone,
          baseAmount: base,
          lateInterest: fees.lateInterest,
          penalty: fees.penalty,
          installmentAmount: base + fees.lateInterest + fees.penalty,
          dueDate: schedule.due_date,
          daysOverdue: days,
        });
      }
      continue;
    }

    // Fallback só se aplica a empréstimos sem schedule (ex.: parcela única).
    if (loanSchedules.length > 0) continue;
    if (loan.due_date >= currentMonthStart) continue;
    if (remainingForLoan <= 0) continue;

    const fallbackBase = getFallbackInstallmentAmount(loan);
    const base = Math.min(fallbackBase, remainingForLoan);
    if (base <= 0) continue;
    const days = getDaysOverdue(loan.due_date, today);
    const fees = calcLateFeesFor(loan, base, days);
    items.push({
      clientKey,
      clientName,
      phone,
      baseAmount: base,
      lateInterest: fees.lateInterest,
      penalty: fees.penalty,
      installmentAmount: base + fees.lateInterest + fees.penalty,
      dueDate: loan.due_date,
      daysOverdue: days,
    });
  }

  return items.sort((a, b) => b.daysOverdue - a.daysOverdue || a.clientName.localeCompare(b.clientName, "pt-BR"));
}

function buildTelegramMessage(items: ReportItem[]) {
  if (items.length === 0) {
    return "Nenhum empréstimo vencido de meses anteriores.";
  }

  const grouped = new Map<string, { clientName: string; phone: string; items: ReportItem[]; totalOpen: number; maxDaysOverdue: number }>();

  for (const item of items) {
    const existing = grouped.get(item.clientKey) ?? {
      clientName: item.clientName,
      phone: item.phone,
      items: [],
      totalOpen: 0,
      maxDaysOverdue: 0,
    };

    existing.items.push(item);
    existing.totalOpen += item.installmentAmount;
    existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue, item.daysOverdue);
    grouped.set(item.clientKey, existing);
  }

  const clients = Array.from(grouped.values()).sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue || a.clientName.localeCompare(b.clientName, "pt-BR"));
  const totalOpen = items.reduce((sum, item) => sum + item.installmentAmount, 0);
  const averageDays = Math.round(items.reduce((sum, item) => sum + item.daysOverdue, 0) / items.length);

  const lines = [
    "📊 *Relatório de Inadimplência Acumulada*",
    `👥 Clientes: ${clients.length}`,
    `💰 Total em atraso: ${fmtBRL(totalOpen)}`,
    `⏳ Média de atraso: ${averageDays} dias`,
    "",
    "--------------------------------",
    "",
  ];

  for (const client of clients) {
    lines.push(`*Cliente:* ${client.clientName}`);
    if (client.phone) lines.push(`📞 ${client.phone}`);
    lines.push(`Parcelas: ${client.items.length}`);
    lines.push(`Total: ${fmtBRL(client.totalOpen)}`);
    lines.push(`Atraso: ${client.maxDaysOverdue} dias`);

    for (const item of client.items.slice(0, 5)) {
      const feeParts: string[] = [];
      if (item.lateInterest > 0) feeParts.push(`juros ${fmtBRL(item.lateInterest)}`);
      if (item.penalty > 0) feeParts.push(`multa ${fmtBRL(item.penalty)}`);
      const feeSuffix = feeParts.length > 0 ? ` (base ${fmtBRL(item.baseAmount)} + ${feeParts.join(" + ")})` : "";
      lines.push(`• ${fmtBRL(item.installmentAmount)} • venc. ${item.dueDate.split("-").reverse().join("/")} • ${item.daysOverdue} dias${feeSuffix}`);
    }

    if (client.items.length > 5) {
      lines.push(`• +${client.items.length - 5} parcela(s) em atraso anterior`);
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}

import { sendReportsAsImage, getReportsLinkForUser } from "../_shared/reports-bot.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = getExternalAdmin();
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const bodyUserId = typeof body.user_id === "string" ? body.user_id : null;
    const forceUserId = bodyUserId ?? url.searchParams.get("user_id") ?? null;
    const returnText = url.searchParams.get("return_text") === "1" || body.return_text === true;

    if (forceUserId) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) {
        return new Response(JSON.stringify({ error: "Auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const userClient = createClient(getExternalSupabaseUrl(), getExternalAnonKey(), {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const { data: authData, error: userError } = await userClient.auth.getUser();
      if (userError || !authData.user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (authData.user.id !== forceUserId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // return_text mode: build and return text without sending.
    if (forceUserId && returnText) {
      const { data: ownerId } = await admin.rpc("get_data_owner_id", { _user_id: forceUserId });
      const resolvedOwnerId = ownerId ?? forceUserId;
      const { data: accountSettings } = await admin
        .from("account_settings").select("timezone").eq("owner_id", resolvedOwnerId).maybeSingle();
      const timeZone = accountSettings?.timezone || "America/Sao_Paulo";
      const { today, currentMonthStart } = getCurrentDateParts(timeZone);
      const [{ data: loans }, { data: schedules }, { data: clients }] = await Promise.all([
        admin.from("loans").select("id, user_id, borrower_id, borrower_name, due_date, installments, paid_installments, remaining_amount, custom_installment_value, amount, interest_rate, status, late_interest_type, late_interest_value, penalty_value").eq("user_id", resolvedOwnerId).neq("status", "paid"),
        admin.from("loan_installments").select("loan_id, installment_number, due_date, amount").eq("user_id", resolvedOwnerId),
        admin.from("clients").select("id, name, phone").eq("user_id", resolvedOwnerId),
      ]);
      const items = buildAccumulatedDelinquencyItems(
        (loans ?? []) as LoanRow[],
        (schedules ?? []) as ScheduleRow[],
        (clients ?? []) as ClientRow[],
        today,
        currentMonthStart,
      );
      const text = buildTelegramMessage(items);
      return new Response(JSON.stringify({ ok: true, text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = admin
      .from("telegram_accumulated_delinquency_prefs")
      .select("user_id, enabled, send_time_1, send_time_2, send_time_3, last_sent");

    query = forceUserId ? query.eq("user_id", forceUserId) : query.eq("enabled", true);

    const { data: prefs, error: prefsError } = await query;
    if (prefsError) throw prefsError;

    let sent = 0;
    const errors: string[] = [];

    for (const pref of prefs ?? []) {
      try {
        const { data: ownerId } = await admin.rpc("get_data_owner_id", { _user_id: pref.user_id });
        const resolvedOwnerId = ownerId ?? pref.user_id;
        const { data: accountSettings } = await admin
          .from("account_settings")
          .select("timezone")
          .eq("owner_id", resolvedOwnerId)
          .maybeSingle();

        const timeZone = accountSettings?.timezone || "America/Sao_Paulo";
        const { today, currentMonthStart, hhmm } = getCurrentDateParts(timeZone);
        const [hour, minute] = hhmm.split(":").map(Number);
        const nowMin = hour * 60 + minute;
        const slots = [
          { key: "send_time_1", time: (pref as any).send_time_1 },
          { key: "send_time_2", time: (pref as any).send_time_2 },
          { key: "send_time_3", time: (pref as any).send_time_3 },
        ] as const;
        const lastSent = (pref.last_sent ?? {}) as Record<string, string>;
        const slotsToSend: string[] = forceUserId ? ["manual"] : dueSlotKeys(slots, nowMin, today, lastSent);

        if (slotsToSend.length === 0) continue;

        const [link, { data: loans }, { data: schedules }, { data: clients }] = await Promise.all([
          getReportsLinkForUser(admin, pref.user_id),
          admin.from("loans").select("id, user_id, borrower_id, borrower_name, due_date, installments, paid_installments, remaining_amount, custom_installment_value, amount, interest_rate, status, late_interest_type, late_interest_value, penalty_value").eq("user_id", resolvedOwnerId).neq("status", "paid"),
          admin.from("loan_installments").select("loan_id, installment_number, due_date, amount").eq("user_id", resolvedOwnerId),
          admin.from("clients").select("id, name, phone").eq("user_id", resolvedOwnerId),
        ]);

        if (!link) continue;

        const items = buildAccumulatedDelinquencyItems(
          (loans ?? []) as LoanRow[],
          (schedules ?? []) as ScheduleRow[],
          (clients ?? []) as ClientRow[],
          today,
          currentMonthStart,
        );

        const report = buildTelegramMessage(items);
        const sendRes = await sendReportsAsImage(
          admin,
          pref.user_id,
          Number(link.chat_id),
          report.split("\n"),
          { name: brandName },
          { fallbackText: report, reportKey: "accumulated_delinquency" },
        );
        if (!sendRes.sent) {
          console.warn("[accumulated-delinquency] send skipped for", pref.user_id, sendRes.reason);
          continue;
        }

        if (!forceUserId) {
          const merged = { ...lastSent } as Record<string, string>;
          for (const slot of slotsToSend) merged[slot] = today;
          await admin
            .from("telegram_accumulated_delinquency_prefs")
            .update({ last_sent: merged })
            .eq("user_id", pref.user_id);
        }

        sent += 1;
      } catch (error) {
        console.error("accumulated delinquency error for", pref.user_id, error);
        errors.push(`${pref.user_id}: ${(error as Error).message}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, checked: prefs?.length ?? 0, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
