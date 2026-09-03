/**
 * ============================================================================
 * NÚCLEO DE AGREGAÇÃO FINANCEIRA (FASE 3) — FONTE ÚNICA COMPARTILHADA
 * ============================================================================
 *
 * Este arquivo é PURO e SEM DEPENDÊNCIAS (nenhum import). Por isso ele roda
 * igualmente em:
 *   - Deno / Edge Functions (relatórios, Telegram, webhooks)
 *   - Browser / Vite (Dashboard, Metas, relatórios exportados)
 *
 * O frontend NÃO copia estas fórmulas: ele importa este mesmo arquivo
 * (`src/features/financial/lib/financialAggregatesCore.ts` re-exporta daqui).
 * Assim, Dashboard, Metas, Relatórios e Telegram somam da MESMA maneira.
 *
 * Regras invioláveis:
 *   1. Função pura: não lê banco, não escreve, não recalcula histórico.
 *   2. Todo dinheiro passa por `roundMoney` (2 casas).
 *   3. Multa e juros de atraso NUNCA abatem principal/juros contratuais.
 *   4. Datas são comparadas como texto ISO `YYYY-MM-DD` (sem fuso).
 *   5. Vendas (produtos) nunca são misturadas com carteira de empréstimos:
 *      ficam em campos próprios e só entram em `revenueInPeriodWithSales`.
 */

export const FINANCIAL_AGGREGATES_VERSION = "unified_financial_aggregates_v1";

