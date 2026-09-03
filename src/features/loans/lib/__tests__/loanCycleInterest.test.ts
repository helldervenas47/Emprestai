/**
 * Regras dos "juros do ciclo atual" (currentInterestPending) x juros contratuais
 * restantes (contractualInterestRemaining), em todas as modalidades.
 *
 * Invariantes garantidas:
 *  - a linha "(incluídos)" só existe quando currentInterestPending <= contractualInterestRemaining;
 *  - quando não cabe, o valor vira nota informativa e NUNCA entra na soma;
 *  - as linhas somáveis fecham exatamente o total em todos os cenários.
 */
import { describe, it, expect } from "vitest";
import {
  getLoanOutstandingBreakdown,
  buildLoanSummaryPresentation,
} from "@/features/loans/lib/loanOutstanding";
import type { Loan, Payment } from "@/types/loan";

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

const pay = (over: Partial<Payment>): Payment => ({
  id: over.id ?? "p1",
  loanId: "L1",
  amount: 0,
  date: "2026-01-15",
  installmentNumber: 1,
  ...over,
});

const sumSummable = (p: ReturnType<typeof buildLoanSummaryPresentation>) =>
  Math.round(p.lines.filter((l) => l.summable).reduce((s, l) => s + l.value, 0) * 100) / 100;

const includedLine = (p: ReturnType<typeof buildLoanSummaryPresentation>) =>
  p.lines.find((l) => l.key === "current-interest");
const noteLine = (p: ReturnType<typeof buildLoanSummaryPresentation>) =>
  p.notes.find((n) => n.key === "current-interest-independent");

