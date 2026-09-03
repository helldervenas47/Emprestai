/**
 * ============================================================================
 * VALIDAÇÃO COM DADOS REAIS + CLASSIFICAÇÃO OPERACIONAL (FASE 4)
 * ============================================================================
 *
 * SOMENTE LEITURA. Para cada contrato real, executa a regra legada e a regra
 * unificada, compara com os caches persistidos (`remaining_amount`,
 * `paid_installments`) e devolve uma classificação operacional que autoriza
 * (ou barra) a ativação da flag e a elegibilidade para backfill de cache.
 *
 * Nada aqui escreve, corrige ou recalcula dados no banco.
 */

import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { roundCurrency } from "@/lib/money";
import {
  calculateLegacyLoanFinancialState,
  calculateUnifiedLoanFinancialState,
} from "@/features/loans/lib/loanFinancialAdapter";
import { UNIFIED_FINANCIAL_VERSION } from "@/features/financial/lib/financialVersion";
import {
  buildLoanContractState,
  buildLoanDiagnostics,
  buildLoanLedgerState,
  classifyPayments,
  countDeterministicPaidInstallments,
  type LoanContractState,
  type LoanDiagnostics,
  type LoanLedgerState,
} from "@/features/financial/lib/loanStateModel";


export const OPERATIONAL_CLASSES = [
  "SAFE_TO_ENABLE",
  "SAFE_WITH_LEGACY_FALLBACK",
  "CACHE_ONLY_DIVERGENCE",
  "REQUIRES_MANUAL_REVIEW",
  "HISTORICAL_DATA_INCONSISTENCY",
  "POSSIBLE_CALCULATION_DEFECT",
  "BLOCKED_FROM_MIGRATION",
] as const;

export type OperationalClass = (typeof OPERATIONAL_CLASSES)[number];
export type ValidationSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface RealLoanValidationRow {
  loanId: string;
  clientId?: string;
  clientName?: string;

  loanStatus?: string;
  createdAt?: string;
  contractDate?: string;
  dueDate?: string;

  originalPrincipal: number;
  contractualTotal: number;
  installmentCount?: number;

  paymentsCount: number;
  paymentsWithMetadata: number;
  paymentsWithoutMetadata: number;

  storedRemainingAmount?: number;
  calculatedRemainingAmount: number;
  remainingAmountDifference: number;

  storedPaidInstallments?: number;
  calculatedPaidInstallments: number;
  paidInstallmentsDifference: number;

  legacyTotalReceivable: number;
  unifiedTotalReceivable: number;
  totalDifference: number;

  unifiedPrincipalRemaining: number;
  unifiedInterestRemaining: number;
  unifiedPenaltyPending: number;
  unifiedLateInterestPending: number;

  /**
   * ETAPA 2 — grandezas separadas. `contractState` é o previsto no contrato,
   * `ledgerState` é o CONSOLIDADO OFICIAL (`public.loans`) e `diagnostics`
   * apenas compara os dois, sem tratar divergência como erro.
   */
  contractState: LoanContractState;
  ledgerState: LoanLedgerState;
  diagnostics: LoanDiagnostics;
  /** Atalhos legíveis (`calculatedRemainingAmount` é CONTRATUAL, não oficial). */
  officialRemainingAmount: number | null;
  officialPaidInstallments: number | null;
  contractualRemainingAmount: number;
  deterministicReconstruction: boolean;
  legacyAllocationMissing: boolean;
  blockingReasons: string[];

  calculationSource: string;

  categories: string[];
  classification: OperationalClass;
  severity: ValidationSeverity;
  warnings: string[];
  recommendedAction: string;
  /** Marcadores usados pelos filtros e pelo checklist de prontidão. */
  flags: {
    hasNegativeBalance: boolean;
    settledWithBalance: boolean;
    duplicatePayments: boolean;
    principalOverpaid: boolean;
    allocationMismatch: boolean;
    incompleteSchedule: boolean;
    missingMetadata: boolean;
    renegotiated: boolean;
    cacheDivergence: boolean;
    /** A diferença legado × unificado é integralmente explicada pelo cache. */
    cacheExplainsDifference: boolean;
  };
}

