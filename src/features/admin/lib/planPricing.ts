export const CYCLE_MONTHS = {
  monthly: 1,
  semestral: 6,
  annual: 12,
} as const;

export type BillingCycle = keyof typeof CYCLE_MONTHS;

export const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Calcula o preço total do ciclo. Se houver `override`, ele tem prioridade.
 * Caso contrário: mensal * meses * (1 - desconto/100).
 */
export function calcCyclePrice(
  monthly: number,
  months: number,
  discountPct: number,
  override?: number | null,
): number {
  if (override != null && override > 0) return override;
  const disc = Math.min(Math.max(discountPct || 0, 0), 100);
  return monthly * months * (1 - disc / 100);
}

export function calcSavings(monthly: number, cyclePrice: number, months: number) {
  const original = monthly * months;
  const saved = Math.max(original - cyclePrice, 0);
  const percent = original > 0 ? (saved / original) * 100 : 0;
  return { original, saved, percent };
}

export function equivalentMonthly(cyclePrice: number, months: number) {
  return months > 0 ? cyclePrice / months : 0;
}
