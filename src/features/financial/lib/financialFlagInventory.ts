/**
 * ============================================================================
 * INVENTÁRIO ÚNICO DAS FEATURE FLAGS FINANCEIRAS (FASE 4)
 * ============================================================================
 *
 * Consolida em uma estrutura só o valor EFETIVO de cada flag, a origem da
 * configuração e o ambiente. Nenhum secret é lido ou exposto: apenas flags
 * booleanas `VITE_*` (build-time) e o equivalente Edge (`USE_UNIFIED_REPORTS`).
 */

import {
  useUnifiedFinancialCalculation,
  useUnifiedDashboardCalculation,
  useUnifiedGoalsCalculation,
  useUnifiedReportsCalculation,
  financialDiffDiagnosticsEnabled,
} from "@/features/financial/lib/financialFlags";
import { getFinancialBuildInfo, type FinancialBuildInfo } from "@/features/financial/lib/financialVersion";

export interface FinancialFeatureFlagState {
  unifiedLoanCalculation: boolean;
  unifiedDashboard: boolean;
  unifiedGoals: boolean;
  unifiedReports: boolean;
  unifiedTelegramReports: boolean;
  diagnostics: boolean;
}

export type FlagOrigin = "explicit" | "inherited_global" | "default_off" | "edge_runtime";

export interface FinancialFlagDescriptor {
  key: keyof FinancialFeatureFlagState;
  envKey: string;
  label: string;
  value: boolean;
  origin: FlagOrigin;
  /** Build-time (Vite) exige redeploy para rollback; runtime não. */
  scope: "build-time" | "edge-runtime";
}

export interface FinancialFlagInventory {
  state: FinancialFeatureFlagState;
  descriptors: FinancialFlagDescriptor[];
  build: FinancialBuildInfo;
}

function readRaw(key: string): string | undefined {
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

function isTrue(raw: string | undefined): boolean {
  return ["1", "true", "on", "yes"].includes(String(raw ?? "").trim().toLowerCase());
}

function originFor(envKey: string, effective: boolean, globalOn: boolean): FlagOrigin {
  const raw = readRaw(envKey);
  if (isTrue(raw)) return "explicit";
  if (effective && globalOn) return "inherited_global";
  return "default_off";
}

/**
 * Estado efetivo de todas as flags financeiras.
 *
 * `unifiedTelegramReports` é resolvida no runtime das Edge Functions
 * (`USE_UNIFIED_REPORTS`); no frontend só conseguimos exibir o espelho
 * `VITE_USE_UNIFIED_REPORTS`, o que é sinalizado por `scope: "edge-runtime"`.
 */
export function resolveFinancialFlagInventory(): FinancialFlagInventory {
  const globalOn = useUnifiedFinancialCalculation();
  const state: FinancialFeatureFlagState = {
    unifiedLoanCalculation: globalOn,
    unifiedDashboard: useUnifiedDashboardCalculation(),
    unifiedGoals: useUnifiedGoalsCalculation(),
    unifiedReports: useUnifiedReportsCalculation(),
    unifiedTelegramReports: isTrue(readRaw("USE_UNIFIED_REPORTS")),
    diagnostics: financialDiffDiagnosticsEnabled(),
  };

  const descriptors: FinancialFlagDescriptor[] = [
    {
      key: "unifiedLoanCalculation",
      envKey: "VITE_USE_UNIFIED_FINANCIAL_CALCULATION",
      label: "Cálculo unificado (Empréstimos + Payment Hub)",
      value: state.unifiedLoanCalculation,
      origin: originFor("VITE_USE_UNIFIED_FINANCIAL_CALCULATION", state.unifiedLoanCalculation, globalOn),
      scope: "build-time",
    },
    {
      key: "unifiedDashboard",
      envKey: "VITE_USE_UNIFIED_DASHBOARD",
      label: "Dashboard",
      value: state.unifiedDashboard,
      origin: originFor("VITE_USE_UNIFIED_DASHBOARD", state.unifiedDashboard, globalOn),
      scope: "build-time",
    },
    {
      key: "unifiedGoals",
      envKey: "VITE_USE_UNIFIED_GOALS",
      label: "Metas / pontuação",
      value: state.unifiedGoals,
      origin: originFor("VITE_USE_UNIFIED_GOALS", state.unifiedGoals, globalOn),
      scope: "build-time",
    },
    {
      key: "unifiedReports",
      envKey: "VITE_USE_UNIFIED_REPORTS",
      label: "Relatórios internos e exportados",
      value: state.unifiedReports,
      origin: originFor("VITE_USE_UNIFIED_REPORTS", state.unifiedReports, globalOn),
      scope: "build-time",
    },
    {
      key: "unifiedTelegramReports",
      envKey: "USE_UNIFIED_REPORTS",
      label: "Relatórios do Telegram (Edge Functions)",
      value: state.unifiedTelegramReports,
      origin: state.unifiedTelegramReports ? "edge_runtime" : "default_off",
      scope: "edge-runtime",
    },
    {
      key: "diagnostics",
      envKey: "VITE_FINANCIAL_DIFF_DIAGNOSTICS",
      label: "Diagnóstico antigo × novo",
      value: state.diagnostics,
      origin: originFor("VITE_FINANCIAL_DIFF_DIAGNOSTICS", state.diagnostics, globalOn),
      scope: "build-time",
    },
  ];

  return { state, descriptors, build: getFinancialBuildInfo() };
}
