/**
 * Configurações e limiares de relevância para o Business Pulse
 * Todos os limites são centralizados para evitar números mágicos no código.
 */
export const PULSE_CONFIG = {
  // Limiares de variação percentual para considerar relevante
  MIN_RELEVANT_PCT_CHANGE: 5.0,        // +/- 5%
  SIGNIFICANT_GROWTH_PCT: 12.0,        // +12%
  SIGNIFICANT_DROP_PCT: -10.0,         // -10%

  // Limiares de variação de inadimplência em Pontos Percentuais (p.p.)
  MIN_RELEVANT_PP_DEFAULT_CHANGE: 1.0, // +/- 1.0 p.p.
  SEVERE_DEFAULT_PP_INCREASE: 3.0,     // +3.0 p.p.

  // Concentração de Inadimplência
  HIGH_CONCENTRATION_SHARE_PCT: 50.0,  // Top devedores concentram >= 50%
  MAX_TOP_CLIENTS_COUNT: 3,            // Top 3 devedores para análise de concentração

  // Requisitos mínimos de dados
  MIN_TRANSACTIONS_FOR_COMPARISON: 2,  // Mínimo de movimentações para comparação
  MIN_LOANS_FOR_DEVIATION_ALERT: 2,

  // Cache e atualização
  CACHE_TTL_MS: 5 * 60 * 1000,         // 5 minutos
} as const;
