/**
 * ============================================================================
 * ADAPTADOR ÚNICO DA FONTE FINANCEIRA (FASE 2)
 * ============================================================================
 *
 * A feature flag `VITE_USE_UNIFIED_FINANCIAL_CALCULATION` é resolvida AQUI e
 * em nenhum outro lugar. Componentes (aba Empréstimos, Payment Hub) chamam
 * `getLoanFinancialStateForUI` e recebem sempre o MESMO formato
 * (`LoanFinancialState`), independentemente da regra em vigor.
 *
 *   flag OFF (default) → `calculateLegacyLoanFinancialState` — reproduz
 *                        EXATAMENTE os números atuais (loanOutstanding +
 *                        loanLateFees + currentCycleInterest).
 *   flag ON            → `calculateLoanFinancialState` (fonte unificada).
 *
 * Nada aqui escreve no banco, altera histórico ou recalcula persistidos.
 */

import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { roundCurrency } from "@/lib/money";
import {
  calculateLoanFinancialState,
  buildOfficialInstallmentPlan,
  type LoanFinancialState,
} from "@/features/loans/lib/calculateLoanFinancialState";
import { getLoanOutstandingBreakdown } from "@/features/loans/lib/loanOutstanding";
import { getLoanLateFees, getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { getCurrentCycleInterest } from "@/features/loans/lib/currentCycleInterest";
import { useUnifiedFinancialCalculation } from "@/features/financial/lib/financialFlags";

const EPS = 0.01;

export interface LoanFinancialUIInput {
  loan: Loan;
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  calculationDate?: string;
}

export interface LoanFinancialUIState extends LoanFinancialState {
  /** Qual regra produziu este estado. */
  engine: "unified" | "legacy";
}

/** Juros pendentes do ciclo/parcela vigente (nunca o juro total em parcelados). */
export function getCycleInterestForUI(input: LoanFinancialUIInput) {
  const { loan, payments } = input;
  const schedules = input.installmentSchedules ?? [];
  const interestOnly = loan.customInterestValue != null && loan.customInterestValue > 0
    ? loan.customInterestValue
    : (Number(loan.amount) || 0) * ((Number(loan.interestRate) || 0) / 100);
  const interestCyclePartials = payments
    .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
      && (p as any).metadata?.kind === "interest_partial"
      && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const singleCycleInterest = roundCurrency(Math.max(0, interestOnly - interestCyclePartials));

  return getCurrentCycleInterest({ loan, payments, schedules, singleCycleInterest });
}

/**
 * Estado financeiro no formato unificado, calculado com as fórmulas LEGADAS.
 * Existe para que a interface possa consumir um único contrato de dados sem
 * mudar nenhum número enquanto a flag estiver desligada.
 */
export function calculateLegacyLoanFinancialState(input: LoanFinancialUIInput): LoanFinancialUIState {
  const { loan } = input;
  const schedules = input.installmentSchedules ?? [];
  const payments = input.payments.filter((p) => p.loanId === loan.id);
  const isPaid = loan.status === "paid";

  const fees = getLoanLateFees(loan, payments, schedules);
  const cycle = getCycleInterestForUI({ ...input, payments });
  const breakdown = getLoanOutstandingBreakdown({
    loan,
    payments,
    lateInterest: fees.lateInterestTotal,
    penalty: fees.penaltyTotal,
    currentInterestPending: cycle.currentInterestPending,
    schedules,
  });

  const { plan } = buildOfficialInstallmentPlan(loan, schedules);
  const currentEntry = plan.find((e) => e.installmentNumber === cycle.currentInstallmentNumber) ?? null;
  const totalReceivable = roundCurrency(getLoanReceivable(loan, payments, schedules));

  return {
    engine: "legacy",
    loanId: loan.id,
    originalPrincipal: roundCurrency(breakdown.originalPrincipal),

    principalPaid: roundCurrency(breakdown.principalPaid),
    principalRemaining: roundCurrency(breakdown.principalRemaining),

    contractualInterestTotal: roundCurrency(cycle.totalContractInterest),
    contractualInterestPaid: isPaid
      ? roundCurrency(cycle.totalContractInterest)
      : roundCurrency(Math.max(0, cycle.totalContractInterest - breakdown.contractualInterestRemaining)),
    contractualInterestRemaining: roundCurrency(breakdown.contractualInterestRemaining),

    currentInstallmentNumber: isPaid ? null : cycle.currentInstallmentNumber,
    currentInstallmentDue: isPaid || !currentEntry ? 0 : roundCurrency(currentEntry.due),
    currentInstallmentPrincipal: isPaid || !currentEntry ? 0 : roundCurrency(currentEntry.principal),
    currentInstallmentInterest: isPaid ? 0 : roundCurrency(cycle.currentInstallmentInterest),
    currentInstallmentPaid: isPaid ? 0 : roundCurrency(cycle.currentInterestPaid),
    currentInstallmentRemaining: isPaid || !currentEntry
      ? 0
      : roundCurrency(Math.max(0, currentEntry.due - cycle.currentInterestPaid)),

    penaltyApplied: roundCurrency(breakdown.penalty),
    penaltyPaid: 0,
    penaltyPending: roundCurrency(breakdown.penalty),

    lateInterestApplied: roundCurrency(breakdown.lateInterest),
    lateInterestPaid: 0,
    lateInterestPending: roundCurrency(breakdown.lateInterest),

    daysOverdue: fees.daysOverdue,
    overdueAmount: isPaid ? 0 : roundCurrency(breakdown.contractualBalanceRemaining),

    contractualBalanceRemaining: roundCurrency(breakdown.contractualBalanceRemaining),
    totalReceivable,
    payoffAmount: roundCurrency(breakdown.payoffTotal),

    calculationSource: "legacy:loanOutstanding+loanLateFees",
    warnings: [],
  };
}

/** Estado financeiro unificado (flag ligada). */
export function calculateUnifiedLoanFinancialState(input: LoanFinancialUIInput): LoanFinancialUIState {
  const state = calculateLoanFinancialState({
    loan: input.loan,
    payments: input.payments,
    installmentSchedules: input.installmentSchedules,
    calculationDate: input.calculationDate,
  });
  return { ...state, engine: "unified" };
}

/**
 * PONTO ÚNICO de resolução da feature flag. Nenhum componente deve chamar
 * `useUnifiedFinancialCalculation()` diretamente para decidir números.
 */
export function getLoanFinancialStateForUI(
  input: LoanFinancialUIInput,
  overrideUnified?: boolean,
): LoanFinancialUIState {
  const unified = overrideUnified ?? useUnifiedFinancialCalculation();
  return unified ? calculateUnifiedLoanFinancialState(input) : calculateLegacyLoanFinancialState(input);
}

export type LoanFinancialStatus =
  | "em_dia"
  | "parcialmente_pago"
  | "em_atraso"
  | "quitado"
  | "renegociado";

export interface LoanFinancialStatusResult {
  status: LoanFinancialStatus;
  label: string;
  /** Token semântico de cor já usado no app. */
  tone: "primary" | "success" | "warning" | "destructive";
}

const STATUS_LABEL: Record<LoanFinancialStatus, LoanFinancialStatusResult> = {
  em_dia: { status: "em_dia", label: "Em dia", tone: "primary" },
  parcialmente_pago: { status: "parcialmente_pago", label: "Parcialmente pago", tone: "warning" },
  em_atraso: { status: "em_atraso", label: "Em atraso", tone: "destructive" },
  quitado: { status: "quitado", label: "Quitado", tone: "success" },
  renegociado: { status: "renegociado", label: "Renegociado", tone: "primary" },
};

/**
 * Status financeiro DERIVADO do saldo real — nunca de `paidInstallments`
 * isolado nem da simples existência de pagamentos.
 */
export function deriveLoanFinancialStatus(
  state: LoanFinancialState,
  loan: Loan,
  _calculationDate?: string,
): LoanFinancialStatusResult {
  if (state.totalReceivable <= EPS || loan.status === "paid" || state.payoffAmount <= EPS) {
    return STATUS_LABEL.quitado;
  }

  const isOverdue =
    state.daysOverdue > 0 ||
    loan.status === "late" ||
    loan.status === "overdue" ||
    loan.status === "defaulted";

  // Estado persistido de renegociação continua prevalecendo (regra atual do app).
  if ((loan as any).status === "renegotiated" || Number((loan as any).renegotiationCount ?? 0) > 0) {
    if (isOverdue) return STATUS_LABEL.em_atraso;
    return STATUS_LABEL.renegociado;
  }
  if (isOverdue) return STATUS_LABEL.em_atraso;
  if (state.currentInstallmentPaid > EPS && state.currentInstallmentRemaining > EPS) {
    return STATUS_LABEL.parcialmente_pago;
  }
  return STATUS_LABEL.em_dia;
}
