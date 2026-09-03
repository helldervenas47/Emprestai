/**
 * ============================================================================
 * SEPARAÇÃO EXPLÍCITA DAS GRANDEZAS FINANCEIRAS (ETAPA 2 — FASES 2.5 a 2.11)
 * ============================================================================
 *
 * A causa raiz da distorção auditada foi a MISTURA de três grandezas
 * diferentes sob o mesmo nome (`calculatedRemainingAmount`):
 *
 *   1. `LoanContractState`  — o que o contrato PREVIA (principal + juros
 *      contratuais). Não inclui multa, juros de ciclo, encargos, renegociação
 *      nem eventos extraordinários.
 *   2. `LoanLedgerState`    — o estado CONSOLIDADO OFICIAL salvo em
 *      `public.loans` (`remaining_amount`, `paid_installments`). É a verdade.
 *   3. `LoanDiagnostics`    — a COMPARAÇÃO entre os dois. Divergência aqui
 *      NÃO significa erro: significa que as grandezas são diferentes ou que o
 *      histórico é insuficiente para reconstrução determinística.
 *
 * `LoanBackfillEligibility` é uma quarta camada, independente e conservadora:
 * divergência sozinha nunca autoriza escrita.
 *
 * Módulo 100% puro (sem I/O) e somente leitura.
 */

import { roundCurrency } from "@/lib/money";
import type { Payment } from "@/types/loan";

/** Tolerância financeira única (R$ 0,01). */
export const LOAN_STATE_TOLERANCE = 0.01;

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ==========================================================================
 * FASE 2.9 — CLASSIFICAÇÃO DE PAGAMENTOS
 * ========================================================================== */

export type PaymentKind =
  | "REGULAR_INSTALLMENT"
  | "INTEREST_ONLY"
  | "PARTIAL_PAYMENT"
  | "EXTRA_INTEREST_OR_PENALTY"
  | "PRINCIPAL_AMORTIZATION"
  | "UNKNOWN";

/**
 * Precedência obrigatória (FASE 2.9):
 *   1. PERSISTED            — valores persistidos e validados;
 *   2. METADATA             — metadata explícita (sem allocation_version);
 *   3. OPERATION_TYPE       — `metadata.kind` (multa, juros de mora…);
 *   4. INSTALLMENT_NUMBER   — apenas DIAGNÓSTICO;
 *   5. NONE                 — nada conhecido.
 *
 * Os níveis 4 e 5 NUNCA podem sobrescrever o estado consolidado do contrato.
 */
export type AllocationSource =
  | "PERSISTED"
  | "METADATA"
  | "OPERATION_TYPE"
  | "INSTALLMENT_NUMBER"
  | "NONE";

export const LEGACY_NON_DETERMINISTIC_CODE = "LEGACY_ALLOCATION_NON_DETERMINISTIC";
export const INVALID_PERSISTED_ALLOCATION_CODE = "PERSISTED_ALLOCATION_INVALID";
export const UNKNOWN_PAYMENT_TYPE_CODE = "UNKNOWN_PAYMENT_TYPE";

export interface PaymentClassification {
  paymentId: string;
  amount: number;
  installmentNumber: number;
  kind: PaymentKind;
  allocationSource: AllocationSource;
  allocationVersion: number | null;
  principalAmount: number | null;
  interestAmount: number | null;
  penaltyAmount: number | null;
  lateInterestAmount: number | null;
  /** A composição do pagamento é conhecida sem inferência. */
  deterministic: boolean;
  /** Alocação persistida existe mas é inválida (negativa ou soma ≠ valor). */
  invalidAllocation: boolean;
  diagnosticCodes: string[];
}

export function kindFromInstallmentNumber(installmentNumber: number): PaymentKind {
  if (!Number.isFinite(installmentNumber)) return "UNKNOWN";
  if (installmentNumber >= 1) return "REGULAR_INSTALLMENT";
  if (installmentNumber === 0) return "INTEREST_ONLY";
  if (installmentNumber === -1) return "PARTIAL_PAYMENT";
  if (installmentNumber === -2) return "EXTRA_INTEREST_OR_PENALTY";
  if (installmentNumber === -3) return "PRINCIPAL_AMORTIZATION";
  return "UNKNOWN";
}

/**
 * FASE 2.7 — valida a alocação persistida ANTES de usá-la.
 * Nunca corrige silenciosamente; apenas informa.
 */
