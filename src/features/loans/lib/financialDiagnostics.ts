/**
 * ============================================================================
 * DIAGNÓSTICO REAL: LÓGICA ANTIGA × NOVA (SOMENTE LEITURA)
 * ============================================================================
 *
 * Executa as duas regras em paralelo para cada contrato, classifica a causa
 * provável da divergência e atribui severidade. NÃO escreve no banco, não
 * altera metadata, não corrige nada — apenas descreve.
 */

import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { roundCurrency } from "@/lib/money";
import {
  calculateLegacyLoanFinancialState,
  calculateUnifiedLoanFinancialState,
} from "@/features/loans/lib/loanFinancialAdapter";

export const DIAGNOSTIC_CATEGORIES = [
  "NO_DIFFERENCE",
  "ROUNDING_ONLY",
  "STALE_REMAINING_AMOUNT",
  "STALE_PAID_INSTALLMENTS",
  "PARTIAL_PAYMENT_ALLOCATION",
  "LEGACY_PAYMENT_WITHOUT_METADATA",
  "PENALTY_ALREADY_PAID",
  "LATE_INTEREST_ALREADY_PAID",
  "INSTALLMENT_MARKED_PAID_TOO_EARLY",
  "CURRENT_INSTALLMENT_INTEREST_MISMATCH",
  "MISSING_INSTALLMENT_SCHEDULE",
  "INCOMPLETE_INSTALLMENT_SCHEDULE",
  "CONTRACT_TOTAL_MISMATCH",
  "POSSIBLE_NEW_CALCULATION_ERROR",
  "UNCLASSIFIED",
] as const;

export type DiagnosticCategory = (typeof DIAGNOSTIC_CATEGORIES)[number];
export type DiagnosticSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface LoanFinancialDiagnosticRow {
  loanId: string;
  clientId?: string;
  clientName?: string;
  status?: string;

  oldPrincipalRemaining: number;
  newPrincipalRemaining: number;
  principalDifference: number;

  oldInterestRemaining: number;
  newInterestRemaining: number;
  interestDifference: number;

  oldPenaltyPending: number;
  newPenaltyPending: number;
  penaltyDifference: number;

  oldLateInterestPending: number;
  newLateInterestPending: number;
  lateInterestDifference: number;

  oldCurrentInstallmentRemaining: number;
  newCurrentInstallmentRemaining: number;
  installmentDifference: number;

  oldTotalReceivable: number;
  newTotalReceivable: number;
  totalDifference: number;

  remainingAmountStored?: number;
  paidInstallmentsStored?: number;

  calculationSource: string;
  warnings: string[];
  suspectedReason: DiagnosticCategory[];
  severity: DiagnosticSeverity;
  /** Soma dos valores absolutos das diferenças por componente. */
  absoluteDifference: number;
}

export interface DiagnosticSummary {
  analyzed: number;
  withoutDifference: number;
  withDifference: number;
  totalAbsoluteDifference: number;
  largestDifference: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  legacyWithoutMetadata: number;
  incompleteSchedule: number;
  byCategory: Record<string, number>;
}

const EPS = 0.01;
const abs = (n: number) => Math.abs(roundCurrency(n));

function hasLegacyPaymentWithoutMetadata(payments: Payment[]): boolean {
  return payments.some((p) => {
    const md = (p.metadata ?? null) as any;
    if (p.installmentNumber !== -1) return false;
    return md?.principal_amount == null && md?.interest_amount == null;
  });
}

