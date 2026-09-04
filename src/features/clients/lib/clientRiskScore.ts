import { SCORE_BANDS, RISK_SCORE_CONFIG, getRiskLevelDescription } from "./riskEngine/riskScoreConfig";

export { getRiskLevelDescription };

export interface ClientRiskScoreInfo {
  score: number;
  label: "Excelente" | "Bom" | "Regular" | "Risco elevado" | "Alto risco" | "Sem Histórico";
  riskLevel: "Muito baixo" | "Baixo" | "Médio" | "Alto" | "Muito alto" | "Neutro";
  description: string;
  color: string;
  bgColor: string;
}

/**
 * Converte o valor de score de risco (escala de 0 a 100)
 * em badge visual estilizado com cor, classificação e descrição padronizada.
 */
export function getClientRiskScoreInfo(rawScore: number | string | null | undefined): ClientRiskScoreInfo {
  if (rawScore == null || rawScore === "") {
    const defaultBand = SCORE_BANDS[2]; // Médio / Regular
    return {
      score: RISK_SCORE_CONFIG.DEFAULT_NEUTRAL_SCORE, // 60
      label: "Sem Histórico",
      riskLevel: "Neutro",
      description: defaultBand.description,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    };
  }

  const score = typeof rawScore === "string" ? parseFloat(rawScore) : rawScore;
  const numScore = isNaN(score) ? RISK_SCORE_CONFIG.DEFAULT_NEUTRAL_SCORE : Math.max(0, Math.min(100, Math.round(score)));

  const matchedBand = SCORE_BANDS.find((band) => numScore >= band.min && numScore <= band.max);
  if (matchedBand) {
    return {
      score: numScore,
      label: matchedBand.label,
      riskLevel: matchedBand.riskLevel,
      description: matchedBand.description,
      color: matchedBand.color,
      bgColor: matchedBand.bgColor,
    };
  }

  return {
    score: numScore,
    label: "Alto risco",
    riskLevel: "Muito alto",
    description: SCORE_BANDS[4].description,
    color: "text-destructive",
    bgColor: "bg-destructive/15",
  };
}
