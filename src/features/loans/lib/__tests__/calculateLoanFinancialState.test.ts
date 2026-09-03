import { describe, it, expect } from "vitest";
import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { roundCurrency, distributeCurrency } from "@/lib/money";
import {
  calculateLoanFinancialState,
  buildOfficialInstallmentPlan,
} from "@/features/loans/lib/calculateLoanFinancialState";
import { compareLoanFinancialCalculations, financialDiffToCsv } from "@/features/loans/lib/financialCalculationDiff";

const TODAY = "2026-01-15";

function makeLoan(over: Partial<Loan> = {}): Loan {
  return {
    id: "L1",
    borrowerName: "Cliente Teste",
    amount: 1400,
    interestRate: 50,
    interestType: "Mensal",
    paymentType: "Mensal",
    startDate: "2025-12-01",
    dueDate: "2026-02-01",
    installments: 3,
    paidInstallments: 0,
    status: "active",
    createdAt: "2025-12-01",
    ...over,
  };
}

function pay(over: Partial<Payment> & { amount: number }): Payment {
  return {
    id: over.id ?? `p-${Math.random().toString(36).slice(2)}`,
    loanId: "L1",
    date: "2026-01-05",
    installmentNumber: 1,
    ...over,
  } as Payment;
}

function schedules(loanId: string, amounts: number[], dates?: string[]): InstallmentSchedule[] {
  return amounts.map((amount, i) => ({
    loanId,
    installmentNumber: i + 1,
    amount,
    dueDate: dates?.[i] ?? `2026-0${i + 2}-01`,
  }));
}

describe("roundCurrency / distributeCurrency", () => {
  it("arredonda para duas casas de forma estável", () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(233.33333)).toBe(233.33);
    expect(roundCurrency(NaN)).toBe(0);
  });

  it("distribui centavos fechando o total exato", () => {
    const parts = distributeCurrency(700, 3);
    expect(parts).toEqual([233.34, 233.33, 233.33]);
    expect(roundCurrency(parts.reduce((s, v) => s + v, 0))).toBe(700);
  });

  it("distribui proporcionalmente a pesos", () => {
    const parts = distributeCurrency(100, 2, [300, 200]);
    expect(roundCurrency(parts.reduce((s, v) => s + v, 0))).toBe(100);
    expect(parts[0]).toBeGreaterThan(parts[1]);
  });
});

describe("plano oficial de parcelas", () => {
  it("distribui os juros do contrato entre as parcelas fechando o total", () => {
    const loan = makeLoan();
    const { plan } = buildOfficialInstallmentPlan(loan, []);
    expect(plan).toHaveLength(3);
    expect(roundCurrency(plan.reduce((s, e) => s + e.interest, 0))).toBe(700);
    expect(roundCurrency(plan.reduce((s, e) => s + e.principal, 0))).toBe(1400);
    expect(plan.map((e) => e.interest)).toEqual([233.34, 233.33, 233.33]);
  });

  it("respeita cronograma com valores diferentes", () => {
    const loan = makeLoan({ installments: 2, amount: 1000, interestRate: 20 });
    const { plan } = buildOfficialInstallmentPlan(loan, schedules("L1", [700, 500]));
    expect(roundCurrency(plan.reduce((s, e) => s + e.due, 0))).toBe(1200);
    expect(roundCurrency(plan.reduce((s, e) => s + e.interest, 0))).toBe(200);
    expect(plan[0].interest).toBeGreaterThan(plan[1].interest);
  });

  it("honra a composição principal/juros persistida no cronograma", () => {
    const loan = makeLoan({ installments: 2, amount: 1000, interestRate: 20 });
    const s = schedules("L1", [600, 600]).map((x, i) => ({
      ...x,
      interestAmount: i === 0 ? 150 : 50,
      principalAmount: i === 0 ? 450 : 550,
    })) as InstallmentSchedule[];
    const { plan, source } = buildOfficialInstallmentPlan(loan, s);
    expect(source).toBe("schedule_persisted_split");
    expect(plan[0].interest).toBe(150);
    expect(plan[1].interest).toBe(50);
  });
});