export function validatePersistedAllocation(
  amount: number,
  parts: { principal: number | null; interest: number | null; penalty: number | null; lateInterest: number | null },
  tolerance = LOAN_STATE_TOLERANCE,
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const p = parts.principal ?? 0;
  const i = parts.interest ?? 0;
  const pen = parts.penalty ?? 0;
  const late = parts.lateInterest ?? 0;
  if (p < 0) reasons.push("principal_amount negativo");
  if (i < 0) reasons.push("interest_amount negativo");
  if (pen < 0) reasons.push("penalty_amount negativo");
  if (late < 0) reasons.push("late_interest_amount negativo");
  const sum = roundCurrency(p + i + pen + late);
  if (Math.abs(roundCurrency(sum - roundCurrency(amount))) > tolerance) {
    reasons.push(
      `soma das alocações (R$ ${sum.toFixed(2)}) diverge do valor pago (R$ ${roundCurrency(amount).toFixed(2)})`,
    );
  }
  return { valid: reasons.length === 0, reasons };
}

/**
 * Classificação diagnóstica de um pagamento. NÃO recalcula composição de
 * pagamentos modernos e NÃO infere composição de pagamentos legados.
 */
export function classifyPayment(payment: Payment): PaymentClassification {
  const amount = roundCurrency(Math.max(0, Number(payment.amount) || 0));
  const md = (payment.metadata ?? null) as Record<string, any> | null;
  const installmentNumber = Number(payment.installmentNumber);
  const kind = kindFromInstallmentNumber(installmentNumber);
  const allocationVersion = num(md?.allocation_version);

  const principal = num(md?.principal_amount);
  const interest = num(md?.interest_amount);
  const penalty = num(md?.penalty_amount);
  const lateInterest = num(md?.late_interest_amount);
  const hasPersistedParts =
    principal != null || interest != null || penalty != null || lateInterest != null;

  const base = {
    paymentId: payment.id,
    amount,
    installmentNumber,
    kind,
    allocationVersion,
    principalAmount: principal,
    interestAmount: interest,
    penaltyAmount: penalty,
    lateInterestAmount: lateInterest,
  };

  if (hasPersistedParts) {
    const check = validatePersistedAllocation(amount, {
      principal,
      interest,
      penalty,
      lateInterest,
    });
    const source: AllocationSource = allocationVersion != null ? "PERSISTED" : "METADATA";
    if (!check.valid) {
      return {
        ...base,
        allocationSource: source,
        deterministic: false,
        invalidAllocation: true,
        diagnosticCodes: [INVALID_PERSISTED_ALLOCATION_CODE, ...check.reasons],
      };
    }
    return {
      ...base,
      allocationSource: source,
      deterministic: true,
      invalidAllocation: false,
      diagnosticCodes: kind === "UNKNOWN" ? [UNKNOWN_PAYMENT_TYPE_CODE] : [],
    };
  }

  // 3) Tipo de operação declarado (multa / juros de mora) — encargo puro,
  //    porém sem alocação persistida: continua NÃO determinístico para fins de
  //    reconstrução do estado consolidado.
  const opKind = typeof md?.kind === "string" ? md.kind : null;
  const isCharge = opKind === "penalty" || opKind === "late_fee" || opKind === "late_interest";

  return {
    ...base,
    allocationSource: isCharge ? "OPERATION_TYPE" : kind === "UNKNOWN" ? "NONE" : "INSTALLMENT_NUMBER",
    deterministic: false,
    invalidAllocation: false,
    diagnosticCodes: [
      LEGACY_NON_DETERMINISTIC_CODE,
      ...(kind === "UNKNOWN" ? [UNKNOWN_PAYMENT_TYPE_CODE] : []),
    ],
  };
}

export interface PaymentClassificationSummary {
  classifications: PaymentClassification[];
  kinds: PaymentKind[];
  total: number;
  withPersistedAllocation: number;
  legacyWithoutAllocation: number;
  invalidAllocations: number;
  unknownTypes: number;
  deterministic: boolean;
}

