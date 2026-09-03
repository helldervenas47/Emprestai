/**
 * Seção "Fase 5 — Implantação operacional" (SOMENTE LEITURA).
 *
 * Mostra ambiente/flags, linha de base legada, revisão dos contratos críticos,
 * as 7 etapas obrigatórias com seus portões, paridade, rollback e a decisão do
 * backfill. Nenhum botão desta seção liga flag, escreve no banco ou executa
 * backfill: as decisões continuam manuais.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CircleDashed, Download, FileJson, Lock } from "lucide-react";
import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { useAuth } from "@/hooks/useAuth";
import {
  buildRealLoanValidation,
  evaluateFinancialRolloutReadiness,
} from "@/features/loans/lib/realLoanValidation";
import { buildCacheBackfillDryRun } from "@/features/loans/lib/cacheBackfill";
import { getFinancialBuildInfo } from "@/features/financial/lib/financialVersion";
import { resolveFinancialFlagInventory } from "@/features/financial/lib/financialFlagInventory";
import { hashUserId } from "@/features/financial/lib/financialObservability";
import {
  buildFinancialBaseline,
  BASELINE_MODULE_LABELS,
  BASELINE_MODULES,
  type BaselineModuleCapture,
} from "@/features/financial/lib/financialBaseline";
import {
  ACTIVATION_STAGE_DEFINITIONS,
  emptyStageState,
  evaluateStageGates,
  nextActivatableStage,
} from "@/features/financial/lib/financialRolloutStages";
import { evaluateBackfillApproval } from "@/features/financial/lib/financialIncidents";
import {
  buildCriticalReviewRecords,
  buildPhase5Report,
  criticalReviewsToCsv,
  evaluateCriticalReviewStatus,
  phase5ReportToJson,
} from "@/features/financial/lib/financialPhase5Report";

const brl = (v: number) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
}

const BRANCH = "fix/unified-financial-phase-5";

export function FinancialPhase5Section({ loans, payments, installmentSchedules }: Props) {
  const { user } = useAuth();
  const build = getFinancialBuildInfo();
  const inventory = useMemo(() => resolveFinancialFlagInventory(), []);
  const [capturedModules, setCapturedModules] = useState<BaselineModuleCapture[]>([]);

  const rows = useMemo(
    () => buildRealLoanValidation(loans, payments, installmentSchedules),
    [loans, payments, installmentSchedules],
  );

  const criticalReviews = useMemo(() => buildCriticalReviewRecords(rows), [rows]);
  const criticalStatus = useMemo(() => evaluateCriticalReviewStatus(criticalReviews), [criticalReviews]);

  const readiness = useMemo(
    () => evaluateFinancialRolloutReadiness(rows, { rollbackTested: false, allTestsPassing: true }),
    [rows],
  );

  const baseline = useMemo(
    () =>
      buildFinancialBaseline({
        environment: build.environment,
        commit: build.commit,
        userIdHash: hashUserId(user?.id),
        modules: capturedModules,
      }),
    [build.environment, build.commit, user?.id, capturedModules],
  );

  const stageStates = useMemo(
    () => ACTIVATION_STAGE_DEFINITIONS.map((d) => emptyStageState(d.stage)),
    [],
  );

  const gates = useMemo(
    () =>
      evaluateStageGates(stageStates, {
        readinessApproved: readiness.ready,
        baselineComplete: baseline.complete,
      }),
    [stageStates, readiness.ready, baseline.complete],
  );

  const next = nextActivatableStage(gates);

  const dryRun = useMemo(() => buildCacheBackfillDryRun(rows), [rows]);

  const backfillDecision = useMemo(
    () =>
      evaluateBackfillApproval({
        unifiedStableInProduction: false,
        rolloutCompleted: false,
        stabilizationFinished: false,
        cachesNoLongerAuthoritative: false,
        allEligibleAreCacheOnly: dryRun.blockedCount === 0,
        anyCriticalWarning: rows.some((r) => r.severity === "CRITICAL"),
        rollbackTested: false,
        auditTableReviewed: false,
        pilotBatchDefined: true,
      }),
    [dryRun.blockedCount, rows],
  );

  const report = useMemo(
    () =>
      buildPhase5Report({
        branch: BRANCH,
        baseline,
        validationRows: rows,
        readiness,
        criticalReviews,
        stageStates,
        allowlist: [],
        rolloutLevel: "allowlist",
        backfillDryRun: dryRun,
        backfillDecision,
        flagInventory: inventory,
      }),
    [baseline, rows, readiness, criticalReviews, stageStates, dryRun, backfillDecision, inventory],
  );

  const captureBaseline = () => {
    setCapturedModules(
      BASELINE_MODULES.map<BaselineModuleCapture>((module) => ({
        module,
        values:
          module === "loans"
            ? {
                totalAReceber: rows.reduce((s, r) => s + r.legacyTotalReceivable, 0),
                capitalAtivo: rows.reduce((s, r) => s + r.unifiedPrincipalRemaining, 0),
                contratos: rows.length,
              }
            : {},
        captured: module === "loans",
      })),
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Fase 5 — implantação operacional (somente leitura)</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Branch {BRANCH} · {build.environment} · {build.calculationVersion} ·{" "}
            commit {build.commit ?? "n/d"} · build {build.buildDate ?? "n/d"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={captureBaseline}>
            Capturar linha de base
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => download(`${report.baselineId ?? "phase5"}-relatorio.json`, phase5ReportToJson(report), "application/json")}
          >
            <FileJson className="mr-1 h-4 w-4" /> Relatório
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => download("fase5-contratos-criticos.csv", criticalReviewsToCsv(criticalReviews), "text/csv;charset=utf-8")}
          >
            <Download className="mr-1 h-4 w-4" /> Críticos
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {/* Flags */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flags</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {inventory.descriptors.map((d) => (
              <div key={d.envKey} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
                <span className="truncate text-xs">{d.label}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs">
                  <Badge variant="secondary" className={d.value ? "bg-warning/15 text-warning" : "bg-muted"}>
                    {d.value ? "ON" : "OFF"}
                  </Badge>
                  <span className="text-muted-foreground">{d.origin} · {d.scope}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Linha de base */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Linha de base legada · {baseline.id}
          </p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {baseline.modules.map((m) => (
              <div key={m.module} className="flex items-center gap-1 rounded bg-muted/40 px-2 py-1 text-xs">
                {m.captured ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                ) : (
                  <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="truncate">{BASELINE_MODULE_LABELS[m.module]}</span>
              </div>
            ))}
          </div>
          {!baseline.complete && (
            <p className="text-xs text-warning">
              Faltam capturas em: {baseline.missingModules.map((m) => BASELINE_MODULE_LABELS[m]).join(", ")}.
              O rollout não pode iniciar sem a linha de base completa.
            </p>
          )}
        </div>

        {/* Prontidão e críticos */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Prontidão real</p>
            <p className="mt-1 text-base font-semibold">
              {readiness.ready ? "Aprovada" : "Reprovada"} · score {readiness.score}
            </p>
            <p className="text-xs text-muted-foreground">
              {readiness.metrics.totalContracts} contratos · paridade{" "}
              {(readiness.metrics.parityRate * 100).toFixed(2)}% · bloqueados {readiness.metrics.blockedContracts}
            </p>
            {readiness.blockers.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs text-destructive">
                {readiness.blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Contratos críticos</p>
            <p className="mt-1 text-base font-semibold">
              {criticalStatus.decided}/{criticalStatus.total} com decisão
            </p>
            <p className="text-xs text-muted-foreground">
              Maior diferença: {brl(criticalReviews[0] ? Math.abs(criticalReviews[0].difference) : 0)}
            </p>
            {criticalStatus.pending.length > 0 && (
              <p className="mt-1 text-xs text-warning">
                {criticalStatus.pending.length} contrato(s) aguardando decisão manual.
              </p>
            )}
          </div>
        </div>

        {/* Etapas */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ordem obrigatória de ativação
          </p>
          {gates.map((g) => (
            <div key={g.stage} className="rounded-lg border border-border/60 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{g.label}</span>
                <Badge
                  variant="secondary"
                  className={g.canApprove ? "bg-success/15 text-success" : g.canActivate ? "bg-warning/15 text-warning" : "bg-muted"}
                >
                  {g.canApprove ? "pronta p/ aprovar" : g.canActivate ? "liberada p/ ativar" : "bloqueada"}
                </Badge>
              </div>
              {g.blockers.length > 0 && (
                <p className="mt-1 flex items-start gap-1 text-muted-foreground">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" /> {g.blockers.join(" · ")}
                </p>
              )}
              {g.blockers.length === 0 && g.pendingChecks.length > 0 && (
                <p className="mt-1 text-muted-foreground">Pendentes: {g.pendingChecks.join(", ")}</p>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Próxima etapa autorizada: {next ? next.label : "nenhuma — resolver bloqueios acima"}.
          </p>
        </div>

        {/* Backfill */}
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Backfill de caches — dry-run {dryRun.batchId}
          </p>
          <p className="mt-1 text-xs">
            Elegíveis {dryRun.eligibleCount} · bloqueados {dryRun.blockedCount} · soma{" "}
            {brl(dryRun.totalRemainingDifference)} · maior {brl(dryRun.largestRemainingDifference)}
          </p>
          <p className="mt-1 text-xs font-semibold">
            Recomendação: {backfillDecision.recommendation === "APPROVE" ? "aprovar" : "bloquear"} (piloto{" "}
            {backfillDecision.pilotBatchSize}, depois {backfillDecision.followUpBatchSize})
          </p>
          {backfillDecision.blockers.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
              {backfillDecision.blockers.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Nenhuma linha foi alterada: a execução exige aprovação explícita.
          </p>
        </div>

        {/* Conclusão */}
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Conclusão da Fase 5</p>
          {report.completionBlockers.length === 0 ? (
            <p className="mt-1 text-xs text-success">Todos os critérios de conclusão atendidos.</p>
          ) : (
            <ul className="mt-1 list-disc pl-4 text-xs text-warning">
              {report.completionBlockers.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default FinancialPhase5Section;