describe("juros do ciclo atual x juros restantes", () => {
  it("caso reportado: ciclo 838 > juros restantes 558,67 → cobrança independente, nunca '(incluídos)'", () => {
    const b = getLoanOutstandingBreakdown({
      loan: makeLoan({ remainingAmount: 1492, customInterestValue: 838 }),
      payments: [pay({ id: "a1", amount: 466.67, installmentNumber: -3 })],
      currentInterestPending: 838,
    });
    expect(b.contractualInterestRemaining).toBeCloseTo(558.67, 2);
    expect(b.currentInterestIncluded).toBe(false);
    const p = buildLoanSummaryPresentation(b);
    expect(includedLine(p)).toBeUndefined();
    expect(noteLine(p)?.value).toBe(838);
    expect(sumSummable(p)).toBeCloseTo(b.payoffTotal, 2);
  });

  it("cenário 1 — sem pagamentos: ciclo cabe nos juros restantes e é marcado como incluído", () => {
    const b = getLoanOutstandingBreakdown({
      loan: makeLoan({ remainingAmount: 2100 }),
      payments: [],
      currentInterestPending: 700,
    });
    expect(b.principalRemaining).toBe(1400);
    expect(b.contractualInterestRemaining).toBe(700);
    expect(b.currentInterestIncluded).toBe(true);
    const p = buildLoanSummaryPresentation(b);
    expect(includedLine(p)?.summable).toBe(false);
    expect(noteLine(p)).toBeUndefined();
    expect(sumSummable(p)).toBe(2100);
  });

  it("cenário 2 — pagou somente juros: ciclo zerado não gera linha nem nota", () => {
    const b = getLoanOutstandingBreakdown({
      loan: makeLoan({ remainingAmount: 2100 }),
      payments: [pay({ id: "j1", amount: 700, installmentNumber: 0 })],
      currentInterestPending: 0,
    });
    expect(b.principalRemaining).toBe(1400);
    const p = buildLoanSummaryPresentation(b);
    expect(includedLine(p)).toBeUndefined();
    expect(noteLine(p)).toBeUndefined();
    expect(sumSummable(p)).toBe(p.total);
  });

  it("cenário 3 — amortização reduz principal e o ciclo passa a ser cobrança independente", () => {
    const b = getLoanOutstandingBreakdown({
      loan: makeLoan({ remainingAmount: 1700 }),
      payments: [pay({ id: "a2", amount: 400, installmentNumber: -3 })],
      currentInterestPending: 700,
    });
    expect(b.principalRemaining).toBe(1000);
    expect(b.contractualInterestRemaining).toBe(700);
    expect(b.currentInterestIncluded).toBe(true);
    const b2 = getLoanOutstandingBreakdown({
      loan: makeLoan({ remainingAmount: 1200 }),
      payments: [pay({ id: "a3", amount: 900, installmentNumber: -3 })],
      currentInterestPending: 700,
    });
    expect(b2.contractualInterestRemaining).toBeCloseTo(700, 2);
    expect(b2.currentInterestIncluded).toBe(true);
    const b3 = getLoanOutstandingBreakdown({
      loan: makeLoan({ remainingAmount: 900 }),
      payments: [pay({ id: "a4", amount: 500, installmentNumber: -3 })],
      currentInterestPending: 700,
    });
    expect(b3.contractualInterestRemaining).toBeLessThan(700);
    expect(b3.currentInterestIncluded).toBe(false);
    expect(noteLine(buildLoanSummaryPresentation(b3))?.value).toBe(700);
  });

  it("cenário 4 — contrato parcelado: soma fecha e nunca exibe '(incluídos)' inválido", () => {
    const loan = makeLoan({ amount: 1000, interestRate: 20, installments: 4, paidInstallments: 1, remainingAmount: 900 });
    const b = getLoanOutstandingBreakdown({
      loan,
      payments: [pay({ id: "r1", amount: 300, installmentNumber: 1 })],
      currentInterestPending: 200,
    });
    const p = buildLoanSummaryPresentation(b);
    expect(sumSummable(p)).toBeCloseTo(b.payoffTotal, 2);
    if (includedLine(p)) {
      expect(b.currentInterestPending).toBeLessThanOrEqual(b.contractualInterestRemaining + 0.01);
    }
  });

  it("cenário 5 — contrato atrasado: multa e juros de atraso somam, ciclo fora da soma", () => {
    const b = getLoanOutstandingBreakdown({
      loan: makeLoan({ remainingAmount: 1492 }),
      payments: [pay({ id: "a5", amount: 466.67, installmentNumber: -3 })],
      currentInterestPending: 838,
      penalty: 50,
      lateInterest: 30,
    });
    const p = buildLoanSummaryPresentation(b);
    expect(sumSummable(p)).toBeCloseTo(1492 + 80, 2);
    expect(p.total).toBeCloseTo(b.payoffTotal, 2);
    expect(includedLine(p)).toBeUndefined();
  });

  it("todas as modalidades: invariantes de soma e de rótulo", () => {
    const types: Loan["interestType"][] = ["Diário", "Semanal", "Quinzenal", "Mensal"];
    for (const interestType of types) {
      for (const installments of [1, 4, 12]) {
        for (const remainingAmount of [0.01, 500, 1492, 2100, 99999]) {
          for (const cycle of [0, 50, 838, 5000]) {
            const loan = makeLoan({ interestType, installments, remainingAmount });
            const b = getLoanOutstandingBreakdown({
              loan,
              payments: [pay({ id: "x", amount: 300, installmentNumber: -3 })],
              currentInterestPending: cycle,
              penalty: 10,
              lateInterest: 5,
            });
            const p = buildLoanSummaryPresentation(b);
            // A soma das linhas somáveis fecha sempre o total exibido.
            expect(sumSummable(p)).toBeCloseTo(p.total, 2);
            expect(p.total).toBeCloseTo(b.payoffTotal, 2);
            // "(incluídos)" só quando realmente cabe nos juros restantes.
            if (includedLine(p)) {
              expect(b.currentInterestPending).toBeLessThanOrEqual(b.contractualInterestRemaining + 0.01);
            }
            if (noteLine(p)) {
              expect(b.currentInterestPending).toBeGreaterThan(b.contractualInterestRemaining);
            }
          }
        }
      }
    }
  });

  it("contrato quitado: sem linha e sem nota de ciclo", () => {
    const b = getLoanOutstandingBreakdown({
      loan: makeLoan({ status: "paid", remainingAmount: 0 }),
      payments: [],
      currentInterestPending: 838,
    });
    expect(b.currentInterestPending).toBe(0);
    expect(b.currentInterestIncluded).toBe(false);
    const p = buildLoanSummaryPresentation(b);
    expect(includedLine(p)).toBeUndefined();
    expect(noteLine(p)).toBeUndefined();
    expect(p.total).toBe(0);
  });
});
