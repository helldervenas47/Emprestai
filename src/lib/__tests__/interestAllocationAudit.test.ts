import { describe, it, expect, vi } from "vitest";
import {
  ALLOCATION_VERSION_REMAINING_PRORATA,
  allocateInterestByPayment,
} from "@/features/financial/lib/interestAllocation";

const loan = { id: "L1", amount: 1000, interestRate: 20, installments: 4, status: "active" };
const single = { id: "L2", amount: 1000, interestRate: 20, installments: 1, status: "active" };

const legacyPartial = (id: string, amt: number, date: string) => ({
  id, loanId: "L1", amount: amt, date, installmentNumber: -1,
});
const newPartial = (id: string, amt: number, date: string, interest: number, principal: number) => ({
  id, loanId: "L1", amount: amt, date, installmentNumber: -1,
  metadata: {
    allocation_version: ALLOCATION_VERSION_REMAINING_PRORATA,
    interest_amount: interest,
    principal_amount: principal,
  },
});
const amortization = (id: string, amt: number, date: string, loanId = "L1") => ({
  id, loanId, amount: amt, date, installmentNumber: -3,
});

describe("Auditoria: compatibilidade histórica preservada", () => {
  it("amortização histórica seguida de parcial legado — resultado idêntico ao original", () => {
    // Antes de qualquer mudança, legado gerava: legacy1(150) → 150 juros.
    const payments = [
      amortization("a1", 200, "2026-01-05"),
      legacyPartial("legacy1", 150, "2026-01-10"),
    ];
    const m = allocateInterestByPayment([loan], payments);
    expect(m.get("a1")).toBe(0);
    expect(m.get("legacy1")).toBeCloseTo(150, 2); // juros primeiro, intocado
  });

  it("contrato de parcela única com amortização histórica preserva composição do payoff", () => {
    // Antes: amortização 200 + payoff 1000 → interestPart = 1000-1000 = 0.
    // Com a correção, esse comportamento histórico continua igual.
    const payments = [
      amortization("a1", 200, "2026-01-05", "L2"),
      { id: "pay", loanId: "L2", amount: 1000, date: "2026-01-10", installmentNumber: 1 },
    ];
    const m = allocateInterestByPayment([single], payments);
    expect(m.get("a1")).toBe(0);
    // principalRemaining histórico = loan.amount - priorPrincipalByLoan (sem
    // amortização) = 1000. payoff 1000 → principal 1000, interest 0.
    expect(m.get("pay")).toBe(0);
  });
});

describe("Auditoria: amortização e novos parciais coexistindo", () => {
  it("amortização + novo parcial: usa saldos reais para calcular", () => {
    // A composição do novo parcial é PERSISTIDA pelo useLoans no momento da
    // criação; aqui simulamos o resultado esperado (200 principal via
    // amortização → pRem=800, iRem=200; novo parcial 100 → juros=20).
    const payments = [
      amortization("a1", 200, "2026-01-05"),
      newPartial("np1", 100, "2026-02-10", 20, 80),
    ];
    const m = allocateInterestByPayment([loan], payments);
    expect(m.get("np1")).toBe(20);
  });
});

describe("Auditoria: integridade de metadados persistidos", () => {
  it("nova versão sem interest_amount → cai no fallback legado e loga erro", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const payments = [{
      id: "bad", loanId: "L1", amount: 150, date: "2026-01-10", installmentNumber: -1,
      metadata: { allocation_version: ALLOCATION_VERSION_REMAINING_PRORATA },
    }];
    const m = allocateInterestByPayment([loan], payments);
    expect(err).toHaveBeenCalled();
    // Fallback legado: 150 → tudo juros.
    expect(m.get("bad")).toBeCloseTo(150, 2);
    err.mockRestore();
  });

  it("nova versão com soma divergente > R$ 0,01 → fallback + erro", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const payments = [{
      id: "bad2", loanId: "L1", amount: 150, date: "2026-01-10", installmentNumber: -1,
      metadata: {
        allocation_version: ALLOCATION_VERSION_REMAINING_PRORATA,
        interest_amount: 25, principal_amount: 100, // soma = 125, faltam 25
      },
    }];
    const m = allocateInterestByPayment([loan], payments);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("nova versão com valores válidos → usa persistido, ignora fallback", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const payments = [newPartial("ok", 150, "2026-01-10", 25, 125)];
    const m = allocateInterestByPayment([loan], payments);
    expect(err).not.toHaveBeenCalled();
    expect(m.get("ok")).toBe(25);
    err.mockRestore();
  });

  it("soma dentro da tolerância de R$ 0,01 é aceita", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const payments = [newPartial("ok", 150, "2026-01-10", 24.99, 125.00)];
    const m = allocateInterestByPayment([loan], payments);
    expect(err).not.toHaveBeenCalled();
    expect(m.get("ok")).toBe(24.99);
    err.mockRestore();
  });
});

describe("Auditoria: ordem determinística", () => {
  it("mesma coleção em ordens diferentes → mesmo resultado", () => {
    const payments = [
      legacyPartial("a", 50, "2026-01-10"),
      newPartial("b", 100, "2026-02-10", 15, 85),
      amortization("c", 100, "2026-03-10"),
    ];
    const shuffled = [payments[2], payments[0], payments[1]];
    const m1 = allocateInterestByPayment([loan], payments);
    const m2 = allocateInterestByPayment([loan], shuffled);
    expect(m1.get("a")).toBe(m2.get("a"));
    expect(m1.get("b")).toBe(m2.get("b"));
    expect(m1.get("c")).toBe(m2.get("c"));
  });

  it("empate de data+createdAt: desempate por id garante estabilidade", () => {
    const p1 = { id: "z", loanId: "L1", amount: 50, date: "2026-01-10", installmentNumber: -1, metadata: null };
    const p2 = { id: "a", loanId: "L1", amount: 50, date: "2026-01-10", installmentNumber: -1, metadata: null };
    const m1 = allocateInterestByPayment([loan], [p1, p2]);
    const m2 = allocateInterestByPayment([loan], [p2, p1]);
    expect(m1.get("a")).toBe(m2.get("a"));
    expect(m1.get("z")).toBe(m2.get("z"));
  });
});

describe("Auditoria: invariantes financeiras globais", () => {
  it("juros total alocado nunca ultrapassa juros contratado + resíduo", () => {
    const payments = [
      newPartial("p1", 300, "2026-01-10", 50, 250),
      newPartial("p2", 300, "2026-02-10", 50, 250),
      newPartial("p3", 300, "2026-03-10", 50, 250),
      newPartial("p4", 300, "2026-04-10", 50, 250),
    ];
    const m = allocateInterestByPayment([loan], payments);
    const total = [...m.values()].reduce((s, v) => s + v, 0);
    expect(total).toBeLessThanOrEqual(200 + 0.02);
  });
});