describe("calculateLoanFinancialState — contrato parcelado R$ 1.400 / total R$ 2.100", () => {
  const loan = makeLoan();

  it("sem pagamentos: principal e juros integrais e parcela atual = 1", () => {
    const st = calculateLoanFinancialState({ loan, payments: [], calculationDate: TODAY });
    expect(st.principalRemaining).toBe(1400);
    expect(st.contractualInterestTotal).toBe(700);
    expect(st.contractualInterestRemaining).toBe(700);
    expect(st.contractualBalanceRemaining).toBe(2100);
    expect(st.currentInstallmentNumber).toBe(1);
    expect(st.currentInstallmentInterest).toBe(233.34);
    expect(st.currentInstallmentInterest).toBeLessThan(st.contractualInterestRemaining);
    expect(st.payoffAmount).toBe(2100);
  });

  it("juros da parcela atual NUNCA usa o juro total do contrato", () => {
    const st = calculateLoanFinancialState({ loan, payments: [], calculationDate: TODAY });
    expect(st.currentInstallmentInterest).not.toBe(700);
  });

  it("primeira parcela quitada avança para a parcela 2", () => {
    const st = calculateLoanFinancialState({
      loan,
      payments: [pay({ amount: 700, installmentNumber: 1 })],
      installmentSchedules: schedules("L1", [700, 700, 700]),
      calculationDate: TODAY,
    });
    expect(st.currentInstallmentNumber).toBe(2);
    expect(st.principalPaid).toBe(roundCurrency(700 - 233.34));
    expect(st.contractualInterestPaid).toBe(233.34);
    expect(st.contractualBalanceRemaining).toBe(1400);
  });

  it("parcela parcialmente paga NÃO é considerada quitada", () => {
    const st = calculateLoanFinancialState({
      loan,
      payments: [pay({ amount: 400, installmentNumber: 1 })],
      installmentSchedules: schedules("L1", [700, 700, 700]),
      calculationDate: TODAY,
    });
    expect(st.currentInstallmentNumber).toBe(1);
    expect(st.currentInstallmentPaid).toBe(400);
    expect(st.currentInstallmentRemaining).toBe(300);
  });

  it("parcela intermediária pendente é a vigente", () => {
    const st = calculateLoanFinancialState({
      loan,
      payments: [pay({ amount: 700, installmentNumber: 1 }), pay({ amount: 700, installmentNumber: 3 })],
      installmentSchedules: schedules("L1", [700, 700, 700]),
      calculationDate: TODAY,
    });
    expect(st.currentInstallmentNumber).toBe(2);
  });

  it("amortização reduz 100% do principal e nada de juros", () => {
    const st = calculateLoanFinancialState({
      loan,
      payments: [pay({ amount: 400, installmentNumber: -3 })],
      calculationDate: TODAY,
    });
    expect(st.principalPaid).toBe(400);
    expect(st.principalRemaining).toBe(1000);
    expect(st.contractualInterestRemaining).toBe(700);
  });

  it("pagamento só de juros não reduz principal", () => {
    const st = calculateLoanFinancialState({
      loan,
      payments: [pay({ amount: 233.34, installmentNumber: 0 })],
      calculationDate: TODAY,
    });
    expect(st.principalRemaining).toBe(1400);
    expect(st.contractualInterestRemaining).toBe(roundCurrency(700 - 233.34));
  });

  it("principal restante nunca excede o principal original", () => {
    const st = calculateLoanFinancialState({
      loan,
      payments: [pay({ amount: 5000, installmentNumber: -3 })],
      calculationDate: TODAY,
    });
    expect(st.principalRemaining).toBe(0);
    expect(st.principalPaid).toBe(5000);
  });

  it("contrato quitado zera tudo", () => {
    const st = calculateLoanFinancialState({
      loan: makeLoan({ status: "paid", remainingAmount: 0 }),
      payments: [pay({ amount: 2100, installmentNumber: 3 })],
      calculationDate: TODAY,
    });
    expect(st.principalRemaining).toBe(0);
    expect(st.contractualInterestRemaining).toBe(0);
    expect(st.payoffAmount).toBe(0);
    expect(st.penaltyPending).toBe(0);
  });
});

