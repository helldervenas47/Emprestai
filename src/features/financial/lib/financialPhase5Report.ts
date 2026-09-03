/**
 * ============================================================================
 * RELATÓRIO DE EVIDÊNCIAS DA FASE 5
 * ============================================================================
 *
 * Consolida (somente leitura) tudo o que a Fase 5 exige como entrega:
 * ambiente, flags, linha de base, classificação real, contratos críticos,
 * etapas, allowlist, paridade, incidentes, rollbacks e decisão do backfill.
 *
 * Não liga flags, não escreve no banco, não executa backfill.
 */

import { getFinancialBuildInfo } from "@/features/financial/lib/financialVersion";
import {
  resolveFinancialFlagInventory,
  type FinancialFlagInventory,
} from "@/features/financial/lib/financialFlagInventory";
import type { FinancialBaseline, BaselineComparison } from "@/features/financial/lib/financialBaseline";
import {
  ACTIVATION_STAGE_DEFINITIONS,
  evaluateStageGates,
  type AllowlistEntry,
  type RolloutLevel,
  type StageGate,
  type StageState,
} from "@/features/financial/lib/financialRolloutStages";
import type {
  DivergenceRecord,
  IncidentRecord,
  RollbackTestResult,
  BackfillApprovalDecision,
} from "@/features/financial/lib/financialIncidents";
import type {
  FinancialRolloutReadiness,
  RealLoanValidationRow,
} from "@/features/loans/lib/realLoanValidation";
import { summarizeRealValidation } from "@/features/loans/lib/realLoanValidation";
import type { CacheBackfillDryRun } from "@/features/loans/lib/cacheBackfill";
import { roundCurrency } from "@/lib/money";

/* ==========================================================================
 * DECISÃO POR CONTRATO CRÍTICO
 * ========================================================================== */

export const CRITICAL_DECISIONS = [
  "APPROVED",
  "APPROVED_WITH_FALLBACK",
  "BLOCKED",
  "DATA_FIX_REQUIRED",
  "CALCULATION_FIX_REQUIRED",
  "IGNORED_WITH_JUSTIFICATION",
] as const;

export type CriticalDecision = (typeof CRITICAL_DECISIONS)[number];

export interface CriticalReviewRecord {
  loanId: string;
  status?: string;
  divergenceType: string;
  legacyValue: number;
  unifiedValue: number;
  difference: number;
  paymentsInvolved: number;
  metadataAvailable: boolean;
  scheduleAvailable: boolean;
  storedCache?: number;
  calculatedCache: number;
  financialRisk: "LOW" | "MEDIUM" | "HIGH";
  probableCause: string;
  recommendedAction: string;
  decision: CriticalDecision | null;
  justification?: string;
}

/** Ficha de revisão obrigatória para cada contrato crítico/bloqueado. */
export function buildCriticalReviewRecords(rows: RealLoanValidationRow[]): CriticalReviewRecord[] {
  return rows
    .filter(
      (r) =>
        r.severity === "CRITICAL"
        || r.classification === "BLOCKED_FROM_MIGRATION"
        || r.classification === "POSSIBLE_CALCULATION_DEFECT"
        || r.classification === "HISTORICAL_DATA_INCONSISTENCY",
    )
    .map<CriticalReviewRecord>((r) => {
      const diff = Math.abs(roundCurrency(r.totalDifference));
      return {
        loanId: r.loanId,
        status: r.loanStatus,
        divergenceType: r.classification,
        legacyValue: roundCurrency(r.legacyTotalReceivable),
        unifiedValue: roundCurrency(r.unifiedTotalReceivable),
        difference: roundCurrency(r.totalDifference),
        paymentsInvolved: r.paymentsCount,
        metadataAvailable: r.paymentsWithMetadata > 0,
        scheduleAvailable: !r.flags.incompleteSchedule,
        storedCache: r.storedRemainingAmount,
        calculatedCache: roundCurrency(r.calculatedRemainingAmount),
        financialRisk: diff > 10 ? "HIGH" : diff > 0.01 ? "MEDIUM" : "LOW",
        probableCause: r.warnings[0] ?? r.categories[0] ?? "não identificada",
        recommendedAction: r.recommendedAction,
        decision: null,
      };
    })
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}

