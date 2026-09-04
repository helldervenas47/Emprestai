/**
 * Configurações e parâmetros do Motor de Score de Risco Comportamental (0 a 100)
 */

export interface ScoreBandConfig {
  min: number;
  max: number;
  label: "Excelente" | "Bom" | "Regular" | "Risco elevado" | "Alto risco";
  color: string;
  bgColor: string;
  badgeClassName: string;
  level: "baixo" | "moderado" | "alto" | "critico";
}

export const SCORE_BANDS: ScoreBandConfig[] = [
  {
    min: 85,
    max: 100,
    label: "Excelente",
    color: "text-success",
    bgColor: "bg-success/15",
    badgeClassName: "bg-success/10 text-success border-success/20",
    level: "baixo",
  },
  {
    min: 70,
    max: 84,
    label: "Bom",
    color: "text-primary",
    bgColor: "bg-primary/15",
    badgeClassName: "bg-primary/10 text-primary border-primary/20",
    level: "baixo",
  },
  {
    min: 55,
    max: 69,
    label: "Regular",
    color: "text-warning",
    bgColor: "bg-warning/15",
    badgeClassName: "bg-warning/10 text-warning border-warning/20",
    level: "moderado",
  },
  {
    min: 40,
    max: 54,
    label: "Risco elevado",
    color: "text-orange-500",
    bgColor: "bg-orange-500/15",
    badgeClassName: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    level: "alto",
  },
  {
    min: 0,
    max: 39,
    label: "Alto risco",
    color: "text-destructive",
    bgColor: "bg-destructive/15",
    badgeClassName: "bg-destructive/15 text-destructive border-destructive/30",
    level: "critico",
  },
];

export const RISK_SCORE_CONFIG = {
  // Score padrão para usuários sem histórico financeiro (faixa neutra)
  DEFAULT_NEUTRAL_SCORE: 60,

  // Pesos dos 5 pilares do score
  WEIGHTS: {
    CURRENT_OBLIGATIONS: 0.35, // 35% - Situação atual das obrigações
    HISTORICAL_DELAYS: 0.25,   // 25% - Quantidade e duração dos atrasos
    RECURRENCE: 0.20,          // 20% - Recorrência e reincidência
    RECENT_BEHAVIOR: 0.10,     // 10% - Comportamento dos últimos 6 a 12 meses
    RELATIONSHIP_BONUS: 0.10,  // 10% - Histórico positivo e tempo de relacionamento
  },

  // Decaimento temporal (pesos por idade do evento)
  TIME_WEIGHTS: {
    LAST_3_MONTHS: 1.0,    // 0 a 90 dias
    MONTHS_4_TO_6: 0.75,   // 91 a 180 dias
    MONTHS_7_TO_12: 0.50,  // 181 a 365 dias
    MONTHS_13_TO_24: 0.25, // 366 a 730 dias
    OLDER_THAN_24: 0.10,   // > 730 dias
  },

  // Penalização por faixas de dias de atraso histórico
  DELAY_PENALTIES: {
    DAYS_1_TO_7: 8,     // Leve
    DAYS_8_TO_15: 18,   // Moderada
    DAYS_16_TO_30: 32,  // Relevante
    DAYS_31_TO_60: 52,  // Forte
    DAYS_61_TO_90: 75,  // Muito forte
    DAYS_OVER_90: 100,  // Severa
  },

  // Tetos rígidos (Hard caps) para atrasos ATUALMENTE em aberto
  ACTIVE_DELAY_CAPS: {
    DAYS_61_TO_90: 54,   // Teto máximo de 54
    DAYS_91_TO_120: 44,  // Teto máximo de 44
    DAYS_OVER_120: 34,   // Teto máximo de 34
    MULTIPLE_SEVERE_PENALTY: 8, // Penalização extra abaixo do teto se houver múltiplos contratos >60d
  },

  // Fatores de recuperação gradual pós-quitação (resíduo que ainda penaliza)
  SETTLEMENT_RECOVERY: {
    UP_TO_30_DAYS: {
      residualFactor: 0.15, // Recuperação rápida
      monthsDecay: 2,
    },
    DAYS_31_TO_60: {
      residualFactor: 0.40, // Recuperação moderada
      monthsDecay: 4,
    },
    DAYS_61_TO_90: {
      residualFactor: 0.60, // Recuperação lenta
      monthsDecay: 6,
    },
    DAYS_OVER_90: {
      residualFactor: 0.80, // Recuperação muito lenta
      monthsDecay: 12,
    },
  },
};
