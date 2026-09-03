/**
 * Feature flags do módulo financeiro.
 *
 * `VITE_USE_UNIFIED_FINANCIAL_CALCULATION`
 *   false / ausente (default) → mantém EXATAMENTE as fórmulas atuais.
 *   true                      → módulos migrados passam a ler
 *                               `calculateLoanFinancialState`.
 *
 * Fase 3 adiciona flags POR MÓDULO, para migrar consumidores de leitura um a
 * um (Dashboard, Metas, Relatórios, Telegram) sem ligar tudo de uma vez.
 * Cada flag específica também é ativada quando a flag global está ligada.
 *
 * A flag existe para permitir comparação em preview sem afetar produção.
 * Nenhuma função legada foi removida e nenhum dado histórico é alterado.
 */

function readEnv(key: string): string | undefined {
  try {
    // Vite (browser/build)
    const env = (import.meta as any)?.env;
    if (env && env[key] != null) return String(env[key]);
  } catch {
    /* noop */
  }
  try {
    // Node/Vitest
    if (typeof process !== "undefined" && process.env && process.env[key] != null) {
      return String(process.env[key]);
    }
  } catch {
    /* noop */
  }
  return undefined;
}

function isTrue(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "on", "yes"].includes(value.trim().toLowerCase());
}

/** Nova fórmula unificada ativa? Default: NÃO (regra atual preservada). */
export function useUnifiedFinancialCalculation(): boolean {
  return isTrue(readEnv("VITE_USE_UNIFIED_FINANCIAL_CALCULATION"));
}

/** Dashboard (cards de carteira, capital ativo, total a receber). */
export function useUnifiedDashboardCalculation(): boolean {
  return useUnifiedFinancialCalculation()
    || isTrue(readEnv("VITE_USE_UNIFIED_DASHBOARD"));
}

/** Metas / pontuação mensal (capital ativo e lucro realizado). */
export function useUnifiedGoalsCalculation(): boolean {
  return useUnifiedFinancialCalculation()
    || isTrue(readEnv("VITE_USE_UNIFIED_GOALS"));
}

/** Relatórios internos e exportados. */
export function useUnifiedReportsCalculation(): boolean {
  return useUnifiedFinancialCalculation()
    || isTrue(readEnv("VITE_USE_UNIFIED_REPORTS"));
}

/** Modo diagnóstico: executa antigo × novo e registra divergências. */
export function financialDiffDiagnosticsEnabled(): boolean {
  return isTrue(readEnv("VITE_FINANCIAL_DIFF_DIAGNOSTICS"))
    || useUnifiedFinancialCalculation();
}

export interface FinancialFlagsSnapshot {
  unifiedGlobal: boolean;
  unifiedDashboard: boolean;
  unifiedGoals: boolean;
  unifiedReports: boolean;
  diagnostics: boolean;
}

/** Snapshot legível de todas as flags (usado no painel de diagnóstico). */
export function resolveFinancialFlags(): FinancialFlagsSnapshot {
  return {
    unifiedGlobal: useUnifiedFinancialCalculation(),
    unifiedDashboard: useUnifiedDashboardCalculation(),
    unifiedGoals: useUnifiedGoalsCalculation(),
    unifiedReports: useUnifiedReportsCalculation(),
    diagnostics: financialDiffDiagnosticsEnabled(),
  };
}
