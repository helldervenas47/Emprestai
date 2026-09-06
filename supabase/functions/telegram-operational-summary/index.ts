import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { requireCronOrAdmin, cronCors } from "../_shared/require-cron-or-admin.ts";

const corsHeaders = {
  ...cronCors,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";

export function getExternalSupabaseUrl(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (external?.includes(EXTERNAL_PROJECT_REF)) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF)) return nativeUrl;

  return `https://${EXTERNAL_PROJECT_REF}.supabase.co`;
}

export function getExternalServiceRoleKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SERVICE_ROLE_KEY") || "";
}

export function getExternalAnonKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("EXTERNAL_ANON_KEY") || "";
}

export function getExternalAdmin(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function roundCommission99(val: number): number {
  if (!Number.isFinite(val)) return 0;
  const rounded = Math.round(val * 100) / 100;
  const cents = Math.round((Math.abs(rounded) % 1) * 100);
  if (cents === 99) {
    return Math.round(rounded);
  }
  return rounded;
}

function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtDateBR(iso: string): string {
  const parts = String(iso).slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return iso;
}

function nowParts(tz = "America/Sao_Paulo") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    today: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
  };
}

let _cachedReportsBotId: { id: string | null; ts: number } | null = null;

async function getReportsBotId(supabase: any): Promise<string | null> {
  if (_cachedReportsBotId && Date.now() - _cachedReportsBotId.ts < 5 * 60 * 1000) {
    return _cachedReportsBotId.id;
  }
  try {
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
  } catch {
    return null;
  }
}

async function getReportsLinkForUser(supabase: any, userId: string): Promise<{ chat_id: number } | null> {
  try {
    const botId = await getReportsBotId(supabase);
    if (!botId) return null;
    const { data: dedicated } = await supabase
      .from("telegram_reports_links")
      .select("chat_id")
      .eq("user_id", userId)
      .eq("bot_id", botId)
      .maybeSingle();
    if (dedicated) return { chat_id: Number((dedicated as any).chat_id) };

    const { data } = await supabase
      .from("telegram_links")
      .select("chat_id")
      .eq("user_id", userId)
      .eq("bot_id", botId)
      .maybeSingle();
    if (!data) return null;
    return { chat_id: Number((data as any).chat_id) };
  } catch {
    return null;
  }
}

async function sendReportsMessage(supabase: any, userId: string, chatId: number, text: string) {
  try {
    const { data: bot } = await supabase
      .from("system_telegram_bots")
      .select("token")
      .eq("purpose", "reports")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!bot?.token) return { sent: false, reason: "no_bot_token" };

    const res = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });
    const json = await res.json();
    return { sent: !!json.ok, reason: json.description };
  } catch (e: any) {
    return { sent: false, reason: e?.message || "fetch_error" };
  }
}

function totalWithInterest(principal: number, rate: number): number {
  return Math.round(principal * (1 + rate / 100));
}

function calculateTotalWithInterest(principal: number, rate: number): number {
  return totalWithInterest(principal, rate);
}

// =========================================================================
// MOTOR OFICIAL DE ALOCAÇÃO DE JUROS — CARD "FATURAMENTO DO PERÍODO" (DASHBOARD)
// =========================================================================

interface AllocLoanLike {
  id: string;
  amount: number;
  interestRate: number;
  installments: number;
  status?: string;
}

