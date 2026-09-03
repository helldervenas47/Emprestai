/**
 * ============================================================================
 * VERSÃO EXPLÍCITA DO CÁLCULO FINANCEIRO (FASE 4)
 * ============================================================================
 *
 * Toda observabilidade, diagnóstico, exportação, dry-run e backfill devem
 * carregar esta versão. Pagamentos ANTIGOS nunca são reescritos apenas para
 * receber a versão — ela só é anexada a registros novos.
 */

export const UNIFIED_FINANCIAL_VERSION = "unified_financial_v1";

export interface FinancialBuildInfo {
  calculationVersion: string;
  environment: string;
  commit: string | null;
  buildDate: string | null;
}

function env(key: string): string | undefined {
  try {
    const e = (import.meta as any)?.env;
    if (e && e[key] != null) return String(e[key]);
  } catch {
    /* noop */
  }
  try {
    if (typeof process !== "undefined" && process.env && process.env[key] != null) {
      return String(process.env[key]);
    }
  } catch {
    /* noop */
  }
  return undefined;
}

/** Ambiente efetivo (nunca expõe secrets, apenas rótulos de deploy). */
export function resolveEnvironment(): string {
  return env("VITE_VERCEL_ENV") ?? env("MODE") ?? (env("DEV") === "true" ? "development" : "production");
}

/** Metadados de build usados no painel e nos eventos de observabilidade. */
export function getFinancialBuildInfo(): FinancialBuildInfo {
  const commit = env("VITE_VERCEL_GIT_COMMIT_SHA") ?? env("VITE_COMMIT_SHA") ?? null;
  return {
    calculationVersion: UNIFIED_FINANCIAL_VERSION,
    environment: resolveEnvironment(),
    commit: commit ? commit.slice(0, 12) : null,
    buildDate: env("VITE_BUILD_DATE") ?? null,
  };
}
