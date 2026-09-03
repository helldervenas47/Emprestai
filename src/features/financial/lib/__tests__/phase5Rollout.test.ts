import { describe, expect, it } from "vitest";
import {
  BASELINE_MODULES,
  buildBaselineId,
  buildFinancialBaseline,
  classifyDifference,
  compareWithBaseline,
  baselineToCsv,
  type BaselineModuleCapture,
} from "@/features/financial/lib/financialBaseline";
import {
  ACTIVATION_STAGES,
  ACTIVATION_STAGE_DEFINITIONS,
  emptyStageState,
  evaluateObservationWindow,
  evaluatePercentageAdvance,
  evaluateStageGates,
  mergeAllowlist,
  nextActivatableStage,
  registerAllowlistEntry,
  type StageState,
} from "@/features/financial/lib/financialRolloutStages";
import {
  buildIncidentRecord,
  classifyDivergence,
  evaluateBackfillApproval,
  evaluatePauseCriteria,
  evaluateRollbackTest,
} from "@/features/financial/lib/financialIncidents";
import {
  buildCriticalReviewRecords,
  buildPhase5Report,
  criticalReviewsToCsv,
  evaluateCriticalReviewStatus,
} from "@/features/financial/lib/financialPhase5Report";
import {
  resolveFinancialRollout,
  resolveRolloutBucket,
} from "@/features/financial/lib/financialRollout";
import type { RealLoanValidationRow } from "@/features/loans/lib/realLoanValidation";

/* -------------------------------------------------------------------------- */

function captured(values: Record<string, number> = {}): BaselineModuleCapture[] {
  return BASELINE_MODULES.map((module) => ({ module, values, captured: true }));
}

function row(partial: Partial<RealLoanValidationRow> = {}): RealLoanValidationRow {
  return {
    loanId: "loan-1",
    loanStatus: "active",
    originalPrincipal: 1000,
    contractualTotal: 1200,
    installmentCount: 1,
    paymentsCount: 1,
    paymentsWithMetadata: 1,
    paymentsWithoutMetadata: 0,
    storedRemainingAmount: 1200,
    calculatedRemainingAmount: 1200,
    remainingAmountDifference: 0,
    storedPaidInstallments: 0,
    calculatedPaidInstallments: 0,
    paidInstallmentsDifference: 0,
    legacyTotalReceivable: 1200,
    unifiedTotalReceivable: 1200,
    totalDifference: 0,
    unifiedPrincipalRemaining: 1000,
    unifiedInterestRemaining: 200,
    unifiedPenaltyPending: 0,
    unifiedLateInterestPending: 0,
    calculationSource: "unified",
    categories: [],
    classification: "SAFE_TO_ENABLE",
    severity: "INFO",
    warnings: [],
    recommendedAction: "nenhuma",
    flags: {
      hasNegativeBalance: false,
      settledWithBalance: false,
      duplicatePayments: false,
      principalOverpaid: false,
      allocationMismatch: false,
      incompleteSchedule: false,
      missingMetadata: false,
      renegotiated: false,
      cacheDivergence: false,
      cacheExplainsDifference: false,
    },
    ...partial,
  } as RealLoanValidationRow;
}

/* ========================================================================== */

