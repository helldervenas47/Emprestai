import { describe, it, expect } from "vitest";
import {
  getPrimaryFormKindForTab,
  isAutomaticIdlePrefetchAllowed,
} from "../primaryFormLoader";

const sel = (over: Partial<Parameters<typeof getPrimaryFormKindForTab>[0]> = {}) => ({
  tab: "dashboard",
  clientSubTab: "clientes",
  incExpTab: "expenses",
  expenseSubTab: "business",
  ...over,
});

describe("getPrimaryFormKindForTab", () => {
  it("aba Dashboard → LoanForm", () => {
    expect(getPrimaryFormKindForTab(sel({ tab: "dashboard" }))).toBe("loan");
  });

  it("aba Cadastros (clientes) → ClientForm", () => {
    expect(
      getPrimaryFormKindForTab(sel({ tab: "clients", clientSubTab: "clientes" })),
    ).toBe("client");
  });

  it("aba Cadastros em sub-aba diferente → null", () => {
    expect(
      getPrimaryFormKindForTab(sel({ tab: "clients", clientSubTab: "documentos" })),
    ).toBeNull();
  });

  it("Financeiro > Receitas → null (usa CustomEvent, não lazy)", () => {
    expect(
      getPrimaryFormKindForTab(sel({ tab: "expenses", incExpTab: "incomes" })),
    ).toBeNull();
  });

  it("Financeiro > Despesas Empresariais → ExpenseForm", () => {
    expect(
      getPrimaryFormKindForTab(
        sel({ tab: "expenses", incExpTab: "expenses", expenseSubTab: "business" }),
      ),
    ).toBe("expense");
  });

  it("Financeiro > Despesas Pessoais → PersonalExpenseForm", () => {
    expect(
      getPrimaryFormKindForTab(
        sel({ tab: "expenses", incExpTab: "expenses", expenseSubTab: "personal" }),
      ),
    ).toBe("personal-expense");
  });

  it("abas sem ação primária de prefetch (products, vehicles, calendar…) → null", () => {
    for (const tab of ["products", "vehicles", "calendar", "reports", "system"]) {
      expect(getPrimaryFormKindForTab(sel({ tab }))).toBeNull();
    }
  });

  it("é uma função pura — chamadas repetidas retornam o mesmo valor", () => {
    const args = sel({ tab: "dashboard" });
    expect(getPrimaryFormKindForTab(args)).toBe(getPrimaryFormKindForTab(args));
  });
});

describe("isAutomaticIdlePrefetchAllowed", () => {
  it("permite quando navigator.connection não existe (undefined)", () => {
    expect(isAutomaticIdlePrefetchAllowed(undefined)).toBe(true);
  });

  it("permite quando navigator.connection é null", () => {
    expect(isAutomaticIdlePrefetchAllowed(null)).toBe(true);
  });

  it("bloqueia quando saveData = true", () => {
    expect(isAutomaticIdlePrefetchAllowed({ saveData: true, effectiveType: "4g" })).toBe(false);
  });

  it("bloqueia em slow-2g", () => {
    expect(isAutomaticIdlePrefetchAllowed({ effectiveType: "slow-2g" })).toBe(false);
  });

  it("bloqueia em 2g", () => {
    expect(isAutomaticIdlePrefetchAllowed({ effectiveType: "2g" })).toBe(false);
  });

  it("permite em 3g", () => {
    expect(isAutomaticIdlePrefetchAllowed({ effectiveType: "3g" })).toBe(true);
  });

  it("permite em 4g", () => {
    expect(isAutomaticIdlePrefetchAllowed({ effectiveType: "4g" })).toBe(true);
  });

  it("permite quando effectiveType é desconhecido/omitido", () => {
    expect(isAutomaticIdlePrefetchAllowed({})).toBe(true);
  });

  it("não lança quando a API é ausente", () => {
    expect(() => isAutomaticIdlePrefetchAllowed(undefined)).not.toThrow();
  });
});
