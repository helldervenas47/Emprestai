/**
 * ============================================================================
 * CAMADA DE AGREGAÇÃO FINANCEIRA DO APP (FASE 3)
 * ============================================================================
 *
 * Traduz contratos/pagamentos do app para o núcleo compartilhado
 * (`financialAggregatesCore`) e devolve `FinancialAggregates`.
 *
 * - O estado por contrato vem SEMPRE do adaptador oficial
 *   (`getLoanFinancialStateForUI`), que resolve a feature flag.
 * - A alocação de cada pagamento respeita metadata persistida
 *   (`principal_amount`, `interest_amount`, `penalty_amount`,
 *   `late_interest_amount`) e, na ausência dela, usa a alocação oficial
 *   legada (`allocateInterestByPayment`). Nada é recalculado ou gravado.
 */

import type { InstallmentSchedule, Loan, Payment, Sale } from "@/types/loan";
import { getLoanFinancialStateForUI } from "@/features/loans/lib/loanFinancialAdapter";
import { allocateInterestByPayment } from "@/features/financial/lib/interestAllocation";
import { getOverdueAmount, getOverdueInstallments } from "@/features/loans/lib/loanInstallmentAmount";
import { todayInAppTz } from "@/lib/timezone";
import { getSaleReceivedAmount } from "@/features/dashboard/components/dashboard/dashboardHelpers";
import {
  buildFinancialAggregates,
  getPeriodBounds,
  roundMoney,
  toIsoDate,
  type AggregateLoanState,
  type AggregatePayment,
  type AggregateSaleReceipt,
  type FinancialAggregates,
  type PeriodBounds,
} from "@/features/financial/lib/financialAggregatesCore";

export type { FinancialAggregates, PeriodBounds };
export { buildFinancialAggregates, getPeriodBounds, toIsoDate };

const AMORTIZATION_INSTALLMENT = -3;
const INTEREST_ONLY_INSTALLMENTS = new Set([0, -2]);

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isActiveLoan(loan: Loan): boolean {
  return loan.status !== "paid" && (loan.status as string) !== "completed";
}

/** Converte `{ start, end }` do Dashboard em limites ISO inclusivos. */
export function periodBoundsFromRange(
  range: { start: Date; end: Date; label?: string },
  kind: PeriodBounds["kind"] = "custom",
): PeriodBounds {
  return {
    kind,
    startIso: toIsoDate(range.start),
    endIso: toIsoDate(range.end),
    label: range.label ?? `${toIsoDate(range.start)} → ${toIsoDate(range.end)}`,
  };
}

/**
 * Alocação por pagamento: metadata persistida tem prioridade absoluta.
 * Fallback determinístico:
 *   - avulso de juros (0 / -2) → 100% juros
 *   - amortização (-3)         → 100% principal
 *   - demais                   → juros pela alocação oficial, resto principal
 */
