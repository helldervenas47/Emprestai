import type { Client, Loan, Sale, Payment, Expense, InstallmentSchedule } from "@/types/loan";
import { isInRange } from "@/features/dashboard/components/dashboard/dashboardHelpers";
import { aggregatePortfolioPending } from "@/features/loans/lib/portfolioPending";
import { analyzeOverdueConcentration } from "./pulseClientPrioritizer";
import { PULSE_CONFIG } from "./pulseConfig";
import type { PulseComparisonMetrics, PulsePeriodMetrics } from "./types";

interface CalculatePulseMetricsParams {
  loans: Loan[];
  sales?: Sale[];
  payments: Payment[];
  expenses: Expense[];
  clients?: Client[];
  installmentSchedules?: InstallmentSchedule[];
  range: { start: Date; end: Date; label: string };
  period?: "day" | "week" | "month";
  referenceDate?: Date;
}

function computePeriodMetrics({
  loans,
  sales = [],
  payments,
  expenses,
  installmentSchedules = [],
  start,
  end,
  referenceDate = new Date(),
}: {
  loans: Loan[];
  sales?: Sale[];
  payments: Payment[];
  expenses: Expense[];
  installmentSchedules?: InstallmentSchedule[];
  start: Date;
  end: Date;
  referenceDate?: Date;
}): PulsePeriodMetrics {
  const safeLoans = Array.isArray(loans) ? loans : [];
  const safeSales = Array.isArray(sales) ? sales : [];
  const safePayments = Array.isArray(payments) ? payments : [];
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeSchedules = Array.isArray(installmentSchedules) ? installmentSchedules : [];

  // Faturamento = Novos empréstimos contratados no período + Vendas
  const periodLoans = safeLoans.filter((l) => isInRange(l.startDate, start, end));
  const periodSales = safeSales.filter((s) => isInRange(s.date, start, end));
  const loanRevenue = periodLoans.reduce((sum, l) => sum + (l.amount || 0), 0);
  const salesRevenue = periodSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const revenue = loanRevenue + salesRevenue;

  // Recebimentos = Pagamentos de parcelas / juros recebidos no período
  const periodPayments = safePayments.filter((p) => isInRange(p.date, start, end));
  const received = periodPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Despesas = Despesas pagas no período
  const periodExpenses = safeExpenses.filter((e) => {
    const paymentDate = e.paidDate || (e.paid ? e.dueDate : null);
    return e.paid && paymentDate && isInRange(paymentDate, start, end);
  });
  const totalExpenses = periodExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Resultado operacional no período
  const netResult = received - totalExpenses;

  // Estado da carteira na data de referência
  const portfolio = aggregatePortfolioPending({
    loans: safeLoans,
    payments: safePayments,
    installmentSchedules: safeSchedules,
    calculationDate: end.toISOString().split("T")[0],
  });

  const activeCapital = portfolio.capitalOnStreet;
  const activeLoansCount = safeLoans.filter((l) => l.status !== "paid" && l.status !== "cancelled").length;

  // Inadimplência
  const refDateStr = referenceDate.toISOString().split("T")[0];
  const activeLoansAtRef = safeLoans.filter((l) => (l.startDate || "") <= refDateStr && l.status !== "paid" && l.status !== "cancelled");
  let overdueAmount = 0;

  activeLoansAtRef.forEach((loan) => {
    const loanSchedules = safeSchedules.filter((s) => s.loanId === loan.id).sort((a, b) => a.installmentNumber - b.installmentNumber);
    const nextNum = (loan.paidInstallments || 0) + 1;
    const schedule = loanSchedules.find((s) => s.installmentNumber === nextNum);
    const dueStr = schedule?.dueDate || loan.dueDate;
    if (dueStr && dueStr < refDateStr) {
      overdueAmount += (schedule?.amount || loan.amount || 0);
    }
  });

  const defaultDenominator = activeCapital + overdueAmount;
  const defaultRatePct = defaultDenominator > 0
    ? Math.round((overdueAmount / defaultDenominator) * 1000) / 10
    : 0;

  return {
    revenue,
    received,
    expenses: totalExpenses,
    netResult,
    overdueAmount,
    defaultRatePct,
    activeLoansCount,
    activeCapital,
  };
}

