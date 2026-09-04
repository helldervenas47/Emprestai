import type { Loan, Payment, Expense, Client, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";
import type { MonthlyGoal } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { formatMonthLabel } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { computeActual } from "@/features/piggyBanks/components/GoalsCard";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { todayInAppTz } from "@/lib/timezone";
import {
  GOAL_TYPE_METADATA,
  classifyGoalStatus,
  formatGoalValue,
  formatDiffValue,
} from "./monthlyClosingConfig";
import type {
  MonthlyClosingData,
  MonthlyClosingFinancialSummary,
  MonthlyClosingComparison,
  MetricComparisonItem,
  MonthlyClosingGoalItem,
  MonthlyClosingGoalSummary,
} from "./types";
import { generateMonthlyClosingInsights } from "./monthlyClosingInsightGenerator";

function inMonth(dateStr: string | undefined | null, monthKey: string): boolean {
  if (!dateStr) return false;
  return String(dateStr).slice(0, 7) === monthKey;
}

export function getPreviousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const prevDate = new Date(y, m - 2, 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
}

export function getNextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const nextDate = new Date(y, m, 1);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
}

export interface MonthlyClosingCalculatorInputs {
  monthKey: string;
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules?: InstallmentSchedule[];
  renegotiations?: LoanRenegotiation[];
  goals: MonthlyGoal[];
  getGoalSnapshot?: (type: string, monthKey: string) => any;
  getActiveCapitalSnapshot?: (monthKey: string) => number | null;
  lastUpdatedAt?: string;
}