describe("contrato de parcela única", () => {
  const loan = makeLoan({ installments: 1, amount: 1000, interestRate: 20, dueDate: "2026-01-01" });

  it("compõe juros do ciclo integral", () => {
    const st = calculateLoanFinancialState({ loan, payments: [], calculationDate: TODAY });
    expect(st.contractualInterestTotal).toBe(200);
    expect(st.currentInstallmentNumber).toBe(1);
    expect(st.currentInstallmentInterest).toBe(200);
    expect(st.contractualBalanceRemaining).toBe(1200);
  });

  it("pagamento total zera saldo", () => {
    const st = calculateLoanFinancialState({
      loan,
      payments: [pay({ amount: 1200, installmentNumber: 1 })],
      calculationDate: TODAY,
    });
    expect(st.contractualBalanceRemaining).toBe(0);
    expect(st.currentInstallmentNumber).toBeNull();
  });
});

describe("encargos de atraso", () => {
  const loan = makeLoan({
    installments: 1,
    amount: 1000,
    interestRate: 20,
    dueDate: "2026-01-10",
    penaltyValue: 50,
    lateInterestType: "fixed",
    lateInterestValue: 2,
  });

  it("aplica multa mesmo que o emprestimo nao esteja vencido, sem aplicar juros de mora", () => {
    const notOverdueLoan = makeLoan({
      installments: 1,
      amount: 1000,
      interestRate: 20,
      dueDate: "2026-01-20", // no futuro em relação a TODAY (2026-01-15)
      penaltyValue: 50,
      lateInterestType: "fixed",
      lateInterestValue: 2,
    });
    const st = calculateLoanFinancialState({ loan: notOverdueLoan, payments: [], calculationDate: TODAY });
    expect(st.daysOverdue).toBe(0);
    expect(st.penaltyApplied).toBe(50);
    expect(st.lateInterestApplied).toBe(0); // juros de atraso permanecem zerados
    expect(st.payoffAmount).toBe(roundCurrency(1200 + 50));
  });

  it("aplica multa uma vez e juros por dia", () => {
    const st = calculateLoanFinancialState({ loan, payments: [], calculationDate: TODAY });
    expect(st.daysOverdue).toBe(5);
    expect(st.penaltyApplied).toBe(50);
    expect(st.lateInterestApplied).toBe(10);
    expect(st.payoffAmount).toBe(roundCurrency(1200 + 50 + 10));
  });

  it("multa paga deixa de ficar pendente e NÃO reduz saldo contratual", () => {
    const st = calculateLoanFinancialState({
      loan,
      payments: [pay({ amount: 50, installmentNumber: -2, metadata: { kind: "penalty" } })],
      calculationDate: TODAY,
    });
    expect(st.penaltyPaid).toBe(50);
    expect(st.penaltyPending).toBe(0);
    expect(st.principalRemaining).toBe(1000);
    expect(st.contractualBalanceRemaining).toBe(1200);
  });

  it("multa parcialmente paga fica com o saldo remanescente", () => {
    const st = calculateLoanFinancialState({
      loan,
      payments: [pay({ amount: 20, installmentNumber: -2, metadata: { kind: "penalty" } })],
      calculationDate: TODAY,
    });
    expect(st.penaltyPending).toBe(30);
  });

  it("juros de atraso pagos abatem só juros de atraso", () => {
    const st = calculateLoanFinancialState({
      loan,
      payments: [pay({ amount: 6, installmentNumber: -2, metadata: { kind: "late_fee" } })],
      calculationDate: TODAY,
    });
    expect(st.lateInterestPaid).toBe(6);
    expect(st.lateInterestPending).toBe(4);
    expect(st.contractualBalanceRemaining).toBe(1200);
  });

  it("base de juros de atraso configurável (parcela vencida)", () => {
    const parcelado = makeLoan({
      installments: 3,
      penaltyValue: 0,
      lateInterestType: "percentage",
      lateInterestValue: 1,
      dueDate: "2026-01-10",
    });
    const s = schedules("L1", [700, 700, 700], ["2026-01-10", "2026-02-10", "2026-03-10"]);
    const balanceBased = calculateLoanFinancialState({
      loan: parcelado, payments: [], installmentSchedules: s, calculationDate: TODAY,
    });
    const installmentBased = calculateLoanFinancialState({
      loan: parcelado, payments: [], installmentSchedules: s, calculationDate: TODAY,
      lateInterestBase: "overdue_installments",
    });
    expect(balanceBased.lateInterestApplied).toBeGreaterThan(installmentBased.lateInterestApplied);
    expect(installmentBased.overdueAmount).toBe(700);
  });
});