export function classifyPayments(payments: Payment[]): PaymentClassificationSummary {
  const classifications = payments.map(classifyPayment);
  const kinds = Array.from(new Set(classifications.map((c) => c.kind)));
  const withPersistedAllocation = classifications.filter(
    (c) => c.allocationSource === "PERSISTED" || c.allocationSource === "METADATA",
  ).length;
  const invalidAllocations = classifications.filter((c) => c.invalidAllocation).length;
  const legacyWithoutAllocation = classifications.filter(
    (c) => c.allocationSource === "INSTALLMENT_NUMBER" || c.allocationSource === "OPERATION_TYPE"
      || c.allocationSource === "NONE",
  ).length;
  return {
    classifications,
    kinds,
    total: classifications.length,
    withPersistedAllocation,
    legacyWithoutAllocation,
    invalidAllocations,
    unknownTypes: classifications.filter((c) => c.kind === "UNKNOWN").length,
    deterministic: classifications.length > 0 && classifications.every((c) => c.deterministic),
  };
}

/* ==========================================================================
 * FASE 2.10 — CONTAGEM DIAGNÓSTICA DE PARCELAS QUITADAS
 * ========================================================================== */

export interface SchedulePlanEntry {
  installmentNumber: number;
  dueAmount: number;
}

/**
 * Conta parcelas REGULARES efetivamente quitadas. Nunca usa
 * `currentInstallmentNumber - 1`.
 *
 * Pagamentos `0`, `-1`, `-2` e `-3` (juros, parcial, multa/juros avulsos,
 * amortização) NUNCA avançam o contador. O resultado é DIAGNÓSTICO: o valor
 * oficial permanece sendo `public.loans.paid_installments`.
 */
export function countDeterministicPaidInstallments(
  payments: Payment[],
  plan: SchedulePlanEntry[],
  tolerance = LOAN_STATE_TOLERANCE,
): { count: number; deterministic: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!plan.length) {
    return { count: 0, deterministic: false, reasons: ["cronograma de parcelas indisponível"] };
  }
  const paidByInstallment = new Map<number, number>();
  for (const p of payments) {
    const n = Number(p.installmentNumber);
    if (!Number.isFinite(n) || n < 1) continue; // 0, -1, -2, -3 nunca contam
    paidByInstallment.set(n, roundCurrency((paidByInstallment.get(n) ?? 0) + (Number(p.amount) || 0)));
  }
  let count = 0;
  for (const entry of plan) {
    const paid = paidByInstallment.get(entry.installmentNumber) ?? 0;
    if (roundCurrency(entry.dueAmount - paid) <= tolerance) count += 1;
  }
  const unplanned = [...paidByInstallment.keys()].filter(
    (n) => !plan.some((e) => e.installmentNumber === n),
  );
  if (unplanned.length) {
    reasons.push(`pagamentos em parcelas fora do cronograma: ${unplanned.join(", ")}`);
  }
  return { count, deterministic: reasons.length === 0, reasons };
}

/* ==========================================================================
 * FASE 2.5 — OS TRÊS ESTADOS
 * ========================================================================== */

/** 1. Estado CONTRATUAL — exclusivamente o que o contrato previa. */
export interface LoanContractState {
  loanId: string;
  originalPrincipal: number;
  contractualInterestTotal: number;
  contractualTotal: number;
  expectedInstallments: number;
  /** Saldo contratual TEÓRICO (principal + juros contratuais em aberto). */
  contractualRemainingAmount: number;
  /** Explicitamente fora deste estado. */
  excludes: readonly string[];
}

export const CONTRACT_STATE_EXCLUDES = [
  "multa",
  "juros recorrentes / de ciclo",
  "encargos",
  "renegociação",
  "eventos extraordinários",
] as const;

export function buildLoanContractState(input: {
  loanId: string;
  originalPrincipal: number;
  contractualInterestTotal: number;
  expectedInstallments: number;
  contractualRemainingAmount: number;
}): LoanContractState {
  return {
    loanId: input.loanId,
    originalPrincipal: roundCurrency(input.originalPrincipal),
    contractualInterestTotal: roundCurrency(input.contractualInterestTotal),
    contractualTotal: roundCurrency(input.originalPrincipal + input.contractualInterestTotal),
    expectedInstallments: Math.max(0, Math.trunc(input.expectedInstallments || 0)),
    contractualRemainingAmount: roundCurrency(input.contractualRemainingAmount),
    excludes: CONTRACT_STATE_EXCLUDES,
  };
}

