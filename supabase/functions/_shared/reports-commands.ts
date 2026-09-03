const round2 = (n: number) => Math.round(n * 100) / 100;

export interface AllocLoanLike {
  id: string;
  amount: number;
  interestRate: number;
  installments: number;
  status?: string;
  originalAmount?: number | null;
}

export interface AllocPaymentLike {
  id: string;
  loanId: string;
  amount: number;
  date?: string;
  installmentNumber: number;
  createdAt?: string;
  metadata?: Record<string, any> | null;
}

const ALLOCATION_VERSION_REMAINING_PRORATA = "remaining_balance_prorata" as const;

function readPersistedInterest(p: AllocPaymentLike): number | null {
  const md = (p.metadata ?? null) as any;
  if (!md) return null;
  const v = md.interest_amount;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

function totalWithInterest(principal: any, rate?: number): number {
  if (typeof principal === "object" && principal !== null) {
    const loan = principal;
    return Math.round(Number(loan.amount || 0) * (1 + Number(loan.interest_rate || 0) / 100));
  }
  return Math.round(Number(principal || 0) * (1 + Number(rate || 0) / 100));
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

export function allocateInterestByPayment(
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
  const prorataPrincipalReducedByLoan = new Map<string, number>();
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

    const inst = p.installmentNumber;
    const loan = loanById.get(p.loanId);

    if (inst === 0 || inst === -2) {
      byId.set(p.id, round2(amt));
      const rem = interestRemainingByLoan.get(p.loanId) ?? 0;
      interestRemainingByLoan.set(p.loanId, Math.max(0, rem - amt));
      continue;
    }
    if (inst === -3) {
      byId.set(p.id, 0);
      prorataPrincipalReducedByLoan.set(
        p.loanId,
        (prorataPrincipalReducedByLoan.get(p.loanId) ?? 0) + amt,
      );
      continue;
    }

    if (!loan) {
      byId.set(p.id, round2(amt));
      continue;
    }

    if (inst === -1) {
      const iRemBefore = interestRemainingByLoan.get(p.loanId) ?? 0;
      const persisted = readPersistedInterest(p);
      let interest = persisted != null ? Math.min(persisted, amt) : round2(Math.min(iRemBefore, amt));
      byId.set(p.id, interest);
      interestRemainingByLoan.set(p.loanId, Math.max(0, round2(iRemBefore - interest)));
      priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + interest);
      const principalPart = Math.max(0, round2(amt - interest));
      prorataPrincipalReducedByLoan.set(
        p.loanId,
        (prorataPrincipalReducedByLoan.get(p.loanId) ?? 0) + principalPart,
      );
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
    prorataPrincipalReducedByLoan.set(
      p.loanId,
      (prorataPrincipalReducedByLoan.get(p.loanId) ?? 0) + Math.max(0, round2(amt - interestPart)),
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
    const expectedInterest = Math.max(0, Math.max(total - loan.amount, scheduledInterest));
    const allocated = payments
      .filter((p) => p.loanId === loan.id)
      .reduce((s, p) => s + (byId.get(p.id) ?? 0), 0);
    const diff = round2(expectedInterest - allocated);
    if (diff <= 0) continue;
    const cur = byId.get(last.id) ?? 0;
    const cap = Math.max(0, round2(last.amount - cur));
    const add = Math.min(diff, cap);
    if (add > 0) byId.set(last.id, round2(cur + add));
  }

  return byId;
}

export function allocateInterestByPaymentUpTo(
  loans: AllocLoanLike[],
  payments: AllocPaymentLike[],
  cutoffIsoDate: string,
): Map<string, number> {
  const filteredPayments = payments.filter((p) => {
    const d = (p.date ?? "").slice(0, 10);
    return !d || d <= cutoffIsoDate;
  });
  return allocateInterestByPayment(loans, filteredPayments);
}

export function sumInterestReceivedInPeriod(
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

const TZ = "America/Sao_Paulo";

export function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function fmtDateBR(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  return (y && m && d) ? `${d}/${m}/${y}` : (iso || "");
}

export function todayInTZ(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthBounds(date = todayInTZ()): { start: string; end: string; prefix: string } {
  const [year, month] = date.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end, prefix: `${year}-${String(month).padStart(2, "0")}` };
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.floor((b - a) / 86_400_000);
}

function inMonth(date: string | null | undefined, month: string): boolean {
  return !!date && String(date).slice(0, 7) === month;
}

function num(value: unknown): number {
  return Number(value || 0);
}

function calcLateFees(loan: any, baseAmount: number, daysOverdue: number): number {
  if (daysOverdue <= 0) return 0;
  const lateValue = num(loan.late_interest_value);
  const lateInterest = lateValue > 0
    ? loan.late_interest_type === "fixed"
      ? lateValue * daysOverdue
      : baseAmount * (lateValue / 100) * daysOverdue
    : 0;
  const penalty = num(loan.penalty_value);
  return lateInterest + (penalty > 0 ? penalty : 0);
}

export const REPORT_COMMANDS = new Set([
  "relatorios", "dashboard",
  "kpi_geral", "carteira_ativa",
  "inadimplencia",
  "resumo_operacional", "resumooperacional", "operacional",
]);

export function parseReportCommand(text: string): string | null {
  const normalized = text.trim().replace(/\\_/g, "_");
  const match = normalized.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+(.+))?\s*$/i);
  if (!match) return null;
  const command = match[1].toLowerCase();
  if (!REPORT_COMMANDS.has(command)) return null;
  const arg = (match[2] || "").trim();
  return arg ? `${command}|${arg}` : command;
}

export function renderMenu(brand = "Relatórios"): string {
  return [
    `📊 *${brand} — Menu de Relatórios*`,
    "",
    "Use um dos comandos abaixo:",
    "",
    "*Relatórios do Negócio*",
    "/resumo\\_operacional — Resumo operacional consolidado",
    "/dashboard — Visão executiva consolidada",
    "/kpi\\_geral — Indicadores principais",
    "/carteira\\_ativa — Capital e pendências",
    "/inadimplencia — Taxa e faixas de atraso",
  ].join("\n");
}

interface Ctx {
  supabase: any;
  userId: string;
  today: string;
}

interface Snapshot {
  loans: any[];
  installments: any[];
  payments: any[];
  clients: any[];
  active: any[];
  totalLent: number;
  totalToReceive: number;
  pendingReceivable: number;
  estimatedProfit: number;
  overdueLoans: number;
}

async function loadLoans(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase.from("loans").select("*").eq("user_id", ctx.userId);
  if (error) throw error;
  return data ?? [];
}

async function loadInstallments(ctx: Ctx, loanIds: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < loanIds.length; i += 50) {
    const chunk = loanIds.slice(i, i + 50);
    const { data, error } = await ctx.supabase
      .from("loan_installments")
      .select("loan_id, installment_number, amount, due_date")
      .in("loan_id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function loadPayments(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase
    .from("payments")
    .select("id, loan_id, amount, date, installment_number, created_at, metadata")
    .eq("user_id", ctx.userId)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadClients(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase
    .from("clients")
    .select("id, name, phone, active, created_at")
    .eq("user_id", ctx.userId);
  if (error) throw error;
  return data ?? [];
}

function dueEntriesForLoan(loan: any, installments: any[]) {
  const count = Math.max(1, num(loan.installments) || 1);
  const total = totalWithInterest(loan);
  const installmentValue = total / count;
  const paidInstallments = num(loan.paid_installments);
  const schedules = installments
    .filter((schedule) => schedule.loan_id === loan.id)
    .sort((a, b) => num(a.installment_number) - num(b.installment_number));

  if (schedules.length > 0) {
    return schedules.map((schedule) => ({
      loan_id: loan.id,
      installment_number: num(schedule.installment_number),
      due_date: schedule.due_date,
      amount: num(schedule.amount) || installmentValue,
      paid: loan.status === "paid" || schedule.paid === true || num(schedule.installment_number) <= paidInstallments,
    }));
  }

  if (count <= 1) {
    return [{
      loan_id: loan.id,
      installment_number: 1,
      due_date: loan.due_date,
      amount: total,
      paid: loan.status === "paid" || paidInstallments >= 1,
    }];
  }

  const base = new Date(`${String(loan.due_date).slice(0, 10)}T00:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const due = new Date(base.getFullYear(), base.getMonth() + index, base.getDate());
    return {
      loan_id: loan.id,
      installment_number: index + 1,
      due_date: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
      amount: installmentValue,
      paid: loan.status === "paid" || index + 1 <= paidInstallments,
    };
  });
}

function paymentsInRange(payments: any[], from: string, to: string): any[] {
  return payments.filter((payment) => payment.date >= from && payment.date <= to);
}

function totalPaidByLoan(payments: any[]): Record<string, number> {
  return payments.reduce<Record<string, number>>((acc, payment) => {
    acc[payment.loan_id] = (acc[payment.loan_id] || 0) + num(payment.amount);
    return acc;
  }, {});
}

function getOverdueByLoan(ctx: Ctx, snap: Snapshot) {
  const paidByLoan = totalPaidByLoan(snap.payments);
  const overdue = new Map<string, { value: number; oldest: string }>();

  for (const loan of snap.loans) {
    const count = Math.max(1, num(loan.installments) || 1);
    for (const entry of dueEntriesForLoan(loan, snap.installments)) {
      if (entry.paid || !entry.due_date || entry.due_date >= ctx.today) continue;
      const fallbackRemaining = Math.max(0, totalWithInterest(loan) - (paidByLoan[loan.id] || 0));
      const value = count === 1 ? Math.max(0, num(loan.remaining_amount) || fallbackRemaining) : entry.amount;
      const current = overdue.get(loan.id) ?? { value: 0, oldest: entry.due_date };
      current.value += value;
      if (entry.due_date < current.oldest) current.oldest = entry.due_date;
      overdue.set(loan.id, current);
    }
  }

  return overdue;
}

function computeDefaultRate(ctx: Ctx, snap: Snapshot, month: string): number {
  const paidByLoan = totalPaidByLoan(snap.payments);
  let portfolio = 0;
  let overdue = 0;

  for (const loan of snap.loans) {
    const count = Math.max(1, num(loan.installments) || 1);
    for (const entry of dueEntriesForLoan(loan, snap.installments)) {
      if (!inMonth(entry.due_date, month)) continue;
      portfolio += entry.amount;
      if (entry.paid || entry.due_date >= ctx.today) continue;
      if (count === 1) {
        const fallbackRemaining = Math.max(0, totalWithInterest(loan) - (paidByLoan[loan.id] || 0));
        overdue += Math.max(0, num(loan.remaining_amount) || fallbackRemaining);
      } else {
        overdue += entry.amount;
      }
    }
  }

  return portfolio > 0 ? (overdue / portfolio) * 100 : 0;
}

function computeExpectedReceivable(loans: any[], month: string): number {
  return loans.reduce((sum, loan) => {
    const count = Math.max(1, num(loan.installments) || 1);
    const total = totalWithInterest(loan);
    if (count <= 1) return inMonth(loan.due_date, month) ? sum + total : sum;

    const [year, startMonth, day] = String(loan.start_date || "").split("-").map(Number);
    if (!year || !startMonth || !day) return sum;
    const installmentValue = total / count;
    let monthlyTotal = 0;
    for (let i = 0; i < count; i++) {
      const due = new Date(year, (startMonth - 1) + (i + 1), day);
      const key = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
      if (key === month) monthlyTotal += installmentValue;
    }
    return sum + monthlyTotal;
  }, 0);
}

function computeProfitRealized(loans: any[], payments: any[], month: string): number {
  const allocLoans = loans.map((l) => ({
    id: String(l.id),
    amount: num(l.amount),
    interestRate: num(l.interest_rate),
    installments: Math.max(1, Math.floor(num(l.installments) || 1)),
    status: l.status,
    originalAmount: l.original_amount != null ? Number(l.original_amount) : null,
  }));
  const allocPayments = payments.map((p) => ({
    id: String(p.id),
    loanId: String(p.loan_id),
    amount: num(p.amount),
    date: p.date ?? undefined,
    installmentNumber: num(p.installment_number),
    createdAt: p.created_at ?? undefined,
    metadata: (p.metadata ?? null) as Record<string, any> | null,
  }));
  const interestByPayment = allocateInterestByPayment(allocLoans, allocPayments);
  return payments
    .filter((payment) => inMonth(payment.date, month))
    .reduce((sum, payment) => sum + (interestByPayment.get(String(payment.id)) ?? 0), 0);
}

async function snapshot(ctx: Ctx): Promise<Snapshot> {
  const [loans, clients, payments] = await Promise.all([loadLoans(ctx), loadClients(ctx), loadPayments(ctx)]);
  const installments = await loadInstallments(ctx, loans.map((loan) => loan.id));
  const active = loans.filter((loan) => loan.status !== "paid");
  // Capital na rua = principal proporcional ao número de parcelas em aberto
  // (espelha a lógica do card "Capital na Rua" do app).
  const totalLent = active.reduce((sum, loan) => {
    const n = num(loan.installments) > 0 ? num(loan.installments) : 1;
    const paid = Math.min(num(loan.paid_installments), n);
    const remainingRatio = Math.max(0, (n - paid) / n);
    return sum + num(loan.amount) * remainingRatio;
  }, 0);
  const totalToReceive = active.reduce((sum, loan) => {
    const total = totalWithInterest(loan);
    const dueDate = new Date(`${loan.due_date}T00:00:00`);
    const today = new Date(`${ctx.today}T00:00:00`);
    const daysLate = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000));
    const paidForLoan = payments.filter((payment) => payment.loan_id === loan.id).reduce((s, payment) => s + num(payment.amount), 0);
    const baseRemaining = num(loan.remaining_amount) > 0 ? num(loan.remaining_amount) : Math.max(0, total - paidForLoan);
    let lateFees = 0;
    if (num(loan.late_interest_value) > 0 && daysLate > 0) {
      lateFees += loan.late_interest_type === "fixed"
        ? num(loan.late_interest_value) * daysLate
        : baseRemaining * (num(loan.late_interest_value) / 100) * daysLate;
    }
    if (num(loan.penalty_value) > 0 && daysLate > 0) lateFees += num(loan.penalty_value);
    const interestPaymentsReceived = payments
      .filter((payment) => payment.loan_id === loan.id && num(payment.installment_number) === 0)
      .reduce((s, payment) => s + num(payment.amount), 0);
    return sum + Math.round((total + lateFees + interestPaymentsReceived) * 100) / 100;
  }, 0);
  const pendingReceivable = active.reduce((sum, loan) => sum + num(loan.remaining_amount), 0);
  // Lucro estimado (espelha app: soma por contrato ativo de
  // baseRemaining * interestRatio + juros/multa de atraso).
  const today = new Date(`${ctx.today}T00:00:00`);
  const estimatedProfit = active.reduce((sum, loan) => {
    const principal = num(loan.amount);
    const expected = totalWithInterest(loan);
    const totalPaid = payments.filter((p) => p.loan_id === loan.id).reduce((s, p) => s + num(p.amount), 0);
    const baseRemaining = num(loan.remaining_amount) > 0
      ? num(loan.remaining_amount)
      : Math.max(0, expected - totalPaid);
    const dueDate = loan.due_date ? new Date(`${loan.due_date}T00:00:00`) : null;
    const daysOverdue = dueDate && !isNaN(dueDate.getTime())
      ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000))
      : 0;
    let lateFees = 0;
    if (daysOverdue > 0) {
      if (num(loan.late_interest_value) > 0) {
        lateFees += loan.late_interest_type === "fixed"
          ? num(loan.late_interest_value) * daysOverdue
          : baseRemaining * (num(loan.late_interest_value) / 100) * daysOverdue;
      }
      if (num(loan.penalty_value) > 0) lateFees += num(loan.penalty_value);
    }
    const interestRatio = expected > 0 ? 1 - principal / expected : 0;
    return sum + Math.max(0, baseRemaining * interestRatio + lateFees);
  }, 0);
  const overdueLoans = loans.filter((loan) => loan.status === "overdue" && loan.due_date < ctx.today).length;

  // FASE 3 — quando `USE_UNIFIED_REPORTS=true`, os agregados de carteira vêm da
  // fonte única compartilhada com o app (mesmo arquivo de núcleo). Default OFF:
  // os números atuais dos relatórios permanecem idênticos.
  if (unifiedReportsEnabled()) {
    const unified = buildAggregatesFromRows({ loanRows: loans, paymentRows: payments, todayIso: ctx.today });
    return {
      loans,
      installments,
      payments,
      clients,
      active,
      totalLent: unified.principalRemaining,
      totalToReceive: unified.totalReceivable,
      pendingReceivable: unified.totalReceivable,
      estimatedProfit: unified.interestAndFeesPending,
      overdueLoans: unified.contractsOverdue,
    };
  }

  return { loans, installments, payments, clients, active, totalLent, totalToReceive, pendingReceivable, estimatedProfit, overdueLoans };

}

async function recebimentosHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const payments = paymentsInRange(snap.payments, ctx.today, ctx.today);
  const total = payments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const byClient = new Map<string, number>();
  for (const payment of payments) {
    const loan = snap.loans.find((item) => item.id === payment.loan_id);
    const name = loan?.borrower_name || "—";
    byClient.set(name, (byClient.get(name) ?? 0) + num(payment.amount));
  }
  const dueEntries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments));
  const dueToday = dueEntries.filter((entry) => entry.due_date === ctx.today);

  const lines = [
    `📅 *Recebimentos de hoje* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `💰 Total recebido: *${fmtBRL(total)}*`,
    `🧾 Pagamentos: *${payments.length}*`,
  ];
  if (byClient.size > 0) {
    lines.push("", "*Clientes que pagaram:*");
    for (const [name, value] of [...byClient.entries()].sort((a, b) => b[1] - a[1])) lines.push(`• ${name} — ${fmtBRL(value)}`);
  }
  lines.push("", `📆 Parcelas com vencimento hoje: *${dueToday.length}* (pendentes: ${dueToday.filter((entry) => !entry.paid).length})`);
  lines.push(`⏳ Parcelas pendentes totais: *${dueEntries.filter((entry) => !entry.paid).length}*`);
  return lines.join("\n");
}

async function carteiraAtiva(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdueCount = getOverdueByLoan(ctx, snap).size;
  return [
    "💰 *Carteira Ativa*",
    "",
    `📤 Capital na rua: *${fmtBRL(snap.totalLent)}*`,
    `⏳ Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `📈 Lucro estimado: *${fmtBRL(snap.estimatedProfit)}*`,
    `📑 Empréstimos ativos: *${snap.active.length}*`,
    overdueCount > 0 ? `🚨 Em atraso: *${overdueCount}*` : "✅ Nenhum empréstimo em atraso",
  ].join("\n");
}

async function emprestimosAtrasados(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const sorted = [...overdue.entries()]
    .map(([loanId, item]) => {
      const loan = snap.loans.find((entry) => entry.id === loanId);
      const days = daysBetween(item.oldest, ctx.today);
      const fees = loan ? calcLateFees(loan, item.value, days) : 0;
      return { name: loan?.borrower_name || "—", days, value: item.value + fees };
    })
    .sort((a, b) => b.days - a.days);
  const total = sorted.reduce((sum, r) => sum + r.value, 0);
  const lines = ["🚨 *Empréstimos em Atraso*", "", `📑 Contratos: *${overdue.size}*`, `💸 Valor em atraso (com juros/multa): *${fmtBRL(total)}*`];
  if (overdue.size === 0) return [...lines, "", "_Nenhum contrato em atraso. 🎉_"].join("\n");

  lines.push("", "*Clientes:*");

  const nameWidth = Math.min(14, Math.max(...sorted.map((r) => r.name.length)));
  const daysWidth = Math.max(...sorted.map((r) => `${r.days}d`.length));
  const valueWidth = Math.max(...sorted.map((r) => fmtBRL(r.value).length));
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
  const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

  for (const row of sorted) {
    const shortName = row.name.length > nameWidth ? row.name.slice(0, nameWidth) : row.name;
    const marker = row.days > 20 ? " 🔴" : "";
    lines.push(`\`${pad(shortName, nameWidth)} ${padL(`${row.days}d`, daysWidth)} ${padL(fmtBRL(row.value), valueWidth)}\`${marker}`);
  }
  return lines.join("\n");
}

async function vencimentosHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const rows = snap.loans.flatMap((loan) =>
    dueEntriesForLoan(loan, snap.installments)
      .filter((e) => e.due_date === ctx.today && !e.paid)
      .map((e) => ({ name: loan.borrower_name || "—", value: num(e.amount) }))
  );
  const total = rows.reduce((s, r) => s + r.value, 0);
  const dateBR = ctx.today.split("-").reverse().join("/");
  const lines = [`📆 *Vencem hoje — ${dateBR}*`, "", `📑 Contratos: *${rows.length}*`, `💰 Valor previsto: *${fmtBRL(total)}*`];
  if (rows.length === 0) return [...lines, "", "_Nenhum vencimento para hoje. 🎉_"].join("\n");

  lines.push("", "*Clientes:*");
  const sorted = rows.sort((a, b) => b.value - a.value);

  const nameWidth = Math.min(14, Math.max(...sorted.map((r) => r.name.length)));
  const valueWidth = Math.max(...sorted.map((r) => fmtBRL(r.value).length));
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
  const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

  for (const row of sorted) {
    const shortName = row.name.length > nameWidth ? row.name.slice(0, nameWidth) : row.name;
    lines.push(`\`${pad(shortName, nameWidth)} ${padL(fmtBRL(row.value), valueWidth)}\``);
  }
  return lines.join("\n");
}

async function inadimplencia(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { prefix } = monthBounds(ctx.today);
  const overdue = getOverdueByLoan(ctx, snap);
  // Somar juros/multa de atraso a cada contrato antes de agrupar por faixa
  // (para refletir o valor real de cobrança em cada bucket).
  let overdueValue = 0;
  let feesTotal = 0;
  const buckets = { b1: 0, b2: 0, b3: 0, b4: 0 };
  for (const [loanId, item] of overdue) {
    const loan = snap.loans.find((l) => l.id === loanId);
    const days = daysBetween(item.oldest, ctx.today);
    const fees = loan ? calcLateFees(loan, item.value, days) : 0;
    const withFees = item.value + fees;
    overdueValue += withFees;
    feesTotal += fees;
    if (days <= 30) buckets.b1 += withFees;
    else if (days <= 60) buckets.b2 += withFees;
    else if (days <= 90) buckets.b3 += withFees;
    else buckets.b4 += withFees;
  }

  return [
    "📉 *Inadimplência*",
    "",
    `💼 Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `⚠️ Valor vencido em aberto (com juros/multa): *${fmtBRL(overdueValue)}*`,
    feesTotal > 0 ? `   ↳ juros/multa de atraso: *${fmtBRL(feesTotal)}*` : "   ↳ sem juros/multa acumulados",
    `📊 Taxa do mês (igual Metas): *${computeDefaultRate(ctx, snap, prefix).toFixed(2)}%*`,
    "",
    "*Faixas de atraso* (valor + juros/multa):",
    `• 1–30 dias: ${fmtBRL(buckets.b1)}`,
    `• 31–60 dias: ${fmtBRL(buckets.b2)}`,
    `• 61–90 dias: ${fmtBRL(buckets.b3)}`,
    `• 90+ dias: ${fmtBRL(buckets.b4)}`,
  ].join("\n");
}

async function resumoDiario(ctx: Ctx, snap: Snapshot): Promise<string> {
  const newLoans = snap.loans.filter((loan) => loan.start_date === ctx.today);
  const payments = paymentsInRange(snap.payments, ctx.today, ctx.today);
  const dueToday = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments)).filter((entry) => entry.due_date === ctx.today).length;

  return [
    `📅 *Resumo do dia* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `🆕 Novos empréstimos: *${newLoans.length}*`,
    `📤 Valor emprestado hoje: *${fmtBRL(newLoans.reduce((sum, loan) => sum + num(loan.amount), 0))}*`,
    `💰 Recebimentos: *${fmtBRL(payments.reduce((sum, payment) => sum + num(payment.amount), 0))}* (${payments.length})`,
    `📆 Parcelas vencendo hoje: *${dueToday}*`,
    `✅ Pagamentos registrados hoje: *${payments.length}*`,
    `🚨 Contratos inadimplentes: *${getOverdueByLoan(ctx, snap).size}*`,
  ].join("\n");
}

async function resumoMensal(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const newLoans = snap.loans.filter((loan) => loan.start_date >= start && loan.start_date <= end);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const interest = computeProfitRealized(snap.loans, snap.payments, prefix);
  const expected = computeExpectedReceivable(snap.loans, prefix);
  const paidOff = snap.loans.filter((loan) => {
    if (loan.status !== "paid") return false;
    const last = snap.payments.filter((payment) => payment.loan_id === loan.id).map((payment) => String(payment.date || "")).sort().pop();
    return !!last && last >= start && last <= end;
  }).length;

  return [
    `📆 *Resumo mensal* — ${prefix.split("-").reverse().join("/")}`,
    "",
    `🆕 Novos contratos: *${newLoans.length}*`,
    `📤 Valor emprestado: *${fmtBRL(newLoans.reduce((sum, loan) => sum + num(loan.amount), 0))}*`,
    `💰 Valor recebido: *${fmtBRL(received)}*`,
    `📌 Previsto no mês: *${fmtBRL(expected)}*`,
    `📈 Juros recebidos: *${fmtBRL(interest)}*`,
    `✅ Contratos quitados: *${paidOff}*`,
    `🚨 Contratos em atraso: *${getOverdueByLoan(ctx, snap).size}*`,
    `🎯 Faturamento do período: *${(expected > 0 ? (received / expected) * 100 : 0).toFixed(2)}%*`,
    `📊 Rentabilidade s/ carteira: *${(snap.totalLent > 0 ? (interest / snap.totalLent) * 100 : 0).toFixed(2)}%*`,
  ].join("\n");
}

async function dashboard(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const activeClients = snap.clients.filter((client) => client.active !== false).length;
  const overdueCount = getOverdueByLoan(ctx, snap).size;

  return [
    "📊 *Dashboard Executivo*",
    "",
    "*Visão geral*",
    `👥 Clientes ativos: *${activeClients}*`,
    `📑 Empréstimos ativos: *${snap.active.length}*`,
    `🚨 Contratos em atraso: *${overdueCount}*`,
    "",
    "*Financeiro do mês*",
    `📤 Capital na rua: *${fmtBRL(snap.totalLent)}*`,
    `💰 Recebido no mês: *${fmtBRL(received)}*`,
    `⏳ Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `💎 Lucro estimado: *${fmtBRL(snap.estimatedProfit)}*`,
  ].join("\n");
}

async function kpiGeral(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const interest = computeProfitRealized(snap.loans, snap.payments, prefix);
  // Ticket médio = principal médio por contrato ativo (alinha com "empréstimo médio" no app).
  const activePrincipal = snap.active.reduce((s, l) => s + num(l.amount), 0);
  const avgTicket = snap.active.length > 0 ? activePrincipal / snap.active.length : 0;
  // Rentabilidade sobre capital na rua = juros realizados no mês / capital na rua.
  const portfolioYield = snap.totalLent > 0 ? (interest / snap.totalLent) * 100 : 0;
  const collectionRate = snap.pendingReceivable + received > 0
    ? (received / (received + snap.pendingReceivable)) * 100
    : 0;
  const overdueCount = getOverdueByLoan(ctx, snap).size;
  // Taxa de inadimplência (contagem) = contratos em atraso / total de contratos (igual card de Saúde Financeira do app).
  const defaultRate = snap.loans.length > 0 ? (overdueCount / snap.loans.length) * 100 : 0;
  const overdueRatio = snap.active.length > 0 ? (overdueCount / snap.active.length) * 100 : 0;

  return [
    "📈 *KPIs Gerais*",
    "",
    "*Carteira*",
    `📤 Capital na rua: *${fmtBRL(snap.totalLent)}*`,
    `⏳ Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `💎 Lucro estimado: *${fmtBRL(snap.estimatedProfit)}*`,
    `🎯 Empréstimo médio (ativos): *${fmtBRL(avgTicket)}*`,
    "",
    "*Performance do mês*",
    `📈 Juros recebidos: *${fmtBRL(interest)}*`,
    `💹 Rentabilidade s/ capital na rua: *${portfolioYield.toFixed(2)}%*`,
    "",
    "*Cobrança e inadimplência*",
    `📊 Taxa de inadimplência: *${defaultRate.toFixed(2)}%* (${overdueCount}/${snap.loans.length})`,
    `🚨 Em atraso (ativos): *${overdueCount}* (${overdueRatio.toFixed(1)}% da carteira)`,
    `✅ Eficiência de cobrança: *${collectionRate.toFixed(2)}%*`,
  ].join("\n");
}

function phoneByName(snap: Snapshot, name: string): string {
  const c = snap.clients.find((cl) => (cl.name || "").toLowerCase() === (name || "").toLowerCase());
  return c?.phone ? ` 📞 ${c.phone}` : "";
}

async function topClientes(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const stats = new Map<string, { lent: number; paid: number; overdue: number; days: number }>();
  for (const loan of snap.loans) {
    const name = loan.borrower_name || "—";
    const s = stats.get(name) ?? { lent: 0, paid: 0, overdue: 0, days: 0 };
    s.lent += num(loan.amount);
    s.paid += snap.payments.filter((p) => p.loan_id === loan.id).reduce((a, p) => a + num(p.amount), 0);
    const od = overdue.get(loan.id);
    if (od) {
      s.overdue += od.value;
      s.days = Math.max(s.days, daysBetween(od.oldest, ctx.today));
    }
    stats.set(name, s);
  }
  const arr = [...stats.entries()].map(([name, s]) => ({ name, ...s }));
  const best = [...arr].filter((x) => x.paid > 0).sort((a, b) => b.paid - a.paid).slice(0, 5);
  const worst = [...arr].filter((x) => x.overdue > 0).sort((a, b) => b.days - a.days || b.overdue - a.overdue).slice(0, 5);
  const lines = ["🏆 *Top Clientes*", "", "*Melhores pagadores*"];
  if (best.length === 0) lines.push("_Sem dados._");
  for (const b of best) {
    lines.push(`• ${b.name} — pago ${fmtBRL(b.paid)} / emprestado ${fmtBRL(b.lent)}`);
  }
  lines.push("", "*Maiores devedores*");
  if (worst.length === 0) lines.push("_Nenhum cliente em atraso. 🎉_");
  for (const w of worst) lines.push(`• ${w.name} — ${w.days}d em atraso — ${fmtBRL(w.overdue)}`);
  return lines.join("\n");
}

async function vencimentosSemana(ctx: Ctx, snap: Snapshot): Promise<string> {
  const start = new Date(`${ctx.today}T00:00:00`);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const entries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments).map((e) => ({ ...e, borrower: loan.borrower_name || "—" })));
  const upcoming = entries
    .filter((e) => !e.paid && e.due_date >= ctx.today && e.due_date <= endStr)
    .sort(
      (a, b) => a.due_date.localeCompare(b.due_date) || b.amount - a.amount || a.borrower.localeCompare(b.borrower),
    );
  const total = upcoming.reduce((s, e) => s + e.amount, 0);
  const lines = [`📆 *Vencimentos — próximos 7 dias*`, "", `📑 Parcelas: *${upcoming.length}* — Total: *${fmtBRL(total)}*`];
  if (upcoming.length === 0) return [...lines, "", "_Nada a vencer no período._"].join("\n");

  const byDay = new Map<string, typeof upcoming>();
  for (const it of upcoming) {
    if (!byDay.has(it.due_date)) byDay.set(it.due_date, [] as any);
    byDay.get(it.due_date)!.push(it);
  }
  for (const [day, items] of byDay) {
    items.sort((a, b) => b.amount - a.amount || a.borrower.localeCompare(b.borrower));
    const dayTotal = items.reduce((s, e) => s + e.amount, 0);
    lines.push("", `*${day.split("-").reverse().join("/")}* — ${items.length} parcela(s) — ${fmtBRL(dayTotal)}`);
    for (const it of items) {
      lines.push(`• ${it.borrower} — ${fmtBRL(it.amount)}`);
    }
  }
  return lines.join("\n");
}

