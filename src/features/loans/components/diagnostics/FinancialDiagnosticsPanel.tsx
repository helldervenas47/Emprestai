/**
 * Painel TEMPORÁRIO de diagnóstico financeiro (antigo × novo).
 *
 * Disponível somente quando `VITE_FINANCIAL_DIFF_DIAGNOSTICS=true` E o usuário
 * é administrador ou o ambiente é desenvolvimento/preview. Somente leitura:
 * nenhum botão deste painel escreve no banco.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, FileJson, ShieldAlert } from "lucide-react";
import { useLoans } from "@/features/loans/hooks/useLoans";
import { useAuth } from "@/hooks/useAuth";
import { financialDiffDiagnosticsEnabled } from "@/features/financial/lib/financialFlags";
import { FinancialParitySection } from "@/features/loans/components/diagnostics/FinancialParitySection";
import { FinancialRolloutValidationSection } from "@/features/loans/components/diagnostics/FinancialRolloutValidationSection";
import { RpcV3FinalMigrationSection } from "@/features/loans/components/diagnostics/RpcV3FinalMigrationSection";
import { FinancialPhase5Section } from "@/features/loans/components/diagnostics/FinancialPhase5Section";
import { DashboardRpcParitySection } from "@/features/loans/components/diagnostics/DashboardRpcParitySection";


import {
  buildLoanFinancialDiagnostics,
  summarizeDiagnostics,
  diagnosticsToCsv,
  diagnosticsToJson,
  DIAGNOSTIC_CATEGORIES,
  type DiagnosticCategory,
  type DiagnosticSeverity,
  type LoanFinancialDiagnosticRow,
} from "@/features/loans/lib/financialDiagnostics";

const brl = (v: number) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const severityTone: Record<DiagnosticSeverity, string> = {
  INFO: "bg-muted text-muted-foreground",
  WARNING: "bg-warning/15 text-warning",
  CRITICAL: "bg-destructive/15 text-destructive",
};

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function FinancialDiagnosticsPanel() {
  const { role } = useAuth();
  const { loans, payments, installmentSchedules } = useLoans();
  const [category, setCategory] = useState<DiagnosticCategory | "ALL">("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);

  const isDevOrPreview = Boolean(
    (import.meta as any)?.env?.DEV || (import.meta as any)?.env?.VITE_VERCEL_ENV === "preview",
  );
  // Admin sempre pode abrir o painel (somente leitura); demais ambientes exigem a flag.
  const allowed = role === "admin" || (financialDiffDiagnosticsEnabled() && isDevOrPreview);


  const rows = useMemo(
    () => (allowed ? buildLoanFinancialDiagnostics(loans, payments, installmentSchedules) : []),
    [allowed, loans, payments, installmentSchedules],
  );
  const summary = useMemo(() => summarizeDiagnostics(rows), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (category === "ALL" ? true : r.suspectedReason.includes(category)))
      .filter((r) => (status === "ALL" ? true : r.status === status))
      .filter((r) =>
        q.length === 0
        || r.loanId.toLowerCase().includes(q)
        || (r.clientName ?? "").toLowerCase().includes(q))
      .sort((a, b) => b.absoluteDifference - a.absoluteDifference);
  }, [rows, category, status, search]);

  if (!allowed) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          Painel de diagnóstico indisponível neste ambiente.
        </CardContent>
      </Card>
    );
  }

  const statuses = Array.from(new Set(rows.map((r) => r.status).filter(Boolean))) as string[];

  const indicators: { label: string; value: string }[] = [
    { label: "Contratos analisados", value: String(summary.analyzed) },
    { label: "Sem divergência", value: String(summary.withoutDifference) },
    { label: "Com divergência", value: String(summary.withDifference) },
    { label: "Diferença absoluta total", value: brl(summary.totalAbsoluteDifference) },
    { label: "Maior diferença individual", value: brl(summary.largestDifference) },
    { label: "Possível erro crítico", value: String(summary.criticalCount) },
    { label: "Legados sem metadata", value: String(summary.legacyWithoutMetadata) },
    { label: "Cronograma incompleto", value: String(summary.incompleteSchedule) },
  ];

  return (
    <div className="space-y-4">
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

      <FinancialParitySection
        loans={loans}
        payments={payments}
        installmentSchedules={installmentSchedules}
      />

      <FinancialRolloutValidationSection
        loans={loans}
        payments={payments}
        installmentSchedules={installmentSchedules}
      />

      <RpcV3FinalMigrationSection
        loans={loans}
        payments={payments}
        installmentSchedules={installmentSchedules}
      />

      <FinancialPhase5Section
        loans={loans}
        payments={payments}
        installmentSchedules={installmentSchedules}
      />

      <DashboardRpcParitySection />




      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Divergências antigo × novo (somente leitura)</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => download("diagnostico-financeiro.csv", diagnosticsToCsv(filtered), "text/csv;charset=utf-8")}
            >
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => download("diagnostico-financeiro.json", diagnosticsToJson(filtered), "application/json")}
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
              placeholder="Pesquisar cliente ou contrato"
              className="h-9 w-full sm:w-64"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DiagnosticCategory | "ALL")}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="ALL">Todas as categorias</option>
              {DIAGNOSTIC_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="ALL">Todos os status</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum contrato para os filtros atuais.</p>
            )}
            {filtered.map((r) => (
              <DiagnosticRowCard
                key={r.loanId}
                row={r}
                open={openRow === r.loanId}
                onToggle={() => setOpenRow(openRow === r.loanId ? null : r.loanId)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DiagnosticRowCard({
  row, open, onToggle,
}: { row: LoanFinancialDiagnosticRow; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.clientName ?? row.loanId}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.status} · {row.suspectedReason.join(", ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge className={severityTone[row.severity]} variant="secondary">{row.severity}</Badge>
          <span className="text-sm font-semibold tabular-nums">{brl(row.absoluteDifference)}</span>
        </div>
      </button>

      {open && (
        <div className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
          <Line label="Principal restante" old={row.oldPrincipalRemaining} nw={row.newPrincipalRemaining} />
          <Line label="Juros restantes" old={row.oldInterestRemaining} nw={row.newInterestRemaining} />
          <Line label="Multa pendente" old={row.oldPenaltyPending} nw={row.newPenaltyPending} />
          <Line label="Juros de atraso" old={row.oldLateInterestPending} nw={row.newLateInterestPending} />
          <Line label="Parcela atual restante" old={row.oldCurrentInstallmentRemaining} nw={row.newCurrentInstallmentRemaining} />
          <Line label="Total a receber" old={row.oldTotalReceivable} nw={row.newTotalReceivable} />
          <p className="sm:col-span-2 text-muted-foreground">
            Fonte: {row.calculationSource} · remainingAmount armazenado: {brl(row.remainingAmountStored ?? 0)} ·
            parcelas pagas: {row.paidInstallmentsStored ?? 0}
          </p>
          {row.warnings.length > 0 && (
            <ul className="sm:col-span-2 list-disc pl-4 text-warning">
              {row.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Line({ label, old, nw }: { label: string; old: number; nw: number }) {
  const diff = Math.round((nw - old) * 100) / 100;
  return (
    <div className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {brl(old)} → {brl(nw)}{" "}
        <span className={diff === 0 ? "text-muted-foreground" : "font-semibold text-warning"}>
          ({diff >= 0 ? "+" : ""}{brl(diff)})
        </span>
      </span>
    </div>
  );
}

export default FinancialDiagnosticsPanel;
