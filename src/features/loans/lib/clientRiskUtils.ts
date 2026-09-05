import { Client, InstallmentSchedule, Loan, Payment } from "@/types/loan";

export interface ClientRiskMetrics {
  totalLent: number;
  overdueLoans: number;
  severeOverdueLoans: number;
  highOverdueLoans: number;
  maxOverdueDays: number;
  paidLoans: number;
  activeLoans: number;
  onTimePayments: number;
  latePayments: number;
  partialPayments: number;
  totalTimedPayments: number;
  onTimeRatio: number;
  lateRatio: number;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatRiskCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

export function normalizeClientKey(value?: string | null) {
  return (value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getLoanClientKey(loan: Loan) {
  return loan?.borrowerId || normalizeClientKey(loan?.borrowerName);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getDiffInDays(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function getNextDate(base: Date, frequency: string, periods: number) {
  const d = new Date(base);
  if (frequency === "Semanal") d.setDate(d.getDate() + 7 * periods);
  else if (frequency === "Quinzenal") d.setDate(d.getDate() + 15 * periods);
  else d.setMonth(d.getMonth() + periods);
  return d;
}

export function getFirstPendingDate(loan: Loan, schedules: InstallmentSchedule[] = []): Date {
  if (!loan) return new Date();
  const safeSchedules = Array.isArray(schedules) ? schedules : [];
  const loanSchedules = safeSchedules
    .filter((s) => s && s.loanId === loan.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const nextNum = (loan.paidInstallments || 0) + 1;
  const saved = loanSchedules.find((s) => s.installmentNumber === nextNum);
  if (saved?.dueDate) return new Date(saved.dueDate + "T00:00:00");
  if (loan.dueDate) return new Date(loan.dueDate + "T00:00:00");
  return new Date();
}

export function getDaysOverdue(loan: Loan, schedules: InstallmentSchedule[] = [], referenceDate = new Date()): number {
  if (!loan) return 0;
  const todayNorm = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const due = getFirstPendingDate(loan, schedules);
  if (isNaN(due.getTime())) return 0;
  return Math.floor((todayNorm.getTime() - due.getTime()) / 86400000);
}

export function getInstallmentDueDate(loan: Loan, installmentNumber: number, schedules: InstallmentSchedule[] = []): string {
  if (!loan) return "";
  const safeSchedules = Array.isArray(schedules) ? schedules : [];
  const savedSchedule = safeSchedules.find((s) => s && s.loanId === loan.id && s.installmentNumber === installmentNumber);
  if (savedSchedule?.dueDate) return savedSchedule.dueDate;
  if (!loan.dueDate) return "";
  const firstDue = new Date(loan.dueDate + "T00:00:00");
  if (isNaN(firstDue.getTime())) return loan.dueDate;
  return getNextDate(firstDue, loan.interestType || "Mensal", Math.max(0, installmentNumber - 1)).toISOString().split("T")[0];
}

export function getClientLoans(client: Client, loans: Loan[] = []): Loan[] {
  if (!client || !Array.isArray(loans)) return [];
  const clientKey = normalizeClientKey(client.name);
  return loans.filter((loan) => {
    if (!loan) return false;
    const loanNameKey = normalizeClientKey(loan.borrowerName);
    // 1. Se o nome do devedor no empréstimo foi preenchido e confere com o cliente:
    if (loanNameKey && clientKey && loanNameKey === clientKey) {
      return true;
    }
    // 2. Se tem borrowerId correspondente, só aceita se o borrowerName não pertencer a outro devedor diferente
    if (loan.borrowerId && loan.borrowerId === client.id) {
      if (!loanNameKey || loanNameKey === clientKey) {
        return true;
      }
    }
    return false;
  });
}

export function getLoanCategory(loan: Loan, payments: Payment[] = [], schedules: InstallmentSchedule[] = [], referenceDate = new Date()) {
  if (!loan) return "on_track" as const;
  if (loan.status === "paid") return "paid" as const;
  const days = getDaysOverdue(loan, schedules, referenceDate);
  const safePayments = Array.isArray(payments) ? payments : [];
  const loanPayments = safePayments.filter((p) => p && p.loanId === loan.id);
  const lastPayment = loanPayments.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  const paidContractualInterestOnTime = lastPayment
    && lastPayment.installmentNumber === 0
    && !!lastPayment.previousDueDate
    && lastPayment.date <= lastPayment.previousDueDate;
  if (days < 0) return paidContractualInterestOnTime ? "paid_interest" as const : "on_track" as const;
  if (days === 0) return "due_today" as const;
  if (days > 0) return "overdue" as const;
  return "on_track" as const;
}

export function getClientRiskMetrics(
  client: Client,
  loans: Loan[] = [],
  payments: Payment[] = [],
  installmentSchedules: InstallmentSchedule[] = [],
  referenceDate = new Date()
): ClientRiskMetrics {
  const safeLoans = Array.isArray(loans) ? loans : [];
  const safePayments = Array.isArray(payments) ? payments : [];
  const safeSchedules = Array.isArray(installmentSchedules) ? installmentSchedules : [];

  const refDateStr = referenceDate.toISOString().split("T")[0];
  const clientLoans = getClientLoans(client, safeLoans).filter((loan) => (loan.startDate || "") <= refDateStr);
  const allowedPayments = safePayments.filter((payment) => (payment.date || "") <= refDateStr);
  const totalLent = clientLoans.reduce((sum, loan) => sum + (loan.amount || 0), 0);
  const overdueLoans = clientLoans.filter((loan) => getLoanCategory(loan, allowedPayments, safeSchedules, referenceDate) === "overdue");
  const paidLoans = clientLoans.filter((loan) => loan.status === "paid").length;
  const activeLoans = clientLoans.filter((loan) => loan.status !== "paid").length;

  let onTimePayments = 0;
  let latePayments = 0;
  let partialPayments = 0;

  clientLoans.forEach((loan) => {
    allowedPayments
      .filter((payment) => payment && payment.loanId === loan.id)
      .forEach((payment) => {
        if (payment.installmentNumber === -1) {
          partialPayments += 1;
          return;
        }

        if (payment.installmentNumber === 0) {
          const contractualDueDate = payment.previousDueDate ?? loan.dueDate;
          if (contractualDueDate && payment.date <= contractualDueDate) {
            onTimePayments += 1;
          } else {
            latePayments += 1;
          }
          return;
        }

        if (payment.installmentNumber < 0) return;

        const dueDate = getInstallmentDueDate(loan, payment.installmentNumber, safeSchedules);
        if (dueDate && payment.date <= dueDate) onTimePayments += 1;
        else latePayments += 1;
      });
  });

  const historicalOverdueDays = clientLoans.map((loan) => {
    const currentOverdueDays = getLoanCategory(loan, allowedPayments, safeSchedules, referenceDate) === "overdue"
      ? getDaysOverdue(loan, safeSchedules, referenceDate)
      : 0;

    const paidDelayDays = allowedPayments
      .filter((payment) => payment && payment.loanId === loan.id)
      .reduce((maxDelay, payment) => {
        if (payment.installmentNumber === -1) return maxDelay;

        const dueDate = payment.installmentNumber === 0
          ? (payment.previousDueDate ?? loan.dueDate)
          : payment.installmentNumber > 0
            ? getInstallmentDueDate(loan, payment.installmentNumber, safeSchedules)
            : null;

        if (!dueDate || !payment.date) return maxDelay;
        return Math.max(maxDelay, getDiffInDays(dueDate, payment.date));
      }, 0);

    return Math.max(currentOverdueDays, paidDelayDays);
  });

  const highOverdueLoans = historicalOverdueDays.filter((days) => days >= 16).length;
  const severeOverdueLoans = historicalOverdueDays.filter((days) => days > 30).length;
  const maxOverdueDays = historicalOverdueDays.length > 0 ? Math.max(...historicalOverdueDays) : 0;

  const totalTimedPayments = onTimePayments + latePayments;
  const onTimeRatio = totalTimedPayments > 0 ? onTimePayments / totalTimedPayments : 0;
  const lateRatio = totalTimedPayments > 0 ? latePayments / totalTimedPayments : 0;

  return {
    totalLent,
    overdueLoans: overdueLoans.length,
    severeOverdueLoans,
    highOverdueLoans,
    maxOverdueDays,
    paidLoans,
    activeLoans,
    onTimePayments,
    latePayments,
    partialPayments,
    totalTimedPayments,
    onTimeRatio,
    lateRatio,
  };
}