async function projecaoMes(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((s, p) => s + num(p.amount), 0);
  const entries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments));
  const monthEntries = entries.filter((e) => inMonth(e.due_date, prefix) && !e.paid);
  const remainingMonth = monthEntries.filter((e) => e.due_date >= ctx.today).reduce((s, e) => s + e.amount, 0);
  const overdueInMonth = monthEntries.filter((e) => e.due_date < ctx.today).reduce((s, e) => s + e.amount, 0);
  const expected = computeExpectedReceivable(snap.loans, prefix);
  const projected = received + remainingMonth + overdueInMonth;
  return [
    `📡 *Projeção de Caixa — ${prefix.split("-").reverse().join("/")}*`,
    "",
    `📌 Previsto no mês: *${fmtBRL(expected)}*`,
    `💰 Já recebido: *${fmtBRL(received)}*`,
    `📆 A vencer ainda no mês: *${fmtBRL(remainingMonth)}*`,
    `🚨 Atrasado (mês corrente): *${fmtBRL(overdueInMonth)}*`,
    `🎯 Projeção final: *${fmtBRL(projected)}*`,
    `📊 Realizado vs previsto: *${(expected > 0 ? (received / expected) * 100 : 0).toFixed(1)}%*`,
  ].join("\n");
}

async function novosContratos(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const newLoans = snap.loans.filter((l) => l.start_date >= start && l.start_date <= end);
  const totalLent = newLoans.reduce((s, l) => s + num(l.amount), 0);
  const avgRate = newLoans.length > 0 ? newLoans.reduce((s, l) => s + num(l.interest_rate), 0) / newLoans.length : 0;
  const avgTerm = newLoans.length > 0 ? newLoans.reduce((s, l) => s + (num(l.installments) || 1), 0) / newLoans.length : 0;
  const existingNames = new Set(snap.loans.filter((l) => l.start_date < start).map((l) => l.borrower_name));
  const newClients = new Set(newLoans.filter((l) => !existingNames.has(l.borrower_name)).map((l) => l.borrower_name));
  const lines = [
    `🆕 *Novos Contratos — ${prefix.split("-").reverse().join("/")}*`,
    "",
    `📑 Contratos: *${newLoans.length}*`,
    `📤 Volume emprestado: *${fmtBRL(totalLent)}*`,
    `📈 Taxa média: *${avgRate.toFixed(2)}%*`,
    `📅 Prazo médio: *${avgTerm.toFixed(1)} parcelas*`,
    `👥 Clientes novos: *${newClients.size}* / recorrentes: *${newLoans.length - newClients.size}*`,
  ];
  if (newLoans.length > 0) {
    lines.push("", "*Contratos:*");
    for (const l of newLoans) lines.push(`• ${l.borrower_name || "—"} — ${fmtBRL(num(l.amount))} (${num(l.installments) || 1}x)`);
  }
  return lines.join("\n");
}

