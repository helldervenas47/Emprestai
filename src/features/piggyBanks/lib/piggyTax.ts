/**
 * Ponte do núcleo ÚNICO de rendimento de cofrinhos para o frontend.
 *
 * A matemática real vive em `supabase/functions/_shared/piggy-yield-core.ts`
 * (puro, sem imports) para que as Edge Functions de cálculo/recálculo e o app
 * usem EXATAMENTE o mesmo modelo — nada é copiado ou reescrito.
 *
 * Modelo de mercado: capitalização diária composta em dias úteis (base 252),
 * com IOF regressivo e IR regressivo aplicados sobre o rendimento bruto
 * ACUMULADO na data de referência (nunca provisionados dia a dia).
 */
export * from "../../../../supabase/functions/_shared/piggy-yield-core";

import {
  annualToDaily,
  businessDaysBetween,
  diffDays,
  parseYmd,
  round,
  settle,
  ymd,
} from "../../../../supabase/functions/_shared/piggy-yield-core";

export interface RatePeriod {
  /** YYYY-MM-DD inclusivo */
  effectiveFrom: string;
  /** taxa anual em % (ex.: 11.15 = 11,15% a.a.) — já ajustada pelo %CDI */
  annualRate: number;
}

export interface PiggyDeposit {
  amount: number;
  depositDate: string;
}

export interface PiggyDetailed {
  principal: number;
  /** saldo BRUTO (principal + rendimento bruto) — valor principal do card */
  balance: number;
  gross: number;
  /** IOF + IR provisionados sobre o bruto acumulado */
  tax: number;
  /** Provisão de IOF em R$ */
  iof: number;
  /** Provisão de IR em R$ */
  ir: number;
  /** Alíquota de IOF aplicada (fração 0 a 0.96) */
  iofRate: number;
  /** Alíquota de IR aplicada (fração 0.15 a 0.225) */
  irRate: number;
  /** Média de dias de aplicação dos aportes */
  holdingDays: number;
  net: number;
  /** Saldo líquido projetado no último dia do mês de referência */
  projectionNetEom: number;
  /** Saldo líquido estimado hoje (= principal + net) */
  currentNet: number;
  /** Taxa atualmente vigente (último período) em % a.a. */
  currentRate: number;
}

/** Taxa anual vigente em uma data, dada a lista de períodos. */
function rateAt(periods: RatePeriod[], date: Date): number {
  let rate = periods[0]?.annualRate ?? 0;
  for (const p of periods) {
    if (parseYmd(p.effectiveFrom) <= date) rate = p.annualRate;
  }
  return rate;
}

/**
 * Valor futuro BRUTO de um aporte, capitalizado em dias úteis (base 252),
 * respeitando as janelas de taxa em `periods`.
 */
export function compoundWithSegments(
  amount: number,
  depositDate: Date,
  asOf: Date,
  periods: RatePeriod[],
): number {
  if (amount <= 0 || !periods.length) return amount;

  const sorted = [...periods].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );

  const markers: Date[] = [depositDate];
  for (const p of sorted) {
    const pd = parseYmd(p.effectiveFrom);
    if (pd > depositDate && pd < asOf) markers.push(pd);
  }
  markers.push(asOf);

  let value = amount;
  for (let i = 0; i < markers.length - 1; i++) {
    const from = markers[i];
    const to = markers[i + 1];
    const du = businessDaysBetween(from, to);
    if (du <= 0) continue;
    const daily = annualToDaily(rateAt(sorted, from));
    if (daily <= 0) continue;
    value = value * Math.pow(1 + daily, du);
  }
  return round(value, 8);
}

/**
 * Cálculo detalhado para a UI. `asOf` = hoje; projeção até o fim do mês.
 *
 * IOF e IR são calculados UMA vez, sobre o rendimento bruto acumulado, com o
 * holding period (dias corridos) médio ponderado dos aportes — assim o líquido
 * melhora quando os aportes cruzam 180/360/720 dias, como nos apps de mercado.
 */
export function computePiggyDetailed(
  deposits: PiggyDeposit[],
  periods: RatePeriod[],
  asOf: Date = new Date(),
): PiggyDetailed {
  const asOfUtc = parseYmd(ymd(new Date(Date.UTC(
    asOf.getFullYear(),
    asOf.getMonth(),
    asOf.getDate(),
  ))));
  const eom = parseYmd(
    ymd(new Date(Date.UTC(asOf.getFullYear(), asOf.getMonth() + 1, 0))),
  );

  let principal = 0;
  let balance = 0;
  let projectedBalance = 0;
  let weightedDays = 0;
  let weightedBase = 0;

  for (const d of deposits) {
    const depDate = String(d.depositDate).slice(0, 10);
    const dep = parseYmd(depDate);
    principal += d.amount;
    if (d.amount >= 0) {
      balance += compoundWithSegments(d.amount, dep, asOfUtc, periods);
      projectedBalance += compoundWithSegments(d.amount, dep, eom, periods);
      const days = Math.max(0, diffDays(depDate, ymd(asOfUtc)));
      weightedDays += d.amount * days;
      weightedBase += d.amount;
    } else {
      balance += d.amount;
      projectedBalance += d.amount;
    }
  }

  const avgDays = weightedBase > 0 ? Math.round(weightedDays / weightedBase) : 0;
  const now = settle({ principal, saldoBruto: balance, diasCorridos: avgDays });
  const diasEom = avgDays + Math.max(0, diffDays(ymd(asOfUtc), ymd(eom)));
  const eomSettle = settle({
    principal,
    saldoBruto: projectedBalance,
    diasCorridos: diasEom,
  });

  const currentRate = periods.length
    ? [...periods].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0].annualRate
    : 0;

  return {
    principal,
    balance: round(balance, 2),
    gross: round(now.rendimentoBruto, 2),
    tax: round(now.iof + now.ir, 2),
    iof: round(now.iof, 2),
    ir: round(now.ir, 2),
    iofRate: now.aliquotaIof,
    irRate: now.aliquotaIr,
    holdingDays: avgDays,
    net: round(now.rendimentoLiquido, 2),
    projectionNetEom: round(eomSettle.rendimentoLiquido, 2),
    currentNet: round(principal + now.rendimentoLiquido, 2),
    currentRate,
  };
}
