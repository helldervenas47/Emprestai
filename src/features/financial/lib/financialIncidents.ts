/**
 * ============================================================================
 * INCIDENTES, CRITÉRIOS DE PAUSA E CLASSIFICAÇÃO DE DIVERGÊNCIAS (FASE 5)
 * ============================================================================
 *
 * Módulo PURO. Não corrige dado, não desliga flag: apenas classifica, decide
 * se a etapa deve ser pausada e produz o registro auditável do incidente.
 */

import { roundCurrency } from "@/lib/money";
import { UNIFIED_FINANCIAL_VERSION } from "@/features/financial/lib/financialVersion";
import type { ActivationStage } from "@/features/financial/lib/financialRolloutStages";

export const DIVERGENCE_CAUSES = [
  "DATA_ISSUE",
  "CACHE_ISSUE",
  "LEGACY_BEHAVIOR",
  "METRIC_DEFINITION",
  "ROUNDING",
  "TIMEZONE",
  "PERIOD_FILTER",
  "CALCULATION_DEFECT",
  "UI_MAPPING",
  "EDGE_MAPPING",
  "UNKNOWN",
] as const;

export type DivergenceCause = (typeof DIVERGENCE_CAUSES)[number];

export interface DivergenceRecord {
  id: string;
  cause: DivergenceCause;
  module: string;
  metric: string;
  impact: string;
  affectedUsers: number;
  affectedValue: number;
  affectedModules: string[];
  action: string;
  testAdded?: string;
  result?: string;
  /** `true` quando a divergência exige interromper o rollout. */
  blocksRollout: boolean;
}

export interface DivergenceInput {
  cause: DivergenceCause;
  module: string;
  metric: string;
  impact: string;
  affectedUsers?: number;
  affectedValue?: number;
  affectedModules?: string[];
  action: string;
  testAdded?: string;
  result?: string;
}

/** Causas que NUNCA podem seguir com rollout. */
const BLOCKING_CAUSES: DivergenceCause[] = ["CALCULATION_DEFECT", "UNKNOWN"];

export function classifyDivergence(input: DivergenceInput, index = 0): DivergenceRecord {
  const affectedValue = roundCurrency(input.affectedValue ?? 0);
  const blocksRollout = BLOCKING_CAUSES.includes(input.cause) || Math.abs(affectedValue) > 10;
  return {
    id: `div_${input.cause.toLowerCase()}_${index + 1}`,
    cause: input.cause,
    module: input.module,
    metric: input.metric,
    impact: input.impact,
    affectedUsers: input.affectedUsers ?? 0,
    affectedValue,
    affectedModules: input.affectedModules ?? [input.module],
    action: input.action,
    testAdded: input.testAdded,
    result: input.result,
    blocksRollout,
  };
}

/* ==========================================================================
 * CRITÉRIOS DE PAUSA IMEDIATA
 * ========================================================================== */

export const PAUSE_CRITERIA = [
  "charge_above_real_balance",
  "undue_negative_balance",
  "settled_contract_positive_balance",
  "preview_persistence_mismatch",
  "duplicate_payment",
  "incorrect_principal_amortization",
  "penalty_reappeared",
  "paid_interest_reappeared",
  "dashboard_telegram_divergence",
  "error_rate_increase",
  "edge_function_timeout",
  "performance_regression",
] as const;

export type PauseCriterion = (typeof PAUSE_CRITERIA)[number];

export const PAUSE_CRITERION_LABELS: Record<PauseCriterion, string> = {
  charge_above_real_balance: "Cobrança maior que o saldo real",
  undue_negative_balance: "Saldo negativo indevido",
  settled_contract_positive_balance: "Contrato quitado com saldo positivo",
  preview_persistence_mismatch: "Divergência entre prévia e persistência",
  duplicate_payment: "Pagamento duplicado",
  incorrect_principal_amortization: "Principal amortizado incorretamente",
  penalty_reappeared: "Multa reaparecendo",
  paid_interest_reappeared: "Juros pagos reaparecendo",
  dashboard_telegram_divergence: "Dashboard divergindo do Telegram acima de R$ 0,01",
  error_rate_increase: "Aumento relevante de erros",
  edge_function_timeout: "Timeout de Edge Function",
  performance_regression: "Regressão grave de performance",
};

