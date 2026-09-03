/**
 * Testes da camada de agregação unificada (Fase 3).
 *
 * Cobrem: limites de período, classificação de pagamentos, somas invioláveis,
 * separação de vendas, paridade entre módulos e cenários de regressão.
 */

import { describe, it, expect } from "vitest";
import {
  buildFinancialAggregates,
  getPeriodBounds,
  isDateInsidePeriod,
  buildFinancialReportData,
  financialReportToCsv,
  compareModuleParity,
  roundMoney,
  type AggregateLoanState,
  type AggregatePayment,
} from "@/features/financial/lib/financialAggregatesCore";
import {
  buildAppFinancialAggregates,
  buildAggregatePayments,
  periodBoundsFromRange,
} from "@/features/financial/lib/financialAggregates";
import { FINANCIAL_METRICS, listMetricAmbiguities } from "@/features/financial/lib/financialMetricsMatrix";
import type { Loan, Payment } from "@/types/loan";

const state = (over: Partial<AggregateLoanState> = {}): AggregateLoanState => ({
  loanId: "l1",
  isActive: true,
  startDateIso: "2026-07-05",
  dueDateIso: "2026-08-05",
  principal: 1400,
  principalRemaining: 1400,
  contractualInterestTotal: 700,
  contractualInterestRemaining: 700,
  penaltyPending: 0,
  lateInterestPending: 0,
  totalReceivable: 2100,
  overdueAmount: 0,
  ...over,
});

const pay = (over: Partial<AggregatePayment> = {}): AggregatePayment => ({
  id: "p1",
  loanId: "l1",
  dateIso: "2026-07-10",
  amount: 300,
  principalAmount: 0,
  interestAmount: 300,
  penaltyAmount: 0,
  lateInterestAmount: 0,
  ...over,
});

describe("período", () => {
  it("mês: início e fim inclusivos", () => {
    const b = getPeriodBounds("month", "2026-02-15");
    expect(b.startIso).toBe("2026-02-01");
    expect(b.endIso).toBe("2026-02-28");
    expect(isDateInsidePeriod("2026-02-01", b)).toBe(true);
    expect(isDateInsidePeriod("2026-02-28", b)).toBe(true);
    expect(isDateInsidePeriod("2026-03-01", b)).toBe(false);
  });

  it("semana começa no domingo (regra atual do Dashboard)", () => {
    const b = getPeriodBounds("week", "2026-07-22"); // quarta
    expect(b.startIso).toBe("2026-07-19");
    expect(b.endIso).toBe("2026-07-25");
  });

  it("dia e ano", () => {
    expect(getPeriodBounds("day", "2026-07-26").endIso).toBe("2026-07-26");
    expect(getPeriodBounds("year", "2026-07-26")).toMatchObject({ startIso: "2026-01-01", endIso: "2026-12-31" });
  });

  it("sem período informado, tudo entra", () => {
    expect(isDateInsidePeriod("1999-01-01", null)).toBe(true);
  });
});