export function calculateFinancialSummaryForMonth(
  monthKey: string,
  loans: Loan[],
  payments: Payment[],
  expenses: Expense[],
  clients: Client[],
  installmentSchedules: InstallmentSchedule[] = [],
  renegotiations: LoanRenegotiation[] = [],
  getActiveCapitalSnapshot?: (monthKey: string) => number | null
): MonthlyClosingFinancialSummary {
  const today = todayInAppTz();
  const currentMonthKey = today.slice(0, 7);
  const isClosed = monthKey < currentMonthKey;

  // 1. Faturamento / Volume de empréstimos concedidos
  const monthLoans = loans.filter((l: any) => inMonth(l.startDate || l.start_date, monthKey));
  const revenue = monthLoans.reduce((sum, l: any) => sum + (Number(l.amount) || 0), 0);
  const newLoansCount = monthLoans.length;

  // 2. Recebimentos no mês
  const monthPayments = payments.filter((p: any) => inMonth(p.date, monthKey));
  const received = monthPayments.reduce((sum, p: any) => sum + (Number(p.amount) || 0), 0);

  // 3. Despesas pagas no mês
  const monthExpenses = expenses.filter(
    (e: any) =>
      e.paid &&
      e.scope !== "personal" &&
      inMonth(e.paid_date || e.paidDate || e.due_date || e.dueDate, monthKey)
  );
  const expensesTotal = monthExpenses.reduce((sum, e: any) => sum + (Number(e.amount) || 0), 0);

  // 4. Resultado operacional
  const result = received - expensesTotal;

  // 5. Capital Ativo
  let activeCapital = 0;
  const snapAmount = getActiveCapitalSnapshot ? getActiveCapitalSnapshot(monthKey) : null;
  if (isClosed && snapAmount != null && snapAmount > 0) {
    activeCapital = snapAmount;
  } else {
    activeCapital = loans
      .filter((l: any) => l.status !== "completed" && l.status !== "paid")
      .reduce((sum, l: any) => sum + getLoanReceivable(l, payments, installmentSchedules), 0);
  }

  // 6. Inadimplência e valores em atraso no período
  const defaultRate = computeActual(
    "max_default_rate",
    monthKey,
    loans,
    payments,
    expenses,
    clients,
    installmentSchedules,
    renegotiations
  );

  // Overdue amount & overdue contracts calculation for the month
  const [yy, mm] = monthKey.split("-").map(Number);
  const lastDay = new Date(yy, mm, 0).getDate();
  const monthEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  const cutoffDate = monthEnd < today ? monthEnd : today;

  const totalPaidByLoan = payments.reduce<Record<string, number>>((acc, payment: any) => {
    const loanId = payment.loanId || payment.loan_id;
    const pDate = (payment.date || "").slice(0, 10);
    if (!loanId || !pDate || pDate > cutoffDate) return acc;
    acc[loanId] = (acc[loanId] || 0) + (Number(payment.amount) || 0);
    return acc;
  }, {});

  let overdueAmount = 0;
  let overdueLoansCount = 0;

  loans.forEach((loan: any) => {
    const installments = Math.max(1, Number(loan.installments) || 1);
    const principal = Number(loan.amount) || 0;
    const rate = Number(loan.interestRate ?? loan.interest_rate) || 0;
    const totalWithInterest = Math.round(principal * (1 + rate / 100));
    const installmentValue = totalWithInterest / installments;
    const paidAmount = totalPaidByLoan[loan.id] || 0;
    const calculatedPaidInstallments = Math.floor((paidAmount + 0.01) / installmentValue);

    const loanSchedules = installmentSchedules
      .filter((s) => s.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    const dueEntries =
      loanSchedules.length > 0
        ? loanSchedules.map((s) => ({
            installmentNumber: s.installmentNumber,
            dueDate: s.dueDate,
            amount: Number(s.amount) || installmentValue,
          }))
        : installments <= 1
        ? [{ installmentNumber: 1, dueDate: loan.dueDate || loan.due_date, amount: totalWithInterest }]
        : Array.from({ length: installments }, (_, idx) => {
            const base = new Date(`${(loan.dueDate || loan.due_date).slice(0, 10)}T00:00:00`);
            const due = new Date(base.getFullYear(), base.getMonth() + idx, base.getDate());
            return {
              installmentNumber: idx + 1,
              dueDate: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
              amount: installmentValue,
            };
          });

    let hasOverdueInMonth = false;
    dueEntries.forEach((entry) => {
      if (!inMonth(entry.dueDate, monthKey)) return;
      const isPaidAtCutoff = entry.installmentNumber <= calculatedPaidInstallments;
      if (isPaidAtCutoff || entry.dueDate >= cutoffDate) return;

      hasOverdueInMonth = true;
      if (installments === 1) {
        overdueAmount += Math.max(0, totalWithInterest - paidAmount);
      } else {
        overdueAmount += entry.amount;
      }
    });

    if (hasOverdueInMonth) overdueLoansCount += 1;
  });

  // 7. Contratos quitados no mês
  const completedLoansCount = loans.filter((l: any) => {
    if (l.status !== "completed" && l.status !== "paid") return false;
    // Verifica se o último pagamento ocorreu no mês
    const lPayments = payments.filter((p: any) => (p.loanId || p.loan_id) === l.id);
    if (lPayments.length === 0) return false;
    const lastPaymentDate = lPayments
      .map((p: any) => (p.date || "").slice(0, 10))
      .sort()
      .pop();
    return inMonth(lastPaymentDate, monthKey);
  }).length;

  // 8. Novos Clientes e Clientes Ativos
  const newClientsCount = clients.filter((c: any) => inMonth(c.created_at || c.createdAt, monthKey)).length;
  
  // Clientes com empréstimos ativos no período
  const activeClientIds = new Set(
    loans
      .filter((l: any) => {
        const start = (l.startDate || l.start_date || "").slice(0, 7);
        return start <= monthKey && (l.status !== "completed" || inMonth(l.updated_at, monthKey));
      })
      .map((l: any) => l.borrowerId || l.borrower_id || l.clientId || l.client_id)
      .filter(Boolean)
  );

  return {
    revenue,
    received,
    expenses: expensesTotal,
    result,
    activeCapital,
    defaultRate: isFinite(defaultRate) ? defaultRate : 0,
    overdueAmount,
    newLoansCount,
    completedLoansCount,
    overdueLoansCount,
    newClientsCount,
    activeClientsCount: activeClientIds.size,
  };
}

function buildMetricComparison(
  current: number,
  previous: number,
  isInverse = false,
  isRate = false
): MetricComparisonItem {
  const c = typeof current === "number" && isFinite(current) ? current : 0;
  const p = typeof previous === "number" && isFinite(previous) ? previous : 0;
  const absoluteDiff = c - p;
  let pctDiff = 0;
  if (p > 0) {
    pctDiff = ((c - p) / p) * 100;
  } else if (c > 0 && p === 0) {
    pctDiff = 100;
  }

  const ppDiff = isRate ? c - p : undefined;
  
  // Se for inversa (inadimplência/despesa), evolução positiva é quando DIMINUI
  const isPositiveEvolution = isInverse ? absoluteDiff < 0 : absoluteDiff > 0;

  return {
    current: c,
    previous: p,
    absoluteDiff,
    pctDiff: isFinite(pctDiff) ? pctDiff : 0,
    ppDiff: ppDiff !== undefined && isFinite(ppDiff) ? ppDiff : undefined,
    isPositiveEvolution,
  };
}

export function computeMonthComparison(
  current: MonthlyClosingFinancialSummary,
  previous: MonthlyClosingFinancialSummary
): MonthlyClosingComparison {
  return {
    revenue: buildMetricComparison(current.revenue, previous.revenue, false),
    received: buildMetricComparison(current.received, previous.received, false),
    expenses: buildMetricComparison(current.expenses, previous.expenses, true),
    result: buildMetricComparison(current.result, previous.result, false),
    activeCapital: buildMetricComparison(current.activeCapital, previous.activeCapital, false),
    defaultRate: buildMetricComparison(current.defaultRate, previous.defaultRate, true, true),
    newLoansCount: buildMetricComparison(current.newLoansCount, previous.newLoansCount, false),
    newClientsCount: buildMetricComparison(current.newClientsCount, previous.newClientsCount, false),
  };
}

export function computeMonthlyClosingGoals(
  monthKey: string,
  goals: MonthlyGoal[],
  inputs: {
    loans: Loan[];
    payments: Payment[];
    expenses: Expense[];
    clients: Client[];
    installmentSchedules: InstallmentSchedule[];
    renegotiations: LoanRenegotiation[];
    getGoalSnapshot?: (type: string, monthKey: string) => any;
    getActiveCapitalSnapshot?: (monthKey: string) => number | null;
  }
): { goalsList: MonthlyClosingGoalItem[]; summary: MonthlyClosingGoalSummary } {
  // Busca metas específicas para o mês
  const monthGoals = goals.filter((g) => g.month === monthKey && Number(g.targetValue) > 0);

  const goalsList: MonthlyClosingGoalItem[] = monthGoals.map((g) => {
    const meta = GOAL_TYPE_METADATA[g.goalType] || {
      label: g.goalType,
      unit: "R$",
      isInverse: false,
      description: "",
    };

    let actual = 0;
    const snap = inputs.getGoalSnapshot ? inputs.getGoalSnapshot(g.goalType, monthKey) : null;
    if (snap?.finalized) {
      actual = Number(snap.realizedValue) || 0;
    } else if (g.goalType === "active_capital" && inputs.getActiveCapitalSnapshot) {
      const snapCap = inputs.getActiveCapitalSnapshot(monthKey);
      actual = snapCap != null ? snapCap : computeActual(g.goalType, monthKey, inputs.loans, inputs.payments, inputs.expenses, inputs.clients, inputs.installmentSchedules, inputs.renegotiations);
    } else {
      actual = computeActual(
        g.goalType,
        monthKey,
        inputs.loans,
        inputs.payments,
        inputs.expenses,
        inputs.clients,
        inputs.installmentSchedules,
        inputs.renegotiations
      );
    }

    if (!isFinite(actual) || isNaN(actual)) actual = 0;

    const { status, achievementPct } = classifyGoalStatus(g.targetValue, actual, meta.isInverse);
    const diffValue = actual - g.targetValue;

    return {
      id: g.id,
      goalType: g.goalType,
      label: meta.label,
      unit: meta.unit,
      isInverse: meta.isInverse,
      targetValue: g.targetValue,
      actualValue: actual,
      achievementPct,
      status,
      diffValue,
      formattedTarget: formatGoalValue(g.targetValue, meta.unit),
      formattedActual: formatGoalValue(actual, meta.unit),
      formattedDiff: formatDiffValue(diffValue, meta.unit, meta.isInverse),
      notes: g.notes,
    };
  });

  const totalGoals = goalsList.length;
  const reachedCount = goalsList.filter((g) => g.status === "reached").length;
  const closeCount = goalsList.filter((g) => g.status === "close").length;
  const missedCount = goalsList.filter((g) => g.status === "missed").length;
  const overallAchievementPct = totalGoals > 0 ? (reachedCount / totalGoals) * 100 : 0;

  return {
    goalsList,
    summary: {
      totalGoals,
      reachedCount,
      closeCount,
      missedCount,
      overallAchievementPct,
      hasGoals: totalGoals > 0,
    },
  };
}

export function computeMonthlyClosingData(inputs: MonthlyClosingCalculatorInputs): MonthlyClosingData {
  const {
    monthKey,
    loans,
    payments,
    expenses,
    clients,
    installmentSchedules = [],
    renegotiations = [],
    goals,
    getGoalSnapshot,
    getActiveCapitalSnapshot,
    lastUpdatedAt,
  } = inputs;

  const today = todayInAppTz();
  const currentMonthKey = today.slice(0, 7);
  const isClosedMonth = monthKey < currentMonthKey;
  const isCurrentMonth = monthKey === currentMonthKey;
  const previousMonthKey = getPreviousMonthKey(monthKey);

  // 1. Resumo financeiro do mês corrente e do anterior
  const financial = calculateFinancialSummaryForMonth(
    monthKey,
    loans,
    payments,
    expenses,
    clients,
    installmentSchedules,
    renegotiations,
    getActiveCapitalSnapshot
  );

  const prevFinancial = calculateFinancialSummaryForMonth(
    previousMonthKey,
    loans,
    payments,
    expenses,
    clients,
    installmentSchedules,
    renegotiations,
    getActiveCapitalSnapshot
  );

  // 2. Comparativo mês a mês
  const comparison = computeMonthComparison(financial, prevFinancial);

  // 3. Metas do mês
  const { goalsList, summary: goalsSummary } = computeMonthlyClosingGoals(monthKey, goals, {
    loans,
    payments,
    expenses,
    clients,
    installmentSchedules,
    renegotiations,
    getGoalSnapshot,
    getActiveCapitalSnapshot,
  });

  const monthLabel = formatMonthLabel(monthKey);
  const previousMonthLabel = formatMonthLabel(previousMonthKey);

  const hasSufficientData =
    loans.length > 0 || payments.length > 0 || expenses.length > 0 || clients.length > 0;

  // 4. Análise executiva, destaques e recomendações
  const executiveAnalysis = generateMonthlyClosingInsights({
    monthLabel,
    previousMonthLabel,
    financial,
    comparison,
    goals: goalsList,
    goalsSummary,
    hasSufficientData,
    loans,
    clients,
  });

  const updatedTime =
    lastUpdatedAt ||
    new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return {
    monthKey,
    monthLabel,
    previousMonthKey,
    previousMonthLabel,
    isClosedMonth,
    isCurrentMonth,
    hasSufficientData,
    financial,
    comparison,
    goalsSummary,
    goals: goalsList,
    executiveAnalysis,
    lastUpdatedAt: updatedTime,
  };
}
