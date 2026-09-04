import type { GoalType } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import type { GoalStatus } from "./types";

export const MONTHLY_CLOSING_CONFIG = {
  // Limiares para metas onde MAIOR é melhor
  REGULAR_GOAL: {
    REACHED_THRESHOLD_PCT: 100, // >= 100%
    CLOSE_THRESHOLD_PCT: 80,    // 80% a 99.9%
  },
  // Limiares para metas onde MENOR é melhor (inversas, ex: inadimplência, renegociações)
  INVERSE_GOAL: {
    REACHED_MAX_MULTIPLE: 1.0,  // <= 100% da meta
    CLOSE_MAX_MULTIPLE: 1.2,    // até 20% acima do limite (ex: meta 5% -> até 6%)
  },
  // Variação mínima percentual para ser considerada relevante na comparação de meses
  MIN_RELEVANT_PCT_DIFF: 5,
  // Variação mínima em p.p. para ser considerada relevante na taxa de inadimplência
  MIN_RELEVANT_PP_DEFAULT_DIFF: 0.5,
};

export const GOAL_TYPE_METADATA: Record<
  GoalType,
  {
    label: string;
    unit: "%" | "R$" | "qtd";
    isInverse: boolean;
    description: string;
  }
> = {
  interest_rate: {
    label: "Taxa de Juros Mensal",
    unit: "%",
    isInverse: false,
    description: "Taxa média ponderada de juros aplicada nos contratos do mês.",
  },
  profit: {
    label: "Faturamento do Período",
    unit: "%",
    isInverse: false,
    description: "Percentual do lucro previsto que foi efetivamente recebido.",
  },
  loan_volume: {
    label: "Valor Emprestado",
    unit: "R$",
    isInverse: false,
    description: "Soma do principal de novos empréstimos no mês.",
  },
  new_loans_count: {
    label: "Novos Empréstimos",
    unit: "qtd",
    isInverse: false,
    description: "Quantidade de novos contratos celebrados no mês.",
  },
  received_total: {
    label: "Recebimentos no Mês",
    unit: "R$",
    isInverse: false,
    description: "Soma de todas as entradas financeiras no mês.",
  },
  interest_received: {
    label: "Juros Recebidos",
    unit: "R$",
    isInverse: false,
    description: "Montante de juros efetivamente arrecadado.",
  },
  active_capital: {
    label: "Capital Ativo",
    unit: "R$",
    isInverse: false,
    description: "Total ainda a receber na carteira de contratos ativos.",
  },
  net_profit: {
    label: "Lucro Líquido",
    unit: "R$",
    isInverse: false,
    description: "Juros recebidos deduzidos das despesas da empresa.",
  },
  max_default_rate: {
    label: "Taxa de Inadimplência",
    unit: "%",
    isInverse: true,
    description: "Limite máximo tolerado de atraso sobre a carteira do mês.",
  },
  new_clients_count: {
    label: "Novos Clientes",
    unit: "qtd",
    isInverse: false,
    description: "Número de novos clientes cadastrados no mês.",
  },
  renegotiation_rate: {
    label: "Contratos Renegociados",
    unit: "qtd",
    isInverse: true,
    description: "Limite máximo de contratos repactuados no mês.",
  },
  daily_received_avg: {
    label: "Receita Média Diária",
    unit: "R$",
    isInverse: false,
    description: "Média diária de recebimentos ao longo do mês.",
  },
  monthly_variation: {
    label: "Variação Mensal do Patrimônio",
    unit: "%",
    isInverse: false,
    description: "Crescimento percentual do patrimônio em relação ao mês anterior.",
  },
};

export function classifyGoalStatus(
  target: number,
  actual: number,
  isInverse: boolean
): { status: GoalStatus; achievementPct: number } {
  if (target <= 0) {
    if (actual > 0) return { status: "reached", achievementPct: 100 };
    return { status: "reached", achievementPct: 100 };
  }

  if (isInverse) {
    // Para metas menores: se o realizado for <= meta, atingiu 100% ou mais
    // Se a meta é 5% e o realizado é 4%, atingiu 100% (dentro do limite)
    // Se o realizado é 5.5% (1.1x da meta), está próxima (até 1.2x)
    // Se o realizado é 7.2% (> 1.2x), não atingiu
    const ratio = actual / target;
    if (ratio <= MONTHLY_CLOSING_CONFIG.INVERSE_GOAL.REACHED_MAX_MULTIPLE) {
      const achievementPct = actual === 0 ? 100 : Math.min(200, (target / actual) * 100);
      return { status: "reached", achievementPct };
    }
    if (ratio <= MONTHLY_CLOSING_CONFIG.INVERSE_GOAL.CLOSE_MAX_MULTIPLE) {
      const achievementPct = (target / actual) * 100;
      return { status: "close", achievementPct };
    }
    const achievementPct = (target / actual) * 100;
    return { status: "missed", achievementPct };
  }

  // Maior é melhor
  const achievementPct = (actual / target) * 100;
  if (achievementPct >= MONTHLY_CLOSING_CONFIG.REGULAR_GOAL.REACHED_THRESHOLD_PCT) {
    return { status: "reached", achievementPct };
  }
  if (achievementPct >= MONTHLY_CLOSING_CONFIG.REGULAR_GOAL.CLOSE_THRESHOLD_PCT) {
    return { status: "close", achievementPct };
  }
  return { status: "missed", achievementPct };
}

export function formatGoalValue(value: number, unit: "%" | "R$" | "qtd"): string {
  if (unit === "R$") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }
  if (unit === "%") {
    return `${value.toFixed(1).replace(".", ",")}%`;
  }
  return String(Math.round(value));
}

export function formatDiffValue(diff: number, unit: "%" | "R$" | "qtd", isInverse: boolean): string {
  const sign = diff > 0 ? "+" : "";
  if (unit === "R$") {
    const formatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(diff));
    return `${diff >= 0 ? "+" : "-"}${formatted}`;
  }
  if (unit === "%") {
    const formatted = Math.abs(diff).toFixed(1).replace(".", ",");
    return `${sign}${formatted} p.p.`;
  }
  return `${sign}${Math.round(diff)}`;
}