export function buildAggregatePayments(loans: Loan[], payments: Payment[]): AggregatePayment[] {
  const allocLoans = loans.map((loan) => ({
    id: loan.id,
    amount: num(loan.amount),
    interestRate: num(loan.interestRate),
    installments: Math.max(1, Math.floor(num(loan.installments) || 1)),
    status: loan.status,
    originalAmount: (loan as any).originalAmount ?? null,
  }));
  const allocPayments = payments.map((p) => ({
    id: p.id,
    loanId: p.loanId,
    amount: num(p.amount),
    date: p.date,
    installmentNumber: num(p.installmentNumber),
    createdAt: (p as any).createdAt ?? undefined,
    metadata: ((p as any).metadata ?? null) as Record<string, any> | null,
  }));
  const interestByPayment = allocateInterestByPayment(allocLoans, allocPayments);

  return payments.map((payment) => {
    const md = ((payment as any).metadata ?? null) as Record<string, any> | null;
    const amount = roundMoney(num(payment.amount));
    const penalty = roundMoney(num(md?.penalty_amount));
    const lateInterest = roundMoney(num(md?.late_interest_amount));

    let interest: number;
    let principal: number;

    if (md && (md.interest_amount != null || md.principal_amount != null)) {
      interest = roundMoney(num(md.interest_amount));
      principal = md.principal_amount != null
        ? roundMoney(num(md.principal_amount))
        : roundMoney(Math.max(0, amount - interest - penalty - lateInterest));
    } else {
      const n = num(payment.installmentNumber);
      if (INTEREST_ONLY_INSTALLMENTS.has(n)) {
        interest = roundMoney(Math.max(0, amount - penalty - lateInterest));
        principal = 0;
      } else if (n === AMORTIZATION_INSTALLMENT) {
        interest = 0;
        principal = roundMoney(Math.max(0, amount - penalty - lateInterest));
      } else {
        interest = roundMoney(Math.min(interestByPayment.get(payment.id) ?? 0, Math.max(0, amount - penalty - lateInterest)));
        principal = roundMoney(Math.max(0, amount - interest - penalty - lateInterest));
      }
    }

    return {
      id: payment.id,
      loanId: payment.loanId,
      dateIso: String(payment.date ?? "").slice(0, 10),
      amount,
      principalAmount: principal,
      interestAmount: interest,
      penaltyAmount: penalty,
      lateInterestAmount: lateInterest,
    };
  });
}

/** Estado por contrato no formato do núcleo (via adaptador oficial). */
export function buildAggregateLoanStates(
  loans: Loan[],
  payments: Payment[],
  installmentSchedules: InstallmentSchedule[] = [],
  calculationDate: string = todayInAppTz(),
): AggregateLoanState[] {
  return loans.map((loan) => {
    const state = getLoanFinancialStateForUI({ loan, payments, installmentSchedules, calculationDate });
    const overdueInstallments = getOverdueInstallments(loan, installmentSchedules, calculationDate);
    const active = isActiveLoan(loan);
    return {
      loanId: loan.id,
      status: loan.status ?? null,
      isActive: active,
      isOverdue: active && overdueInstallments.length > 0,
      daysLate: state.daysOverdue,
      startDateIso: loan.startDate ?? null,
      dueDateIso: loan.dueDate ?? null,
      principal: state.originalPrincipal,
      principalRemaining: state.principalRemaining,
      contractualInterestTotal: state.contractualInterestTotal,
      contractualInterestRemaining: state.contractualInterestRemaining,
      penaltyPending: state.penaltyPending,
      lateInterestPending: state.lateInterestPending,
      totalReceivable: state.totalReceivable,
      overdueAmount: active ? getOverdueAmount(loan, installmentSchedules, calculationDate) : 0,
      warnings: state.warnings,
    };
  });
}

export interface BuildAppAggregatesInput {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  sales?: Sale[];
  includeSales?: boolean;
  period?: PeriodBounds | null;
  calculationDate?: string;
}

/**
 * Entrada única do app: monta os agregados oficiais do período.
 * Função pura em relação aos dados recebidos (nenhuma leitura/escrita).
 */
export function buildAppFinancialAggregates(input: BuildAppAggregatesInput): FinancialAggregates {
  const calculationDate = input.calculationDate ?? todayInAppTz();
  const schedules = input.installmentSchedules ?? [];
  const saleReceipts: AggregateSaleReceipt[] = input.includeSales && input.sales
    ? input.sales.map((sale) => ({
      id: sale.id,
      dateIso: String(sale.date ?? "").slice(0, 10),
      amount: roundMoney(getSaleReceivedAmount(sale)),
    }))
    : [];

  return buildFinancialAggregates({
    loanStates: buildAggregateLoanStates(input.loans, input.payments, schedules, calculationDate),
    payments: buildAggregatePayments(input.loans, input.payments),
    saleReceipts,
    period: input.period ?? null,
    calculationDate,
  });
}
