/**
 * ============================================================================
 * AGREGAÇÃO FINANCEIRA PARA EDGE FUNCTIONS (FASE 3)
 * ============================================================================
 *
 * Mapeia linhas do banco (snake_case) para o núcleo compartilhado
 * `financial-aggregates-core.ts` — o MESMO arquivo usado pelo app. Assim,
 * relatórios internos, relatórios exportados e Telegram somam exatamente
 * como o Dashboard.
 *
 * Somente leitura: nada é gravado, corrigido ou recalculado no banco.
 *
 * Ativação: variável de ambiente `USE_UNIFIED_REPORTS=true` (default: OFF,
 * mantendo os números atuais dos relatórios intactos).
 */

import { allocateInterestByPayment } from "./interest-allocation.ts";
import {
  buildFinancialAggregates,
  getPeriodBounds,
  roundMoney,
  type AggregateLoanState,
  type AggregatePayment,
  type FinancialAggregates,
  type PeriodBounds,
} from "./financial-aggregates-core.ts";

export type { FinancialAggregates, PeriodBounds };
export { buildFinancialAggregates, getPeriodBounds };

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Flag de ativação da agregação unificada nas Edge Functions. */
export function unifiedReportsEnabled(): boolean {
  try {
    const raw = (globalThis as any)?.Deno?.env?.get?.("USE_UNIFIED_REPORTS");
    return ["1", "true", "on", "yes"].includes(String(raw ?? "").trim().toLowerCase());
  } catch {
    return false;
  }
}

function totalWithInterest(loan: any): number {
  const principal = num(loan.amount);
  const rate = num(loan.interest_rate);
  return Math.round(principal * (1 + rate / 100));
}

function daysLate(dueDateIso: string | null, todayIso: string): number {
  if (!dueDateIso) return 0;
  const due = new Date(`${String(dueDateIso).slice(0, 10)}T00:00:00`).getTime();
  const today = new Date(`${todayIso}T00:00:00`).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(today)) return 0;
  return Math.max(0, Math.floor((today - due) / 86_400_000));
}

/**
 * Estado por contrato no formato do núcleo, a partir das linhas do banco.
 * A alocação de juros usa `allocateInterestByPayment` (fonte oficial), então
 * o principal amortizado é o histórico real, não um rateio por parcelas.
 */
export function mapLoanStatesFromRows(loanRows: any[], paymentRows: any[], todayIso: string): AggregateLoanState[] {
  const allocLoans = loanRows.map((loan) => ({
    id: String(loan.id),
    amount: num(loan.amount),
    interestRate: num(loan.interest_rate),
    installments: Math.max(1, Math.floor(num(loan.installments) || 1)),
    status: loan.status,
    originalAmount: loan.original_amount != null ? Number(loan.original_amount) : null,
  }));
  const allocPayments = paymentRows.map((p) => ({
    id: String(p.id),
    loanId: String(p.loan_id),
    amount: num(p.amount),
    date: p.date ?? undefined,
    installmentNumber: num(p.installment_number),
    createdAt: p.created_at ?? undefined,
    metadata: (p.metadata ?? null) as Record<string, any> | null,
  }));
  const interestByPayment = allocateInterestByPayment(allocLoans, allocPayments);

  return loanRows.map((loan) => {
    const id = String(loan.id);
    const principal = num(loan.amount);
    const total = totalWithInterest(loan);
    const contractualInterestTotal = roundMoney(Math.max(0, total - principal));
    const loanPayments = allocPayments.filter((p) => p.loanId === id);

    let interestPaid = 0;
    let principalPaid = 0;
    let penaltyPaid = 0;
    let lateInterestPaid = 0;
    for (const p of loanPayments) {
      const md = (p.metadata ?? null) as any;
      const penalty = num(md?.penalty_amount);
      const late = num(md?.late_interest_amount);
      penaltyPaid += penalty;
      lateInterestPaid += late;
      const interest = md?.interest_amount != null
        ? num(md.interest_amount)
        : (interestByPayment.get(p.id) ?? 0);
      const capped = Math.min(interest, Math.max(0, p.amount - penalty - late));
      interestPaid += capped;
      principalPaid += Math.max(0, p.amount - capped - penalty - late);
    }

    const principalRemaining = roundMoney(Math.min(principal, Math.max(0, principal - principalPaid)));
    const contractualInterestRemaining = roundMoney(Math.max(0, contractualInterestTotal - interestPaid));

    const late = daysLate(loan.due_date ?? null, todayIso);
    const balanceForLateInterest = principalRemaining + contractualInterestRemaining;
    let lateInterestApplied = 0;
    let penaltyApplied = 0;
    if (late > 0) {
      if (num(loan.late_interest_value) > 0) {
        lateInterestApplied = loan.late_interest_type === "fixed"
          ? num(loan.late_interest_value) * late
          : balanceForLateInterest * (num(loan.late_interest_value) / 100) * late;
      }
      if (num(loan.penalty_value) > 0) penaltyApplied = num(loan.penalty_value);
    }
    const penaltyPending = roundMoney(Math.max(0, penaltyApplied - penaltyPaid));
    const lateInterestPending = roundMoney(Math.max(0, lateInterestApplied - lateInterestPaid));
    const isActive = loan.status !== "paid" && loan.status !== "completed";

    return {
      loanId: id,
      status: loan.status ?? null,
      isActive,
      isOverdue: isActive && late > 0,
      daysLate: late,
      startDateIso: loan.start_date ?? null,
      dueDateIso: loan.due_date ?? null,
      principal: roundMoney(principal),
      principalRemaining,
      contractualInterestTotal,
      contractualInterestRemaining,
      penaltyPending,
      lateInterestPending,
      totalReceivable: roundMoney(
        principalRemaining + contractualInterestRemaining + penaltyPending + lateInterestPending,
      ),
      overdueAmount: isActive && late > 0 ? principalRemaining + contractualInterestRemaining : 0,
      warnings: [],
    };
  });
}

