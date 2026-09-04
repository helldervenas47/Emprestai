import type { Loan, Payment, Expense, Client, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";
import type { MonthlyGoal } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { formatMonthLabel } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { computeActual } from "@/features/piggyBanks/components/GoalsCard";
import { getLoanReceivable, getBaseRemainingAmount, getLoanLateFees } from "@/features/loans/lib/loanLateFees";
import { getInstallmentAmount, getOverdueInstallments, getOverdueAmount } from "@/features/loans/lib/loanInstallmentAmount";
import { getDaysOverdue, getFirstPendingDate, getLoanCategory } from "@/features/loans/components/list/calculations";
import { calculateInstallment, calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
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

  // 4. Resultado operacional: Recebimentos Totais - Despesas Operacionais - Faturamento (Novos Empréstimos)
  const result = received - expensesTotal - revenue;

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
  const overdueLoansList: import("./types").MonthlyClosingOverdueItem[] = [];

  loans.forEach((loan: any) => {
    const installments = Math.max(1, Number(loan.installments) || 1);
    const principal = Number(loan.amount) || 0;
    const rate = Number(loan.interestRate ?? loan.interest_rate) || 0;
    const paidInstallments = Number(loan.paidInstallments) || 0;
    const currentInstallmentNumber = Math.min(installments, paidInstallments + 1);

    // Valor Total com juros (mesmo padrão da aba Empréstimos)
    const totalAmount = loan.totalAmount != null && Number(loan.totalAmount) > 0
      ? Number(loan.totalAmount)
      : calculateTotalWithInterest(principal, rate, installments);

    // Saldo Devedor Restante Real (mesmo padrão da aba Empréstimos)
    const baseRemaining = loan.status === "paid" || loan.status === "completed"
      ? 0
      : loan.remainingAmount != null && Number(loan.remainingAmount) >= 0
      ? Number(loan.remainingAmount)
      : getBaseRemainingAmount(loan, payments, installmentSchedules);

    // Valor da próxima parcela pendente (mesmo padrão da aba Empréstimos)
    const nextInstallmentAmount = getInstallmentAmount(loan, installmentSchedules, payments);

    // Checagem de quitação do contrato
    const isLoanFullyPaid =
      loan.status === "paid" ||
      loan.status === "completed" ||
      baseRemaining <= 0.01 ||
      paidInstallments >= installments;

    if (isLoanFullyPaid) {
      if (isClosed) {
        const lPayments = payments.filter((p: any) => (p.loanId || p.loan_id) === loan.id);
        const lastPayDate = lPayments
          .map((p: any) => (p.date || "").slice(0, 10))
          .sort()
          .pop();
        if (lastPayDate && lastPayDate <= cutoffDate) {
          return;
        }
      } else {
        return;
      }
    }

    const loanSchedules = installmentSchedules
      .filter((s) => s.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    // Identifica o vencimento da parcela pendente (considera cronograma salvo ou contrato)
    const currentSchedule = loanSchedules.find((s) => s.installmentNumber === currentInstallmentNumber);
    const activeDueDate = (currentSchedule?.dueDate || loan.dueDate || loan.due_date || "").slice(0, 10);
    const daysOverdue = getDaysOverdue(loan, installmentSchedules);

    // Se estamos no mês vigente e o contrato está em dia ou com vencimento futuro/prorrogado
    if (!isClosed && (daysOverdue <= 0 || activeDueDate >= today)) {
      return;
    }

    let hasOverdueInMonth = false;
    let contractOverdueAmount = 0;
    const overdueInstallmentNumbers: number[] = [];
    let firstOverdueDate = "";

    if (installments <= 1) {
      // Contrato de parcela única
      const singleDueDate = activeDueDate;
      if (inMonth(singleDueDate, monthKey) && singleDueDate < cutoffDate && baseRemaining > 0.05) {
        hasOverdueInMonth = true;
        contractOverdueAmount = baseRemaining;
        overdueInstallmentNumbers.push(1);
        firstOverdueDate = singleDueDate;
      }
    } else if (loanSchedules.length > 0) {
      // Contrato parcelado com cronograma
      const pendingSchedules = loanSchedules.filter((s) => s.installmentNumber > paidInstallments);
      pendingSchedules.forEach((s) => {
        if (!inMonth(s.dueDate, monthKey)) return;
        if (s.dueDate >= cutoffDate) return;
        if (!isClosed && s.dueDate >= today) return;

        hasOverdueInMonth = true;
        overdueInstallmentNumbers.push(s.installmentNumber);
        if (!firstOverdueDate || s.dueDate < firstOverdueDate) {
          firstOverdueDate = s.dueDate;
        }

        const instVal = s.installmentNumber === currentInstallmentNumber
          ? nextInstallmentAmount
          : Number(s.amount) || 0;
        contractOverdueAmount += instVal;
      });
      contractOverdueAmount = Math.min(contractOverdueAmount, baseRemaining);
    } else {
      // Contrato parcelado sem cronograma
      const dueDates = Array.from({ length: installments }, (_, idx) => {
        const base = new Date(`${(loan.dueDate || loan.due_date).slice(0, 10)}T00:00:00`);
        const due = new Date(base.getFullYear(), base.getMonth() + idx, base.getDate());
        return {
          installmentNumber: idx + 1,
          dueDate: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
        };
      });

      dueDates.forEach((d) => {
        if (d.installmentNumber <= paidInstallments) return;
        if (!inMonth(d.dueDate, monthKey)) return;
        if (d.dueDate >= cutoffDate) return;
        if (!isClosed && d.dueDate >= today) return;

        hasOverdueInMonth = true;
        overdueInstallmentNumbers.push(d.installmentNumber);
        if (!firstOverdueDate || d.dueDate < firstOverdueDate) {
          firstOverdueDate = d.dueDate;
        }
        contractOverdueAmount += nextInstallmentAmount;
      });
      contractOverdueAmount = Math.min(contractOverdueAmount, baseRemaining);
    }

    if (hasOverdueInMonth && contractOverdueAmount > 0.05) {
      let daysLate = Math.max(0, daysOverdue);
      if (!isClosed && daysLate <= 0) {
        return;
      }
      if (isClosed && !daysLate && firstOverdueDate) {
        const dueMs = new Date(`${firstOverdueDate.slice(0, 10)}T00:00:00`).getTime();
        const refMs = new Date(`${cutoffDate}T00:00:00`).getTime();
        daysLate = Math.max(0, Math.floor((refMs - dueMs) / (1000 * 60 * 60 * 24)));
      }

      const lateFeesResult = getLoanLateFees(loan, payments, installmentSchedules);
      const lateInterestTotal = lateFeesResult.lateInterestTotal || 0;
      const penaltyTotal = (lateFeesResult.penaltyTotal || 0) + (installments < 2 ? Number(loan.renegotiationPenaltyTotal || 0) : 0);
      const totalFees = Math.round((lateInterestTotal + penaltyTotal) * 100) / 100;

      const finalOverdueAmount = Math.round((contractOverdueAmount + totalFees) * 100) / 100;
      const finalRemainingAmount = Math.round((baseRemaining + totalFees) * 100) / 100;
      const finalInstallmentAmount = Math.round((nextInstallmentAmount + totalFees) * 100) / 100;
      const interestAmount = Math.max(0, Math.round((totalAmount - principal) * 100) / 100);

      overdueLoansCount += 1;
      overdueAmount += finalOverdueAmount;

      const rawClientId = loan.clientId || loan.client_id || loan.borrowerId || loan.borrower_id || "";
      const client = clients.find((c: any) => c.id === rawClientId);
      const clientName = client?.name || loan.clientName || loan.client_name || "Cliente";
      const clientPhone = client?.phone || loan.clientPhone || "";
      const clientPhotoUrl = client?.photo_url || (client as any)?.photoUrl || "";

      const tags = Array.isArray(loan.tags) ? loan.tags : (loan as any).custom_tags || [];

      overdueLoansList.push({
        loanId: loan.id,
        loanNumber: loan.loanNumber || loan.loan_number || loan.id.slice(0, 8),
        clientId: rawClientId,
        clientName,
        clientPhone,
        clientPhotoUrl,
        principalAmount: principal,
        totalWithInterest: totalAmount,
        totalAmount,
        interestAmount,
        remainingAmount: finalRemainingAmount,
        installmentAmount: finalInstallmentAmount,
        overdueAmount: finalOverdueAmount,
        overdueInstallmentsCount: overdueInstallmentNumbers.length,
        totalInstallments: installments,
        paidInstallments,
        currentInstallmentNumber,
        firstOverdueDate: firstOverdueDate || activeDueDate || loan.dueDate,
        daysLate,
        overdueInstallmentNumbers,
        tags,
        lateFees: totalFees,
        lateInterestTotal,
        penaltyTotal,
      });
    }
  });

  // Ordena por ordem alfabética do nome do cliente
  overdueLoansList.sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR", { sensitivity: "base" }));

  // 6.2 Lista Geral de Todos os Inadimplentes (Geral / Todo o histórico - 100% alinhado com a aba Empréstimos)
  const allOverdueLoansList: import("./types").MonthlyClosingOverdueItem[] = [];
  let allOverdueTotalAmount = 0;

  loans.forEach((loan: any) => {
    // Utiliza a exata mesma lógica da aba Empréstimos (getLoanCategory === "overdue")
    const isOverdue = getLoanCategory(loan, payments, installmentSchedules) === "overdue";
    if (!isOverdue) return;

    const installments = Math.max(1, Number(loan.installments) || 1);
    const principal = Number(loan.amount) || 0;
    const rate = Number(loan.interestRate ?? loan.interest_rate) || 0;
    const paidInstallments = Number(loan.paidInstallments) || 0;
    const currentInstallmentNumber = Math.min(installments, paidInstallments + 1);

    const totalAmount = loan.totalAmount != null && Number(loan.totalAmount) > 0
      ? Number(loan.totalAmount)
      : calculateTotalWithInterest(principal, rate, installments);

    const baseRemaining = loan.remainingAmount != null && Number(loan.remainingAmount) >= 0
      ? Number(loan.remainingAmount)
      : getBaseRemainingAmount(loan, payments, installmentSchedules);

    const nextInstallmentAmount = getInstallmentAmount(loan, installmentSchedules, payments);

    const overdueInsts = getOverdueInstallments(loan, installmentSchedules, today);
    const overdueInstallmentNumbers = overdueInsts.map((i) => i.installmentNumber);

    const firstPending = getFirstPendingDate(loan, installmentSchedules);
    const firstOverdueDate = !isNaN(firstPending.getTime())
      ? `${firstPending.getFullYear()}-${String(firstPending.getMonth() + 1).padStart(2, "0")}-${String(firstPending.getDate()).padStart(2, "0")}`
      : (loan.dueDate || loan.due_date || "");

    const daysLate = Math.max(1, getDaysOverdue(loan, installmentSchedules));

    let nominalOverdue = overdueInsts.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    if (nominalOverdue <= 0.01) {
      nominalOverdue = nextInstallmentAmount > 0 ? nextInstallmentAmount : (baseRemaining > 0 ? baseRemaining : totalAmount);
    }
    nominalOverdue = Math.min(nominalOverdue, baseRemaining > 0 ? baseRemaining : nominalOverdue);

    const lateFeesResult = getLoanLateFees(loan, payments, installmentSchedules);
    const lateInterestTotal = lateFeesResult.lateInterestTotal || 0;
    const penaltyTotal = (lateFeesResult.penaltyTotal || 0) + (installments < 2 ? Number(loan.renegotiationPenaltyTotal || 0) : 0);
    const totalFees = Math.round((lateInterestTotal + penaltyTotal) * 100) / 100;

    const finalOverdueAmount = Math.round((nominalOverdue + totalFees) * 100) / 100;
    const finalRemainingAmount = Math.round((baseRemaining + totalFees) * 100) / 100;
    const finalInstallmentAmount = Math.round((nextInstallmentAmount + totalFees) * 100) / 100;
    const interestAmount = Math.max(0, Math.round((totalAmount - principal) * 100) / 100);

    allOverdueTotalAmount += finalOverdueAmount;

    const rawClientId = loan.clientId || loan.client_id || loan.borrowerId || loan.borrower_id || "";
    const client = clients.find((c: any) => c.id === rawClientId);
    const clientName = client?.name || loan.borrowerName || loan.clientName || loan.client_name || "Cliente";
    const clientPhone = client?.phone || loan.clientPhone || "";
    const clientPhotoUrl = client?.photo_url || (client as any)?.photoUrl || "";
    const tags = Array.isArray(loan.tags) ? loan.tags : (loan as any).custom_tags || [];

    allOverdueLoansList.push({
      loanId: loan.id,
      loanNumber: loan.loanNumber || loan.loan_number || loan.id.slice(0, 8),
      clientId: rawClientId,
      clientName,
      clientPhone,
      clientPhotoUrl,
      principalAmount: principal,
      totalWithInterest: totalAmount,
      totalAmount,
      interestAmount,
      remainingAmount: finalRemainingAmount,
      installmentAmount: finalInstallmentAmount,
      overdueAmount: finalOverdueAmount,
      overdueInstallmentsCount: Math.max(1, overdueInstallmentNumbers.length),
      totalInstallments: installments,
      paidInstallments,
      currentInstallmentNumber,
      firstOverdueDate,
      daysLate,
      overdueInstallmentNumbers: overdueInstallmentNumbers.length > 0 ? overdueInstallmentNumbers : [currentInstallmentNumber],
      tags,
      lateFees: totalFees,
      lateInterestTotal,
      penaltyTotal,
    });
  });

  allOverdueLoansList.sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR", { sensitivity: "base" }));

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
    overdueLoansList,
    allOverdueLoansList,
    allOverdueTotalAmount,
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

    const today = todayInAppTz();
    const currentMonthKey = today.slice(0, 7);
    const isClosed = monthKey < currentMonthKey;
    const isFuture = monthKey > currentMonthKey;

    let actual = 0;
    const snap = inputs.getGoalSnapshot ? inputs.getGoalSnapshot(g.goalType, monthKey) : null;
    const snapFinalized = isClosed && !!snap?.finalized;

    if (snapFinalized && g.goalType !== "daily_received_avg") {
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

    if (g.goalType === "daily_received_avg" && !isFuture && !snapFinalized) {
      const [yy, mm] = monthKey.split("-").map(Number);
      const daysInMonth = new Date(yy, mm, 0).getDate();
      const isCurrent = monthKey === currentMonthKey;
      const todayDate = Number(today.slice(8, 10)) || 1;
      const days = isCurrent ? todayDate : daysInMonth;
      actual = days > 0 ? actual / days : 0;
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
    isClosedMonth,
    isCurrentMonth,
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
