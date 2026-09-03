import { describe, it, expect } from "vitest";
import {
  computeDashboardLoanTotals,
  diffDashboardLoanTotals,
} from "@/services/dashboardLoanTotalsCore";
import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";

const TODAY = "2026-07-27";
const RANGE = { start: "2026-07-01", end: "2026-07-31" };
const YEAR = { start: "2026-01-01", end: "2026-12-31" };

function loan(over: Partial<Loan> & { id: string }): Loan {
  return {
    id: over.id,
    borrowerName: "Cliente",
    amount: 1000,
    interestRate: 0,
    interestType: "simple",
    paymentType: "single",
    startDate: "2026-07-05",
    dueDate: "2026-08-05",
    installments: 1,
    paidInstallments: 0,
    status: "active",
    createdAt: "2026-07-05T00:00:00Z",
    ...over,
  } as Loan;
}

function payment(over: Partial<Payment> & { id: string; loanId: string }): Payment {
  return {
    id: over.id,
    loanId: over.loanId,
    amount: 0,
    date: "2026-07-10",
    installmentNumber: 1,
    ...over,
  } as Payment;
}

function run(loans: Loan[], payments: Payment[] = [], schedules: InstallmentSchedule[] = [], range = RANGE) {
  return computeDashboardLoanTotals({ loans, payments, schedules, today: TODAY, ...range });
}