/** Pagamentos no formato do núcleo (metadata tem prioridade). */
export function mapPaymentsFromRows(loanRows: any[], paymentRows: any[]): AggregatePayment[] {
  const allocLoans = loanRows.map((loan) => ({
    id: String(loan.id),
    amount: num(loan.amount),
    interestRate: num(loan.interest_rate),
    installments: Math.max(1, Math.floor(num(loan.installments) || 1)),
    status: loan.status,
    originalAmount: loan.original_amount != null ? Number(loan.original_amount) : null,
  }));
  const allocPayments = paymentRows.map((p) => ({
    id: String(p.id),
    loanId: String(p.loan_id),
    amount: num(p.amount),
    date: p.date ?? undefined,
    installmentNumber: num(p.installment_number),
    createdAt: p.created_at ?? undefined,
    metadata: (p.metadata ?? null) as Record<string, any> | null,
  }));
  const interestByPayment = allocateInterestByPayment(allocLoans, allocPayments);

  return allocPayments.map((p) => {
    const md = (p.metadata ?? null) as any;
    const penalty = roundMoney(num(md?.penalty_amount));
    const lateInterest = roundMoney(num(md?.late_interest_amount));
    const n = p.installmentNumber;
    let interest: number;
    if (md?.interest_amount != null) {
      interest = roundMoney(num(md.interest_amount));
    } else if (n === 0 || n === -2) {
      interest = roundMoney(Math.max(0, p.amount - penalty - lateInterest));
    } else if (n === -3) {
      interest = 0;
    } else {
      interest = roundMoney(Math.min(interestByPayment.get(p.id) ?? 0, Math.max(0, p.amount - penalty - lateInterest)));
    }
    const principal = md?.principal_amount != null
      ? roundMoney(num(md.principal_amount))
      : roundMoney(Math.max(0, p.amount - interest - penalty - lateInterest));

    return {
      id: p.id,
      loanId: p.loanId,
      dateIso: String(p.date ?? "").slice(0, 10),
      amount: roundMoney(p.amount),
      principalAmount: principal,
      interestAmount: interest,
      penaltyAmount: penalty,
      lateInterestAmount: lateInterest,
    };
  });
}

/** Agregados oficiais a partir das linhas do banco. */
export function buildAggregatesFromRows(params: {
  loanRows: any[];
  paymentRows: any[];
  todayIso: string;
  period?: PeriodBounds | null;
}): FinancialAggregates {
  return buildFinancialAggregates({
    loanStates: mapLoanStatesFromRows(params.loanRows, params.paymentRows, params.todayIso),
    payments: mapPaymentsFromRows(params.loanRows, params.paymentRows),
    period: params.period ?? null,
    calculationDate: params.todayIso,
  });
}