/** 2. Estado CONSOLIDADO OFICIAL — a verdade salva em `public.loans`. */
export interface LoanLedgerState {
  loanId: string;
  /** `public.loans.remaining_amount` — OFICIAL. */
  officialRemainingAmount: number | null;
  /** `public.loans.paid_installments` — OFICIAL. */
  officialPaidInstallments: number | null;
  source: "public.loans";
  authoritative: true;
  /** Reconstrução a partir do histórico — apenas informativa. */
  reconstructedLedgerAmount: number | null;
  reconstructionDeterministic: boolean;
}

export function buildLoanLedgerState(input: {
  loanId: string;
  officialRemainingAmount: number | null | undefined;
  officialPaidInstallments: number | null | undefined;
  reconstructedLedgerAmount?: number | null;
  reconstructionDeterministic?: boolean;
}): LoanLedgerState {
  return {
    loanId: input.loanId,
    officialRemainingAmount:
      input.officialRemainingAmount == null ? null : roundCurrency(input.officialRemainingAmount),
    officialPaidInstallments:
      input.officialPaidInstallments == null ? null : Math.trunc(input.officialPaidInstallments),
    source: "public.loans",
    authoritative: true,
    reconstructedLedgerAmount:
      input.reconstructedLedgerAmount == null ? null : roundCurrency(input.reconstructedLedgerAmount),
    reconstructionDeterministic: Boolean(input.reconstructionDeterministic),
  };
}

/** 3. DIAGNÓSTICO — compara sem assumir que divergência é erro. */
export type DiagnosticMeaning =
  | "contratual"
  | "reconstruido"
  | "estimado"
  | "consolidado";

export interface DiagnosticComparison {
  metric: string;
  officialValue: number | null;
  comparedValue: number | null;
  comparedMeaning: DiagnosticMeaning;
  difference: number;
  /** A diferença tem explicação conhecida (grandezas distintas, legado etc.). */
  explained: boolean;
  explanation: string;
}

export type LoanRiskClass = "LOW" | "MEDIUM" | "HIGH";

export interface LoanDiagnostics {
  loanId: string;
  comparisons: DiagnosticComparison[];
  paymentKinds: PaymentKind[];
  hasLegacyPayments: boolean;
  hasPersistedAllocation: boolean;
  hasInvalidAllocation: boolean;
  deterministicReconstruction: boolean;
  legacyAllocationMissing: boolean;
  insufficientHistory: boolean;
  blockingReasons: string[];
  riskClass: LoanRiskClass;
}

/** 4. ELEGIBILIDADE — camada independente e conservadora (FASE 2.11). */
export interface LoanBackfillEligibility {
  loanId: string;
  decision: "BLOCKED" | "ELIGIBLE";
  eligible: boolean;
  blockingReasons: string[];
}

/**
 * Divergência sozinha NUNCA autoriza escrita. Só há liberação quando todos os
 * componentes são determinísticos, os valores persistidos são válidos, não há
 * pagamento legado e não existe divergência sem explicação.
 */
export function evaluateLoanBackfillEligibility(
  diagnostics: LoanDiagnostics,
  options: { safeMode?: boolean } = {},
): LoanBackfillEligibility {
  const blockingReasons = [...diagnostics.blockingReasons];
  if (options.safeMode !== false) {
    blockingReasons.unshift("modo seguro ativo: nenhuma escrita é autorizada");
  }
  return {
    loanId: diagnostics.loanId,
    decision: blockingReasons.length ? "BLOCKED" : "ELIGIBLE",
    eligible: blockingReasons.length === 0,
    blockingReasons,
  };
}

/* ==========================================================================
 * FASE 2.6 — CONSTRUÇÃO DO DIAGNÓSTICO
 * ========================================================================== */

export interface BuildLoanDiagnosticsInput {
  contract: LoanContractState;
  ledger: LoanLedgerState;
  paymentSummary: PaymentClassificationSummary;
  /** Contagem diagnóstica de parcelas quitadas (nunca oficial). */
  paidInstallments: { count: number; deterministic: boolean; reasons: string[] };
  /** Sinalizadores estruturais já detectados pela validação real. */
  structural?: {
    renegotiated?: boolean;
    incompleteSchedule?: boolean;
    duplicatePayments?: boolean;
    negativeBalance?: boolean;
    settledWithBalance?: boolean;
    principalOverpaid?: boolean;
  };
}

/**
 * Compara o CONTRATUAL com o CONSOLIDADO OFICIAL e explica a diferença.
 * Divergência aqui é INFORMAÇÃO — nunca autorização de escrita.
 */
