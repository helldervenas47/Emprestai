/**
 * ============================================================================
 * LINHA DE BASE DO COMPORTAMENTO LEGADO (FASE 5)
 * ============================================================================
 *
 * Antes de ligar qualquer flag, a Fase 5 exige registrar o que o app LEGADO
 * mostra hoje. Este módulo é PURO: recebe as capturas dos módulos e devolve
 * uma linha de base identificável, comparável e exportável.
 *
 * Nada aqui escreve no banco. Nada aqui altera cálculo.
 */

import { UNIFIED_FINANCIAL_VERSION } from "@/features/financial/lib/financialVersion";
import { roundCurrency } from "@/lib/money";

export const BASELINE_MODULES = [
  "loans",
  "payment_hub",
  "dashboard",
  "goals",
  "reports",
  "exports",
  "telegram",
] as const;

export type BaselineModule = (typeof BASELINE_MODULES)[number];

export const BASELINE_MODULE_LABELS: Record<BaselineModule, string> = {
  loans: "Empréstimos",
  payment_hub: "Payment Hub",
  dashboard: "Dashboard",
  goals: "Metas",
  reports: "Relatórios",
  exports: "Exportações",
  telegram: "Telegram",
};

export interface BaselineModuleCapture {
  module: BaselineModule;
  /** Valores exibidos pelo módulo (métrica → valor em R$ ou contagem). */
  values: Record<string, number>;
  /** Tempo de carregamento observado, em ms. */
  loadMs?: number;
  queryCount?: number;
  warnings?: string[];
  errors?: string[];
  /** Status HTTP / textual das Edge Functions envolvidas. */
  edgeResponse?: string;
  /** Nome dos artefatos gerados (CSV/JSON/PDF) na captura. */
  artifacts?: string[];
  captured: boolean;
}

export interface BaselineCaptureInput {
  environment: string;
  commit: string | null;
  capturedAt?: string;
  periodLabel?: string;
  userIdHash?: string;
  modules: BaselineModuleCapture[];
}

export interface FinancialBaseline {
  id: string;
  calculationVersion: string;
  mode: "legacy";
  environment: string;
  commit: string | null;
  capturedAt: string;
  periodLabel?: string;
  userIdHash?: string;
  modules: BaselineModuleCapture[];
  /** Módulos ainda sem captura — bloqueiam o início do rollout. */
  missingModules: BaselineModule[];
  complete: boolean;
}

function dateStamp(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

/** Identificador oficial: `baseline_legacy_<data>_<commit>`. */
export function buildBaselineId(capturedAt: string, commit: string | null): string {
  return `baseline_legacy_${dateStamp(capturedAt)}_${(commit ?? "nocommit").slice(0, 12)}`;
}

/** Monta a linha de base e aponta o que ainda falta capturar. */
export function buildFinancialBaseline(input: BaselineCaptureInput): FinancialBaseline {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const byModule = new Map(input.modules.map((m) => [m.module, m]));
  const modules = BASELINE_MODULES.map<BaselineModuleCapture>((module) => {
    const found = byModule.get(module);
    if (found) return { ...found, captured: found.captured !== false };
    return { module, values: {}, captured: false };
  });
  const missingModules = modules.filter((m) => !m.captured).map((m) => m.module);

  return {
    id: buildBaselineId(capturedAt, input.commit),
    calculationVersion: UNIFIED_FINANCIAL_VERSION,
    mode: "legacy",
    environment: input.environment,
    commit: input.commit,
    capturedAt,
    periodLabel: input.periodLabel,
    userIdHash: input.userIdHash,
    modules,
    missingModules,
    complete: missingModules.length === 0,
  };
}

/* ==========================================================================
 * COMPARAÇÃO LINHA DE BASE × ESTADO COM A FLAG LIGADA
 * ========================================================================== */

export type BaselineDiffStatus = "OK" | "WARNING" | "CRITICAL" | "MISSING";

export interface BaselineMetricDiff {
  module: BaselineModule;
  metric: string;
  baselineValue: number | null;
  currentValue: number | null;
  difference: number;
  status: BaselineDiffStatus;
}

export interface BaselineComparison {
  baselineId: string;
  rows: BaselineMetricDiff[];
  ok: boolean;
  largestDifference: number;
  criticalCount: number;
  warningCount: number;
  missingCount: number;
}

export const PARITY_OK_TOLERANCE = 0.01;
export const PARITY_WARNING_TOLERANCE = 10;

export function classifyDifference(difference: number): BaselineDiffStatus {
  const d = Math.abs(roundCurrency(difference));
  if (d <= PARITY_OK_TOLERANCE) return "OK";
  if (d <= PARITY_WARNING_TOLERANCE) return "WARNING";
  return "CRITICAL";
}

/**
 * Compara a linha de base legada com a captura atual (flag ligada).
 * Diferença de formatação nunca chega aqui: só números.
 */
export function compareWithBaseline(
  baseline: FinancialBaseline,
  current: BaselineModuleCapture[],
): BaselineComparison {
  const currentByModule = new Map(current.map((m) => [m.module, m]));
  const rows: BaselineMetricDiff[] = [];

  for (const captured of baseline.modules) {
    const now = currentByModule.get(captured.module);
    const metrics = new Set([
      ...Object.keys(captured.values ?? {}),
      ...Object.keys(now?.values ?? {}),
    ]);
    for (const metric of metrics) {
      const baselineValue = captured.values?.[metric];
      const currentValue = now?.values?.[metric];
      if (baselineValue == null || currentValue == null) {
        rows.push({
          module: captured.module,
          metric,
          baselineValue: baselineValue ?? null,
          currentValue: currentValue ?? null,
          difference: 0,
          status: "MISSING",
        });
        continue;
      }
      const difference = roundCurrency(currentValue - baselineValue);
      rows.push({
        module: captured.module,
        metric,
        baselineValue: roundCurrency(baselineValue),
        currentValue: roundCurrency(currentValue),
        difference,
        status: classifyDifference(difference),
      });
    }
  }

  const largestDifference = rows.reduce((m, r) => Math.max(m, Math.abs(r.difference)), 0);
  const criticalCount = rows.filter((r) => r.status === "CRITICAL").length;
  const warningCount = rows.filter((r) => r.status === "WARNING").length;
  const missingCount = rows.filter((r) => r.status === "MISSING").length;

  return {
    baselineId: baseline.id,
    rows: rows.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)),
    ok: criticalCount === 0 && missingCount === 0,
    largestDifference: roundCurrency(largestDifference),
    criticalCount,
    warningCount,
    missingCount,
  };
}

export function baselineToJson(baseline: FinancialBaseline): string {
  return JSON.stringify(baseline, null, 2);
}

export function baselineToCsv(baseline: FinancialBaseline): string {
  const header = ["baselineId", "module", "metric", "value", "loadMs", "queryCount", "captured"].join(";");
  const lines: string[] = [];
  for (const m of baseline.modules) {
    const entries = Object.entries(m.values ?? {});
    if (entries.length === 0) {
      lines.push([baseline.id, m.module, "", "", m.loadMs ?? "", m.queryCount ?? "", m.captured].join(";"));
      continue;
    }
    for (const [metric, value] of entries) {
      lines.push([
        baseline.id, m.module, metric, roundCurrency(value), m.loadMs ?? "", m.queryCount ?? "", m.captured,
      ].join(";"));
    }
  }
  return [header, ...lines].join("\n");
}
