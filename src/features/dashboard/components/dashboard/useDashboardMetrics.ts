import { useMemo } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { calculateMonthlyInterestRate } from "@/features/financial/lib/monthlyInterestRate";
import {
  calculateInstallment,
  calculateTotalWithInterest,
  getLoanRemainingAmount,
} from "@/features/loans/hooks/useLoans";
import {
  getOverdueAmount,
  getOverdueInstallments,
} from "@/features/loans/lib/loanInstallmentAmount";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { aggregatePortfolioPending } from "@/features/loans/lib/portfolioPending";

import type {
  Loan,
  Sale,
  Payment,
  Expense,
  InstallmentSchedule,
} from "@/types/loan";
import type { LedgerEntry } from "@/features/financial/lib/ledger";
import {
  isInRange,
  monthNames,
  summarizeMonthMetrics,
} from "@/features/dashboard/components/dashboard/dashboardHelpers";
import {
  allocateInterestByPaymentUpTo,
  monthlyInterestReceived,
} from "@/features/financial/lib/interestAllocation";
import { resolveFinancialFlags } from "@/features/financial/lib/financialFlags";
import { useUnifiedFinancialAggregates } from "@/features/dashboard/hooks/useUnifiedFinancialAggregates";


interface UseDashboardMetricsInput {
  loans: Loan[];
  sales: Sale[];
  payments: Payment[];
  expenses: Expense[];
  installmentSchedules: InstallmentSchedule[];
  ledgerEntries: LedgerEntry[];
  range: { start: Date; end: Date; label: string };
  period: "day" | "week" | "month";
  includeSales: boolean;
  comparisonWindow: 3 | 6 | 12;
  chartOverrides: Record<string, { emprestado?: number; recebido?: number }>;
  interestOverrides: Record<string, number>;
  paymentMethods: { id: string; name: string; icon: string }[];
  profitGoal: { targetValue: number } | undefined | null;
  receivedDetailMethodId: string | null;
}

function getChartLabel(start: Date) {
  return `${monthNames[start.getMonth()].slice(0, 3)}/${String(start.getFullYear()).slice(2)}`;
}

/**
 * Concentra todos os memos pesados do DashboardOverview:
 * data, receivedByMethod, receivedDetail, profitTargetAmount, portfolio,
 * monthComparison, yearlyAverages, riskReturn, monthlyChartBase/Chart,
 * interestChartBase/Chart. Não altera regra de negócio.
 */