interface AllocPaymentLike {
  id: string;
  loanId: string;
  amount: number;
  date?: string;
  installmentNumber: number;
  createdAt?: string;
  metadata?: Record<string, any> | null;
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
    const rawTotal = totalWithInterest(Number(l.amount) || 0, Number(l.interestRate) || 0);
    const totInt = Math.max(0, rawTotal - (Number(l.amount) || 0));
    interestRemainingByLoan.set(l.id, totInt);
  });

  const scheduleByLoan = new Map<string, InstallmentBreakdownEntry[]>();
  for (const loan of loans) {
    if (loan.installments <= 1) continue;
    const totalDue = totalWithInterest(Number(loan.amount) || 0, Number(loan.interestRate) || 0);
    const N = loan.installments;
    const amounts = Array.from({ length: N }, () => round2(totalDue / N));
    for (const p of sorted) {
      if (p.loanId !== loan.id) continue;
      const k = p.installmentNumber;
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
      priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + amt);
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
      const meta = (p.metadata ?? {}) as any;
      const persisted = meta.interest_amount != null ? Number(meta.interest_amount) : null;
      const iRemBefore = interestRemainingByLoan.get(p.loanId) ?? 0;
      let interest = 0;
      if (persisted != null) {
        interest = Math.min(persisted, amt);
      } else {
        interest = round2(Math.min(iRemBefore, amt));
      }
      byId.set(p.id, interest);
      interestRemainingByLoan.set(p.loanId, Math.max(0, round2(iRemBefore - interest)));
      priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + interest);
      priorPrincipalByLoan.set(p.loanId, (priorPrincipalByLoan.get(p.loanId) ?? 0) + Math.max(0, round2(amt - interest)));
      continue;
    }

    const schedule = scheduleByLoan.get(p.loanId);
    let interestPart = 0;
    const remBefore = interestRemainingByLoan.get(p.loanId) ?? 0;
    if (schedule) {
      const entry = schedule.find((e) => e.installmentNumber === inst) ?? schedule[schedule.length - 1];
      interestPart = Math.max(0, Math.min(round2(entry.interest), amt, remBefore));
    } else {
      const principalRemaining = Math.max(0, round2((Number(loan.amount) || 0) - (priorPrincipalByLoan.get(p.loanId) ?? 0)));
      const principalPart = Math.min(amt, principalRemaining);
      interestPart = Math.max(0, round2(amt - principalPart));
    }
    byId.set(p.id, interestPart);
    priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + interestPart);
    interestRemainingByLoan.set(p.loanId, Math.max(0, remBefore - interestPart));
    priorPrincipalByLoan.set(p.loanId, (priorPrincipalByLoan.get(p.loanId) ?? 0) + Math.max(0, round2(amt - interestPart)));
  }

  const lastPaymentByLoan = new Map<string, { id: string; amount: number }>();
  sorted.forEach((p) => { lastPaymentByLoan.set(p.loanId, { id: p.id, amount: Number(p.amount) || 0 }); });

  for (const loan of loans) {
    if (loan.status !== "paid") continue;
    const last = lastPaymentByLoan.get(loan.id);
    if (!last) continue;
    const total = totalWithInterest(Number(loan.amount) || 0, Number(loan.interestRate) || 0);
    const scheduled = scheduleByLoan.get(loan.id);
    const scheduledInterest = scheduled ? scheduled.reduce((s, e) => s + e.interest, 0) : 0;
    const expectedInterest = Math.max(0, Math.max(total - (Number(loan.amount) || 0), scheduledInterest));
    const allocated = payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + (byId.get(p.id) ?? 0), 0);
    const diff = round2(expectedInterest - allocated);
    if (diff > 0) {
      const cur = byId.get(last.id) ?? 0;
      const cap = Math.max(0, round2(last.amount - cur));
      const add = Math.min(diff, cap);
      if (add > 0) byId.set(last.id, round2(cur + add));
    }
  }

  return byId;
}

function allocateInterestByPaymentUpTo(
  loans: AllocLoanLike[],
  payments: AllocPaymentLike[],
  cutoffDate: string,
): Map<string, number> {
  const cutoff = String(cutoffDate ?? "");
  const subset = cutoff ? payments.filter((p) => (p.date ?? "").slice(0, 10) <= cutoff) : payments;
  return allocateInterestByPayment(loans, subset);
}

function sumInterestReceivedInPeriod(
  loans: AllocLoanLike[],
  payments: AllocPaymentLike[],
  startIso: string,
  endIso: string,
): number {
  const alloc = allocateInterestByPaymentUpTo(loans, payments, endIso);
  let total = 0;
  for (const p of payments) {
    const d = (p.date ?? "").slice(0, 10);
    if (d < startIso || d > endIso) continue;
    total += alloc.get(p.id) ?? 0;
  }
  return round2(total);
}

// =========================================================================
// TAXA DE INADIMPLÊNCIA DA ABA METAS (computeDefaultRate)
// =========================================================================

