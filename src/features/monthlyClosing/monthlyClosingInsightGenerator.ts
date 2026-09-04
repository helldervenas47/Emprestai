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
  isClosedMonth?: boolean;
  isCurrentMonth?: boolean;
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
    isClosedMonth = false,
    isCurrentMonth = false,
  } = inputs;

  // 1. Cenário: Sem dados suficientes
  if (!hasSufficientData) {
    const noDataHeadline = isCurrentMonth
      ? `${monthLabel} em andamento sem movimentações registradas até o momento.`
      : `Ainda não há dados suficientes para consolidar o fechamento de ${monthLabel}.`;

    return {
      headline: noDataHeadline,
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
    const achievement = typeof g.achievementPct === "number" && isFinite(g.achievementPct) ? g.achievementPct : 0;
    if (g.isInverse) {
      positiveHighlights.push({
        id: `goal_reached_${g.goalType}`,
        type: "positive",
        title: `${g.label} dentro da meta`,
        description: `Resultado de ${g.formattedActual} está dentro do limite estabelecido de ${g.formattedTarget}.`,
        badgeText: "Meta atingida",
      });
    } else {
      const diffPct = achievement - 100;
      const diffText = diffPct > 0 ? ` (+${diffPct.toFixed(1).replace(".", ",")}% acima)` : "";
      positiveHighlights.push({
        id: `goal_reached_${g.goalType}`,
        type: "positive",
        title: `${g.label} atingida`,
        description: `Atingiu ${g.formattedActual} vs. meta de ${g.formattedTarget}${diffText}.`,
        badgeText: `${achievement.toFixed(0)}% da meta`,
      });
    }
  });

  missedGoals.forEach((g) => {
    const achievement = typeof g.achievementPct === "number" && isFinite(g.achievementPct) ? g.achievementPct : 0;
    const actual = typeof g.actualValue === "number" && isFinite(g.actualValue) ? g.actualValue : 0;
    const target = typeof g.targetValue === "number" && isFinite(g.targetValue) ? g.targetValue : 0;
    if (g.isInverse) {
      const ppAbove = (actual - target).toFixed(1).replace(".", ",");
      attentionPoints.push({
        id: `goal_missed_${g.goalType}`,
        type: "attention",
        title: `${g.label} acima do limite`,
        description: isCurrentMonth
          ? `Posição atual em ${g.formattedActual}, ficando ${ppAbove} p.p. acima do limite de ${g.formattedTarget}.`
          : `Terminou em ${g.formattedActual}, ficando ${ppAbove} p.p. acima do limite de ${g.formattedTarget}.`,
        badgeText: "Meta não atingida",
      });
    } else {
      attentionPoints.push({
        id: `goal_missed_${g.goalType}`,
        type: "attention",
        title: `${g.label} abaixo da meta`,
        description: isCurrentMonth
          ? `Acumulado de ${g.formattedActual} vs. meta de ${g.formattedTarget}. Faltam ${g.formattedDiff.replace("-", "")} para atingir o objetivo no mês.`
          : `Realizado de ${g.formattedActual} ficou abaixo do planejado (${g.formattedTarget}). Faltaram ${g.formattedDiff.replace("-", "")}.`,
        badgeText: `${achievement.toFixed(0)}% da meta`,
      });
    }
  });

  // ==========================================
  // B. ANÁLISE COMPARATIVA COM MÊS ANTERIOR
  // ==========================================
  // Faturamento / Volume
  if ((comparison.revenue?.pctDiff ?? 0) >= 8 && (comparison.revenue?.current ?? 0) > 0) {
    positiveHighlights.push({
      id: "revenue_growth",
      type: "positive",
      title: isCurrentMonth ? "Empréstimos em Ritmo de Alta" : "Crescimento de Empréstimos",
      description: isCurrentMonth
        ? `Volume emprestado já soma ${formatBRL(financial.revenue ?? 0)}, ritmo ${formatPct(comparison.revenue.pctDiff)} acima de ${previousMonthLabel}.`
        : `Volume emprestado cresceu ${formatPct(comparison.revenue.pctDiff)} em relação a ${previousMonthLabel} (${formatBRL(financial.revenue ?? 0)} vs. ${formatBRL(comparison.revenue.previous ?? 0)}).`,
      badgeText: formatPct(comparison.revenue.pctDiff),
    });
  } else if (!isCurrentMonth && (comparison.revenue?.pctDiff ?? 0) <= -10 && (comparison.revenue?.previous ?? 0) > 0) {
    attentionPoints.push({
      id: "revenue_drop",
      type: "attention",
      title: "Queda no Volume de Empréstimos",
      description: `Concessão de novos empréstimos caiu ${formatPct(comparison.revenue.pctDiff)} em relação a ${previousMonthLabel}.`,
      badgeText: formatPct(comparison.revenue.pctDiff),
    });
  }

  // Recebimentos
  if ((comparison.received?.pctDiff ?? 0) >= 8 && (comparison.received?.current ?? 0) > 0) {
    positiveHighlights.push({
      id: "received_growth",
      type: "positive",
      title: "Recebimentos em Alta",
      description: isCurrentMonth
        ? `Total arrecadado já soma ${formatBRL(financial.received ?? 0)} no mês em andamento (${formatPct(comparison.received.pctDiff)} vs. ${previousMonthLabel}).`
        : `Total arrecadado aumentou ${formatPct(comparison.received.pctDiff)} frente ao mês anterior (${formatBRL(financial.received ?? 0)} vs. ${formatBRL(comparison.received.previous ?? 0)}).`,
      badgeText: formatPct(comparison.received.pctDiff),
    });
  } else if (!isCurrentMonth && (comparison.received?.pctDiff ?? 0) <= -10 && (comparison.received?.previous ?? 0) > 0) {
    attentionPoints.push({
      id: "received_drop",
      type: "attention",
      title: "Queda nos Recebimentos",
      description: `Entradas financeiras reduziram ${formatPct(comparison.received.pctDiff)} em comparação com ${previousMonthLabel}.`,
      badgeText: formatPct(comparison.received.pctDiff),
    });
  }

  // Despesas
  if ((comparison.expenses?.pctDiff ?? 0) <= -5 && (comparison.expenses?.previous ?? 0) > 0) {
    positiveHighlights.push({
      id: "expenses_reduction",
      type: "positive",
      title: "Controle de Despesas",
      description: `Despesas da empresa recuaram ${formatPct(comparison.expenses.pctDiff)} em relação a ${previousMonthLabel} (${formatBRL(financial.expenses ?? 0)} vs. ${formatBRL(comparison.expenses.previous ?? 0)}).`,
      badgeText: formatPct(comparison.expenses.pctDiff),
    });
  } else if ((comparison.expenses?.pctDiff ?? 0) >= 15 && (comparison.expenses?.current ?? 0) > 500) {
    attentionPoints.push({
      id: "expenses_increase",
      type: "attention",
      title: "Aumento de Despesas",
      description: `Despesas corporativas subiram ${formatPct(comparison.expenses.pctDiff)} em relação ao mês anterior.`,
      badgeText: formatPct(comparison.expenses.pctDiff),
    });
  }

  // Inadimplência
  const defaultRatePp = comparison.defaultRate?.ppDiff;
  const currentDefaultRate = typeof financial.defaultRate === "number" && isFinite(financial.defaultRate) ? financial.defaultRate : 0;
  const previousDefaultRate = typeof comparison.defaultRate?.previous === "number" && isFinite(comparison.defaultRate.previous) ? comparison.defaultRate.previous : 0;

  if (defaultRatePp !== undefined && isFinite(defaultRatePp)) {
    if (defaultRatePp <= -1.0 && previousDefaultRate > 0) {
      positiveHighlights.push({
        id: "default_rate_reduction",
        type: "positive",
        title: "Queda na Inadimplência",
        description: `Taxa de inadimplência reduziu ${formatPp(defaultRatePp)} frente ao mês anterior (${currentDefaultRate.toFixed(1).replace(".", ",")}% vs. ${previousDefaultRate.toFixed(1).replace(".", ",")}%).`,
        badgeText: formatPp(defaultRatePp),
      });
    } else if (defaultRatePp >= 1.5 && currentDefaultRate > 5) {
      attentionPoints.push({
        id: "default_rate_increase",
        type: "attention",
        title: isCurrentMonth ? "Inadimplência em Atenção" : "Inadimplência em Elevação",
        description: isCurrentMonth
          ? `Índice de atraso atual está em ${currentDefaultRate.toFixed(1).replace(".", ",")}% com ${formatBRL(financial.overdueAmount ?? 0)} pendentes.`
          : `Índice de atraso subiu ${formatPp(defaultRatePp)}, fechando o mês em ${currentDefaultRate.toFixed(1).replace(".", ",")}% (${formatBRL(financial.overdueAmount ?? 0)} em aberto).`,
        badgeText: formatPp(defaultRatePp),
      });
    }
  }

  // Novos Clientes
  if ((financial.newClientsCount ?? 0) >= 3) {
    positiveHighlights.push({
      id: "new_clients_highlight",
      type: "positive",
      title: "Expansão da Carteira",
      description: isCurrentMonth
        ? `${financial.newClientsCount} novos clientes já foram cadastrados neste mês.`
        : `${financial.newClientsCount} novos clientes foram cadastrados ao longo do mês.`,
      badgeText: `+${financial.newClientsCount} clientes`,
    });
  }

  // ==========================================
  // C. DIAGNÓSTICO EXECUTIVO & NARRATIVA
  // ==========================================
  let headline = "";
  let narrative = "";

  const isDefaultHigh = currentDefaultRate > 8;
  const isRevenueUp = (comparison.revenue?.pctDiff ?? 0) >= 0;
  const isReceivedUp = (comparison.received?.pctDiff ?? 0) >= 0;
  const overallGoalsPct = typeof goalsSummary.overallAchievementPct === "number" && isFinite(goalsSummary.overallAchievementPct) ? goalsSummary.overallAchievementPct : 0;
  const hasGoodGoals = goalsSummary.hasGoals && overallGoalsPct >= 70;

  if (isCurrentMonth) {
    // Narrativas para o MÊS VIGENTE (em andamento)
    if (hasGoodGoals && !isDefaultHigh) {
      headline = `${monthLabel} segue em andamento com excelente ritmo operacional e metas bem encaminhadas.`;
      narrative = `O mês em andamento acumula ${formatBRL(financial.revenue ?? 0)} em novos empréstimos e arrecadação total de ${formatBRL(financial.received ?? 0)}. O cumprimento de ${overallGoalsPct.toFixed(0)}% das metas planejadas e a inadimplência sob controle em ${currentDefaultRate.toFixed(1).replace(".", ",")}% mantêm a operação sólida.`;
    } else if (isDefaultHigh) {
      headline = `${monthLabel} em andamento com alerta para o índice de inadimplência.`;
      narrative = `Com ${formatBRL(financial.revenue ?? 0)} movimentados até o momento, a taxa de inadimplência registra ${currentDefaultRate.toFixed(1).replace(".", ",")}% (${formatBRL(financial.overdueAmount ?? 0)} em atraso). A prioridade deve ser a cobrança ativa e prevenção de novos atrasos.`;
    } else {
      headline = `${monthLabel} segue em andamento com capital ativo em ${formatBRL(financial.activeCapital ?? 0)}.`;
      narrative = `No acumulado do mês em andamento até o momento, as entradas somam ${formatBRL(financial.received ?? 0)} em recebimentos e resultado operacional de ${formatBRL(financial.result ?? 0)}. O acompanhamento contínuo dos vencimentos e metas manterá o ritmo saudável da carteira.`;
    }
  } else {
    // Narrativas para MÊS FECHADO (encerrado)
    if (hasGoodGoals && !isDefaultHigh) {
      headline = `${monthLabel} apresentou excelente desempenho operacional e metas superadas.`;
      narrative = `O período encerrou com faturamento de ${formatBRL(financial.revenue ?? 0)} e arrecadação total de ${formatBRL(financial.received ?? 0)}. O cumprimento de ${overallGoalsPct.toFixed(0)}% das metas planejadas e a inadimplência controlada em ${currentDefaultRate.toFixed(1).replace(".", ",")}% reforçam a solidez da operação.`;
    } else if (isDefaultHigh) {
      headline = `Crescimento financeiro registrado em ${monthLabel}, com alerta na inadimplência.`;
      narrative = `Apesar do volume de ${formatBRL(financial.revenue ?? 0)} movimentado, a taxa de inadimplência encerrou o mês em ${currentDefaultRate.toFixed(1).replace(".", ",")}% com ${formatBRL(financial.overdueAmount ?? 0)} em atraso. A prioridade imediata deve ser a cobrança ativa dos contratos vencidos.`;
    } else if (!isReceivedUp && !isRevenueUp && (comparison.revenue?.previous ?? 0) > 0) {
      headline = `${monthLabel} encerrou com desaceleração nas operações e recebimentos.`;
      narrative = `Houve redução no volume de empréstimos concedidos e nos recebimentos totais em comparação a ${previousMonthLabel}. Recomenda-se prospecção de novos tomadores e revisão das metas comerciais.`;
    } else {
      headline = `Balanço equilibrado em ${monthLabel} com capital ativo em ${formatBRL(financial.activeCapital ?? 0)}.`;
      narrative = `O mês consolidou ${formatBRL(financial.received ?? 0)} em recebimentos e resultado operacional de ${formatBRL(financial.result ?? 0)}. O acompanhamento contínuo dos vencimentos manterá a rentabilidade da carteira.`;
    }
  }

  // ==========================================
  // D. RECOMENDAÇÃO ACIONÁVEL
  // ==========================================
  let recommendationTitle = isCurrentMonth ? "Mantenha o acompanhamento das metas em aberto" : "Mantenha o acompanhamento das metas";
  let recommendationText = isCurrentMonth
    ? `Monitore a evolução diária dos recebimentos e a pontualidade dos vencimentos para garantir o atingimento de todas as metas em ${monthLabel}.`
    : "Defina as metas do próximo mês com base no histórico recente e monitore a evolução diária dos recebimentos.";
  let directAction: MonthlyClosingExecutiveAnalysis["recommendation"]["action"] = {
    label: "Acompanhar metas",
    targetTab: "metas",
    description: "Ver painel de metas",
  };

  if (financial.overdueAmount > 0 && (isDefaultHigh || financial.overdueLoansCount >= 2)) {
    recommendationTitle = isCurrentMonth
      ? "Acelere a recuperação dos contratos em atraso"
      : "Priorize a recuperação dos contratos em atraso";
    recommendationText = isCurrentMonth
      ? `O mês em andamento registra ${formatBRL(financial.overdueAmount)} pendentes em ${financial.overdueLoansCount} contrato(s). Ações de cobrança e renegociação imediata ajudam a recompor o caixa antes do fechamento.`
      : `O mês terminou com ${formatBRL(financial.overdueAmount)} pendentes em ${financial.overdueLoansCount} contrato(s). Uma ação de cobrança direcionada e renegociação preventiva aumentará o caixa imediatamente.`;
    directAction = {
      label: "Ver clientes inadimplentes",
      targetTab: "clientes",
      description: "Abrir lista de clientes para cobrança",
    };
  } else if (missedGoals.some((g) => g.goalType === "loan_volume" || g.goalType === "profit")) {
    recommendationTitle = "Impulsione novos empréstimos com clientes qualificados";
    recommendationText = isCurrentMonth
      ? `O faturamento de ${monthLabel} está em andamento. Aproveite para oferecer novas operações aos clientes com bom histórico de pontualidade e score positivo.`
      : `O faturamento de ${monthLabel} ficou abaixo do planejado. Ofereça novas operações aos clientes com bom histórico de pontualidade e score positivo.`;
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
    recommendationTitle = isCurrentMonth
      ? `Estabeleça metas para ${monthLabel}`
      : "Estabeleça metas claras para o próximo mês";
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
