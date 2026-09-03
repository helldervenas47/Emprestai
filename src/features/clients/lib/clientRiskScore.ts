export interface ClientRiskScoreInfo {
  score: number;
  label: "Excelente" | "Bom" | "Regular" | "Ruim" | "Crítico" | "Sem Histórico";
  color: string;
  bgColor: string;
}

/**
 * Converte o valor de score_risco (0 a 150) armazenado na tabela clients em
 * badge visual estilizado com cor e classificação sem necessidade de recalcular histórico.
 */
export function getClientRiskScoreInfo(rawScore: number | string | null | undefined): ClientRiskScoreInfo {
  if (rawScore == null || rawScore === "") {
    return {
      score: 100,
      label: "Sem Histórico",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    };
  }

  const score = typeof rawScore === "string" ? parseFloat(rawScore) : rawScore;
  const numScore = isNaN(score) ? 100 : Math.max(0, Math.min(150, Math.round(score)));

  if (numScore >= 130) {
    return { score: numScore, label: "Excelente", color: "text-success", bgColor: "bg-success" };
  }
  if (numScore >= 110) {
    return { score: numScore, label: "Bom", color: "text-primary", bgColor: "bg-primary" };
  }
  if (numScore >= 90) {
    return { score: numScore, label: "Regular", color: "text-warning", bgColor: "bg-warning" };
  }
  if (numScore >= 60) {
    return { score: numScore, label: "Ruim", color: "text-orange-500", bgColor: "bg-orange-500" };
  }
  return { score: numScore, label: "Crítico", color: "text-destructive", bgColor: "bg-destructive" };
}