function computeDefaultRateFromGoals(
  loans: any[],
  payments: any[],
  installmentSchedules: any[],
  m: string, // YYYY-MM
  cutoffDate: string, // YYYY-MM-DD
): number {
  const totalPaidByLoan = payments.reduce<Record<string, number>>((acc, payment: any) => {
    const loanId = String(payment.loan_id || payment.loanId || "");
    const pDate = (payment.date || "").slice(0, 10);
    if (!loanId || !pDate || pDate > cutoffDate) return acc;
    acc[loanId] = (acc[loanId] || 0) + (Number(payment.amount) || 0);
    return acc;
  }, {});

  let periodPortfolio = 0;
  let overdueAmount = 0;

  loans.forEach((loan: any) => {
    const installments = Math.max(1, Number(loan.installments) || 1);
    const principal = Number(loan.amount) || 0;
    const rate = Number(loan.interest_rate ?? loan.interestRate) || 0;
    const totalWithInterestVal = totalWithInterest(principal, rate);
    const installmentValue = totalWithInterestVal / installments;

    const paidAmount = totalPaidByLoan[String(loan.id)] || 0;
    const calculatedPaidInstallments = Math.floor((paidAmount + 0.01) / installmentValue);

    const loanSchedules = installmentSchedules
      .filter((s: any) => String(s.loan_id || s.loanId) === String(loan.id))
      .sort((a: any, b: any) => Number(a.installment_number ?? a.installmentNumber) - Number(b.installment_number ?? b.installmentNumber));

    const dueEntries = loanSchedules.length > 0
      ? loanSchedules.map((s: any) => ({
          installmentNumber: Number(s.installment_number ?? s.installmentNumber),
          dueDate: (s.due_date || s.dueDate || "").slice(0, 10),
          amount: Number(s.amount) || installmentValue,
        }))
      : installments <= 1
        ? [{ installmentNumber: 1, dueDate: (loan.due_date || loan.dueDate || "").slice(0, 10), amount: totalWithInterestVal }]
        : Array.from({ length: installments }, (_, index) => {
            const baseStr = (loan.due_date || loan.dueDate || "").slice(0, 10);
            if (!baseStr) return { installmentNumber: index + 1, dueDate: "", amount: installmentValue };
            const [by, bm, bd] = baseStr.split("-").map(Number);
            const due = new Date(by, (bm - 1) + index, bd);
            return {
              installmentNumber: index + 1,
              dueDate: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
              amount: installmentValue,
            };
          });

    dueEntries.forEach((entry) => {
      if (!entry.dueDate || entry.dueDate.slice(0, 7) !== m) return;
      periodPortfolio += entry.amount;

      const isPaidAtCutoff = entry.installmentNumber <= calculatedPaidInstallments;
      if (isPaidAtCutoff || entry.dueDate >= cutoffDate) return;

      if (installments === 1) {
        overdueAmount += Math.max(0, totalWithInterestVal - paidAmount);
        return;
      }

      overdueAmount += entry.amount;
    });
  });

  return periodPortfolio > 0 ? (overdueAmount / periodPortfolio) * 100 : 0;
}

// =========================================================================
// GERAÇÃO DO RESUMO OPERACIONAL
// =========================================================================