async function cobrancaHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const overdueRows = [...overdue.entries()].map(([loanId, item]) => {
    const loan = snap.loans.find((l) => l.id === loanId);
    return { name: loan?.borrower_name || "—", days: daysBetween(item.oldest, ctx.today), value: item.value };
  }).sort((a, b) => b.days - a.days);
  const dueToday = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments).filter((e) => e.due_date === ctx.today && !e.paid).map((e) => ({ name: loan.borrower_name || "—", value: e.amount })));
  const totalOverdue = overdueRows.reduce((s, r) => s + r.value, 0);
  const totalToday = dueToday.reduce((s, r) => s + r.value, 0);
  const lines = [
    `📞 *Cobrança de hoje* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `🚨 Em atraso: *${overdueRows.length}* — ${fmtBRL(totalOverdue)}`,
    `📆 Vencem hoje: *${dueToday.length}* — ${fmtBRL(totalToday)}`,
  ];
  if (overdueRows.length > 0) {
    lines.push("", "*Em atraso (prioridade):*");
    for (const r of overdueRows) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}${phoneByName(snap, r.name)}`);
  }
  if (dueToday.length > 0) {
    lines.push("", "*Vencem hoje:*");
    for (const r of dueToday) lines.push(`• ${r.name} — ${fmtBRL(r.value)}${phoneByName(snap, r.name)}`);
  }
  if (overdueRows.length === 0 && dueToday.length === 0) lines.push("", "_Nada para cobrar hoje. 🎉_");
  return lines.join("\n");
}