describe("Fase 5 — linha de base legada", () => {
  it("gera identificador baseline_legacy_<data>_<commit>", () => {
    expect(buildBaselineId("2026-07-26T10:00:00.000Z", "abcdef1234567890")).toBe(
      "baseline_legacy_20260726_abcdef123456",
    );
  });

  it("marca a linha de base como incompleta quando falta módulo", () => {
    const baseline = buildFinancialBaseline({
      environment: "preview",
      commit: null,
      modules: [{ module: "loans", values: { totalAReceber: 100 }, captured: true }],
    });
    expect(baseline.complete).toBe(false);
    expect(baseline.missingModules).toContain("telegram");
    expect(baseline.modules).toHaveLength(BASELINE_MODULES.length);
  });

  it("fica completa quando todos os sete módulos são capturados", () => {
    const baseline = buildFinancialBaseline({ environment: "preview", commit: "abc", modules: captured() });
    expect(baseline.complete).toBe(true);
    expect(baseline.missingModules).toHaveLength(0);
  });

  it("classifica diferenças por tolerância oficial", () => {
    expect(classifyDifference(0.01)).toBe("OK");
    expect(classifyDifference(-0.005)).toBe("OK");
    expect(classifyDifference(5)).toBe("WARNING");
    expect(classifyDifference(10.01)).toBe("CRITICAL");
  });

  it("compara linha de base com a captura atual e sinaliza ausências", () => {
    const baseline = buildFinancialBaseline({
      environment: "preview",
      commit: "abc",
      modules: captured({ totalAReceber: 1000 }),
    });
    const comparison = compareWithBaseline(baseline, [
      { module: "dashboard", values: { totalAReceber: 1000.004 }, captured: true },
    ]);
    expect(comparison.rows.find((r) => r.module === "dashboard")?.status).toBe("OK");
    expect(comparison.missingCount).toBeGreaterThan(0);
    expect(comparison.ok).toBe(false);
  });

  it("detecta divergência crítica na comparação", () => {
    const baseline = buildFinancialBaseline({
      environment: "preview",
      commit: "abc",
      modules: captured({ capitalAtivo: 1000 }),
    });
    const comparison = compareWithBaseline(
      baseline,
      BASELINE_MODULES.map((module) => ({ module, values: { capitalAtivo: 1500 }, captured: true })),
    );
    expect(comparison.criticalCount).toBe(BASELINE_MODULES.length);
    expect(comparison.largestDifference).toBe(500);
  });

  it("exporta CSV com uma linha por métrica", () => {
    const baseline = buildFinancialBaseline({
      environment: "preview",
      commit: "abc",
      modules: captured({ a: 1, b: 2 }),
    });
    const csv = baselineToCsv(baseline);
    expect(csv.split("\n")).toHaveLength(1 + BASELINE_MODULES.length * 2);
  });
});

/* ========================================================================== */

