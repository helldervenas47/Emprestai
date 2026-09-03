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
export function isOverdueYmd(dueDate: string | undefined | null): boolean {
  if (!dueDate) return false;
  return dueDate < todayInAppTz();
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