function classify(
  row: Omit<LoanFinancialDiagnosticRow, "suspectedReason" | "severity" | "absoluteDifference">,
  ctx: {
    loan: Loan;
    payments: Payment[];
    schedules: InstallmentSchedule[];
    newState: ReturnType<typeof calculateUnifiedLoanFinancialState>;
  },
): DiagnosticCategory[] {
  const { loan, payments, schedules, newState } = ctx;
  const reasons: DiagnosticCategory[] = [];

  const componentDiffs = [
    row.principalDifference,
    row.interestDifference,
    row.penaltyDifference,
    row.lateInterestDifference,
    row.installmentDifference,
    row.totalDifference,
  ];
  const maxDiff = Math.max(...componentDiffs.map(abs));

  const scheduleRows = schedules.filter((s) => s.loanId === loan.id);
  const expectedRows = Math.max(1, Math.floor(Number(loan.installments) || 1));
  if (loan.installments >= 2 && scheduleRows.length === 0) reasons.push("MISSING_INSTALLMENT_SCHEDULE");
  else if (loan.installments >= 2 && scheduleRows.length < expectedRows) reasons.push("INCOMPLETE_INSTALLMENT_SCHEDULE");

  if (hasLegacyPaymentWithoutMetadata(payments.filter((p) => p.loanId === loan.id))) {
    reasons.push("LEGACY_PAYMENT_WITHOUT_METADATA");
  }

  if (newState.warnings.some((w) => w.includes("remainingAmount diverge"))) {
    reasons.push("STALE_REMAINING_AMOUNT");
  }
  if (newState.warnings.some((w) => w.includes("paidInstallments"))) {
    reasons.push("STALE_PAID_INSTALLMENTS");
  }
  if (newState.warnings.some((w) => w.includes("composição persistida"))) {
    reasons.push("PARTIAL_PAYMENT_ALLOCATION");
  }

  if (row.oldPenaltyPending - row.newPenaltyPending > EPS && newState.penaltyPaid > EPS) {
    reasons.push("PENALTY_ALREADY_PAID");
  }
  if (row.oldLateInterestPending - row.newLateInterestPending > EPS && newState.lateInterestPaid > EPS) {
    reasons.push("LATE_INTEREST_ALREADY_PAID");
  }

  if (
    newState.currentInstallmentRemaining > EPS
    && Number(loan.paidInstallments) >= (newState.currentInstallmentNumber ?? 1)
  ) {
    reasons.push("INSTALLMENT_MARKED_PAID_TOO_EARLY");
  }

  if (abs(row.installmentDifference) > EPS) reasons.push("CURRENT_INSTALLMENT_INTEREST_MISMATCH");

  const contractTotal = roundCurrency(newState.originalPrincipal + newState.contractualInterestTotal);
  const legacyTotal = roundCurrency(row.oldPrincipalRemaining + row.oldInterestRemaining);
  if (loan.status !== "paid" && legacyTotal - contractTotal > EPS) reasons.push("CONTRACT_TOTAL_MISMATCH");

  const newLooksWrong =
    newState.principalRemaining < -EPS
    || newState.principalRemaining > newState.originalPrincipal + EPS
    || newState.totalReceivable < -EPS
    || (loan.status === "paid" && newState.totalReceivable > EPS);
  if (newLooksWrong) reasons.push("POSSIBLE_NEW_CALCULATION_ERROR");

  if (maxDiff <= EPS) {
    if (reasons.length === 0) return ["NO_DIFFERENCE"];
    return reasons;
  }
  if (maxDiff <= 0.05 && reasons.length === 0) return ["ROUNDING_ONLY"];
  if (reasons.length === 0) return ["UNCLASSIFIED"];
  return reasons;
}

export function deriveSeverity(
  row: Omit<LoanFinancialDiagnosticRow, "severity">,
  loanStatus?: string,
): DiagnosticSeverity {
  const reasons = row.suspectedReason;
  const maxDiff = Math.max(
    abs(row.principalDifference),
    abs(row.interestDifference),
    abs(row.penaltyDifference),
    abs(row.lateInterestDifference),
    abs(row.installmentDifference),
    abs(row.totalDifference),
  );

  const critical =
    maxDiff > 10
    || abs(row.principalDifference) > EPS
    || reasons.includes("PENALTY_ALREADY_PAID")
    || reasons.includes("INSTALLMENT_MARKED_PAID_TOO_EARLY")
    || reasons.includes("POSSIBLE_NEW_CALCULATION_ERROR")
    || row.newTotalReceivable < -EPS
    || (loanStatus === "paid" && row.newTotalReceivable > EPS);
  if (critical) return "CRITICAL";

  if (maxDiff > EPS) return "WARNING";
  if (reasons.length === 1 && (reasons[0] === "NO_DIFFERENCE" || reasons[0] === "ROUNDING_ONLY")) return "INFO";
  return reasons.length > 0 ? "WARNING" : "INFO";
}

export interface DiagnosticOptions {
  calculationDate?: string;
  /** Nome do cliente por loanId (opcional, apenas apresentação). */
  clientNameById?: Map<string, string>;
}