export async function generateOperationalSummaryReport(admin: any, userId: string, date: string): Promise<string> {
  const currentMonthPrefix = date.slice(0, 7); // YYYY-MM
  const monthStart = `${currentMonthPrefix}-01`;

  const [yearNum, monthNum] = currentMonthPrefix.split("-").map(Number);
  const prevDateObj = new Date(yearNum, (monthNum - 1) - 1, 1);
  const prevMonthPrefix = `${prevDateObj.getFullYear()}-${String(prevDateObj.getMonth() + 1).padStart(2, "0")}`;

  let loans: any[] = [];
  let payments: any[] = [];
  let schedules: any[] = [];
  let expenses: any[] = [];
  let clients: any[] = [];
  let commissions: any[] = [];
  let snaps: any[] = [];

  try {
    const res = await admin.from("loans").select("*").eq("user_id", userId);
    loans = res.data ?? [];
  } catch (_) {}

  try {
    const res = await admin.from("payments").select("*").eq("user_id", userId);
    payments = res.data ?? [];
  } catch (_) {}

  try {
    const loanIds = loans.map((l: any) => l.id);
    if (loanIds.length > 0) {
      for (let i = 0; i < loanIds.length; i += 50) {
        const chunk = loanIds.slice(i, i + 50);
        const res = await admin.from("loan_installments").select("*").in("loan_id", chunk);
        if (res.data) schedules.push(...res.data);
      }
    }
  } catch (_) {}

  try {
    const res = await admin.from("expenses").select("*").eq("user_id", userId);
    expenses = res.data ?? [];
  } catch (_) {}

  try {
    const res = await admin.from("clients").select("*").eq("user_id", userId);
    clients = res.data ?? [];
  } catch (_) {}

  try {
    const res = await admin.from("manager_commissions").select("*").eq("user_id", userId);
    commissions = res.data ?? [];
  } catch (_) {}

  try {
    const res = await admin.from("patrimonio_snapshots").select("*").eq("owner_id", userId);
    snaps = res.data ?? [];
  } catch (_) {
    try {
      const res2 = await admin.from("patrimonio_snapshots").select("*").eq("user_id", userId);
      snaps = res2.data ?? [];
    } catch (_) {}
  }

  const loansById = new Map(loans.map((l: any) => [l.id, l]));

  const allocLoans: AllocLoanLike[] = loans.map((l: any) => ({
    id: String(l.id),
    amount: Number(l.amount) || 0,
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

  // 1. Total recebido no dia
  const paymentsToday = payments.filter((p: any) => p.date === date);
  const totalReceivedToday = paymentsToday.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  // 2. Juros recebidos no dia — Extraído exclusivamente como no card "Faturamento do Período" (Dashboard)
  const interestReceivedToday = sumInterestReceivedInPeriod(allocLoans, allocPayments, date, date);

  // 3. Juros recebidos no mês — Extraído exclusivamente como no card "Faturamento do Período" (Dashboard)
  const interestReceivedMonth = sumInterestReceivedInPeriod(allocLoans, allocPayments, monthStart, date);

  // 4 & 5. Comissões de gerentes
  const managers = clients.filter((c: any) => c.is_manager || c.isManager);
  const managerIds = new Set(managers.map((m: any) => m.id));

  let commissionPaidToday = 0;
  let commissionPaidMonth = 0;

  commissions.forEach((c: any) => {
    const p = payments.find((pay: any) => pay.id === c.payment_id);
    const effDate = p?.date || (c.generated_at ? c.generated_at.slice(0, 10) : "");
    const amt = roundCommission99(Number(c.amount) || 0);
    if (effDate === date) commissionPaidToday += amt;
    if (effDate >= monthStart && effDate <= date) commissionPaidMonth += amt;
  });

  const registeredPaymentIds = new Set(commissions.map((c: any) => c.payment_id).filter(Boolean));
  payments.forEach((p: any) => {
    if (registeredPaymentIds.has(p.id)) return;
    const loan = loansById.get(p.loan_id);
    if (!loan || !loan.has_manager) return;

    let mgrId = loan.manager_id || loan.borrower_id;
    if (!mgrId || !managerIds.has(mgrId)) return;

    const rate = Number(loan.manager_commission_rate ?? 10);
    const base = Number(loan.original_amount ?? loan.amount ?? 0);
    const totalCom = roundCommission99((base * rate) / 100);
    const perInst = roundCommission99(totalCom / Math.max(1, Number(loan.installments) || 1));

    let derived = 0;
    if (Number(p.installment_number) > 0) derived = perInst;
    else if (Number(p.installment_number) === 0) derived = totalCom;
    else if (Number(p.installment_number) === -1 && loan.installments === 1 && loan.status === "paid") derived = totalCom;

    if (derived > 0) {
      if (p.date === date) commissionPaidToday += derived;
      if (p.date >= monthStart && p.date <= date) commissionPaidMonth += derived;
    }
  });

  commissionPaidToday = roundCommission99(commissionPaidToday);
  commissionPaidMonth = roundCommission99(commissionPaidMonth);

  // 6. Despesas empresariais pagas no dia
  const businessExpensesToday = expenses.filter((e: any) => {
    const isPaid = e.paid === true;
    const paidDate = e.paid_date || e.paidDate || "";
    const isBusiness = (e.scope ?? "business") !== "personal";
    return isPaid && paidDate === date && isBusiness;
  });
  const businessExpensesPaidToday = businessExpensesToday.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

  // 7 & 8. Empréstimos realizados no dia
  const loansToday = loans.filter((l: any) => l.start_date === date || l.startDate === date);
  const totalLentToday = loansToday.reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
  const loansCountToday = loansToday.length;

  // 9. Saldo do mês: Fluxo de Caixa / Movimentações Mensais (Aba Contador)
  const paymentsMonth = payments.filter((p: any) => p.date >= monthStart && p.date <= date);
  const totalInMonth = paymentsMonth.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);

  const loansMonth = loans.filter((l: any) => {
    const st = l.start_date || l.startDate || "";
    return st >= monthStart && st <= date;
  });
  const loansOutgoingMonth = loansMonth.reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);

  const businessExpensesMonth = expenses.filter((e: any) => {
    const isPaid = e.paid === true;
    const paidDate = e.paid_date || e.paidDate || e.due_date || e.dueDate || "";
    const isBusiness = (e.scope ?? "business") !== "personal";
    return isPaid && isBusiness && paidDate >= monthStart && paidDate <= date;
  });
  const expensesOutgoingMonth = businessExpensesMonth.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

  const totalOutMonth = loansOutgoingMonth + expensesOutgoingMonth;
  const saldoMes = totalInMonth - totalOutMonth;

  // 10. Taxa de inadimplência atual da aba METAS (max_default_rate)
  const defaultRate = computeDefaultRateFromGoals(loans, payments, schedules, currentMonthPrefix, date);

  // 11. Variação mensal do patrimônio em porcentagem (%) — Idêntica à meta 'monthly_variation' da aba Metas
  const activeLoans = loans.filter((l: any) => l.status !== "paid");
  let totalActivePortfolio = 0;
  activeLoans.forEach((l: any) => {
    const principal = Number(l.amount) || 0;
    const rate = Number(l.interest_rate) || 0;
    const totalWithInt = totalWithInterest(principal, rate);
    const paidForLoan = payments
      .filter((p: any) => p.loan_id === l.id)
      .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
    const remaining = l.remaining_amount != null && Number(l.remaining_amount) > 0
      ? Number(l.remaining_amount)
      : Math.max(0, totalWithInt - paidForLoan);
    totalActivePortfolio += remaining;
  });

  const currentSnap = snaps.find((s: any) => s.month === currentMonthPrefix);
  const prevSnap = snaps.find((s: any) => s.month === prevMonthPrefix);

  const currentTotalPatrimonio = currentSnap?.total != null
    ? Number(currentSnap.total)
    : (Number(currentSnap?.account || 0) + totalActivePortfolio);

  const prevTotalPatrimonio = prevSnap?.total != null
    ? Number(prevSnap.total)
    : (prevSnap ? Number(prevSnap.account || 0) + Number(prevSnap.rua || 0) : null);

  let monthlyVariationPct = 0;
  if (prevTotalPatrimonio != null && prevTotalPatrimonio !== 0 && currentTotalPatrimonio != null) {
    monthlyVariationPct = ((currentTotalPatrimonio - prevTotalPatrimonio) / Math.abs(prevTotalPatrimonio)) * 100;
  }

  const variationFormatted = Number.isNaN(monthlyVariationPct) || (prevTotalPatrimonio == null)
    ? "0,00%"
    : `${monthlyVariationPct >= 0 ? "+" : ""}${monthlyVariationPct.toFixed(2).replace(".", ",")}%`;

  // Montagem da mensagem final no Telegram
  const lines = [
    "📊 *RESUMO OPERACIONAL*",
    `📅 Data: ${fmtDateBR(date)}`,
    "",
    `💰 Total recebido: *${fmtBRL(totalReceivedToday)}*`,
    `📈 Juros recebidos hoje: *${fmtBRL(interestReceivedToday)}*`,
    `📅 Juros recebidos no mês: *${fmtBRL(interestReceivedMonth)}*`,
    `👤 Comissão gerente paga hoje: *${fmtBRL(commissionPaidToday)}*`,
    `📅 Comissões de gerentes pagas no mês: *${fmtBRL(commissionPaidMonth)}*`,
    `🏢 Despesas empresariais: *${fmtBRL(businessExpensesPaidToday)}*`,
    `💸 Total emprestado: *${fmtBRL(totalLentToday)}*`,
    `📝 Empréstimos realizados: *${loansCountToday}*`,
    `💵 Saldo do mês: *${fmtBRL(saldoMes)}*`,
    `⚠️ Inadimplência atual: *${defaultRate.toFixed(2).replace(".", ",")}%*`,
    `📊 Variação do patrimônio: *${variationFormatted}*`,
  ];

  return lines.join("\n");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = getExternalAdmin();
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    // 1. Chamada manual sob demanda autenticada pelo usuário
    if (token && req.method === "POST") {
      let userId: string | null = null;
      try {
        const SUPABASE_URL = getExternalSupabaseUrl();
        const SUPABASE_ANON_KEY = getExternalAnonKey();
        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: { user }, error: userErr } = await userClient.auth.getUser();
        if (!userErr && user?.id) userId = user.id;
      } catch (_) {}

      if (userId) {
        let resolvedOwnerId = userId;
        try {
          const { data: ownerId } = await admin.rpc("get_data_owner_id", { _user_id: userId });
          if (ownerId) resolvedOwnerId = ownerId as string;
        } catch (_) {}

        let tz = "America/Sao_Paulo";
        try {
          const { data: settings } = await admin
            .from("account_settings")
            .select("timezone")
            .eq("owner_id", resolvedOwnerId)
            .maybeSingle();
          if ((settings as any)?.timezone) tz = (settings as any).timezone;
        } catch (_) {}

        const { today } = nowParts(tz);
        const text = await generateOperationalSummaryReport(admin, resolvedOwnerId, today);
        const link = await getReportsLinkForUser(admin, userId);

        if (!link) {
          return new Response(JSON.stringify({ ok: true, sent: false, reason: "no_reports_link", text }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const send = await sendReportsMessage(admin, userId, Number(link.chat_id), text);
        return new Response(JSON.stringify({ ok: true, sent: send.sent, reason: send.reason, text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2. Modo Cron Agendado: exige autenticação rígida de Cron ou Admin
    const cronAuth = await requireCronOrAdmin(req);
    if (cronAuth instanceof Response) return cronAuth;
    let prefs: any[] = [];
    try {
      const { data } = await admin
        .from("telegram_operational_summary_prefs")
        .select("user_id, enabled, send_time_1, send_time_2, send_time_3, last_sent")
        .eq("enabled", true);
      prefs = data ?? [];
    } catch (_) {}

    let sent = 0;
    for (const pref of prefs) {
      try {
        let resolvedOwnerId = (pref as any).user_id;
        try {
          const { data: ownerId } = await admin.rpc("get_data_owner_id", { _user_id: (pref as any).user_id });
          if (ownerId) resolvedOwnerId = ownerId as string;
        } catch (_) {}

        let tz = "America/Sao_Paulo";
        try {
          const { data: settings } = await admin
            .from("account_settings")
            .select("timezone")
            .eq("owner_id", resolvedOwnerId)
            .maybeSingle();
          if ((settings as any)?.timezone) tz = (settings as any).timezone;
        } catch (_) {}

        const { today, hhmm } = nowParts(tz);
        const [hh, mm] = hhmm.split(":").map(Number);
        const nowMin = hh * 60 + mm;

        const slots = [
          { key: "send_time_1", time: (pref as any).send_time_1 },
          { key: "send_time_2", time: (pref as any).send_time_2 },
          { key: "send_time_3", time: (pref as any).send_time_3 },
        ];

        const lastSent = ((pref as any).last_sent ?? {}) as Record<string, string>;

        const firedSlots = slots.filter((slot) => {
          if (!slot.time) return false;
          const [sh, sm] = slot.time.split(":").map(Number);
          const slotMin = sh * 60 + sm;
          const diff = Math.abs(nowMin - slotMin);
          return diff <= 8;
        }).filter((slot) => lastSent[slot.key] !== today);

        if (firedSlots.length === 0) continue;

        const link = await getReportsLinkForUser(admin, (pref as any).user_id);
        if (!link) continue;

        const text = await generateOperationalSummaryReport(admin, resolvedOwnerId, today);
        const send = await sendReportsMessage(admin, (pref as any).user_id, Number(link.chat_id), text);
        if (!send.sent) continue;

        const merged = { ...lastSent };
        for (const slot of firedSlots) {
          merged[slot.key] = today;
        }

        await admin
          .from("telegram_operational_summary_prefs")
          .update({ last_sent: merged })
          .eq("user_id", (pref as any).user_id);

        sent += 1;
      } catch (err) {
        console.error("[telegram-operational-summary] Error processing user", (pref as any).user_id, err);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, checked: prefs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
