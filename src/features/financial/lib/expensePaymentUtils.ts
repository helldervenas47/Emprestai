import { Expense } from "@/types/loan";

/**
 * Parses the credit card ID from an expense's notes if it exists in the format {ID:uuid}.
 */
export function extractCardIdFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/\{ID:([^}]+)\}/);
  return match ? match[1] : null;
}

/**
 * Checks if a payment method name corresponds to a credit card.
 */
export function isCreditCardMethod(methodName: string): boolean {
  return methodName.toLowerCase().includes("crédito");
}

/**
 * Recorrência "após pagamento": a próxima ocorrência só existe depois que a
 * atual for efetivamente paga. Por isso ela NUNCA deve ser expandida em
 * competências futuras (listas, faturas de cartão, totais) — cada registro
 * representa apenas o seu próprio ciclo (dueDate).
 *
 * Obs.: essas despesas são gravadas com `installments = 999` (mesma convenção
 * das fixas mensais) apenas para derivar o valor mensal (amount / installments).
 */
export function isAfterPaymentRecurrence(
  e: Pick<Expense, "type" | "recurrenceType">,
): boolean {
  return e.type === "recorrente" && e.recurrenceType === "after_payment";
}

/** True quando a despesa deve ser expandida mês a mês (parcelada/fixa padrão). */
export function isMonthlyExpandable(
  e: Pick<Expense, "type" | "recurrenceType" | "installments">,
): boolean {
  return (
    e.type === "recorrente" &&
    !!e.installments &&
    e.installments > 1 &&
    !isAfterPaymentRecurrence(e)
  );
}