describe("buildFinancialAggregates", () => {
  const period = getPeriodBounds("month", "2026-07-01");

  it("soma capital ativo, juros e total a receber apenas de contratos ativos", () => {
    const res = buildFinancialAggregates({
      loanStates: [
        state(),
        state({ loanId: "l2", isActive: false, principalRemaining: 0, contractualInterestRemaining: 0, totalReceivable: 0 }),
      ],
      payments: [],
      period,
    });
    expect(res.contractsTotal).toBe(2);
    expect(res.contractsActive).toBe(1);
    expect(res.contractsPaid).toBe(1);
    expect(res.principalRemaining).toBe(1400);
    expect(res.contractualInterestRemaining).toBe(700);
    expect(res.totalReceivable).toBe(2100);
  });

  it("total a receber = principal + juros + multa + juros de atraso", () => {
    const res = buildFinancialAggregates({
      loanStates: [state({ penaltyPending: 50, lateInterestPending: 30, totalReceivable: 2180 })],
      payments: [],
      period,
    });
    expect(
      roundMoney(res.principalRemaining + res.contractualInterestRemaining + res.penaltyPending + res.lateInterestPending),
    ).toBe(res.totalReceivable);
    expect(res.interestAndFeesPending).toBe(780);
  });

  it("recebido no período respeita as duas bordas", () => {
    const res = buildFinancialAggregates({
      loanStates: [state()],
      payments: [
        pay({ id: "a", dateIso: "2026-07-01", amount: 100, interestAmount: 100 }),
        pay({ id: "b", dateIso: "2026-07-31", amount: 200, interestAmount: 200 }),
        pay({ id: "c", dateIso: "2026-08-01", amount: 999, interestAmount: 999 }),
      ],
      period,
    });
    expect(res.receivedInPeriod.total).toBe(300);
    expect(res.receivedAllTime.total).toBe(1299);
  });

  it("lucro realizado = juros + multa + juros de atraso recebidos", () => {
    const res = buildFinancialAggregates({
      loanStates: [state()],
      payments: [pay({ amount: 400, principalAmount: 100, interestAmount: 250, penaltyAmount: 30, lateInterestAmount: 20 })],
      period,
    });
    expect(res.realizedProfitInPeriod).toBe(300);
    expect(res.receivedInPeriod.principal).toBe(100);
  });

  it("vendas ficam separadas e só somam em revenueInPeriodWithSales", () => {
    const res = buildFinancialAggregates({
      loanStates: [state()],
      payments: [pay({ amount: 500, interestAmount: 500 })],
      saleReceipts: [{ id: "s1", dateIso: "2026-07-12", amount: 250 }],
      period,
    });
    expect(res.receivedInPeriod.total).toBe(500);
    expect(res.salesReceivedInPeriod).toBe(250);
    expect(res.revenueInPeriodWithSales).toBe(750);
  });

  it("emprestado no período usa a data de início do contrato", () => {
    const res = buildFinancialAggregates({
      loanStates: [state(), state({ loanId: "l3", startDateIso: "2026-06-30" })],
      payments: [],
      period,
    });
    expect(res.contractsStartedInPeriod).toBe(1);
    expect(res.principalLentInPeriod).toBe(1400);
  });

  it("contrato duplicado gera aviso e não é somado duas vezes", () => {
    const res = buildFinancialAggregates({ loanStates: [state(), state()], payments: [], period });
    expect(res.contractsTotal).toBe(1);
    expect(res.principalRemaining).toBe(1400);
    expect(res.warnings.some((w) => w.includes("duplicado"))).toBe(true);
  });

  it("principal restante maior que emprestado gera aviso", () => {
    const res = buildFinancialAggregates({
      loanStates: [state({ principalRemaining: 1880.2 })],
      payments: [],
      period,
    });
    expect(res.warnings.some((w) => w.includes("maior que o valor emprestado"))).toBe(true);
  });

  it("é determinístico", () => {
    const input = { loanStates: [state()], payments: [pay()], period };
    expect(buildFinancialAggregates(input)).toEqual(buildFinancialAggregates(input));
  });

  it("carteira vazia devolve zeros sem NaN", () => {
    const res = buildFinancialAggregates({ loanStates: [], payments: [], period });
    expect(res.totalReceivable).toBe(0);
    expect(res.receivedInPeriod.total).toBe(0);
    expect(Number.isNaN(res.realizedProfitInPeriod)).toBe(false);
  });
});

describe("relatório e paridade", () => {
  it("DTO de relatório expõe as linhas oficiais e exporta CSV", () => {
    const res = buildFinancialAggregates({ loanStates: [state()], payments: [pay()], period: getPeriodBounds("month", "2026-07-01") });
    const report = buildFinancialReportData(res, { title: "Teste" });
    expect(report.rows.find((r) => r.key === "totalReceivable")?.value).toBe(2100);
    const csv = financialReportToCsv(report);
    expect(csv.split("\n")[0]).toContain("indicador");
    expect(csv).toContain("totalReceivable");
  });

  it("comparador acusa divergência acima de 1 centavo", () => {
    const ok = compareModuleParity({ a: 100 }, { a: 100.005 });
    const bad = compareModuleParity({ a: 100 }, { a: 100.5 });
    expect(ok.ok).toBe(true);
    expect(bad.ok).toBe(false);
    expect(bad.rows[0].difference).toBe(0.5);
  });
});

