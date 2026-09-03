import { describe, it, expect } from "vitest";
import {
  getLoanOutstandingBreakdown,
  buildLoanSummaryPresentation,
} from "@/features/loans/lib/loanOutstanding";
import type { Loan } from "@/types/loan";

const makeLoan = (over: Partial<Loan> = {}): Loan => ({
  id: "L1",
  borrowerName: "Cliente",
  amount: 1400,
  interestRate: 50,
  interestType: "Mensal",
  paymentType: "unico",
  startDate: "2026-01-01",
  dueDate: "2026-02-01",
  installments: 1,
  paidInstallments: 0,
  status: "active",
  createdAt: "2026-01-01",
  ...over,
});

const sumSummable = (p: ReturnType<typeof buildLoanSummaryPresentation>) =>
  Math.round(p.lines.filter((l) => l.summable).reduce((s, l) => s + l.value, 0) * 100) / 100;

describe("buildLoanSummaryPresentation", () => {
  it("caso do relatório: 1.400 + 700 = 2.100 (juros do ciclo apenas como detalhe)", () => {
    const b = getLoanOutstandingBreakdown({
      loan: makeLoan({ remainingAmount: 2100 }),
      payments: [],
      currentInterestPending: 219.8,
    });
    const p = buildLoanSummaryPresentation(b);
    expect(sumSummable(p)).toBe(2100);
    expect(p.total).toBe(b.payoffTotal);
    const detail = p.lines.find((l) => l.key === "current-interest");
    expect(detail?.summable).toBe(false);
    expect(detail?.value).toBe(219.8);
  });

  it("sem atraso: principal + juros = saldo", () => {
    const b = getLoanOutstandingBreakdown({ loan: makeLoan({ remainingAmount: 2100 }), payments: [] });
    const p = buildLoanSummaryPresentation(b);
    expect(sumSummable(p)).toBe(p.total);
    expect(p.total).toBe(b.payoffTotal);
  });

  it("com multa", () => {
    const b = getLoanOutstandingBreakdown({ loan: makeLoan({ remainingAmount: 2100 }), payments: [], penalty: 50 });
    const p = buildLoanSummaryPresentation(b);
    expect(sumSummable(p)).toBe(2150);
    expect(p.total).toBe(b.payoffTotal);
  });

  it("com juros de atraso", () => {
    const b = getLoanOutstandingBreakdown({ loan: makeLoan({ remainingAmount: 2100 }), payments: [], lateInterest: 30 });
    const p = buildLoanSummaryPresentation(b);
    expect(sumSummable(p)).toBe(2130);
    expect(p.total).toBe(b.payoffTotal);
  });

  it("com multa e juros de atraso", () => {
    const b = getLoanOutstandingBreakdown({
      loan: makeLoan({ remainingAmount: 2100 }),
      payments: [],
      penalty: 50,
      lateInterest: 30,
      currentInterestPending: 219.8,
    });
    const p = buildLoanSummaryPresentation(b);
    expect(sumSummable(p)).toBe(2180);
    expect(p.total).toBe(b.payoffTotal);
  });

  it("contrato quitado: tudo zero e sem linha de detalhe", () => {
    const b = getLoanOutstandingBreakdown({
      loan: makeLoan({ status: "paid", remainingAmount: 0 }),
      payments: [],
      penalty: 100,
      lateInterest: 50,
      currentInterestPending: 219.8,
    });
    const p = buildLoanSummaryPresentation(b);
    expect(sumSummable(p)).toBe(0);
    expect(p.total).toBe(0);
    expect(p.lines.some((l) => l.key === "current-interest")).toBe(false);
  });

  it("nunca exibe juros do ciclo como linha somável", () => {
    for (const rem of [0.01, 500, 2100, 99999]) {
      const b = getLoanOutstandingBreakdown({
        loan: makeLoan({ remainingAmount: rem }),
        payments: [],
        currentInterestPending: 219.8,
        penalty: 10,
        lateInterest: 5,
      });
      const p = buildLoanSummaryPresentation(b);
      expect(sumSummable(p)).toBeCloseTo(b.payoffTotal, 2);
    }
  });
});
