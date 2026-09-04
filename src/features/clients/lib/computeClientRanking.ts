import { Client, Loan, Payment } from "@/types/loan";
import {
  ClientRankingType,
  ClientRankingPeriod,
  ClientRankingItem,
  ClientRankingResponse,
} from "../types/clientRanking";
import { todayInAppTz } from "@/lib/timezone";

interface ComputeClientRankingParams {
  clients: Client[];
  loans: Loan[];
  payments: Payment[];
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

  // Define os limites de data do filtro de período
  let pStart: Date = new Date("2000-01-01T00:00:00");
  let pEnd: Date = new Date("2099-12-31T23:59:59");

  const now = new Date();
  if (period === "this_month") {
    pStart = new Date(now.getFullYear(), now.getMonth(), 1);
    pEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (period === "last_month") {
    pStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    pEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  } else if (period === "last_3_months") {
    pStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    pEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (period === "last_6_months") {
    pStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    pEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (period === "this_year") {
    pStart = new Date(now.getFullYear(), 0, 1);
    pEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
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

  // Agregação dos indicadores por cliente
  const items: ClientRankingItem[] = filteredClients.map((client) => {
    // Empréstimos pertencentes ao cliente (por id ou nome)
    const clientLoansAll = loans.filter(
      (l) => l.borrowerId === client.id || (l.borrowerName && client.name && l.borrowerName.trim().toLowerCase() === client.name.trim().toLowerCase())
    );

    // Empréstimos no período
    const clientLoans = clientLoansAll.filter((l) => {
      if (period === "all") return true;
      const d = l.startDate ? new Date(l.startDate + "T00:00:00") : (l.createdAt ? new Date(l.createdAt) : null);
      if (!d) return true;
      return d >= pStart && d <= pEnd;
    });

    const totalLoans = clientLoans.length;
    const paidLoans = clientLoans.filter((l) => l.status === "paid").length;
    const overdueLoans = clientLoans.filter((l) => l.status !== "paid" && l.dueDate && l.dueDate < todayStr).length;

    // Total emprestado
    const totalBorrowed = clientLoans.reduce((sum, l) => sum + (l.amount || 0), 0);

    // Saldo em aberto (ativo)
    const openAmount = clientLoansAll
      .filter((l) => l.status !== "paid")
      .reduce((sum, l) => sum + (l.remainingAmount != null ? l.remainingAmount : (l.amount || 0)), 0);

    // Pagamentos do cliente
    let totalReceived = 0;
    let profitGenerated = 0;
    let onTimePayments = 0;
    let latePayments = 0;
    let maxDelayDays = 0;

    clientLoansAll.forEach((loan) => {
      const loanPayments = payments.filter((p) => p.loanId === loan.id);
      
      loanPayments.forEach((p) => {
        const pDate = new Date(p.date + "T00:00:00");
        const inPeriod = period === "all" || (pDate >= pStart && pDate <= pEnd);
        
        if (inPeriod) {
          totalReceived += p.amount || 0;
          
          // Estima o lucro/juros gerado pelo pagamento
          if (loan.amount > 0 && loan.interestRate > 0) {
            const interestFraction = loan.interestRate / (100 + loan.interestRate);
            profitGenerated += (p.amount || 0) * interestFraction;
          }
        }

        // Calcula pontualidade considerando a data de vencimento da parcela
        if (p.installmentNumber && p.installmentNumber > 0 && loan.startDate) {
          const start = new Date(loan.startDate + "T00:00:00");
          const expectedDue = new Date(start.getFullYear(), start.getMonth() + p.installmentNumber, start.getDate());
          const toleranceDate = new Date(expectedDue.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 dias de tolerância

          if (pDate <= toleranceDate) {
            onTimePayments++;
          } else {
            latePayments++;
            const diffDays = Math.max(0, Math.floor((pDate.getTime() - expectedDue.getTime()) / (1000 * 60 * 60 * 24)));
            if (diffDays > maxDelayDays) maxDelayDays = diffDays;
          }
        } else if (p.amount > 0) {
          onTimePayments++;
        }
      });

      // Checa se há atrasos ativos no empréstimo em aberto
      if (loan.status !== "paid" && loan.dueDate && loan.dueDate < todayStr) {
        const due = new Date(loan.dueDate + "T00:00:00");
        const diffDays = Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
        if (diffDays > maxDelayDays) maxDelayDays = diffDays;
      }
    });

    const totalPaymentsCount = onTimePayments + latePayments;
    const onTimePercentage = totalPaymentsCount > 0 ? (onTimePayments / totalPaymentsCount) * 100 : 100;

    // Cálculo do Score oficial (0 a 150)
    let score = client.scoreTempoReal ?? client.scoreRisco ?? 100;
    if (client.scoreTempoReal == null && client.scoreRisco == null) {
      if (totalLoans === 0) {
        score = 100;
      } else {
        score = 100 + (onTimePayments * 3) - (latePayments * 5) + (paidLoans * 5) - (overdueLoans * 10);
        score = Math.max(0, Math.min(150, score));
      }
    }

    return {
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
      profit_generated: profitGenerated,
      on_time_payments: onTimePayments,
      late_payments: latePayments,
      on_time_percentage: onTimePercentage,
      max_delay_days: maxDelayDays,
    };
  });

  // Ordenação de acordo com o ranking selecionado
  items.sort((a, b) => {
    switch (rankingType) {
      case "best": {
        const scoreA = a.score * 0.4 + a.on_time_percentage * 0.3 + Math.min(100, a.total_loans * 10) * 0.3;
        const scoreB = b.score * 0.4 + b.on_time_percentage * 0.3 + Math.min(100, b.total_loans * 10) * 0.3;
        return scoreB - scoreA || b.total_received - a.total_received || b.total_borrowed - a.total_borrowed;
      }
      case "on_time":
        return b.on_time_percentage - a.on_time_percentage || b.on_time_payments - a.on_time_payments || b.score - a.score;
      case "revenue":
        return b.profit_generated - a.profit_generated || b.total_received - a.total_received;
      case "volume":
        return b.total_borrowed - a.total_borrowed || b.total_loans - a.total_loans;
      case "frequent":
        return b.total_loans - a.total_loans || b.total_borrowed - a.total_borrowed || b.score - a.score;
      case "risk":
        return a.score - b.score || b.max_delay_days - a.max_delay_days || b.open_amount - a.open_amount;
      case "late":
        return b.max_delay_days - a.max_delay_days || b.late_payments - a.late_payments || b.open_amount - a.open_amount;
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
