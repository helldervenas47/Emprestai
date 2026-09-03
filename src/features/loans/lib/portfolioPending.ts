/**
 * ============================================================================
 * FONTE ÚNICA DOS INDICADORES DE CARTEIRA (Capital na Rua / Lucro Estimado)
 * ============================================================================
 *
 * Antes desta unificação existiam DUAS metodologias divergentes:
 *
 *  - Dashboard: `capitalOnStreet` = Σ valor emprestado × (parcelas restantes ÷
 *    total de parcelas), baseado no contador `paidInstallments` — ignorava
 *    amortizações, pagamentos parciais e `remainingAmount` ajustado.
 *  - Histórico do Cliente (Resumo): `Principal Pendente` = Σ emprestado (de
 *    TODOS os contratos, inclusive quitados) − Σ principal pago, e
 *    `Juros Pendente` obtido por resíduo (pendente − principal pendente),
 *    concentrando nele qualquer erro do principal.
 *
 * Agora ambos consomem `aggregatePortfolioPending`, que deriva os valores
 * contrato por contrato a partir de `getLoanFinancialStateForUI`
 * (principalRemaining / contractualInterestRemaining / multa / juros atraso).
 *
 * Função PURA: não consulta nem escreve no banco.
 */

import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { roundCurrency } from "@/lib/money";
import { getLoanFinancialStateForUI } from "@/features/loans/lib/loanFinancialAdapter";

export interface LoanPendingBreakdown {
  loanId: string;
  /** Principal original do contrato. */
  originalPrincipal: number;
  /** Principal efetivamente pago (exclui juros, multa e mora). */
  principalPaid: number;
  /** Principal ainda em aberto = base do "Capital na Rua". */
  principalRemaining: number;
  /** Juros contratuais pendentes + multa pendente + juros de atraso pendentes. */
  interestPending: number;
}

export interface PortfolioPendingTotals {
  /** Capital na Rua = Σ principal restante dos contratos ativos. */
  capitalOnStreet: number;
  /** Lucro Estimado / Juros Pendente = Σ juros pendentes dos contratos ativos. */
  interestPending: number;
  /** Quebra por contrato ativo (útil para agregações por cliente). */
  byLoan: LoanPendingBreakdown[];
}

interface AggregateInput {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  calculationDate?: string;
}

/** Pendências de UM contrato, sempre pela fonte financeira unificada. */
export function getLoanPendingBreakdown(
  loan: Loan,
  payments: Payment[],
  installmentSchedules: InstallmentSchedule[] = [],
  calculationDate?: string,
): LoanPendingBreakdown {
  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const state = getLoanFinancialStateForUI({
    loan,
    payments: loanPayments,
    installmentSchedules,
    calculationDate,
  });

  const interestPending = roundCurrency(
    Math.max(0, state.contractualInterestRemaining) +
      Math.max(0, state.penaltyPending) +
      Math.max(0, state.lateInterestPending),
  );

  return {
    loanId: loan.id,
    originalPrincipal: roundCurrency(state.originalPrincipal),
    principalPaid: roundCurrency(state.principalPaid),
    principalRemaining: roundCurrency(Math.max(0, state.principalRemaining)),
    interestPending,
  };
}

/**
 * Totais de carteira considerando apenas contratos NÃO quitados.
 * Contratos com status "paid" não têm principal nem juros pendentes.
 */
export function aggregatePortfolioPending({
  loans,
  payments,
  installmentSchedules = [],
  calculationDate,
}: AggregateInput): PortfolioPendingTotals {
  const byLoan: LoanPendingBreakdown[] = [];
  let capitalOnStreet = 0;
  let interestPending = 0;

  loans.forEach((loan) => {
    if (loan.status === "paid") return;
    const breakdown = getLoanPendingBreakdown(loan, payments, installmentSchedules, calculationDate);
    byLoan.push(breakdown);
    capitalOnStreet += breakdown.principalRemaining;
    interestPending += breakdown.interestPending;
  });

  return {
    capitalOnStreet: roundCurrency(capitalOnStreet),
    interestPending: roundCurrency(interestPending),
    byLoan,
  };
}