const EPS = 0.01;
const abs = (n: number) => Math.abs(roundCurrency(n));

function paymentMetadata(payment: Payment): Record<string, any> | null {
  return ((payment as any).metadata ?? null) as Record<string, any> | null;
}

function hasAllocationMetadata(payment: Payment): boolean {
  const md = paymentMetadata(payment);
  return Boolean(md && (md.principal_amount != null || md.interest_amount != null));
}

/** Duplicidade provável: mesma parcela, mesmo valor e mesma data. */
export function detectDuplicatePayments(payments: Payment[]): boolean {
  const seen = new Set<string>();
  for (const p of payments) {
    const key = `${p.installmentNumber}|${roundCurrency(Number(p.amount) || 0)}|${String(p.date ?? "").slice(0, 10)}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/** Soma das alocações persistidas nunca pode exceder o valor do pagamento. */
export function detectAllocationMismatch(payments: Payment[]): boolean {
  return payments.some((p) => {
    const md = paymentMetadata(p);
    if (!md || (md.principal_amount == null && md.interest_amount == null)) return false;
    const sum = ["principal_amount", "interest_amount", "penalty_amount", "late_interest_amount"]
      .reduce((s, k) => s + (Number(md[k]) || 0), 0);
    return abs(sum - (Number(p.amount) || 0)) > 0.05;
  });
}

function calculatedPaidInstallmentsOf(
  state: ReturnType<typeof calculateUnifiedLoanFinancialState>,
  loan: Loan,
): number {
  const total = Math.max(1, Math.floor(Number(loan.installments) || 1));
  if (state.totalReceivable <= EPS) return total;
  if (state.currentInstallmentNumber == null) return total;
  return Math.max(0, Math.min(total, state.currentInstallmentNumber - 1));
}

function classifyRow(
  row: Omit<RealLoanValidationRow, "classification" | "severity" | "recommendedAction">,
): { classification: OperationalClass; severity: ValidationSeverity; recommendedAction: string } {
  const f = row.flags;
  const maxFinancialDiff = Math.max(abs(row.totalDifference));

  if (f.hasNegativeBalance || f.settledWithBalance || f.duplicatePayments || f.principalOverpaid || f.allocationMismatch) {
    return {
      classification: "BLOCKED_FROM_MIGRATION",
      severity: "CRITICAL",
      recommendedAction: "Bloquear migração e backfill; revisar histórico manualmente antes de qualquer ativação.",
    };
  }

  if (row.unifiedPrincipalRemaining > row.originalPrincipal + EPS) {
    return {
      classification: "POSSIBLE_CALCULATION_DEFECT",
      severity: "CRITICAL",
      recommendedAction: "Investigar defeito de cálculo: principal restante acima do valor emprestado.",
    };
  }

  if (f.incompleteSchedule || f.renegotiated) {
    return {
      classification: "REQUIRES_MANUAL_REVIEW",
      severity: maxFinancialDiff > EPS ? "WARNING" : "INFO",
      recommendedAction: f.renegotiated
        ? "Revisar manualmente: contrato renegociado não entra em backfill automático."
        : "Revisar manualmente: cronograma de parcelas incompleto ou ausente.",
    };
  }

  if (f.cacheDivergence && f.cacheExplainsDifference) {
    return {
      classification: "CACHE_ONLY_DIVERGENCE",
      severity: "WARNING",
      recommendedAction: "Elegível ao backfill de cache (remaining_amount / paid_installments) após aprovação.",
    };
  }

  if (maxFinancialDiff > 10) {
    return {
      classification: "REQUIRES_MANUAL_REVIEW",
      severity: "CRITICAL",
      recommendedAction: "Diferença material entre regras: revisar contrato antes de ativar a flag.",
    };
  }

  if (maxFinancialDiff > EPS) {
    if (f.missingMetadata) {
      return {
        classification: "SAFE_WITH_LEGACY_FALLBACK",
        severity: "WARNING",
        recommendedAction: "Diferença não material com fallback legado de alocação; ativação liberada com monitoramento.",
      };
    }
    return {
      classification: "HISTORICAL_DATA_INCONSISTENCY",
      severity: "WARNING",
      recommendedAction: "Diferença pequena de origem histórica: documentar e monitorar após ativação.",
    };
  }

  if (f.cacheDivergence) {
    return {
      classification: "CACHE_ONLY_DIVERGENCE",
      severity: "WARNING",
      recommendedAction: "Elegível ao backfill de cache (remaining_amount / paid_installments) após aprovação.",
    };
  }

  if (f.missingMetadata) {
    return {
      classification: "SAFE_WITH_LEGACY_FALLBACK",
      severity: "INFO",
      recommendedAction: "Pagamentos antigos sem metadata; fallback legado reproduz o comportamento esperado.",
    };
  }

  return {
    classification: "SAFE_TO_ENABLE",
    severity: "INFO",
    recommendedAction: "Nenhuma ação: paridade dentro de R$ 0,01.",
  };
}

export interface RealValidationOptions {
  calculationDate?: string;
  clientNameById?: Map<string, string>;
  /** Cronogramas esperados por contrato quando `installments >= 2`. */
  renegotiatedLoanIds?: Set<string>;
}

export function buildRealLoanValidation(
  loans: Loan[],
  payments: Payment[],
  schedules: InstallmentSchedule[] = [],
  options: RealValidationOptions = {},
): RealLoanValidationRow[] {
  const rows: RealLoanValidationRow[] = [];

  for (const loan of loans) {
    const loanPayments = payments.filter((p) => p.loanId === loan.id);
    const input = {
      loan,
      payments: loanPayments,
      installmentSchedules: schedules,
      calculationDate: options.calculationDate,
    };
    const legacy = calculateLegacyLoanFinancialState(input);
    const unified = calculateUnifiedLoanFinancialState(input);

    const installmentCount = Math.max(1, Math.floor(Number(loan.installments) || 1));
    const scheduleRows = schedules.filter((s) => s.loanId === loan.id);
    const withMetadata = loanPayments.filter(hasAllocationMetadata).length;
    const calculatedPaidInstallments = calculatedPaidInstallmentsOf(unified, loan);
    const storedRemaining = loan.remainingAmount ?? undefined;
    const storedPaid = loan.paidInstallments ?? undefined;

    const calculatedRemainingAmount = roundCurrency(unified.contractualBalanceRemaining);
    const remainingAmountDifference = storedRemaining == null
      ? 0
      : roundCurrency(calculatedRemainingAmount - storedRemaining);
    const paidInstallmentsDifference = storedPaid == null ? 0 : calculatedPaidInstallments - storedPaid;

    const isSettled = loan.status === "paid" || (loan.status as string) === "completed";
    const flags = {
      hasNegativeBalance: unified.totalReceivable < -EPS || unified.principalRemaining < -EPS,
      settledWithBalance: isSettled && unified.totalReceivable > EPS,
      duplicatePayments: detectDuplicatePayments(loanPayments),
      principalOverpaid: unified.principalPaid > unified.originalPrincipal + EPS,
      allocationMismatch: detectAllocationMismatch(loanPayments),
      incompleteSchedule: installmentCount >= 2 && scheduleRows.length < installmentCount,
      missingMetadata: withMetadata < loanPayments.length,
      renegotiated: Boolean(
        options.renegotiatedLoanIds?.has(loan.id)
        || (loan as any).status === "renegotiated"
        || Number((loan as any).renegotiationCount ?? 0) > 0,
      ),
      cacheDivergence: abs(remainingAmountDifference) > EPS || Math.abs(paidInstallmentsDifference) > 0,
      cacheExplainsDifference: false,
    };
    // A regra legada lê `remaining_amount`; quando a diferença total tem a MESMA
    // magnitude da divergência de cache, o cálculo em si está consistente.
    const totalDiffPreview = roundCurrency(unified.totalReceivable - legacy.totalReceivable);
    flags.cacheExplainsDifference = abs(remainingAmountDifference) > EPS
      && abs(abs(totalDiffPreview) - abs(remainingAmountDifference)) <= 0.5;

    // ------------------------------------------------------------------
    // ETAPA 2 — os três estados, explicitamente separados.
    // ------------------------------------------------------------------
    const contractState = buildLoanContractState({
      loanId: loan.id,
      originalPrincipal: unified.originalPrincipal,
      contractualInterestTotal: unified.contractualInterestTotal,
      expectedInstallments: installmentCount,
      contractualRemainingAmount: calculatedRemainingAmount,
    });
    const paymentSummary = classifyPayments(loanPayments);
    const planEntries = scheduleRows
      .map((s) => ({ installmentNumber: s.installmentNumber, dueAmount: Number(s.amount) || 0 }))
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    const deterministicPaid = countDeterministicPaidInstallments(loanPayments, planEntries);
    const ledgerState = buildLoanLedgerState({
      loanId: loan.id,
      officialRemainingAmount: storedRemaining ?? null,
      officialPaidInstallments: storedPaid ?? null,
      reconstructedLedgerAmount: paymentSummary.deterministic ? calculatedRemainingAmount : null,
      reconstructionDeterministic: paymentSummary.deterministic,
    });
    const diagnostics = buildLoanDiagnostics({
      contract: contractState,
      ledger: ledgerState,
      paymentSummary,
      paidInstallments: deterministicPaid,
      structural: {
        renegotiated: flags.renegotiated,
        incompleteSchedule: flags.incompleteSchedule,
        duplicatePayments: flags.duplicatePayments,
        negativeBalance: flags.hasNegativeBalance,
        settledWithBalance: flags.settledWithBalance,
        principalOverpaid: flags.principalOverpaid,
      },
    });


    const categories: string[] = [];
    if (flags.cacheDivergence) categories.push("CACHE_DIVERGENCE");
    if (flags.missingMetadata) categories.push("MISSING_METADATA");
    if (flags.incompleteSchedule) categories.push("INCOMPLETE_SCHEDULE");
    if (flags.renegotiated) categories.push("RENEGOTIATED");
    if (flags.duplicatePayments) categories.push("DUPLICATE_PAYMENTS");
    if (flags.allocationMismatch) categories.push("ALLOCATION_MISMATCH");
    if (flags.settledWithBalance) categories.push("SETTLED_WITH_BALANCE");
    if (flags.hasNegativeBalance) categories.push("NEGATIVE_BALANCE");
    if (flags.principalOverpaid) categories.push("PRINCIPAL_OVERPAID");
    if (categories.length === 0) categories.push("NONE");

    const base = {
      loanId: loan.id,
      clientId: loan.borrowerId ?? undefined,
      clientName: options.clientNameById?.get(loan.id) ?? loan.borrowerName,

      loanStatus: loan.status,
      createdAt: (loan as any).createdAt ?? undefined,
      contractDate: loan.startDate ?? undefined,
      dueDate: loan.dueDate ?? undefined,

      originalPrincipal: unified.originalPrincipal,
      contractualTotal: roundCurrency(unified.originalPrincipal + unified.contractualInterestTotal),
      installmentCount,

      paymentsCount: loanPayments.length,
      paymentsWithMetadata: withMetadata,
      paymentsWithoutMetadata: loanPayments.length - withMetadata,

      storedRemainingAmount: storedRemaining,
      calculatedRemainingAmount,
      remainingAmountDifference,

      storedPaidInstallments: storedPaid,
      calculatedPaidInstallments,
      paidInstallmentsDifference,

      legacyTotalReceivable: legacy.totalReceivable,
      unifiedTotalReceivable: unified.totalReceivable,
      totalDifference: roundCurrency(unified.totalReceivable - legacy.totalReceivable),

      unifiedPrincipalRemaining: unified.principalRemaining,
      unifiedInterestRemaining: unified.contractualInterestRemaining,
      unifiedPenaltyPending: unified.penaltyPending,
      unifiedLateInterestPending: unified.lateInterestPending,

      calculationSource: `${UNIFIED_FINANCIAL_VERSION} · ${unified.calculationSource}`,
      categories,
      warnings: unified.warnings,
      flags,

      contractState,
      ledgerState,
      diagnostics,
      officialRemainingAmount: ledgerState.officialRemainingAmount,
      officialPaidInstallments: ledgerState.officialPaidInstallments,
      contractualRemainingAmount: contractState.contractualRemainingAmount,
      deterministicReconstruction: diagnostics.deterministicReconstruction,
      legacyAllocationMissing: diagnostics.legacyAllocationMissing,
      blockingReasons: diagnostics.blockingReasons,
    };


    rows.push({ ...base, ...classifyRow(base) });
  }

  return rows;
}

export interface RealValidationSummary {
  totalContracts: number;
  byClassification: Record<OperationalClass, number>;
  bySeverity: Record<ValidationSeverity, number>;
  totalAbsoluteDifference: number;
  largestDifference: number;
  settledWithBalance: number;
  negativeBalance: number;
  withoutMetadata: number;
  incompleteSchedule: number;
  cacheDivergence: number;
  duplicatePayments: number;
}

export function summarizeRealValidation(rows: RealLoanValidationRow[]): RealValidationSummary {
  const byClassification = OPERATIONAL_CLASSES.reduce((acc, c) => {
    acc[c] = 0;
    return acc;
  }, {} as Record<OperationalClass, number>);
  const bySeverity: Record<ValidationSeverity, number> = { INFO: 0, WARNING: 0, CRITICAL: 0 };

  let totalAbsoluteDifference = 0;
  let largestDifference = 0;
  let settledWithBalance = 0;
  let negativeBalance = 0;
  let withoutMetadata = 0;
  let incompleteSchedule = 0;
  let cacheDivergence = 0;
  let duplicatePayments = 0;

  for (const r of rows) {
    byClassification[r.classification] += 1;
    bySeverity[r.severity] += 1;
    totalAbsoluteDifference = roundCurrency(totalAbsoluteDifference + abs(r.totalDifference));
    largestDifference = Math.max(largestDifference, abs(r.totalDifference));
    if (r.flags.settledWithBalance) settledWithBalance += 1;
    if (r.flags.hasNegativeBalance) negativeBalance += 1;
    if (r.flags.missingMetadata) withoutMetadata += 1;
    if (r.flags.incompleteSchedule) incompleteSchedule += 1;
    if (r.flags.cacheDivergence) cacheDivergence += 1;
    if (r.flags.duplicatePayments) duplicatePayments += 1;
  }

  return {
    totalContracts: rows.length,
    byClassification,
    bySeverity,
    totalAbsoluteDifference,
    largestDifference: roundCurrency(largestDifference),
    settledWithBalance,
    negativeBalance,
    withoutMetadata,
    incompleteSchedule,
    cacheDivergence,
    duplicatePayments,
  };
}

/* ==========================================================================
 * CHECKLIST DE PRONTIDÃO PARA ATIVAÇÃO
 * ========================================================================== */

export interface FinancialRolloutReadiness {
  ready: boolean;
  score: number;
  blockers: string[];
  warnings: string[];
  metrics: {
    totalContracts: number;
    safeContracts: number;
    blockedContracts: number;
    criticalContracts: number;
    parityRate: number;
    cacheDivergenceRate: number;
  };
}

export interface ReadinessOptions {
  /** CRITICAL revisados manualmente (loanIds). */
  reviewedCriticalLoanIds?: Set<string>;
  rollbackTested?: boolean;
  allTestsPassing?: boolean;
}

/**
 * Função pura. Blockers absolutos NUNCA são compensados pelo score:
 * `ready` só é `true` quando `blockers` está vazio.
 */
export function evaluateFinancialRolloutReadiness(
  rows: RealLoanValidationRow[],
  options: ReadinessOptions = {},
): FinancialRolloutReadiness {
  const summary = summarizeRealValidation(rows);
  const total = rows.length;
  const safe = summary.byClassification.SAFE_TO_ENABLE + summary.byClassification.SAFE_WITH_LEGACY_FALLBACK;
  const blocked = summary.byClassification.BLOCKED_FROM_MIGRATION
    + summary.byClassification.POSSIBLE_CALCULATION_DEFECT;
  const inParity = rows.filter((r) => abs(r.totalDifference) <= EPS).length;
  const parityRate = total === 0 ? 1 : inParity / total;
  const cacheDivergenceRate = total === 0 ? 0 : summary.cacheDivergence / total;

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (summary.negativeBalance > 0) blockers.push(`${summary.negativeBalance} contrato(s) com saldo negativo indevido`);
  if (summary.settledWithBalance > 0) blockers.push(`${summary.settledWithBalance} contrato(s) quitado(s) com saldo positivo`);
  if (summary.duplicatePayments > 0) blockers.push(`${summary.duplicatePayments} contrato(s) com possível pagamento duplicado`);
  if (summary.byClassification.POSSIBLE_CALCULATION_DEFECT > 0) {
    blockers.push(`${summary.byClassification.POSSIBLE_CALCULATION_DEFECT} possível defeito de cálculo`);
  }

  const reviewed = options.reviewedCriticalLoanIds ?? new Set<string>();
  const unreviewedCritical = rows.filter((r) => r.severity === "CRITICAL" && !reviewed.has(r.loanId));
  if (unreviewedCritical.length > 0) {
    blockers.push(`${unreviewedCritical.length} contrato(s) CRITICAL sem revisão manual`);
  }

  if (parityRate < 0.99) blockers.push(`Paridade de ${(parityRate * 100).toFixed(2)}% abaixo do mínimo de 99%`);
  if (options.rollbackTested === false) blockers.push("Rollback não testado");
  if (options.allTestsPassing === false) blockers.push("Suite de testes com falhas");

  if (summary.byClassification.REQUIRES_MANUAL_REVIEW > 0) {
    warnings.push(`${summary.byClassification.REQUIRES_MANUAL_REVIEW} contrato(s) em revisão manual`);
  }
  if (summary.withoutMetadata > 0) warnings.push(`${summary.withoutMetadata} contrato(s) com pagamento sem metadata`);
  if (summary.incompleteSchedule > 0) warnings.push(`${summary.incompleteSchedule} contrato(s) com cronograma incompleto`);
  if (summary.cacheDivergence > 0) warnings.push(`${summary.cacheDivergence} contrato(s) com cache divergente`);

  const score = Math.round(
    (total === 0 ? 100 : (safe / total) * 60 + parityRate * 40)
    - Math.min(20, blocked * 5),
  );

  return {
    ready: blockers.length === 0,
    score: Math.max(0, Math.min(100, score)),
    blockers,
    warnings,
    metrics: {
      totalContracts: total,
      safeContracts: safe,
      blockedContracts: blocked,
      criticalContracts: summary.bySeverity.CRITICAL,
      parityRate: Math.round(parityRate * 10000) / 10000,
      cacheDivergenceRate: Math.round(cacheDivergenceRate * 10000) / 10000,
    },
  };
}

/* ==========================================================================
 * AMOSTRAGEM MANUAL OBRIGATÓRIA
 * ========================================================================== */

export type SampleGroup =
  | "NO_PAYMENTS"
  | "PARTIALLY_PAID"
  | "INSTALLMENTS"
  | "INTEREST_PAID"
  | "AMORTIZED"
  | "WITH_PENALTY"
  | "OVERDUE"
  | "RENEGOTIATED"
  | "SETTLED_DIVERGENT"
  | "CRITICAL";

export interface SamplingPlan {
  group: SampleGroup;
  /** Grupos exaustivos ignoram o limite de 10. */
  exhaustive: boolean;
  available: number;
  selected: RealLoanValidationRow[];
}

export function buildSamplingPlan(
  rows: RealLoanValidationRow[],
  payments: Payment[],
): SamplingPlan[] {
  const byLoan = new Map<string, Payment[]>();
  for (const p of payments) {
    const list = byLoan.get(p.loanId) ?? [];
    list.push(p);
    byLoan.set(p.loanId, list);
  }

  const predicate: Record<SampleGroup, (r: RealLoanValidationRow) => boolean> = {
    NO_PAYMENTS: (r) => r.paymentsCount === 0,
    PARTIALLY_PAID: (r) => r.paymentsCount > 0 && r.unifiedTotalReceivable > EPS,
    INSTALLMENTS: (r) => (r.installmentCount ?? 1) > 1,
    INTEREST_PAID: (r) => (byLoan.get(r.loanId) ?? []).some((p) => p.installmentNumber === 0 || p.installmentNumber === -2),
    AMORTIZED: (r) => (byLoan.get(r.loanId) ?? []).some((p) => p.installmentNumber === -3),
    WITH_PENALTY: (r) => r.unifiedPenaltyPending > EPS
      || (byLoan.get(r.loanId) ?? []).some((p) => Number(((p as any).metadata ?? {}).penalty_amount) > 0),
    OVERDUE: (r) => r.unifiedLateInterestPending > EPS,
    RENEGOTIATED: (r) => r.flags.renegotiated,
    SETTLED_DIVERGENT: (r) =>
      (r.loanStatus === "paid" || r.loanStatus === "completed")
      && (r.flags.settledWithBalance || abs(r.totalDifference) > EPS || r.flags.cacheDivergence),
    CRITICAL: (r) => r.severity === "CRITICAL",
  };

  const exhaustiveGroups: SampleGroup[] = ["RENEGOTIATED", "SETTLED_DIVERGENT", "CRITICAL"];

  return (Object.keys(predicate) as SampleGroup[]).map((group) => {
    const matching = rows
      .filter(predicate[group])
      .sort((a, b) => abs(b.totalDifference) - abs(a.totalDifference));
    const exhaustive = exhaustiveGroups.includes(group);
    return {
      group,
      exhaustive,
      available: matching.length,
      selected: exhaustive ? matching : matching.slice(0, 10),
    };
  });
}

/* ==========================================================================
 * EXPORTAÇÃO
 * ========================================================================== */

const CSV_COLUMNS: (keyof RealLoanValidationRow)[] = [
  "loanId", "clientId", "clientName", "loanStatus", "contractDate", "dueDate",
  "originalPrincipal", "contractualTotal", "installmentCount",
  "paymentsCount", "paymentsWithMetadata", "paymentsWithoutMetadata",
  "storedRemainingAmount", "calculatedRemainingAmount", "remainingAmountDifference",
  "storedPaidInstallments", "calculatedPaidInstallments", "paidInstallmentsDifference",
  "legacyTotalReceivable", "unifiedTotalReceivable", "totalDifference",
  "unifiedPrincipalRemaining", "unifiedInterestRemaining",
  "unifiedPenaltyPending", "unifiedLateInterestPending",
  "calculationSource", "classification", "severity", "categories", "warnings", "recommendedAction",
];

export function realValidationToCsv(rows: RealLoanValidationRow[]): string {
  const escape = (v: unknown) => {
    const s = Array.isArray(v) ? v.join(" | ") : v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = CSV_COLUMNS.join(";");
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => escape(r[c])).join(";"));
  return [header, ...lines].join("\n");
}

export function realValidationToJson(rows: RealLoanValidationRow[]): string {
  return JSON.stringify({ calculationVersion: UNIFIED_FINANCIAL_VERSION, rows }, null, 2);
}
