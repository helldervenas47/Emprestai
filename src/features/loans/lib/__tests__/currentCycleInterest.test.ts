import { describe, it, expect } from "vitest";
import { getCurrentCycleInterest, getCurrentInstallmentNumber } from "../currentCycleInterest";
import { buildInstallmentBreakdown } from "@/features/financial/lib/interestAllocation";
import type { Loan, Payment } from "@/types/loan";

const loanBase = (over: Partial<Loan> = {}): Loan => ({
  id: "loan-1",
  clientId: "c1",
  amount: 1400,
  interestRate: 50,
  installments: 3,
  paidInstallments: 0,
  status: "active",
  dueDate: "2025-01-10",
  createdAt: "2025-01-01",
  ...(over as any),
} as Loan);

const pay = (over: Partial<Payment>): Payment => ({
  id: Math.random().toString(36).slice(2),
  loanId: "loan-1",
  amount: 0,
  date: "2025-01-10",
  installmentNumber: 1,
  ...(over as any),
} as Payment);

describe("getCurrentCycleInterest — contratos parcelados", () => {
  it("3 parcelas: juros do ciclo = juros da parcela 1, nunca o total do contrato", () => {
    const r = getCurrentCycleInterest({ loan: loanBase(), payments: [] });
    expect(r.totalContractInterest).toBe(700);
    expect(r.currentInstallmentNumber).toBe(1);
    expect(r.currentInterestPending).toBeCloseTo(233.33, 2);
    expect(r.currentInterestPending).not.toBe(700);
  });

  it("2 parcelas: juros totais 400 → 200 por parcela", () => {
    const loan = loanBase({ amount: 1000, interestRate: 40, installments: 2 });
    const r = getCurrentCycleInterest({ loan, payments: [] });
    expect(r.totalContractInterest).toBe(400);
    expect(r.currentInterestPending).toBe(200);
  });

  it("centavos distribuídos: soma das parcelas fecha exatamente o juro total", () => {
    const schedule = buildInstallmentBreakdown({ amount: 1400, interestRate: 50, installments: 3 });
    const sum = schedule.reduce((s, e) => s + e.interest, 0);
    expect(Math.round(sum * 100) / 100).toBe(700);
    expect(schedule.map((e) => e.interest).every((v) => Math.abs(v - 233.33) <= 0.01)).toBe(true);
  });

  it("parcela parcialmente paga: desconta apenas os juros pagos nela", () => {
    const payments = [pay({
      installmentNumber: -1,
      amount: 100,
      metadata: { interest_amount: 100, principal_amount: 0, installment_number: 1 },
    })];
    const r = getCurrentCycleInterest({ loan: loanBase(), payments });
    expect(r.currentInterestPaid).toBe(100);
    expect(r.currentInterestPending).toBeCloseTo(133.33, 2);
  });

  it("primeira parcela paga → usa os juros da segunda", () => {
    const payments = [pay({ installmentNumber: 1, amount: 700 })];
    const loan = loanBase({ paidInstallments: 1 });
    const r = getCurrentCycleInterest({ loan, payments });
    expect(r.currentInstallmentNumber).toBe(2);
    expect(r.currentInterestPending).toBeGreaterThan(0);
  });

  it("duas parcelas pagas → usa a terceira", () => {
    const payments = [
      pay({ installmentNumber: 1, amount: 700 }),
      pay({ installmentNumber: 2, amount: 700 }),
    ];
    const loan = loanBase({ paidInstallments: 2 });
    const r = getCurrentCycleInterest({ loan, payments });
    expect(r.currentInstallmentNumber).toBe(3);
  });

  it("contrato quitado: tudo zero", () => {
    const r = getCurrentCycleInterest({ loan: loanBase({ status: "paid" }), payments: [] });
    expect(r.currentInstallmentInterest).toBe(0);
    expect(r.currentInterestPending).toBe(0);
  });

  it("cronograma com valores diferentes é a fonte prioritária", () => {
    const schedules = [
      { loanId: "loan-1", installmentNumber: 1, dueDate: "2025-01-10", amount: 900 },
      { loanId: "loan-1", installmentNumber: 2, dueDate: "2025-02-10", amount: 600 },
      { loanId: "loan-1", installmentNumber: 3, dueDate: "2025-03-10", amount: 600 },
    ];
    const r = getCurrentCycleInterest({ loan: loanBase(), payments: [], schedules });
    expect(r.source).toBe("schedule");
    // 700 * (900/2100) = 300
    expect(r.currentInterestPending).toBeCloseTo(300, 2);
  });

  it("identificação da parcela vigente respeita o cronograma pendente", () => {
    const schedules = [
      { loanId: "loan-1", installmentNumber: 1, dueDate: "2025-01-10", amount: 700 },
      { loanId: "loan-1", installmentNumber: 2, dueDate: "2025-02-10", amount: 700 },
      { loanId: "loan-1", installmentNumber: 3, dueDate: "2025-03-10", amount: 700 },
    ];
    const payments = [pay({ installmentNumber: 1, amount: 700 })];
    expect(getCurrentInstallmentNumber(loanBase(), payments, schedules)).toBe(2);
  });
});

describe("getCurrentCycleInterest — parcela única", () => {
  it("mantém o ciclo integral, sem divisão", () => {
    const loan = loanBase({ installments: 1 });
    const r = getCurrentCycleInterest({ loan, payments: [] });
    expect(r.source).toBe("single");
    expect(r.currentInterestPending).toBe(700);
  });

  it("respeita customInterestValue", () => {
    const loan = loanBase({ installments: 1, customInterestValue: 250 } as any);
    const r = getCurrentCycleInterest({ loan, payments: [] });
    expect(r.currentInterestPending).toBe(250);
  });
});
