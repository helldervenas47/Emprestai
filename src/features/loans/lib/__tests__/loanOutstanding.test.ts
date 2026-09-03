import { describe, it, expect } from "vitest";
import { getLoanOutstandingBreakdown, getPrincipalPaid } from "@/features/loans/lib/loanOutstanding";
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

describe("getLoanOutstandingBreakdown", () => {
  it("caso principal: contrato de R$ 1.400 com saldo contratual 2.100 e juros pendentes 219,80", () => {
    const loan = makeLoan({ remainingAmount: 2100 });
    const b = getLoanOutstandingBreakdown({ loan, payments: [], currentInterestPending: 219.8 });
    expect(b.principalRemaining).toBe(1400);
    expect(b.principalRemaining).not.toBeCloseTo(1880.2, 2);
    expect(b.principalRemaining).toBeLessThanOrEqual(loan.amount);
    expect(b.contractualBalanceRemaining).toBe(2100);
    expect(b.contractualInterestRemaining).toBe(700);
    expect(b.currentInterestPending).toBe(219.8);
    expect(b.payoffTotal).toBe(2100);
  });

  it("empréstimo sem pagamentos: principal restante = valor emprestado", () => {
    const b = getLoanOutstandingBreakdown({ loan: makeLoan(), payments: [] });
    expect(b.principalRemaining).toBe(1400);
    expect(b.principalPaid).toBe(0);
  });

  it("pagamento apenas de juros (0) não reduz o principal", () => {
    const loan = makeLoan({ remainingAmount: 2100 });
    const payments = [pay({ id: "j1", amount: 700, installmentNumber: 0 })];
    expect(getPrincipalPaid(loan, payments)).toBe(0);
    expect(getLoanOutstandingBreakdown({ loan, payments }).principalRemaining).toBe(1400);
  });

  it("juros avulsos (-2) também não reduzem o principal", () => {
    const loan = makeLoan({ remainingAmount: 2100 });
    const payments = [pay({ id: "j2", amount: 300, installmentNumber: -2 })];
    expect(getPrincipalPaid(loan, payments)).toBe(0);
  });

  it("amortização de R$ 300 reduz o principal para R$ 1.100", () => {
    const loan = makeLoan({ remainingAmount: 1800 });
    const payments = [pay({ id: "a1", amount: 300, installmentNumber: -3 })];
    const b = getLoanOutstandingBreakdown({ loan, payments });
    expect(b.principalPaid).toBe(300);
    expect(b.principalRemaining).toBe(1100);
  });

  it("pagamento parcial com alocação persistida reduz apenas o principal alocado", () => {
    const loan = makeLoan({ remainingAmount: 1900 });
    const payments = [
      pay({
        id: "pp",
        amount: 200,
        installmentNumber: -1,
        metadata: {
          allocation_version: "remaining_balance_prorata",
          principal_amount: 120,
          interest_amount: 80,
        } as any,
      }),
    ];
    expect(getPrincipalPaid(loan, payments)).toBe(120);
    expect(getLoanOutstandingBreakdown({ loan, payments }).principalRemaining).toBe(1280);
  });

  it("multa e juros de atraso nunca entram no principal", () => {
    const loan = makeLoan({ remainingAmount: 2100, penaltyValue: 50 });
    const payments = [pay({ id: "f1", amount: 150, installmentNumber: 0, metadata: { kind: "late_fee" } as any })];
    const b = getLoanOutstandingBreakdown({ loan, payments, penalty: 50, lateInterest: 30 });
    expect(b.principalRemaining).toBe(1400);
    expect(b.penalty).toBe(50);
    expect(b.lateInterest).toBe(30);
    expect(b.lateFees).toBe(80);
    expect(b.payoffTotal).toBe(2180);
  });

  it("contrato quitado: principal restante e saldo sugerido zerados", () => {
    const loan = makeLoan({ status: "paid", remainingAmount: 0 });
    const payments = [pay({ id: "q1", amount: 2100, installmentNumber: 1 })];
    const b = getLoanOutstandingBreakdown({ loan, payments, penalty: 100, lateInterest: 50 });
    expect(b.principalRemaining).toBe(0);
    expect(b.payoffTotal).toBe(0);
  });

  it("pagamentos acima do principal não geram valor negativo", () => {
    const loan = makeLoan({ remainingAmount: 100 });
    const payments = [pay({ id: "a2", amount: 5000, installmentNumber: -3 })];
    const b = getLoanOutstandingBreakdown({ loan, payments });
    expect(b.principalRemaining).toBeGreaterThanOrEqual(0);
    expect(b.principalRemaining).toBeLessThanOrEqual(1400);
  });

  it("parcela regular usa a divisão oficial principal/juros do cronograma", () => {
    const loan = makeLoan({ amount: 1000, interestRate: 20, installments: 4, paidInstallments: 1, remainingAmount: 900 });
    const payments = [pay({ id: "r1", amount: 300, installmentNumber: 1 })];
    const principalPaid = getPrincipalPaid(loan, payments);
    // 300 pagos com 50 de juros contratados na parcela → 250 de principal.
    expect(principalPaid).toBeCloseTo(250, 2);
    const b = getLoanOutstandingBreakdown({ loan, payments });
    expect(b.principalRemaining).toBeCloseTo(750, 2);
    expect(b.principalRemaining).toBeLessThanOrEqual(1000);
  });

  it("pagamento parcial legado (sem metadata) segue a regra juros-primeiro sem alterar histórico", () => {
    const loan = makeLoan({ amount: 1000, interestRate: 20, installments: 1, remainingAmount: 1200 });
    const payments = [pay({ id: "leg", amount: 300, installmentNumber: -1 })];
    // Legado: 200 de juros primeiro, 100 de principal.
    expect(getPrincipalPaid(loan, payments)).toBeCloseTo(100, 2);
    expect(getLoanOutstandingBreakdown({ loan, payments }).principalRemaining).toBeCloseTo(900, 2);
  });

  it("principal restante nunca ultrapassa o valor emprestado, com qualquer saldo contratual", () => {
    for (const remainingAmount of [0.01, 500, 2100, 99999]) {
      const loan = makeLoan({ remainingAmount });
      const b = getLoanOutstandingBreakdown({ loan, payments: [], currentInterestPending: 219.8 });
      expect(b.principalRemaining).toBeLessThanOrEqual(loan.amount);
      expect(b.principalRemaining).toBeGreaterThanOrEqual(0);
    }
  });
});