describe("Fase 5 — ordem obrigatória de ativação", () => {
  it("mantém a ordem oficial das sete etapas", () => {
    expect(ACTIVATION_STAGES).toEqual([
      "loans", "payment_hub", "dashboard", "goals", "reports", "exports", "telegram",
    ]);
    expect(ACTIVATION_STAGE_DEFINITIONS.map((d) => d.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("bloqueia todas as etapas sem prontidão e sem linha de base", () => {
    const gates = evaluateStageGates(ACTIVATION_STAGES.map(emptyStageState));
    expect(gates.every((g) => !g.canActivate)).toBe(true);
    expect(gates[0].blockers).toContain("linha de base legada incompleta");
  });

  it("libera apenas a primeira etapa quando a prontidão é aprovada", () => {
    const gates = evaluateStageGates(ACTIVATION_STAGES.map(emptyStageState), {
      readinessApproved: true,
      baselineComplete: true,
    });
    expect(gates[0].canActivate).toBe(true);
    expect(gates[1].canActivate).toBe(false);
    expect(nextActivatableStage(gates)?.stage).toBe("loans");
  });

  it("libera Payment Hub somente após Empréstimos aprovada", () => {
    const approved: StageState = {
      ...emptyStageState("loans"),
      status: "approved",
      functionalValidated: true,
      financialValidated: true,
      parityOk: true,
      performanceOk: true,
      logsReviewed: true,
      alertsReviewed: true,
      rollbackTested: true,
      manuallyApproved: true,
    };
    const gates = evaluateStageGates(
      [approved, ...ACTIVATION_STAGES.slice(1).map(emptyStageState)],
      { readinessApproved: true, baselineComplete: true },
    );
    expect(gates[1].canActivate).toBe(true);
    expect(gates[2].canActivate).toBe(false);
  });

  it("não aprova etapa com checks pendentes", () => {
    const gates = evaluateStageGates(ACTIVATION_STAGES.map(emptyStageState), {
      readinessApproved: true,
      baselineComplete: true,
    });
    expect(gates[0].canApprove).toBe(false);
    expect(gates[0].pendingChecks).toContain("aprovação manual");
  });

  it("bloqueia etapa pausada por incidente", () => {
    const paused = { ...emptyStageState("loans"), status: "paused" as const };
    const gates = evaluateStageGates([paused], { readinessApproved: true, baselineComplete: true });
    expect(gates[0].blockers).toContain("etapa pausada por incidente");
  });

  it("mapeia Telegram para flag edge-runtime", () => {
    const telegram = ACTIVATION_STAGE_DEFINITIONS.find((d) => d.stage === "telegram")!;
    expect(telegram.scope).toBe("edge-runtime");
    expect(telegram.flag).toBe("unifiedTelegramReports");
  });
});

/* ========================================================================== */

describe("Fase 5 — janela de observação", () => {
  it("satisfaz por tempo", () => {
    const r = evaluateObservationWindow("allowlist", { businessDaysObserved: 1 });
    expect(r.satisfied).toBe(true);
    expect(r.bySeason).toBe("time");
  });

  it("satisfaz por volume quando o tempo é insuficiente", () => {
    const r = evaluateObservationWindow("p5", {
      businessDaysObserved: 0,
      loanViews: 50,
      paymentHubOpens: 20,
      controlledPayments: 10,
      dashboardLoads: 20,
      reports: 10,
      telegramReports: 5,
    });
    expect(r.satisfied).toBe(true);
    expect(r.bySeason).toBe("volume");
  });

  it("reprova quando nem tempo nem volume são atingidos", () => {
    const r = evaluateObservationWindow("p50", { businessDaysObserved: 2, loanViews: 10 });
    expect(r.satisfied).toBe(false);
    expect(r.missing.join(" ")).toContain("dias úteis: 2/5");
  });
});

/* ========================================================================== */

describe("Fase 5 — allowlist e percentuais", () => {
  it("registra allowlist sem expor userId em claro", () => {
    const entry = registerAllowlistEntry({
      userId: "user-uuid-real",
      environment: "preview",
      flags: ["VITE_USE_UNIFIED_FINANCIAL_CALCULATION"],
      responsible: "admin",
      reason: "validação etapa 1",
    });
    expect(entry.userIdHash).not.toContain("user-uuid-real");
    expect(entry.result).toBe("pending");
  });

  it("aumentar percentual nunca remove quem já está na allowlist", () => {
    const a = registerAllowlistEntry({ userId: "u1", environment: "preview", flags: [], responsible: "x", reason: "y" });
    const b = registerAllowlistEntry({ userId: "u2", environment: "preview", flags: [], responsible: "x", reason: "y" });
    const merged = mergeAllowlist([a], [b]);
    expect(merged).toHaveLength(2);
    expect(mergeAllowlist(merged, [a]).find((e) => e.userIdHash === a.userIdHash)?.addedAt).toBe(a.addedAt);
  });

  it("bloqueia avanço de percentual com incidente crítico", () => {
    const d = evaluatePercentageAdvance({
      currentLevel: "allowlist",
      usage: { businessDaysObserved: 5 },
      criticalIncidents: 1,
      wrongChargeIncidents: 0,
      negativeBalanceIncidents: 0,
      settledReappearIncidents: 0,
      parityLargestDifference: 0,
      errorRateStable: true,
      performanceAcceptable: true,
      manuallyApproved: true,
      allStagesApproved: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.blockers.join(" ")).toContain("incidente");
  });

  it("permite avanço quando todos os critérios são atendidos", () => {
    const d = evaluatePercentageAdvance({
      currentLevel: "p5",
      usage: { businessDaysObserved: 3 },
      criticalIncidents: 0,
      wrongChargeIncidents: 0,
      negativeBalanceIncidents: 0,
      settledReappearIncidents: 0,
      parityLargestDifference: 0.004,
      errorRateStable: true,
      performanceAcceptable: true,
      manuallyApproved: true,
      allStagesApproved: true,
    });
    expect(d.allowed).toBe(true);
    expect(d.to).toBe("p25");
  });

  it("não avança além de 100%", () => {
    const d = evaluatePercentageAdvance({
      currentLevel: "p100",
      usage: { businessDaysObserved: 10 },
      criticalIncidents: 0,
      wrongChargeIncidents: 0,
      negativeBalanceIncidents: 0,
      settledReappearIncidents: 0,
      parityLargestDifference: 0,
      errorRateStable: true,
      performanceAcceptable: true,
      manuallyApproved: true,
      allStagesApproved: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.to).toBeNull();
  });

  it("rollout determinístico mantém o mesmo bucket entre sessões", () => {
    const ctx = { userId: "user-123", tenantId: "t1" };
    expect(resolveRolloutBucket(ctx)).toBe(resolveRolloutBucket(ctx));
  });

  it("flag desligada sempre resulta em legado, mesmo na allowlist", () => {
    const d = resolveFinancialRollout(false, {
      userId: "user-123",
      environment: "preview",
      allowlistedUserIds: ["user-123"],
      rolloutPercentage: 100,
    });
    expect(d.enabled).toBe(false);
    expect(d.reason).toBe("flag_disabled");
  });

  it("allowlist tem precedência sobre percentual zero", () => {
    const d = resolveFinancialRollout(true, {
      userId: "user-123",
      environment: "preview",
      enabledEnvironments: ["preview"],
      allowlistedUserIds: ["user-123"],
      rolloutPercentage: 0,
    });
    expect(d.enabled).toBe(true);
    expect(d.reason).toBe("allowlisted");
  });

  it("percentuais 5/25/50/100 são monotônicos por bucket", () => {
    const users = Array.from({ length: 200 }, (_, i) => `user-${i}`);
    const counts = [5, 25, 50, 100].map(
      (pct) =>
        users.filter(
          (userId) =>
            resolveFinancialRollout(true, {
              userId,
              environment: "preview",
              enabledEnvironments: ["preview"],
              rolloutPercentage: pct,
            }).enabled,
        ).length,
    );
    expect(counts[0]).toBeLessThanOrEqual(counts[1]);
    expect(counts[1]).toBeLessThanOrEqual(counts[2]);
    expect(counts[2]).toBeLessThanOrEqual(counts[3]);
    expect(counts[3]).toBe(users.length);
  });
});

/* ========================================================================== */

describe("Fase 5 — critérios de pausa e incidentes", () => {
  it("não pausa quando nenhum sinal é disparado", () => {
    const d = evaluatePauseCriteria({ loadTimeRatio: 1.1, errorRateDelta: 0.005 });
    expect(d.mustPause).toBe(false);
    expect(d.rollbackRecommended).toBe(false);
  });

  it("pausa e recomenda rollback com cobrança acima do saldo real", () => {
    const d = evaluatePauseCriteria({ chargeAboveRealBalance: 1 });
    expect(d.mustPause).toBe(true);
    expect(d.rollbackRecommended).toBe(true);
    expect(d.triggered).toContain("charge_above_real_balance");
  });

  it("pausa quando Dashboard e Telegram divergem acima de R$ 0,01", () => {
    expect(evaluatePauseCriteria({ dashboardTelegramDifference: 0.02 }).mustPause).toBe(true);
    expect(evaluatePauseCriteria({ dashboardTelegramDifference: 0.01 }).mustPause).toBe(false);
  });

  it("pausa com regressão grave de performance sem exigir rollback financeiro", () => {
    const d = evaluatePauseCriteria({ loadTimeRatio: 2 });
    expect(d.mustPause).toBe(true);
    expect(d.rollbackRecommended).toBe(false);
  });

  it("gera registro de incidente com ação coerente", () => {
    const decision = evaluatePauseCriteria({ negativeBalances: 1 });
    const incident = buildIncidentRecord({ stage: "loans", decision, detectedAt: "2026-07-26T10:00:00.000Z" });
    expect(incident.severity).toBe("CRITICAL");
    expect(incident.actionTaken).toBe("rolled_back");
    expect(incident.id).toContain("inc_loans_");
  });

  it("classifica divergências e bloqueia defeito de cálculo", () => {
    expect(classifyDivergence({ cause: "ROUNDING", module: "dashboard", metric: "juros", impact: "centavos", action: "documentar" }).blocksRollout).toBe(false);
    expect(classifyDivergence({ cause: "CALCULATION_DEFECT", module: "loans", metric: "principal", impact: "alto", action: "parar" }).blocksRollout).toBe(true);
    expect(classifyDivergence({ cause: "CACHE_ISSUE", module: "loans", metric: "cache", impact: "alto", affectedValue: 250, action: "backfill" }).blocksRollout).toBe(true);
  });
});

/* ========================================================================== */

describe("Fase 5 — rollback", () => {
  it("aprova rollback build-time com redeploy e sem alteração histórica", () => {
    const r = evaluateRollbackTest({
      stage: "dashboard",
      scope: "build-time",
      valuesWithFlagOn: { capitalAtivo: 1000 },
      valuesAfterRollback: { capitalAtivo: 1000 },
      redeployRequired: true,
      durationSeconds: 120,
      historicalDataChanged: false,
      moduleFunctional: true,
    });
    expect(r.passed).toBe(true);
    expect(r.steps).toContain("executar redeploy");
  });

  it("reprova rollback que altera dado histórico", () => {
    const r = evaluateRollbackTest({
      stage: "loans",
      scope: "build-time",
      valuesWithFlagOn: { total: 10 },
      valuesAfterRollback: { total: 10 },
      redeployRequired: true,
      durationSeconds: 60,
      historicalDataChanged: true,
      moduleFunctional: true,
    });
    expect(r.passed).toBe(false);
    expect(r.failures.join(" ")).toContain("dado histórico");
  });

  it("exige rollback do Telegram sem redeploy", () => {
    const r = evaluateRollbackTest({
      stage: "telegram",
      scope: "edge-runtime",
      valuesWithFlagOn: { total: 10 },
      valuesAfterRollback: { total: 10 },
      redeployRequired: true,
      durationSeconds: 30,
      historicalDataChanged: false,
      moduleFunctional: true,
    });
    expect(r.passed).toBe(false);
    expect(r.failures.join(" ")).toContain("não deveria exigir redeploy");
  });

  it("reprova quando a métrica desaparece após o rollback", () => {
    const r = evaluateRollbackTest({
      stage: "goals",
      scope: "build-time",
      valuesWithFlagOn: { pontuacao: 80 },
      valuesAfterRollback: {},
      redeployRequired: true,
      durationSeconds: 90,
      historicalDataChanged: false,
      moduleFunctional: true,
    });
    expect(r.passed).toBe(false);
    expect(r.unreverted[0]).toContain("pontuacao");
  });
});

/* ========================================================================== */

describe("Fase 5 — contratos críticos e relatório", () => {
  it("monta ficha só para contratos que exigem revisão", () => {
    const records = buildCriticalReviewRecords([
      row(),
      row({ loanId: "loan-2", severity: "CRITICAL", classification: "BLOCKED_FROM_MIGRATION", totalDifference: 500 }),
      row({ loanId: "loan-3", classification: "HISTORICAL_DATA_INCONSISTENCY", totalDifference: 2 }),
    ]);
    expect(records.map((r) => r.loanId)).toEqual(["loan-2", "loan-3"]);
    expect(records[0].financialRisk).toBe("HIGH");
    expect(records[1].financialRisk).toBe("MEDIUM");
    expect(records.every((r) => r.decision === null)).toBe(true);
  });

  it("exige decisão explícita para cada crítico", () => {
    const records = buildCriticalReviewRecords([
      row({ loanId: "loan-9", severity: "CRITICAL", classification: "POSSIBLE_CALCULATION_DEFECT", totalDifference: 50 }),
    ]);
    expect(evaluateCriticalReviewStatus(records).allDecided).toBe(false);
    records[0].decision = "CALCULATION_FIX_REQUIRED";
    const status = evaluateCriticalReviewStatus(records);
    expect(status.allDecided).toBe(true);
    expect(status.blocking).toEqual(["loan-9"]);
  });

  it("exporta CSV dos críticos com cabeçalho e uma linha por contrato", () => {
    const records = buildCriticalReviewRecords([
      row({ loanId: "loan-2", severity: "CRITICAL", totalDifference: 20 }),
    ]);
    expect(criticalReviewsToCsv(records).split("\n")).toHaveLength(2);
  });

  it("relatório bloqueia conclusão quando falta tudo", () => {
    const report = buildPhase5Report({
      branch: "fix/unified-financial-phase-5",
      baseline: null,
      validationRows: [],
      readiness: {
        ready: false,
        score: 0,
        blockers: ["x"],
        warnings: [],
        metrics: { totalContracts: 0, safeContracts: 0, blockedContracts: 0, criticalContracts: 0, parityRate: 1, cacheDivergenceRate: 0 },
      },
      criticalReviews: [],
      stageStates: ACTIVATION_STAGES.map(emptyStageState),
      allowlist: [],
      rolloutLevel: "allowlist",
    });
    expect(report.completionBlockers).toContain("base real não analisada");
    expect(report.completionBlockers).toContain("rollback não comprovado");
    expect(report.backfill.executed).toBe(false);
    expect(report.backfill.recommendation).toBe("PENDING");
    expect(report.guarantees.join(" ")).toContain("Nenhum backfill");
  });

  it("relatório mantém garantia de que nada histórico foi alterado", () => {
    const report = buildPhase5Report({
      branch: "b",
      baseline: buildFinancialBaseline({ environment: "preview", commit: "abc", modules: captured({ a: 1 }) }),
      validationRows: [row()],
      readiness: {
        ready: true,
        score: 100,
        blockers: [],
        warnings: [],
        metrics: { totalContracts: 1, safeContracts: 1, blockedContracts: 0, criticalContracts: 0, parityRate: 1, cacheDivergenceRate: 0 },
      },
      criticalReviews: [],
      stageStates: ACTIVATION_STAGES.map(emptyStageState),
      allowlist: [],
      rolloutLevel: "allowlist",
    });
    expect(report.baselineComplete).toBe(true);
    expect(report.stages).toHaveLength(7);
    expect(report.guarantees.length).toBeGreaterThanOrEqual(5);
  });
});

/* ========================================================================== */

describe("Fase 5 — aprovação do backfill", () => {
  it("bloqueia sem rollout concluído e sem estabilização", () => {
    const d = evaluateBackfillApproval({
      unifiedStableInProduction: false,
      rolloutCompleted: false,
      stabilizationFinished: false,
      cachesNoLongerAuthoritative: false,
      allEligibleAreCacheOnly: true,
      anyCriticalWarning: false,
      rollbackTested: false,
      auditTableReviewed: false,
      pilotBatchDefined: false,
    });
    expect(d.recommendation).toBe("BLOCK");
    expect(d.blockers.length).toBeGreaterThan(4);
    expect(d.requiresExplicitApproval).toBe(true);
  });

  it("recomenda aprovação apenas com todos os critérios atendidos", () => {
    const d = evaluateBackfillApproval({
      unifiedStableInProduction: true,
      rolloutCompleted: true,
      stabilizationFinished: true,
      cachesNoLongerAuthoritative: true,
      allEligibleAreCacheOnly: true,
      anyCriticalWarning: false,
      rollbackTested: true,
      auditTableReviewed: true,
      pilotBatchDefined: true,
    });
    expect(d.recommendation).toBe("APPROVE");
    expect(d.pilotBatchSize).toBe(10);
    expect(d.followUpBatchSize).toBe(50);
  });

  it("bloqueia quando existe warning crítico", () => {
    const d = evaluateBackfillApproval({
      unifiedStableInProduction: true,
      rolloutCompleted: true,
      stabilizationFinished: true,
      cachesNoLongerAuthoritative: true,
      allEligibleAreCacheOnly: true,
      anyCriticalWarning: true,
      rollbackTested: true,
      auditTableReviewed: true,
      pilotBatchDefined: true,
    });
    expect(d.recommendation).toBe("BLOCK");
    expect(d.blockers).toContain("linha com warning crítico");
  });
});
