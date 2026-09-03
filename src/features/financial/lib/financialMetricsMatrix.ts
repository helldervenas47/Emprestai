/**
 * ============================================================================
 * MATRIZ OFICIAL DE MÉTRICAS FINANCEIRAS (FASE 3)
 * ============================================================================
 *
 * Define, em UM lugar só, o significado de cada indicador exibido no
 * Dashboard, Metas, Relatórios e Telegram. Serve de contrato entre módulos:
 * se dois módulos mostram o mesmo rótulo, precisam usar a mesma chave aqui.
 *
 * Não contém cálculo — apenas definição, fórmula em texto e ambiguidades
 * conhecidas (para evitar que o mesmo nome signifique coisas diferentes).
 */

export interface FinancialMetricDefinition {
  /** Chave em `FinancialAggregates`. */
  key: string;
  label: string;
  definition: string;
  formula: string;
  includesLateFees: boolean;
  includesSales: boolean;
  /** Regime: caixa (recebido) ou competência (previsto/pendente). */
  basis: "cash" | "accrual" | "structural";
  consumers: string[];
  /** Confusões conhecidas que este verbete resolve. */
  ambiguity?: string;
}

export const FINANCIAL_METRICS: FinancialMetricDefinition[] = [
  {
    key: "principalLentActive",
    label: "Emprestado (contratos ativos)",
    definition: "Soma do valor originalmente emprestado dos contratos ainda não quitados.",
    formula: "Σ principal dos contratos ativos",
    includesLateFees: false,
    includesSales: false,
    basis: "structural",
    consumers: ["Dashboard", "Relatórios", "Telegram"],
    ambiguity: "Não confundir com capital ativo: aqui o valor não diminui com amortização.",
  },
  {
    key: "principalRemaining",
    label: "Capital ativo (na rua)",
    definition: "Principal que ainda não foi amortizado nos contratos ativos.",
    formula: "Σ max(0, principal − principal pago) dos contratos ativos",
    includesLateFees: false,
    includesSales: false,
    basis: "structural",
    consumers: ["Dashboard", "Metas", "Relatórios", "Telegram"],
    ambiguity:
      "A regra legada usava rateio por parcelas pagas (principal × parcelas restantes ÷ total). "
      + "A regra unificada usa o principal efetivamente amortizado no histórico.",
  },
  {
    key: "contractualInterestRemaining",
    label: "Juros contratuais restantes",
    definition: "Juros do plano oficial ainda não pagos. Não inclui multa nem juros de atraso.",
    formula: "Σ max(0, juros contratuais − juros contratuais pagos)",
    includesLateFees: false,
    includesSales: false,
    basis: "accrual",
    consumers: ["Dashboard", "Payment Hub", "Relatórios"],
    ambiguity: "Diferente de 'juros da parcela/ciclo atual', que é apenas a competência vigente.",
  },
  {
    key: "penaltyPending",
    label: "Multas pendentes",
    definition: "Multa aplicada por atraso e ainda não paga.",
    formula: "Σ max(0, multa aplicada − multa paga)",
    includesLateFees: true,
    includesSales: false,
    basis: "accrual",
    consumers: ["Dashboard", "Relatórios", "Telegram"],
  },
  {
    key: "lateInterestPending",
    label: "Juros de atraso pendentes",
    definition: "Juros de mora aplicados e ainda não pagos.",
    formula: "Σ max(0, juros de atraso aplicados − pagos)",
    includesLateFees: true,
    includesSales: false,
    basis: "accrual",
    consumers: ["Dashboard", "Relatórios", "Telegram"],
  },
  {
    key: "totalReceivable",
    label: "Total a receber",
    definition: "Payoff dos contratos ativos na data de cálculo.",
    formula: "Σ (principal restante + juros contratuais restantes + multa pendente + juros de atraso pendentes)",
    includesLateFees: true,
    includesSales: false,
    basis: "accrual",
    consumers: ["Dashboard", "Metas", "Relatórios", "Telegram"],
    ambiguity:
      "A regra legada somava juros já recebidos avulsos ao total a receber, inflando o número. "
      + "Na regra unificada, o total a receber é sempre o que ainda falta receber.",
  },
  {
    key: "receivedInPeriod.total",
    label: "Recebido no período",
    definition: "Pagamentos de empréstimos com data dentro do período (regime de caixa).",
    formula: "Σ valor dos pagamentos com data ∈ [início, fim]",
    includesLateFees: true,
    includesSales: false,
    basis: "cash",
    consumers: ["Dashboard", "Relatórios", "Telegram"],
    ambiguity: "Vendas de produtos NÃO entram aqui — veja revenueInPeriodWithSales.",
  },
  {
    key: "realizedProfitInPeriod",
    label: "Lucro realizado no período",
    definition: "Parcela de juros + multa + juros de atraso efetivamente recebida no período.",
    formula: "Σ (juros + multa + juros de atraso) dos pagamentos do período",
    includesLateFees: true,
    includesSales: false,
    basis: "cash",
    consumers: ["Dashboard", "Metas", "Relatórios"],
    ambiguity: "Não confundir com 'lucro estimado', que é projeção de juros pendentes (competência).",
  },
  {
    key: "interestAndFeesPending",
    label: "Lucro estimado (pendente)",
    definition: "Juros contratuais restantes + multa + juros de atraso pendentes.",
    formula: "contractualInterestRemaining + penaltyPending + lateInterestPending",
    includesLateFees: true,
    includesSales: false,
    basis: "accrual",
    consumers: ["Dashboard", "Relatórios"],
  },
  {
    key: "revenueInPeriodWithSales",
    label: "Faturamento no período (com vendas)",
    definition: "Recebido de empréstimos somado aos recebimentos de vendas de produtos.",
    formula: "receivedInPeriod.total + salesReceivedInPeriod",
    includesLateFees: true,
    includesSales: true,
    basis: "cash",
    consumers: ["Dashboard"],
    ambiguity: "Única métrica que mistura carteira e vendas; usar só quando 'incluir vendas' estiver ativo.",
  },
  {
    key: "overdueAmount",
    label: "Valor em atraso",
    definition: "Soma das parcelas vencidas e não pagas dos contratos ativos.",
    formula: "Σ parcelas vencidas em aberto",
    includesLateFees: false,
    includesSales: false,
    basis: "accrual",
    consumers: ["Dashboard", "Calendário", "Telegram"],
    ambiguity: "Não inclui multa/juros de atraso — estes têm campos próprios.",
  },
];

export function getMetricDefinition(key: string): FinancialMetricDefinition | undefined {
  return FINANCIAL_METRICS.find((metric) => metric.key === key);
}

/** Ambiguidades conhecidas — exibidas no painel de diagnóstico. */
export function listMetricAmbiguities(): { key: string; label: string; ambiguity: string }[] {
  return FINANCIAL_METRICS
    .filter((metric) => !!metric.ambiguity)
    .map((metric) => ({ key: metric.key, label: metric.label, ambiguity: metric.ambiguity as string }));
}
