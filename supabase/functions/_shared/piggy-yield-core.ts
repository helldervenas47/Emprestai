/**
 * ============================================================================
 * NÚCLEO ÚNICO DE RENDIMENTO DE COFRINHOS (padrão de mercado brasileiro)
 * ============================================================================
 *
 * Arquivo PURO (sem imports) compartilhado por Edge Functions e pelo frontend
 * (via `src/features/piggyBanks/lib/piggyTax.ts`, que apenas reexporta).
 *
 * Modelo (igual a CDB DI / Nubank Caixinhas / Investidor 10):
 *
 *   1. Capitalização DIÁRIA COMPOSTA em dias úteis (BACEN SGS 11):
 *        fator_dia   = 1 + (cdi_diario × %CDI/100)
 *        saldo_bruto = principal × Π fator_dia
 *
 *   2. IOF e IR NÃO são fatos diários — são provisão calculada sobre o
 *      rendimento bruto ACUMULADO, usando o holding period (dias corridos
 *      desde o aporte até a data de referência/resgate):
 *        IOF = rend_bruto × tabela_iof(dias_corridos)     (0 se >= 30 dias)
 *        IR  = (rend_bruto − IOF) × aliquota_ir(dias_corridos)
 *
 *   3. Líquido = principal + rend_bruto − IOF − IR
 *
 * Consequência desejada: ao cruzar 180/360/720 dias, TODO o rendimento
 * acumulado passa a ser tributado pela alíquota menor (o líquido "melhora"
 * com o tempo), exatamente como nos apps de mercado.
 */

/** Tabela regressiva de IOF sobre o rendimento (dias corridos 1..29). */
export const IOF_TABLE: number[] = [
  0.96, 0.93, 0.90, 0.86, 0.83, 0.80, 0.76, 0.73, 0.70, 0.66,
  0.63, 0.60, 0.56, 0.53, 0.50, 0.46, 0.43, 0.40, 0.36, 0.33,
  0.30, 0.26, 0.23, 0.20, 0.16, 0.13, 0.10, 0.06, 0.03,
];

/** Alíquota de IOF (fração 0..0.96) para o holding period em dias corridos. */
export function iofRate(diasCorridos: number): number {
  const d = Math.floor(diasCorridos);
  if (d <= 0) return IOF_TABLE[0];
  if (d >= 30) return 0;
  return IOF_TABLE[d - 1] ?? 0;
}

/** IR regressivo de renda fixa (fração) para o holding period em dias corridos. */
export function irRate(diasCorridos: number): number {
  const d = Math.floor(diasCorridos);
  if (d <= 180) return 0.225;
  if (d <= 360) return 0.20;
  if (d <= 720) return 0.175;
  return 0.15;
}

export function round(value: number, places = 8): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(places));
}

const MS_DAY = 86_400_000;

