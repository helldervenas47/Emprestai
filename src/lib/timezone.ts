// Centralized timezone helpers. The app timezone is loaded from
// account_settings.timezone (per data owner) and cached in memory so synchronous
// helpers like todayInAppTz() can be used inside React renders and effects.

let cachedTz: string = "America/Sao_Paulo";
const listeners = new Set<(tz: string) => void>();

export function getAppTimezone(): string {
  return cachedTz;
}

export function setAppTimezone(tz: string) {
  if (!tz || tz === cachedTz) return;
  cachedTz = tz;
  listeners.forEach((cb) => {
    try { cb(tz); } catch { /* noop */ }
  });
}

export function subscribeAppTimezone(cb: (tz: string) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Returns "YYYY-MM-DD" for "today" in the configured timezone. */
export function todayInAppTz(date: Date = new Date()): string {
  return formatYmdInTz(date, cachedTz);
}

/**
 * Returns a Date whose local Y/M/D components match "today" in the configured
 * app timezone (time set to 00:00 local). Useful as a TZ-aware replacement for
 * `new Date()` whenever you only care about the calendar day.
 */
export function todayDateInAppTz(): Date {
  const [y, m, d] = todayInAppTz().split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format any Date as "YYYY-MM-DD" in the configured timezone. */
export function formatYmdInAppTz(date: Date): string {
  return formatYmdInTz(date, cachedTz);
}

/** Format a Date as "YYYY-MM-DD" in an arbitrary timezone using Intl. */
export function formatYmdInTz(date: Date, tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // en-CA already returns YYYY-MM-DD
    return fmt.format(date);
  } catch {
    return date.toISOString().split("T")[0];
  }
}

/** Returns true when a "YYYY-MM-DD" due date is strictly before today (in app tz). */
export function isOverdueYmd(dueDate: string | undefined | null, todayStr = todayInAppTz()): boolean {
  if (!dueDate) return false;
  return dueDate.substring(0, 10) < todayStr;
}

/**
 * Retorna a quantidade de dias civis inteiros entre duas datas no formato YYYY-MM-DD.
 * Se fromDate = "2026-09-01" e toDate = "2026-09-06", retorna 5.
 * Se fromDate = toDate, retorna 0.
 * Utiliza Date.UTC para ser 100% imune a horário de verão, fuso local e horários de transição.
 */
export function differenceInCalendarDaysYmd(fromDateYmd: string, toDateYmd: string): number {
  if (!fromDateYmd || !toDateYmd) return 0;
  const [y1, m1, d1] = fromDateYmd.substring(0, 10).split("-").map(Number);
  const [y2, m2, d2] = toDateYmd.substring(0, 10).split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
  const ut1 = Date.UTC(y1, m1 - 1, d1);
  const ut2 = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((ut2 - ut1) / 86_400_000);
}

/**
 * Retorna os dias de atraso de um vencimento em relação a "hoje" no fuso do app.
 * - Se dueDate = hoje ou futuro: retorna 0 (NÃO atrasado).
 * - Se dueDate = ontem: retorna 1.
 * - Se dueDate = há 7 dias: retorna 7.
 * - Se dueDate = há 30 dias: retorna 30.
 * - Se dueDate = há 60 dias: retorna 60.
 * - Se dueDate = há 61 dias: retorna 61.
 */
export function getDaysOverdueFromYmd(dueDateYmd: string | undefined | null, todayStr = todayInAppTz()): number {
  if (!dueDateYmd) return 0;
  const diff = differenceInCalendarDaysYmd(dueDateYmd, todayStr);
  return Math.max(0, diff);
}

export type DelinquencyBucketId = "1-7" | "8-30" | "31-60" | "60+";

/**
 * Classifica a quantidade de dias de atraso estritamente na faixa correspondente:
 * - 0 dias: null (não atrasado)
 * - 1 a 7 dias: "1-7"
 * - 8 a 30 dias: "8-30"
 * - 31 a 60 dias: "31-60"
 * - 61+ dias: "60+"
 * Sem sobreposição e sem lacunas.
 */
export function getDelinquencyBucketId(daysOverdue: number): DelinquencyBucketId | null {
  if (daysOverdue <= 0) return null;
  if (daysOverdue <= 7) return "1-7";
  if (daysOverdue <= 30) return "8-30";
  if (daysOverdue <= 60) return "31-60";
  return "60+";
}

/** Common IANA timezones grouped for the settings selector. */
export const COMMON_TIMEZONES: { label: string; value: string }[] = [
  { label: "Brasil — Brasília (GMT-3)", value: "America/Sao_Paulo" },
  { label: "Brasil — Manaus (GMT-4)", value: "America/Manaus" },
  { label: "Brasil — Cuiabá (GMT-4)", value: "America/Cuiaba" },
  { label: "Brasil — Rio Branco (GMT-5)", value: "America/Rio_Branco" },
  { label: "Brasil — Belém (GMT-3)", value: "America/Belem" },
  { label: "Brasil — Fortaleza (GMT-3)", value: "America/Fortaleza" },
  { label: "Brasil — Recife (GMT-3)", value: "America/Recife" },
  { label: "Brasil — Bahia (GMT-3)", value: "America/Bahia" },
  { label: "Brasil — Noronha (GMT-2)", value: "America/Noronha" },
  { label: "Argentina — Buenos Aires (GMT-3)", value: "America/Argentina/Buenos_Aires" },
  { label: "Chile — Santiago (GMT-4)", value: "America/Santiago" },
  { label: "Uruguai — Montevidéu (GMT-3)", value: "America/Montevideo" },
  { label: "Paraguai — Assunção (GMT-4)", value: "America/Asuncion" },
  { label: "EUA — Nova York (GMT-5)", value: "America/New_York" },
  { label: "EUA — Los Angeles (GMT-8)", value: "America/Los_Angeles" },
  { label: "Portugal — Lisboa (GMT+0)", value: "Europe/Lisbon" },
  { label: "Espanha — Madri (GMT+1)", value: "Europe/Madrid" },
  { label: "UTC", value: "UTC" },
];
