import { SCORE_BANDS, RISK_SCORE_CONFIG } from "./riskEngine/riskScoreConfig";

export interface ClientRiskScoreInfo {
  score: number;
  label: "Excelente" | "Bom" | "Regular" | "Risco elevado" | "Alto risco" | "Sem Histórico";
  color: string;
  bgColor: string;
}

/**
 * Converte o valor de score de risco (escala de 0 a 100)
 * em badge visual estilizado com cor e classificação.
 */
export function getClientRiskScoreInfo(rawScore: number | string | null | undefined): ClientRiskScoreInfo {
  if (rawScore == null || rawScore === "") {
    return {
      score: RISK_SCORE_CONFIG.DEFAULT_NEUTRAL_SCORE, // 60
      label: "Sem Histórico",
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
      color: matchedBand.color,
      bgColor: matchedBand.bgColor,
    };
  }

  return {
    score: numScore,
    label: "Alto risco",
    color: "text-destructive",
    bgColor: "bg-destructive/15",
  };
}