export function buildLoanFinancialDiagnostics(
  loans: Loan[],
  payments: Payment[],
  schedules: InstallmentSchedule[],
  options: DiagnosticOptions = {},
): LoanFinancialDiagnosticRow[] {
  const rows: LoanFinancialDiagnosticRow[] = [];

  for (const loan of loans) {
    const loanPayments = payments.filter((p) => p.loanId === loan.id);
    const input = {
      loan,
      payments: loanPayments,
      installmentSchedules: schedules,
      calculationDate: options.calculationDate,
    };

    const oldState = calculateLegacyLoanFinancialState(input);
    const newState = calculateUnifiedLoanFinancialState(input);

    const base = {
      loanId: loan.id,
      clientId: loan.borrowerId ?? undefined,
      clientName: options.clientNameById?.get(loan.id) ?? loan.borrowerName,
      status: loan.status,

      oldPrincipalRemaining: oldState.principalRemaining,
      newPrincipalRemaining: newState.principalRemaining,
      principalDifference: roundCurrency(newState.principalRemaining - oldState.principalRemaining),

      oldInterestRemaining: oldState.contractualInterestRemaining,
      newInterestRemaining: newState.contractualInterestRemaining,
      interestDifference: roundCurrency(
        newState.contractualInterestRemaining - oldState.contractualInterestRemaining,
      ),

      oldPenaltyPending: oldState.penaltyPending,
      newPenaltyPending: newState.penaltyPending,
      penaltyDifference: roundCurrency(newState.penaltyPending - oldState.penaltyPending),

      oldLateInterestPending: oldState.lateInterestPending,
      newLateInterestPending: newState.lateInterestPending,
      lateInterestDifference: roundCurrency(newState.lateInterestPending - oldState.lateInterestPending),

      oldCurrentInstallmentRemaining: oldState.currentInstallmentRemaining,
      newCurrentInstallmentRemaining: newState.currentInstallmentRemaining,
      installmentDifference: roundCurrency(
        newState.currentInstallmentRemaining - oldState.currentInstallmentRemaining,
      ),

      oldTotalReceivable: oldState.totalReceivable,
      newTotalReceivable: newState.totalReceivable,
      totalDifference: roundCurrency(newState.totalReceivable - oldState.totalReceivable),

      remainingAmountStored: loan.remainingAmount ?? undefined,
      paidInstallmentsStored: loan.paidInstallments ?? undefined,

      calculationSource: newState.calculationSource,
      warnings: newState.warnings,
    };

    const suspectedReason = classify(base, { loan, payments: loanPayments, schedules, newState });
    const absoluteDifference = roundCurrency(
      abs(base.principalDifference)
      + abs(base.interestDifference)
      + abs(base.penaltyDifference)
      + abs(base.lateInterestDifference)
      + abs(base.installmentDifference)
      + abs(base.totalDifference),
    );
    const withReason = { ...base, suspectedReason, absoluteDifference };
    rows.push({ ...withReason, severity: deriveSeverity(withReason, loan.status) });
  }

  return rows;
}

export function summarizeDiagnostics(rows: LoanFinancialDiagnosticRow[]): DiagnosticSummary {
  const byCategory: Record<string, number> = {};
  let withDifference = 0;
  let totalAbsoluteDifference = 0;
  let largestDifference = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let legacyWithoutMetadata = 0;
  let incompleteSchedule = 0;

  for (const row of rows) {
    for (const c of row.suspectedReason) byCategory[c] = (byCategory[c] ?? 0) + 1;
    const isDivergent = abs(row.totalDifference) > EPS
      || abs(row.principalDifference) > EPS
      || abs(row.interestDifference) > EPS
      || abs(row.penaltyDifference) > EPS
      || abs(row.lateInterestDifference) > EPS
      || abs(row.installmentDifference) > EPS;
    if (isDivergent) withDifference += 1;
    // Soma de valores ABSOLUTOS: +200 e −200 resultam em 400, nunca 0.
    totalAbsoluteDifference = roundCurrency(totalAbsoluteDifference + abs(row.totalDifference));
    largestDifference = Math.max(largestDifference, abs(row.totalDifference));
    if (row.severity === "CRITICAL") criticalCount += 1;
    else if (row.severity === "WARNING") warningCount += 1;
    else infoCount += 1;
    if (row.suspectedReason.includes("LEGACY_PAYMENT_WITHOUT_METADATA")) legacyWithoutMetadata += 1;
    if (
      row.suspectedReason.includes("INCOMPLETE_INSTALLMENT_SCHEDULE")
      || row.suspectedReason.includes("MISSING_INSTALLMENT_SCHEDULE")
    ) incompleteSchedule += 1;
  }

  return {
    analyzed: rows.length,
    withoutDifference: rows.length - withDifference,
    withDifference,
    totalAbsoluteDifference,
    largestDifference: roundCurrency(largestDifference),
    criticalCount,
    warningCount,
    infoCount,
    legacyWithoutMetadata,
    incompleteSchedule,
    byCategory,
  };
}

const CSV_COLUMNS: (keyof LoanFinancialDiagnosticRow)[] = [
  "loanId", "clientId", "clientName", "status",
  "oldPrincipalRemaining", "newPrincipalRemaining", "principalDifference",
  "oldInterestRemaining", "newInterestRemaining", "interestDifference",
  "oldPenaltyPending", "newPenaltyPending", "penaltyDifference",
  "oldLateInterestPending", "newLateInterestPending", "lateInterestDifference",
  "oldCurrentInstallmentRemaining", "newCurrentInstallmentRemaining", "installmentDifference",
  "oldTotalReceivable", "newTotalReceivable", "totalDifference",
  "remainingAmountStored", "paidInstallmentsStored",
  "calculationSource", "severity", "suspectedReason", "warnings",
];

export function diagnosticsToCsv(rows: LoanFinancialDiagnosticRow[]): string {
  const escape = (v: unknown) => {
    const s = Array.isArray(v) ? v.join(" | ") : v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = CSV_COLUMNS.join(";");
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => escape(r[c])).join(";"));
  return [header, ...lines].join("\n");
}

export function diagnosticsToJson(rows: LoanFinancialDiagnosticRow[]): string {
  return JSON.stringify(rows, null, 2);
}