describe("dashboard_loan_totals · paridade de cálculo", () => {
  it("ausência de dados retorna zeros", () => {
    const t = run([]);
    expect(t.emprestado).toBe(0);
    expect(t.receber).toBe(0);
    expect(t.quantidadeContratos).toBe(0);
    expect(t.taxaJurosMedia).toBe(0);
  });

  it("empréstimo simples sem juros", () => {
    const t = run([loan({ id: "l1", amount: 1000, interestRate: 0 })]);
    expect(t.emprestado).toBe(1000);
    expect(t.capitalAtivo).toBe(1000);
    expect(t.receber).toBe(1000);
    expect(t.jurosReceber).toBe(0);
    expect(t.contratosAtivos).toBe(1);
  });

  it("empréstimo com taxa 0% não entra na taxa média", () => {
    const t = run([
      loan({ id: "l1", amount: 1000, interestRate: 0 }),
      loan({ id: "l2", amount: 1000, interestRate: 20 }),
    ]);
    expect(t.taxaJurosMedia).toBe(20);
  });

  it("empréstimo com juros gera juros a receber", () => {
    const t = run([loan({ id: "l1", amount: 1000, interestRate: 20 })]);
    expect(t.receber).toBe(1200);
    expect(t.capitalAtivo).toBe(1000);
    expect(t.jurosReceber).toBe(200);
  });

  it("empréstimo com multa fixa em atraso soma multas pendentes", () => {
    const t = run([
      loan({
        id: "l1", amount: 1000, interestRate: 20,
        dueDate: "2026-07-20", penaltyValue: 50,
        lateInterestType: "fixed", lateInterestValue: 10,
      }),
    ]);
    // 7 dias de atraso × 10 + multa 50
    expect(t.multasPendentes).toBe(120);
    expect(t.receber).toBe(1320);
    expect(t.contratosAtrasados).toBe(1);
  });

  it("pagamento de parcela única segue a alocação oficial (principal primeiro)", () => {
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20 })],
      [payment({ id: "p1", loanId: "l1", amount: 600, installmentNumber: 1 })],
    );
    expect(t.totalRecebidoPeriodo).toBe(600);
    // Regra oficial (allocateInterestByPayment): em contrato de parcela única
    // o excedente sobre o principal é que vira juros — 600 < 1000 => 0 juros.
    expect(t.jurosRecebidos).toBeCloseTo(0, 2);
    expect(t.principalRecebido).toBeCloseTo(600, 2);
    expect(t.receber).toBe(600);
  });

  it("pagamento parcial legado (-1) usa juros primeiro", () => {
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20 })],
      [payment({ id: "p1", loanId: "l1", amount: 600, installmentNumber: -1 })],
    );
    expect(t.jurosRecebidos).toBeCloseTo(200, 2);
    expect(t.principalRecebido).toBeCloseTo(400, 2);
  });

  it("pagamento avulso de juros (parcela 0) conta 100% como juros", () => {
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20 })],
      [payment({ id: "p1", loanId: "l1", amount: 200, installmentNumber: 0 })],
    );
    expect(t.jurosRecebidos).toBe(200);
    expect(t.principalRecebido).toBe(0);
  });

  it("contrato quitado sai de receber e capital ativo", () => {
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20, status: "paid", paidInstallments: 1 })],
      [payment({ id: "p1", loanId: "l1", amount: 1200, installmentNumber: 1 })],
    );
    expect(t.receber).toBe(0);
    expect(t.capitalAtivo).toBe(0);
    expect(t.contratosQuitados).toBe(1);
    expect(t.totalRecebidoPeriodo).toBe(1200);
  });

  it("contrato parcelado usa parcelas em aberto e capital proporcional", () => {
    const schedules: InstallmentSchedule[] = [
      { loanId: "l1", installmentNumber: 1, dueDate: "2026-08-05", amount: 400 },
      { loanId: "l1", installmentNumber: 2, dueDate: "2026-09-05", amount: 400 },
      { loanId: "l1", installmentNumber: 3, dueDate: "2026-10-05", amount: 400 },
    ];
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20, installments: 3, paidInstallments: 1 })],
      [payment({ id: "p1", loanId: "l1", amount: 400, installmentNumber: 1 })],
      schedules,
    );
    expect(t.receber).toBe(800);
    expect(t.capitalAtivo).toBeCloseTo(666.67, 2);
    expect(t.contratosParcelados).toBe(1);
  });

  it("amortização com remaining_amount tem prioridade sobre o cálculo derivado", () => {
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20, remainingAmount: 450 })],
      [payment({ id: "p1", loanId: "l1", amount: 750, installmentNumber: 1 })],
    );
    expect(t.receber).toBe(450);
  });

  it("renegociação soma a multa apenas em contratos de parcela única", () => {
    const single = run([loan({ id: "l1", amount: 1000, interestRate: 20, renegotiationPenaltyTotal: 80 })]);
    expect(single.receber).toBe(1280);

    const parcelado = run(
      [loan({ id: "l2", amount: 1000, interestRate: 20, installments: 2, renegotiationPenaltyTotal: 80 })],
      [],
      [
        { loanId: "l2", installmentNumber: 1, dueDate: "2026-08-05", amount: 600 },
        { loanId: "l2", installmentNumber: 2, dueDate: "2026-09-05", amount: 600 },
      ],
    );
    expect(parcelado.receber).toBe(1200);
  });

  it("filtro mensal considera apenas o período informado", () => {
    const loans = [
      loan({ id: "l1", amount: 1000, startDate: "2026-07-05" }),
      loan({ id: "l2", amount: 2000, startDate: "2026-03-05" }),
    ];
    const payments = [
      payment({ id: "p1", loanId: "l1", amount: 100, date: "2026-07-10" }),
      payment({ id: "p2", loanId: "l2", amount: 300, date: "2026-03-10" }),
    ];
    const mes = run(loans, payments);
    expect(mes.emprestado).toBe(1000);
    expect(mes.totalRecebidoPeriodo).toBe(100);
    expect(mes.emprestadoTotal).toBe(3000);
  });

  it("filtro anual agrega todo o ano", () => {
    const loans = [
      loan({ id: "l1", amount: 1000, startDate: "2026-07-05" }),
      loan({ id: "l2", amount: 2000, startDate: "2026-03-05" }),
    ];
    const payments = [
      payment({ id: "p1", loanId: "l1", amount: 100, date: "2026-07-10" }),
      payment({ id: "p2", loanId: "l2", amount: 300, date: "2026-03-10" }),
    ];
    const ano = run(loans, payments, [], YEAR);
    expect(ano.emprestado).toBe(3000);
    expect(ano.totalRecebidoPeriodo).toBe(400);
  });

  it("isolamento: dados de outro usuário nunca entram no conjunto agregado", () => {
    // A RPC filtra por get_data_owner_id(auth.uid()); no núcleo puro isso é
    // representado pelo conjunto de contratos recebido. Pagamentos órfãos
    // (de contratos fora do escopo) não devem inflar os totais de contratos.
    const t = run(
      [loan({ id: "meu", amount: 1000 })],
      [payment({ id: "p-outro", loanId: "de-outro-usuario", amount: 999 })],
    );
    expect(t.quantidadeContratos).toBe(1);
    expect(t.capitalAtivo).toBe(1000);
  });

  it("diff sinaliza apenas divergências acima de R$ 0,01", () => {
    const base = run([loan({ id: "l1", amount: 1000, interestRate: 20 })]);
    expect(diffDashboardLoanTotals(base, { ...base, receber: base.receber + 0.005 })).toHaveLength(0);
    const diffs = diffDashboardLoanTotals(base, { ...base, receber: base.receber + 5 });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe("receber");
  });
});
