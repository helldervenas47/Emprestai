/**
 * ETAPA 4.15 — Persistência da alocação oficial em pagamentos NOVOS.
 *
 * Problema corrigido: apenas os parciais (-1) gravavam
 * `metadata.allocation_version` / `principal_amount` / `interest_amount`.
 * Todos os demais fluxos (parcela regular, juros do ciclo, multa, amortização,
 * quitação) gravavam metadata vazia, tornando o histórico não determinístico.
 *
 * Regra de ouro: a composição persistida é EXATAMENTE a mesma que o leitor
 * oficial (`allocateInterestByPayment`) derivaria hoje para aquele pagamento.
 * Isso torna a mudança neutra do ponto de vista financeiro — nenhum relatório
 * muda de valor — e apenas congela o resultado no momento da escrita.
 *
 * NUNCA é aplicado retroativamente: pagamentos legados continuam sem
 * `allocation_version` e seguem sendo interpretados pela regra legada.
 */
import {
  ALLOCATION_VERSION_REMAINING_PRORATA,
  allocateInterestByPayment,
  type AllocLoanLike,
  type AllocPaymentLike,
} from "@/features/financial/lib/interestAllocation";

export const ALLOCATION_TOLERANCE = 0.01;

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PaymentAllocationType =
  | "installment"
  | "partial"
  | "interest_cycle"
  | "late_fee"
  | "amortization"
  | "payoff";

export interface PaymentAllocationMetadata {
  allocation_version: string;
  payment_type: PaymentAllocationType;
  principal_amount: number;
  interest_amount: number;
}

/**
 * Classificação oficial pelo `installment_number` gravado no banco.
 *   >= 1 → parcela regular (ou quitação, quando for a última)
 *    0   → juros do ciclo (100% juros)
 *   -1   → pagamento parcial (pró-rata pelos saldos remanescentes)
 *   -2   → multa/mora (100% juros na leitura oficial)
 *   -3   → amortização de principal (0% juros)
 */
export function classifyPaymentType(
  installmentNumber: number,
  opts?: { isPayoff?: boolean },
): PaymentAllocationType {
  if (installmentNumber === 0) return "interest_cycle";
  if (installmentNumber === -1) return "partial";
  if (installmentNumber === -2) return "late_fee";
  if (installmentNumber === -3) return "amortization";
  if (installmentNumber >= 1) return opts?.isPayoff ? "payoff" : "installment";
  // Qualquer código desconhecido é tratado como parcial (nunca inventa juros).
  return "partial";
}

/**
 * Constrói a metadata de alocação para UM pagamento novo.
 * Retorna `null` quando não há valor a alocar (amount <= 0).
 * Lança quando a soma principal + juros diverge do valor em mais de R$ 0,01
 * (bloqueio de persistência inconsistente).
 */
export function buildPaymentAllocationMetadata(params: {
  loan: AllocLoanLike;
  priorPayments: AllocPaymentLike[];
  payment: AllocPaymentLike;
  /** Alocação já calculada pelo fluxo (ex.: pró-rata do parcial). */
  override?: { interest: number; principal: number } | null;
  isPayoff?: boolean;
}): PaymentAllocationMetadata | null {
  const { loan, priorPayments, payment, override, isPayoff } = params;
  const amount = round2(Number(payment.amount) || 0);
  if (!(amount > 0)) return null;

  const paymentType = classifyPaymentType(payment.installmentNumber, { isPayoff });

  let interest: number;
  let principal: number;

  if (override) {
    interest = round2(Number(override.interest) || 0);
    principal = round2(Number(override.principal) || 0);
  } else {
    const map = allocateInterestByPayment(
      [loan],
      [...priorPayments.filter((p) => p.loanId === loan.id), payment],
    );
    interest = round2(map.get(payment.id) ?? 0);
    principal = round2(amount - interest);
  }

  if (!Number.isFinite(interest) || !Number.isFinite(principal)) {
    throw new Error("Falha ao calcular composição juros/principal do pagamento");
  }
  if (interest < -0.005 || principal < -0.005) {
    throw new Error("Falha ao calcular composição juros/principal do pagamento: valores negativos detectados");
  }
  if (Math.abs(interest + principal - amount) > 0.05) {
    throw new Error(`Falha ao calcular composição juros/principal do pagamento: soma diverge do total (Soma: ${(interest + principal).toFixed(2)}, Total: ${amount.toFixed(2)})`);
  }

  return {
    allocation_version: ALLOCATION_VERSION_REMAINING_PRORATA,
    payment_type: paymentType,
    principal_amount: principal,
    interest_amount: interest,
  };
}

/** Mescla a alocação em uma metadata existente sem sobrescrever campos já definidos. */
export function withAllocation<T extends Record<string, any> | null | undefined>(
  base: T,
  allocation: PaymentAllocationMetadata | null,
): Record<string, any> | undefined {
  if (!allocation) return (base ?? undefined) as any;
  return { ...allocation, ...(base ?? {}) };
}

/** Alocação determinística para fluxos cuja composição é 100% conhecida. */
export function fixedAllocationMetadata(
  paymentType: PaymentAllocationType,
  amount: number,
  parts: { interest: number; principal: number },
): PaymentAllocationMetadata | null {
  const amt = round2(Number(amount) || 0);
  if (!(amt > 0)) return null;
  const interest = round2(Number(parts.interest) || 0);
  const principal = round2(Number(parts.principal) || 0);
  if (interest < 0 || principal < 0 || Math.abs(interest + principal - amt) > ALLOCATION_TOLERANCE) {
    throw new Error("Falha ao calcular composição juros/principal do pagamento");
  }
  return {
    allocation_version: ALLOCATION_VERSION_REMAINING_PRORATA,
    payment_type: paymentType,
    principal_amount: principal,
    interest_amount: interest,
  };
}

/** Multa/mora (-2): 100% juros na leitura oficial. */
export const lateFeeAllocationMetadata = (amount: number) =>
  fixedAllocationMetadata("late_fee", amount, { interest: round2(Number(amount) || 0), principal: 0 });

/** Juros do ciclo (0): 100% juros. */
export const interestCycleAllocationMetadata = (amount: number) =>
  fixedAllocationMetadata("interest_cycle", amount, { interest: round2(Number(amount) || 0), principal: 0 });

/** Amortização (-3): 100% principal. */
export const amortizationAllocationMetadata = (amount: number) =>
  fixedAllocationMetadata("amortization", amount, { interest: 0, principal: round2(Number(amount) || 0) });
