/**
 * Service único de acesso às RPCs de totais do Dashboard.
 *
 * Nenhum componente deve chamar `supabase.rpc("dashboard_loan_totals")`
 * diretamente — sempre por aqui.
 */
import { supabase } from "@/integrations/supabase/userClient";
import type {
  DashboardLoanTotals,
  DashboardLoanMetricRow,
} from "@/services/dashboardLoanTotalsCore";

export type {
  DashboardLoanTotals,
  DashboardLoanMetricRow,
} from "@/services/dashboardLoanTotalsCore";

export interface DashboardLoanTotalsRow {
  owner_id: string;
  emprestado: number | string | null;
  emprestado_total: number | string | null;
  receber: number | string | null;
  principal_recebido: number | string | null;
  juros_recebidos: number | string | null;
  juros_receber: number | string | null;
  multas_pendentes: number | string | null;
  capital_ativo: number | string | null;
  total_recebido_periodo: number | string | null;
  quantidade_contratos: number | string | null;
  contratos_ativos: number | string | null;
  contratos_quitados: number | string | null;
  contratos_parcelados: number | string | null;
  contratos_atrasados: number | string | null;
  taxa_juros_media: number | string | null;
  juros_contratados?: number | string | null;
  juros_pendentes?: number | string | null;
  juros_receber_spec?: number | string | null;
  reference_date?: string | null;
}

export interface DashboardLoanByLoanRow {
  loan_id: string;
  borrower_name?: string | null;
  status: string;
  emprestado: number | string | null;
  principal_recebido: number | string | null;
  juros_recebidos: number | string | null;
  multas: number | string | null;
  capital_ativo: number | string | null;
  receber: number | string | null;
  juros_contratados: number | string | null;
  juros_pendentes: number | string | null;
  reference_date?: string | null;
}

export class DashboardLoanTotalsMissingError extends Error {}

/** Conversão segura: numeric do Postgres chega como string. */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapDashboardLoanTotals(row: DashboardLoanTotalsRow): DashboardLoanTotals {
  return {
    emprestado: toNumber(row.emprestado),
    emprestadoTotal: toNumber(row.emprestado_total),
    receber: toNumber(row.receber),
    principalRecebido: toNumber(row.principal_recebido),
    jurosRecebidos: toNumber(row.juros_recebidos),
    jurosReceber: toNumber(row.juros_receber),
    multasPendentes: toNumber(row.multas_pendentes),
    capitalAtivo: toNumber(row.capital_ativo),
    totalRecebidoPeriodo: toNumber(row.total_recebido_periodo),
    quantidadeContratos: toNumber(row.quantidade_contratos),
    contratosAtivos: toNumber(row.contratos_ativos),
    contratosQuitados: toNumber(row.contratos_quitados),
    contratosParcelados: toNumber(row.contratos_parcelados),
    contratosAtrasados: toNumber(row.contratos_atrasados),
    taxaJurosMedia: toNumber(row.taxa_juros_media),
    jurosContratados: toNumber(row.juros_contratados),
    jurosPendentes: toNumber(row.juros_pendentes),
    jurosReceberSpec: toNumber(row.juros_receber_spec),
    referenceDate: row.reference_date ?? undefined,
  };
}

export function mapDashboardLoanByLoan(
  row: DashboardLoanByLoanRow,
): Partial<DashboardLoanMetricRow> & { loanId: string } {
  return {
    loanId: row.loan_id,
    borrowerName: row.borrower_name ?? undefined,
    status: row.status,
    emprestado: toNumber(row.emprestado),
    principalRecebido: toNumber(row.principal_recebido),
    jurosRecebidos: toNumber(row.juros_recebidos),
    multas: toNumber(row.multas),
    capitalAtivo: toNumber(row.capital_ativo),
    receber: toNumber(row.receber),
    jurosContratados: toNumber(row.juros_contratados),
    jurosPendentes: toNumber(row.juros_pendentes),
  };
}

export const EMPTY_DASHBOARD_LOAN_TOTALS: DashboardLoanTotals = {
  emprestado: 0, emprestadoTotal: 0, receber: 0, principalRecebido: 0,
  jurosRecebidos: 0, jurosReceber: 0, multasPendentes: 0, capitalAtivo: 0,
  totalRecebidoPeriodo: 0, quantidadeContratos: 0, contratosAtivos: 0,
  contratosQuitados: 0, contratosParcelados: 0, contratosAtrasados: 0,
  taxaJurosMedia: 0, jurosContratados: 0, jurosPendentes: 0, jurosReceberSpec: 0,
};

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Chave de cache dedicada — invalidação específica, sem limpar o cache financeiro. */
export const DASHBOARD_LOAN_TOTALS_QUERY_ROOT = "dashboard-loan-totals" as const;
export const DASHBOARD_LOAN_BY_LOAN_QUERY_ROOT = "dashboard-loan-totals-by-loan" as const;

export function dashboardLoanTotalsQueryKey(start: string, end: string) {
  return [DASHBOARD_LOAN_TOTALS_QUERY_ROOT, start, end] as const;
}

export function dashboardLoanByLoanQueryKey(start: string, end: string) {
  return [DASHBOARD_LOAN_BY_LOAN_QUERY_ROOT, start, end] as const;
}


function normalizeError(error: { message?: string }): never {
  const message = String(error.message || "");
  if (/dashboard_loan_totals|does not exist|PGRST202/i.test(message)) {
    throw new DashboardLoanTotalsMissingError(
      "RPC dashboard_loan_totals ainda não aplicada no banco.",
    );
  }
  throw new Error(`Falha ao carregar totais de empréstimos: ${message}`);
}

export async function fetchDashboardLoanTotals(
  start: string,
  end: string,
): Promise<DashboardLoanTotals> {
  const { data, error } = await supabase.rpc(
    "dashboard_loan_totals" as any,
    { _start: start, _end: end },
  );

  if (error) normalizeError(error);

  const row = (Array.isArray(data) ? data[0] : data) as DashboardLoanTotalsRow | undefined;
  if (!row) return EMPTY_DASHBOARD_LOAN_TOTALS;
  return mapDashboardLoanTotals(row);
}

/**
 * Diagnóstico por contrato. NÃO é usado pelos cards — apenas pelo painel de
 * migração (dev / admin / flag temporária).
 */
export async function fetchDashboardLoanTotalsByLoan(
  start: string,
  end: string,
): Promise<Array<Partial<DashboardLoanMetricRow> & { loanId: string }>> {
  const { data, error } = await supabase.rpc(
    "dashboard_loan_totals_by_loan" as any,
    { _start: start, _end: end },
  );

  if (error) normalizeError(error);

  const rows = (Array.isArray(data) ? data : []) as DashboardLoanByLoanRow[];
  return rows.map(mapDashboardLoanByLoan);
}
