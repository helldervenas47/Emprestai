import { Client, Loan, Payment, InstallmentSchedule } from "@/types/loan";
import {
  ClientRankingType,
  ClientRankingPeriod,
  ClientRankingItem,
  ClientRankingResponse,
} from "../types/clientRanking";
import { todayInAppTz } from "@/lib/timezone";
import {
  getClientLoans,
  getInstallmentDueDate,
  getDaysOverdue,
  getFirstPendingDate,
  buildRiskProfile,
} from "@/features/loans/lib/clientRisk";
import { allocateInterestByPayment } from "@/features/financial/lib/interestAllocation";
import { aggregatePortfolioPending } from "@/features/loans/lib/portfolioPending";

interface ComputeClientRankingParams {
  clients: Client[];
  loans: Loan[];
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  rankingType: ClientRankingType;
  period: ClientRankingPeriod;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function computeClientRanking({
  clients,
  loans,
  payments,
  installmentSchedules = [],
  rankingType,
  period,
  startDate,
  endDate,
  search = "",
  page = 1,
  pageSize = 20,
}: ComputeClientRankingParams): ClientRankingResponse {
  const todayStr = todayInAppTz();
  const today = new Date(todayStr + "T00:00:00");
  const [y, m] = todayStr.split("-").map(Number);

  // Define os limites de data do filtro de período
  let pStart: Date = new Date("2000-01-01T00:00:00");
  let pEnd: Date = new Date("2099-12-31T23:59:59");

  if (period === "this_month") {
    pStart = new Date(y, m - 1, 1, 0, 0, 0);
    pEnd = new Date(y, m, 0, 23, 59, 59, 999);
  } else if (period === "last_month") {
    pStart = new Date(y, m - 2, 1, 0, 0, 0);
    pEnd = new Date(y, m - 1, 0, 23, 59, 59, 999);
  } else if (period === "last_3_months") {
    pStart = new Date(y, m - 3, 1, 0, 0, 0);
    pEnd = new Date(y, m, 0, 23, 59, 59, 999);
  } else if (period === "last_6_months") {
    pStart = new Date(y, m - 6, 1, 0, 0, 0);
    pEnd = new Date(y, m, 0, 23, 59, 59, 999);
  } else if (period === "this_year") {
    pStart = new Date(y, 0, 1, 0, 0, 0);
    pEnd = new Date(y, 11, 31, 23, 59, 59, 999);
  } else if (period === "custom" && startDate && endDate) {
    pStart = new Date(startDate + "T00:00:00");
    pEnd = new Date(endDate + "T23:59:59");
  }

  // Filtragem de clientes por busca
  const term = search.trim().toLowerCase();
  const filteredClients = clients.filter((c) => {
    if (!term) return true;
    return (
      (c.name && c.name.toLowerCase().includes(term)) ||
      (c.cpf && c.cpf.includes(term)) ||
      (c.phone && c.phone.includes(term))
    );
  });

  // Agregação dos indicadores por cliente (apenas clientes com pelo menos 1 empréstimo em todo o app)
  const items: ClientRankingItem[] = [];

  filteredClients.forEach((client) => {
    // Empréstimos pertencentes ao cliente em todo o app
    const clientLoansAll = getClientLoans(client, loans);
    if (clientLoansAll.length === 0) {
      return; // Ignora clientes sem empréstimos cadastrados
    }

    const loanIds = new Set(clientLoansAll.map((l) => l.id));
    const clientPaymentsAll = payments.filter((p) => loanIds.has(p.loanId));

    // Alocação de juros idêntica à aba Histórico do Cliente (LoanHistory)
    const allocatedInterestMap = allocateInterestByPayment(
      clientLoansAll.map((l) => ({
        id: l.id,
        amount: l.amount || 0,
        interestRate: l.interestRate,
        installments: l.installments,
        status: l.status,
      })),
      clientPaymentsAll.map((p) => ({
        id: p.id,
        loanId: p.loanId,
        amount: p.amount,
        date: p.date,
        installmentNumber: p.installmentNumber,
        createdAt: (p as any).createdAt,
        metadata: (p as any).metadata,
      })),
    );

    // Empréstimos no período selecionado
    const clientLoans = clientLoansAll.filter((l) => {
      if (period === "all") return true;
      const d = l.startDate ? new Date(l.startDate + "T00:00:00") : (l.createdAt ? new Date(l.createdAt) : null);
      if (!d) return true;
      return d >= pStart && d <= pEnd;
    });

    const totalLoans = clientLoans.length;
    const paidLoans = clientLoansAll.filter((l) => l.status === "paid").length;
    
    // Contratos que possuem atraso ativo na próxima parcela pendente
    const overdueLoans = clientLoansAll.filter((l) => {
      if (l.status === "paid" || l.status === "cancelled") return false;
      return getDaysOverdue(l, installmentSchedules, today) > 0;
    }).length;

    // Total emprestado no período
    const totalBorrowed = clientLoans.reduce((sum, l) => sum + (l.amount || 0), 0);

    // Saldo total em aberto (considerando principal restante + juros pendentes + multas e juros de atraso)
    const clientPending = aggregatePortfolioPending({
      loans: clientLoansAll,
      payments: clientPaymentsAll,
      installmentSchedules,
    });
    const openAmount = clientPending.capitalOnStreet + clientPending.interestPending;

    // Contratos em aberto que possuem atraso ativo na próxima parcela pendente (não considera contratos quitados)
    let activeDelayedLoansCount = 0;
    let activeMaxDelayDays = 0;
    let activePendingDelays = 0;

    clientLoansAll.forEach((loan) => {
      if (loan.status !== "paid" && loan.status !== "cancelled") {
        const currentDaysOverdue = getDaysOverdue(loan, installmentSchedules, today);
        if (currentDaysOverdue > 0) {
          const nextDue = getFirstPendingDate(loan, installmentSchedules);
          if (period === "all" || nextDue <= pEnd) {
            activeDelayedLoansCount++;
            activePendingDelays++;
            if (currentDaysOverdue > activeMaxDelayDays) {
              activeMaxDelayDays = currentDaysOverdue;
            }
          }
        }
      }
    });

    // Pagamentos do cliente no período
    let totalReceived = 0;
    let profitGenerated = 0;
    let onTimePayments = 0;
    let latePayments = 0;

    clientLoansAll.forEach((loan) => {
      const loanPayments = payments.filter((p) => p.loanId === loan.id);
      
      loanPayments.forEach((p) => {
        const pDateStr = p.date.split("T")[0];
        const pDate = new Date(pDateStr + "T00:00:00");
        const inPeriod = period === "all" || (pDate >= pStart && pDate <= pEnd);
        
        if (!inPeriod) return;

        totalReceived += p.amount || 0;
        
        // Alocação de juros recebidos (idêntica ao Histórico do Cliente)
        const paymentInterest = allocatedInterestMap.get(p.id) ?? 0;
        profitGenerated += paymentInterest;

        // Amortização parcial avulsa (-1): não conta como parcela no cálculo de pontualidade
        if (p.installmentNumber === -1) {
          return;
        }

        // Identifica o vencimento da parcela de forma canônica
        let dueDateStr: string | null = null;
        if (p.installmentNumber === 0) {
          dueDateStr = p.previousDueDate ?? loan.dueDate;
        } else if (p.installmentNumber > 0) {
          dueDateStr = getInstallmentDueDate(loan, p.installmentNumber, installmentSchedules);
        }

        if (dueDateStr) {
          const dueDate = new Date(dueDateStr + "T00:00:00");
          // 3 dias de tolerância
          const toleranceDate = new Date(dueDate.getTime() + 3 * 24 * 60 * 60 * 1000);

          if (pDate <= toleranceDate) {
            onTimePayments++;
          } else {
            latePayments++;
          }
        } else if (p.amount > 0) {
          onTimePayments++;
        }
      });
    });

    const totalPaymentsCount = onTimePayments + latePayments;
    const totalEvaluatedObligations = onTimePayments + latePayments + activePendingDelays;
    const onTimePercentage = totalEvaluatedObligations > 0
      ? (onTimePayments / totalEvaluatedObligations) * 100
      : (period === "all" ? (overdueLoans > 0 ? 0 : 100) : 0);

    // Score canônico do motor de risco (escala 0 a 150)
    const riskProfile = buildRiskProfile(client, clientLoansAll, payments, installmentSchedules, today);
    const score = riskProfile.historicalScore;

    items.push({
      position: 1,
      client_id: client.id,
      client_name: client.name || "Sem Nome",
      client_phone: client.phone || null,
      client_cpf: client.cpf || null,
      client_cnpj: client.cnpj || null,
      score,
      total_loans: totalLoans,
      total_borrowed: totalBorrowed,
      open_amount: openAmount,
      total_payments: totalPaymentsCount,
      total_received: totalReceived,
      profit_generated: Math.round(profitGenerated * 100) / 100,
      on_time_payments: onTimePayments,
      late_payments: latePayments,
      on_time_percentage: onTimePercentage,
      max_delay_days: activeMaxDelayDays,
      overdue_loans: activeDelayedLoansCount,
    });
  });

  // Ordenação de acordo com o ranking selecionado
  items.sort((a, b) => {
    switch (rankingType) {
      case "best": {
        const delayPenaltyA = a.max_delay_days > 0 ? 40 : 0;
        const delayPenaltyB = b.max_delay_days > 0 ? 40 : 0;
        const scoreA = a.score * 0.45 + a.on_time_percentage * 0.35 + Math.min(100, a.total_loans * 10) * 0.2 - delayPenaltyA;
        const scoreB = b.score * 0.45 + b.on_time_percentage * 0.35 + Math.min(100, b.total_loans * 10) * 0.2 - delayPenaltyB;
        return scoreB - scoreA || b.total_received - a.total_received || b.total_borrowed - a.total_borrowed;
      }
      case "on_time":
        return (
          // 1. Maior taxa de pontualidade
          b.on_time_percentage - a.on_time_percentage ||
          // 2. Mais pagamentos em dia no período selecionado
          b.on_time_payments - a.on_time_payments ||
          // 3. Clientes com zero atraso primeiro
          (a.max_delay_days === 0 ? 0 : 1) - (b.max_delay_days === 0 ? 0 : 1) ||
          // 4. Maior score de saúde e histórico
          b.score - a.score ||
          // 5. Menor atraso em dias
          a.max_delay_days - b.max_delay_days
        );
      case "revenue":
        return b.profit_generated - a.profit_generated || b.total_received - a.total_received;
      case "volume":
        return b.total_borrowed - a.total_borrowed || b.total_loans - a.total_loans;
      case "frequent":
        return b.total_loans - a.total_loans || b.total_borrowed - a.total_borrowed || b.score - a.score;
      case "risk":
        return a.score - b.score || b.max_delay_days - a.max_delay_days || b.open_amount - a.open_amount;
      case "late":
        return (
          b.max_delay_days - a.max_delay_days ||
          b.overdue_loans - a.overdue_loans ||
          b.late_payments - a.late_payments ||
          b.open_amount - a.open_amount
        );
      default:
        return b.score - a.score;
    }
  });

  // Atribui as posições
  items.forEach((item, index) => {
    item.position = index + 1;
  });

  const totalCount = items.length;
  const offset = (page - 1) * pageSize;
  const pagedItems = items.slice(offset, offset + pageSize);

  return {
    data: pagedItems,
    total_count: totalCount,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(totalCount / pageSize) || 1,
  };
}
