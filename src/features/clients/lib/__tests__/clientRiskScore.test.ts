import { describe, it, expect } from "vitest";
import { getClientRiskScoreInfo } from "@/features/clients/lib/clientRiskScore";

describe("clientRiskScore - Classificação e Badges", () => {
  it("retorna 'Sem Histórico' para valores nulos ou vazios", () => {
    const resultNull = getClientRiskScoreInfo(null);
    expect(resultNull.score).toBe(100);
    expect(resultNull.label).toBe("Sem Histórico");

    const resultUndefined = getClientRiskScoreInfo(undefined);
    expect(resultUndefined.score).toBe(100);
    expect(resultUndefined.label).toBe("Sem Histórico");
  });

  it("classifica score Excelente (>= 130)", () => {
    const result = getClientRiskScoreInfo(140);
    expect(result.score).toBe(140);
    expect(result.label).toBe("Excelente");
    expect(result.color).toBe("text-success");
  });

  it("classifica score Bom (>= 110 e < 130)", () => {
    const result = getClientRiskScoreInfo(115);
    expect(result.score).toBe(115);
    expect(result.label).toBe("Bom");
    expect(result.color).toBe("text-primary");
  });

  it("classifica score Regular (>= 90 e < 110)", () => {
    const result = getClientRiskScoreInfo(95);
    expect(result.score).toBe(95);
    expect(result.label).toBe("Regular");
    expect(result.color).toBe("text-warning");
  });

  it("classifica score Ruim (>= 60 e < 90)", () => {
    const result = getClientRiskScoreInfo(75);
    expect(result.score).toBe(75);
    expect(result.label).toBe("Ruim");
    expect(result.color).toBe("text-orange-500");
  });

  it("classifica score Crítico (< 60)", () => {
    const result = getClientRiskScoreInfo(40);
    expect(result.score).toBe(40);
    expect(result.label).toBe("Crítico");
    expect(result.color).toBe("text-destructive");
  });

  it("limita limites de 0 e 150", () => {
    const minResult = getClientRiskScoreInfo(-10);
    expect(minResult.score).toBe(0);

    const maxResult = getClientRiskScoreInfo(200);
    expect(maxResult.score).toBe(150);
  });
});
