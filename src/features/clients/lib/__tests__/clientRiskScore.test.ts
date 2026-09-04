import { describe, it, expect } from "vitest";
import { getClientRiskScoreInfo, getRiskLevelDescription } from "@/features/clients/lib/clientRiskScore";

describe("clientRiskScore - Classificação, Badges e Descrições (Escala 0 a 100)", () => {
  it("retorna 'Sem Histórico' com score neutro (60) para valores nulos ou vazios", () => {
    const resultNull = getClientRiskScoreInfo(null);
    expect(resultNull.score).toBe(60);
    expect(resultNull.label).toBe("Sem Histórico");
    expect(resultNull.description).toContain("Apresenta um comportamento financeiro intermediário");

    const resultUndefined = getClientRiskScoreInfo(undefined);
    expect(resultUndefined.score).toBe(60);
    expect(resultUndefined.label).toBe("Sem Histórico");
  });

  it("classifica score Excelente (85 a 100) com nível Muito baixo", () => {
    const result = getClientRiskScoreInfo(92);
    expect(result.score).toBe(92);
    expect(result.label).toBe("Excelente");
    expect(result.riskLevel).toBe("Muito baixo");
    expect(result.description).toBe("Apresenta excelente comportamento de pagamento, elevada consistência e poucos sinais de risco no histórico analisado.");
    expect(result.color).toBe("text-success");
  });

  it("classifica score Bom (70 a 84) com nível Baixo", () => {
    const result = getClientRiskScoreInfo(75);
    expect(result.score).toBe(75);
    expect(result.label).toBe("Bom");
    expect(result.riskLevel).toBe("Baixo");
    expect(result.description).toBe("Demonstra comportamento de pagamento consistente, com histórico geralmente positivo e poucos sinais de risco.");
    expect(result.color).toBe("text-primary");
  });

  it("classifica score Regular (55 a 69) com nível Médio", () => {
    const result = getClientRiskScoreInfo(62);
    expect(result.score).toBe(62);
    expect(result.label).toBe("Regular");
    expect(result.riskLevel).toBe("Médio");
    expect(result.description).toBe("Apresenta um comportamento financeiro intermediário, com histórico que merece acompanhamento antes de novas concessões.");
    expect(result.color).toBe("text-warning");
  });

  it("classifica score Risco elevado (40 a 54) com nível Alto", () => {
    const result = getClientRiskScoreInfo(48);
    expect(result.score).toBe(48);
    expect(result.label).toBe("Risco elevado");
    expect(result.riskLevel).toBe("Alto");
    expect(result.description).toBe("Apresenta um histórico de pagamento com ocorrências relevantes que indicam maior necessidade de atenção na concessão de novos créditos.");
    expect(result.color).toBe("text-orange-500");
  });

  it("classifica score Alto risco (0 a 39) com nível Muito alto", () => {
    const result = getClientRiskScoreInfo(25);
    expect(result.score).toBe(25);
    expect(result.label).toBe("Alto risco");
    expect(result.riskLevel).toBe("Muito alto");
    expect(result.description).toBe("Apresenta sinais significativos de dificuldade no cumprimento das obrigações, com histórico de comportamento que exige máxima cautela na concessão de crédito.");
    expect(result.color).toBe("text-destructive");
  });

  it("helper getRiskLevelDescription retorna descrições padronizadas", () => {
    expect(getRiskLevelDescription("Muito alto")).toContain("exige máxima cautela");
    expect(getRiskLevelDescription("Alto")).toContain("ocorrências relevantes");
    expect(getRiskLevelDescription("Médio")).toContain("comportamento financeiro intermediário");
    expect(getRiskLevelDescription("Baixo")).toContain("comportamento de pagamento consistente");
    expect(getRiskLevelDescription("Muito baixo")).toContain("excelente comportamento de pagamento");
  });

  it("limita limites de 0 e 100", () => {
    const minResult = getClientRiskScoreInfo(-10);
    expect(minResult.score).toBe(0);

    const maxResult = getClientRiskScoreInfo(150);
    expect(maxResult.score).toBe(100);
  });
});