export function useDashboardMetrics(input: UseDashboardMetricsInput) {
  const {
    loans, sales, payments, expenses, installmentSchedules, ledgerEntries,
    range, period, includeSales, comparisonWindow, chartOverrides, interestOverrides,
    paymentMethods, profitGoal, receivedDetailMethodId,
  } = input;

  const data = useMemo(() => {
    const filteredPayments = payments.filter((p) => isInRange(p.date, range.start, range.end));
    const filteredSales = sales.filter((s) => isInRange(s.date, range.start, range.end));
    let incomeFromPayments = filteredPayments.reduce((s, p) => s + p.amount, 0);

    const salesWithReceived = sales.filter((sale) => sale.businessType !== "aluguel_veiculo").map((sale) => {
      const history = sale.paymentHistory || [];
      let received = 0;
      const receipts: { amount: number; date: string; type: "downPayment" | "full" | "partial" | "legacy" }[] = [];

      if ((sale.downPayment || 0) > 0 && isInRange(sale.date, range.start, range.end)) {
        received += sale.downPayment;
        receipts.push({ amount: sale.downPayment, date: sale.date, type: "downPayment" });
      }

      if (history.length > 0) {
        history.forEach((rec) => {
          if (isInRange(rec.date, range.start, range.end)) {
            received += rec.amount || 0;
            receipts.push({ amount: rec.amount || 0, date: rec.date, type: rec.type });
          }
        });
      } else {
        const dates = sale.installmentDates || [];
        const amounts = sale.installmentAmounts || [];
        const fallbackInstAmount = sale.installmentValue
          || (sale.installments > 0 ? sale.total / sale.installments : 0);

        if (dates.length > 0 && sale.paidInstallments > 0) {
          for (let i = 0; i < sale.paidInstallments; i++) {
            const d = dates[i];
            const amt = amounts[i] ?? fallbackInstAmount;
            if (d && isInRange(d, range.start, range.end) && amt > 0) {
              received += amt;
              receipts.push({ amount: amt, date: d, type: "legacy" });
            }
          }
          if ((sale.partialPaid || 0) > 0 && isInRange(sale.date, range.start, range.end)) {
            received += sale.partialPaid;
            receipts.push({ amount: sale.partialPaid, date: sale.date, type: "legacy" });
          }
        } else if (isInRange(sale.date, range.start, range.end)) {
          let legacy = 0;
          if (amounts.length > 0) {
            for (let i = 0; i < sale.paidInstallments; i++) legacy += amounts[i] || 0;
          } else {
            legacy = sale.paidInstallments * fallbackInstAmount;
          }
          legacy += sale.partialPaid || 0;
          if (legacy > 0) {
            received += legacy;
            receipts.push({ amount: legacy, date: sale.date, type: "legacy" });
          }
        }
      }

      return { ...sale, received, receipts };
    }).filter((s) => s.received > 0);

    const incomeFromSales = salesWithReceived.reduce((s, x) => s + x.received, 0);

    const filteredLoans = loans.filter((l) => isInRange(l.startDate, range.start, range.end));
    let totalLoanOutgoing = filteredLoans.reduce((s, l) => s + l.amount, 0);

    // Consolida saídas reais (despesas pagas) no período.
    const filteredExpenses: Expense[] = [];
    let totalExpenses = 0;

    expenses.forEach((e) => {
      const paymentDate = e.paidDate || (e.paid ? e.dueDate : null);
      if (e.paid && paymentDate && isInRange(paymentDate, range.start, range.end)) {
        totalExpenses += e.amount;
        filteredExpenses.push({
          ...e,
          paidDate: paymentDate,
        });
      }
    });

    const groupedExpenses = [...filteredExpenses];
    groupedExpenses.sort((a, b) => (b.paidDate || "").localeCompare(a.paidDate || ""));

    if (period === "month") {
      const label = getChartLabel(range.start);
      const override = chartOverrides[label];
      if (override) {
        if (override.emprestado !== undefined) totalLoanOutgoing += override.emprestado;
        if (override.recebido !== undefined) incomeFromPayments += override.recebido;
      }
    }

    const totalIncome = incomeFromPayments + (includeSales ? incomeFromSales : 0);
    const totalOutgoing = totalLoanOutgoing + totalExpenses;
    const balance = totalIncome - totalOutgoing;

    const transactions: { id: string; type: "in" | "out"; source: "payment" | "sale" | "loan" | "expense" | "ledger"; description: string; amount: number; date: string; createdAt?: string }[] = [];
    const visibleLoanIds = new Set(loans.map((loan) => loan.id));
    const visiblePaymentLedgerEntries = ledgerEntries.filter((entry) => (
      entry.category === "payment"
      && entry.direction === "in"
      && (!entry.loan_id || visibleLoanIds.has(entry.loan_id))
      && isInRange(entry.occurred_on, range.start, range.end)
    ));
    const paymentIdsFromLedger = new Set(
      visiblePaymentLedgerEntries
        .filter((entry) => entry.payment_id)
        .map((entry) => entry.payment_id as string),
    );

    filteredPayments.forEach((p) => {
      if (paymentIdsFromLedger.has(p.id)) return;
      const metadata = p.metadata ?? {};
      if (metadata.kind === "late_fee" && typeof metadata.consolidated_with === "string" && paymentIdsFromLedger.has(metadata.consolidated_with)) return;
      const loan = loans.find((l) => l.id === p.loanId);
      transactions.push({ id: p.id, type: "in", source: "payment", description: `Parcela ${p.installmentNumber} — ${loan?.borrowerName || "Empréstimo"}`, amount: p.amount, date: p.date, createdAt: p.createdAt });
    });
    visiblePaymentLedgerEntries.forEach((entry) => {
      transactions.push({
        id: entry.payment_id || entry.id,
        type: "in",
        source: entry.payment_id ? "payment" : "ledger",
        description: entry.description || "Pagamento recebido",
        amount: Number(entry.amount) || 0,
        date: entry.occurred_on,
        createdAt: entry.created_at,
      });
    });
    filteredLoans.forEach((l) => {
      transactions.push({ id: l.id, type: "out", source: "loan", description: `Empréstimo para ${l.borrowerName}`, amount: l.amount, date: l.startDate });
    });
    filteredExpenses.forEach((e) => {
      transactions.push({ id: e.id, type: "out", source: "expense", description: `Despesa: ${e.description}`, amount: e.amount, date: e.paidDate! });
    });
    transactions.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

    const monthlyInterestRate = calculateMonthlyInterestRate(filteredLoans);

    const interestExpectedRecords: { borrowerName: string; dueDate: string; installmentNumber: number; totalInstallments: number; installmentAmount: number; interestPortion: number; loanStatus: string; paid: boolean; tags: string[] }[] = [];
    const periodProfitExpected = loans.reduce((sum, loan) => {
      const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
      const totalInterest = Math.max(0, totalWithInterest - loan.amount);
      if (totalInterest <= 0) return sum;
      const interestRatio = totalWithInterest > 0 ? 1 - (loan.amount / totalWithInterest) : 0;
      const isInstallmentPaid = (n: number) => loan.status === "paid" || n <= (loan.paidInstallments || 0);

      if (loan.installments >= 2) {
        const interestPerInstallment = totalInterest / loan.installments;
        const loanSchedules = installmentSchedules.filter((sc) => sc.loanId === loan.id);
        if (loanSchedules.length > 0) {
          let acc = 0;
          loanSchedules
            .filter((sc) => isInRange(sc.dueDate, range.start, range.end))
            .forEach((sc) => {
              const interest = sc.amount * interestRatio;
              acc += interest;
              interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: sc.dueDate, installmentNumber: sc.installmentNumber, totalInstallments: loan.installments, installmentAmount: sc.amount, interestPortion: interest, loanStatus: loan.status, paid: isInstallmentPaid(sc.installmentNumber), tags: loan.tags || [] });
            });
          return sum + acc;
        }
        if (!loan.dueDate) return sum;
        const baseDate = new Date(loan.dueDate + "T00:00:00");
        if (isNaN(baseDate.getTime())) return sum;
        const installmentAmount = totalWithInterest / loan.installments;
        let acc = 0;
        for (let i = 0; i < loan.installments; i++) {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
          const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (isInRange(dStr, range.start, range.end)) {
            acc += interestPerInstallment;
            interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: dStr, installmentNumber: i + 1, totalInstallments: loan.installments, installmentAmount, interestPortion: interestPerInstallment, loanStatus: loan.status, paid: isInstallmentPaid(i + 1), tags: loan.tags || [] });
          }
        }
        return sum + acc;
      }
      if (loan.dueDate && isInRange(loan.dueDate, range.start, range.end)) {
        interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: loan.dueDate, installmentNumber: 1, totalInstallments: 1, installmentAmount: totalWithInterest, interestPortion: totalInterest, loanStatus: loan.status, paid: isInstallmentPaid(1), tags: loan.tags || [] });
        return sum + totalInterest;
      }
      return sum;
    }, 0);

    const interestOnlyInPeriod = payments
      .filter((p) => p.installmentNumber === 0 && isInRange(p.date, range.start, range.end))
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const periodProfitExpectedWithInterestOnly = periodProfitExpected + interestOnlyInPeriod;
    void periodProfitExpectedWithInterestOnly;

    interestExpectedRecords.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const todayStr = todayInAppTz();
    const overdueProfitExpected = interestExpectedRecords
      .filter((r) => !r.paid && r.dueDate < todayStr)
      .reduce((s, r) => s + r.interestPortion, 0);

    const paymentsInPeriod = payments.filter((p) => isInRange(p.date, range.start, range.end));
    const paymentsSorted = [...payments].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });

    // Alocação de juros pró-rata por parcela (fonte única: interestAllocation).
    // REGIME OFICIAL: o juros pertence ao mês em que o PAGAMENTO ocorreu e o
    // histórico é TRAVADO — a alocação do período é feita com corte no fim do
    // próprio período, então pagamentos posteriores (juros em atraso, quitação)
    // nunca reprocessam meses já encerrados; entram no mês do pagamento.
    const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const interestByPaymentId = allocateInterestByPaymentUpTo(loans as any, paymentsSorted as any, toIso(range.end));

    const paidLoanIds = new Set(loans.filter((l) => l.status === "paid").map((l) => l.id));
    const lastPaymentByLoanId = new Map<string, string>();
    paymentsSorted.forEach((p) => { lastPaymentByLoanId.set(p.loanId, p.id); });


    const periodProfitRealized = paymentsInPeriod.reduce(
      (s, p) => s + (interestByPaymentId.get(p.id) ?? 0),
      0,
    );

    // ——— Comparativo com o mês anterior (variação %) ———
    const prevStart = new Date(range.start.getFullYear(), range.start.getMonth() - 1, 1);
    const prevEnd = new Date(range.start.getFullYear(), range.start.getMonth(), 0);
    // Mês anterior travado no seu próprio fechamento (corte em prevEnd).
    const prevInterestByPaymentId = allocateInterestByPaymentUpTo(loans as any, paymentsSorted as any, toIso(prevEnd));
    const prevProfitRealized = payments
      .filter((p) => isInRange(p.date, prevStart, prevEnd))
      .reduce((s, p) => s + (prevInterestByPaymentId.get(p.id) ?? 0), 0);
    const prevProfitExpected = loans.reduce((sum, loan) => {
      const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
      const totalInterest = Math.max(0, totalWithInterest - loan.amount);
      if (totalInterest <= 0) return sum;
      const interestRatio = totalWithInterest > 0 ? 1 - (loan.amount / totalWithInterest) : 0;
      const isInstallmentPaid = (n: number) => loan.status === "paid" || n <= (loan.paidInstallments || 0);

      if (loan.installments >= 2) {
        const interestPerInstallment = totalInterest / loan.installments;
        const loanSchedules = installmentSchedules.filter((sc) => sc.loanId === loan.id);
        if (loanSchedules.length > 0) {
          return sum + loanSchedules
            .filter((sc) => isInRange(sc.dueDate, prevStart, prevEnd) && !isInstallmentPaid(sc.installmentNumber))
            .reduce((acc, sc) => acc + sc.amount * interestRatio, 0);
        }
        if (!loan.dueDate) return sum;
        const baseDate = new Date(loan.dueDate + "T00:00:00");
        if (isNaN(baseDate.getTime())) return sum;
        let acc = 0;
        for (let i = 0; i < loan.installments; i++) {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
          const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (isInRange(dStr, prevStart, prevEnd) && !isInstallmentPaid(i + 1)) acc += interestPerInstallment;
        }
        return sum + acc;
      }
      if (loan.dueDate && isInRange(loan.dueDate, prevStart, prevEnd) && !isInstallmentPaid(1)) {
        return sum + totalInterest;
      }
      return sum;
    }, 0);
    const prevProfitDue = prevProfitRealized + prevProfitExpected;


    const interestDetailRecords: { borrowerName: string; date: string; totalPayment: number; interestPortion: number; type: "juros" | "quitação" | "parcial"; tags: string[] }[] = [];
    paymentsInPeriod.forEach((p) => {
      const interest = interestByPaymentId.get(p.id) ?? 0;
      if (interest <= 0.005) return;
      const loan = loans.find((l) => l.id === p.loanId);
      if (!loan) return;
      const isLastOfPaid = paidLoanIds.has(loan.id) && lastPaymentByLoanId.get(loan.id) === p.id;
      const type: "juros" | "quitação" | "parcial" = isLastOfPaid
        ? "quitação"
        : p.installmentNumber === -1
          ? "parcial"
          : "juros";
      interestDetailRecords.push({
        borrowerName: loan.borrowerName,
        date: p.date,
        totalPayment: Number(p.amount) || 0,
        interestPortion: interest,
        type,
        tags: loan.tags || [],
      });
    });
    interestDetailRecords.sort((a, b) => b.date.localeCompare(a.date));

    const totalProfitExpected = interestExpectedRecords
      .filter((r) => !r.paid)
      .reduce((s, r) => s + r.interestPortion, 0);
    const totalProfitRealized = periodProfitRealized;
    const previstoTotal = totalProfitRealized + totalProfitExpected;
    const periodProfitPct = previstoTotal > 0 ? Math.round((totalProfitRealized / previstoTotal) * 100) : 0;

    return { totalIncome, incomeFromPayments, incomeFromSales, totalOutgoing, totalLoanOutgoing, totalExpenses, balance, transactions, loanCount: filteredLoans.length, saleCount: filteredSales.length, paymentCount: filteredPayments.length, expenseCount: filteredExpenses.length, monthlyInterestRate, filteredPayments, filteredLoans, filteredExpenses: groupedExpenses, salesWithReceived, periodProfitExpected: totalProfitExpected, periodProfitRealized: totalProfitRealized, periodProfitOverdue: overdueProfitExpected, periodProfitPct, prevProfitRealized, prevProfitDue, interestDetailRecords, interestExpectedRecords };
  }, [loans, sales, payments, expenses, range, includeSales, period, chartOverrides, installmentSchedules, ledgerEntries]);

  const receivedByMethod = useMemo(() => {
    const byId: Record<string, number> = {};
    let unassigned = 0;
    let total = 0;
    data.filteredPayments.forEach((p) => {
      const amount = Number(p.amount) || 0;
      if (amount <= 0) return;
      total += amount;
      const split = (p.metadata as any)?.split?.parts as Array<{ paymentMethodId: string | null; amount: number }> | undefined;
      if (Array.isArray(split) && split.length > 0) {
        split.forEach((part) => {
          const v = Number(part.amount) || 0;
          if (v <= 0) return;
          if (part.paymentMethodId) byId[part.paymentMethodId] = (byId[part.paymentMethodId] || 0) + v;
          else unassigned += v;
        });
      } else if (p.paymentMethodId) {
        byId[p.paymentMethodId] = (byId[p.paymentMethodId] || 0) + amount;
      } else {
        unassigned += amount;
      }
    });
    const items = paymentMethods
      .map((m) => ({ id: m.id, name: m.name, icon: m.icon, amount: byId[m.id] || 0 }))
      .filter((it) => it.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return { total, items, unassigned };
  }, [data.filteredPayments, paymentMethods]);

  const receivedDetail = useMemo(() => {
    if (!receivedDetailMethodId) return null;
    const isAll = receivedDetailMethodId === "__all__";
    const targetId = receivedDetailMethodId === "__unassigned__" ? null : receivedDetailMethodId;
    const method = !isAll && targetId ? paymentMethods.find((m) => m.id === targetId) : null;
    const methodName = isAll
      ? "Todos os recebimentos"
      : targetId
        ? (method?.name ?? "Forma desconhecida")
        : "Sem forma definida";
    type Row = { id: string; date: string; borrowerName: string; amount: number; loanId: string };
    const rows: Row[] = [];
    data.filteredPayments.forEach((p) => {
      const loan = loans.find((l) => l.id === p.loanId);
      const borrowerName = loan?.borrowerName ?? "—";
      const split = (p.metadata as any)?.split?.parts as Array<{ paymentMethodId: string | null; amount: number }> | undefined;
      if (Array.isArray(split) && split.length > 0) {
        split.forEach((part, idx) => {
          const v = Number(part.amount) || 0;
          if (v <= 0) return;
          if (isAll || (part.paymentMethodId ?? null) === targetId) {
            rows.push({ id: `${p.id}-${idx}`, date: p.date, borrowerName, amount: v, loanId: p.loanId });
          }
        });
      } else {
        const amount = Number(p.amount) || 0;
        if (amount <= 0) return;
        const pid = p.paymentMethodId ?? null;
        if (isAll || pid === targetId) {
          rows.push({ id: p.id, date: p.date, borrowerName, amount, loanId: p.loanId });
        }
      }
    });
    rows.sort((a, b) => b.date.localeCompare(a.date));
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { methodName, rows, total };
  }, [receivedDetailMethodId, data.filteredPayments, loans, paymentMethods]);


  const profitTargetAmount = useMemo(() => {
    if (!profitGoal) return 0;
    const previstoTotal = data.periodProfitRealized + data.periodProfitExpected;
    return previstoTotal * (profitGoal.targetValue / 100);
  }, [data.periodProfitExpected, data.periodProfitRealized, profitGoal]);

  const portfolio = useMemo(() => {
    const activeLoans = loans.filter((l) => l.status !== "paid");
    const totalLoans = loans.length;
    const allPaymentsForActive = payments.filter((p) => activeLoans.some((l) => l.id === p.loanId));

    // FONTE ÚNICA: mesma base usada no Histórico do Cliente (Resumo).
    // Capital na Rua = Σ principal restante real (emprestado − principal pago)
    // dos contratos ativos, e não mais a proporção por parcelas pagas.
    const pendingTotals = aggregatePortfolioPending({
      loans,
      payments,
      installmentSchedules,
    });
    const capitalOnStreet = pendingTotals.capitalOnStreet;


    // Contratos com taxa 0% não entram no cálculo da taxa geral de juros.
    const interestBearingAll = loans.filter((l) => (Number(l.interestRate) || 0) > 0);
    const totalExpected = interestBearingAll.reduce((s, l) => s + calculateTotalWithInterest(l.amount, l.interestRate, l.installments), 0);
    const totalPrincipal = interestBearingAll.reduce((s, l) => s + l.amount, 0);
    const totalInterestExpected = totalExpected - totalPrincipal;
    void totalInterestExpected;
    const globalInterestRate = totalPrincipal > 0 ? ((totalExpected - totalPrincipal) / totalPrincipal) * 100 : 0;

    const todayNorm = new Date(); todayNorm.setHours(0, 0, 0, 0);
    const totalToReceive = activeLoans.reduce((s, l) => {
      const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      const dueDate = new Date(l.dueDate + "T00:00:00");
      const daysLate = Math.max(0, Math.floor((todayNorm.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      let lateFees = 0;
      if (l.lateInterestValue != null && l.lateInterestValue > 0 && daysLate > 0) {
        const baseRemaining = l.remainingAmount != null && l.remainingAmount > 0 ? l.remainingAmount : Math.max(0, total - allPaymentsForActive.filter((p) => p.loanId === l.id).reduce((ss, p) => ss + p.amount, 0));
        lateFees += l.lateInterestType === "fixed"
          ? l.lateInterestValue * daysLate
          : baseRemaining * (l.lateInterestValue / 100) * daysLate;
      }
      if (l.penaltyValue != null && l.penaltyValue > 0) {
        lateFees += l.penaltyValue;
      }
      const interestPaymentsReceived = payments
        .filter((p) => p.loanId === l.id && p.installmentNumber === 0)
        .reduce((sum, p) => sum + p.amount, 0);
      return s + Math.round((total + lateFees + interestPaymentsReceived) * 100) / 100;
    }, 0);

    const totalReceived = payments.reduce((s, p) => s + p.amount, 0);
    // Lucro Estimado = Σ juros pendentes (juros contratuais + multa + mora) dos
    // contratos ativos, vindos da MESMA fonte única do Histórico do Cliente.
    const estimatedProfit = pendingTotals.interestPending;


    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    let interestDueThisMonth = 0;
    activeLoans.forEach((l) => {
      const totalWithInterest = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      const principalPerInstallment = l.installments > 0 ? l.amount / l.installments : 0;
      const installmentAmount = calculateInstallment(l.amount, l.interestRate, l.installments);
      const interestPerInstallment = installmentAmount - principalPerInstallment;

      if (l.installments >= 2) {
        const schedulesThisMonth = installmentSchedules.filter((sc) => {
          if (sc.loanId !== l.id) return false;
          const d = new Date(sc.dueDate + "T00:00:00");
          return d >= monthStart && d <= monthEnd;
        });
        if (schedulesThisMonth.length > 0) {
          schedulesThisMonth.forEach((sc) => {
            const interestRatio = totalWithInterest > 0 ? 1 - (l.amount / totalWithInterest) : 0;
            interestDueThisMonth += sc.amount * interestRatio;
          });
        } else {
          const dueD = new Date(l.dueDate + "T00:00:00");
          if (dueD >= monthStart && dueD <= monthEnd) {
            interestDueThisMonth += interestPerInstallment;
          }
        }
      } else {
        const dueD = new Date(l.dueDate + "T00:00:00");
        if (dueD >= monthStart && dueD <= monthEnd) {
          interestDueThisMonth += totalWithInterest - l.amount;
        }
      }
    });

    const todayStr = todayInAppTz();
    const overdueLoans = activeLoans.filter((l) => getOverdueInstallments(l, installmentSchedules, todayStr).length > 0);
    const overdueAmount = overdueLoans.reduce((s, l) => s + getOverdueAmount(l, installmentSchedules, todayStr, payments), 0);
    const pendingReceivable = activeLoans.reduce((s, l) => s + getLoanReceivable(l, payments, installmentSchedules), 0);

    // 1. Inadimplência Real sobre a Carteira Ativa:
    // Conforme a especificação ("= Valor atrasado ÷ Total a receber × 100"):
    // Mede a proporção do saldo ativo que está em atraso ponderada com os contratos ativos inadimplentes
    const financialDefaultRate = pendingReceivable > 0
      ? Math.min(100, (overdueAmount / pendingReceivable) * 100)
      : 0;
    const contractDefaultRate = activeLoans.length > 0
      ? (overdueLoans.length / activeLoans.length) * 100
      : 0;
    // Ponderação balanceada: 70% volume financeiro atrasado + 30% proporção de contratos ativos
    const defaultRate = pendingReceivable > 0
      ? Math.round((financialDefaultRate * 0.7 + contractDefaultRate * 0.3) * 10) / 10
      : (activeLoans.length > 0 ? Math.round(contractDefaultRate * 10) / 10 : 0);

    // 2. Recebimento no Período Selecionado:
    // Soma dos pagamentos recebidos no período do filtro (ex: mês selecionado)
    const periodReceived = payments
      .filter((p) => isInRange(p.date, range.start, range.end))
      .reduce((s, p) => s + p.amount, 0);

    // Volume que venceu ou deveria ser pago no período selecionado (até hoje se o período for corrente/futuro)
    const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const rangeEndIso = toIsoDate(range.end);
    const periodCutoff = rangeEndIso < todayStr ? rangeEndIso : todayStr;

    let periodExpectedDue = 0;
    loans.forEach((l) => {
      if (l.installments >= 2) {
        const schedules = installmentSchedules.filter((sc) => sc.loanId === l.id);
        if (schedules.length > 0) {
          schedules.forEach((sc) => {
            if (isInRange(sc.dueDate, range.start, range.end) && sc.dueDate <= periodCutoff) {
              periodExpectedDue += sc.amount;
            }
          });
        } else if (l.dueDate) {
          const instAmount = calculateInstallment(l.amount, l.interestRate, l.installments);
          const baseDate = new Date(l.dueDate + "T00:00:00");
          if (!isNaN(baseDate.getTime())) {
            for (let i = 0; i < l.installments; i++) {
              const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
              const dStr = toIsoDate(d);
              if (isInRange(dStr, range.start, range.end) && dStr <= periodCutoff) {
                periodExpectedDue += instAmount;
              }
            }
          }
        }
      } else {
        if (l.dueDate && isInRange(l.dueDate, range.start, range.end) && l.dueDate <= periodCutoff) {
          periodExpectedDue += calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
        }
      }
    });

    // Taxa de recebimento no período:
    const receivingRate = periodExpectedDue > 0
      ? Math.min(100, Math.round(((periodReceived / periodExpectedDue) * 100) * 10) / 10)
      : (periodReceived > 0 ? 100 : (totalExpected > 0 ? Math.min(100, (totalReceived / totalExpected) * 100) : 100));

    const profitMargin = totalPrincipal > 0 ? ((totalReceived - totalPrincipal) / totalPrincipal) * 100 : 0;

    // Score consolidado sensível ao desempenho do mês e ao risco ativo da carteira:
    // 45% taxa de recebimento do período + 40% controle de inadimplência ativa + 15% rentabilidade
    const receivingScore = Math.min(100, receivingRate);
    const defaultScore = Math.max(0, 100 - defaultRate * 2);
    const profitScore = Math.min(100, Math.max(0, 50 + profitMargin));
    const score = Math.round(receivingScore * 0.45 + defaultScore * 0.40 + profitScore * 0.15);

    const todayForecast = new Date(); todayForecast.setHours(0, 0, 0, 0);
    const dayOfWeek = todayForecast.getDay();
    const nextSunday = new Date(todayForecast);
    if (dayOfWeek !== 0) {
      nextSunday.setDate(nextSunday.getDate() + (7 - dayOfWeek));
    }
    nextSunday.setHours(23, 59, 59, 999);

    const endOfMonth = new Date(todayForecast.getFullYear(), todayForecast.getMonth() + 1, 0, 23, 59, 59, 999);

    const calcForecast = (limitDate: Date) => {
      let sum = 0;
      activeLoans.forEach((l) => {
        if (l.installments >= 2) {
          installmentSchedules.filter((sc) => {
            if (sc.loanId !== l.id) return false;
            if (sc.installmentNumber <= l.paidInstallments) return false;
            const d = new Date(sc.dueDate + "T00:00:00");
            return d <= limitDate;
          }).forEach((sc) => { sum += sc.amount; });
        } else {
          if (l.paidInstallments < 1) {
            const d = new Date(l.dueDate + "T00:00:00");
            if (d <= limitDate) {
              sum += calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
            }
          }
        }
      });
      return sum;
    };

    const forecastSunday = calcForecast(nextSunday);
    const forecastEndMonth = calcForecast(endOfMonth);

    return {
      score: Math.max(0, Math.min(100, score)),
      receivingRate: Math.min(100, receivingRate),
      defaultRate,
      totalReceived: periodReceived,
      overdueAmount,
      overdueLoans,
      capitalOnStreet,
      totalToReceive,
      pendingReceivable,
      estimatedProfit,
      interestDueThisMonth,
      globalInterestRate,
      forecastSunday,
      forecastEndMonth,
    };
  }, [loans, payments, installmentSchedules, range]);

  const monthComparison = useMemo(() => {
    const anchor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const series = Array.from({ length: comparisonWindow }, (_, index) => {
      const monthDate = new Date(anchor.getFullYear(), anchor.getMonth() - (comparisonWindow - 1 - index), 1);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const metrics = summarizeMonthMetrics(loans, sales, payments, includeSales, monthStart, monthEnd, installmentSchedules);

      return {
        key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
        label: `${monthNames[monthDate.getMonth()].slice(0, 3)}/${String(monthDate.getFullYear()).slice(2)}`,
        ...metrics,
      };
    });

    const current = series[series.length - 1];
    const previous = series[series.length - 2];
    const revenueDelta = previous ? (previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : null) : null;
    const profitDelta = previous ? (previous.profit > 0 ? ((current.profit - previous.profit) / previous.profit) * 100 : null) : null;
    const interestDelta = previous && current.interestRate !== null && previous.interestRate !== null
      ? current.interestRate - previous.interestRate
      : null;

    const insightCandidates = [
      {
        weight: Math.abs(revenueDelta ?? 0),
        text: revenueDelta === null
          ? "Ainda não há base suficiente para comparar o faturamento com o mês anterior."
          : revenueDelta >= 0
            ? `Seu faturamento cresceu ${Math.abs(revenueDelta).toFixed(1)}% em relação ao mês passado.`
            : `Seu faturamento caiu ${Math.abs(revenueDelta).toFixed(1)}% em relação ao mês passado.`
      },
      {
        weight: Math.abs(interestDelta ?? 0),
        text: interestDelta === null
          ? "A taxa de juros ainda não tem base suficiente para comparação mês a mês."
          : interestDelta >= 0
            ? `A taxa de juros subiu ${Math.abs(interestDelta).toFixed(1)} p.p., reforçando a rentabilidade do mês.`
            : `A taxa de juros caiu ${Math.abs(interestDelta).toFixed(1)} p.p., atenção à rentabilidade.`
      },
      {
        weight: Math.abs(profitDelta ?? 0),
        text: profitDelta === null
          ? "Ainda não há base suficiente para comparar o lucro com o mês anterior."
          : profitDelta >= 0
            ? `Seu lucro avançou ${Math.abs(profitDelta).toFixed(1)}% contra o mês anterior.`
            : `Seu lucro recuou ${Math.abs(profitDelta).toFixed(1)}% contra o mês anterior.`
      },
    ].sort((a, b) => b.weight - a.weight);

    return {
      series,
      current,
      previous,
      revenueDelta,
      profitDelta,
      interestDelta,
      insight: insightCandidates[0]?.text ?? "Sem dados suficientes para gerar insight no período.",
    };
  }, [comparisonWindow, includeSales, loans, payments, range.start, sales, installmentSchedules]);

  const yearlyAverages = useMemo(() => {
    // Fonte única e travada por mês (mesma regra dos cards e do gráfico).
    const now = new Date();
    const keys: string[] = [];
    const labels: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      labels.push(`${monthNames[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`);
    }
    const frozenByMonth = monthlyInterestReceived(loans as any, payments as any, keys);
    const monthlyInterests: number[] = keys.map((key, idx) => {
      const label = labels[idx];
      const interestInMonth = frozenByMonth.get(key) ?? 0;
      return interestOverrides[label] !== undefined ? interestOverrides[label] : interestInMonth;
    });

    const monthsWithInterest = monthlyInterests.filter((v) => v > 0);
    const avgInterestReceived = monthsWithInterest.length > 0
      ? monthsWithInterest.reduce((s, v) => s + v, 0) / monthsWithInterest.length
      : 0;

    const rate = portfolio.globalInterestRate;
    const interestRate = {
      totalLent: 0,
      totalToReceive: 0,
      rate: Number.isFinite(rate) && rate > 0 ? rate : null,
      hasData: Number.isFinite(rate) && rate > 0,
    };

    return { interestRate, interestReceived: avgInterestReceived };
  }, [loans, payments, interestOverrides, portfolio.globalInterestRate]);

  const riskReturn = useMemo(() => {
    const activeLoans = loans.filter((loan) => loan.status !== "paid");
    const today = new Date(`${todayInAppTz()}T00:00:00`);
    const todayStrForOverdue = todayInAppTz();
    const overdueLoans = activeLoans
      .map((loan) => ({ loan, items: getOverdueInstallments(loan, installmentSchedules, todayStrForOverdue) }))
      .filter((x) => x.items.length > 0);
    const averageDelayDays = overdueLoans.length > 0
      ? overdueLoans.reduce((sum, { items }) => {
          const oldest = items.reduce((a, b) => (a.dueDate < b.dueDate ? a : b));
          const dueDate = new Date(`${oldest.dueDate}T00:00:00`);
          const diff = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
          return sum + diff;
        }, 0) / overdueLoans.length
      : 0;

    const clientExposure = activeLoans.reduce<Record<string, number>>((acc, loan) => {
      const key = loan.borrowerId || loan.borrowerName;
      acc[key] = (acc[key] ?? 0) + (loan.remainingAmount || loan.amount);
      return acc;
    }, {});
    const totalExposure = Object.values(clientExposure).reduce((sum, value) => sum + value, 0);
    const topExposure = Object.values(clientExposure).sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0);
    const concentrationShare = totalExposure > 0 ? (topExposure / totalExposure) * 100 : 0;

    const defaultScore = Math.min(100, portfolio.defaultRate * 2.2);
    const delayScore = Math.min(100, (averageDelayDays / 30) * 100);
    const concentrationScore = Math.min(100, Math.max(0, ((concentrationShare - 35) / 40) * 100));
    const riskScore = Math.round((defaultScore * 0.45) + (delayScore * 0.3) + (concentrationScore * 0.25));

    // RETORNO: resultado GERAL acumulado (não espelha o período/mês filtrado).
    const overallRate = calculateMonthlyInterestRate(loans).rate ?? 0;
    const interestScore = Math.min(100, Math.max(0, (overallRate / 25) * 100));

    const paymentsSortedAll = [...payments].sort((a, b) => {
      const d = (a.date || "").localeCompare(b.date || "");
      if (d !== 0) return d;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
    const lastDate = paymentsSortedAll.length > 0
      ? paymentsSortedAll[paymentsSortedAll.length - 1].date
      : todayStrForOverdue;
    const cutoff = lastDate > todayStrForOverdue ? lastDate : todayStrForOverdue;
    const overallInterestByPaymentId = allocateInterestByPaymentUpTo(loans as any, paymentsSortedAll as any, cutoff);
    const overallProfitRealized = paymentsSortedAll.reduce(
      (s, p) => s + (overallInterestByPaymentId.get(p.id) ?? 0),
      0,
    );
    const overallIncome = paymentsSortedAll.reduce((s, p) => s + Number(p.amount || 0), 0);

    const profitMargin = overallIncome > 0 ? (overallProfitRealized / overallIncome) * 100 : 0;
    const profitScore = Math.min(100, Math.max(0, (profitMargin / 20) * 100));
    const returnScore = Math.round((interestScore * 0.55) + (profitScore * 0.45));

    const axisPosition = Math.round((riskScore * 0.5) + (returnScore * 0.5));

    const classification = riskScore < 35 ? "Baixo risco" : riskScore < 70 ? "Médio risco" : "Alto risco";
    const classificationColor = riskScore < 35 ? "text-success" : riskScore < 70 ? "text-warning" : "text-destructive";

    let insight = "Risco e retorno estão equilibrados; mantenha atenção na inadimplência para sustentar a margem.";
    if (riskScore >= 70 && returnScore >= 65) insight = "Você está operando com alto retorno, porém com risco elevado.";
    else if (riskScore < 35 && returnScore >= 65) insight = "Você mantém bom retorno com risco controlado.";
    else if (riskScore < 35 && returnScore < 50) insight = "Seu risco está controlado, mas o retorno pode ser melhorado.";
    else if (riskScore >= 70 && returnScore < 50) insight = "O risco está alto para o retorno atual; revise inadimplência e concentração.";

    return {
      riskScore,
      returnScore,
      axisPosition,
      classification,
      classificationColor,
      insight,
      averageDelayDays,
      concentrationShare,
    };
  }, [loans, payments, portfolio.defaultRate, installmentSchedules]);

  const monthlyChartBase = useMemo(() => {
    const now = new Date();
    const months: { month: string; emprestado: number; recebido: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = `${monthNames[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`;
      const lent = loans
        .filter((l) => { const ld = new Date(l.startDate + "T00:00:00"); return ld >= d && ld <= end; })
        .reduce((s, l) => s + l.amount, 0);
      const received = payments
        .filter((p) => { const pd = new Date(p.date + "T00:00:00"); return pd >= d && pd <= end; })
        .reduce((s, p) => s + p.amount, 0);
      months.push({ month: label, emprestado: lent, recebido: received });
    }
    return months;
  }, [loans, payments]);

  const monthlyChart = useMemo(() => {
    if (!Array.isArray(monthlyChartBase)) return [];
    return monthlyChartBase.map((m) => {
      const override = chartOverrides[m.month];
      return {
        month: m.month,
        emprestado: m.emprestado + (override?.emprestado ?? 0),
        recebido: m.recebido + (override?.recebido ?? 0),
      };
    });
  }, [monthlyChartBase, chartOverrides]);

  const interestChartBase = useMemo(() => {
    // Mesma regra dos cards: cada mês é travado no seu próprio fechamento
    // (pagamentos posteriores não reprocessam meses passados).
    const now = new Date();
    const months: { month: string; key: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = `${monthNames[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ month: label, key });
    }
    const byKey = monthlyInterestReceived(loans as any, payments as any, months.map((m) => m.key));
    return months.map(({ month, key }) => ({ month, juros: byKey.get(key) ?? 0 }));
  }, [loans, payments]);

  const interestChart = useMemo(() => {
    if (!Array.isArray(interestChartBase)) return [];
    return interestChartBase.map((m) => ({
      month: m.month,
      juros: interestOverrides[m.month] !== undefined ? interestOverrides[m.month] : m.juros,
    }));
  }, [interestChartBase, interestOverrides]);

  // ---------------------------------------------------------------------------
  // FASE 3 — agregação unificada (protegida por flag).
  // Flag OFF (default): `portfolio` continua sendo exatamente o legado.
  // Flag ON: os indicadores de carteira passam a vir da fonte única.
  // ---------------------------------------------------------------------------
  const unifiedFlags = resolveFinancialFlags();
  const unifiedAggregates = useUnifiedFinancialAggregates({
    loans, payments, installmentSchedules, sales, includeSales, range,
    enabled: unifiedFlags.unifiedDashboard || unifiedFlags.diagnostics,
  });

  const resolvedPortfolio = useMemo(() => {
    if (!unifiedFlags.unifiedDashboard || !unifiedAggregates) {
      return { ...portfolio, engine: "legacy" as const };
    }
    return {
      ...portfolio,
      capitalOnStreet: unifiedAggregates.principalRemaining,
      pendingReceivable: unifiedAggregates.totalReceivable,
      totalToReceive: unifiedAggregates.totalReceivable,
      estimatedProfit: unifiedAggregates.interestAndFeesPending,
      overdueAmount: unifiedAggregates.overdueAmount,
      engine: "unified" as const,
    };
  }, [portfolio, unifiedAggregates, unifiedFlags.unifiedDashboard]);

  return {
    data,
    receivedByMethod,
    receivedDetail,
    profitTargetAmount,
    portfolio: resolvedPortfolio,
    unifiedAggregates,
    unifiedFlags,
    monthComparison,
    yearlyAverages,
    riskReturn,
    monthlyChartBase,
    monthlyChart,
    interestChartBase,
    interestChart,
  };
}