describe("matriz de métricas", () => {
  it("todas as métricas têm definição, fórmula e consumidores", () => {
    for (const metric of FINANCIAL_METRICS) {
      expect(metric.definition.length).toBeGreaterThan(10);
      expect(metric.formula.length).toBeGreaterThan(3);
      expect(metric.consumers.length).toBeGreaterThan(0);
    }
    expect(listMetricAmbiguities().length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------------- */

const loan = (over: Partial<Loan> = {}): Loan => ({
  id: "l1",
  borrowerName: "Cliente",
  borrowerId: "c1",
  amount: 1400,
  interestRate: 50,
  installments: 1,
  installmentValue: 2100,
  startDate: "2026-07-01",
  dueDate: "2026-08-01",
  status: "active",
  paidInstallments: 0,
  remainingAmount: 2100,
  ...(over as any),
} as Loan);

const payment = (over: Partial<Payment> = {}): Payment => ({
  id: "p1",
  loanId: "l1",
  amount: 700,
  date: "2026-07-15",
  installmentNumber: 0,
  ...(over as any),
} as Payment);

describe("classificação de pagamentos do app", () => {
  it("juros avulsos = 100% juros; amortização = 100% principal", () => {
    const rows = buildAggregatePayments([loan()], [
      payment({ id: "a", installmentNumber: 0, amount: 700 }),
      payment({ id: "b", installmentNumber: -3, amount: 400 }),
    ]);
    const a = rows.find((r) => r.id === "a")!;
    const b = rows.find((r) => r.id === "b")!;
    expect(a.interestAmount).toBe(700);
    expect(a.principalAmount).toBe(0);
    expect(b.principalAmount).toBe(400);
    expect(b.interestAmount).toBe(0);
  });

  it("metadata persistida tem prioridade absoluta", () => {
    const rows = buildAggregatePayments([loan()], [
      payment({
        id: "m",
        installmentNumber: -1,
        amount: 500,
        metadata: { interest_amount: 120, principal_amount: 330, penalty_amount: 30, late_interest_amount: 20 },
      } as any),
    ]);
    expect(rows[0]).toMatchObject({ interestAmount: 120, principalAmount: 330, penaltyAmount: 30, lateInterestAmount: 20 });
  });

  it("nenhuma alocação fica negativa", () => {
    const rows = buildAggregatePayments([loan()], [payment({ id: "z", amount: 0, installmentNumber: -1 })]);
    expect(rows[0].interestAmount).toBeGreaterThanOrEqual(0);
    expect(rows[0].principalAmount).toBeGreaterThanOrEqual(0);
  });
});

describe("buildAppFinancialAggregates (integração)", () => {
  const range = { start: new Date(2026, 6, 1), end: new Date(2026, 6, 31), label: "jul/26" };

  it("contrato sem pagamentos: principal restante = emprestado", () => {
    const res = buildAppFinancialAggregates({
      loans: [loan()],
      payments: [],
      period: periodBoundsFromRange(range),
      calculationDate: "2026-07-20",
    });
    expect(res.principalRemaining).toBe(1400);
    expect(res.totalReceivable).toBeGreaterThanOrEqual(2100);
  });

  it("principal restante nunca excede o valor emprestado", () => {
    const res = buildAppFinancialAggregates({
      loans: [loan({ remainingAmount: 1880.2 })],
      payments: [payment({ amount: 219.8 })],
      period: periodBoundsFromRange(range),
      calculationDate: "2026-07-20",
    });
    expect(res.principalRemaining).toBeLessThanOrEqual(1400);
  });

  it("amortização reduz o principal restante", () => {
    const res = buildAppFinancialAggregates({
      loans: [loan()],
      payments: [payment({ id: "am", installmentNumber: -3, amount: 400 })],
      period: periodBoundsFromRange(range),
      calculationDate: "2026-07-20",
    });
    expect(res.principalRemaining).toBeLessThanOrEqual(1000.01);
    expect(res.receivedInPeriod.principal).toBe(400);
  });

  it("contrato quitado não entra na carteira ativa", () => {
    const res = buildAppFinancialAggregates({
      loans: [loan({ status: "paid", remainingAmount: 0, paidInstallments: 1 })],
      payments: [payment({ id: "q", installmentNumber: 1, amount: 2100 })],
      period: periodBoundsFromRange(range),
      calculationDate: "2026-07-20",
    });
    expect(res.contractsActive).toBe(0);
    expect(res.totalReceivable).toBe(0);
    expect(res.receivedInPeriod.total).toBe(2100);
  });
});
