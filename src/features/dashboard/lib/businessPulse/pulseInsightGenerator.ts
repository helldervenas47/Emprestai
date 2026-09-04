import { formatBRL } from "@/features/creditCards/lib/creditLimit";
import { PULSE_CONFIG } from "./pulseConfig";
import type {
  BusinessPulseAnalysis,
  PulseComparisonMetrics,
  PulseEventItem,
  PulseEventType,
  PulseRecommendation,
} from "./types";

function formatPp(pp: number): string {
  const sign = pp > 0 ? "+" : "";
  const formatted = pp.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${sign}${formatted} p.p.`;
}

function formatPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  const formatted = pct.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  return `${sign}${formatted}%`;
}

export function generateBusinessPulseAnalysis(
  metrics: PulseComparisonMetrics,
  generatedAt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
): BusinessPulseAnalysis {
  // 1. Cenário: Sem dados suficientes
  if (!metrics.hasSufficientData) {
    return {
      generatedAt,
      hasSufficientData: false,
      isInitialHistory: true,
      headline: "Ainda não há dados suficientes para gerar uma análise executiva.",
      tone: "attention",
      events: [],
      recommendation: {
        text: "Comece a registrar novos empréstimos, recebimentos e despesas para habilitar os insights automáticos do seu negócio.",
      },
      metrics,
      prioritaryClients: [],
    };
  }

  // 2. Cenário: Início de histórico
  if (metrics.isInitialHistory) {
    const events: PulseEventItem[] = [];

    if (metrics.current.revenue > 0) {
      events.push({
        id: "initial_revenue",
        type: "positive",
        title: "Empréstimos Concedidos",
        metric: formatBRL(metrics.current.revenue),
        description: "Operações registradas no período atual.",
        badgeText: "Início",
        badgeVariant: "secondary",
      });
    }

    if (metrics.current.received > 0) {
      events.push({
        id: "initial_received",
        type: "positive",
        title: "Recebimentos",
        metric: formatBRL(metrics.current.received),
        description: "Total arrecadado no período.",
        badgeText: "Entradas",
        badgeVariant: "secondary",
      });
    }

    return {
      generatedAt,
      hasSufficientData: true,
      isInitialHistory: true,
      headline: "Seu negócio está ganhando histórico. Continue registrando movimentações.",
      tone: "opportunity",
      events,
      recommendation: {
        text: "Mantenha o registro de todos os pagamentos e despesas para liberar análises comparativas e detecção de tendências.",
      },
      metrics,
      prioritaryClients: metrics.concentration.topClients,
    };
  }

  const diff = metrics.differences;
  const conc = metrics.concentration;

  const isRevenueGrowing = diff.revenuePct >= PULSE_CONFIG.MIN_RELEVANT_PCT_CHANGE;
  const isRevenueDropping = diff.revenuePct <= -PULSE_CONFIG.MIN_RELEVANT_PCT_CHANGE;

  const isReceivedGrowing = diff.receivedPct >= PULSE_CONFIG.MIN_RELEVANT_PCT_CHANGE;
  const isReceivedDropping = diff.receivedPct <= -PULSE_CONFIG.MIN_RELEVANT_PCT_CHANGE;

  const isDefaultGrowing = diff.defaultRatePp >= PULSE_CONFIG.MIN_RELEVANT_PP_DEFAULT_CHANGE;
  const isDefaultDropping = diff.defaultRatePp <= -PULSE_CONFIG.MIN_RELEVANT_PP_DEFAULT_CHANGE;
  const isDefaultSevere = diff.defaultRatePp >= PULSE_CONFIG.SEVERE_DEFAULT_PP_INCREASE;

  const isExpensesGrowingHigh = diff.expensesPct > (diff.revenuePct + 5) && diff.expensesAbsolute > 500;

  // Determinação do Diagnóstico e Tom
  let headline = "Seu negócio apresenta estabilidade operacional no período.";
  let tone: PulseEventType = "positive";

  if (isDefaultSevere || (isDefaultGrowing && conc.hasRelevantConcentration && conc.totalOverdueAmount > 5000)) {
    headline = "Atenção: aumento relevante de inadimplência com concentração de atrasos.";
    tone = "critical";
  } else if ((isRevenueGrowing || isReceivedGrowing) && isDefaultGrowing) {
    headline = "Seu negócio está crescendo, mas a inadimplência merece atenção.";
    tone = "attention";
  } else if (isRevenueGrowing && isReceivedGrowing && !isDefaultGrowing) {
    headline = "Crescimento saudável com expansão de faturamento e recebimentos em dia.";
    tone = "positive";
  } else if (isRevenueDropping && isReceivedDropping) {
    headline = "Ritmo operacional em desaceleração comparado ao período anterior.";
    tone = "attention";
  } else if (isDefaultDropping && isReceivedGrowing) {
    headline = "Excelente recuperação: recebimentos em alta e queda nos atrasos.";
    tone = "opportunity";
  } else if (isExpensesGrowingHigh) {
    headline = "As despesas cresceram em ritmo superior ao faturamento no período.";
    tone = "attention";
  }

  // Lista de Acontecimentos Relevantes (máximo 4)
  const events: PulseEventItem[] = [];

  // 1. Faturamento
  if (Math.abs(diff.revenuePct) >= PULSE_CONFIG.MIN_RELEVANT_PCT_CHANGE || diff.revenueAbsolute !== 0) {
    const isUp = diff.revenueAbsolute >= 0;
    events.push({
      id: "ev_revenue",
      type: isUp ? "positive" : "attention",
      title: isUp ? "Faturamento aumentou" : "Faturamento diminuiu",
      metric: formatPct(diff.revenuePct),
      description: isUp
        ? `Você faturou ${formatBRL(diff.revenueAbsolute)} a mais que no período anterior.`
        : `Faturamento ${formatBRL(Math.abs(diff.revenueAbsolute))} abaixo do período anterior.`,
      badgeText: isUp ? "Crescimento" : "Queda",
      badgeVariant: isUp ? "secondary" : "outline",
    });
  }

  // 2. Recebimentos
  if (Math.abs(diff.receivedPct) >= PULSE_CONFIG.MIN_RELEVANT_PCT_CHANGE || diff.receivedAbsolute !== 0) {
    const isUp = diff.receivedAbsolute >= 0;
    events.push({
      id: "ev_received",
      type: isUp ? "positive" : "attention",
      title: isUp ? "Recebimentos aumentaram" : "Recebimentos caíram",
      metric: formatPct(diff.receivedPct),
      description: isUp
        ? "Seu fluxo de entrada está em evolução positiva."
        : "Entradas reduzidas em relação ao período anterior.",
      badgeText: isUp ? "Entradas +" : "Atenção",
      badgeVariant: isUp ? "secondary" : "outline",
    });
  }

  // 3. Inadimplência
  if (Math.abs(diff.defaultRatePp) >= PULSE_CONFIG.MIN_RELEVANT_PP_DEFAULT_CHANGE || conc.overdueClientsCount > 0) {
    const isUp = diff.defaultRatePp > 0;
    events.push({
      id: "ev_default",
      type: isUp ? "attention" : "positive",
      title: isUp ? "Inadimplência aumentou" : "Inadimplência caiu",
      metric: formatPp(diff.defaultRatePp),
      description: conc.overdueClientsCount > 0
        ? `O volume em atraso envolve ${conc.overdueClientsCount} cliente(s) no momento.`
        : "Nenhum atraso expressivo no período.",
      badgeText: isUp ? "Inadimplência" : "Melhoria",
      badgeVariant: isUp ? "destructive" : "secondary",
    });
  }

  // 4. Concentração de Atrasos
  if (conc.hasRelevantConcentration && conc.topClientsCount > 0) {
    events.push({
      id: "ev_concentration",
      type: "critical",
      title: "Concentração de dívida",
      metric: `${conc.topClientsSharePct}% dos atrasos`,
      description: `${conc.topClientsCount} clientes representam ${conc.topClientsSharePct}% do valor atrasado (${formatBRL(conc.topClientsOverdueTotal)}).`,
      badgeText: "Concentração",
      badgeVariant: "destructive",
    });
  } else if (diff.expensesAbsolute > 0 && Math.abs(diff.expensesPct) >= PULSE_CONFIG.MIN_RELEVANT_PCT_CHANGE) {
    // Caso não haja concentração crítica, mostra despesas se relevante
    const isUp = diff.expensesAbsolute > 0;
    events.push({
      id: "ev_expenses",
      type: isUp ? "attention" : "positive",
      title: isUp ? "Despesas aumentaram" : "Despesas reduziram",
      metric: formatPct(diff.expensesPct),
      description: isUp
        ? `Aumento de ${formatBRL(diff.expensesAbsolute)} nos custos pagos.`
        : `Economia de ${formatBRL(Math.abs(diff.expensesAbsolute))} em despesas.`,
      badgeText: "Despesas",
      badgeVariant: "outline",
    });
  }

  // Limita aos 4 acontecimentos prioritários
  const limitedEvents = events.slice(0, 4);

  // Geração da Recomendação Prática
  let recommendation: PulseRecommendation;

  if (conc.topClients.length > 0 && conc.topClientsOverdueTotal > 0) {
    const topNames = conc.topClients.map((c) => c.clientName);
    const namesFormatted = topNames.length === 1
      ? topNames[0]
      : topNames.slice(0, -1).join(", ") + " e " + topNames[topNames.length - 1];

    recommendation = {
      text: `Priorize a cobrança de ${namesFormatted}. Eles representam ${formatBRL(conc.topClientsOverdueTotal)} (${conc.topClientsSharePct}%) dos valores vencidos no momento.`,
      actionLabel: "Ver clientes prioritários",
      actionType: "view_overdue_clients",
      targetClientNames: topNames,
      totalTargetAmount: conc.topClientsOverdueTotal,
    };
  } else if (isRevenueGrowing && isReceivedGrowing) {
    recommendation = {
      text: "O faturamento e os recebimentos cresceram com saúde financeira. Mantenha os critérios de concessão e acompanhe a pontualidade dos novos contratos.",
      actionLabel: "Ver ranking de clientes",
      actionType: "view_ranking",
    };
  } else if (isReceivedDropping) {
    recommendation = {
      text: "Os recebimentos apresentaram redução no período. Vale acompanhar os próximos vencimentos previstos e manter contato preventivo com clientes.",
      actionLabel: "Ver financeiro",
      actionType: "view_financial",
    };
  } else {
    recommendation = {
      text: "Acompanhe as métricas de carteira e mantenha o ritmo consistente de cobrança preventiva para preservar a rentabilidade.",
    };
  }

  return {
    generatedAt,
    hasSufficientData: true,
    isInitialHistory: false,
    headline,
    tone,
    events: limitedEvents,
    recommendation,
    metrics,
    prioritaryClients: conc.topClients,
  };
}
