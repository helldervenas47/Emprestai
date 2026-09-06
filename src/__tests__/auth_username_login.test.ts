import { describe, it, expect } from "vitest";

describe("Login com Username e Email", () => {
  it("detecta corretamente quando o input é email ou username", () => {
    const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    expect(isEmail("usuario@exemplo.com")).toBe(true);
    expect(isEmail("helder@empresa.com.br")).toBe(true);

    expect(isEmail("helder")).toBe(false);
    expect(isEmail("admin")).toBe(false);
    expect(isEmail("helder.venas")).toBe(false);
    expect(isEmail("usuario_123")).toBe(false);
  });

  it("normaliza username para busca inteligente", () => {
    const normalize = (input: string) => input.trim().toLowerCase();

    expect(normalize("  Helder  ")).toBe("helder");
    expect(normalize("Admin_123")).toBe("admin_123");
  });
});
