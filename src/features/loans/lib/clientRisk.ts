import { Client, ClientFinancialProfile, InstallmentSchedule, Loan, Payment } from "@/types/loan";

export interface RiskProfile {
  score: number;
  currentScore: number;
  currentBaseScore: number;
  historicalScore: number;
  level: "baixo" | "moderado" | "alto" | "critico";
  label: string;
  classification: string;
  badgeClassName: string;
  reasons: string[];
  trend: "improving" | "worsening" | "stable";
  trendLabel: string;
  positiveFactors?: string[];
  negativeFactors?: string[];
}

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

export interface ClientRiskHistoryPoint {
  month: string;
  label: string;
  score: number;
  historicalScore: number;
  latePayments: number;
  onTimePayments: number;
  overdueLoans: number;
  totalLent: number;
}

interface ScoreSnapshot {
  currentScore: number;
  currentBaseScore: number;
  historicalScore: number;
  metrics: ClientRiskMetrics;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatRiskCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function normalizeClientKey(value?: string | null) {
  return (value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getLoanClientKey(loan: Loan) {
  return loan.borrowerId || normalizeClientKey(loan.borrowerName);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getDiffInDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function getNextDate(base: Date, frequency: string, periods: number) {
  const d = new Date(base);
  if (frequency === "Semanal") d.setDate(d.getDate() + 7 * periods);
  else if (frequency === "Quinzenal") d.setDate(d.getDate() + 15 * periods);
  else d.setMonth(d.getMonth() + periods);
  return d;
}

function getFirstPendingDate(loan: Loan, schedules: InstallmentSchedule[]) {
  const loanSchedules = schedules
    .filter((s) => s.loanId === loan.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const nextNum = loan.paidInstallments + 1;
  const saved = loanSchedules.find((s) => s.installmentNumber === nextNum);
  if (saved) return new Date(saved.dueDate + "T00:00:00");
  return new Date(loan.dueDate + "T00:00:00");
}

function getMonthsBetween(startDate: string, referenceDate: Date) {
  const start = new Date(`${startDate}T00:00:00`);
  let months = (referenceDate.getFullYear() - start.getFullYear()) * 12;
  months += referenceDate.getMonth() - start.getMonth();

  if (referenceDate.getDate() < start.getDate()) {
    months -= 1;
  }

  return Math.max(0, months);
}

function getClientRelationshipMonths(clientLoans: Loan[], referenceDate: Date) {
  if (clientLoans.length === 0) return 0;
  const firstLoan = [...clientLoans].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return getMonthsBetween(firstLoan.startDate, referenceDate);
}

export function getDaysOverdue(loan: Loan, schedules: InstallmentSchedule[] = [], referenceDate = new Date()) {
  const todayNorm = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const due = getFirstPendingDate(loan, schedules);
  return Math.floor((todayNorm.getTime() - due.getTime()) / 86400000);
}

function getLoanCategory(loan: Loan, payments: Payment[], schedules: InstallmentSchedule[] = [], referenceDate = new Date()) {
  if (loan.status === "paid") return "paid" as const;
  const days = getDaysOverdue(loan, schedules, referenceDate);
  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const lastPayment = loanPayments.sort((a, b) => b.date.localeCompare(a.date))[0];
  const paidContractualInterestOnTime = lastPayment
    && lastPayment.installmentNumber === 0
    && !!lastPayment.previousDueDate
    && lastPayment.date <= lastPayment.previousDueDate;
  if (days < 0) return paidContractualInterestOnTime ? "paid_interest" as const : "on_track" as const;
  if (days === 0) return "due_today" as const;
  if (days > 0) return "overdue" as const;
  return "on_track" as const;
}

export function getInstallmentDueDate(loan: Loan, installmentNumber: number, schedules: InstallmentSchedule[]) {
  const savedSchedule = schedules.find((s) => s.loanId === loan.id && s.installmentNumber === installmentNumber);
  if (savedSchedule?.dueDate) return savedSchedule.dueDate;
  const firstDue = new Date(loan.dueDate + "T00:00:00");
  return getNextDate(firstDue, loan.interestType || "Mensal", Math.max(0, installmentNumber - 1)).toISOString().split("T")[0];
}

export function getClientLoans(client: Client, loans: Loan[]) {
  const fallbackKey = normalizeClientKey(client.name);
  return loans.filter((loan) => loan.borrowerId === client.id || (!loan.borrowerId && normalizeClientKey(loan.borrowerName) === fallbackKey));
}

export function getClientRiskMetrics(client: Client, loans: Loan[], payments: Payment[], installmentSchedules: InstallmentSchedule[], referenceDate = new Date()): ClientRiskMetrics {
  const clientLoans = getClientLoans(client, loans).filter((loan) => loan.startDate <= referenceDate.toISOString().split("T")[0]);
  const allowedPayments = payments.filter((payment) => payment.date <= referenceDate.toISOString().split("T")[0]);
  const totalLent = clientLoans.reduce((sum, loan) => sum + loan.amount, 0);
  const overdueLoans = clientLoans.filter((loan) => getLoanCategory(loan, allowedPayments, installmentSchedules, referenceDate) === "overdue");
  const paidLoans = clientLoans.filter((loan) => loan.status === "paid").length;
  const activeLoans = clientLoans.filter((loan) => loan.status !== "paid").length;

  let onTimePayments = 0;
  let latePayments = 0;
  let partialPayments = 0;

  clientLoans.forEach((loan) => {
    allowedPayments
      .filter((payment) => payment.loanId === loan.id)
      .forEach((payment) => {
        if (payment.installmentNumber === -1) {
          partialPayments += 1;
          return;
        }

        if (payment.installmentNumber === 0) {
          const contractualDueDate = payment.previousDueDate ?? loan.dueDate;
          if (payment.date <= contractualDueDate) {
            onTimePayments += 1;
          } else {
            latePayments += 1;
          }
          return;
        }

        if (payment.installmentNumber < 0) return;

        const dueDate = getInstallmentDueDate(loan, payment.installmentNumber, installmentSchedules);
        if (payment.date <= dueDate) onTimePayments += 1;
        else latePayments += 1;
      });
  });

  const historicalOverdueDays = clientLoans.map((loan) => {
    const currentOverdueDays = getLoanCategory(loan, allowedPayments, installmentSchedules, referenceDate) === "overdue"
      ? getDaysOverdue(loan, installmentSchedules, referenceDate)
      : 0;

    const paidDelayDays = allowedPayments
      .filter((payment) => payment.loanId === loan.id)
      .reduce((maxDelay, payment) => {
        if (payment.installmentNumber === -1) return maxDelay;

        const dueDate = payment.installmentNumber === 0
          ? (payment.previousDueDate ?? loan.dueDate)
          : payment.installmentNumber > 0
            ? getInstallmentDueDate(loan, payment.installmentNumber, installmentSchedules)
            : null;

        if (!dueDate) return maxDelay;
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

function getPunctualityBonus(metrics: ClientRiskMetrics) {
  const punctuality = metrics.totalTimedPayments > 0 ? metrics.onTimeRatio * 100 : 0;
  if (punctuality >= 95) return 40;
  if (punctuality >= 85) return 30;
  if (punctuality >= 70) return 20;
  return metrics.totalTimedPayments > 0 ? 5 : 0;
}

function getRelationshipBonus(relationshipMonths: number) {
  if (relationshipMonths >= 12) return 30;
  if (relationshipMonths >= 6) return 20;
  if (relationshipMonths >= 3) return 10;
  return 0;
}

function getHealthyVolumeBonus(metrics: ClientRiskMetrics) {
  if (metrics.totalLent >= 30000 && metrics.onTimeRatio >= 0.95) return 15;
  if (metrics.totalLent >= 15000 && metrics.onTimeRatio >= 0.9) return 10;
  if (metrics.totalLent >= 5000 && metrics.onTimeRatio >= 0.85) return 6;
  return 0;
}

function getRecentRecurrencePenalty(client: Client, loans: Loan[], payments: Payment[], installmentSchedules: InstallmentSchedule[], referenceDate: Date) {
  const recentReference = new Date(referenceDate);
  recentReference.setMonth(recentReference.getMonth() - 3);

  const previousReference = new Date(recentReference);
  previousReference.setMonth(previousReference.getMonth() - 3);

  const recentMetrics = getClientRiskMetrics(client, loans, payments, installmentSchedules, referenceDate);
  const previousMetrics = getClientRiskMetrics(client, loans, payments, installmentSchedules, previousReference);

  const hadGoodPeriod = previousMetrics.totalTimedPayments > 0 && previousMetrics.onTimeRatio >= 0.9 && previousMetrics.severeOverdueLoans === 0;
  const relapsedNow = recentMetrics.latePayments > previousMetrics.latePayments && (recentMetrics.overdueLoans > 0 || recentMetrics.lateRatio > 0.2);

  return hadGoodPeriod && relapsedNow ? 30 : 0;
}

function buildScoreSnapshot(client: Client, loans: Loan[], payments: Payment[], installmentSchedules: InstallmentSchedule[], referenceDate = new Date()): ScoreSnapshot {
  const metrics = getClientRiskMetrics(client, loans, payments, installmentSchedules, referenceDate);
  const clientLoans = getClientLoans(client, loans).filter((loan) => loan.startDate <= referenceDate.toISOString().split("T")[0]);
  const relationshipMonths = getClientRelationshipMonths(clientLoans, referenceDate);

  let historicalScore = 75;
  historicalScore += getPunctualityBonus(metrics);
  historicalScore += getRelationshipBonus(relationshipMonths);
  historicalScore += getHealthyVolumeBonus(metrics);

  if (metrics.maxOverdueDays > 30) historicalScore -= 45;
  else if (metrics.maxOverdueDays >= 16) historicalScore -= 28;
  else if (metrics.maxOverdueDays >= 6) historicalScore -= 16;
  else if (metrics.maxOverdueDays >= 1) historicalScore -= 8;

  if (metrics.severeOverdueLoans > 0) {
    historicalScore -= 20;
  }

  if (metrics.highOverdueLoans > 1 || metrics.severeOverdueLoans > 1) {
    historicalScore -= 20;
  } else if (metrics.latePayments >= 2 || metrics.overdueLoans >= 2) {
    historicalScore -= 20;
  }

  historicalScore -= getRecentRecurrencePenalty(client, loans, payments, installmentSchedules, referenceDate);
  historicalScore = clamp(Math.round(historicalScore), 0, 150);

  let currentBaseScore = 100;
  if (metrics.maxOverdueDays > 30) currentBaseScore -= 55;
  else if (metrics.maxOverdueDays >= 16) currentBaseScore -= 35;
  else if (metrics.maxOverdueDays >= 6) currentBaseScore -= 22;
  else if (metrics.maxOverdueDays >= 1) currentBaseScore -= 10;
  currentBaseScore -= metrics.overdueLoans * 10;
  currentBaseScore -= metrics.severeOverdueLoans * 12;
  currentBaseScore -= metrics.lateRatio * 35;
  currentBaseScore -= Math.min(12, metrics.partialPayments * 4);
  currentBaseScore -= metrics.activeLoans >= 4 ? 6 : 0;
  currentBaseScore += metrics.totalTimedPayments > 0 ? metrics.onTimeRatio * 8 : 0;
  currentBaseScore += Math.min(6, metrics.paidLoans * 2);
  currentBaseScore = clamp(Math.round(currentBaseScore), 0, 100);

  let currentScore = currentBaseScore + (historicalScore - 75) * 0.3;

  if (metrics.severeOverdueLoans > 0) {
    currentScore = Math.min(currentScore, 50);
  }

  if (metrics.maxOverdueDays > 30) {
    currentScore = Math.min(currentScore, 35);
  }

  if (historicalScore < 50) {
    currentScore = Math.min(currentScore, 60);
  }

  return {
    currentScore: clamp(Math.round(currentScore), 0, 100),
    currentBaseScore,
    historicalScore,
    metrics,
  };
}

function getTrendLabel(trend: RiskProfile["trend"]) {
  if (trend === "improving") return "Melhorando";
  if (trend === "worsening") return "Piorando";
  return "Estável";
}

function getCombinedClassification(currentScore: number, historicalScore: number) {
  if (currentScore <= 35) return "Alto risco crítico";
  if (currentScore >= 80 && historicalScore >= 110) return "Cliente excelente";
  if (currentScore < 60 && historicalScore >= 110) return "Queda recente";
  if (currentScore >= 75 && historicalScore < 75) return "Risco oculto";
  if (currentScore < 60 && historicalScore < 75) return "Alto risco crítico";
  if (currentScore >= 70) return "Bom momento";
  if (historicalScore >= 100) return "Histórico consistente";
  return "Em observação";
}

function getProfileVisual(currentScore: number, maxOverdueDays: number) {
  if (maxOverdueDays > 30) {
    return {
      level: "critico" as const,
      label: "Risco crítico",
      badgeClassName: "bg-destructive/15 text-destructive border-destructive/30",
    };
  }

  if (currentScore >= 80) {
    return {
      level: "baixo" as const,
      label: "Saudável",
      badgeClassName: "bg-success/10 text-success border-success/20",
    };
  }

  if (currentScore >= 60) {
    return {
      level: "moderado" as const,
      label: "Atenção",
      badgeClassName: "bg-warning/10 text-warning border-warning/20",
    };
  }

  if (currentScore >= 40) {
    return {
      level: "alto" as const,
      label: "Risco alto",
      badgeClassName: "bg-destructive/10 text-destructive border-destructive/20",
    };
  }

  return {
    level: "critico" as const,
    label: "Risco crítico",
    badgeClassName: "bg-destructive/15 text-destructive border-destructive/30",
  };
}

export function buildRiskProfile(client: Client, loans: Loan[], payments: Payment[], installmentSchedules: InstallmentSchedule[], referenceDate = new Date()): RiskProfile {
  return buildConsolidatedRiskProfile(client, loans, payments, installmentSchedules, null, referenceDate);
}

export function buildConsolidatedRiskProfile(
  client: Client,
  loans: Loan[],
  payments: Payment[],
  installmentSchedules: InstallmentSchedule[],
  financialProfile?: ClientFinancialProfile | null,
  referenceDate = new Date(),
): RiskProfile {
  const snapshot = buildScoreSnapshot(client, loans, payments, installmentSchedules, referenceDate);
  const previousReference = new Date(referenceDate);
  previousReference.setMonth(previousReference.getMonth() - 1);
  const previousSnapshot = buildScoreSnapshot(client, loans, payments, installmentSchedules, previousReference);

  const trendDelta = snapshot.currentScore - previousSnapshot.currentScore;
  const trend: RiskProfile["trend"] = trendDelta >= 4 ? "improving" : trendDelta <= -4 ? "worsening" : "stable";
  const visual = getProfileVisual(snapshot.currentScore, snapshot.metrics.maxOverdueDays);

  const positiveFactors = [
    snapshot.metrics.onTimeRatio >= 0.95 ? "Pontualidade histórica em nível excelente." : null,
    snapshot.historicalScore >= 110 ? "Base histórica forte e consistente dentro do app." : null,
    snapshot.metrics.paidLoans > 0 ? `${snapshot.metrics.paidLoans} contrato${snapshot.metrics.paidLoans > 1 ? "s" : ""} já foi(foram) quitado(s).` : null,
    snapshot.metrics.totalLent > 0 ? `Volume movimentado no app: ${formatRiskCurrency(snapshot.metrics.totalLent)}.` : null,
  ].filter(Boolean) as string[];

  const negativeFactors = financialProfile?.negativeFactors?.length
    ? financialProfile.negativeFactors
    : [
        snapshot.metrics.overdueLoans > 0 ? `${snapshot.metrics.overdueLoans} contrato${snapshot.metrics.overdueLoans > 1 ? "s" : ""} em atraso no momento.` : null,
        snapshot.metrics.maxOverdueDays > 30 ? `Maior atraso registrado: ${snapshot.metrics.maxOverdueDays} dias.` : null,
        snapshot.metrics.severeOverdueLoans > 0 ? "Há atraso atual acima de 30 dias." : null,
        snapshot.metrics.latePayments > 0 ? `${Math.round(snapshot.metrics.lateRatio * 100)}% dos pagamentos tiveram atraso.` : null,
        snapshot.historicalScore < 50 ? "O histórico acumulado limita a confiança operacional." : null,
      ].filter(Boolean) as string[];

  const reasons = [
    `Score Histórico em ${snapshot.historicalScore}/150.` ,
    `Score Atual em ${snapshot.currentScore}/100.` ,
    snapshot.metrics.maxOverdueDays > 0 ? `Pior atraso observado: ${snapshot.metrics.maxOverdueDays} dias.` : null,
    snapshot.metrics.totalTimedPayments > 0 ? `${Math.round(snapshot.metrics.onTimeRatio * 100)}% de pagamentos em dia no histórico.` : "Ainda sem histórico suficiente de pagamentos.",
    snapshot.metrics.severeOverdueLoans > 0 ? "Limite de proteção aplicado por atraso acima de 30 dias." : null,
    snapshot.historicalScore < 50 ? "Limite de proteção aplicado por histórico abaixo do neutro." : null,
  ].filter(Boolean) as string[];

  return {
    score: snapshot.currentScore,
    currentScore: snapshot.currentScore,
    currentBaseScore: snapshot.currentBaseScore,
    historicalScore: snapshot.historicalScore,
    level: visual.level,
    label: visual.label,
    classification: getCombinedClassification(snapshot.currentScore, snapshot.historicalScore),
    badgeClassName: visual.badgeClassName,
    reasons: Array.from(new Set(reasons)).slice(0, 6),
    trend,
    trendLabel: getTrendLabel(trend),
    positiveFactors,
    negativeFactors,
  };
}

export function buildClientRiskHistory(client: Client, loans: Loan[], payments: Payment[], installmentSchedules: InstallmentSchedule[]): ClientRiskHistoryPoint[] {
  const clientLoans = getClientLoans(client, loans).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (clientLoans.length === 0) return [];

  const firstDate = new Date(clientLoans[0].startDate + "T00:00:00");
  const current = new Date();
  const points: ClientRiskHistoryPoint[] = [];
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);

  while (cursor <= current) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
    const snapshot = buildScoreSnapshot(client, loans, payments, installmentSchedules, monthEnd);
    const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    points.push({
      month,
      label: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      score: snapshot.currentScore,
      historicalScore: snapshot.historicalScore,
      latePayments: snapshot.metrics.latePayments,
      onTimePayments: snapshot.metrics.onTimePayments,
      overdueLoans: snapshot.metrics.overdueLoans,
      totalLent: snapshot.metrics.totalLent,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return points;
}