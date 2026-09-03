/**
 * Helpers monetários oficiais do app.
 *
 * TODA fórmula financeira deve usar `roundCurrency` (2 casas decimais).
 * `Math.round(valor)` (inteiro) NUNCA deve ser usado para dinheiro — ele
 * descarta centavos e produz divergências acumuladas entre módulos.
 */

/** Arredonda para 2 casas decimais de forma estável (evita 1.005 → 1.00). */
export function roundCurrency(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Converte reais em centavos inteiros (para distribuição exata entre parcelas). */
export function toCents(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100);
}

/** Converte centavos inteiros de volta para reais. */
export function fromCents(cents: number): number {
  return roundCurrency((Number(cents) || 0) / 100);
}

/**
 * Distribui `total` (reais) entre `parts` fatias respeitando pesos opcionais,
 * trabalhando em centavos inteiros. A soma do resultado é EXATAMENTE `total`.
 * O resíduo de centavos vai para as primeiras fatias (maior resto).
 */
export function distributeCurrency(total: number, parts: number, weights?: number[]): number[] {
  const n = Math.max(0, Math.floor(parts));
  if (n === 0) return [];
  const totalCents = toCents(total);
  const w = weights && weights.length === n && weights.some((v) => Number(v) > 0)
    ? weights.map((v) => Math.max(0, Number(v) || 0))
    : Array.from({ length: n }, () => 1);
  const wSum = w.reduce((s, v) => s + v, 0) || n;

  const raw = w.map((v) => (totalCents * v) / wSum);
  const floors = raw.map((v) => Math.floor(v));
  let residue = totalCents - floors.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (residue <= 0) break;
    floors[i] += 1;
    residue -= 1;
  }
  return floors.map(fromCents);
}

/** Diferença relevante em dinheiro (> R$ 0,01). */
export function isMoneyDivergent(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(roundCurrency(a) - roundCurrency(b)) > tolerance;
}
