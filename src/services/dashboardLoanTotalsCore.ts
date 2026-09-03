/**
 * Núcleo puro (sem I/O) que espelha, em TypeScript, EXATAMENTE a mesma lógica
 * da RPC `public.dashboard_loan_totals` (supabase/sql/dashboard_loan_totals_v3.sql).
 *
 * Serve para três propósitos:
 *  1. Testes automatizados de paridade (sem precisar de banco).
 *  2. Comparação em desenvolvimento entre o cálculo antigo (frontend) e o
 *     retorno da RPC — agregado e POR CONTRATO.
 *  3. Documentar, em um único lugar, a fórmula final de cada métrica.
 *
 * IMPORTANTE (etapa 2 da migração):
 *  - Os juros recebidos usam a alocação OFICIAL do app
 *    (`allocateInterestByPayment`) — nunca um rateio simplificado pela taxa.
 *  - A data de referência (`today`) é única para todo o cálculo e deve vir do
 *    fuso do app (`todayInAppTz()`), equivalente a
 *    `(now() AT TIME ZONE 'America/Sao_Paulo')::date` no Postgres.
 *
 * Nenhuma regra de negócio nova é introduzida aqui.
 */
import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import {
  allocateInterestByPayment,
  buildInstallmentBreakdown,
} from "@/features/financial/lib/interestAllocation";

export interface DashboardLoanTotals {
  emprestado: number;
  emprestadoTotal: number;
  receber: number;
  principalRecebido: number;
  jurosRecebidos: number;
  /** Regra oficial ATUAL do card: receber − capital ativo. */
  jurosReceber: number;
  multasPendentes: number;
  capitalAtivo: number;
  totalRecebidoPeriodo: number;
  quantidadeContratos: number;
  contratosAtivos: number;
  contratosQuitados: number;
  contratosParcelados: number;
  contratosAtrasados: number;
  taxaJurosMedia: number;
  /** NOVO: Σ juros do cronograma dos contratos ativos. */
  jurosContratados: number;
  /** NOVO: juros contratados − juros já recebidos (contratos ativos). */
  jurosPendentes: number;
  /** NOVO: leitura literal da especificação (receber − emprestado ativo). */
  jurosReceberSpec: number;
  /** Data de referência efetivamente usada (YYYY-MM-DD). */
  referenceDate?: string;
}

/** Métricas por contrato — base do diagnóstico de paridade. */
export interface DashboardLoanMetricRow {
  loanId: string;
  borrowerName?: string;
  status: string;
  startDate: string;
  emprestado: number;
  capitalAtivo: number;
  baseRemaining: number;
  multas: number;
  receber: number;
  jurosContratados: number;
  jurosRecebidosTotal: number;
  jurosPendentes: number;
  recebidoPeriodo: number;
  jurosRecebidos: number;
  principalRecebido: number;
  daysOverdue: number;
  installments: number;
  interestRate: number;
}

export interface DashboardLoanTotalsInput {
  loans: Loan[];
  payments: Payment[];
  schedules: InstallmentSchedule[];
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  /** Data de referência (YYYY-MM-DD) no fuso do app para cálculo de atraso. */
  today: string;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 86400000));
}

/**
 * Métricas por contrato (paridade com `public.dashboard_loan_metrics`).
 */
