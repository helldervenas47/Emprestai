import { describe, it, expect } from "vitest";
import {
  ALLOCATION_VERSION_REMAINING_PRORATA,
  allocateInterestByPayment,
  allocatePartialProrata,
} from "@/features/financial/lib/interestAllocation";

const loan = {
  id: "L1",
  amount: 1000,
  interestRate: 20, // total juros contratado = 200
  installments: 4,
  status: "active",
};

const newPartial = (id: string, amount: number, date: string, interestPersisted?: number, principalPersisted?: number) => ({
  id,
  loanId: "L1",
  amount,
  date,
  installmentNumber: -1,
  metadata: {
    allocation_version: ALLOCATION_VERSION_REMAINING_PRORATA,
    ...(interestPersisted != null ? { interest_amount: interestPersisted } : {}),
    ...(principalPersisted != null ? { principal_amount: principalPersisted } : {}),
  },
});

const legacyPartial = (id: string, amount: number, date: string) => ({
  id, loanId: "L1", amount, date, installmentNumber: -1,
});

describe("allocatePartialProrata (unit)", () => {
  it("distribui proporcionalmente pelos saldos remanescentes", () => {
    const r = allocatePartialProrata({ amount: 150, principalRemaining: 1000, interestRemaining: 200 });
    expect(r.interest).toBeCloseTo(25, 2);
    expect(r.principal).toBeCloseTo(125, 2);
  });

  it("segundo parcial usa saldos atualizados", () => {
    const r = allocatePartialProrata({ amount: 100, principalRemaining: 875, interestRemaining: 175 });
    expect(r.interest).toBeCloseTo(16.67, 2);
    expect(r.principal).toBeCloseTo(83.33, 2);
  });

  it("nunca ultrapassa saldos remanescentes", () => {
    const r = allocatePartialProrata({ amount: 500, principalRemaining: 100, interestRemaining: 50 });
    expect(r.interest).toBeLessThanOrEqual(50);
    expect(r.principal).toBeLessThanOrEqual(100);
  });

  it("saldo zero: retorna zero juros", () => {
    const r = allocatePartialProrata({ amount: 100, principalRemaining: 0, interestRemaining: 0 });
    expect(r.interest).toBe(0);
  });
});

describe("allocateInterestByPayment — novos parciais proporcionais", () => {
  it("primeiro parcial 150 aloca 25 de juros (persistido)", () => {
    const payments = [newPartial("p1", 150, "2026-01-10", 25, 125)];
    const m = allocateInterestByPayment([loan], payments);
    expect(m.get("p1")).toBeCloseTo(25, 2);
  });

  it("dois parciais consecutivos: 25 + 16.67 (persistidos)", () => {
    const payments = [
      newPartial("p1", 150, "2026-01-10", 25, 125),
      newPartial("p2", 100, "2026-02-10", 16.67, 83.33),
    ];
    const m = allocateInterestByPayment([loan], payments);
    expect(m.get("p1")).toBeCloseTo(25, 2);
    expect(m.get("p2")).toBeCloseTo(16.67, 2);
  });

  it("interest_amount persistido é definitivo e ignora recálculo", () => {
    const payments = [newPartial("p1", 150, "2026-01-10", 30, 120)];
    const m = allocateInterestByPayment([loan], payments);
    expect(m.get("p1")).toBe(30);
  });

  it("pagamento legado (sem marcador) mantém regra 'juros primeiro'", () => {
    const payments = [legacyPartial("legacy1", 150, "2026-01-10")];
    const m = allocateInterestByPayment([loan], payments);
    // Regra antiga: 150 vai todo para juros (até esgotar 200).
    expect(m.get("legacy1")).toBeCloseTo(150, 2);
  });

  it("legado seguido de novo parcial: preserva histórico legado + honra persistido", () => {
    const payments = [
      legacyPartial("legacy1", 100, "2026-01-10"),           // legado: 100 juros
      newPartial("p2", 150, "2026-02-10", 13.64, 136.36),    // persistido reflete iRem=100, pRem=1000
    ];
    const m = allocateInterestByPayment([loan], payments);
    expect(m.get("legacy1")).toBeCloseTo(100, 2);
    expect(m.get("p2")).toBeCloseTo(13.64, 1);
  });

  it("amortização (-3) seguida de parcial: honra persistido do parcial", () => {
    const payments = [
      { id: "a1", loanId: "L1", amount: 200, date: "2026-01-10", installmentNumber: -3 },
      newPartial("p2", 100, "2026-02-10", 20, 80),
    ];
    const m = allocateInterestByPayment([loan], payments);
    expect(m.get("a1")).toBe(0);
    expect(m.get("p2")).toBeCloseTo(20, 2);
  });

  it("execução repetida produz o mesmo resultado (idempotência)", () => {
    const payments = [
      newPartial("p1", 150, "2026-01-10", 25, 125),
      newPartial("p2", 100, "2026-02-10", 16.67, 83.33),
    ];
    const a = allocateInterestByPayment([loan], payments);
    const b = allocateInterestByPayment([loan], payments);
    expect(a.get("p1")).toBe(b.get("p1"));
    expect(a.get("p2")).toBe(b.get("p2"));
  });

  it("invariante: soma de juros novos + histórico ≤ juros contratados", () => {
    const payments = [
      legacyPartial("legacy1", 80, "2026-01-10"),
      newPartial("p2", 200, "2026-02-10", 20, 180),
      newPartial("p3", 300, "2026-03-10", 30, 270),
    ];
    const m = allocateInterestByPayment([loan], payments);
    const total = [...m.values()].reduce((s, v) => s + v, 0);
    expect(total).toBeLessThanOrEqual(200 + 0.02);
  });
});