export function parseYmd(s: string): Date {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Dias corridos entre duas datas YYYY-MM-DD (pode ser negativo). */
export function diffDays(inicio: string, fim: string): number {
  return Math.floor((parseYmd(fim).getTime() - parseYmd(inicio).getTime()) / MS_DAY);
}

/** Fator diário de um dia útil, já ajustado pelo %CDI do cofrinho. */
export function dailyFactor(cdiDiario: number, percentualCdi = 100): number {
  const taxa = Number(cdiDiario) || 0;
  const pct = Number(percentualCdi ?? 100) || 0;
  if (taxa <= 0 || pct <= 0) return 1;
  return 1 + taxa * (pct / 100);
}

/** Converte taxa anual (% a.a.) em taxa diária em dias úteis (252). */
export function annualToDaily(annualPercent: number): number {
  const a = Number(annualPercent) || 0;
  if (a <= 0) return 0;
  return Math.pow(1 + a / 100, 1 / 252) - 1;
}

/** Converte taxa diária (fração) em taxa anual (% a.a., base 252). */
export function dailyToAnnual(daily: number): number {
  const d = Number(daily) || 0;
  if (d <= 0) return 0;
  return (Math.pow(1 + d, 252) - 1) * 100;
}

export interface DailyRateRow {
  /** YYYY-MM-DD */
  data: string;
  /** taxa diária em fração (ex.: 0.000445 = 0,0445% a.d.) */
  cdiDiario: number;
}

export interface SettlementInput {
  principal: number;
  saldoBruto: number;
  /** dias corridos entre o aporte e a data de referência/resgate */
  diasCorridos: number;
}

export interface Settlement {
  principal: number;
  saldoBruto: number;
  rendimentoBruto: number;
  iof: number;
  ir: number;
  aliquotaIof: number;
  aliquotaIr: number;
  rendimentoLiquido: number;
  saldoLiquido: number;
}

/**
 * Aplica IOF + IR sobre o rendimento bruto ACUMULADO (nunca dia a dia).
 * Esta é a única função que deve calcular imposto no sistema.
 */
export function settle({ principal, saldoBruto, diasCorridos }: SettlementInput): Settlement {
  const p = Number(principal) || 0;
  const bruto = Math.max(0, (Number(saldoBruto) || 0) - p);
  const aliquotaIof = iofRate(diasCorridos);
  const aliquotaIr = irRate(diasCorridos);
  const iof = round(bruto * aliquotaIof, 8);
  const ir = round(Math.max(0, bruto - iof) * aliquotaIr, 8);
  const liquido = round(bruto - iof - ir, 8);
  return {
    principal: p,
    saldoBruto: round(p + bruto, 8),
    rendimentoBruto: round(bruto, 8),
    iof,
    ir,
    aliquotaIof,
    aliquotaIr,
    rendimentoLiquido: liquido,
    saldoLiquido: round(p + liquido, 8),
  };
}

export interface DailyYieldRow {
  data: string;
  /** principal do aporte (nunca muda) */
  saldoPrincipal: number;
  percentualCdi: number;
  taxaCdi: number;
  /** rendimento bruto DO DIA (sobre o saldo bruto do dia anterior) */
  rendimentoDia: number;
  /** rendimento bruto acumulado até o dia */
  rendimentoBrutoAcumulado: number;
  /** saldo bruto acumulado (principal + bruto) */
  saldoBruto: number;
  /** provisão de IOF sobre o acumulado, na data */
  iof: number;
  /** provisão de IR sobre o acumulado, na data */
  imposto: number;
  /** rendimento líquido estimado acumulado na data */
  rendimentoLiquidoAcumulado: number;
  /** saldo líquido estimado na data */
  saldoLiquido: number;
  diasCorridos: number;
}

export interface CompoundResult {
  principal: number;
  percentualCdi: number;
  rows: DailyYieldRow[];
  saldoBruto: number;
  rendimentoBruto: number;
  settlement: Settlement;
  ultimaData: string | null;
}

/**
 * Capitalização diária composta de um aporte.
 *
 * @param principal      valor do aporte (saldo restante)
 * @param dataAporte     YYYY-MM-DD
 * @param rates          taxas diárias (apenas dias úteis publicados pelo BACEN),
 *                       ordenadas asc e já filtradas pelo intervalo desejado
 * @param percentualCdi  % do CDI do cofrinho (100, 110, ...)
 * @param saldoBrutoInicial saldo bruto já acumulado antes do primeiro dia de
 *                       `rates` (para cálculo incremental). Default: principal.
 */
export function compoundDeposit(
  principal: number,
  dataAporte: string,
  rates: DailyRateRow[],
  percentualCdi = 100,
  saldoBrutoInicial?: number,
): CompoundResult {
  const p = Number(principal) || 0;
  const pct = Number(percentualCdi ?? 100) || 100;
  let saldoBruto = Number.isFinite(saldoBrutoInicial as number)
    ? Number(saldoBrutoInicial)
    : p;
  if (saldoBruto < p) saldoBruto = p;

  const rows: DailyYieldRow[] = [];
  let ultimaData: string | null = null;

  if (p > 0) {
    for (const r of rates) {
      const taxa = Number(r.cdiDiario) || 0;
      if (taxa <= 0) continue;
      const diasCorridos = diffDays(dataAporte, r.data);
      if (diasCorridos < 0) continue;

      const anterior = saldoBruto;
      saldoBruto = round(anterior * dailyFactor(taxa, pct), 8);
      const rendimentoDia = round(saldoBruto - anterior, 8);
      const s = settle({ principal: p, saldoBruto, diasCorridos });

      rows.push({
        data: r.data,
        saldoPrincipal: p,
        percentualCdi: pct,
        taxaCdi: taxa,
        rendimentoDia,
        rendimentoBrutoAcumulado: s.rendimentoBruto,
        saldoBruto: round(saldoBruto, 8),
        iof: s.iof,
        imposto: s.ir,
        rendimentoLiquidoAcumulado: s.rendimentoLiquido,
        saldoLiquido: s.saldoLiquido,
        diasCorridos,
      });
      ultimaData = r.data;
    }
  }

  const diasFinais = ultimaData ? diffDays(dataAporte, ultimaData) : 0;
  const settlement = settle({ principal: p, saldoBruto, diasCorridos: diasFinais });

  return {
    principal: p,
    percentualCdi: pct,
    rows,
    saldoBruto: round(saldoBruto, 8),
    rendimentoBruto: settlement.rendimentoBruto,
    settlement,
    ultimaData,
  };
}

/**
 * Projeção sintética quando não há série de CDI disponível para o período
 * (ex.: projeção de fim de mês). Usa a taxa anual vigente convertida para
 * base 252 e conta apenas dias úteis (seg–sex) entre as datas.
 */
export function businessDaysBetween(inicio: Date, fim: Date): number {
  if (fim <= inicio) return 0;
  let count = 0;
  const cur = new Date(inicio.getTime());
  while (cur < fim) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function projectGross(
  principal: number,
  annualPercent: number,
  businessDays: number,
): number {
  const p = Number(principal) || 0;
  if (p <= 0 || businessDays <= 0) return p;
  const daily = annualToDaily(annualPercent);
  if (daily <= 0) return p;
  return round(p * Math.pow(1 + daily, businessDays), 8);
}