export function computeDashboardLoanMetrics(
  input: DashboardLoanTotalsInput,
): DashboardLoanMetricRow[] {
  const { loans, payments, schedules, start, end, today } = input;

  // Alocação oficial: juros por pagamento (histórico preservado).
  const interestByPayment = allocateInterestByPayment(
    loans.map((l) => ({
      id: l.id,
      amount: num(l.amount),
      interestRate: num(l.interestRate),
      installments: Math.max(1, num(l.installments) || 1),
      status: l.status,
    })),
    payments.map((p) => ({
      id: p.id,
      loanId: p.loanId,
      amount: num(p.amount),
      date: p.date,
      installmentNumber: num(p.installmentNumber),
      createdAt: (p as { createdAt?: string }).createdAt,
      metadata: (p.metadata ?? null) as Record<string, unknown> | null,
    })),
  );

  const totalsByLoan = new Map<string, { paid: number; interest: number }>();
  const periodByLoan = new Map<string, { paid: number; interest: number; principal: number }>();

  payments.forEach((p) => {
    const amount = num(p.amount);
    const interest = Math.min(amount, num(interestByPayment.get(p.id)));
    const principal = Math.max(0, round2(amount - interest));

    const t = totalsByLoan.get(p.loanId) ?? { paid: 0, interest: 0 };
    t.paid += amount;
    t.interest += interest;
    totalsByLoan.set(p.loanId, t);

    if (p.date >= start && p.date <= end) {
      const q = periodByLoan.get(p.loanId) ?? { paid: 0, interest: 0, principal: 0 };
      q.paid += amount;
      q.interest += interest;
      q.principal += principal;
      periodByLoan.set(p.loanId, q);
    }
  });

  return loans.map((loan) => {
    const amount = num(loan.amount);
    const rate = num(loan.interestRate);
    const installments = Math.max(1, num(loan.installments) || 1);
    const paidInstallments = num(loan.paidInstallments);
    const remainingAmount = num(loan.remainingAmount);
    const totals = totalsByLoan.get(loan.id) ?? { paid: 0, interest: 0 };
    const period = periodByLoan.get(loan.id) ?? { paid: 0, interest: 0, principal: 0 };
    const isPaid = loan.status === "paid";

    // base_remaining (paridade: getBaseRemainingAmount)
    const unpaidTotal = schedules
      .filter((s) => s.loanId === loan.id && s.installmentNumber > paidInstallments)
      .reduce((s, sc) => s + num(sc.amount), 0);

    let baseRemaining: number;
    if (remainingAmount > 0) baseRemaining = remainingAmount;
    else if (installments >= 2 && unpaidTotal > 0) baseRemaining = unpaidTotal;
    else baseRemaining = Math.max(0, Math.round(amount * (1 + rate / 100)) - totals.paid);

    // Encargos por atraso (1ª parcela pendente; fallback loan.dueDate)
    const nextSchedule = schedules.find(
      (s) => s.loanId === loan.id && s.installmentNumber === paidInstallments + 1,
    );
    const pendingDueDate = nextSchedule?.dueDate ?? loan.dueDate;
    const daysOverdue = isPaid || !pendingDueDate ? 0 : daysBetween(pendingDueDate, today);

    let fees = 0;
    if (daysOverdue > 0) {
      const lateValue = num(loan.lateInterestValue);
      if (lateValue > 0) {
        fees += loan.lateInterestType === "fixed"
          ? lateValue * daysOverdue
          : baseRemaining * (lateValue / 100) * daysOverdue;
      }
    }
    const penalty = num(loan.penaltyValue);
    if (penalty > 0 && !isPaid) fees += penalty;
    if (installments < 2) fees += num(loan.renegotiationPenaltyTotal);

    const jurosContratados = buildInstallmentBreakdown({
      amount,
      interestRate: rate,
      installments,
    }).reduce((s, e) => s + e.interest, 0);

    const capitalAtivo = isPaid
      ? 0
      : amount * Math.max(0, (installments - Math.min(paidInstallments, installments)) / installments);

    return {
      loanId: loan.id,
      borrowerName: loan.borrowerName,
      status: String(loan.status),
      startDate: loan.startDate,
      emprestado: round2(amount),
      capitalAtivo: round2(capitalAtivo),
      baseRemaining: round2(baseRemaining),
      multas: round2(isPaid ? 0 : Math.max(0, fees)),
      receber: round2(isPaid ? 0 : Math.max(0, baseRemaining + fees)),
      jurosContratados: round2(jurosContratados),
      jurosRecebidosTotal: round2(totals.interest),
      jurosPendentes: round2(isPaid ? 0 : Math.max(0, jurosContratados - totals.interest)),
      recebidoPeriodo: round2(period.paid),
      jurosRecebidos: round2(period.interest),
      principalRecebido: round2(period.principal),
      daysOverdue,
      installments,
      interestRate: rate,
    };
  });
}

export function computeDashboardLoanTotals(input: DashboardLoanTotalsInput): DashboardLoanTotals {
  const rows = computeDashboardLoanMetrics(input);
  const { start, end, today } = input;

  const sum = (fn: (r: DashboardLoanMetricRow) => number, filter?: (r: DashboardLoanMetricRow) => boolean) =>
    rows.reduce((s, r) => (filter && !filter(r) ? s : s + fn(r)), 0);

  const active = (r: DashboardLoanMetricRow) => r.status !== "paid";

  const receber = sum((r) => r.receber);
  const capitalAtivo = sum((r) => r.capitalAtivo);
  const emprestadoAtivo = sum((r) => r.emprestado, active);

  const rateWeighted = sum((r) => r.emprestado * r.interestRate, (r) => r.interestRate > 0);
  const rateBase = sum((r) => r.emprestado, (r) => r.interestRate > 0);

  return {
    emprestado: round2(sum((r) => r.emprestado, (r) => r.startDate >= start && r.startDate <= end)),
    emprestadoTotal: round2(sum((r) => r.emprestado)),
    receber: round2(receber),
    principalRecebido: round2(sum((r) => r.principalRecebido)),
    jurosRecebidos: round2(sum((r) => r.jurosRecebidos)),
    jurosReceber: round2(Math.max(0, receber - capitalAtivo)),
    multasPendentes: round2(sum((r) => r.multas)),
    capitalAtivo: round2(capitalAtivo),
    totalRecebidoPeriodo: round2(sum((r) => r.recebidoPeriodo)),
    quantidadeContratos: rows.length,
    contratosAtivos: rows.filter(active).length,
    contratosQuitados: rows.filter((r) => r.status === "paid").length,
    contratosParcelados: rows.filter((r) => r.installments >= 2).length,
    contratosAtrasados: rows.filter((r) => active(r) && r.daysOverdue > 0).length,
    taxaJurosMedia: rateBase > 0 ? Math.round((rateWeighted / rateBase) * 10000) / 10000 : 0,
    jurosContratados: round2(sum((r) => r.jurosContratados, active)),
    jurosPendentes: round2(sum((r) => r.jurosPendentes)),
    jurosReceberSpec: round2(Math.max(0, receber - emprestadoAtivo)),
    referenceDate: today,
  };
}