export interface CriticalReviewStatus {
  total: number;
  decided: number;
  pending: string[];
  blocking: string[];
  allDecided: boolean;
}

export function evaluateCriticalReviewStatus(records: CriticalReviewRecord[]): CriticalReviewStatus {
  const pending = records.filter((r) => r.decision == null).map((r) => r.loanId);
  const blocking = records
    .filter((r) => r.decision === "CALCULATION_FIX_REQUIRED" || r.decision === "BLOCKED")
    .map((r) => r.loanId);
  return {
    total: records.length,
    decided: records.length - pending.length,
    pending,
    blocking,
    allDecided: pending.length === 0,
  };
}

/* ==========================================================================
 * RELATÓRIO CONSOLIDADO
 * ========================================================================== */

export interface Phase5ReportInput {
  branch: string;
  baseline?: FinancialBaseline | null;
  baselineComparison?: BaselineComparison | null;
  validationRows: RealLoanValidationRow[];
  readiness: FinancialRolloutReadiness;
  criticalReviews: CriticalReviewRecord[];
  stageStates: StageState[];
  allowlist: AllowlistEntry[];
  rolloutLevel: RolloutLevel;
  parityLargestDifference?: number;
  divergences?: DivergenceRecord[];
  incidents?: IncidentRecord[];
  rollbackTests?: RollbackTestResult[];
  backfillDryRun?: CacheBackfillDryRun | null;
  backfillDecision?: BackfillApprovalDecision | null;
  flagInventory?: FinancialFlagInventory;
  generatedAt?: string;
}

export interface Phase5Report {
  generatedAt: string;
  branch: string;
  environment: string;
  commit: string | null;
  calculationVersion: string;
  flags: FinancialFlagInventory["descriptors"];
  baselineId: string | null;
  baselineComplete: boolean;
  totals: ReturnType<typeof summarizeRealValidation>;
  readiness: FinancialRolloutReadiness;
  criticalReview: CriticalReviewStatus;
  stages: (StageGate & { status: StageState["status"] })[];
  allowlistCount: number;
  rolloutLevel: RolloutLevel;
  parityLargestDifference: number;
  divergences: DivergenceRecord[];
  incidents: IncidentRecord[];
  rollbackTests: RollbackTestResult[];
  backfill: {
    dryRunBatchId: string | null;
    eligibleCount: number;
    blockedCount: number;
    totalDifference: number;
    largestDifference: number;
    recommendation: BackfillApprovalDecision["recommendation"] | "PENDING";
    blockers: string[];
    executed: false;
  };
  guarantees: string[];
  /** Fase 5 concluída somente quando esta lista está vazia. */
  completionBlockers: string[];
}