/** Arredondamento monetário oficial (2 casas, estável). */
export function roundMoney(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function positive(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ---------------------------------------------------------------------------
 * 1. Período — definição única de início/fim (inclusivos nas duas pontas)
 * ------------------------------------------------------------------------- */

export type PeriodKind = "day" | "week" | "month" | "year" | "custom";

export interface PeriodBounds {
  kind: PeriodKind;
  /** `YYYY-MM-DD` inclusivo. */
  startIso: string;
  /** `YYYY-MM-DD` inclusivo. */
  endIso: string;
  label: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDate(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/**
 * Limites do período. `weekStartsOn` = 0 (domingo) espelha o Dashboard atual.
 * Para `custom`, informe `endIso`.
 */
export function getPeriodBounds(
  kind: PeriodKind,
  anchor: Date | string,
  opts?: { endIso?: string; weekStartsOn?: 0 | 1; label?: string },
): PeriodBounds {
  const anchorIso = toIsoDate(anchor);
  const parts = parseIso(anchorIso);
  if (!parts) {
    return { kind, startIso: anchorIso, endIso: opts?.endIso ?? anchorIso, label: opts?.label ?? anchorIso };
  }
  const { y, m, d } = parts;

  if (kind === "custom") {
    const endIso = opts?.endIso ?? anchorIso;
    const start = anchorIso <= endIso ? anchorIso : endIso;
    const end = anchorIso <= endIso ? endIso : anchorIso;
    return { kind, startIso: start, endIso: end, label: opts?.label ?? `${start} → ${end}` };
  }
  if (kind === "day") {
    return { kind, startIso: anchorIso, endIso: anchorIso, label: opts?.label ?? anchorIso };
  }
  if (kind === "week") {
    const weekStartsOn = opts?.weekStartsOn ?? 0;
    const ref = new Date(y, m - 1, d);
    const diff = (ref.getDay() - weekStartsOn + 7) % 7;
    const start = new Date(y, m - 1, d - diff);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return {
      kind,
      startIso: toIsoDate(start),
      endIso: toIsoDate(end),
      label: opts?.label ?? `${toIsoDate(start)} → ${toIsoDate(end)}`,
    };
  }
  if (kind === "year") {
    return { kind, startIso: `${y}-01-01`, endIso: `${y}-12-31`, label: opts?.label ?? String(y) };
  }
  const lastDay = new Date(y, m, 0).getDate();
  return {
    kind: "month",
    startIso: `${y}-${pad2(m)}-01`,
    endIso: `${y}-${pad2(m)}-${pad2(lastDay)}`,
    label: opts?.label ?? `${y}-${pad2(m)}`,
  };
}

/** Data dentro do período? Início e fim SEMPRE inclusivos. */
export function isDateInsidePeriod(dateIso: string | null | undefined, bounds: PeriodBounds | null): boolean {
  if (!dateIso) return false;
  if (!bounds) return true;
  const day = String(dateIso).slice(0, 10);
  return day >= bounds.startIso && day <= bounds.endIso;
}

/* ---------------------------------------------------------------------------
 * 2. Entradas — recorte estrutural do estado financeiro por contrato
 * ------------------------------------------------------------------------- */

/**
 * Recorte de `LoanFinancialState` necessário para agregar. Qualquer módulo
 * (Dashboard, Metas, Relatórios, Telegram) monta este objeto a partir da
 * fonte única por contrato e agrega SEMPRE por aqui.
 */
export interface AggregateLoanState {
  loanId: string;
  status?: string | null;
  isActive: boolean;
  isOverdue?: boolean;
  daysLate?: number;
  startDateIso?: string | null;
  dueDateIso?: string | null;
  /** Valor emprestado (principal contratado). */
  principal: number;
  principalRemaining: number;
  contractualInterestTotal: number;
  contractualInterestRemaining: number;
  penaltyPending: number;
  lateInterestPending: number;
  /** Payoff oficial: principal + juros contratuais + multa + juros de atraso. */
  totalReceivable: number;
  overdueAmount?: number;
  warnings?: string[];
}

/** Pagamento com alocação já resolvida pela fonte única (nunca recalculada aqui). */
export interface AggregatePayment {
  id: string;
  loanId: string;
  dateIso: string;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  penaltyAmount: number;
  lateInterestAmount: number;
}

export interface AggregateSaleReceipt {
  id: string;
  dateIso: string;
  amount: number;
}

export interface BuildFinancialAggregatesInput {
  loanStates: AggregateLoanState[];
  payments: AggregatePayment[];
  period?: PeriodBounds | null;
  /** Recebimentos de vendas de produtos — mantidos SEPARADOS da carteira. */
  saleReceipts?: AggregateSaleReceipt[];
  calculationDate?: string;
}

export interface ReceivedBreakdown {
  total: number;
  principal: number;
  interest: number;
  penalty: number;
  lateInterest: number;
  count: number;
}

export interface FinancialAggregates {
  calculationVersion: string;
  calculationDate: string | null;
  period: PeriodBounds | null;

  contractsTotal: number;
  contractsActive: number;
  contractsPaid: number;
  contractsOverdue: number;
  contractsStartedInPeriod: number;

  /** Principal contratado de TODOS os contratos ativos. */
  principalLentActive: number;
  /** Principal contratado de contratos iniciados no período. */
  principalLentInPeriod: number;
  /** Capital ativo / "na rua": principal ainda não amortizado (contratos ativos). */
  principalRemaining: number;

  contractualInterestRemaining: number;
  penaltyPending: number;
  lateInterestPending: number;
  /** Juros contratuais + multa + juros de atraso ainda pendentes. */
  interestAndFeesPending: number;
  /** Soma dos payoffs dos contratos ativos (total a receber oficial). */
  totalReceivable: number;
  overdueAmount: number;

  receivedInPeriod: ReceivedBreakdown;
  receivedAllTime: ReceivedBreakdown;
  /** Lucro realizado no período = juros + multa + juros de atraso recebidos. */
  realizedProfitInPeriod: number;
  realizedProfitAllTime: number;

  salesReceivedInPeriod: number;
  /** Recebido de empréstimos + vendas (única métrica que mistura os dois). */
  revenueInPeriodWithSales: number;

  warnings: string[];
}

function emptyReceived(): ReceivedBreakdown {
  return { total: 0, principal: 0, interest: 0, penalty: 0, lateInterest: 0, count: 0 };
}

function addPayment(acc: ReceivedBreakdown, p: AggregatePayment): void {
  acc.total += Number(p.amount) || 0;
  acc.principal += Number(p.principalAmount) || 0;
  acc.interest += Number(p.interestAmount) || 0;
  acc.penalty += Number(p.penaltyAmount) || 0;
  acc.lateInterest += Number(p.lateInterestAmount) || 0;
  acc.count += 1;
}

function sealReceived(acc: ReceivedBreakdown): ReceivedBreakdown {
  return {
    total: roundMoney(acc.total),
    principal: roundMoney(acc.principal),
    interest: roundMoney(acc.interest),
    penalty: roundMoney(acc.penalty),
    lateInterest: roundMoney(acc.lateInterest),
    count: acc.count,
  };
}

/**
 * Agregação oficial. Determinística: mesmas entradas → mesmas saídas.
 */
export function buildFinancialAggregates(input: BuildFinancialAggregatesInput): FinancialAggregates {
  const period = input.period ?? null;
  const states = Array.isArray(input.loanStates) ? input.loanStates : [];
  const payments = Array.isArray(input.payments) ? input.payments : [];
  const saleReceipts = Array.isArray(input.saleReceipts) ? input.saleReceipts : [];
  const warnings: string[] = [];

  let contractsActive = 0;
  let contractsPaid = 0;
  let contractsOverdue = 0;
  let contractsStartedInPeriod = 0;
  let principalLentActive = 0;
  let principalLentInPeriod = 0;
  let principalRemaining = 0;
  let contractualInterestRemaining = 0;
  let penaltyPending = 0;
  let lateInterestPending = 0;
  let totalReceivable = 0;
  let overdueAmount = 0;

  const seen = new Set<string>();
  for (const state of states) {
    if (seen.has(state.loanId)) {
      warnings.push(`Contrato ${state.loanId} apareceu duplicado na agregação (ignorado).`);
      continue;
    }
    seen.add(state.loanId);

    if (isDateInsidePeriod(state.startDateIso ?? null, period)) {
      contractsStartedInPeriod += 1;
      principalLentInPeriod += positive(state.principal);
    }

    if (state.isActive) {
      contractsActive += 1;
      principalLentActive += positive(state.principal);
      principalRemaining += positive(state.principalRemaining);
      contractualInterestRemaining += positive(state.contractualInterestRemaining);
      penaltyPending += positive(state.penaltyPending);
      lateInterestPending += positive(state.lateInterestPending);
      totalReceivable += positive(state.totalReceivable);
      overdueAmount += positive(state.overdueAmount);
      if (state.isOverdue) contractsOverdue += 1;
      if (positive(state.principalRemaining) > positive(state.principal) + 0.01) {
        warnings.push(`Contrato ${state.loanId}: principal restante maior que o valor emprestado.`);
      }
    } else {
      contractsPaid += 1;
    }

    if (state.warnings && state.warnings.length > 0) {
      for (const w of state.warnings) warnings.push(`Contrato ${state.loanId}: ${w}`);
    }
  }

  const inPeriod = emptyReceived();
  const allTime = emptyReceived();
  for (const payment of payments) {
    addPayment(allTime, payment);
    if (isDateInsidePeriod(payment.dateIso, period)) addPayment(inPeriod, payment);
  }

  const receivedInPeriod = sealReceived(inPeriod);
  const receivedAllTime = sealReceived(allTime);

  const salesReceivedInPeriod = roundMoney(
    saleReceipts
      .filter((sale) => isDateInsidePeriod(sale.dateIso, period))
      .reduce((sum, sale) => sum + (Number(sale.amount) || 0), 0),
  );

  const realizedProfitInPeriod = roundMoney(
    receivedInPeriod.interest + receivedInPeriod.penalty + receivedInPeriod.lateInterest,
  );
  const realizedProfitAllTime = roundMoney(
    receivedAllTime.interest + receivedAllTime.penalty + receivedAllTime.lateInterest,
  );

  const interestAndFeesPending = roundMoney(
    contractualInterestRemaining + penaltyPending + lateInterestPending,
  );

  return {
    calculationVersion: FINANCIAL_AGGREGATES_VERSION,
    calculationDate: input.calculationDate ?? null,
    period,

    contractsTotal: seen.size,
    contractsActive,
    contractsPaid,
    contractsOverdue,
    contractsStartedInPeriod,

    principalLentActive: roundMoney(principalLentActive),
    principalLentInPeriod: roundMoney(principalLentInPeriod),
    principalRemaining: roundMoney(principalRemaining),

    contractualInterestRemaining: roundMoney(contractualInterestRemaining),
    penaltyPending: roundMoney(penaltyPending),
    lateInterestPending: roundMoney(lateInterestPending),
    interestAndFeesPending,
    totalReceivable: roundMoney(totalReceivable),
    overdueAmount: roundMoney(overdueAmount),

    receivedInPeriod,
    receivedAllTime,
    realizedProfitInPeriod,
    realizedProfitAllTime,

    salesReceivedInPeriod,
    revenueInPeriodWithSales: roundMoney(receivedInPeriod.total + salesReceivedInPeriod),

    warnings,
  };
}

/* ---------------------------------------------------------------------------
 * 3. DTO de relatório — mesma estrutura para tela, export e Telegram
 * ------------------------------------------------------------------------- */

export interface FinancialReportRow {
  key: string;
  label: string;
  value: number;
  kind: "money" | "count";
}

export interface FinancialReportData {
  title: string;
  periodLabel: string;
  generatedAt: string | null;
  calculationVersion: string;
  engine: "unified" | "legacy";
  rows: FinancialReportRow[];
  warnings: string[];
}

export function buildFinancialReportData(
  aggregates: FinancialAggregates,
  meta?: { title?: string; engine?: "unified" | "legacy"; generatedAt?: string },
): FinancialReportData {
  const rows: FinancialReportRow[] = [
    { key: "contractsActive", label: "Contratos ativos", value: aggregates.contractsActive, kind: "count" },
    { key: "contractsOverdue", label: "Contratos em atraso", value: aggregates.contractsOverdue, kind: "count" },
    { key: "principalRemaining", label: "Capital ativo (principal em aberto)", value: aggregates.principalRemaining, kind: "money" },
    { key: "contractualInterestRemaining", label: "Juros contratuais restantes", value: aggregates.contractualInterestRemaining, kind: "money" },
    { key: "penaltyPending", label: "Multas pendentes", value: aggregates.penaltyPending, kind: "money" },
    { key: "lateInterestPending", label: "Juros de atraso pendentes", value: aggregates.lateInterestPending, kind: "money" },
    { key: "totalReceivable", label: "Total a receber", value: aggregates.totalReceivable, kind: "money" },
    { key: "overdueAmount", label: "Valor em atraso", value: aggregates.overdueAmount, kind: "money" },
    { key: "receivedInPeriod", label: "Recebido no período", value: aggregates.receivedInPeriod.total, kind: "money" },
    { key: "receivedPrincipal", label: "— principal recebido", value: aggregates.receivedInPeriod.principal, kind: "money" },
    { key: "receivedInterest", label: "— juros recebidos", value: aggregates.receivedInPeriod.interest, kind: "money" },
    { key: "receivedFees", label: "— multa + juros de atraso recebidos", value: roundMoney(aggregates.receivedInPeriod.penalty + aggregates.receivedInPeriod.lateInterest), kind: "money" },
    { key: "realizedProfitInPeriod", label: "Lucro realizado no período", value: aggregates.realizedProfitInPeriod, kind: "money" },
    { key: "principalLentInPeriod", label: "Emprestado no período", value: aggregates.principalLentInPeriod, kind: "money" },
  ];

  return {
    title: meta?.title ?? "Resumo financeiro",
    periodLabel: aggregates.period?.label ?? "Todos os períodos",
    generatedAt: meta?.generatedAt ?? aggregates.calculationDate ?? null,
    calculationVersion: aggregates.calculationVersion,
    engine: meta?.engine ?? "unified",
    rows,
    warnings: aggregates.warnings,
  };
}

export function financialReportToJson(report: FinancialReportData): string {
  return JSON.stringify(report, null, 2);
}

export function financialReportToCsv(report: FinancialReportData): string {
  const head = ["chave", "indicador", "valor", "tipo"];
  const lines = [head.join(";")];
  for (const row of report.rows) {
    lines.push([row.key, `"${row.label.replace(/"/g, '""')}"`, String(row.value), row.kind].join(";"));
  }
  return lines.join("\n");
}

/* ---------------------------------------------------------------------------
 * 4. Paridade entre módulos — comparador somente leitura
 * ------------------------------------------------------------------------- */

export interface ParityRow {
  metric: string;
  label: string;
  reference: number;
  candidate: number;
  difference: number;
  divergent: boolean;
}

export interface ParityResult {
  rows: ParityRow[];
  divergentCount: number;
  ok: boolean;
  tolerance: number;
}

/**
 * Compara os números de um módulo (candidate) com a agregação oficial
 * (reference). NÃO grava nada e não corrige valores.
 */
export function compareModuleParity(
  reference: Record<string, number>,
  candidate: Record<string, number>,
  labels?: Record<string, string>,
  tolerance = 0.01,
): ParityResult {
  const keys = Array.from(new Set([...Object.keys(reference), ...Object.keys(candidate)])).sort();
  const rows: ParityRow[] = keys.map((metric) => {
    const ref = roundMoney(reference[metric] ?? 0);
    const cand = roundMoney(candidate[metric] ?? 0);
    const difference = roundMoney(cand - ref);
    return {
      metric,
      label: labels?.[metric] ?? metric,
      reference: ref,
      candidate: cand,
      difference,
      divergent: Math.abs(difference) > tolerance,
    };
  });
  const divergentCount = rows.filter((row) => row.divergent).length;
  return { rows, divergentCount, ok: divergentCount === 0, tolerance };
}
