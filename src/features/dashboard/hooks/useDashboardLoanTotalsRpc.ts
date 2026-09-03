/**
 * Hook do Dashboard para os totais agregados de empréstimos via RPC.
 *
 * ESTRATÉGIA DE ROLLOUT (etapa 2): a lógica antiga continua ativa e é a única
 * fonte dos cards. Este hook só executa em modo diagnóstico — nunca aumenta o
 * egress dos usuários finais em produção:
 *
 *   1. ambiente de desenvolvimento (`import.meta.env.DEV`); OU
 *   2. flag temporária `VITE_FINANCIAL_DIFF_DIAGNOSTICS=true` combinada com
 *      usuário administrativo autorizado.
 *
 * Quando habilitado, compara RPC × legado no agregado E por contrato,
 * registrando divergências acima de R$ 0,01.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchDashboardLoanTotals,
  fetchDashboardLoanTotalsByLoan,
  dashboardLoanTotalsQueryKey,
  dashboardLoanByLoanQueryKey,
  toIsoDate,
  DashboardLoanTotalsMissingError,
  type DashboardLoanTotals,
} from "@/services/dashboardLoanTotals";
import {
  diffDashboardLoanTotals,
  diffDashboardLoanRows,
  type DashboardLoanMetricRow,
} from "@/services/dashboardLoanTotalsCore";
import { financialDiffDiagnosticsEnabled } from "@/features/financial/lib/financialFlags";

const ADMIN_ROLES = new Set(["admin", "owner", "super_admin", "superadmin"]);

/**
 * Regra única de habilitação do harness de comparação (requisito: não manter
 * a RPC somada às consultas antigas em produção por tempo indeterminado).
 */
export function dashboardRpcHarnessEnabled(role?: string | null): boolean {
  if (import.meta.env.DEV) return true;
  return financialDiffDiagnosticsEnabled() && !!role && ADMIN_ROLES.has(String(role));
}

export interface UseDashboardLoanTotalsOptions {
  range: { start: Date; end: Date };
  /** Papel do usuário — usado para autorizar o harness fora de desenvolvimento. */
  role?: string | null;
  enabled?: boolean;
  /** Valores agregados calculados hoje no frontend, para comparação. */
  legacy?: Partial<DashboardLoanTotals>;
  /** Métricas legadas POR CONTRATO, para comparação individual. */
  legacyRows?: DashboardLoanMetricRow[];
  /** Executa também a RPC de diagnóstico por contrato. */
  byLoan?: boolean;
  /**
   * Rollout oficial (fase 7): quando `true`, a RPC é consultada mesmo fora do
   * harness de diagnóstico, porque ela passa a ser a fonte dos cards.
   */
  forceEnabled?: boolean;
}

export function useDashboardLoanTotalsRpc({
  range,
  role,
  enabled = true,
  legacy,
  legacyRows,
  byLoan = false,
  forceEnabled = false,
}: UseDashboardLoanTotalsOptions) {
  const start = toIsoDate(range.start);
  const end = toIsoDate(range.end);
  const harnessEnabled = enabled && (forceEnabled || dashboardRpcHarnessEnabled(role));


  const query = useQuery({
    queryKey: dashboardLoanTotalsQueryKey(start, end),
    queryFn: () => fetchDashboardLoanTotals(start, end),
    enabled: harnessEnabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) =>
      !(error instanceof DashboardLoanTotalsMissingError) && failureCount < 2,
  });

  const rowsQuery = useQuery({
    queryKey: dashboardLoanByLoanQueryKey(start, end),
    queryFn: () => fetchDashboardLoanTotalsByLoan(start, end),
    enabled: harnessEnabled && byLoan,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const missing =
    query.error instanceof DashboardLoanTotalsMissingError
    || rowsQuery.error instanceof DashboardLoanTotalsMissingError;

  const divergences = useMemo(() => {
    if (!harnessEnabled || !query.data || !legacy) return [];
    return diffDashboardLoanTotals(legacy, query.data);
  }, [harnessEnabled, query.data, legacy]);

  const loanDivergences = useMemo(() => {
    if (!harnessEnabled || !rowsQuery.data || !legacyRows) return [];
    return diffDashboardLoanRows(legacyRows, rowsQuery.data);
  }, [harnessEnabled, rowsQuery.data, legacyRows]);

  useEffect(() => {
    if (!harnessEnabled) return;
    if (divergences.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[dashboard_loan_totals] divergências agregadas (${start} → ${end}):`,
        divergences.map((d) => `${d.field}: legado ${d.legacy} vs rpc ${d.rpc} (Δ ${d.diff})`),
      );
    }
    if (loanDivergences.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[dashboard_loan_totals] divergências por contrato (${loanDivergences.length}):`,
        loanDivergences.slice(0, 20),
      );
    }
  }, [harnessEnabled, divergences, loanDivergences, start, end]);

  return {
    totals: query.data ?? null,
    rows: rowsQuery.data ?? null,
    loading: query.isLoading || rowsQuery.isLoading,
    error: missing ? null : (query.error ?? rowsQuery.error),
    missing,
    harnessEnabled,
    divergences,
    loanDivergences,
    comparedLoans: rowsQuery.data?.length ?? 0,
    maxDiff: Math.max(
      0,
      ...divergences.map((d) => d.diff),
      ...loanDivergences.map((d) => (Number.isFinite(d.maxDiff) ? d.maxDiff : 0)),
    ),
    refetch: () => Promise.all([query.refetch(), rowsQuery.refetch()]),
  };
}
