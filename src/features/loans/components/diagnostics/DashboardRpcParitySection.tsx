/**
 * Validação de paridade POR CONTRATO entre o cálculo legado do frontend e a
 * RPC `dashboard_loan_totals` (V3). Somente leitura.
 *
 * Disponível apenas dentro do painel de migração, que já exige
 * `VITE_FINANCIAL_DIFF_DIAGNOSTICS` + admin/preview. Nomes de clientes são
 * exibidos somente em desenvolvimento.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLoans } from "@/features/loans/hooks/useLoans";
import { todayInAppTz } from "@/lib/timezone";
import { useDashboardLoanTotalsRpc } from "@/features/dashboard/hooks/useDashboardLoanTotalsRpc";
import { computeDashboardLoanMetrics, computeDashboardLoanTotals } from "@/services/dashboardLoanTotalsCore";

const brl = (v: number) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function monthRange(reference: string) {
  const [y, m] = reference.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
}

export function DashboardRpcParitySection() {
  const { role } = useAuth();
  const { loans, payments, installmentSchedules } = useLoans();
  const [expanded, setExpanded] = useState(false);

  const today = todayInAppTz();
  const range = useMemo(() => monthRange(today), [today]);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const legacyRows = useMemo(
    () =>
      computeDashboardLoanMetrics({
        loans: loans ?? [],
        payments: payments ?? [],
        schedules: installmentSchedules ?? [],
        start: iso(range.start),
        end: iso(range.end),
        today,
      }),
    [loans, payments, installmentSchedules, range, today],
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

  const {
    divergences,
    loanDivergences,
    comparedLoans,
    maxDiff,
    missing,
    loading,
    harnessEnabled,
    refetch,
  } = useDashboardLoanTotalsRpc({
    range,
    role,
    legacy: legacyTotals,
    legacyRows,
    byLoan: true,
  });

  const showNames = import.meta.env.DEV;
  const approved = !missing && !loading && divergences.length === 0 && loanDivergences.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Paridade RPC × frontend (por contrato)</CardTitle>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={!harnessEnabled}>
          Recalcular
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!harnessEnabled && (
          <p className="text-muted-foreground">
            Harness desabilitado neste ambiente (roda apenas em desenvolvimento ou para
            administradores com a flag de diagnóstico ativa).
          </p>
        )}
        {harnessEnabled && missing && (
          <p className="text-destructive">
            RPC não publicada no Supabase. Aplique <code>supabase/sql/dashboard_loan_totals_v3.sql</code>.
          </p>
        )}
        {harnessEnabled && !missing && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Contratos comparados: {comparedLoans}</Badge>
              <Badge variant="outline">Divergências agregadas: {divergences.length}</Badge>
              <Badge variant="outline">Contratos divergentes: {loanDivergences.length}</Badge>
              <Badge variant="outline">Maior diferença: {brl(maxDiff)}</Badge>
              <Badge className={approved ? "bg-emerald-600 text-white" : "bg-destructive text-white"}>
                {approved ? "Liberado para substituição" : "Bloqueado"}
              </Badge>
            </div>

            {divergences.length > 0 && (
              <div className="space-y-1">
                <p className="font-medium">Agregado</p>
                {divergences.map((d) => (
                  <p key={d.field} className="text-muted-foreground">
                    {d.field}: legado {brl(d.legacy)} × rpc {brl(d.rpc)} (Δ {brl(d.diff)})
                  </p>
                ))}
              </div>
            )}

            {loanDivergences.length > 0 && (
              <div className="space-y-2">
                <button className="font-medium underline" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Ocultar" : "Ver"} contratos divergentes ({loanDivergences.length})
                </button>
                {expanded && (
                  <div className="space-y-2">
                    {loanDivergences.slice(0, 100).map((row) => (
                      <div key={row.loanId} className="rounded-md border p-2">
                        <p className="font-mono text-xs">
                          {row.loanId}
                          {showNames && row.borrowerName ? ` — ${row.borrowerName}` : ""}
                        </p>
                        {row.fields.map((f) => (
                          <p key={f.field} className="text-muted-foreground text-xs">
                            {f.field}: legado {brl(f.legacy)} × rpc {brl(f.rpc)} (Δ {brl(f.diff)})
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
