/**
 * Seção "Paridade entre módulos" do painel de diagnóstico (Fase 3).
 *
 * Compara Dashboard, Metas e Relatórios/Telegram com a agregação oficial.
 * Somente leitura: nenhum valor é corrigido, gravado ou recalculado no banco.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { resolveFinancialFlags } from "@/features/financial/lib/financialFlags";
import { listMetricAmbiguities } from "@/features/financial/lib/financialMetricsMatrix";
import { buildModuleParityReport } from "@/features/financial/lib/financialModuleParity";
import {
  buildFinancialReportData,
  financialReportToCsv,
  type ParityResult,
} from "@/features/financial/lib/financialAggregatesCore";

const brl = (v: number) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
}

function ParityBlock({ title, result }: { title: string; result: ParityResult }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Badge className={result.ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>
          {result.ok ? "Paridade OK" : `${result.divergentCount} divergência(s)`}
        </Badge>
      </div>
      <div className="mt-2 space-y-1">
        {result.rows.map((row) => (
          <div key={row.metric} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">{row.label}</span>
            <span className="shrink-0 tabular-nums">
              {brl(row.candidate)} <span className="text-muted-foreground">/ oficial</span> {brl(row.reference)}
              {row.divergent ? <span className="ml-1 text-destructive">Δ {brl(row.difference)}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinancialParitySection({ loans, payments, installmentSchedules }: Props) {
  const flags = resolveFinancialFlags();
  const [monthOffset] = useState(0);

  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end, label: `${start.getMonth() + 1}/${start.getFullYear()}` };
  }, [monthOffset]);

  const report = useMemo(
    () => buildModuleParityReport({ loans, payments, installmentSchedules, range }),
    [loans, payments, installmentSchedules, range],
  );

  const exportCsv = () => {
    const data = buildFinancialReportData(report.aggregates, {
      title: "Paridade financeira entre módulos",
      engine: flags.unifiedDashboard ? "unified" : "legacy",
    });
    const blob = new Blob([financialReportToCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "paridade-financeira.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-base">Paridade entre módulos ({range.label})</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Módulo / agregação oficial. Nada é gravado ou corrigido.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" /> CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 text-[11px]">
          {Object.entries(flags).map(([key, value]) => (
            <Badge key={key} variant={value ? "default" : "outline"}>
              {key}: {value ? "on" : "off"}
            </Badge>
          ))}
        </div>

        <ParityBlock title="Dashboard" result={report.dashboard} />
        <ParityBlock title="Metas / Pontuação" result={report.goals} />
        <ParityBlock title="Relatórios e Telegram" result={report.reports} />

        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-sm font-medium">Ambiguidades documentadas</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {listMetricAmbiguities().map((item) => (
              <li key={item.key}>
                <span className="font-medium text-foreground">{item.label}:</span> {item.ambiguity}
              </li>
            ))}
          </ul>
        </div>

        {report.aggregates.warnings.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
            <p className="text-sm font-medium">Avisos da agregação ({report.aggregates.warnings.length})</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {report.aggregates.warnings.slice(0, 20).map((w, i) => (
                <li key={`${i}-${w}`}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
