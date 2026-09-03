/**
 * Regression tests for the credit limit / score calculations used by the
 * Cadastros tab. These are pure functions — no mocks required.
 */
import { describe, it, expect } from "vitest";
import {
  computeUsedLimit,
  computeAvailableLimit,
  computeClientCreditMetrics,
  computeAutoLimitAdjustment,
  formatBRL,
  DEFAULT_INITIAL_LIMIT,
} from "@/features/creditCards/lib/creditLimit";
import type { Client, Loan, Payment } from "@/types/loan";

function makeClient(over: Partial<Client> = {}): Client {
  return {
    id: "c1",
    name: "Cliente Teste",
    phone: "", email: "", cpf: "", cnpj: "", rg: "",
    address: "", city: "", state: "", score: "",
    active: true, createdAt: "2025-01-01T00:00:00Z",
    ...over,
  };
}

function makeLoan(over: Partial<Loan> = {}): Loan {
  return {
    id: "l1", borrowerName: "Cliente Teste", borrowerId: "c1",
    amount: 1000, interestRate: 0, interestType: "monthly",
    paymentType: "installment",
    startDate: "2025-01-01", dueDate: "2025-02-01",
    installments: 1, paidInstallments: 0,
    status: "active", createdAt: "2025-01-01T00:00:00Z",
    ...over,
  };
}

function makePayment(over: Partial<Payment> = {}): Payment {
  return {
    id: "p1", loanId: "l1", amount: 100,
    date: "2025-02-01", installmentNumber: 1,
    ...over,
  };
}

describe("computeUsedLimit", () => {
  const client = makeClient();

  it("returns 0 when the client has no loans", () => {
    expect(computeUsedLimit(client, [], [])).toBe(0);
  });

  it("ignores paid loans", () => {
    const loans = [makeLoan({ status: "paid", originalAmount: 500 })];
    expect(computeUsedLimit(client, loans, [])).toBe(0);
  });

  it("sums the principal of active loans using originalAmount when set", () => {
    const loans = [
      makeLoan({ id: "l1", originalAmount: 800, amount: 500 }),
      makeLoan({ id: "l2", originalAmount: 200, amount: 999 }),
    ];
    expect(computeUsedLimit(client, loans, [])).toBe(1000);
  });

  it("falls back to amount when originalAmount is absent", () => {
    const loans = [makeLoan({ amount: 750 })];
    expect(computeUsedLimit(client, loans, [])).toBe(750);
  });

  it("subtracts amortization payments (installmentNumber === -3) only", () => {
    const loans = [makeLoan({ id: "l1", originalAmount: 1000 })];
    const payments = [
      makePayment({ id: "p1", loanId: "l1", amount: 200, installmentNumber: -3 }),
      makePayment({ id: "p2", loanId: "l1", amount: 300, installmentNumber: 1 }), // regular parcel: doesn't reduce principal
    ];
    expect(computeUsedLimit(client, loans, payments)).toBe(800);
  });

  it("never returns a negative value", () => {
    const loans = [makeLoan({ originalAmount: 100 })];
    const payments = [
      makePayment({ amount: 999, installmentNumber: -3 }),
    ];
    expect(computeUsedLimit(client, loans, payments)).toBe(0);
  });

  it("only considers loans belonging to the client (matched by borrowerId)", () => {
    const loans = [
      makeLoan({ borrowerId: "other", originalAmount: 500 }),
      makeLoan({ id: "l2", borrowerId: "c1", originalAmount: 200 }),
    ];
    expect(computeUsedLimit(client, loans, [])).toBe(200);
  });
});

describe("computeAvailableLimit", () => {
  it("returns total minus used", () => {
    expect(computeAvailableLimit(1000, 300)).toBe(700);
  });
  it("can be zero (exactly at the limit)", () => {
    expect(computeAvailableLimit(500, 500)).toBe(0);
  });
  it("can be negative (over the limit)", () => {
    expect(computeAvailableLimit(500, 800)).toBe(-300);
  });
});

