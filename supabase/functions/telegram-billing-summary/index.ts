import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";

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
  const v = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!v) throw new Error("Service role key não configurada.");
  return v;
}

function getExternalAnonKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (external) return external;
  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;
  const v = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!v) throw new Error("Anon key não configurada.");
  return v;
}

function getExternalAdmin(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey(), {
    auth: { persistSession: false },
  });
}

function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hour, minute] = String(value).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function isTimeDueToday(value: string | null | undefined, nowMinutes: number): boolean {
  const target = timeToMinutes(value);
  return target !== null && nowMinutes >= target;
}

function dueSlotKeys<T extends string>(
  slots: ReadonlyArray<{ key: T; time: string | null | undefined }>,
  nowMinutes: number,
  today: string,
  lastSent: Record<string, string>,
): T[] {
  return slots
    .filter((slot) => isTimeDueToday(slot.time, nowMinutes) && lastSent[slot.key] !== today)
    .map((slot) => slot.key);
}

interface WhatsappProviderConfig {
  provider: string;
  baseUrl: string;
  instanceId: string;
  apiKey: string;
}

async function sendWhatsappText(config: WhatsappProviderConfig, phone: string, message: string) {
  const base = config.baseUrl.replace(/\/+$/, "");
  if (config.provider === "wppconnect") {
    const response = await fetch(`${base}/api/${encodeURIComponent(config.instanceId)}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ phone, message }),
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }
  if (config.provider === "evolution") {
    const response = await fetch(`${base}/message/sendText/${encodeURIComponent(config.instanceId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({ number: phone, text: message }),
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }
  const response = await fetch(`${base}/message/sendText/${encodeURIComponent(config.instanceId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: JSON.stringify({ number: phone, text: message, textMessage: { text: message } }),
  });
  return { ok: response.ok, status: response.status, body: await response.text() };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(n)
    .replace(/\u00a0/g, " ");
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

function normalizePhoneBR(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

interface BillingCandidateItem {
  loanId: string;
  clientId: string;
  clientName: string;
  amount: number;
  interestAmount: number;
  billingDate: string;
}

interface GroupedClientBilling {
  clientName: string;
  amount: number;
  interestAmount: number;
  count: number;
}

function groupCandidatesByClient(candidates: BillingCandidateItem[]): GroupedClientBilling[] {
  const map = new Map<string, GroupedClientBilling>();
  for (const item of candidates) {
    const nameClean = (item.clientName || "").trim();
    const nameKey = nameClean.toLowerCase();
    const idKey = (item.clientId && !item.clientId.startsWith("loan:")) ? `id:${item.clientId}` : `name:${nameKey}`;

    const existing = map.get(idKey) || (nameKey ? map.get(`name:${nameKey}`) : undefined);
    if (existing) {
      existing.amount += item.amount;
      existing.interestAmount += (item.interestAmount || 0);
      existing.count += 1;
    } else {
      const entry: GroupedClientBilling = {
        clientName: nameClean || "Cliente não identificado",
        amount: item.amount,
        interestAmount: item.interestAmount || 0,
        count: 1,
      };
      map.set(idKey, entry);
      if (nameKey) map.set(`name:${nameKey}`, entry);
    }
  }
  return Array.from(new Set(map.values())).sort((a, b) =>
    a.clientName.localeCompare(b.clientName, "pt-BR", { sensitivity: "base" })
  );
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

function getInstallmentAmount(loan: any, schedules: any[], payments: any[] = []): number {
  const totalInstallments = Number(loan.installments || 1);
  if (totalInstallments <= 1) {
    if (loan.remaining_amount != null && Number(loan.remaining_amount) > 0) {
      return Number(loan.remaining_amount);
    }
    if (payments.length > 0) {
      return getBaseRemainingAmount(loan, payments, schedules);
    }
    return Number(loan.custom_installment_value) || calculateInstallment(Number(loan.amount || 0), Number(loan.interest_rate || 0), 1);
  }

  const nextNum = Number(loan.paid_installments || 0) + 1;
  const schedule = schedules.find(
    (s: any) => s.loan_id === loan.id && Number(s.installment_number) === nextNum
  );
  if (schedule) {
    let currentBalance = -1;
    if (loan.remaining_amount != null && Number(loan.remaining_amount) >= 0) {
      currentBalance = Number(loan.remaining_amount);
    } else if (payments.length > 0) {
      const totalExpected = schedules.filter((s: any) => s.loan_id === loan.id).reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
      const totalPaid = payments.filter((p: any) => p.loan_id === loan.id).reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
      currentBalance = Math.max(0, totalExpected - totalPaid);
    }

    if (currentBalance >= 0) {
      const futureSum = schedules
        .filter((s: any) => s.loan_id === loan.id && Number(s.installment_number) > nextNum)
        .reduce((acc: number, s: any) => acc + (Number(s.amount) || 0), 0);
      currentBalance = Math.max(0, currentBalance - futureSum);
      return Math.round(Math.min(Number(schedule.amount), currentBalance) * 100) / 100;
    }
    return Number(schedule.amount);
  }

  const defaultAmt = Number(loan.custom_installment_value) || calculateInstallment(Number(loan.amount || 0), Number(loan.interest_rate || 0), totalInstallments);
  if (loan.remaining_amount != null && Number(loan.remaining_amount) > 0) {
    return Math.round(Math.min(defaultAmt, Number(loan.remaining_amount)) * 100) / 100;
  }
  return Math.round(defaultAmt * 100) / 100;
}

function getOverdueInstallments(
  loan: any,
  schedules: any[],
  todayStr: string,
  payments: any[] = [],
): { installmentNumber: number; dueDate: string; amount: number }[] {
  const paid = Number(loan.paid_installments || 0);
  const totalInstallments = Number(loan.installments || 1);

  if (totalInstallments <= 1) {
    const dueDate = (loan.due_date || "").slice(0, 10);
    if (dueDate < todayStr && paid < 1) {
      const baseRem = loan.remaining_amount != null && Number(loan.remaining_amount) >= 0
        ? Number(loan.remaining_amount)
        : getBaseRemainingAmount(loan, payments, schedules);

      if (baseRem <= 0.01) return [];

      return [{
        installmentNumber: 1,
        dueDate,
        amount: baseRem,
      }];
    }
    return [];
  }

  const hasAnySchedule = schedules.some((s: any) => s.loan_id === loan.id);
  const loanSchedules = schedules
    .filter((s: any) => s.loan_id === loan.id && Number(s.installment_number) > paid && (s.due_date || "").slice(0, 10) < todayStr)
    .sort((a: any, b: any) => Number(a.installment_number) - Number(b.installment_number));

  if (loanSchedules.length > 0) {
    const nextNum = paid + 1;
    return loanSchedules.map((s: any) => ({
      installmentNumber: Number(s.installment_number),
      dueDate: (s.due_date || "").slice(0, 10),
      amount: Number(s.installment_number) === nextNum
        ? getInstallmentAmount(loan, schedules, payments)
        : Number(s.amount || 0),
    }));
  }

  if (hasAnySchedule) return [];

  const dueDate = (loan.due_date || "").slice(0, 10);
  if (dueDate < todayStr) {
    return [{
      installmentNumber: paid + 1,
      dueDate,
      amount: getInstallmentAmount(loan, schedules, payments),
    }];
  }
  return [];
}

function getDueInstallmentsUntilToday(
  loan: any,
  schedules: any[],
  todayStr: string,
  payments: any[] = [],
): { installmentNumber: number; dueDate: string; amount: number }[] {
  const paid = Number(loan.paid_installments || 0);
  const totalInstallments = Number(loan.installments || 1);

  if (totalInstallments <= 1) {
    const dueDate = (loan.due_date || "").slice(0, 10);
    if (dueDate <= todayStr && paid < 1) {
      const baseRem = loan.remaining_amount != null && Number(loan.remaining_amount) >= 0
        ? Number(loan.remaining_amount)
        : getBaseRemainingAmount(loan, payments, schedules);

      if (baseRem <= 0.01) return [];

      return [{
        installmentNumber: 1,
        dueDate,
        amount: baseRem,
      }];
    }
    return [];
  }

  const hasAnySchedule = schedules.some((s: any) => s.loan_id === loan.id);
  const loanSchedules = schedules
    .filter((s: any) => s.loan_id === loan.id && Number(s.installment_number) > paid && (s.due_date || "").slice(0, 10) <= todayStr)
    .sort((a: any, b: any) => Number(a.installment_number) - Number(b.installment_number));

  if (loanSchedules.length > 0) {
    const nextNum = paid + 1;
    return loanSchedules.map((s: any) => ({
      installmentNumber: Number(s.installment_number),
      dueDate: (s.due_date || "").slice(0, 10),
      amount: Number(s.installment_number) === nextNum
        ? getInstallmentAmount(loan, schedules, payments)
        : Number(s.amount || 0),
    }));
  }

  if (hasAnySchedule) return [];

  const dueDate = (loan.due_date || "").slice(0, 10);
  if (dueDate <= todayStr) {
    return [{
      installmentNumber: paid + 1,
      dueDate,
      amount: getInstallmentAmount(loan, schedules, payments),
    }];
  }
  return [];
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

function round2(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function totalWithInterest(amount: number, rate: number): number {
  const p = Math.max(0, Number(amount) || 0);
  const r = Number(rate) || 0;
  return round2(p * (1 + r / 100));
}

interface AllocLoanLike {
  id: string;
  amount: number;
  originalAmount?: number;
  interestRate: number;
  installments: number;
  status?: string;
}

interface AllocPaymentLike {
  id: string;
  loanId: string;
  amount: number;
  date?: string;
  installmentNumber?: number;
  createdAt?: string;
  metadata?: any;
}

interface InstallmentBreakdownEntry {
  installmentNumber: number;
  amount: number;
  interest: number;
  principal: number;
}

function buildInstallmentBreakdown(
  loan: Pick<AllocLoanLike, "amount" | "interestRate" | "installments">,
  customAmounts?: number[],
): InstallmentBreakdownEntry[] {
  const principal = Math.max(0, Number(loan.amount) || 0);
  const N = Math.max(1, Math.floor(Number(loan.installments) || 1));
  const rawTotal = totalWithInterest(principal, Number(loan.interestRate) || 0);

  if (N === 1) {
    const amt = customAmounts?.[0] ?? rawTotal;
    const totalInterest1 = Math.max(0, Math.max(rawTotal, amt) - principal);
    return [{ installmentNumber: 1, amount: round2(amt), interest: round2(totalInterest1), principal: round2(amt - totalInterest1) }];
  }

  const hasCustom = Array.isArray(customAmounts) && customAmounts.length === N;
  const amounts: number[] = hasCustom
    ? customAmounts!.map((v) => round2(Number(v) || 0))
    : Array.from({ length: N }, () => round2(rawTotal / N));
  const amountsSum = amounts.reduce((s, v) => s + v, 0);
  const total = hasCustom ? Math.max(rawTotal, amountsSum) : rawTotal;
  const totalInterest = Math.max(0, total - principal);

  const entries: InstallmentBreakdownEntry[] = [];
  let interestAccum = 0;
  let principalAccum = 0;
  for (let i = 0; i < N; i++) {
    const amount = amounts[i];
    if (i < N - 1) {
      const share = amountsSum > 0 ? amount / amountsSum : 1 / N;
      const interest = round2(totalInterest * share);
      const principalPart = round2(amount - interest);
      entries.push({ installmentNumber: i + 1, amount, interest, principal: principalPart });
      interestAccum += interest;
      principalAccum += principalPart;
    } else {
      const interest = Math.max(0, round2(totalInterest - interestAccum));
      const principalPart = Math.max(0, round2(principal - principalAccum));
      const amt = round2(interest + principalPart);
      entries.push({ installmentNumber: i + 1, amount: amt || amount, interest, principal: principalPart });
    }
  }
  return entries;
}

function allocateInterestByPayment(
  loans: AllocLoanLike[],
  payments: AllocPaymentLike[],
): Map<string, number> {
  const byId = new Map<string, number>();
  const loanById = new Map(loans.map((l) => [l.id, l]));

  const sorted = [...payments].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return da.localeCompare(db);
    const ca = a.createdAt ?? "";
    const cb = b.createdAt ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return (a.id ?? "").localeCompare(b.id ?? "");
  });

  const priorInterestByLoan = new Map<string, number>();
  const priorPrincipalByLoan = new Map<string, number>();
  const interestRemainingByLoan = new Map<string, number>();
  loans.forEach((l) => {
    const total = totalWithInterest(l.amount, l.interestRate);
    interestRemainingByLoan.set(l.id, Math.max(0, total - l.amount));
  });

  const scheduleByLoan = new Map<string, ReturnType<typeof buildInstallmentBreakdown>>();
  for (const loan of loans) {
    if (loan.installments <= 1) continue;
    const totalDue = totalWithInterest(loan.amount, loan.interestRate);
    const N = loan.installments;
    const amounts = Array.from({ length: N }, () => round2(totalDue / N));
    for (const p of sorted) {
      if (p.loanId !== loan.id) continue;
      const k = Number(p.installmentNumber);
      if (k >= 1 && k <= N) amounts[k - 1] = round2(Number(p.amount) || amounts[k - 1]);
    }
    const schedule = buildInstallmentBreakdown(loan, amounts);
    scheduleByLoan.set(loan.id, schedule);
    const scheduledInterest = schedule.reduce((s, e) => s + e.interest, 0);
    interestRemainingByLoan.set(loan.id, Math.max(interestRemainingByLoan.get(loan.id) ?? 0, scheduledInterest));
  }

  for (const p of sorted) {
    const amt = Number(p.amount) || 0;
    if (amt <= 0) { byId.set(p.id, 0); continue; }

    const inst = Number(p.installmentNumber);
    const loan = loanById.get(p.loanId);

    if (inst === 0 || inst === -2) {
      byId.set(p.id, round2(amt));
      const rem = interestRemainingByLoan.get(p.loanId) ?? 0;
      interestRemainingByLoan.set(p.loanId, Math.max(0, rem - amt));
      continue;
    }
    if (inst === -3) {
      byId.set(p.id, 0);
      continue;
    }

    if (!loan) {
      byId.set(p.id, round2(amt));
      continue;
    }

    if (inst === -1) {
      const iRemBefore = interestRemainingByLoan.get(p.loanId) ?? 0;
      const interest = round2(Math.min(iRemBefore, amt));
      byId.set(p.id, interest);
      interestRemainingByLoan.set(p.loanId, Math.max(0, round2(iRemBefore - interest)));
      priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + interest);
      continue;
    }

    const schedule = scheduleByLoan.get(p.loanId);
    let interestPart = 0;
    const remBefore = interestRemainingByLoan.get(p.loanId) ?? 0;
    if (schedule) {
      const entry = schedule.find((e) => e.installmentNumber === inst) ?? schedule[schedule.length - 1];
      interestPart = Math.max(0, Math.min(round2(entry.interest), amt, remBefore));
    } else {
      const principalRemaining = Math.max(
        0,
        round2((loan.amount || 0) - (priorPrincipalByLoan.get(p.loanId) ?? 0)),
      );
      const principalPart = Math.min(amt, principalRemaining);
      interestPart = Math.max(0, round2(amt - principalPart));
    }
    byId.set(p.id, interestPart);
    priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + interestPart);
    interestRemainingByLoan.set(p.loanId, Math.max(0, remBefore - interestPart));
    priorPrincipalByLoan.set(
      p.loanId,
      (priorPrincipalByLoan.get(p.loanId) ?? 0) + Math.max(0, round2(amt - interestPart)),
    );
  }

  const lastPaymentByLoan = new Map<string, { id: string; amount: number }>();
  sorted.forEach((p) => { lastPaymentByLoan.set(p.loanId, { id: p.id, amount: Number(p.amount) || 0 }); });

  for (const loan of loans) {
    if (loan.status !== "paid") continue;
    const last = lastPaymentByLoan.get(loan.id);
    if (!last) continue;
    const total = totalWithInterest(loan.amount, loan.interestRate);
    const scheduled = scheduleByLoan.get(loan.id);
    const scheduledInterest = scheduled ? scheduled.reduce((s, e) => s + e.interest, 0) : 0;
    const nominalInterest = Math.max(0, Math.max(total - loan.amount, scheduledInterest));

    const loanPayments = payments.filter((p) => p.loanId === loan.id);
    const totalPaid = loanPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const realTotalInterest = Math.max(0, round2(totalPaid - (Number(loan.amount) || 0)));
    const targetInterest = Math.max(nominalInterest, realTotalInterest);

    const allocated = loanPayments.reduce((s, p) => s + (byId.get(p.id) ?? 0), 0);
    const diff = round2(targetInterest - allocated);
    if (diff <= 0) continue;
    const cur = byId.get(last.id) ?? 0;
    const cap = Math.max(0, round2(last.amount - cur));
    const add = Math.min(diff, cap);
    if (add > 0) byId.set(last.id, round2(cur + add));
  }

  return byId;
}

function allocateInterestByPaymentUpTo(
  loans: AllocLoanLike[],
  payments: AllocPaymentLike[],
  cutoffDate: string,
): Map<string, number> {
  const cutoff = String(cutoffDate ?? "").slice(0, 10);
  const subset = cutoff ? payments.filter((p) => (p.date ?? "").slice(0, 10) <= cutoff) : payments;
  return allocateInterestByPayment(loans, subset);
}

function sumInterestReceivedInPeriod(
  loans: AllocLoanLike[],
  payments: AllocPaymentLike[],
  start: string,
  end: string,
): number {
  const startIso = start.slice(0, 10);
  const endIso = end.slice(0, 10);
  const alloc = allocateInterestByPaymentUpTo(loans, payments, endIso);
  let total = 0;
  for (const p of payments) {
    const d = (p.date ?? "").slice(0, 10);
    if (d < startIso || d > endIso) continue;
    total += alloc.get(p.id) ?? 0;
  }
  return round2(total);
}

async function buildWhatsappBillingReport(admin: any, ownerId: string, today: string): Promise<string> {
  const todayStart = `${today}T00:00:00-03:00`;
  const tomorrowObj = new Date(`${today}T00:00:00-03:00`);
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowIso = tomorrowObj.toISOString();

  const [loansRes, clientsRes, schedulesRes, paymentsRes, promisesRes, sentQueueRes] = await Promise.all([
    admin.from("loans").select("*").eq("user_id", ownerId),
    admin.from("clients").select("*").eq("user_id", ownerId),
    admin.from("loan_installments").select("*").eq("user_id", ownerId),
    admin.from("payments").select("*").eq("user_id", ownerId),
    admin.from("whatsapp_payment_promises").select("loan_id, installment_number, promised_date").eq("user_id", ownerId),
    admin.from("whatsapp_billing_queue").select("client_id, loan_id, loan_ids, status, sent_at").eq("user_id", ownerId).eq("status", "sent").gte("sent_at", todayStart).lt("sent_at", tomorrowIso),
  ]);

  const loans = loansRes.data ?? [];
  const clients = clientsRes.data ?? [];
  const schedules = schedulesRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const promises = promisesRes.data ?? [];
  const clientById = new Map<string, any>(clients.map((c: any) => [c.id, c]));

  const finiteMoney = (val: any, fallback = 0) => {
    const n = Number(val);
    return Number.isFinite(n) ? Math.max(0, n) : fallback;
  };

  const candidates: BillingCandidateItem[] = [];

  for (const loan of loans) {
    if (loan.status === "paid") continue;

    const paidInstallments = Number(loan.paid_installments || 0);
    const totalInstallments = Math.max(1, Number(loan.installments || 1));
    if (paidInstallments >= totalInstallments) continue;

    const client = loan.borrower_id ? clientById.get(loan.borrower_id) : undefined;
    const clientId = client?.id || loan.borrower_id || `loan:${loan.id}`;
    const clientName = client?.name || loan.borrower_name || "Cliente não identificado";
    const nextInstallmentNum = paidInstallments + 1;

    const schedule = schedules.find(
      (s: any) => s.loan_id === loan.id && Number(s.installment_number) === nextInstallmentNum
    );
    const dueDate = (schedule?.due_date || loan.due_date || "").slice(0, 10);
    const storedPromise = promises.find(
      (p: any) => p.loan_id === loan.id && Number(p.installment_number) === nextInstallmentNum
    );
    const rawPromisedDate = storedPromise?.promised_date;
    const promisedDate = (rawPromisedDate && rawPromisedDate >= dueDate) ? rawPromisedDate : undefined;
    const billingDate = promisedDate || dueDate;

    // Filtro da aba "A cobrar" (billingDate <= hoje)
    if (billingDate > today) continue;

    // Cálculo exato de valor e juros idêntico à Central de Cobranças
    const safeRemaining = finiteMoney(loan.remaining_amount);
    const safePrincipal = finiteMoney(loan.amount);
    const totalPaid = payments
      .filter((p: any) => p.loan_id === loan.id)
      .reduce((sum: number, p: any) => sum + finiteMoney(p.amount), 0);
    const totalExpected = Math.round(safePrincipal * (1 + (Number(loan.interest_rate) || 0) / 100));

    // Matriz de 1 parcela (exatamente o campo "Restante" da aba Empréstimos):
    const lateFeesBreakdown = getLoanLateFees(loan, payments, schedules, today);
    const renegPenaltyPending = (totalInstallments < 2 && loan.status !== "paid")
      ? Number(loan.renegotiation_penalty_total || 0)
      : 0;
    const loanLateFees = lateFeesBreakdown.lateFees + renegPenaltyPending;

    const baseRemainingSingle = loan.status === "paid"
      ? 0
      : safeRemaining > 0
        ? safeRemaining
        : Math.max(0, totalExpected - totalPaid);
    const singleInstallmentRemaining = loan.status === "paid"
      ? 0
      : baseRemainingSingle + loanLateFees;

    const dueInstallments = totalInstallments > 1
      ? getDueInstallmentsUntilToday(loan, schedules, today, payments)
      : [];
    const dueInstallmentCount = dueInstallments.length;
    const dueBase = dueInstallments.reduce(
      (sum: number, inst: any) => sum + finiteMoney(inst.amount),
      0,
    );

    const overdueInstallments = totalInstallments > 1
      ? getOverdueInstallments(loan, schedules, today, payments)
      : [];
    const overdueInstallmentCount = overdueInstallments.length;

    let amount = 0;
    let baseAmount = 0;
    let installmentCount = 1;

    if (totalInstallments > 1) {
      if (dueInstallmentCount > 0) {
        amount = dueBase;
        installmentCount = dueInstallmentCount;
      } else {
        const nextInstallment = getInstallmentAmount(loan, schedules, payments);
        const fallbackUnit = finiteMoney(
          Number(loan.custom_installment_value) || calculateInstallment(safePrincipal, Number(loan.interest_rate || 0), totalInstallments)
        );
        amount = nextInstallment > 0 ? nextInstallment : fallbackUnit;
        installmentCount = 1;
      }
      if (safeRemaining > 0 && amount > safeRemaining) {
        amount = safeRemaining;
      }
      baseAmount = amount;
    } else {
      amount = singleInstallmentRemaining;
      baseAmount = baseRemainingSingle;
      installmentCount = 1;
    }

    amount = Math.round(amount * 100) / 100;
    baseAmount = Math.round(baseAmount * 100) / 100;

    let chargedPrincipal = 0;
    if (totalInstallments > 1) {
      const principalPerInstallment = safePrincipal / Math.max(1, totalInstallments);
      chargedPrincipal = Math.min(amount, principalPerInstallment * installmentCount);
    } else {
      const contractualInterestRate = Number(loan.interest_rate) || 0;
      const nominalInterest = (safePrincipal * contractualInterestRate) / 100;
      const basePrincipal = Math.max(0, baseRemainingSingle - nominalInterest);
      chargedPrincipal = Math.min(safePrincipal, basePrincipal);
      if (chargedPrincipal > amount) {
        chargedPrincipal = amount;
      }
    }

    let interestAmount = Math.max(0, Math.round((amount - chargedPrincipal) * 100) / 100);
    const cents = Math.round((Math.abs(interestAmount) % 1) * 100);
    if (cents >= 1 && cents <= 3 || cents >= 97 && cents <= 99) {
      const nearestInteger = Math.round(interestAmount);
      if (Math.abs(interestAmount - nearestInteger) <= 0.035) {
        interestAmount = nearestInteger;
      }
    }
    interestAmount = Math.min(interestAmount, amount);

    candidates.push({
      loanId: loan.id,
      clientId,
      clientName,
      amount,
      interestAmount,
      billingDate,
    });
  }

  const sentIds = new Set<string>();
  const sentClientIds = new Set<string>();
  (sentQueueRes.data || []).forEach((row: any) => {
    if (row.client_id) sentClientIds.add(row.client_id);
    const loanList = Array.isArray(row.loan_ids) && row.loan_ids.length ? row.loan_ids : (row.loan_id ? [row.loan_id] : []);
    loanList.forEach((id: string) => { if (id) sentIds.add(id); });
  });

  const isSent = (item: BillingCandidateItem) =>
    sentIds.has(item.loanId) || (Boolean(item.clientId) && Boolean(sentClientIds.has(item.clientId)));

  const enviadas = candidates.filter(isSent);
  const naoEnviadas = candidates.filter((item) => !isSent(item));

  const totalCount = candidates.length;
  const totalAmount = candidates.reduce((s, i) => s + i.amount, 0);
  const totalInterest = candidates.reduce((s, i) => s + (i.interestAmount || 0), 0);

  const envCount = enviadas.length;
  const envAmount = enviadas.reduce((s, i) => s + i.amount, 0);
  const envInterest = enviadas.reduce((s, i) => s + (i.interestAmount || 0), 0);

  const naoCount = naoEnviadas.length;
  const naoAmount = naoEnviadas.reduce((s, i) => s + i.amount, 0);
  const naoInterest = naoEnviadas.reduce((s, i) => s + (i.interestAmount || 0), 0);

  const groupedEnviadas = groupCandidatesByClient(enviadas);
  const groupedNaoEnviadas = groupCandidatesByClient(naoEnviadas);

  // Total recebido e Juros recebidos no dia atual (exata paridade com Dashboard)
  const allocLoans: AllocLoanLike[] = loans.map((l: any) => ({
    id: String(l.id),
    amount: Number(l.amount) || 0,
    originalAmount: l.original_amount != null ? Number(l.original_amount) : Number(l.amount),
    interestRate: Number(l.interest_rate) || 0,
    installments: Math.max(1, Number(l.installments) || 1),
    status: l.status,
  }));

  const allocPayments: AllocPaymentLike[] = payments.map((p: any) => ({
    id: String(p.id),
    loanId: String(p.loan_id),
    amount: Number(p.amount) || 0,
    date: p.date,
    installmentNumber: Number(p.installment_number),
    createdAt: p.created_at || p.createdAt,
    metadata: p.metadata,
  }));

  const paymentsToday = payments.filter((p: any) => (p.date || "").slice(0, 10) === today);
  const totalReceivedToday = paymentsToday.reduce((sum: number, p: any) => sum + finiteMoney(p.amount), 0);
  const interestReceivedToday = sumInterestReceivedInPeriod(allocLoans, allocPayments, today, today);

  const dateFormatted = formatDateBR(today);

  const lines: string[] = [
    `📊 *RESUMO DAS COBRANÇAS — HOJE*`,
    ``,
    `📌 *RESUMO DO DIA — ${dateFormatted}*`,
    ``,
    `Total de cobranças: *${totalCount}*`,
    `✅ Enviadas: *${envCount}*`,
    `⚠️ Não enviadas: *${naoCount}*`,
    ``,
    `💰 Juros a cobrar: *${fmtBRL(totalInterest)}*`,
    `💵 Total a cobrar: *${fmtBRL(totalAmount)}*`,
    ``,
    `🪙 Juros recebidos: *${fmtBRL(interestReceivedToday)}*`,
    `📥 Total recebido: *${fmtBRL(totalReceivedToday)}*`,
    ``,
    `📈 Juros total: *${fmtBRL(totalInterest + interestReceivedToday)}*`,
    `💼 Total geral: *${fmtBRL(totalAmount + totalReceivedToday)}*`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `✅ *COBRANÇAS ENVIADAS*`,
    ``,
  ];

  if (groupedEnviadas.length === 0) {
    lines.push(`Nenhuma cobrança enviada.`);
  } else {
    groupedEnviadas.forEach((item) => {
      lines.push(`*${item.clientName}* / Contratos: ${item.count} / Juros: ${fmtBRL(item.interestAmount)} / Total: ${fmtBRL(item.amount)}`);
    });
  }

  lines.push(
    ``,
    `*Total enviado: ${envCount} / ${fmtBRL(envInterest)} / ${fmtBRL(envAmount)}*`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `⚠️ *COBRANÇAS NÃO ENVIADAS*`,
    ``,
  );

  if (groupedNaoEnviadas.length === 0) {
    lines.push(`Nenhuma cobrança pendente.`);
  } else {
    groupedNaoEnviadas.forEach((item) => {
      lines.push(`*${item.clientName}* / Contratos: ${item.count} / Juros: ${fmtBRL(item.interestAmount)} / Total: ${fmtBRL(item.amount)}`);
    });
  }

  lines.push(
    ``,
    `*Total não enviado: ${naoCount} / ${fmtBRL(naoInterest)} / ${fmtBRL(naoAmount)}*`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `*Resumo gerado automaticamente pelo EmprestAI.*`
  );

  return lines.join("\n");
}

async function sendWhatsappReportAuto(admin: any, ownerId: string, text: string): Promise<{ sent: boolean; reason?: string }> {
  let phone = "";
  const { data: opPref } = await admin
    .from("telegram_operational_summary_prefs")
    .select("whatsapp_phone")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (opPref?.whatsapp_phone) phone = normalizePhoneBR(opPref.whatsapp_phone);

  if (!phone) {
    const { data: prof } = await admin.from("profiles").select("phone").eq("user_id", ownerId).maybeSingle();
    if (prof?.phone) phone = normalizePhoneBR(prof.phone);
  }

  if (!phone) return { sent: false, reason: "no_phone_configured" };

  let baseUrl = "";
  let instanceId = "";
  let apiKey = "";
  let provider = "evolution";

  const { data: sched } = await admin.from("whatsapp_billing_schedule").select("*").eq("owner_id", ownerId).maybeSingle();
  if (sched?.base_url && sched?.instance_id) {
    baseUrl = sched.base_url.trim();
    instanceId = sched.instance_id.trim();
    apiKey = sched.api_key || apiKey;
    provider = sched.provider || provider;
  }

  if (!baseUrl || !instanceId) {
    const { data: allSchedRows } = await admin.from("whatsapp_billing_schedule").select("*").not("base_url", "is", null).neq("base_url", "").limit(10);
    const found = (allSchedRows || []).find((r: any) => Boolean(r.base_url?.trim() && r.instance_id?.trim()));
    if (found) {
      baseUrl = found.base_url.trim();
      instanceId = found.instance_id.trim();
      apiKey = found.api_key || apiKey;
      provider = found.provider || provider;
    }
  }

  if (!baseUrl || !instanceId) {
    const envUrl = Deno.env.get("EVOLUTION_BASE_URL") || Deno.env.get("WHATSMIAU_BASE_URL") || "";
    const envInst = Deno.env.get("EVOLUTION_INSTANCE") || Deno.env.get("WHATSMIAU_INSTANCE_ID") || "";
    if (envUrl && envInst) {
      baseUrl = envUrl.trim();
      instanceId = envInst.trim();
    }
  }

  if (!baseUrl || !instanceId) return { sent: false, reason: "whatsapp_not_configured" };

  if (!apiKey) {
    apiKey = Deno.env.get("EVOLUTION_API_KEY") || Deno.env.get("WHATSMIAU_API_KEY") || "";
  }

  const res = await sendWhatsappText({ provider, baseUrl, instanceId, apiKey }, phone, text);
  return { sent: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}: ${res.body}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = getExternalAdmin();
  const url = new URL(req.url);
  const forceUserId = url.searchParams.get("user_id");
  const forceAll = url.searchParams.get("force") === "1" || url.searchParams.get("force_all") === "1";
  const returnText = url.searchParams.get("return_text") === "1";

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

  if (forceUserId && returnText) {
    const { date: today2 } = todayInTZ();
    const text = await buildWhatsappBillingReport(admin, forceUserId, today2);
    return new Response(JSON.stringify({ ok: true, text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { date: today, hhmm } = todayInTZ();
  const [hh, mm] = hhmm.split(":").map(Number);
  const nowMin = hh * 60 + mm;

  let query = admin.from("telegram_billing_prefs").select("*");
  if (forceUserId) query = query.eq("user_id", forceUserId);

  const { data: prefs, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let sent = 0;
  const errors: string[] = [];
  let lastReport = "";

  for (const pref of prefs ?? []) {
    try {
      const slots = [
        { key: "send_time_1", time: (pref as any).send_time_1 },
        { key: "send_time_2", time: (pref as any).send_time_2 },
        { key: "send_time_3", time: (pref as any).send_time_3 },
      ] as const;
      const lastSent = (pref.last_sent ?? {}) as Record<string, string>;
      const slotsToSend: string[] = (forceUserId || forceAll) ? ["manual"] : dueSlotKeys(slots, nowMin, today, lastSent);

      if (slotsToSend.length === 0) continue;

      let anySent = false;
      const reportText = await buildWhatsappBillingReport(admin, pref.user_id, today);
      lastReport = reportText;

      // 1. Envio automático exclusivamente via WhatsApp
      const wppRes = await sendWhatsappReportAuto(admin, pref.user_id, reportText);
      if (wppRes.sent) {
        anySent = true;
      } else {
        errors.push(`${pref.user_id} WhatsApp: ${wppRes.reason || "fail"}`);
      }

      if (anySent && !forceUserId) {
        const merged = { ...lastSent } as Record<string, string>;
        for (const slot of slotsToSend) merged[slot] = today;
        await admin.from("telegram_billing_prefs")
          .update({ last_sent: merged })
          .eq("user_id", pref.user_id);
        sent++;
      }
    } catch (e: any) {
      console.error("billing summary error for", pref.user_id, e);
      errors.push(`${pref.user_id}: ${e?.message || String(e)}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: prefs?.length ?? 0, hhmm, errors, lastReport }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
