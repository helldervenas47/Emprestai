import type { Client, Loan, LoanRenegotiation, Payment, InstallmentSchedule } from "@/types/loan";
import { getDaysOverdue, getClientLoans } from "@/features/loans/lib/clientRiskUtils";
import { buildRiskProfile } from "@/features/loans/lib/clientRisk";
import { getOverdueAmount } from "@/features/loans/lib/loanInstallmentAmount";
import { PULSE_CONFIG } from "./pulseConfig";
import type { PulseConcentrationAnalysis, PulsePrioritaryClient } from "./types";

interface PrioritizeClientsParams {
  clients: Client[];
  loans: Loan[];
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  renegotiations?: LoanRenegotiation[];
  referenceDate?: Date;
  prevReferenceDate?: Date;
}

export function analyzeOverdueConcentration({
  clients,
  loans,
  payments,
  installmentSchedules = [],
  renegotiations = [],
  referenceDate = new Date(),
  prevReferenceDate,
}: PrioritizeClientsParams): PulseConcentrationAnalysis {
  const safeClients = Array.isArray(clients) ? clients : [];
  const safeLoans = Array.isArray(loans) ? loans : [];
  const safePayments = Array.isArray(payments) ? payments : [];
  const safeSchedules = Array.isArray(installmentSchedules) ? installmentSchedules : [];
  const safeRenegotiations = Array.isArray(renegotiations) ? renegotiations : [];

  // Mapeia clientes ativos e identifica inadimplência atual
  const clientOverdueMap = new Map<string, {
    client: Client;
    overdueAmount: number;
    maxDays: number;
    overdueInstallments: number;
  }>();

  safeClients.forEach((client) => {
    const clientLoans = getClientLoans(client, safeLoans).filter((l) => l.status !== "paid" && l.status !== "cancelled");
    if (clientLoans.length === 0) return;

    let totalOverdue = 0;
    let maxDays = 0;
    let overdueInstallments = 0;

    const refDateStr = referenceDate.toISOString().split("T")[0];
    clientLoans.forEach((loan) => {
      const days = getDaysOverdue(loan, safeSchedules, referenceDate);
      if (days > 0) {
        if (days > maxDays) maxDays = days;
        const amount = getOverdueAmount(loan, safeSchedules, refDateStr, safePayments);
        totalOverdue += amount;
        overdueInstallments += Math.max(1, Math.floor(days / 30));
      }
    });

    if (totalOverdue > 0) {
      clientOverdueMap.set(client.id, {
        client,
        overdueAmount: totalOverdue,
        maxDays,
        overdueInstallments,
      });
    }
  });

  // Clientes com pendências no período anterior equivalente para comparação de quantidade
  let prevOverdueClientsCount = 0;
  let prevTotalOverdueAmount = 0;

  if (prevReferenceDate) {
    const prevRefStr = prevReferenceDate.toISOString().split("T")[0];
    const prevLoans = safeLoans.filter((l) => (l.startDate || "") <= prevRefStr);
    const prevPayments = safePayments.filter((p) => (p.date || "") <= prevRefStr);

    safeClients.forEach((client) => {
      const cLoans = getClientLoans(client, prevLoans).filter((l) => l.status !== "paid" && l.status !== "cancelled");
      let clientPrevOverdue = 0;
      cLoans.forEach((loan) => {
        const days = getDaysOverdue(loan, safeSchedules, prevReferenceDate);
        if (days > 0) {
          const amt = getOverdueAmount(loan, safeSchedules, prevRefStr, prevPayments);
          clientPrevOverdue += amt;
        }
      });
      if (clientPrevOverdue > 0) {
        prevOverdueClientsCount++;
        prevTotalOverdueAmount += clientPrevOverdue;
      }
    });
  }

  const overdueList = Array.from(clientOverdueMap.values()).sort((a, b) => b.overdueAmount - a.overdueAmount);
  const totalOverdueAmount = overdueList.reduce((sum, c) => sum + c.overdueAmount, 0);
  const overdueClientsCount = overdueList.length;

  const topOverdueEntries = overdueList.slice(0, PULSE_CONFIG.MAX_TOP_CLIENTS_COUNT);
  const topClientsOverdueTotal = topOverdueEntries.reduce((sum, c) => sum + c.overdueAmount, 0);
  const topClientsSharePct = totalOverdueAmount > 0
    ? Math.round((topClientsOverdueTotal / totalOverdueAmount) * 100)
    : 0;

  const topClients: PulsePrioritaryClient[] = topOverdueEntries.map((entry) => {
    let riskProfile;
    try {
      riskProfile = buildRiskProfile(entry.client, safeLoans, safePayments, safeSchedules, referenceDate, safeRenegotiations);
    } catch {
      riskProfile = {
        score: 50,
        riskLevel: "Médio",
        badgeClassName: "text-amber-600 bg-amber-500/10 border-amber-500/30",
      };
    }

    const share = totalOverdueAmount > 0
      ? Math.round((entry.overdueAmount / totalOverdueAmount) * 1000) / 10
      : 0;

    return {
      clientId: entry.client.id,
      clientName: entry.client.name,
      overdueAmount: entry.overdueAmount,
      maxOverdueDays: entry.maxDays,
      overdueInstallmentsCount: entry.overdueInstallments,
      score: riskProfile.score,
      riskLevel: riskProfile.riskLevel,
      badgeClassName: riskProfile.badgeClassName,
      shareOfTotalOverduePct: share,
    };
  });

  const hasRelevantConcentration =
    totalOverdueAmount > 0 &&
    topClients.length > 0 &&
    topClientsSharePct >= PULSE_CONFIG.HIGH_CONCENTRATION_SHARE_PCT;

  return {
    overdueClientsCount,
    prevOverdueClientsCount,
    totalOverdueAmount,
    prevTotalOverdueAmount,
    topClients,
    topClientsCount: topClients.length,
    topClientsOverdueTotal,
    topClientsSharePct,
    hasRelevantConcentration,
  };
}