async function historicoCliente(ctx: Ctx, snap: Snapshot, query: string): Promise<string> {
  if (!query) return "Use: `/historico_cliente <nome do cliente>`";
  const q = query.toLowerCase();
  const matches = snap.loans.filter((l) => (l.borrower_name || "").toLowerCase().includes(q));
  const names = [...new Set(matches.map((l) => l.borrower_name))];
  if (names.length === 0) return `Nenhum cliente encontrado para *${query}*.`;
  if (names.length > 1) return ["Vários clientes encontrados:", "", ...names.map((n) => `• ${n}`), "", "Refine o nome."].join("\n");
  const name = names[0];
  const loans = matches;
  const overdue = getOverdueByLoan(ctx, snap);
  const totalLent = loans.reduce((s, l) => s + num(l.amount), 0);
  const totalDue = loans.reduce((s, l) => s + totalWithInterest(l), 0);
  const paid = snap.payments.filter((p) => loans.some((l) => l.id === p.loan_id)).reduce((s, p) => s + num(p.amount), 0);
  const overdueValue = loans.reduce((s, l) => s + (overdue.get(l.id)?.value ?? 0), 0);
  const active = loans.filter((l) => l.status !== "paid").length;
  const paidOff = loans.filter((l) => l.status === "paid").length;
  const lines = [
    `👤 *${name}*${phoneByName(snap, name)}`,
    "",
    `📑 Contratos: *${loans.length}* (ativos: ${active} | quitados: ${paidOff})`,
    `📤 Total emprestado: *${fmtBRL(totalLent)}*`,
    `📊 Total a receber (com juros): *${fmtBRL(totalDue)}*`,
    `💰 Total pago: *${fmtBRL(paid)}*`,
    `🚨 Valor em atraso: *${fmtBRL(overdueValue)}*`,
    "",
    "*Contratos:*",
  ];
  for (const l of loans.sort((a, b) => String(b.due_date).localeCompare(String(a.due_date)))) {
    const od = overdue.get(l.id);
    const tag = l.status === "paid" ? "✅ quitado" : od ? `🚨 ${daysBetween(od.oldest, ctx.today)}d atraso` : "⏳ em dia";
    const tagsArr = Array.isArray(l.tags) ? l.tags.filter(Boolean) : [];
    const tagsStr = tagsArr.length > 0 ? ` — 🏷️ ${tagsArr.join(", ")}` : "";
    const dueStr = l.due_date ? String(l.due_date).slice(0, 10).split("-").reverse().join("/") : "—";
    lines.push(`• venc. ${dueStr} — ${fmtBRL(num(l.amount))} (${num(l.installments) || 1}x) — ${tag}${tagsStr}`);
  }
  return lines.join("\n");
}