export function calculateBusinessPulseMetrics({
  loans,
  sales = [],
  payments,
  expenses,
  clients = [],
  installmentSchedules = [],
  range,
  period = "month",
  referenceDate = new Date(),
}: CalculatePulseMetricsParams): PulseComparisonMetrics {
  const currentStart = range.start;
  const currentEnd = range.end;

  // Determina se o período atual é o mês em andamento ou um mês fechado
  const now = referenceDate;
  const isCurrentMonth =
    currentStart.getFullYear() === now.getFullYear() &&
    currentStart.getMonth() === now.getMonth();

  let prevStart: Date;
  let prevEnd: Date;
  let isSamePeriodComparison = false;

  if (isCurrentMonth) {
    // Comparação do Dia 1 até hoje com Dia 1 até o mesmo dia do mês anterior
    const currentDay = now.getDate();
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    // Ajusta para o último dia do mês anterior se o mês anterior tiver menos dias
    const lastDayOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const targetPrevDay = Math.min(currentDay, lastDayOfPrevMonth);
    prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, targetPrevDay, 23, 59, 59);
    isSamePeriodComparison = true;
  } else {
    // Mês completo anterior
    prevStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1, 0, 0, 0);
    prevEnd = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0, 23, 59, 59);
  }

  const currentMetrics = computePeriodMetrics({
    loans,
    sales,
    payments,
    expenses,
    installmentSchedules,
    start: currentStart,
    end: currentEnd,
    referenceDate: isCurrentMonth ? now : currentEnd,
  });

  const prevMetrics = computePeriodMetrics({
    loans,
    sales,
    payments,
    expenses,
    installmentSchedules,
    start: prevStart,
    end: prevEnd,
    referenceDate: prevEnd,
  });

  // Cálculo das variações
  const revenueAbs = currentMetrics.revenue - prevMetrics.revenue;
  const revenuePct = prevMetrics.revenue > 0
    ? Math.round((revenueAbs / prevMetrics.revenue) * 1000) / 10
    : currentMetrics.revenue > 0 ? 100 : 0;

  const receivedAbs = currentMetrics.received - prevMetrics.received;
  const receivedPct = prevMetrics.received > 0
    ? Math.round((receivedAbs / prevMetrics.received) * 1000) / 10
    : currentMetrics.received > 0 ? 100 : 0;

  const expensesAbs = currentMetrics.expenses - prevMetrics.expenses;
  const expensesPct = prevMetrics.expenses > 0
    ? Math.round((expensesAbs / prevMetrics.expenses) * 1000) / 10
    : currentMetrics.expenses > 0 ? 100 : 0;

  const netResultAbs = currentMetrics.netResult - prevMetrics.netResult;
  const netResultPct = prevMetrics.netResult !== 0
    ? Math.round((netResultAbs / Math.abs(prevMetrics.netResult)) * 1000) / 10
    : currentMetrics.netResult !== 0 ? 100 : 0;

  // Variação de inadimplência em Pontos Percentuais (p.p.)
  const defaultRatePp = Math.round((currentMetrics.defaultRatePct - prevMetrics.defaultRatePct) * 10) / 10;

  const overdueAbs = currentMetrics.overdueAmount - prevMetrics.overdueAmount;
  const overduePct = prevMetrics.overdueAmount > 0
    ? Math.round((overdueAbs / prevMetrics.overdueAmount) * 1000) / 10
    : currentMetrics.overdueAmount > 0 ? 100 : 0;

  // Concentração e clientes prioritários
  const concentration = analyzeOverdueConcentration({
    clients,
    loans,
    payments,
    installmentSchedules,
    referenceDate: isCurrentMonth ? now : currentEnd,
    prevReferenceDate: prevEnd,
  });

  // Avaliação de suficiência de dados
  const totalRelevantOperations =
    loans.length +
    payments.length +
    expenses.length;

  const hasSufficientData = totalRelevantOperations >= PULSE_CONFIG.MIN_TRANSACTIONS_FOR_COMPARISON;
  const isInitialHistory = totalRelevantOperations < 4 || (prevMetrics.revenue === 0 && prevMetrics.received === 0);

  return {
    current: currentMetrics,
    previous: prevMetrics,
    differences: {
      revenueAbsolute: revenueAbs,
      revenuePct,
      receivedAbsolute: receivedAbs,
      receivedPct,
      expensesAbsolute: expensesAbs,
      expensesPct,
      netResultAbsolute: netResultAbs,
      netResultPct,
      defaultRatePp,
      overdueAmountAbsolute: overdueAbs,
      overdueAmountPct: overduePct,
    },
    concentration,
    periodLabel: range.label,
    isSamePeriodComparison,
    hasSufficientData,
    isInitialHistory,
  };
}
