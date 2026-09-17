import { describe, it, expect } from "vitest";
import { normalizeSearchText, matchesSearch, matchesAnySearch, normalizeDigits } from "../searchUtils";

describe("searchUtils", () => {
  it("normaliza textos removendo acentos e convertendo para minúsculas", () => {
    expect(normalizeSearchText("João")).toBe("joao");
    expect(normalizeSearchText("Crédito Fácil")).toBe("credito facil");
    expect(normalizeSearchText("CONCEIÇÃO")).toBe("conceicao");
    expect(normalizeSearchText("Müller")).toBe("muller");
    expect(normalizeSearchText("  Ação e Reação  ")).toBe("acao e reacao");
  });

  it("identifica correspondência ignorando acentuações e maiúsculas", () => {
    expect(matchesSearch("Jeanderson da Conceição", "conceicao")).toBe(true);
    expect(matchesSearch("Jeanderson da Conceição", "CONCEICAO")).toBe(true);
    expect(matchesSearch("Jeanderson da Conceição", "CONCEIÇÃO")).toBe(true);
    expect(matchesSearch("joao rodrigues", "João")).toBe(true);
    expect(matchesSearch("Empréstimo Pessoal", "emprestimo")).toBe(true);
    expect(matchesSearch("Empréstimo Pessoal", "pessoal")).toBe(true);
    expect(matchesSearch("Empréstimo Pessoal", "carro")).toBe(false);
  });

  it("verifica matchesAnySearch com múltiplos campos e dígitos", () => {
    const targets = ["Thiago Rodrigues", "thiago@email.com", "123.456.789-00", "(11) 98765-4321"];
    expect(matchesAnySearch(targets, "rodrigues")).toBe(true);
    expect(matchesAnySearch(targets, "RODRIGUES")).toBe(true);
    expect(matchesAnySearch(targets, "12345678900")).toBe(true);
    expect(matchesAnySearch(targets, "987654321")).toBe(true);
    expect(matchesAnySearch(targets, "inexistente")).toBe(false);
  });
});