async function alertas(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const recentOverdue: { name: string; days: number; value: number }[] = [];
  for (const [loanId, item] of overdue) {
    const days = daysBetween(item.oldest, ctx.today);
    if (days <= 7) {
      const loan = snap.loans.find((l) => l.id === loanId);
      recentOverdue.push({ name: loan?.borrower_name || "—", days, value: item.value });
    }
  }
  const critical: { name: string; days: number; value: number }[] = [];
  for (const [loanId, item] of overdue) {
    const days = daysBetween(item.oldest, ctx.today);
    if (days > 60) {
      const loan = snap.loans.find((l) => l.id === loanId);
      critical.push({ name: loan?.borrower_name || "—", days, value: item.value });
    }
  }
  const exposureByClient = new Map<string, number>();
  for (const l of snap.active) {
    const n = l.borrower_name || "—";
    exposureByClient.set(n, (exposureByClient.get(n) ?? 0) + num(l.amount));
  }
  const totalActive = [...exposureByClient.values()].reduce((s, v) => s + v, 0);
  const concentration = [...exposureByClient.entries()]
    .map(([name, value]) => ({ name, value, pct: totalActive > 0 ? (value / totalActive) * 100 : 0 }))
    .filter((r) => r.pct >= 20)
    .sort((a, b) => b.pct - a.pct);

  const lines = ["⚠️ *Alertas de Risco*", ""];
  lines.push(`🆕 Atrasos novos (≤7d): *${recentOverdue.length}*`);
  for (const r of recentOverdue.slice(0, 10)) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}`);
  lines.push("", `🔥 Atrasos críticos (>60d): *${critical.length}*`);
  for (const r of critical.slice(0, 10)) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}`);
  lines.push("", `📊 Concentração de carteira (≥20%): *${concentration.length}*`);
  for (const r of concentration) lines.push(`• ${r.name} — ${r.pct.toFixed(1)}% (${fmtBRL(r.value)})`);
  if (recentOverdue.length === 0 && critical.length === 0 && concentration.length === 0) {
    lines.push("", "_Nenhum sinal de risco no momento. 🎉_");
  }
  return lines.join("\n");
}

