// Regras centrais de período para a aba Metas → Evolução.
// Mensal / Trimestral / Semestral / Anual.
// A regra é: o valor do período (para tri/sem/ano) é a MÉDIA dos meses válidos
// (com meta cadastrada, não-futuros). Para "month" retorna o próprio valor.

export type PeriodMode = "month" | "quarter" | "semester" | "year";

export interface PeriodSelection {
  mode: PeriodMode;
  year: number;
  month?: number;      // 1..12 (para mode=month)
  quarter?: 1 | 2 | 3 | 4;
  semester?: 1 | 2;
}

export function monthKey(year: number, month1to12: number): string {
  return `${year}-${String(month1to12).padStart(2, "0")}`;
}

export function currentMonthKey(): string {
  const d = new Date();
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

export function getPeriodMonths(sel: PeriodSelection): string[] {
  const { mode, year } = sel;
  if (mode === "month") {
    const m = sel.month ?? new Date().getMonth() + 1;
    return [monthKey(year, m)];
  }
  if (mode === "quarter") {
    const q = sel.quarter ?? 1;
    const start = (q - 1) * 3 + 1;
    return [0, 1, 2].map((i) => monthKey(year, start + i));
  }
  if (mode === "semester") {
    const s = sel.semester ?? 1;
    const start = (s - 1) * 6 + 1;
    return Array.from({ length: 6 }, (_, i) => monthKey(year, start + i));
  }
  // year
  return Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1));
}

export function getPreviousPeriod(sel: PeriodSelection): PeriodSelection {
  if (sel.mode === "month") {
    const m = sel.month ?? new Date().getMonth() + 1;
    if (m === 1) return { mode: "month", year: sel.year - 1, month: 12 };
    return { mode: "month", year: sel.year, month: m - 1 };
  }
  if (sel.mode === "quarter") {
    const q = (sel.quarter ?? 1);
    if (q === 1) return { mode: "quarter", year: sel.year - 1, quarter: 4 };
    return { mode: "quarter", year: sel.year, quarter: (q - 1) as 1 | 2 | 3 | 4 };
  }
  if (sel.mode === "semester") {
    const s = sel.semester ?? 1;
    if (s === 1) return { mode: "semester", year: sel.year - 1, semester: 2 };
    return { mode: "semester", year: sel.year, semester: 1 };
  }
  return { mode: "year", year: sel.year - 1 };
}

export function labelForPeriod(sel: PeriodSelection): string {
  if (sel.mode === "month") {
    const names = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    return `${names[(sel.month ?? 1) - 1]} ${sel.year}`;
  }
  if (sel.mode === "quarter") return `${sel.quarter}º Trimestre ${sel.year}`;
  if (sel.mode === "semester") return `${sel.semester}º Semestre ${sel.year}`;
  return `${sel.year}`;
}

// Considera meses "válidos" para média: tem meta cadastrada, não é futuro.
export interface MonthDatum {
  monthKey: string;
  hasGoal: boolean;
  isFuture: boolean;
  target: number;
  realized: number;
}

export function computePeriodAverage(months: MonthDatum[]): {
  targetAvg: number;
  realizedAvg: number;
  validCount: number;
} {
  const valid = months.filter((m) => m.hasGoal && !m.isFuture);
  if (valid.length === 0) return { targetAvg: 0, realizedAvg: 0, validCount: 0 };
  const t = valid.reduce((s, m) => s + m.target, 0) / valid.length;
  const r = valid.reduce((s, m) => s + m.realized, 0) / valid.length;
  return { targetAvg: t, realizedAvg: r, validCount: valid.length };
}

export function isGoalReached(inverse: boolean, target: number, realized: number): boolean {
  if (target <= 0) return inverse ? realized === 0 : false;
  return inverse ? realized <= target : realized >= target;
}