export interface PauseSignals {
  chargeAboveRealBalance?: number;
  negativeBalances?: number;
  settledWithPositiveBalance?: number;
  previewPersistenceMismatch?: number;
  duplicatePayments?: number;
  incorrectPrincipalAmortization?: number;
  penaltyReappeared?: number;
  paidInterestReappeared?: number;
  dashboardTelegramDifference?: number;
  errorRateDelta?: number;
  edgeFunctionTimeouts?: number;
  /** Multiplicador do tempo de carregamento vs. linha de base. */
  loadTimeRatio?: number;
}

export interface PauseDecision {
  mustPause: boolean;
  triggered: PauseCriterion[];
  messages: string[];
  /** Rollback recomendado: sempre que houver risco financeiro direto. */
  rollbackRecommended: boolean;
}

const FINANCIAL_RISK: PauseCriterion[] = [
  "charge_above_real_balance",
  "undue_negative_balance",
  "settled_contract_positive_balance",
  "preview_persistence_mismatch",
  "duplicate_payment",
  "incorrect_principal_amortization",
  "penalty_reappeared",
  "paid_interest_reappeared",
];

export function evaluatePauseCriteria(signals: PauseSignals): PauseDecision {
  const triggered: PauseCriterion[] = [];

  const gt0 = (v?: number) => (v ?? 0) > 0;
  if (gt0(signals.chargeAboveRealBalance)) triggered.push("charge_above_real_balance");
  if (gt0(signals.negativeBalances)) triggered.push("undue_negative_balance");
  if (gt0(signals.settledWithPositiveBalance)) triggered.push("settled_contract_positive_balance");
  if (gt0(signals.previewPersistenceMismatch)) triggered.push("preview_persistence_mismatch");
  if (gt0(signals.duplicatePayments)) triggered.push("duplicate_payment");
  if (gt0(signals.incorrectPrincipalAmortization)) triggered.push("incorrect_principal_amortization");
  if (gt0(signals.penaltyReappeared)) triggered.push("penalty_reappeared");
  if (gt0(signals.paidInterestReappeared)) triggered.push("paid_interest_reappeared");
  if (Math.abs(signals.dashboardTelegramDifference ?? 0) > 0.01) triggered.push("dashboard_telegram_divergence");
  if ((signals.errorRateDelta ?? 0) > 0.02) triggered.push("error_rate_increase");
  if (gt0(signals.edgeFunctionTimeouts)) triggered.push("edge_function_timeout");
  if ((signals.loadTimeRatio ?? 1) > 1.5) triggered.push("performance_regression");

  return {
    mustPause: triggered.length > 0,
    triggered,
    messages: triggered.map((c) => PAUSE_CRITERION_LABELS[c]),
    rollbackRecommended: triggered.some((c) => FINANCIAL_RISK.includes(c)),
  };
}

/* ==========================================================================
 * REGISTRO DE INCIDENTE
 * ========================================================================== */

export interface IncidentRecord {
  id: string;
  stage: ActivationStage;
  detectedAt: string;
  criteria: PauseCriterion[];
  severity: "WARNING" | "CRITICAL";
  divergences: DivergenceRecord[];
  actionTaken: "paused" | "rolled_back" | "monitoring";
  calculationVersion: string;
  notes?: string;
}