function roundCommission99(val: number): number {
  if (!Number.isFinite(val)) return 0;
  const rounded = Math.round(val * 100) / 100;
  const cents = Math.round((Math.abs(rounded) % 1) * 100);
  if (cents === 99) {
    return Math.round(rounded);
  }
  return rounded;
}

function computeDefaultRateFromGoals(
  loans: any[],
  payments: any[],
  installmentSchedules: any[],
  m: string,
  cutoffDate: string,
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

export async function generateOperationalSummaryReport(admin: any, userId: string, date: string): Promise<string> {
  const currentMonthPrefix = date.slice(0, 7);
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

  const paymentsToday = payments.filter((p: any) => p.date === date);
  const totalReceivedToday = paymentsToday.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  const interestReceivedToday = sumInterestReceivedInPeriod(allocLoans, allocPayments, date, date);
  const interestReceivedMonth = sumInterestReceivedInPeriod(allocLoans, allocPayments, monthStart, date);

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

  const businessExpensesToday = expenses.filter((e: any) => {
    const isPaid = e.paid === true;
    const paidDate = e.paid_date || e.paidDate || "";
    const isBusiness = (e.scope ?? "business") !== "personal";
    return isPaid && paidDate === date && isBusiness;
  });
  const businessExpensesPaidToday = businessExpensesToday.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

  const loansToday = loans.filter((l: any) => l.start_date === date || l.startDate === date);
  const totalLentToday = loansToday.reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
  const loansCountToday = loansToday.length;

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

  const defaultRate = computeDefaultRateFromGoals(loans, payments, schedules, currentMonthPrefix, date);

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

export async function runReportCommand(supabase: any, userId: string, command: string): Promise<string> {
  if (command === "relatorios") return renderMenu();
  const [base, ...rest] = command.split("|");
  const arg = rest.join("|");
  const ctx: Ctx = { supabase, userId, today: todayInTZ() };
  if (base === "resumo_operacional" || base === "resumooperacional" || base === "operacional") {
    return generateOperationalSummaryReport(ctx.supabase, ctx.userId, ctx.today);
  }
  const snap = await snapshot(ctx);
  switch (base) {
    case "dashboard": return dashboard(ctx, snap);
    case "kpi_geral": return kpiGeral(ctx, snap);
    case "carteira_ativa": return carteiraAtiva(ctx, snap);
    case "resumo_operacional":
    case "resumooperacional":
    case "operacional":
      return generateOperationalSummaryReport(ctx.supabase, ctx.userId, ctx.today);
    case "emprestimos_atrasados": return emprestimosAtrasados(ctx, snap);
    case "vencimentos_hoje": return vencimentosHoje(ctx, snap);
    case "inadimplencia": return inadimplencia(ctx, snap);
    case "resumo_diario": return resumoDiario(ctx, snap);
    case "resumo_mensal": return resumoMensal(ctx, snap);
    case "top_clientes": return topClientes(ctx, snap);
    case "vencimentos_semana": return vencimentosSemana(ctx, snap);
    case "projecao_mes": return projecaoMes(ctx, snap);
    case "novos_contratos": return novosContratos(ctx, snap);
    
    case "historico_cliente": return historicoCliente(ctx, snap, arg);
    case "alertas": return alertas(ctx, snap);
    default: return renderMenu();
  }
}