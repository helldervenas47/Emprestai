import { describe, it, expect } from "vitest";
import { getClientRiskScoreInfo } from "@/features/clients/lib/clientRiskScore";

describe("clientRiskScore - Classificação e Badges (Escala 0 a 100)", () => {
  it("retorna 'Sem Histórico' com score neutro (60) para valores nulos ou vazios", () => {
    const resultNull = getClientRiskScoreInfo(null);
    expect(resultNull.score).toBe(60);
    expect(resultNull.label).toBe("Sem Histórico");

    const resultUndefined = getClientRiskScoreInfo(undefined);
    expect(resultUndefined.score).toBe(60);
    expect(resultUndefined.label).toBe("Sem Histórico");
  });

  it("classifica score Excelente (85 a 100)", () => {
    const result = getClientRiskScoreInfo(92);
    expect(result.score).toBe(92);
    expect(result.label).toBe("Excelente");
    expect(result.color).toBe("text-success");
  });

  it("classifica score Bom (70 a 84)", () => {
    const result = getClientRiskScoreInfo(75);
    expect(result.score).toBe(75);
    expect(result.label).toBe("Bom");
    expect(result.color).toBe("text-primary");
  });

  it("classifica score Regular (55 a 69)", () => {
    const result = getClientRiskScoreInfo(62);
    expect(result.score).toBe(62);
    expect(result.label).toBe("Regular");
    expect(result.color).toBe("text-warning");
  });

  it("classifica score Risco elevado (40 a 54)", () => {
    const result = getClientRiskScoreInfo(48);
    expect(result.score).toBe(48);
    expect(result.label).toBe("Risco elevado");
    expect(result.color).toBe("text-orange-500");
  });

  it("classifica score Alto risco (0 a 39)", () => {
    const result = getClientRiskScoreInfo(25);
    expect(result.score).toBe(25);
    expect(result.label).toBe("Alto risco");
    expect(result.color).toBe("text-destructive");
  });

  it("limita limites de 0 e 100", () => {
    const minResult = getClientRiskScoreInfo(-10);
    expect(minResult.score).toBe(0);

    const maxResult = getClientRiskScoreInfo(150);
    expect(maxResult.score).toBe(100);
  });
});
