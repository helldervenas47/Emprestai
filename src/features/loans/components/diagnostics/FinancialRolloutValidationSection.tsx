/**
 * Seção "Validação para ativação" (FASE 4) — SOMENTE LEITURA.
 *
 * Mostra o inventário de flags, o checklist de prontidão, a classificação
 * operacional dos contratos reais, a amostragem obrigatória e o dry-run do
 * backfill de caches. Nenhum botão desta seção escreve no banco.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, FileJson } from "lucide-react";
import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { resolveFinancialFlagInventory } from "@/features/financial/lib/financialFlagInventory";
import {
  buildRealLoanValidation,
  summarizeRealValidation,
  evaluateFinancialRolloutReadiness,
  buildSamplingPlan,
  realValidationToCsv,
  realValidationToJson,
  OPERATIONAL_CLASSES,
  type OperationalClass,
  type ValidationSeverity,
} from "@/features/loans/lib/realLoanValidation";
import {
  buildCacheBackfillDryRun,
  backfillDryRunToCsv,
  backfillDryRunToJson,
} from "@/features/loans/lib/cacheBackfill";

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

const severityTone: Record<ValidationSeverity, string> = {
  INFO: "bg-muted text-muted-foreground",
  WARNING: "bg-warning/15 text-warning",
  CRITICAL: "bg-destructive/15 text-destructive",
};

interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
}

export function FinancialRolloutValidationSection({ loans, payments, installmentSchedules }: Props) {
  const [classification, setClassification] = useState<OperationalClass | "ALL">("ALL");
  const [severity, setSeverity] = useState<ValidationSeverity | "ALL">("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [metadataFilter, setMetadataFilter] = useState<"ALL" | "WITH" | "WITHOUT">("ALL");
  const [minDiff, setMinDiff] = useState("");
  const [search, setSearch] = useState("");

  const inventory = useMemo(() => resolveFinancialFlagInventory(), []);
  const rows = useMemo(
    () => buildRealLoanValidation(loans, payments, installmentSchedules),
    [loans, payments, installmentSchedules],
  );
  const summary = useMemo(() => summarizeRealValidation(rows), [rows]);
  const readiness = useMemo(() => evaluateFinancialRolloutReadiness(rows), [rows]);
  const sampling = useMemo(() => buildSamplingPlan(rows, payments), [rows, payments]);
  const dryRun = useMemo(() => buildCacheBackfillDryRun(rows), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = Number(minDiff.replace(",", ".")) || 0;
    return rows
      .filter((r) => (classification === "ALL" ? true : r.classification === classification))
      .filter((r) => (severity === "ALL" ? true : r.severity === severity))
      .filter((r) => (status === "ALL" ? true : r.loanStatus === status))
      .filter((r) => (metadataFilter === "ALL"
        ? true
        : metadataFilter === "WITHOUT" ? r.paymentsWithoutMetadata > 0 : r.paymentsWithoutMetadata === 0))
      .filter((r) => Math.abs(r.totalDifference) >= min)
      .filter((r) => q.length === 0
        || r.loanId.toLowerCase().includes(q)
        || (r.clientName ?? "").toLowerCase().includes(q)
        || (r.clientId ?? "").toLowerCase().includes(q))
      .sort((a, b) => Math.abs(b.totalDifference) - Math.abs(a.totalDifference));
  }, [rows, classification, severity, status, metadataFilter, minDiff, search]);

  const statuses = Array.from(new Set(rows.map((r) => r.loanStatus).filter(Boolean))) as string[];

  const indicators: { label: string; value: string }[] = [
    { label: "Total de contratos", value: String(summary.totalContracts) },
    { label: "Safe to enable", value: String(summary.byClassification.SAFE_TO_ENABLE) },
    { label: "Safe com fallback legado", value: String(summary.byClassification.SAFE_WITH_LEGACY_FALLBACK) },
    { label: "Divergência só de cache", value: String(summary.byClassification.CACHE_ONLY_DIVERGENCE) },
    { label: "Revisão manual", value: String(summary.byClassification.REQUIRES_MANUAL_REVIEW) },
    { label: "Bloqueados", value: String(summary.byClassification.BLOCKED_FROM_MIGRATION) },
    { label: "Diferença absoluta total", value: brl(summary.totalAbsoluteDifference) },
    { label: "Maior diferença", value: brl(summary.largestDifference) },
    { label: "Quitados divergentes", value: String(summary.settledWithBalance) },
    { label: "Saldo negativo", value: String(summary.negativeBalance) },
    { label: "Sem metadata", value: String(summary.withoutMetadata) },
    { label: "Cronograma incompleto", value: String(summary.incompleteSchedule) },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Inventário de feature flags financeiras</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Versão do cálculo: <span className="font-mono">{inventory.build.calculationVersion}</span> · ambiente:{" "}
            {inventory.build.environment} · commit: {inventory.build.commit ?? "n/d"} · build:{" "}
            {inventory.build.buildDate ?? "n/d"}
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {inventory.descriptors.map((d) => (
              <div key={d.envKey} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-xs">
                <span className="min-w-0 truncate">
                  {d.label} <span className="font-mono text-muted-foreground">({d.envKey})</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Badge variant="secondary" className={d.value ? "bg-success/15 text-success" : "bg-muted"}>
                    {d.value ? "ON" : "OFF"}
                  </Badge>
                  <span className="text-muted-foreground">{d.origin} · {d.scope}</span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Checklist de prontidão para ativação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className={readiness.ready ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>
              {readiness.ready ? "PRONTO" : "BLOQUEADO"}
            </Badge>
            <span className="text-muted-foreground">
              Score {readiness.score}/100 · paridade {(readiness.metrics.parityRate * 100).toFixed(2)}% · cache divergente{" "}
              {(readiness.metrics.cacheDivergenceRate * 100).toFixed(2)}%
            </span>
          </div>
          {readiness.blockers.length > 0 && (
            <ul className="list-disc pl-4 text-xs text-destructive">
              {readiness.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
          {readiness.warnings.length > 0 && (
            <ul className="list-disc pl-4 text-xs text-warning">
              {readiness.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {indicators.map((i) => (
          <Card key={i.label}>
            <CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{i.label}</p>
              <p className="mt-1 text-base font-semibold tabular-nums">{i.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Validação para ativação (somente leitura)</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => download("validacao-fase4.csv", realValidationToCsv(filtered), "text/csv;charset=utf-8")}
            >
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => download("validacao-fase4.json", realValidationToJson(filtered), "application/json")}
            >
              <FileJson className="mr-1 h-4 w-4" /> JSON
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente ou contrato"
              className="h-9 w-full sm:w-56"
            />
            <Input
              value={minDiff}
              onChange={(e) => setMinDiff(e.target.value)}
              placeholder="Diferença mínima (R$)"
              className="h-9 w-full sm:w-44"
              inputMode="decimal"
            />
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value as OperationalClass | "ALL")}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="ALL">Todas as classificações</option>
              {OPERATIONAL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as ValidationSeverity | "ALL")}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="ALL">Todas as severidades</option>
              {["INFO", "WARNING", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="ALL">Todos os status</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={metadataFilter}
              onChange={(e) => setMetadataFilter(e.target.value as "ALL" | "WITH" | "WITHOUT")}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="ALL">Com e sem metadata</option>
              <option value="WITH">Somente com metadata</option>
              <option value="WITHOUT">Somente sem metadata</option>
            </select>
          </div>

          <div className="space-y-2">
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum contrato para os filtros atuais.</p>
            )}
            {filtered.slice(0, 200).map((r) => (
              <div key={r.loanId} className="rounded-lg border border-border/60 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.clientName ?? r.loanId}</p>
                    <p className="truncate text-muted-foreground">{r.classification} · {r.categories.join(", ")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary" className={severityTone[r.severity]}>{r.severity}</Badge>
                    <span className="font-semibold tabular-nums">{brl(Math.abs(r.totalDifference))}</span>
                  </div>
                </div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <span>Legado → unificado: {brl(r.legacyTotalReceivable)} → {brl(r.unifiedTotalReceivable)}</span>
                  <span>
                    Cache remaining: {brl(r.storedRemainingAmount ?? 0)} → {brl(r.calculatedRemainingAmount)}
                  </span>
                  <span>Parcelas pagas: {r.storedPaidInstallments ?? "n/d"} → {r.calculatedPaidInstallments}</span>
                  <span>Pagamentos sem metadata: {r.paymentsWithoutMetadata}/{r.paymentsCount}</span>
                  <span className="sm:col-span-2 text-muted-foreground">Ação: {r.recommendedAction}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Amostragem manual obrigatória</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-xs sm:grid-cols-2">
          {sampling.map((s) => (
            <div key={s.group} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
              <span className="truncate">{s.group}{s.exhaustive ? " (exaustivo)" : ""}</span>
              <span className="tabular-nums">{s.selected.length}/{s.available}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Dry-run do backfill de caches (nenhuma escrita)</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => download(`${dryRun.batchId}.csv`, backfillDryRunToCsv(dryRun), "text/csv;charset=utf-8")}
            >
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => download(`${dryRun.batchId}.json`, backfillDryRunToJson(dryRun), "application/json")}
            >
              <FileJson className="mr-1 h-4 w-4" /> JSON
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-xs">
          <p className="text-muted-foreground">
            Lote <span className="font-mono">{dryRun.batchId}</span> · versão {dryRun.calculationVersion}
          </p>
          <p>
            Elegíveis: <strong>{dryRun.eligibleCount}</strong> · bloqueados: <strong>{dryRun.blockedCount}</strong> ·
            diferença somada: {brl(dryRun.totalRemainingDifference)} · maior alteração:{" "}
            {brl(dryRun.largestRemainingDifference)}
          </p>
          {dryRun.rows
            .filter((r) => r.eligible)
            .sort((a, b) => Math.abs(b.remainingDifference) - Math.abs(a.remainingDifference))
            .slice(0, 20)
            .map((r) => (
              <div key={r.loanId} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
                <span className="truncate font-mono">{r.loanId}</span>
                <span className="tabular-nums">
                  {brl(r.oldRemainingAmount ?? 0)} → {brl(r.newRemainingAmount)} · parcelas{" "}
                  {r.oldPaidInstallments ?? "n/d"} → {r.newPaidInstallments}
                </span>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default FinancialRolloutValidationSection;