describe("registros legados e validação de cache", () => {
  it("honra composição persistida no metadata", () => {
    const st = calculateLoanFinancialState({
      loan: makeLoan(),
      payments: [pay({
        amount: 500,
        installmentNumber: -1,
        metadata: { allocation_version: "remaining_balance_prorata", principal_amount: 300, interest_amount: 200 },
      })],
      calculationDate: TODAY,
    });
    expect(st.principalPaid).toBe(300);
    expect(st.contractualInterestPaid).toBe(200);
    expect(st.warnings).toHaveLength(0);
  });

  it("pagamento parcial sem metadata usa a alocação oficial legada", () => {
    const st = calculateLoanFinancialState({
      loan: makeLoan(),
      payments: [pay({ amount: 500, installmentNumber: -1 })],
      calculationDate: TODAY,
    });
    expect(roundCurrency(st.principalPaid + st.contractualInterestPaid)).toBe(500);
  });

  it("remainingAmount divergente gera aviso e não é aceito cegamente", () => {
    const st = calculateLoanFinancialState({
      loan: makeLoan({ remainingAmount: 2500 }),
      payments: [],
      calculationDate: TODAY,
    });
    expect(st.contractualBalanceRemaining).toBe(2100);
    expect(st.warnings.join(" ")).toContain("remainingAmount diverge");
    expect(st.calculationSource).toContain("remainingAmount_divergent");
  });

  it("paidInstallments divergente gera aviso e o cronograma prevalece", () => {
    const st = calculateLoanFinancialState({
      loan: makeLoan({ paidInstallments: 2 }),
      payments: [],
      installmentSchedules: schedules("L1", [700, 700, 700]),
      calculationDate: TODAY,
    });
    expect(st.currentInstallmentNumber).toBe(1);
    expect(st.warnings.join(" ")).toContain("paidInstallments");
  });

  it("cronograma ausente cai na divisão uniforme validada", () => {
    const st = calculateLoanFinancialState({ loan: makeLoan(), payments: [], calculationDate: TODAY });
    expect(st.calculationSource).toContain("computed_uniform_interest");
  });
});

describe("paridade entre módulos (mesma fonte)", () => {
  it("totalReceivable = payoff = principal + juros + encargos pendentes", () => {
    const loan = makeLoan({ installments: 1, amount: 1000, interestRate: 20, dueDate: "2026-01-05", penaltyValue: 30 });
    const st = calculateLoanFinancialState({ loan, payments: [], calculationDate: TODAY });
    const expected = roundCurrency(
      st.principalRemaining + st.contractualInterestRemaining + st.penaltyPending + st.lateInterestPending,
    );
    expect(st.totalReceivable).toBeCloseTo(expected, 2);
    expect(st.payoffAmount).toBeCloseTo(expected, 2);
  });
});

describe("comparador antigo × novo", () => {
  const loans = [makeLoan({ remainingAmount: 2500 })];

  it("gera relatório de divergências somente leitura", () => {
    const rows = compareLoanFinancialCalculations(loans, [], [], { calculationDate: TODAY });
    expect(rows).toHaveLength(1);
    expect(rows[0].oldTotalReceivable).toBe(2500);
    expect(rows[0].newTotalReceivable).toBe(2100);
    expect(rows[0].totalDifference).toBe(-400);
    expect(rows[0].warnings.length).toBeGreaterThan(0);
    // Contratos idênticos não são alterados por nenhuma referência do input.
    expect(loans[0].remainingAmount).toBe(2500);
  });

  it("exporta CSV com cabeçalho", () => {
    const csv = financialDiffToCsv(compareLoanFinancialCalculations(loans, [], [], { calculationDate: TODAY }));
    expect(csv.split("\n")[0]).toContain("loanId;clientName");
    expect(csv.split("\n")).toHaveLength(2);
  });

  it("filtra apenas divergentes", () => {
    const ok = compareLoanFinancialCalculations(
      [makeLoan({ id: "L2", installments: 1, amount: 1000, interestRate: 20, remainingAmount: 1200, dueDate: "2026-12-01" })],
      [],
      [],
      { calculationDate: TODAY, onlyDivergent: true },
    );
    expect(ok).toHaveLength(0);
  });
});
