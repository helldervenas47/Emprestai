import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { validateCronSecret, validateUserOwner, unauthorized } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_TZ = "America/Sao_Paulo";

function nowInTz(tz = APP_TZ): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`);
}

function todayStr(tz = APP_TZ): string {
  const d = nowInTz(tz);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const minutesOf = (value: string) => {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
};

const isDueInCurrentCronWindow = (target: string, current: string) => {
  const delta = minutesOf(current) - minutesOf(target || "09:00");
  return delta >= 0 && delta < 5;
};

function diffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((da - db) / (1000 * 60 * 60 * 24));
}

function normalizePhoneBR(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

function formatBRL(n: number): string {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBR(date: string): string {
  if (!date) return "";
  const d = date.length >= 10 ? date.substring(0, 10) : date;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function formatShortBR(date: string): string {
  if (!date) return "";
  const d = date.length >= 10 ? date.substring(0, 10) : date;
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
}

function cleanLabel(label: string): string {
  const trimmed = (label || "").trim();
  if (!trimmed) return "";
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord || trimmed;
}

function applyVariables(message: string, ctx: {
  nome: string; valorParcela: number; dataVenc: string;
  diasAtraso: number; juros: number; valorTotal: number;
  etiqueta: string; linkPagamento: string;
}) {
  return message
    .replace(/\{nome_cliente\}/g, ctx.nome)
    .replace(/\{nome\}/g, ctx.nome)
    .replace(/\{valor_parcela\}/g, formatBRL(ctx.valorParcela))
    .replace(/\{valor\}/g, formatBRL(ctx.valorParcela))
    .replace(/\{data_vencimento\}/g, formatBR(ctx.dataVenc))
    .replace(/\{dias_atraso\}/g, String(Math.max(0, ctx.diasAtraso)))
    .replace(/\{juros\}/g, formatBRL(ctx.juros))
    .replace(/\{valor_total\}/g, formatBRL(ctx.valorTotal))
    .replace(/\{etiqueta\}/g, ctx.etiqueta)
    .replace(/\{link_pagamento\}/g, ctx.linkPagamento);
}

function calculateInstallment(principal: number, rate: number, installments: number): number {
  if (installments <= 0) return 0;
  const total = principal * (1 + rate / 100);
  return total / installments;
}

function calculateTotalWithInterest(principal: number, rate: number) {
  return Math.round(principal * (1 + rate / 100));
}

function getBaseRemainingAmount(loan: any, payments: any[], schedules: any[]) {
  if (loan.remaining_amount != null && Number(loan.remaining_amount) > 0) {
    return Number(loan.remaining_amount);
  }
  const paidCount = Number(loan.paid_installments || 0);
  const unpaidSchedules = schedules.filter(
    (s: any) => s.loan_id === loan.id && Number(s.installment_number) > paidCount
  );
  const unpaidSchedulesTotal = unpaidSchedules.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);

  if (Number(loan.installments || 1) >= 2 && unpaidSchedulesTotal > 0) {
    return unpaidSchedulesTotal;
  }

  const totalExpected = calculateTotalWithInterest(Number(loan.amount || 0), Number(loan.interest_rate || 0));
  const totalPaid = payments
    .filter((p: any) => p.loan_id === loan.id)
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

  return Math.max(0, totalExpected - totalPaid);
}

function getLoanLateFees(
  loan: any,
  payments: any[],
  schedules: any[],
  referenceDate: string,
) {
  if (loan.status === "paid") {
    return { daysOverdue: 0, lateInterestTotal: 0, penaltyTotal: 0, lateFees: 0 };
  }

  const todayStr = referenceDate;
  const today = new Date(`${todayStr}T00:00:00`);

  const loanPayments = payments.filter((p: any) => p.loan_id === loan.id);
  const paidByInstallment = new Map<number, number>();

  loanPayments.forEach((p: any) => {
    const inst = Number(p.installment_number);
    if (inst > 0) {
      paidByInstallment.set(inst, (paidByInstallment.get(inst) ?? 0) + Number(p.amount || 0));
    }
  });

  const unpaidSchedules = schedules
    .filter((s: any) => s.loan_id === loan.id)
    .sort((a: any, b: any) => Number(a.installment_number) - Number(b.installment_number));

  let lateInterestTotal = 0;
  let penaltyTotal = 0;
  let maxDaysOverdue = 0;

  const totalInstallments = Number(loan.installments || 1);

  if (totalInstallments > 1 && unpaidSchedules.length > 0) {
    let overdueSchedulesCount = 0;
    unpaidSchedules.forEach((s: any) => {
      const instNum = Number(s.installment_number);
      const paid = paidByInstallment.get(instNum) ?? 0;
      const schedAmt = Number(s.amount || 0);
      if (paid < schedAmt - 0.01) {
        const due = new Date(`${(s.due_date || "").slice(0, 10)}T00:00:00`);
        const days = Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

        if (days > 0) {
          maxDaysOverdue = Math.max(maxDaysOverdue, days);
          overdueSchedulesCount++;

          const pending = Math.max(0, schedAmt - paid);
          if (loan.late_interest_value != null && Number(loan.late_interest_value) > 0) {
            if (loan.late_interest_type === "fixed") {
              lateInterestTotal += Number(loan.late_interest_value) * days;
            } else {
              lateInterestTotal += pending * (Number(loan.late_interest_value) / 100) * days;
            }
          }
        }
      }
    });

    if (loan.penalty_value != null && Number(loan.penalty_value) > 0) {
      penaltyTotal = Number(loan.penalty_value) * (overdueSchedulesCount > 0 ? overdueSchedulesCount : 1);
    }
  } else {
    const dueDate = (loan.due_date || "").slice(0, 10);
    const due = new Date(`${dueDate}T00:00:00`);
    const days = Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

    if (days > 0) {
      maxDaysOverdue = days;
      const baseRemaining = getBaseRemainingAmount(loan, payments, schedules);

      if (loan.late_interest_value != null && Number(loan.late_interest_value) > 0) {
        if (loan.late_interest_type === "fixed") {
          lateInterestTotal += Number(loan.late_interest_value) * days;
        } else {
          lateInterestTotal += baseRemaining * (Number(loan.late_interest_value) / 100) * days;
        }
      }
    }

    if (loan.penalty_value != null && Number(loan.penalty_value) > 0) {
      penaltyTotal = Number(loan.penalty_value);
    }
  }

  return {
    daysOverdue: maxDaysOverdue,
    lateInterestTotal: Math.round(lateInterestTotal * 100) / 100,
    penaltyTotal: Math.round(penaltyTotal * 100) / 100,
    lateFees: Math.round((lateInterestTotal + penaltyTotal) * 100) / 100,
  };
}

const DEFAULT_MESSAGES = {
  a_vencer:
    "Olá {nome_cliente}, sua parcela de {valor_parcela} vence em {data_vencimento}. Evite juros pagando antecipadamente.\n{link_pagamento}",
  vence_hoje:
    "Olá {nome_cliente}, sua parcela de {valor_parcela} vence hoje ({data_vencimento}). Por favor, regularize.\n{link_pagamento}",
  vencida:
    "Olá {nome_cliente}, sua parcela de {valor_parcela} venceu há {dias_atraso} dia(s). Total com juros/multa: {valor_total}.\n{link_pagamento}",
  muito_vencida:
    "Olá {nome_cliente}, atraso de {dias_atraso} dias na parcela de {valor_parcela}. Total atualizado: {valor_total} ({juros} de encargos).\n{link_pagamento}",
};

type DueStatus = "vencida" | "muito_vencida" | "vence_hoje" | "a_vencer";

function getDueStatus(dueDate: string, today: string, veryOverdueDays: number): DueStatus {
  const d = diffDays(dueDate, today);
  if (d < 0) {
    const dias = Math.abs(d);
    if (dias >= veryOverdueDays) return "muito_vencida";
    return "vencida";
  }
  if (d === 0) return "vence_hoje";
  return "a_vencer";
}

function getItemSituation(promisedDate: string | undefined, dueDate: string, daysOverdue: number, status: DueStatus): string {
  if (promisedDate) return `Venc. ${formatShortBR(promisedDate)}`;
  return daysOverdue > 0 ? `Venc. ${formatShortBR(dueDate)}` : status === "vence_hoje" ? "Vence hoje" : `Venc. ${formatShortBR(dueDate)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || Deno.env.get("WHATSMIAU_API_KEY") || "";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let forceOwner: string | null = null;
    let manualRun = false;
    let previewOnly = false;
    try {
      const json = await req.json();
      if (json?.owner_id) forceOwner = json.owner_id;
      manualRun = json?.manual_run === true;
      previewOnly = json?.preview_only === true;
    } catch { /* no body */ }

    // AUTH: per-owner manual run requires the caller's JWT to belong to that owner;
    // cron path (no owner_id) requires the shared cron secret header.
    if (forceOwner) {
      const owned = await validateUserOwner(admin, req, forceOwner);
      if (!owned.ok) return unauthorized(corsHeaders, owned.reason || "Unauthorized");
    } else {
      const isCron = await validateCronSecret(admin, req);
      if (!isCron) return unauthorized(corsHeaders);
    }

    const today = todayStr();
    const nowHM = (() => {
      const d = nowInTz();
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    })();

    const scheduleCols = "owner_id, enabled, provider, send_time, base_url, instance_id, days_before_due, send_on_due_day, send_when_overdue, overdue_repeat_days, allowed_start_time, allowed_end_time, allowed_weekdays, alert_on_failure";
    let scheduleQuery = admin.from("whatsapp_billing_schedule").select(scheduleCols).eq("enabled", true);
    if (forceOwner) scheduleQuery = scheduleQuery.eq("owner_id", forceOwner);
    const { data: schedules, error: schedErr } = await scheduleQuery;
    if (schedErr) throw schedErr;

    const results: any[] = [];

    for (const sched of schedules ?? []) {
      const weekday = nowInTz().getDay();
      const allowedWeekdays = Array.isArray(sched.allowed_weekdays) ? sched.allowed_weekdays : [1, 2, 3, 4, 5, 6];
      const insideWindow = minutesOf(nowHM) >= minutesOf(sched.allowed_start_time || "08:00")
        && minutesOf(nowHM) <= minutesOf(sched.allowed_end_time || "18:00");
      if (!manualRun && (!allowedWeekdays.includes(weekday) || !insideWindow)) continue;

      const providerApiKey = sched.provider === "wppconnect"
        ? Deno.env.get("WPPCONNECT_TOKEN") || ""
        : EVOLUTION_API_KEY;
      if (!sched.base_url || !sched.instance_id || !providerApiKey) {
        results.push({ owner_id: sched.owner_id, skipped: "missing_credentials" });
        continue;
      }

      const ownerId = sched.owner_id;
      const batchId = crypto.randomUUID();
      let queueIndex = 0;

      const { data: tplRow } = await admin
        .from("whatsapp_billing_messages")
        .select("message_upcoming, message_due_today, message_overdue, message_very_overdue, message_center_single, message_center_multiple, pix_link, very_overdue_days")
        .eq("owner_id", ownerId)
        .maybeSingle();
      const veryOverdueDays = Number((tplRow as any)?.very_overdue_days ?? 30) || 30;
      const linkPagamento = (tplRow as any)?.pix_link?.trim() || "";
      const defaultCenterSingle = "Olá, {nome_cliente}!\n\nIdentificamos o seguinte contrato pendente:\n\n• {etiqueta} — {valor_total} — {situacao}\n\nCaso já tenha realizado o pagamento, desconsidere este item.\n\nEmprestAI";
      const defaultCenterMultiple = "Olá, {nome_cliente}!\n\nIdentificamos os seguintes contratos pendentes:\n\n{lista_contratos}\n\nTotal: {valor_total}\n\nCaso já tenha realizado algum pagamento, desconsidere o respectivo item.\n\nEmprestAI";

      const { data: loans } = await admin
        .from("loans").select("*")
        .eq("user_id", ownerId)
        .neq("status", "paid")
        .eq("auto_billing_enabled", true);

      if (!loans?.length) continue;

      const loanIds = loans.map((l: any) => l.id);
      const borrowerIds = Array.from(new Set(loans.map((l: any) => l.borrower_id).filter(Boolean)));

      const { data: clients } = borrowerIds.length
        ? await admin.from("clients").select("id, name, phone, auto_billing_enabled, auto_billing_send_time, auto_billing_repeat_days, auto_billing_weekdays").in("id", borrowerIds)
        : { data: [] as any[] };
      const clientById = new Map((clients ?? []).map((c: any) => [c.id, c]));

      const { data: schedules2 } = await admin
        .from("loan_installments").select("loan_id, installment_number, due_date, amount").in("loan_id", loanIds);
      const schedByLoan = new Map<string, any[]>();
      for (const s of schedules2 ?? []) {
        const arr = schedByLoan.get(s.loan_id) ?? [];
        arr.push(s);
        schedByLoan.set(s.loan_id, arr);
      }

      const { data: paymentsRes } = await admin
        .from("payments").select("loan_id, installment_number, amount").in("loan_id", loanIds);
      const paymentsByLoan = new Map<string, any[]>();
      for (const p of paymentsRes ?? []) {
        const arr = paymentsByLoan.get(p.loan_id) ?? [];
        arr.push(p);
        paymentsByLoan.set(p.loan_id, arr);
      }

      const { data: promises } = await admin
        .from("whatsapp_payment_promises")
        .select("loan_id, installment_number, promised_date")
        .eq("user_id", ownerId)
        .in("loan_id", loanIds);
      const promiseByInstallment = new Map(
        (promises ?? []).map((p: any) => [`${p.loan_id}:${p.installment_number}`, p.promised_date]),
      );

      const { data: todayLogs } = await admin
        .from("whatsapp_billing_log")
        .select("loan_id, status_when_sent, success")
        .eq("owner_id", ownerId)
        .eq("sent_date", today);
      const sentTodayKey = new Set(
        (todayLogs ?? []).filter((l) => l.success).map((l) => `${l.loan_id}|${l.status_when_sent}`),
      );
      const eligibleByClient = new Map<string, any[]>();

      for (const loan of loans) {
        try {
          const client = loan.borrower_id ? clientById.get(loan.borrower_id) : null;
          const phoneRaw = client?.phone || "";
          if (!phoneRaw) continue;
          if (client && client.auto_billing_enabled === false) continue;
          const clientWeekdays = Array.isArray(client?.auto_billing_weekdays) ? client.auto_billing_weekdays : allowedWeekdays;
          const clientSendTime = client?.auto_billing_send_time || sched.send_time || "09:00";
          if (!manualRun && (!clientWeekdays.includes(weekday) || !isDueInCurrentCronWindow(clientSendTime, nowHM))) continue;

          const paid = loan.paid_installments ?? 0;
          const total = loan.installments ?? 1;
          if (paid >= total) continue;

          const list = (schedByLoan.get(loan.id) ?? []).sort(
            (a: any, b: any) => a.installment_number - b.installment_number,
          );
          const nextInst = list.find((s: any) => s.installment_number === paid + 1);
          const dueDate: string | null = nextInst?.due_date ?? loan.due_date ?? null;
          const installmentNumber = (nextInst?.installment_number ?? paid + 1) as number;
          const loanPayments = paymentsByLoan.get(loan.id) ?? [];
          const lateFeesBreakdown = getLoanLateFees(loan, loanPayments, list, today);
          const renegPenaltyPending = (total <= 1 && loan.status !== "paid")
            ? Number(loan.renegotiation_penalty_total || 0)
            : 0;
          const loanLateFees = lateFeesBreakdown.lateFees + renegPenaltyPending;

          const baseRemainingSingle = getBaseRemainingAmount(loan, loanPayments, list);
          const singleInstallmentRemaining = loan.status === "paid"
            ? 0
            : baseRemainingSingle + loanLateFees;

          const fallbackInstallment = Number(loan.custom_installment_value ?? 0)
            || (Number(loan.amount ?? 0) * (1 + Number(loan.interest_rate ?? 0) / 100)) / Math.max(1, total);

          let amount = 0;
          let baseAmount = 0;
          let lateFees = 0;

          const overdueInstallments = total > 1
            ? list.filter((s: any) => s.installment_number > paid && (s.due_date || "").slice(0, 10) < today)
            : [];
          const overdueInstallmentCount = overdueInstallments.length;

          if (total > 1) {
            const dueList = list.filter((s: any) => s.installment_number > paid && (s.due_date || "").slice(0, 10) <= today);
            if (dueList.length > 0) {
              amount = dueList.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
            } else {
              amount = Number(nextInst?.amount ?? fallbackInstallment);
            }
            if (baseRemainingSingle > 0 && amount > baseRemainingSingle) {
              amount = baseRemainingSingle;
            }
            baseAmount = amount;
            lateFees = 0;
          } else {
            amount = singleInstallmentRemaining;
            baseAmount = baseRemainingSingle;
            lateFees = loanLateFees;
          }
          amount = Math.round(amount * 100) / 100;
          baseAmount = Math.round(baseAmount * 100) / 100;
          lateFees = Math.round(lateFees * 100) / 100;

          if (!dueDate) continue;

          const rawPromisedDate = promiseByInstallment.get(`${loan.id}:${installmentNumber}`) as string | undefined;
          const cleanDueDate = dueDate.slice(0, 10);
          if (rawPromisedDate && rawPromisedDate.slice(0, 10) < cleanDueDate) {
            admin.from("whatsapp_payment_promises")
              .delete()
              .eq("user_id", ownerId)
              .eq("loan_id", loan.id)
              .eq("installment_number", installmentNumber)
              .then(() => {});
          }
          const promisedDate = (rawPromisedDate && rawPromisedDate.slice(0, 10) >= cleanDueDate) ? rawPromisedDate : undefined;
          const billingDate = promisedDate || cleanDueDate;
          const status = getDueStatus(billingDate, today, veryOverdueDays);
          const daysDiff = diffDays(billingDate, today);
          const messageDaysOverdue = daysDiff < 0 ? Math.abs(daysDiff) : 0;

          let shouldSend = false;
          if (status === "a_vencer") {
            shouldSend = daysDiff === (sched.days_before_due ?? 1);
          } else if (status === "vence_hoje") {
            shouldSend = !!sched.send_on_due_day;
          } else if (status === "vencida" || status === "muito_vencida") {
            if (sched.send_when_overdue) {
              const repeat = Math.max(1, client?.auto_billing_repeat_days ?? sched.overdue_repeat_days ?? 3);
              shouldSend = manualRun ? messageDaysOverdue > 0 : messageDaysOverdue === 0 || messageDaysOverdue % repeat === 0;
            }
          }
          if (!shouldSend) continue;

          const key = `${loan.id}|${status}`;
          if (sentTodayKey.has(key)) continue;

          const etiqueta = Array.isArray(loan.tags)
            ? loan.tags
                .map((t: unknown) => (t == null ? "" : String(t).trim()))
                .filter((t: string) => t.length > 0 && t.toLowerCase() !== "null" && t.toLowerCase() !== "undefined")
                .join(", ")
            : "";

          const situation = getItemSituation(promisedDate, cleanDueDate, messageDaysOverdue, status);

          const phone = normalizePhoneBR(phoneRaw);
          if (!client?.id) continue;
          const entries = eligibleByClient.get(client.id) ?? [];
          entries.push({
            loanId: loan.id,
            installmentNumber,
            phone,
            amount,
            baseAmount,
            lateFees,
            dueDate: billingDate,
            originalDueDate: cleanDueDate,
            daysOverdue: messageDaysOverdue,
            overdueInstallmentCount,
            status,
            situation,
            promisedDate,
            label: etiqueta || client.name || loan.borrower_name || "Contrato",
          });
          eligibleByClient.set(client.id, entries);
        } catch (e) {
          results.push({ owner_id: ownerId, loan_id: loan.id, error: String(e) });
        }
      }

      for (const [clientId, entries] of eligibleByClient) {
        const first = entries[0];
        const totalAmount = entries.reduce((sum: number, entry: any) => sum + entry.amount, 0);
        const totalBase = entries.reduce((sum: number, entry: any) => sum + entry.baseAmount, 0);
        const totalFees = entries.reduce((sum: number, entry: any) => sum + entry.lateFees, 0);
        const totalOverdueInstallments = entries.reduce((sum: number, entry: any) => sum + entry.overdueInstallmentCount, 0);
        const client = clientById.get(clientId);
        const clientName = client?.name || first.label || "Cliente";

        const lines = entries.map((entry: any) => {
          const label = cleanLabel(entry.label);
          const amountSummary = entry.overdueInstallmentCount > 1
            ? `${formatBRL(entry.amount)} (${entry.overdueInstallmentCount}x)`
            : formatBRL(entry.amount);
          if (entry.promisedDate) {
            return `• ${label} — ${amountSummary} — Venc. ${formatShortBR(entry.dueDate)}`;
          }
          return `• ${label} — ${amountSummary} — ${entry.situation}`;
        }).join("\n");

        let message = "";
        if (entries.length > 1) {
          const lines = entries.map((entry: any) => {
            const label = cleanLabel(entry.label);
            const amountSummary = entry.overdueInstallmentCount > 1
              ? `${formatBRL(entry.amount)} (${entry.overdueInstallmentCount}x)`
              : formatBRL(entry.amount);
            if (entry.promisedDate) {
              return `• ${label} — ${amountSummary} — Venc. ${formatShortBR(entry.dueDate)}`;
            }
            return `• ${label} — ${amountSummary} — ${entry.situation}`;
          }).join("\n");

          const template = (tplRow as any)?.message_center_multiple?.trim() || defaultCenterMultiple;
          message = template
            .replace(/\{nome_cliente\}|\{nome\}/g, clientName)
            .replace(/\{lista_contratos\}/g, lines)
            .replace(/\{quantidade_contratos\}/g, String(entries.length))
            .replace(/\{valor_total\}|\{valor_cobranca\}|\{valor_parcela\}|\{valor\}/g, formatBRL(totalAmount))
            .replace(/\{valor_base\}/g, formatBRL(totalBase))
            .replace(/\{encargos\}|\{juros\}/g, formatBRL(totalFees))
            .replace(/\{parcelas_vencidas\}/g, String(totalOverdueInstallments))
            .replace(/\{etiquetas_contratos\}|\{etiqueta\}/g, entries.map((entry: any) => cleanLabel(entry.label)).join(", "))
            .replace(/\{valores_contratos\}/g, entries.map((entry: any) => formatBRL(entry.amount)).join("; "))
            .replace(/\{datas_priorizadas\}|\{datas_vencimento\}|\{data_vencimento\}|\{data_priorizada\}/g, entries.map((entry: any) => formatShortBR(entry.dueDate)).join("; "))
            .replace(/\{vencimento_original\}/g, formatShortBR(first.originalDueDate || first.dueDate))
            .replace(/\{dias_atraso\}/g, String(first.daysOverdue))
            .replace(/\{situacao\}/g, first.situation)
            .replace(/\{link_pagamento\}/g, linkPagamento);
        } else {
          const singleTemplate = (tplRow as any)?.message_center_single?.trim() || defaultCenterSingle;
          message = singleTemplate
            .replace(/\{nome_cliente\}|\{nome\}/g, clientName)
            .replace(/\{etiqueta\}/g, cleanLabel(first.label))
            .replace(/\{valor_total\}|\{valor_cobranca\}|\{valor_parcela\}|\{valor\}/g, formatBRL(first.amount))
            .replace(/\{valor_base\}/g, formatBRL(first.baseAmount))
            .replace(/\{encargos\}|\{juros\}/g, formatBRL(first.lateFees))
            .replace(/\{parcelas_vencidas\}/g, String(first.overdueInstallmentCount))
            .replace(/\{vencimento_original\}/g, formatShortBR(first.originalDueDate || first.dueDate))
            .replace(/\{data_priorizada\}|\{datas_priorizadas\}|\{datas_vencimento\}|\{data_vencimento\}/g, formatShortBR(first.dueDate))
            .replace(/\{dias_atraso\}/g, String(first.daysOverdue))
            .replace(/\{situacao\}/g, first.situation)
            .replace(/\{link_pagamento\}/g, linkPagamento);
        }
        if (previewOnly) {
          results.push({ owner_id: ownerId, client_id: clientId, client_name: clientById.get(clientId)?.name || "", loan_ids: entries.map((entry: any) => entry.loanId), contracts: entries.length, amount: totalAmount, scheduled_at: new Date(Date.now() + queueIndex * 30_000).toISOString(), message });
          queueIndex += 1;
          continue;
        }
        const scheduledAt = new Date(Date.now() + queueIndex * 30_000).toISOString();
        const { error: queueError } = await admin.from("whatsapp_billing_queue").insert({
          batch_id: batchId, user_id: ownerId, client_id: clientId,
          loan_id: first.loanId, loan_ids: entries.map((entry: any) => entry.loanId),
          installment_number: first.installmentNumber, phone: first.phone, message,
          amount: totalAmount, due_date: first.dueDate, billing_status: first.status,
          scheduled_at: scheduledAt,
        });
        if (queueError && queueError.code !== "23505") throw queueError;
        if (!queueError) queueIndex += 1;
        results.push({ owner_id: ownerId, client_id: clientId, loan_ids: entries.map((entry: any) => entry.loanId), queued: !queueError, duplicate: queueError?.code === "23505" });
      }

      if (!previewOnly) await admin.from("whatsapp_billing_schedule")
        .update({ last_run_at: new Date().toISOString() })
        .eq("owner_id", ownerId);
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-whatsapp-billing] error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