export function buildLoanDiagnostics(input: BuildLoanDiagnosticsInput): LoanDiagnostics {
  const { contract, ledger, paymentSummary, paidInstallments, structural = {} } = input;

  const hasLegacyPayments = paymentSummary.legacyWithoutAllocation > 0;
  const hasInvalidAllocation = paymentSummary.invalidAllocations > 0;
  const hasPersistedAllocation = paymentSummary.withPersistedAllocation > 0;
  const legacyAllocationMissing = hasLegacyPayments;

  const deterministicReconstruction =
    paymentSummary.total > 0
    && paymentSummary.deterministic
    && paidInstallments.deterministic
    && !hasInvalidAllocation
    && !structural.renegotiated
    && !structural.incompleteSchedule
    && !structural.duplicatePayments;

  const amountDiff =
    ledger.officialRemainingAmount == null
      ? 0
      : roundCurrency(contract.contractualRemainingAmount - ledger.officialRemainingAmount);
  const installmentsDiff =
    ledger.officialPaidInstallments == null
      ? 0
      : paidInstallments.count - ledger.officialPaidInstallments;

  const amountExplanation = deterministicReconstruction
    ? "Grandezas distintas: saldo contratual (principal + juros contratuais) × saldo consolidado oficial, que pode incluir multa, juros de ciclo e renegociação."
    : "Histórico insuficiente para reconstrução determinística (pagamentos legados sem alocação persistida). A diferença não indica erro do estado oficial.";

  const comparisons: DiagnosticComparison[] = [
    {
      metric: "remaining_amount",
      officialValue: ledger.officialRemainingAmount,
      comparedValue: contract.contractualRemainingAmount,
      comparedMeaning: "contratual",
      difference: amountDiff,
      explained: true,
      explanation: amountExplanation,
    },
    {
      metric: "paid_installments",
      officialValue: ledger.officialPaidInstallments,
      comparedValue: paidInstallments.count,
      comparedMeaning: paidInstallments.deterministic ? "reconstruido" : "estimado",
      difference: installmentsDiff,
      explained: true,
      explanation: paidInstallments.deterministic
        ? "Contagem derivada de parcelas regulares efetivamente quitadas; pagamentos de juros, parciais, multa e amortização não avançam o contador."
        : `Contagem não determinística: ${paidInstallments.reasons.join("; ") || "cronograma insuficiente"}.`,
    },
  ];

  const blockingReasons: string[] = [];
  if (!deterministicReconstruction) {
    blockingReasons.push("reconstrução não determinística a partir do histórico");
  }
  if (legacyAllocationMissing) {
    blockingReasons.push("pagamentos legados sem alocação persistida (allocation_version ausente)");
  }
  if (hasInvalidAllocation) {
    blockingReasons.push("alocação persistida inválida em ao menos um pagamento");
  }
  if (paymentSummary.unknownTypes > 0) {
    blockingReasons.push("pagamento com tipo desconhecido");
  }
  if (structural.renegotiated) blockingReasons.push("contrato renegociado");
  if (structural.incompleteSchedule) blockingReasons.push("cronograma de parcelas incompleto");
  if (structural.duplicatePayments) blockingReasons.push("pagamentos possivelmente duplicados");
  if (structural.negativeBalance) blockingReasons.push("saldo negativo detectado");
  if (structural.settledWithBalance) blockingReasons.push("contrato quitado com saldo remanescente");
  if (structural.principalOverpaid) blockingReasons.push("principal pago acima do emprestado");
  if (ledger.officialRemainingAmount == null || ledger.officialPaidInstallments == null) {
    blockingReasons.push("estado consolidado oficial ausente");
  }

  const insufficientHistory = !deterministicReconstruction;
  const magnitude = Math.abs(amountDiff);
  const riskClass: LoanRiskClass =
    structural.negativeBalance || structural.principalOverpaid || hasInvalidAllocation
      ? "HIGH"
      : magnitude > LOAN_STATE_TOLERANCE || installmentsDiff !== 0
        ? "MEDIUM"
        : "LOW";

  return {
    loanId: contract.loanId,
    comparisons,
    paymentKinds: paymentSummary.kinds,
    hasLegacyPayments,
    hasPersistedAllocation,
    hasInvalidAllocation,
    deterministicReconstruction,
    legacyAllocationMissing,
    insufficientHistory,
    blockingReasons,
    riskClass,
  };
}
