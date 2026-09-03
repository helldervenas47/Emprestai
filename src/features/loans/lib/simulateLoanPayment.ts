/**
 * ============================================================================
 * SIMULAÇÃO PURA DE PAGAMENTO (PRÉVIA ANTES DE REGISTRAR)
 * ============================================================================
 *
 * A prévia exibida na interface e a alocação persistida usam a MESMA função.
 * Nada aqui escreve no banco. Todas as mensagens em português do Brasil.
 */

import { roundCurrency } from "@/lib/money";
import type { LoanFinancialState } from "@/features/loans/lib/calculateLoanFinancialState";

export const CALCULATION_VERSION = "unified_financial_v1";
const EPS = 0.01;

export type LoanPaymentKind =
  | "interest"      // juros do ciclo/parcela atual
  | "installment"   // parcela vigente
  | "partial"       // pagamento parcial do contrato
  | "full"          // saldo total em aberto
  | "payoff"        // quitação
  | "amortize"      // amortização (100% principal)
  | "penalty"       // multa
  | "late_interest";// juros de atraso

export interface LoanPaymentInput {
  kind: LoanPaymentKind;
  amount: number;
  /** Inclui multa + juros de atraso na operação (módulos juros/parcela). */
  includeLateFees?: boolean;
}

export interface LoanPaymentSimulation {
  paymentAmount: number;

  allocatedPrincipal: number;
  allocatedInterest: number;
  allocatedPenalty: number;
  allocatedLateInterest: number;

  projectedPrincipalRemaining: number;
  projectedInterestRemaining: number;
  projectedPenaltyPending: number;
  projectedLateInterestPending: number;
  projectedTotalReceivable: number;

  warnings: string[];
  isValid: boolean;
  validationErrors: string[];
}

