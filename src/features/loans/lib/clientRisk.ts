import { Client, ClientFinancialProfile, InstallmentSchedule, Loan, LoanRenegotiation, Payment } from "@/types/loan";
import { calculateClientRiskScore, ClientRiskScoreResult } from "@/features/clients/lib/riskEngine/calculateClientRiskScore";
import {
  ClientRiskMetrics,
  formatRiskCurrency,
  normalizeClientKey,
  getLoanClientKey,
  getFirstPendingDate,
  getDaysOverdue,
  getInstallmentDueDate,
  getClientLoans,
  getLoanCategory,
  getClientRiskMetrics,
} from "./clientRiskUtils";

// Re-export all utilities for backward compatibility
export {
  type ClientRiskMetrics,
  formatRiskCurrency,
  normalizeClientKey,
  getLoanClientKey,
  getFirstPendingDate,
  getDaysOverdue,
  getInstallmentDueDate,
  getClientLoans,
  getLoanCategory,
  getClientRiskMetrics,
};

export interface RiskProfile {
  score: number;
  currentScore: number;
  currentBaseScore: number;
  historicalScore: number;
  level: "baixo" | "moderado" | "alto" | "critico";
  label: string;
  riskLevel: string;
  description: string;
  classification: string;
  badgeClassName: string;
  reasons: string[];
  trend: "improving" | "worsening" | "stable";
  trendLabel: string;
  positiveFactors?: string[];
  negativeFactors?: string[];
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

function buildScoreSnapshot(
  client: Client,
  loans: Loan[] = [],
  payments: Payment[] = [],
  installmentSchedules: InstallmentSchedule[] = [],
  referenceDate = new Date(),
  renegotiations: LoanRenegotiation[] = []
): ScoreSnapshot & { result: ClientRiskScoreResult } {
  const safeLoans = Array.isArray(loans) ? loans : [];
  const safePayments = Array.isArray(payments) ? payments : [];
  const safeSchedules = Array.isArray(installmentSchedules) ? installmentSchedules : [];
  const safeRenegotiations = Array.isArray(renegotiations) ? renegotiations : [];

  const metrics = getClientRiskMetrics(client, safeLoans, safePayments, safeSchedules, referenceDate);
  const result = calculateClientRiskScore(client, safeLoans, safePayments, safeSchedules, referenceDate, safeRenegotiations);

  return {
    currentScore: result.score,
    currentBaseScore: result.breakdown.currentObligationsScore,
    historicalScore: result.score,
    metrics,
    result,
  };
}

function getTrendLabel(trend: RiskProfile["trend"]) {
  if (trend === "improving") return "Melhorando";
  if (trend === "worsening") return "Piorando";
  return "Estável";
}

function getCombinedClassification(score: number, level: RiskProfile["level"]) {
  if (score >= 85) return "Excelente";
  if (score >= 70) return "Bom";
  if (score >= 55) return "Regular";
  if (score >= 40) return "Risco elevado";
  return "Alto risco";
}

export function buildRiskProfile(
  client: Client,
  loans: Loan[] = [],
  payments: Payment[] = [],
  installmentSchedules: InstallmentSchedule[] = [],
  referenceDate = new Date(),
  renegotiations: LoanRenegotiation[] = []
): RiskProfile {
  return buildConsolidatedRiskProfile(client, loans, payments, installmentSchedules, null, referenceDate, renegotiations);
}

export function buildConsolidatedRiskProfile(
  client: Client,
  loans: Loan[] = [],
  payments: Payment[] = [],
  installmentSchedules: InstallmentSchedule[] = [],
  financialProfile?: ClientFinancialProfile | null,
  referenceDate = new Date(),
  renegotiations: LoanRenegotiation[] = []
): RiskProfile {
  const safeLoans = Array.isArray(loans) ? loans : [];
  const safePayments = Array.isArray(payments) ? payments : [];
  const safeSchedules = Array.isArray(installmentSchedules) ? installmentSchedules : [];
  const safeRenegotiations = Array.isArray(renegotiations) ? renegotiations : [];

  const snapshot = buildScoreSnapshot(client, safeLoans, safePayments, safeSchedules, referenceDate, safeRenegotiations);
  const previousReference = new Date(referenceDate);
  previousReference.setMonth(previousReference.getMonth() - 1);
  const previousSnapshot = buildScoreSnapshot(client, safeLoans, safePayments, safeSchedules, previousReference, safeRenegotiations);

  const trendDelta = snapshot.currentScore - previousSnapshot.currentScore;
  const trend: RiskProfile["trend"] = trendDelta >= 3 ? "improving" : trendDelta <= -3 ? "worsening" : "stable";

  const result = snapshot.result;

  const negativeFactors = financialProfile?.negativeFactors?.length
    ? financialProfile.negativeFactors
    : result.negativeFactors;

  return {
    score: result.score,
    currentScore: result.score,
    currentBaseScore: snapshot.currentBaseScore,
    historicalScore: result.score,
    level: result.level,
    label: result.label,
    riskLevel: result.riskLevel,
    description: result.description,
    classification: getCombinedClassification(result.score, result.level),
    badgeClassName: result.badgeClassName,
    reasons: result.reasons,
    trend,
    trendLabel: getTrendLabel(trend),
    positiveFactors: result.positiveFactors,
    negativeFactors,
  };
}

export function buildClientRiskHistory(
  client: Client,
  loans: Loan[] = [],
  payments: Payment[] = [],
  installmentSchedules: InstallmentSchedule[] = [],
  renegotiations: LoanRenegotiation[] = []
): ClientRiskHistoryPoint[] {
  const safeLoans = Array.isArray(loans) ? loans : [];
  const safePayments = Array.isArray(payments) ? payments : [];
  const safeSchedules = Array.isArray(installmentSchedules) ? installmentSchedules : [];
  const safeRenegotiations = Array.isArray(renegotiations) ? renegotiations : [];

  const clientLoans = getClientLoans(client, safeLoans).sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  if (clientLoans.length === 0) return [];

  const firstDateStr = clientLoans[0].startDate;
  if (!firstDateStr) return [];
  const firstDate = new Date(firstDateStr + "T00:00:00");
  if (isNaN(firstDate.getTime())) return [];

  const current = new Date();
  const points: ClientRiskHistoryPoint[] = [];
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);

  while (cursor <= current) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
    const monthEndIso = monthEnd.toISOString();
    // Filtra renegociações válidas ocorridas até o fechamento deste mês no histórico
    const pastRenegotiations = safeRenegotiations.filter((r) => {
      const dateStr = r.renegotiatedAt || r.createdAt || "";
      return !dateStr || dateStr <= monthEndIso;
    });

    const snapshot = buildScoreSnapshot(client, safeLoans, safePayments, safeSchedules, monthEnd, pastRenegotiations);
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