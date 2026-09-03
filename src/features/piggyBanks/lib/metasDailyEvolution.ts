// Compute day-by-day evolution of a monthly goal within a specific month.
// Reuses the same domain rules as `computeActual` from GoalsCard, but slices
// inputs by a cutoff date so cumulative metrics grow through the month and
// point-in-time metrics are reconstructed as of end-of-day D.
import { computeActual } from "@/features/piggyBanks/components/GoalsCard";
import type { GoalType } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import type { Loan, Payment, Expense, Client, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";
import { todayInAppTz } from "@/lib/timezone";

export interface DailyEvolutionInputs {
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
  renegotiations: LoanRenegotiation[];
}

export interface DailyPoint {
  day: number;
  dayLabel: string;   // "01".."31"
  date: string;       // YYYY-MM-DD
  value: number;
  isFuture: boolean;
}

const ymd = (s: any): string => (s ? String(s).slice(0, 10) : "");

function calcTotalWithInterest(principal: number, rate: number): number {
  return Math.round(principal * (1 + rate / 100));
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _instHint = (inst: number) => inst;

function activeCapitalAt(loans: Loan[], payments: Payment[], cutoff: string): number {
  const paidByLoan = new Map<string, number>();
  payments.forEach((p: any) => {
    const d = ymd(p.date);
    if (!d || d > cutoff) return;
    const id = p.loanId || p.loan_id;
    if (!id) return;
    paidByLoan.set(id, (paidByLoan.get(id) || 0) + (Number(p.amount) || 0));
  });
  return loans.reduce((s, l: any) => {
    const start = ymd(l.startDate || l.start_date);
    if (!start || start > cutoff) return s;
    const completed = ymd(l.completedAt || l.completed_at);
    if (completed && completed <= cutoff) return s;
    const principal = Number(l.amount) || 0;
    const rate = Number(l.interestRate ?? l.interest_rate) || 0;
    const inst = Math.max(1, Number(l.installments) || 1);
    const total = calcTotalWithInterest(principal, rate);
    const paid = paidByLoan.get(l.id) || 0;
    const rem = Math.max(0, total - paid);
    return s + rem;
  }, 0);
}

function defaultRateAt(
  loans: Loan[],
  payments: Payment[],
  installmentSchedules: InstallmentSchedule[],
  monthKey: string,
  cutoff: string,
): number {
  // Value-based: sum of overdue installments (due<=cutoff AND unpaid AT cutoff) vs total portfolio expected in the month.
  const paidByLoan = new Map<string, number>();
  payments.forEach((p: any) => {
    const d = ymd(p.date);
    if (!d || d > cutoff) return;
    const id = p.loanId || p.loan_id;
    if (!id) return;
    paidByLoan.set(id, (paidByLoan.get(id) || 0) + (Number(p.amount) || 0));
  });

  let portfolio = 0;
  let overdue = 0;

  loans.forEach((loan: any) => {
    const inst = Math.max(1, Number(loan.installments) || 1);
    const principal = Number(loan.amount) || 0;
    const rate = Number(loan.interestRate ?? loan.interest_rate) || 0;
    const total = calcTotalWithInterest(principal, rate);
    const iv = total / inst;

    const schedules = installmentSchedules
      .filter((s) => s.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    const entries = schedules.length > 0
      ? schedules.map((s) => ({ n: s.installmentNumber, due: ymd(s.dueDate), amount: Number(s.amount) || iv }))
      : inst <= 1
        ? [{ n: 1, due: ymd(loan.dueDate || loan.due_date), amount: total }]
        : Array.from({ length: inst }, (_, i) => {
            const base = new Date(`${ymd(loan.dueDate || loan.due_date)}T00:00:00`);
            const due = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
            return {
              n: i + 1,
              due: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
              amount: iv,
            };
          });

    const paid = paidByLoan.get(loan.id) || 0;

    entries.forEach((e) => {
      if (!e.due || e.due.slice(0, 7) !== monthKey) return;
      portfolio += e.amount;
      if (e.due >= cutoff) return; // not yet due at cutoff
      const paidUpToThis = e.n * iv;
      const isPaid = paid >= (e.n * iv) - 0.01;
      if (isPaid) return;
      overdue += e.amount;
    });
  });

  return portfolio > 0 ? (overdue / portfolio) * 100 : 0;
}

export function computeDailyEvolution(
  type: GoalType,
  year: number,
  month: number, // 1-12
  inputs: DailyEvolutionInputs,
): DailyPoint[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const today = todayInAppTz(); // YYYY-MM-DD
  const points: DailyPoint[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const cutoff = `${monthKey}-${String(day).padStart(2, "0")}`;
    const isFuture = cutoff > today;

    if (isFuture) {
      points.push({ day, dayLabel: String(day).padStart(2, "0"), date: cutoff, value: NaN, isFuture: true });
      continue;
    }

    let value = 0;
    switch (type) {
      case "active_capital":
        value = activeCapitalAt(inputs.loans, inputs.payments, cutoff);
        break;
      case "max_default_rate":
        value = defaultRateAt(inputs.loans, inputs.payments, inputs.installmentSchedules, monthKey, cutoff);
        break;
      case "monthly_variation":
        value = NaN; // not applicable at daily granularity
        break;
      default: {
        // Cumulative-in-month metrics: slice records to <= cutoff and reuse
        // the existing month-scoped compute so numbers grow through the month.
        const slicedPayments = inputs.payments.filter((p: any) => ymd(p.date) <= cutoff);
        const slicedLoans = inputs.loans.filter((l: any) => ymd(l.startDate || l.start_date) <= cutoff);
        const slicedClients = inputs.clients.filter((c: any) => ymd(c.created_at || c.createdAt) <= cutoff);
        const slicedExpenses = inputs.expenses.filter((e: any) => {
          const d = ymd(e.paid_date || e.paidDate || e.due_date || e.dueDate);
          return d <= cutoff;
        });
        const slicedReneg = inputs.renegotiations.filter((r: any) => {
          const d = ymd(r.renegotiatedAt || r.createdAt);
          return d <= cutoff;
        });
        const v = computeActual(
          type, monthKey,
          slicedLoans, slicedPayments, slicedExpenses, slicedClients,
          inputs.installmentSchedules, slicedReneg,
        );
        value = Number.isFinite(v) ? v : 0;
        break;
      }
    }

    points.push({ day, dayLabel: String(day).padStart(2, "0"), date: cutoff, value, isFuture: false });
  }

  return points;
}