const money = (v: number) => `R$ ${roundCurrency(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Limite máximo permitido para cada modalidade, derivado do estado financeiro. */
export function getMaxPaymentAmount(state: LoanFinancialState, kind: LoanPaymentKind, includeLateFees = false): number {
  const fees = includeLateFees ? roundCurrency(state.penaltyPending + state.lateInterestPending) : 0;
  switch (kind) {
    case "amortize":
      return roundCurrency(state.principalRemaining);
    case "interest":
      return roundCurrency(
        Math.min(state.contractualInterestRemaining > 0 ? state.contractualInterestRemaining : Infinity,
          state.currentInstallmentInterest > 0 ? state.currentInstallmentInterest : state.contractualInterestRemaining) + fees,
      );
    case "installment":
      return roundCurrency(state.currentInstallmentRemaining + fees);
    case "penalty":
      return roundCurrency(state.penaltyPending);
    case "late_interest":
      return roundCurrency(state.lateInterestPending);
    case "partial":
    case "full":
    case "payoff":
    default:
      return roundCurrency(state.totalReceivable);
  }
}

/**
 * Alocação oficial de UM pagamento sobre o estado financeiro atual.
 * Ordem para pagamentos genéricos (parcial/total/quitação):
 * juros de atraso → multa → juros contratuais → principal.
 */
export function simulateLoanPayment(
  state: LoanFinancialState,
  input: LoanPaymentInput,
): LoanPaymentSimulation {
  const validationErrors: string[] = [];
  const warnings: string[] = [];
  const raw = Number(input.amount);

  if (!Number.isFinite(raw)) validationErrors.push("Informe um valor numérico válido.");
  const amount = Number.isFinite(raw) ? roundCurrency(raw) : 0;
  if (Number.isFinite(raw) && raw < 0) validationErrors.push("O valor do pagamento não pode ser negativo.");
  if (Number.isFinite(raw) && amount <= 0) validationErrors.push("O valor do pagamento deve ser maior que zero.");
  if (Number.isFinite(raw) && Math.abs(raw - amount) > 0) {
    warnings.push(`Valor normalizado para duas casas decimais: ${money(amount)}.`);
  }
  if (state.totalReceivable <= EPS) {
    validationErrors.push("Este contrato já está quitado e não aceita novos pagamentos.");
  }

  const includeLateFees = input.includeLateFees ?? false;
  const max = getMaxPaymentAmount(state, input.kind, includeLateFees);

  if (validationErrors.length === 0 && Number.isFinite(max) && amount - max > EPS) {
    switch (input.kind) {
      case "amortize":
        validationErrors.push(`O valor da amortização não pode ultrapassar o principal restante de ${money(max)}.`);
        break;
      case "interest":
        validationErrors.push(`O valor não pode ultrapassar os juros pendentes de ${money(max)}.`);
        break;
      case "penalty":
        validationErrors.push(`O valor não pode ultrapassar a multa pendente de ${money(max)}.`);
        break;
      case "late_interest":
        validationErrors.push(`O valor não pode ultrapassar os juros de atraso pendentes de ${money(max)}.`);
        break;
      case "installment":
        validationErrors.push(`O valor não pode ultrapassar o restante da parcela atual de ${money(max)}.`);
        break;
      default:
        validationErrors.push(`O valor não pode ultrapassar o total em aberto de ${money(max)}.`);
    }
  }

  let allocatedPrincipal = 0;
  let allocatedInterest = 0;
  let allocatedPenalty = 0;
  let allocatedLateInterest = 0;
  let rest = validationErrors.length === 0 ? amount : 0;

  const take = (available: number) => {
    const used = roundCurrency(Math.max(0, Math.min(rest, Math.max(0, available))));
    rest = roundCurrency(rest - used);
    return used;
  };

  switch (input.kind) {
    case "amortize":
      allocatedPrincipal = take(state.principalRemaining);
      break;
    case "penalty":
      allocatedPenalty = take(state.penaltyPending);
      break;
    case "late_interest":
      allocatedLateInterest = take(state.lateInterestPending);
      break;
    case "interest": {
      if (includeLateFees) {
        allocatedLateInterest = take(state.lateInterestPending);
        allocatedPenalty = take(state.penaltyPending);
      }
      const interestCap = state.currentInstallmentInterest > 0
        ? Math.min(state.currentInstallmentInterest, Math.max(state.contractualInterestRemaining, state.currentInstallmentInterest))
        : state.contractualInterestRemaining;
      allocatedInterest = take(interestCap);
      break;
    }
    case "installment": {
      if (includeLateFees) {
        allocatedLateInterest = take(state.lateInterestPending);
        allocatedPenalty = take(state.penaltyPending);
      }
      allocatedInterest = take(state.currentInstallmentInterest);
      allocatedPrincipal = take(state.principalRemaining);
      break;
    }
    default: {
      // parcial / total / quitação: encargos primeiro, depois juros, depois principal.
      allocatedLateInterest = take(state.lateInterestPending);
      allocatedPenalty = take(state.penaltyPending);
      allocatedInterest = take(state.contractualInterestRemaining);
      allocatedPrincipal = take(state.principalRemaining);
      break;
    }
  }

  if (rest > EPS) {
    warnings.push(`Sobra de ${money(rest)} sem destino na composição — verifique a modalidade escolhida.`);
  }

  const projectedPrincipalRemaining = roundCurrency(Math.max(0, state.principalRemaining - allocatedPrincipal));
  const projectedInterestRemaining = roundCurrency(Math.max(0, state.contractualInterestRemaining - allocatedInterest));
  const projectedPenaltyPending = roundCurrency(Math.max(0, state.penaltyPending - allocatedPenalty));
  const projectedLateInterestPending = roundCurrency(Math.max(0, state.lateInterestPending - allocatedLateInterest));
  const projectedTotalReceivable = roundCurrency(
    projectedPrincipalRemaining + projectedInterestRemaining + projectedPenaltyPending + projectedLateInterestPending,
  );

  if (projectedTotalReceivable < -EPS) {
    validationErrors.push("O saldo projetado ficaria negativo. Revise o valor informado.");
  }

  return {
    paymentAmount: amount,
    allocatedPrincipal,
    allocatedInterest,
    allocatedPenalty,
    allocatedLateInterest,
    projectedPrincipalRemaining,
    projectedInterestRemaining,
    projectedPenaltyPending,
    projectedLateInterestPending,
    projectedTotalReceivable,
    warnings,
    isValid: validationErrors.length === 0,
    validationErrors,
  };
}

/**
 * Metadata de alocação para NOVOS pagamentos. A soma fecha exatamente com o
 * valor pago (tolerância zero em centavos). Histórico antigo nunca é tocado.
 */
export function buildPaymentAllocationMetadata(simulation: LoanPaymentSimulation) {
  const sum = roundCurrency(
    simulation.allocatedPrincipal
    + simulation.allocatedInterest
    + simulation.allocatedPenalty
    + simulation.allocatedLateInterest,
  );
  const residue = roundCurrency(simulation.paymentAmount - sum);
  return {
    principal_amount: roundCurrency(simulation.allocatedPrincipal + (residue > 0 ? residue : 0)),
    interest_amount: simulation.allocatedInterest,
    penalty_amount: simulation.allocatedPenalty,
    late_interest_amount: simulation.allocatedLateInterest,
    allocation_version: 2,
    calculation_version: CALCULATION_VERSION,
  };
}
