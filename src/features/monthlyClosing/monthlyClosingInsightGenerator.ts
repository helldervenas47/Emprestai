import type { Loan, Client } from "@/types/loan";
import { formatBRL } from "@/features/creditCards/lib/creditLimit";
import type {
  MonthlyClosingFinancialSummary,
  MonthlyClosingComparison,
  MonthlyClosingGoalItem,
  MonthlyClosingGoalSummary,
  MonthlyClosingHighlight,
  MonthlyClosingExecutiveAnalysis,
} from "./types";

interface InsightGeneratorInputs {
  monthLabel: string;
  previousMonthLabel: string;
  financial: MonthlyClosingFinancialSummary;
  comparison: MonthlyClosingComparison;
  goals: MonthlyClosingGoalItem[];
  goalsSummary: MonthlyClosingGoalSummary;
  hasSufficientData: boolean;
  loans: Loan[];
  clients: Client[];
}

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

export function generateMonthlyClosingInsights(inputs: InsightGeneratorInputs): MonthlyClosingExecutiveAnalysis {
  const {
    monthLabel,
    previousMonthLabel,
    financial,
    comparison,
    goals,
    goalsSummary,
    hasSufficientData,
  } = inputs;

  // 1. Cenário: Sem dados suficientes
  if (!hasSufficientData) {
    return {
      headline: "Ainda não há dados suficientes para consolidar o fechamento.",
      narrative: `Neste período de ${monthLabel}, não foram identificadas movimentações financeiras ou contratos registrados no sistema.`,
      positiveHighlights: [],
      attentionPoints: [
        {
          id: "no_data",
          type: "attention",
          title: "Sem movimentações no mês",
          description: "Nenhum empréstimo, recebimento ou despesa foi registrado para este período.",
          badgeText: "Sem dados",
        },
      ],
      recommendation: {
        title: "Cadastre suas primeiras operações",
        text: "Comece registrando novos empréstimos e definindo as metas do seu negócio para liberar a análise automática de fechamento.",
        action: {
          label: "Definir metas",
          targetTab: "metas",
          description: "Configurar metas para o período",
        },
      },
    };
  }

  const positiveHighlights: MonthlyClosingHighlight[] = [];
  const attentionPoints: MonthlyClosingHighlight[] = [];

  // ==========================================
  // A. ANÁLISE DAS METAS
  // ==========================================
  const reachedGoals = goals.filter((g) => g.status === "reached");
  const missedGoals = goals.filter((g) => g.status === "missed");

  reachedGoals.forEach((g) => {
    if (g.isInverse) {
      positiveHighlights.push({
        id: `goal_reached_${g.goalType}`,
        type: "positive",
        title: `${g.label} dentro da meta`,
        description: `Resultado de ${g.formattedActual} ficou dentro do limite estabelecido de ${g.formattedTarget}.`,
        badgeText: "Meta atingida",
      });
    } else {
      const diffPct = g.achievementPct - 100;
      const diffText = diffPct > 0 ? ` (+${diffPct.toFixed(1).replace(".", ",")}% acima)` : "";
      positiveHighlights.push({
        id: `goal_reached_${g.goalType}`,
        type: "positive",
        title: `${g.label} atingida`,
        description: `Atingiu ${g.formattedActual} vs. meta de ${g.formattedTarget}${diffText}.`,
        badgeText: `${g.achievementPct.toFixed(0)}% da meta`,
      });
    }
  });

  missedGoals.forEach((g) => {
    if (g.isInverse) {
      const ppAbove = (g.actualValue - g.targetValue).toFixed(1).replace(".", ",");
      attentionPoints.push({
        id: `goal_missed_${g.goalType}`,
        type: "attention",
        title: `${g.label} acima do limite`,
        description: `Terminou em ${g.formattedActual}, ficando ${ppAbove} p.p. acima do limite de ${g.formattedTarget}.`,
        badgeText: "Meta não atingida",
      });
    } else {
      attentionPoints.push({
        id: `goal_missed_${g.goalType}`,
        type: "attention",
        title: `${g.label} abaixo da meta`,
        description: `Realizado de ${g.formattedActual} ficou abaixo do planejado (${g.formattedTarget}). Faltaram ${g.formattedDiff.replace("-", "")}.`,
        badgeText: `${g.achievementPct.toFixed(0)}% da meta`,
      });
    }
  });

  // ==========================================
  // B. ANÁLISE COMPARATIVA COM MÊS ANTERIOR
  // ==========================================
  // Faturamento / Volume
  if (comparison.revenue.pctDiff >= 8 && comparison.revenue.current > 0) {
    positiveHighlights.push({
      id: "revenue_growth",
      type: "positive",
      title: "Crescimento de Empréstimos",
      description: `Volume emprestado cresceu ${formatPct(comparison.revenue.pctDiff)} em relação a ${previousMonthLabel} (${formatBRL(financial.revenue)} vs. ${formatBRL(comparison.revenue.previous)}).`,
      badgeText: formatPct(comparison.revenue.pctDiff),
    });
  } else if (comparison.revenue.pctDiff <= -10 && comparison.revenue.previous > 0) {
    attentionPoints.push({
      id: "revenue_drop",
      type: "attention",
      title: "Queda no Volume de Empréstimos",
      description: `Concessão de novos empréstimos caiu ${formatPct(comparison.revenue.pctDiff)} em relação a ${previousMonthLabel}.`,
      badgeText: formatPct(comparison.revenue.pctDiff),
    });
  }

  // Recebimentos
  if (comparison.received.pctDiff >= 8 && comparison.received.current > 0) {
    positiveHighlights.push({
      id: "received_growth",
      type: "positive",
      title: "Recebimentos em Alta",
      description: `Total arrecadado aumentou ${formatPct(comparison.received.pctDiff)} frente ao mês anterior (${formatBRL(financial.received)} vs. ${formatBRL(comparison.received.previous)}).`,
      badgeText: formatPct(comparison.received.pctDiff),
    });
  } else if (comparison.received.pctDiff <= -10 && comparison.received.previous > 0) {
    attentionPoints.push({
      id: "received_drop",
      type: "attention",
      title: "Queda nos Recebimentos",
      description: `Entradas financeiras reduziram ${formatPct(comparison.received.pctDiff)} em comparação com ${previousMonthLabel}.`,
      badgeText: formatPct(comparison.received.pctDiff),
    });
  }

  // Despesas
  if (comparison.expenses.pctDiff <= -5 && comparison.expenses.previous > 0) {
    positiveHighlights.push({
      id: "expenses_reduction",
      type: "positive",
      title: "Controle de Despesas",
      description: `Despesas da empresa recuaram ${formatPct(comparison.expenses.pctDiff)} em relação a ${previousMonthLabel} (${formatBRL(financial.expenses)} vs. ${formatBRL(comparison.expenses.previous)}).`,
      badgeText: formatPct(comparison.expenses.pctDiff),
    });
  } else if (comparison.expenses.pctDiff >= 15 && comparison.expenses.current > 500) {
    attentionPoints.push({
      id: "expenses_increase",
      type: "attention",
      title: "Aumento de Despesas",
      description: `Despesas corporativas subiram ${formatPct(comparison.expenses.pctDiff)} em relação ao mês anterior.`,
      badgeText: formatPct(comparison.expenses.pctDiff),
    });
  }

  // Inadimplência
  if (comparison.defaultRate.ppDiff !== undefined) {
    if (comparison.defaultRate.ppDiff <= -1.0 && comparison.defaultRate.previous > 0) {
      positiveHighlights.push({
        id: "default_rate_reduction",
        type: "positive",
        title: "Queda na Inadimplência",
        description: `Taxa de inadimplência reduziu ${formatPp(comparison.defaultRate.ppDiff)} frente ao mês anterior (${financial.defaultRate.toFixed(1).replace(".", ",")}% vs. ${comparison.defaultRate.previous.toFixed(1).replace(".", ",")}%).`,
        badgeText: formatPp(comparison.defaultRate.ppDiff),
      });
    } else if (comparison.defaultRate.ppDiff >= 1.5 && financial.defaultRate > 5) {
      attentionPoints.push({
        id: "default_rate_increase",
        type: "attention",
        title: "Inadimplência em Elevação",
        description: `Índice de atraso subiu ${formatPp(comparison.defaultRate.ppDiff)}, fechando o mês em ${financial.defaultRate.toFixed(1).replace(".", ",")}% (${formatBRL(financial.overdueAmount)} em aberto).`,
        badgeText: formatPp(comparison.defaultRate.ppDiff),
      });
    }
  }

  // Novos Clientes
  if (financial.newClientsCount >= 3) {
    positiveHighlights.push({
      id: "new_clients_highlight",
      type: "positive",
      title: "Expansão da Carteira",
      description: `${financial.newClientsCount} novos clientes foram cadastrados ao longo do mês.`,
      badgeText: `+${financial.newClientsCount} clientes`,
    });
  }

  // ==========================================
  // C. DIAGNÓSTICO EXECUTIVO & NARRATIVA
  // ==========================================
  let headline = "";
  let narrative = "";

  const isDefaultHigh = financial.defaultRate > 8;
  const isRevenueUp = comparison.revenue.pctDiff >= 0;
  const isReceivedUp = comparison.received.pctDiff >= 0;
  const hasGoodGoals = goalsSummary.hasGoals && goalsSummary.overallAchievementPct >= 70;

  if (hasGoodGoals && !isDefaultHigh) {
    headline = `${monthLabel} apresentou excelente desempenho operacional e metas superadas.`;
    narrative = `O período encerrou com faturamento de ${formatBRL(financial.revenue)} e arrecadação total de ${formatBRL(financial.received)}. O cumprimento de ${goalsSummary.overallAchievementPct.toFixed(0)}% das metas planejadas e a inadimplência controlada em ${financial.defaultRate.toFixed(1).replace(".", ",")}% reforçam a solidez da operação.`;
  } else if (isDefaultHigh) {
    headline = `Crescimento financeiro registrado em ${monthLabel}, com alerta na inadimplência.`;
    narrative = `Apesar do volume de ${formatBRL(financial.revenue)} movimentado, a taxa de inadimplência encerrou o mês em ${financial.defaultRate.toFixed(1).replace(".", ",")}% com ${formatBRL(financial.overdueAmount)} em atraso. A prioridade imediata deve ser a cobrança ativa dos contratos vencidos.`;
  } else if (!isReceivedUp && !isRevenueUp && comparison.revenue.previous > 0) {
    headline = `${monthLabel} encerrou com desaceleração nas operações e recebimentos.`;
    narrative = `Houve redução no volume de empréstimos concedidos e nos recebimentos totais em comparação a ${previousMonthLabel}. Recomenda-se prospecção de novos tomadores e revisão das metas comerciais.`;
  } else {
    headline = `Balanço equilibrado em ${monthLabel} com capital ativo em ${formatBRL(financial.activeCapital)}.`;
    narrative = `O mês consolidou ${formatBRL(financial.received)} em recebimentos e resultado operacional de ${formatBRL(financial.result)}. O acompanhamento contínuo dos vencimentos manterá a rentabilidade da carteira.`;
  }

  // ==========================================
  // D. RECOMENDAÇÃO ACIONÁVEL PARA O PRÓXIMO MÊS
  // ==========================================
  let recommendationTitle = "Mantenha o acompanhamento das metas";
  let recommendationText = "Defina as metas do próximo mês com base no histórico recente e monitore a evolução diária dos recebimentos.";
  let directAction: MonthlyClosingExecutiveAnalysis["recommendation"]["action"] = {
    label: "Acompanhar metas",
    targetTab: "metas",
    description: "Ver painel de metas",
  };

  if (financial.overdueAmount > 0 && (isDefaultHigh || financial.overdueLoansCount >= 2)) {
    recommendationTitle = "Priorize a recuperação dos contratos em atraso";
    recommendationText = `O mês terminou com ${formatBRL(financial.overdueAmount)} pendentes em ${financial.overdueLoansCount} contrato(s). Uma ação de cobrança direcionada e renegociação preventiva aumentará o caixa imediatamente.`;
    directAction = {
      label: "Ver clientes inadimplentes",
      targetTab: "clientes",
      description: "Abrir lista de clientes para cobrança",
    };
  } else if (missedGoals.some((g) => g.goalType === "loan_volume" || g.goalType === "profit")) {
    recommendationTitle = "Impulsione novos empréstimos com clientes qualificados";
    recommendationText = `O faturamento de ${monthLabel} ficou abaixo do planejado. Ofereça novas operações aos clientes com bom histórico de pontualidade e score positivo.`;
    directAction = {
      label: "Ver empréstimos",
      targetTab: "emprestimos",
      description: "Acessar módulo de empréstimos",
    };
  } else if (comparison.expenses.pctDiff > 15) {
    recommendationTitle = "Revise os custos e despesas operacionais";
    recommendationText = `As despesas subiram ${formatPct(comparison.expenses.pctDiff)} no período. Analise os lançamentos do mês para identificar oportunidades de redução de custo.`;
    directAction = {
      label: "Ver despesas",
      targetTab: "despesas",
      description: "Acessar gestão de despesas",
    };
  } else if (!goalsSummary.hasGoals) {
    recommendationTitle = "Estabeleça metas claras para o próximo mês";
    recommendationText = "Negócios que operam com metas atingem em média 25% mais resultados. Cadastre seus objetivos de faturamento e recebimentos.";
    directAction = {
      label: "Definir metas",
      targetTab: "metas",
      description: "Configurar metas",
    };
  }

  return {
    headline,
    narrative,
    positiveHighlights,
    attentionPoints,
    recommendation: {
      title: recommendationTitle,
      text: recommendationText,
      action: directAction,
    },
  };
}
