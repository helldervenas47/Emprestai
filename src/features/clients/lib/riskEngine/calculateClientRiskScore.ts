import { Client, InstallmentSchedule, Loan, Payment } from "@/types/loan";
import {
  SCORE_BANDS,
  RISK_SCORE_CONFIG,
  ScoreBandConfig,
} from "./riskScoreConfig";
import {
  getClientLoans,
  getDaysOverdue,
  getFirstPendingDate,
  getInstallmentDueDate,
} from "@/features/loans/lib/clientRiskUtils";

export interface RiskScoreBreakdown {
  currentObligationsScore: number; // 35%
  historicalDelaysScore: number;   // 25%
  recurrenceScore: number;          // 20%
  recentBehaviorScore: number;     // 10%
  relationshipScore: number;       // 10%
  rawScore: number;
  finalScore: number;
  appliedCap: number | null;
  capReason: string | null;
}

export interface ClientRiskScoreResult {
  score: number;
  label: ScoreBandConfig["label"];
  riskLevel: ScoreBandConfig["riskLevel"];
  description: string;
  color: string;
  bgColor: string;
  badgeClassName: string;
  level: ScoreBandConfig["level"];
  isNewClient: boolean;
  positiveFactors: string[];
  negativeFactors: string[];
  reasons: string[];
  breakdown: RiskScoreBreakdown;
  activeOverdueDays: number;
  activeOverdueCount: number;
  settledLoansCount: number;
  totalLoansCount: number;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function getTimeWeight(eventDate: Date, referenceDate: Date): number {
  const diffDays = Math.max(0, Math.floor((referenceDate.getTime() - eventDate.getTime()) / 86400000));
  if (diffDays <= 90) return RISK_SCORE_CONFIG.TIME_WEIGHTS.LAST_3_MONTHS;     // 1.0
  if (diffDays <= 180) return RISK_SCORE_CONFIG.TIME_WEIGHTS.MONTHS_4_TO_6;    // 0.75
  if (diffDays <= 365) return RISK_SCORE_CONFIG.TIME_WEIGHTS.MONTHS_7_TO_12;   // 0.50
  if (diffDays <= 730) return RISK_SCORE_CONFIG.TIME_WEIGHTS.MONTHS_13_TO_24;  // 0.25
  return RISK_SCORE_CONFIG.TIME_WEIGHTS.OLDER_THAN_24;                         // 0.10
}

/**
 * 1. Pilar: Situação Atual das Obrigações (Peso 35%)
 */
export function calculateCurrentObligationsScore(
  activeLoans: Loan[],
  installmentSchedules: InstallmentSchedule[],
  referenceDate: Date
): { score: number; activeOverdueDays: number; activeOverdueCount: number; reasons: string[] } {
  if (activeLoans.length === 0) {
    return { score: 100, activeOverdueDays: 0, activeOverdueCount: 0, reasons: [] };
  }

  let maxDays = 0;
  let overdueCount = 0;
  const reasons: string[] = [];

  activeLoans.forEach((loan) => {
    const days = getDaysOverdue(loan, installmentSchedules, referenceDate);
    if (days > 0) {
      overdueCount++;
      if (days > maxDays) maxDays = days;
    }
  });

  if (overdueCount === 0) {
    return { score: 100, activeOverdueDays: 0, activeOverdueCount: 0, reasons: ["Todas as obrigações atuais estão em dia."] };
  }

  let penalty = 0;
  if (maxDays > 90) {
    penalty = 100;
    reasons.push(`Obrigação ativa com atraso severo de ${maxDays} dias.`);
  } else if (maxDays > 60) {
    penalty = 80;
    reasons.push(`Obrigação ativa com atraso de ${maxDays} dias (acima de 60 dias).`);
  } else if (maxDays > 30) {
    penalty = 60;
    reasons.push(`Obrigação ativa com atraso de ${maxDays} dias.`);
  } else if (maxDays > 15) {
    penalty = 40;
    reasons.push(`Obrigação ativa com atraso moderado de ${maxDays} dias.`);
  } else if (maxDays > 7) {
    penalty = 25;
    reasons.push(`Obrigação ativa com atraso de ${maxDays} dias.`);
  } else {
    penalty = 12;
    reasons.push(`Obrigação ativa com atraso leve de ${maxDays} dia(s).`);
  }

  if (overdueCount > 1) {
    penalty += (overdueCount - 1) * 15;
    reasons.push(`${overdueCount} contratos atualmente em atraso simultâneo.`);
  }

  return {
    score: clamp(100 - penalty),
    activeOverdueDays: maxDays,
    activeOverdueCount: overdueCount,
    reasons,
  };
}

interface HistoricalLateEvent {
  loanId: string;
  delayDays: number;
  date: Date;
  isLoanSettled: boolean;
  timeWeight: number;
}

/**
 * 2. Pilar: Gravidade e Duração dos Atrasos Históricos (Peso 25%)
 */
export function calculateHistoricalDelaysScore(
  events: HistoricalLateEvent[]
): { score: number; penalties: number; reasons: string[] } {
  if (events.length === 0) {
    return { score: 100, penalties: 0, reasons: [] };
  }

  let totalWeightedPenalty = 0;
  const reasons: string[] = [];

  events.forEach((ev) => {
    let basePenalty = 0;
    if (ev.delayDays > 90) basePenalty = RISK_SCORE_CONFIG.DELAY_PENALTIES.DAYS_OVER_90;
    else if (ev.delayDays > 60) basePenalty = RISK_SCORE_CONFIG.DELAY_PENALTIES.DAYS_61_TO_90;
    else if (ev.delayDays > 30) basePenalty = RISK_SCORE_CONFIG.DELAY_PENALTIES.DAYS_31_TO_60;
    else if (ev.delayDays > 15) basePenalty = RISK_SCORE_CONFIG.DELAY_PENALTIES.DAYS_16_TO_30;
    else if (ev.delayDays > 7) basePenalty = RISK_SCORE_CONFIG.DELAY_PENALTIES.DAYS_8_TO_15;
    else basePenalty = RISK_SCORE_CONFIG.DELAY_PENALTIES.DAYS_1_TO_7;

    // Atenuação para contratos já quitados (recuperação)
    let attenuation = 1.0;
    if (ev.isLoanSettled) {
      if (ev.delayDays <= 30) attenuation = RISK_SCORE_CONFIG.SETTLEMENT_RECOVERY.UP_TO_30_DAYS.residualFactor;
      else if (ev.delayDays <= 60) attenuation = RISK_SCORE_CONFIG.SETTLEMENT_RECOVERY.DAYS_31_TO_60.residualFactor;
      else if (ev.delayDays <= 90) attenuation = RISK_SCORE_CONFIG.SETTLEMENT_RECOVERY.DAYS_61_TO_90.residualFactor;
      else attenuation = RISK_SCORE_CONFIG.SETTLEMENT_RECOVERY.DAYS_OVER_90.residualFactor;
    }

    totalWeightedPenalty += basePenalty * ev.timeWeight * attenuation;
  });

  const maxHistoricalDelay = Math.max(...events.map((e) => e.delayDays));
  if (maxHistoricalDelay > 60) {
    reasons.push(`Histórico com atraso grave de até ${maxHistoricalDelay} dias registrado.`);
  } else if (maxHistoricalDelay > 15) {
    reasons.push(`Histórico com atraso de até ${maxHistoricalDelay} dias registrado.`);
  }

  return {
    score: clamp(100 - Math.min(100, totalWeightedPenalty)),
    penalties: totalWeightedPenalty,
    reasons,
  };
}

/**
 * 3. Pilar: Recorrência e Reincidência (Peso 20%)
 */
export function calculateRecurrenceScore(
  events: HistoricalLateEvent[],
  referenceDate: Date
): { score: number; reasons: string[] } {
  if (events.length === 0) {
    return { score: 100, reasons: [] };
  }

  const sixMonthsAgo = new Date(referenceDate);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const twelveMonthsAgo = new Date(referenceDate);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const last6MonthsDelays = events.filter((e) => e.date >= sixMonthsAgo);
  const last12MonthsDelays = events.filter((e) => e.date >= twelveMonthsAgo);

  let penalty = 0;
  const reasons: string[] = [];

  // Reincidência em 6 meses
  if (last6MonthsDelays.length >= 5) {
    penalty += 80;
    reasons.push(`${last6MonthsDelays.length} atrasos recorrentes registrados nos últimos 6 meses.`);
  } else if (last6MonthsDelays.length >= 3) {
    penalty += 50;
    reasons.push(`${last6MonthsDelays.length} atrasos registrados nos últimos 6 meses.`);
  } else if (last6MonthsDelays.length === 2) {
    penalty += 25;
    reasons.push("2 atrasos registrados nos últimos 6 meses.");
  } else if (last6MonthsDelays.length === 1 && last6MonthsDelays[0].delayDays > 7) {
    penalty += 8;
  }

  // Atrasos frequentes > 30 dias em 12 meses
  const delaysOver30dIn12m = last12MonthsDelays.filter((e) => e.delayDays > 30).length;
  if (delaysOver30dIn12m >= 2) {
    penalty += 45;
    reasons.push(`${delaysOver30dIn12m} atrasos superiores a 30 dias nos últimos 12 meses.`);
  } else if (delaysOver30dIn12m === 1) {
    penalty += 20;
  }

  // Dois ou mais atrasos > 60 dias em 12 meses (alto risco estrutural)
  const delaysOver60dIn12m = last12MonthsDelays.filter((e) => e.delayDays > 60).length;
  if (delaysOver60dIn12m >= 2) {
    penalty += 90;
    reasons.push(`Comportamento de alto risco: ${delaysOver60dIn12m} atrasos acima de 60 dias em 12 meses.`);
  }

  return {
    score: clamp(100 - penalty),
    reasons,
  };
}

/**
 * 4. Pilar: Comportamento Recente (6 a 12 meses) (Peso 10%)
 */
export function calculateRecentBehaviorScore(
  onTimePaymentsIn12m: number,
  latePaymentsIn12m: number,
  recentStreakOnTime: number
): { score: number; reasons: string[] } {
  const totalRecent = onTimePaymentsIn12m + latePaymentsIn12m;
  if (totalRecent === 0) {
    return { score: 60, reasons: [] };
  }

  const ratio = onTimePaymentsIn12m / totalRecent;
  let baseScore = ratio * 85;

  // Bônus por sequência recente consistente
  if (recentStreakOnTime >= 6) {
    baseScore += 15;
  } else if (recentStreakOnTime >= 3) {
    baseScore += 10;
  }

  const reasons: string[] = [];
  if (ratio >= 0.95 && totalRecent >= 3) {
    reasons.push("Excelente pontualidade nas parcelas recentes.");
  } else if (ratio < 0.6) {
    reasons.push("Histórico recente de pagamentos irregulares.");
  }

  return {
    score: clamp(Math.round(baseScore)),
    reasons,
  };
}

/**
 * 5. Pilar: Histórico Positivo e Tempo de Relacionamento (Peso 10%)
 */
export function calculateRelationshipScore(
  cleanlyPaidLoans: number,
  relationshipMonths: number,
  totalOnTimePayments: number,
  hasActiveDebt: boolean
): { score: number; reasons: string[] } {
  let score = 40; // Base neutra

  // Bônus por contratos quitados com sucesso
  score += Math.min(30, cleanlyPaidLoans * 10);

  // Bônus por tempo de relacionamento
  if (relationshipMonths >= 12) score += 20;
  else if (relationshipMonths >= 6) score += 12;
  else if (relationshipMonths >= 3) score += 6;

  // Bônus por pontualidade acumulada
  if (totalOnTimePayments >= 10) score += 10;
  else if (totalOnTimePayments >= 5) score += 5;

  // Bônus sem dívida pendente
  if (!hasActiveDebt) score += 5;

  const reasons: string[] = [];
  if (cleanlyPaidLoans > 0) {
    reasons.push(`${cleanlyPaidLoans} contrato(s) quitado(s) com sucesso.`);
  }
  if (relationshipMonths >= 6) {
    reasons.push(`Cliente há mais de ${relationshipMonths} meses.`);
  }

  return {
    score: clamp(score),
    reasons,
  };
}

/**
 * Aplica tetos de segurança (Hard Caps) para inadimplência grave e recuperação lenta
 */
export function applySevereDelinquencyCaps(
  rawScore: number,
  activeOverdueDays: number,
  activeOverdueCount: number,
  historicalEvents: HistoricalLateEvent[],
  recentOnTimeCountSinceSettlement: number
): { finalScore: number; appliedCap: number | null; capReason: string | null } {
  let score = rawScore;
  let appliedCap: number | null = null;
  let capReason: string | null = null;

  // Tetos para atrasos ATIVOS
  if (activeOverdueDays > 120) {
    appliedCap = RISK_SCORE_CONFIG.ACTIVE_DELAY_CAPS.DAYS_OVER_120; // 34
    score = Math.min(score, appliedCap);
    capReason = `Teto de proteção de ${appliedCap} aplicado por atraso ativo de ${activeOverdueDays} dias.`;
  } else if (activeOverdueDays >= 91) {
    appliedCap = RISK_SCORE_CONFIG.ACTIVE_DELAY_CAPS.DAYS_91_TO_120; // 44
    score = Math.min(score, appliedCap);
    capReason = `Teto de proteção de ${appliedCap} aplicado por atraso ativo de ${activeOverdueDays} dias.`;
  } else if (activeOverdueDays >= 61) {
    appliedCap = RISK_SCORE_CONFIG.ACTIVE_DELAY_CAPS.DAYS_61_TO_90; // 54
    score = Math.min(score, appliedCap);
    capReason = `Teto de proteção de ${appliedCap} aplicado por atraso ativo de ${activeOverdueDays} dias.`;
  }

  // Penalização extra para múltiplos contratos ativos em atraso grave
  if (activeOverdueCount > 1 && activeOverdueDays >= 61) {
    score = Math.max(0, score - RISK_SCORE_CONFIG.ACTIVE_DELAY_CAPS.MULTIPLE_SEVERE_PENALTY);
  }

  // Trava de recuperação pós-quitação (impedir salto imediato se quitou atraso grave recente)
  if (activeOverdueDays === 0) {
    const severePastEvent = historicalEvents.find((e) => e.isLoanSettled && e.delayDays > 60 && e.timeWeight >= 0.75);
    if (severePastEvent) {
      if (severePastEvent.delayDays > 90 && recentOnTimeCountSinceSettlement < 6) {
        const pastCap = 54;
        if (score > pastCap) {
          score = pastCap;
          appliedCap = pastCap;
          capReason = "Score em recuperação gradual após quitação de atraso histórico superior a 90 dias.";
        }
      } else if (recentOnTimeCountSinceSettlement < 3) {
        const pastCap = 65;
        if (score > pastCap) {
          score = pastCap;
          appliedCap = pastCap;
          capReason = "Score em recuperação gradual após quitação recente de atraso superior a 60 dias.";
        }
      }
    }
  }

  return {
    finalScore: clamp(Math.round(score)),
    appliedCap,
    capReason,
  };
}

/**
 * Função Principal de Cálculo do Score de Risco Comportamental (0 a 100)
 */
export function calculateClientRiskScore(
  client: Client,
  loans: Loan[] = [],
  payments: Payment[] = [],
  installmentSchedules: InstallmentSchedule[] = [],
  referenceDate = new Date()
): ClientRiskScoreResult {
  const safeLoans = Array.isArray(loans) ? loans : [];
  const safePayments = Array.isArray(payments) ? payments : [];
  const safeSchedules = Array.isArray(installmentSchedules) ? installmentSchedules : [];

  const clientLoansAll = getClientLoans(client, safeLoans);

  // Cliente novo sem nenhum empréstimo cadastrado
  if (clientLoansAll.length === 0) {
    const defaultScore = RISK_SCORE_CONFIG.DEFAULT_NEUTRAL_SCORE;
    const band = SCORE_BANDS.find((b) => defaultScore >= b.min && defaultScore <= b.max) || SCORE_BANDS[2];
    return {
      score: defaultScore,
      label: band.label,
      riskLevel: band.riskLevel,
      description: band.description,
      color: band.color,
      bgColor: band.bgColor,
      badgeClassName: band.badgeClassName,
      level: band.level,
      isNewClient: true,
      positiveFactors: ["Cliente cadastrado recentemente."],
      negativeFactors: [],
      reasons: ["Sem histórico financeiro de pagamentos no sistema (Score Neutro)."],
      breakdown: {
        currentObligationsScore: defaultScore,
        historicalDelaysScore: defaultScore,
        recurrenceScore: defaultScore,
        recentBehaviorScore: defaultScore,
        relationshipScore: defaultScore,
        rawScore: defaultScore,
        finalScore: defaultScore,
        appliedCap: null,
        capReason: null,
      },
      activeOverdueDays: 0,
      activeOverdueCount: 0,
      settledLoansCount: 0,
      totalLoansCount: 0,
    };
  }

  const clientLoanIds = new Set(clientLoansAll.map((l) => l.id));
  const clientPayments = safePayments.filter((p) => p && clientLoanIds.has(p.loanId));

  const activeLoans = clientLoansAll.filter((l) => l.status !== "paid" && l.status !== "cancelled");
  const paidLoans = clientLoansAll.filter((l) => l.status === "paid");

  // 1. Situação Atual das Obrigações (35%)
  const currentObligations = calculateCurrentObligationsScore(activeLoans, safeSchedules, referenceDate);

  // Mapeia todos os pagamentos e identifica eventos de atraso
  const historicalEvents: HistoricalLateEvent[] = [];
  let onTimePaymentsTotal = 0;
  let onTimePaymentsIn12m = 0;
  let latePaymentsIn12m = 0;

  const twelveMonthsAgo = new Date(referenceDate);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  // Pagamentos ordenados por data para calcular sequências
  const sortedPayments = [...clientPayments].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let recentStreakOnTime = 0;
  let recentOnTimeCountSinceSettlement = 0;

  sortedPayments.forEach((p) => {
    if (!p || p.installmentNumber === -1) return; // amortização avulsa

    const loan = clientLoansAll.find((l) => l.id === p.loanId);
    if (!loan) return;

    let dueDateStr: string | null = null;
    if (p.installmentNumber === 0) {
      dueDateStr = p.previousDueDate ?? loan.dueDate;
    } else if (p.installmentNumber > 0) {
      dueDateStr = getInstallmentDueDate(loan, p.installmentNumber, safeSchedules);
    }

    const pDateStr = (p.date || "").split("T")[0];
    if (!pDateStr) return;
    const pDate = new Date(pDateStr + "T00:00:00");
    if (isNaN(pDate.getTime())) return;
    const isRecent12m = pDate >= twelveMonthsAgo;

    if (dueDateStr) {
      const dueDate = new Date(dueDateStr + "T00:00:00");
      const toleranceDate = new Date(dueDate.getTime() + 3 * 86400000);

      if (pDate <= toleranceDate) {
        onTimePaymentsTotal++;
        if (isRecent12m) onTimePaymentsIn12m++;
        recentStreakOnTime++;
        recentOnTimeCountSinceSettlement++;
      } else {
        recentStreakOnTime = 0;
        if (isRecent12m) latePaymentsIn12m++;
        const delayDays = Math.max(1, Math.floor((pDate.getTime() - dueDate.getTime()) / 86400000));
        historicalEvents.push({
          loanId: loan.id,
          delayDays,
          date: pDate,
          isLoanSettled: loan.status === "paid",
          timeWeight: getTimeWeight(pDate, referenceDate),
        });
      }
    } else if (p.amount > 0) {
      onTimePaymentsTotal++;
      if (isRecent12m) onTimePaymentsIn12m++;
      recentStreakOnTime++;
    }
  });

  // Também registra atraso corrente como evento se houver
  activeLoans.forEach((loan) => {
    const days = getDaysOverdue(loan, installmentSchedules, referenceDate);
    if (days > 0) {
      const firstDue = getFirstPendingDate(loan, installmentSchedules);
      historicalEvents.push({
        loanId: loan.id,
        delayDays: days,
        date: firstDue,
        isLoanSettled: false,
        timeWeight: 1.0, // evento atual
      });
    }
  });

  // 2. Gravidade e Duração dos Atrasos Históricos (25%)
  const historicalDelays = calculateHistoricalDelaysScore(historicalEvents);

  // 3. Recorrência e Reincidência (20%)
  const recurrence = calculateRecurrenceScore(historicalEvents, referenceDate);

  // 4. Comportamento Recente (10%)
  const recentBehavior = calculateRecentBehaviorScore(onTimePaymentsIn12m, latePaymentsIn12m, recentStreakOnTime);

  // 5. Histórico Positivo e Relacionamento (10%)
  const firstLoanDate = clientLoansAll.length > 0
    ? [...clientLoansAll].sort((a, b) => a.startDate.localeCompare(b.startDate))[0].startDate
    : referenceDate.toISOString().split("T")[0];
  const relationshipMonths = Math.max(0, Math.floor((referenceDate.getTime() - new Date(firstLoanDate + "T00:00:00").getTime()) / (30 * 86400000)));
  const cleanlyPaidLoans = paidLoans.filter((l) => {
    return !historicalEvents.some((e) => e.loanId === l.id && e.delayDays > 7);
  }).length;

  const relationship = calculateRelationshipScore(
    cleanlyPaidLoans,
    relationshipMonths,
    onTimePaymentsTotal,
    activeLoans.length > 0
  );

  // Composição Ponderada
  const rawScore =
    currentObligations.score * RISK_SCORE_CONFIG.WEIGHTS.CURRENT_OBLIGATIONS +
    historicalDelays.score * RISK_SCORE_CONFIG.WEIGHTS.HISTORICAL_DELAYS +
    recurrence.score * RISK_SCORE_CONFIG.WEIGHTS.RECURRENCE +
    recentBehavior.score * RISK_SCORE_CONFIG.WEIGHTS.RECENT_BEHAVIOR +
    relationship.score * RISK_SCORE_CONFIG.WEIGHTS.RELATIONSHIP_BONUS;

  // Aplicação de Tetos Rígidos e Recuperação Pós-Quitação
  const { finalScore, appliedCap, capReason } = applySevereDelinquencyCaps(
    rawScore,
    currentObligations.activeOverdueDays,
    currentObligations.activeOverdueCount,
    historicalEvents,
    recentOnTimeCountSinceSettlement
  );

  // Determina a faixa de classificação correspondente
  const band = SCORE_BANDS.find((b) => finalScore >= b.min && finalScore <= b.max) || SCORE_BANDS[4];

  // Agrega fatores positivos
  const positiveFactors: string[] = [];
  if (currentObligations.activeOverdueCount === 0 && activeLoans.length > 0) {
    positiveFactors.push("Todos os contratos em aberto estão rigorosamente em dia.");
  }
  if (cleanlyPaidLoans > 0) {
    positiveFactors.push(`${cleanlyPaidLoans} contrato(s) quitado(s) pontualmente.`);
  }
  if (recentStreakOnTime >= 3) {
    positiveFactors.push(`Sequência consistente de ${recentStreakOnTime} pagamentos realizados em dia.`);
  }
  if (relationshipMonths >= 6) {
    positiveFactors.push(`Histórico de relacionamento ativo há ${relationshipMonths} meses.`);
  }
  if (historicalEvents.length === 0 && onTimePaymentsTotal > 0) {
    positiveFactors.push("Histórico 100% livre de atrasos.");
  }

  // Agrega fatores negativos
  const negativeFactors: string[] = [];
  if (currentObligations.activeOverdueDays > 0) {
    negativeFactors.push(`Obrigação em aberto com ${currentObligations.activeOverdueDays} dia(s) de atraso ativo.`);
  }
  if (currentObligations.activeOverdueCount > 1) {
    negativeFactors.push(`${currentObligations.activeOverdueCount} contratos em atraso no momento.`);
  }
  recurrence.reasons.forEach((r) => negativeFactors.push(r));
  if (capReason && !negativeFactors.includes(capReason)) {
    negativeFactors.push(capReason);
  }

  // Lista consolidada de motivos resumidos
  const reasons: string[] = [
    `Classificação: ${band.label} (${finalScore}/100)`,
    ...currentObligations.reasons,
    ...historicalDelays.reasons,
    ...recurrence.reasons,
    ...relationship.reasons,
  ];
  if (capReason) reasons.push(capReason);

  return {
    score: finalScore,
    label: band.label,
    riskLevel: band.riskLevel,
    description: band.description,
    color: band.color,
    bgColor: band.bgColor,
    badgeClassName: band.badgeClassName,
    level: band.level,
    isNewClient: false,
    positiveFactors: Array.from(new Set(positiveFactors)),
    negativeFactors: Array.from(new Set(negativeFactors)),
    reasons: Array.from(new Set(reasons)).slice(0, 6),
    breakdown: {
      currentObligationsScore: Math.round(currentObligations.score),
      historicalDelaysScore: Math.round(historicalDelays.score),
      recurrenceScore: Math.round(recurrence.score),
      recentBehaviorScore: Math.round(recentBehavior.score),
      relationshipScore: Math.round(relationship.score),
      rawScore: Math.round(rawScore),
      finalScore,
      appliedCap,
      capReason,
    },
    activeOverdueDays: currentObligations.activeOverdueDays,
    activeOverdueCount: currentObligations.activeOverdueCount,
    settledLoansCount: paidLoans.length,
    totalLoansCount: clientLoansAll.length,
  };
}
