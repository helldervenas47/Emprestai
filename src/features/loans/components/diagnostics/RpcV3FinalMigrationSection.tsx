/**
 * ETAPA 2 — Painel de DIAGNÓSTICO da RPC Financeira V3. SOMENTE LEITURA.
 *
 * Não existe mais botão de backfill, aplicação ou rollback: o estado
 * consolidado (`remaining_amount`, `paid_installments`) é oficial e nunca é
 * reconstruído a partir do histórico. O painel apenas compara grandezas,
 * explica cada divergência e exporta relatórios de leitura.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Download, FileJson, ShieldAlert, Lock } from "lucide-react";
import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { useAuth } from "@/hooks/useAuth";
import { todayInAppTz } from "@/lib/timezone";
import { buildRealLoanValidation } from "@/features/loans/lib/realLoanValidation";
import { computeDashboardLoanTotals } from "@/services/dashboardLoanTotalsCore";
import { useDashboardLoanTotalsRpc } from "@/features/dashboard/hooks/useDashboardLoanTotalsRpc";
import { resolveRpcV3PhaseFromEnv } from "@/features/dashboard/hooks/useRpcV3DashboardCards";
import { isRpcV3SafeMode, RPC_V3_SAFE_MODE_NOTICE } from "@/features/financial/lib/rpcV3SafeMode";
import {
  auditReportToMarkdown,
  buildRpcV3AuditReport,
  buildRpcV3BackfillPlan,
  buildRpcV3DiagnosticRows,
  buildRpcV3DiagnosticSql,
  normalizeBlocklist,
  resolveRpcV3Rollout,
  validateDashboardRpcCards,
  RPC_V3_MIGRATION_VERSION,
} from "@/features/financial/lib/rpcV3Migration";


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

export function RpcV3FinalMigrationSection({ loans, payments, installmentSchedules }: Props) {
  const { role, user } = useAuth();
  const [blocklistText, setBlocklistText] = useState("");

  const today = todayInAppTz();
  const [y, m] = today.split("-").map(Number);
  const range = useMemo(() => ({ start: new Date(y, m - 1, 1), end: new Date(y, m, 0) }), [y, m]);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const rows = useMemo(
    () => buildRealLoanValidation(loans ?? [], payments ?? [], installmentSchedules ?? []),
    [loans, payments, installmentSchedules],
  );

  const blocklist = useMemo(
    () => normalizeBlocklist(blocklistText.split(/[\s,;]+/).filter(Boolean)),
    [blocklistText],
  );

  const plan = useMemo(
    () =>
      buildRpcV3BackfillPlan(rows, {
        executedBy: user?.id ?? "desconhecido",
        userIdByLoanId: new Map((loans ?? []).map((l) => [l.id, (l as any).userId ?? user?.id ?? ""])),
        blocklist: [...blocklist.values()],
      }),
    [rows, loans, user?.id, blocklist],
  );

  const legacyTotals = useMemo(
    () =>
      computeDashboardLoanTotals({
        loans: loans ?? [],
        payments: payments ?? [],
        schedules: installmentSchedules ?? [],
        start: iso(range.start),
        end: iso(range.end),
        today,
      }),
    [loans, payments, installmentSchedules, range, today],
  );

  const { totals, missing, loading } = useDashboardLoanTotalsRpc({
    range,
    role,
    legacy: legacyTotals,
    forceEnabled: true,
  });

  const validation = useMemo(
    () => validateDashboardRpcCards(legacyTotals, totals ?? {}),
    [legacyTotals, totals],
  );

  const phase = resolveRpcV3PhaseFromEnv();
  const rollout = resolveRpcV3Rollout({
    phase,
    role,
    userId: user?.id,
    largestDifference: totals ? validation.largestDifference : 0,
  });

  const report = useMemo(
    () => buildRpcV3AuditReport(rows, plan, validation),
    [rows, plan, validation],
  );
  const safeMode = isRpcV3SafeMode();


  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Diagnóstico de paridade — RPC Financeira V3
          <Badge variant="secondary">{RPC_V3_MIGRATION_VERSION}</Badge>
          <Badge variant="outline">{phase}</Badge>
          <Badge className={rollout.enabled ? "bg-success/15 text-success" : "bg-muted"} variant="secondary">
            {rollout.enabled ? "cards pela RPC" : "cards no legado"}
          </Badge>
          {safeMode && (
            <Badge variant="secondary" className="gap-1 bg-warning/15 text-warning">
              <Lock className="h-3 w-3" /> modo seguro
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {safeMode && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <p className="font-medium">{RPC_V3_SAFE_MODE_NOTICE}</p>
            <p className="mt-1 text-muted-foreground">
              <code>public.loans.remaining_amount</code> e <code>public.loans.paid_installments</code>{" "}
              são o estado consolidado oficial. As divergências abaixo comparam grandezas
              diferentes (saldo contratual × saldo consolidado) e não autorizam correção
              automática.
            </p>
          </div>
        )}


        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Analisados" value={report.summary.analyzed} />
          <Metric label="Elegíveis a escrita" value={report.summary.migrated} />
          <Metric label="Bloqueados" value={report.summary.blocked} />
          <Metric label="Reconstrução determinística" value={report.summary.deterministic} />
          <Metric label="Sem alocação (legado)" value={report.summary.legacyAllocationMissing} />
          <Metric label="Alocação inválida" value={report.summary.invalidAllocation} />
          <Metric label="Risco alto" value={report.summary.highRisk} />
          <Metric label="Revisão manual" value={report.summary.requiresManualReview} />

        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Bloquear contratos por loan_id (um por linha ou separados por vírgula)
          </p>
          <Input
            value={blocklistText}
            onChange={(e) => setBlocklistText(e.target.value)}
            placeholder="ex.: 11111111-1111-... , 22222222-2222-..."
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Cards do Dashboard — legado × RPC V3 (tolerância R$ 0,01)
          </p>
          {missing ? (
            <p className="text-xs text-warning">
              RPC não publicada. Aplique <code>supabase/sql/dashboard_loan_totals_v3.sql</code>.
            </p>
          ) : loading ? (
            <p className="text-xs text-muted-foreground">Consultando RPC…</p>
          ) : (
            <div className="grid gap-1">
              {validation.cards.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-xs"
                >
                  <span className="truncate text-muted-foreground">{c.label}</span>
                  <span className="tabular-nums">
                    {brl(c.legacy)} → {brl(c.rpc)}{" "}
                    <span className={c.withinTolerance ? "text-muted-foreground" : "font-semibold text-destructive"}>
                      (Δ {brl(c.diff)})
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {!report.approved && (
          <ul className="list-disc rounded border border-destructive/40 bg-destructive/5 p-3 pl-6 text-xs text-destructive">
            {report.approvalBlockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              download(`diagnostico_rpc_v3_${plan.batchId}.sql`, buildRpcV3DiagnosticSql(rows), "text/plain")
            }
          >
            <Download className="mr-1 h-4 w-4" /> SQL de conferência (leitura)
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              download(
                `diagnostico_rpc_v3_${plan.batchId}.json`,
                JSON.stringify(buildRpcV3DiagnosticRows(rows), null, 2),
                "application/json",
              )
            }
          >
            <FileJson className="mr-1 h-4 w-4" /> Diagnóstico por contrato
          </Button>
          <Button
            size="sm"
            onClick={() =>
              download(`auditoria_rpc_v3_${plan.batchId}.md`, auditReportToMarkdown(report), "text/markdown")
            }
          >
            <Download className="mr-1 h-4 w-4" /> Relatório de paridade
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          As ações de backfill, aplicação e rollback foram removidas: reconstruir o estado
          consolidado a partir do histórico legado não é seguro nem determinístico.
        </p>

      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
