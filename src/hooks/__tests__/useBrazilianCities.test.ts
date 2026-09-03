import { describe, it, expect } from "vitest";
import { normalizeText, searchCities } from "@/hooks/useBrazilianCities";

describe("useBrazilianCities - busca e normalização", () => {
  const mockCities = [
    "São Gonçalo dos Campos - BA",
    "Feira de Santana - BA",
    "Salvador - BA",
    "São Paulo - SP",
    "Brasília - DF",
    "Guanambi - BA",
  ];

  it("normaliza acentos e maiúsculas corretamente", () => {
    expect(normalizeText("São Gonçalo dos Campos")).toBe("sao goncalo dos campos");
    expect(normalizeText("BRASÍLIA")).toBe("brasilia");
    expect(normalizeText("  Feira de Santana  ")).toBe("feira de santana");
  });

  it("busca cidades ignorando acentuação e caixa", () => {
    const results = searchCities("sao goncalo", mockCities);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe("São Gonçalo dos Campos - BA");
  });

  it("busca por múltiplos termos combinando cidade e UF", () => {
    const results = searchCities("sao ba", mockCities);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe("São Gonçalo dos Campos - BA");
  });

  it("retorna cidades correspondentes ao prefixo", () => {
    const results = searchCities("salv", mockCities);
    expect(results).toContain("Salvador - BA");
  });

  it("retorna lista padrão quando a busca está vazia", () => {
    const results = searchCities("", mockCities);
    expect(results).toEqual(mockCities);
  });
});