describe("computeClientCreditMetrics", () => {
  it("returns zeroed metrics when the client has no loans", () => {
    const m = computeClientCreditMetrics("c1", [], []);
    expect(m.totalLoans).toBe(0);
    expect(m.totalInstallmentsPaid).toBe(0);
    expect(m.onTimePct).toBe(1);
    expect(m.avgLateDays).toBe(0);
  });

  it("counts on-time vs late installments", () => {
    const loans = [makeLoan({ id: "l1", startDate: "2025-01-01" })];
    const payments = [
      // installment 1 due 2025-02-01, paid on time
      makePayment({ id: "a", loanId: "l1", installmentNumber: 1, date: "2025-02-01" }),
      // installment 2 due 2025-03-01, paid 10 days late
      makePayment({ id: "b", loanId: "l1", installmentNumber: 2, date: "2025-03-11" }),
    ];
    const m = computeClientCreditMetrics("c1", loans, payments);
    expect(m.onTime).toBe(1);
    expect(m.late).toBe(1);
    expect(m.totalInstallmentsPaid).toBe(2);
    expect(m.onTimePct).toBeCloseTo(0.5, 5);
    expect(m.avgLateDays).toBe(10);
  });

  it("ignores non-installment payments (installmentNumber <= 0)", () => {
    const loans = [makeLoan({ id: "l1" })];
    const payments = [
      makePayment({ id: "a", loanId: "l1", installmentNumber: -3 }),
      makePayment({ id: "b", loanId: "l1", installmentNumber: 0 }),
    ];
    const m = computeClientCreditMetrics("c1", loans, payments);
    expect(m.totalInstallmentsPaid).toBe(0);
  });
});

describe("computeAutoLimitAdjustment", () => {
  const zero = { totalLoans: 0, paidLoans: 0, totalInstallmentsPaid: 0, onTime: 0, late: 0, onTimePct: 1, avgLateDays: 0 };

  it("keeps the limit when there is no payment history", () => {
    const r = computeAutoLimitAdjustment(1000, zero);
    expect(r.newLimit).toBe(1000);
    expect(r.delta).toBe(0);
  });

  it("raises 10% for good history (>=90% on time, <5 days avg late)", () => {
    const r = computeAutoLimitAdjustment(1000, {
      ...zero, totalInstallmentsPaid: 10, onTime: 9, late: 1, onTimePct: 0.9, avgLateDays: 2,
    });
    expect(r.delta).toBeGreaterThan(0);
    expect(r.newLimit).toBe(1100);
  });

  it("uses DEFAULT_INITIAL_LIMIT as the base when currentLimit is 0", () => {
    const r = computeAutoLimitAdjustment(0, {
      ...zero, totalInstallmentsPaid: 10, onTime: 10, onTimePct: 1, avgLateDays: 0,
    });
    // delta is bounded by min(base*10%, current+base*10%) = min(30, 30) = 30
    expect(r.newLimit).toBe(Math.round(DEFAULT_INITIAL_LIMIT * 0.1));
  });

  it("keeps the limit for regular history (70-89%)", () => {
    const r = computeAutoLimitAdjustment(1000, {
      ...zero, totalInstallmentsPaid: 10, onTime: 8, late: 2, onTimePct: 0.8, avgLateDays: 3,
    });
    expect(r.newLimit).toBe(1000);
    expect(r.delta).toBe(0);
  });

  it("reduces 10% for bad history (<70%)", () => {
    const r = computeAutoLimitAdjustment(1000, {
      ...zero, totalInstallmentsPaid: 10, onTime: 5, late: 5, onTimePct: 0.5, avgLateDays: 20,
    });
    expect(r.delta).toBeLessThan(0);
    expect(r.newLimit).toBe(900);
  });

  it("never returns a limit below 0", () => {
    const r = computeAutoLimitAdjustment(10, {
      ...zero, totalInstallmentsPaid: 10, onTime: 0, late: 10, onTimePct: 0, avgLateDays: 30,
    });
    expect(r.newLimit).toBeGreaterThanOrEqual(0);
  });
});

describe("formatBRL", () => {
  it("formats values as BRL currency", () => {
    // NBSP separator across ICU builds — assert via inclusion instead.
    const out = formatBRL(1234.5);
    expect(out).toMatch(/R\$/);
    expect(out).toMatch(/1\.234,50/);
  });
  it("formats zero", () => {
    expect(formatBRL(0)).toMatch(/0,00/);
  });
});