/** Campos financeiros comparáveis (usado no harness de divergência). */
export const DASHBOARD_LOAN_TOTALS_MONEY_FIELDS: Array<keyof DashboardLoanTotals> = [
  "emprestado",
  "emprestadoTotal",
  "receber",
  "principalRecebido",
  "jurosRecebidos",
  "jurosReceber",
  "multasPendentes",
  "capitalAtivo",
  "totalRecebidoPeriodo",
  "jurosContratados",
  "jurosPendentes",
  "jurosReceberSpec",
];

/** Retorna divergências acima de R$ 0,01 entre dois conjuntos de totais. */
export function diffDashboardLoanTotals(
  legacy: Partial<DashboardLoanTotals>,
  rpc: Partial<DashboardLoanTotals>,
  tolerance = 0.01,
): Array<{ field: string; legacy: number; rpc: number; diff: number }> {
  const out: Array<{ field: string; legacy: number; rpc: number; diff: number }> = [];
  DASHBOARD_LOAN_TOTALS_MONEY_FIELDS.forEach((field) => {
    if (legacy[field] === undefined && rpc[field] === undefined) return;
    const a = num(legacy[field]);
    const b = num(rpc[field]);
    const diff = Math.abs(a - b);
    if (diff > tolerance) out.push({ field: String(field), legacy: a, rpc: b, diff: round2(diff) });
  });
  return out;
}

/** Campos comparados por contrato. */
export const DASHBOARD_LOAN_ROW_FIELDS = [
  "emprestado",
  "principalRecebido",
  "jurosRecebidos",
  "multas",
  "capitalAtivo",
  "receber",
  "jurosContratados",
  "jurosPendentes",
] as const;

export type DashboardLoanRowField = (typeof DASHBOARD_LOAN_ROW_FIELDS)[number];

export interface LoanParityDiff {
  loanId: string;
  borrowerName?: string;
  fields: Array<{ field: DashboardLoanRowField; legacy: number; rpc: number; diff: number }>;
  maxDiff: number;
}

/**
 * Compara contrato a contrato. Divergências positivas e negativas NÃO se
 * compensam — cada contrato é avaliado isoladamente.
 */
export function diffDashboardLoanRows(
  legacyRows: DashboardLoanMetricRow[],
  rpcRows: Array<Partial<DashboardLoanMetricRow> & { loanId: string }>,
  tolerance = 0.01,
): LoanParityDiff[] {
  const rpcById = new Map(rpcRows.map((r) => [r.loanId, r]));
  const out: LoanParityDiff[] = [];

  legacyRows.forEach((legacy) => {
    const rpc = rpcById.get(legacy.loanId);
    if (!rpc) {
      out.push({
        loanId: legacy.loanId,
        borrowerName: legacy.borrowerName,
        fields: DASHBOARD_LOAN_ROW_FIELDS.map((field) => ({
          field,
          legacy: num(legacy[field]),
          rpc: 0,
          diff: round2(Math.abs(num(legacy[field]))),
        })).filter((f) => f.diff > tolerance),
        maxDiff: Number.POSITIVE_INFINITY,
      });
      return;
    }
    const fields = DASHBOARD_LOAN_ROW_FIELDS.map((field) => {
      const a = num(legacy[field]);
      const b = num((rpc as Record<string, unknown>)[field]);
      return { field, legacy: a, rpc: b, diff: round2(Math.abs(a - b)) };
    }).filter((f) => f.diff > tolerance);
    if (fields.length > 0) {
      out.push({
        loanId: legacy.loanId,
        borrowerName: legacy.borrowerName,
        fields,
        maxDiff: Math.max(...fields.map((f) => f.diff)),
      });
    }
  });

  // Contratos presentes só na RPC também são divergência.
  const legacyIds = new Set(legacyRows.map((r) => r.loanId));
  rpcRows.forEach((r) => {
    if (legacyIds.has(r.loanId)) return;
    out.push({ loanId: r.loanId, fields: [], maxDiff: Number.POSITIVE_INFINITY });
  });

  return out;
}
