import { todayInAppTz } from "@/lib/timezone";
import type { Client, Loan, Payment } from "@/types/loan";


export const DEFAULT_INITIAL_LIMIT = 300;
export const MIN_LIMIT = 0;
export const MAX_INCREASE_PCT = 0.10;
export const MAX_DECREASE_PCT = 0.10;

export interface ClientCreditMetrics {
  totalLoans: number;
  paidLoans: number;
  totalInstallmentsPaid: number;
  onTime: number;
  late: number;
  onTimePct: number; // 0..1
  avgLateDays: number;
}

/**
 * Computes payment behavior metrics for a client based on their loans/payments.
 */
export function computeClientCreditMetrics(
  clientId: string,
  loans: Loan[],
  payments: Payment[],
): ClientCreditMetrics {
  const clientLoans = loans.filter((l) => l.borrowerId === clientId);
  const paidLoans = clientLoans.filter((l) => l.status === "paid").length;

  let onTime = 0;
  let late = 0;
  let totalLateDays = 0;

  clientLoans.forEach((loan) => {
    const loanPayments = payments.filter(
      (p) => p.loanId === loan.id && p.installmentNumber > 0,
    );
    loanPayments.forEach((p) => {
      const start = new Date(loan.startDate + "T00:00:00");
      const expectedDue = new Date(
        start.getFullYear(),
        start.getMonth() + p.installmentNumber,
        start.getDate(),
      );
      const paymentDate = new Date(p.date + "T00:00:00");
      const diffDays = Math.floor(
        (paymentDate.getTime() - expectedDue.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays <= 0) {
        onTime++;
      } else {
        late++;
        totalLateDays += diffDays;
      }
    });
  });

  const totalInstallmentsPaid = onTime + late;
  const onTimePct = totalInstallmentsPaid > 0 ? onTime / totalInstallmentsPaid : 1;
  const avgLateDays = late > 0 ? totalLateDays / late : 0;

  return {
    totalLoans: clientLoans.length,
    paidLoans,
    totalInstallmentsPaid,
    onTime,
    late,
    onTimePct,
    avgLateDays,
  };
}

export interface AutoAdjustResult {
  newLimit: number;
  delta: number;
  pct: number;
  reason: string;
  metrics: ClientCreditMetrics;
}

/**
 * Returns a proposed new limit based on client behavior.
 * Rules:
 *  - >=90% on time and avgLateDays < 5  → +10%
 *  - 70%-89%                            → manter
 *  - <70% or avgLateDays > 15           → -10%
 *  - Sem histórico de parcelas pagas    → manter
 */
export function computeAutoLimitAdjustment(
  currentLimit: number,
  metrics: ClientCreditMetrics,
): AutoAdjustResult {
  if (metrics.totalInstallmentsPaid === 0) {
    return {
      newLimit: currentLimit,
      delta: 0,
      pct: 0,
      reason: "Sem histórico de pagamentos suficiente",
      metrics,
    };
  }

  const pctOnTime = metrics.onTimePct;
  let pct = 0;
  let reason = "";

  if (pctOnTime >= 0.9 && metrics.avgLateDays < 5) {
    pct = MAX_INCREASE_PCT;
    reason = `Bom histórico (${Math.round(pctOnTime * 100)}% em dia) — aumento de 10%`;
  } else if (pctOnTime >= 0.7) {
    pct = 0;
    reason = `Histórico regular (${Math.round(pctOnTime * 100)}% em dia) — limite mantido`;
  } else {
    pct = -MAX_DECREASE_PCT;
    reason = `Histórico ruim (${Math.round(pctOnTime * 100)}% em dia) — redução de 10%`;
  }

  // baseLimit minimum so that 10% increases still grow when starting from 0
  const base = Math.max(currentLimit, DEFAULT_INITIAL_LIMIT);
  const delta = Math.round(base * pct);
  let newLimit = Math.max(MIN_LIMIT, currentLimit + delta);
  // never increase above +10% of current
  if (pct > 0) {
    newLimit = Math.min(newLimit, Math.round(currentLimit + base * MAX_INCREASE_PCT));
  }
  return { newLimit, delta: newLimit - currentLimit, pct, reason, metrics };
}

function loanBelongsToClient(
  client: Pick<Client, "id">,
  loan: Loan,
): boolean {
  // Match estritamente por ID. O backfill (2026-07) preencheu borrower_id em
  // todos os contratos legados e a FK NOT NULL bloqueia inserts sem cliente,
  // então o fallback por nome foi removido para evitar colisão de homônimos.
  return !!loan.borrowerId && loan.borrowerId === client.id;
}

/**
 * Limite utilizado = Principal Emprestado − Principal Pago do cliente.
 *
 * - "Principal Emprestado" = soma do principal dos contratos ATIVOS do
 *   cliente (usa `originalAmount` quando disponível, senão `amount`).
 *   Contratos `status === 'paid'` são desconsiderados.
 * - "Principal Pago" = soma dos pagamentos de AMORTIZAÇÃO
 *   (`installmentNumber === -3`) desses contratos ativos. Parcelas
 *   regulares, juros avulsos, parciais, multas e mora NÃO reduzem o
 *   principal enquanto o contrato estiver aberto.
 * - Vincula contratos pelo `borrowerId` e, como fallback para contratos
 *   antigos sem ID, pelo `borrowerName` normalizado.
 * - Nunca retorna valor negativo (clamp em 0).
 */
export function computeUsedLimit(
  client: Pick<Client, "id"> & { name?: string },
  loans: Loan[],
  payments: Payment[] = [],
): number {
  const activeLoans = loans.filter(
    (l) => loanBelongsToClient(client, l) && l.status !== "paid",
  );
  if (activeLoans.length === 0) return 0;

  const borrowed = activeLoans.reduce(
    (sum, l) => sum + (l.originalAmount ?? l.amount ?? 0),
    0,
  );

  const loanIds = new Set(activeLoans.map((l) => l.id));
  const amortizationPaid = payments
    .filter((p) => loanIds.has(p.loanId) && p.installmentNumber === -3)
    .reduce((s, p) => s + (p.amount ?? 0), 0);

  return Math.max(0, borrowed - amortizationPaid);
}


export function computeAvailableLimit(currentLimit: number, used: number): number {
  return currentLimit - used;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function todayStr(): string {
  return todayInAppTz();
}