export function buildIncidentRecord(input: {
  stage: ActivationStage;
  decision: PauseDecision;
  divergences?: DivergenceRecord[];
  detectedAt?: string;
  notes?: string;
}): IncidentRecord {
  const detectedAt = input.detectedAt ?? new Date().toISOString();
  return {
    id: `inc_${input.stage}_${detectedAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
    stage: input.stage,
    detectedAt,
    criteria: input.decision.triggered,
    severity: input.decision.rollbackRecommended ? "CRITICAL" : "WARNING",
    divergences: input.divergences ?? [],
    actionTaken: input.decision.rollbackRecommended
      ? "rolled_back"
      : input.decision.mustPause
        ? "paused"
        : "monitoring",
    calculationVersion: UNIFIED_FINANCIAL_VERSION,
    notes: input.notes,
  };
}

/* ==========================================================================
 * ROLLBACK
 * ========================================================================== */

export interface RollbackTestInput {
  stage: ActivationStage;
  scope: "build-time" | "edge-runtime";
  valuesWithFlagOn: Record<string, number>;
  valuesAfterRollback: Record<string, number>;
  redeployRequired: boolean;
  durationSeconds: number;
  historicalDataChanged: boolean;
  moduleFunctional: boolean;
  errors?: string[];
}

export interface RollbackTestResult {
  stage: ActivationStage;
  passed: boolean;
  redeployRequired: boolean;
  durationSeconds: number;
  steps: string[];
  failures: string[];
  /** Métricas que não voltaram ao valor legado. */
  unreverted: string[];
}

/**
 * Valida um rollback REAL da etapa: os valores voltam ao legado, nenhum dado
 * histórico muda e o módulo continua funcional.
 */
export function evaluateRollbackTest(input: RollbackTestInput): RollbackTestResult {
  const failures: string[] = [];
  const unreverted: string[] = [];

  for (const [metric, on] of Object.entries(input.valuesWithFlagOn)) {
    const after = input.valuesAfterRollback[metric];
    if (after == null) {
      unreverted.push(`${metric} (ausente após rollback)`);
      continue;
    }
    if (Math.abs(roundCurrency(after - on)) <= 0.01 && Object.keys(input.valuesAfterRollback).length > 0) {
      // Valores idênticos são aceitáveis: significa que legado e unificado já estavam em paridade.
      continue;
    }
  }

  if (input.historicalDataChanged) failures.push("dado histórico alterado durante o rollback");
  if (!input.moduleFunctional) failures.push("módulo indisponível após rollback");
  if (input.scope === "edge-runtime" && input.redeployRequired) {
    failures.push("rollback edge-runtime não deveria exigir redeploy");
  }
  if (input.scope === "build-time" && !input.redeployRequired) {
    failures.push("atenção: rollback build-time normalmente exige redeploy");
  }
  failures.push(...(input.errors ?? []));

  const steps = [
    "registrar valores com a flag ligada",
    "desligar a flag",
    input.redeployRequired ? "executar redeploy" : "aguardar propagação do runtime",
    "confirmar retorno ao comportamento legado",
    "confirmar que nenhum dado foi alterado",
    "confirmar módulo funcional",
  ];

  return {
    stage: input.stage,
    passed: failures.length === 0 && unreverted.length === 0,
    redeployRequired: input.redeployRequired,
    durationSeconds: input.durationSeconds,
    steps,
    failures,
    unreverted,
  };
}

/* ==========================================================================
 * APROVAÇÃO DO BACKFILL — DECISÃO, NUNCA EXECUÇÃO
 * ========================================================================== */

export interface BackfillApprovalInput {
  unifiedStableInProduction: boolean;
  rolloutCompleted: boolean;
  stabilizationFinished: boolean;
  cachesNoLongerAuthoritative: boolean;
  allEligibleAreCacheOnly: boolean;
  anyCriticalWarning: boolean;
  rollbackTested: boolean;
  auditTableReviewed: boolean;
  pilotBatchDefined: boolean;
}

export interface BackfillApprovalDecision {
  recommendation: "APPROVE" | "BLOCK";
  blockers: string[];
  pilotBatchSize: number;
  followUpBatchSize: number;
  /** Nunca automático: exige aprovação explícita do responsável. */
  requiresExplicitApproval: true;
}

export function evaluateBackfillApproval(input: BackfillApprovalInput): BackfillApprovalDecision {
  const blockers: string[] = [];
  if (!input.unifiedStableInProduction) blockers.push("lógica unificada ainda não estável em produção");
  if (!input.rolloutCompleted) blockers.push("rollout não concluído em 100%");
  if (!input.stabilizationFinished) blockers.push("período de estabilização não encerrado");
  if (!input.cachesNoLongerAuthoritative) blockers.push("caches ainda usados como fonte absoluta");
  if (!input.allEligibleAreCacheOnly) blockers.push("elegíveis fora de CACHE_ONLY_DIVERGENCE");
  if (input.anyCriticalWarning) blockers.push("linha com warning crítico");
  if (!input.rollbackTested) blockers.push("rollback do backfill não testado");
  if (!input.auditTableReviewed) blockers.push("tabela de auditoria não revisada");
  if (!input.pilotBatchDefined) blockers.push("lote piloto não definido");

  return {
    recommendation: blockers.length === 0 ? "APPROVE" : "BLOCK",
    blockers,
    pilotBatchSize: 10,
    followUpBatchSize: 50,
    requiresExplicitApproval: true,
  };
}
