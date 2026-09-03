/**
 * COMPARADOR ANTIGO × NOVO (somente leitura).
 *
 * Executa em paralelo a regra legada (`getLoanReceivable` / `getLoanOutstandingBreakdown`)
 * e a nova regra unificada (`calculateLoanFinancialState`) e devolve as
 * divergências. NÃO grava nada no banco e NÃO altera nenhum registro.
 */

import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { roundCurrency } from "@/lib/money";
import { calculateLoanFinancialState } from "@/features/loans/lib/calculateLoanFinancialState";
import { getLoanOutstandingBreakdown } from "@/features/loans/lib/loanOutstanding";
import { getLoanReceivable, getLoanLateFees } from "@/features/loans/lib/loanLateFees";

export interface FinancialCalculationDiff {
  loanId: string;
  clientName?: string;

  oldTotalReceivable: number;
  newTotalReceivable: number;
  totalDifference: number;

  oldPrincipalRemaining: number;
  newPrincipalRemaining: number;
  principalDifference: number;

  oldInterestRemaining: number;
  newInterestRemaining: number;
  interestDifference: number;

  oldFees: number;
  newFees: number;
  feesDifference: number;

  warnings: string[];
}

export interface DiffOptions {
  calculationDate?: string;
  /** Só retorna contratos com diferença > tolerância (default R$ 0,01). */
  onlyDivergent?: boolean;
  tolerance?: number;
}

export function compareLoanFinancialCalculations(
  loans: Loan[],
  payments: Payment[],
  schedules: InstallmentSchedule[],
  options: DiffOptions = {},
): FinancialCalculationDiff[] {
  const tolerance = options.tolerance ?? 0.01;
  const out: FinancialCalculationDiff[] = [];

  for (const loan of loans) {
    const loanPayments = payments.filter((p) => p.loanId === loan.id);

    // ---- Regra ANTIGA
    const fees = getLoanLateFees(loan, loanPayments, schedules);
    const oldBreakdown = getLoanOutstandingBreakdown({
      loan,
      payments: loanPayments,
      lateInterest: fees.lateInterestTotal,
      penalty: fees.penaltyTotal,
      schedules,
    });
    const oldTotal = roundCurrency(getLoanReceivable(loan, loanPayments, schedules));

    // ---- Regra NOVA
    const state = calculateLoanFinancialState({
      loan,
      payments: loanPayments,
      installmentSchedules: schedules,
      calculationDate: options.calculationDate,
    });

    const diff: FinancialCalculationDiff = {
      loanId: loan.id,
      clientName: loan.borrowerName,

      oldTotalReceivable: oldTotal,
      newTotalReceivable: state.totalReceivable,
      totalDifference: roundCurrency(state.totalReceivable - oldTotal),

      oldPrincipalRemaining: oldBreakdown.principalRemaining,
      newPrincipalRemaining: state.principalRemaining,
      principalDifference: roundCurrency(state.principalRemaining - oldBreakdown.principalRemaining),

      oldInterestRemaining: oldBreakdown.contractualInterestRemaining,
      newInterestRemaining: state.contractualInterestRemaining,
      interestDifference: roundCurrency(state.contractualInterestRemaining - oldBreakdown.contractualInterestRemaining),

      oldFees: oldBreakdown.lateFees,
      newFees: roundCurrency(state.penaltyPending + state.lateInterestPending),
      feesDifference: roundCurrency(
        state.penaltyPending + state.lateInterestPending - oldBreakdown.lateFees,
      ),

      warnings: state.warnings,
    };

    const divergent =
      Math.abs(diff.totalDifference) > tolerance
      || Math.abs(diff.principalDifference) > tolerance
      || Math.abs(diff.interestDifference) > tolerance
      || Math.abs(diff.feesDifference) > tolerance
      || diff.warnings.length > 0;

    if (!options.onlyDivergent || divergent) out.push(diff);
  }

  return out;
}

const CSV_COLUMNS: (keyof FinancialCalculationDiff)[] = [
  "loanId", "clientName",
  "oldTotalReceivable", "newTotalReceivable", "totalDifference",
  "oldPrincipalRemaining", "newPrincipalRemaining", "principalDifference",
  "oldInterestRemaining", "newInterestRemaining", "interestDifference",
  "oldFees", "newFees", "feesDifference",
  "warnings",
];

export function financialDiffToCsv(rows: FinancialCalculationDiff[]): string {
  const escape = (v: unknown) => {
    const s = Array.isArray(v) ? v.join(" | ") : v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = CSV_COLUMNS.join(";");
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => escape(r[c])).join(";"));
  return [header, ...lines].join("\n");
}

export function financialDiffToJson(rows: FinancialCalculationDiff[]): string {
  return JSON.stringify(rows, null, 2);
}
