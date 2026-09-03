import type { PaymentSplit } from "@/types/loan";

export interface PaymentLedgerRow {
  amount: number;
  payment_method_id: string | null;
  metadata: Record<string, any>;
}

/**
 * Constrói as linhas de extrato (`account_ledger`) de um pagamento.
 *
 * Fonte ÚNICA da regra: é usada tanto pelo caminho client-side legado
 * do offline quanto pelas RPCs transacionais, para que a
 * distribuição por forma de pagamento seja idêntica nos dois casos.
 *
 * - Sem split: 1 linha com o valor total.
 * - Com split: 1 linha por parte, com principal/juros/multa distribuídos
 *   proporcionalmente ao valor de cada parte.
 */
export function buildPaymentLedgerRows(args: {
  amount: number;
  paymentMethodId: string | null;
  split: PaymentSplit | null;
  extraMetadata?: Record<string, any>;
}): PaymentLedgerRow[] {
  const { amount, paymentMethodId, split, extraMetadata } = args;
  const round2 = (v: number) => Math.round(v * 100) / 100;

  if (split?.parts?.length) {
    const total = split.parts.reduce((s, p) => s + (Number(p.amount) || 0), 0) || amount;
    const rows: PaymentLedgerRow[] = [];
    split.parts.forEach((part, i) => {
      const partAmount = Number(part.amount) || 0;
      if (partAmount <= 0) return;
      const ratio = total > 0 ? partAmount / total : 0;
      const metadata: Record<string, any> = {
        ...(extraMetadata ?? {}),
        payment_method_id: part.paymentMethodId ?? null,
        split_part: true,
        split_index: i,
        split_count: split.parts.length,
        total_amount: round2(total),
      };
      if (extraMetadata?.principal_amount != null) {
        metadata.principal_amount = round2(Number(extraMetadata.principal_amount) * ratio);
      }
      if (extraMetadata?.interest_amount != null) {
        metadata.interest_amount = round2(Number(extraMetadata.interest_amount) * ratio);
      }
      if (extraMetadata?.fees_amount != null) {
        metadata.fees_amount = round2(Number(extraMetadata.fees_amount) * ratio);
      }
      rows.push({ amount: partAmount, payment_method_id: part.paymentMethodId ?? null, metadata });
    });
    return rows;
  }

  return [{
    amount,
    payment_method_id: paymentMethodId ?? null,
    metadata: { payment_method_id: paymentMethodId ?? null, ...(extraMetadata ?? {}) },
  }];
}

/** Soma dos valores das linhas de extrato (usada em asserções/testes). */
export function sumLedgerRows(rows: PaymentLedgerRow[]): number {
  return Math.round(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100;
}