export function buildPhase5Report(input: Phase5ReportInput): Phase5Report {
  const build = getFinancialBuildInfo();
  const inventory = input.flagInventory ?? resolveFinancialFlagInventory();
  const totals = summarizeRealValidation(input.validationRows);
  const criticalReview = evaluateCriticalReviewStatus(input.criticalReviews);
  const stateByStage = new Map(input.stageStates.map((s) => [s.stage, s]));

  const gates = evaluateStageGates(input.stageStates, {
    readinessApproved: input.readiness.ready,
    baselineComplete: Boolean(input.baseline?.complete),
  }).map((g) => ({ ...g, status: stateByStage.get(g.stage)?.status ?? "not_started" }));

  const parityLargestDifference = roundCurrency(
    input.parityLargestDifference ?? input.baselineComparison?.largestDifference ?? 0,
  );

  const completionBlockers: string[] = [];
  if (input.validationRows.length === 0) completionBlockers.push("base real não analisada");
  if (!input.baseline?.complete) completionBlockers.push("linha de base legada incompleta");
  if (!criticalReview.allDecided) {
    completionBlockers.push(`${criticalReview.pending.length} contrato(s) CRITICAL sem decisão`);
  }
  if (!input.readiness.ready) completionBlockers.push("checklist de prontidão reprovado");
  const notApproved = gates.filter((g) => g.status !== "approved");
  if (notApproved.length > 0) {
    completionBlockers.push(`etapas não aprovadas: ${notApproved.map((g) => g.label).join(", ")}`);
  }
  const failedRollbacks = (input.rollbackTests ?? []).filter((r) => !r.passed);
  if ((input.rollbackTests ?? []).length === 0) completionBlockers.push("rollback não comprovado");
  if (failedRollbacks.length > 0) {
    completionBlockers.push(`rollback reprovado em: ${failedRollbacks.map((r) => r.stage).join(", ")}`);
  }
  if (Math.abs(parityLargestDifference) > 0.01) {
    completionBlockers.push(`paridade fora da tolerância (R$ ${Math.abs(parityLargestDifference).toFixed(2)})`);
  }
  if (totals.negativeBalance > 0) completionBlockers.push("saldo negativo indevido presente");
  if (totals.settledWithBalance > 0) completionBlockers.push("contrato quitado com saldo sem justificativa");
  if ((input.incidents ?? []).some((i) => i.severity === "CRITICAL" && i.actionTaken !== "rolled_back")) {
    completionBlockers.push("incidente crítico sem rollback registrado");
  }
  if (!input.backfillDecision) completionBlockers.push("decisão sobre o backfill não documentada");

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    branch: input.branch,
    environment: build.environment,
    commit: build.commit,
    calculationVersion: build.calculationVersion,
    flags: inventory.descriptors,
    baselineId: input.baseline?.id ?? null,
    baselineComplete: Boolean(input.baseline?.complete),
    totals,
    readiness: input.readiness,
    criticalReview,
    stages: gates,
    allowlistCount: input.allowlist.length,
    rolloutLevel: input.rolloutLevel,
    parityLargestDifference,
    divergences: input.divergences ?? [],
    incidents: input.incidents ?? [],
    rollbackTests: input.rollbackTests ?? [],
    backfill: {
      dryRunBatchId: input.backfillDryRun?.batchId ?? null,
      eligibleCount: input.backfillDryRun?.eligibleCount ?? 0,
      blockedCount: input.backfillDryRun?.blockedCount ?? 0,
      totalDifference: input.backfillDryRun?.totalRemainingDifference ?? 0,
      largestDifference: input.backfillDryRun?.largestRemainingDifference ?? 0,
      recommendation: input.backfillDecision?.recommendation ?? "PENDING",
      blockers: input.backfillDecision?.blockers ?? ["decisão pendente de aprovação explícita"],
      executed: false,
    },
    guarantees: [
      "Nenhum pagamento, metadata, snapshot, ledger ou contrato histórico foi alterado.",
      "Nenhum backfill de remaining_amount ou paid_installments foi executado.",
      "Nenhuma migration de escrita foi executada.",
      "Cálculo legado, flags, comparadores e painel de diagnóstico permanecem disponíveis.",
      "Nenhum avanço automático de percentual: toda ativação exige aprovação manual.",
    ],
    completionBlockers,
  };
}

export function phase5ReportToJson(report: Phase5Report): string {
  return JSON.stringify(report, null, 2);
}

export function criticalReviewsToCsv(records: CriticalReviewRecord[]): string {
  const cols: (keyof CriticalReviewRecord)[] = [
    "loanId", "status", "divergenceType", "legacyValue", "unifiedValue", "difference",
    "paymentsInvolved", "metadataAvailable", "scheduleAvailable", "storedCache", "calculatedCache",
    "financialRisk", "probableCause", "recommendedAction", "decision", "justification",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(";"), ...records.map((r) => cols.map((c) => escape(r[c])).join(";"))].join("\n");
}

/** Ordem oficial das etapas, para exibição e documentação. */
export const PHASE5_STAGE_ORDER = ACTIVATION_STAGE_DEFINITIONS.map((s) => s.label);
