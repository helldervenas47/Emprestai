/**
 * Casos reais críticos exigidos na etapa de validação da RPC
 * `dashboard_loan_totals` (V3). Cada teste representa um cenário que já
 * ocorreu em produção e que a RPC precisa reproduzir sem aproximação.
 */
import { describe, it, expect } from "vitest";
import {
  computeDashboardLoanMetrics,
  computeDashboardLoanTotals,
  diffDashboardLoanRows,
} from "@/services/dashboardLoanTotalsCore";
import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";

const TODAY = "2026-07-27";
const RANGE = { start: "2026-07-01", end: "2026-07-31" };

function loan(over: Partial<Loan> & { id: string }): Loan {
  return {
    id: over.id,
    borrowerName: "Cliente",
    amount: 1000,
    interestRate: 20,
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
    createdAt: "2026-07-10T12:00:00Z",
    ...over,
  } as Payment;
}

const run = (
  loans: Loan[],
  payments: Payment[] = [],
  schedules: InstallmentSchedule[] = [],
  today = TODAY,
) => computeDashboardLoanTotals({ loans, payments, schedules, today, ...RANGE });

const rows = (
  loans: Loan[],
  payments: Payment[] = [],
  schedules: InstallmentSchedule[] = [],
  today = TODAY,
) => computeDashboardLoanMetrics({ loans, payments, schedules, today, ...RANGE });

describe("RPC V3 · casos reais críticos", () => {
  it("parcial com remaining_balance_prorata honra os valores persistidos", () => {
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20 })],
      [
        payment({
          id: "p1",
          loanId: "l1",
          amount: 500,
          installmentNumber: -1,
          metadata: {
            allocation_version: "remaining_balance_prorata",
            interest_amount: 83.33,
            principal_amount: 416.67,
          } as never,
        }),
      ],
    );
    expect(t.jurosRecebidos).toBeCloseTo(83.33, 2);
    expect(t.principalRecebido).toBeCloseTo(416.67, 2);
  });

  it("metadata inválido na nova versão cai no legado (não recalcula em silêncio)", () => {
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20 })],
      [
        payment({
          id: "p1",
          loanId: "l1",
          amount: 500,
          installmentNumber: -1,
          metadata: { allocation_version: "remaining_balance_prorata" } as never,
        }),
      ],
    );
    // Legado: juros primeiro (saldo de juros = 200)
    expect(t.jurosRecebidos).toBeCloseTo(200, 2);
  });

  it("juros avulsos e amortização são tratados separadamente", () => {
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20 })],
      [
        payment({ id: "p1", loanId: "l1", amount: 200, installmentNumber: 0 }),
        payment({ id: "p2", loanId: "l1", amount: 300, installmentNumber: -3 }),
      ],
    );
    expect(t.jurosRecebidos).toBeCloseTo(200, 2);
    expect(t.principalRecebido).toBeCloseTo(300, 2);
    expect(t.totalRecebidoPeriodo).toBe(500);
  });

  it("quitação com desconto: total pago menor que o contratado", () => {
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20, status: "paid", paidInstallments: 1 })],
      [payment({ id: "p1", loanId: "l1", amount: 1100, installmentNumber: 1 })],
    );
    expect(t.totalRecebidoPeriodo).toBe(1100);
    // Regra oficial: na quitação, a reconciliação reconhece TODO o juros
    // contratado (200) e o desconto sai do principal (900).
    expect(t.jurosRecebidos).toBeCloseTo(200, 2);
    expect(t.principalRecebido).toBeCloseTo(900, 2);
    expect(t.receber).toBe(0);
  });

  it("pagamento maior que o contratado (multa acordada) vira juros", () => {
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20, status: "paid", paidInstallments: 1 })],
      [payment({ id: "p1", loanId: "l1", amount: 1350, installmentNumber: 1 })],
    );
    expect(t.jurosRecebidos).toBeCloseTo(350, 2);
    expect(t.principalRecebido).toBeCloseTo(1000, 2);
  });

  it("contrato atrasado por um único dia gera multa diária de um dia", () => {
    const t = run([
      loan({
        id: "l1", amount: 1000, interestRate: 0, dueDate: "2026-07-26",
        lateInterestType: "fixed", lateInterestValue: 15,
      }),
    ]);
    expect(t.contratosAtrasados).toBe(1);
    expect(t.multasPendentes).toBe(15);
  });

  it("virada de dia UTC × America/Sao_Paulo não antecipa a multa", () => {
    // 2026-07-27T02:00Z já é dia 27 em UTC, mas ainda 26 em São Paulo.
    const spToday = "2026-07-26";
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 0, dueDate: "2026-07-26",
        lateInterestType: "fixed", lateInterestValue: 15 })],
      [],
      [],
      spToday,
    );
    expect(t.contratosAtrasados).toBe(0);
    expect(t.multasPendentes).toBe(0);
  });

  it("multa percentual diária usa a base remanescente", () => {
    const t = run([
      loan({
        id: "l1", amount: 1000, interestRate: 0, dueDate: "2026-07-24",
        lateInterestType: "percentage", lateInterestValue: 1,
      }),
    ]);
    // 3 dias × 1% de 1000
    expect(t.multasPendentes).toBeCloseTo(30, 2);
  });

  it("parcelado com pagamentos usa o cronograma real de juros", () => {
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
    // juros contratados = 200 → parcela 1 reconhece ~66,67
    expect(t.jurosRecebidos).toBeCloseTo(66.67, 2);
    expect(t.principalRecebido).toBeCloseTo(333.33, 2);
    expect(t.jurosContratados).toBeCloseTo(200, 2);
    expect(t.jurosPendentes).toBeCloseTo(133.33, 2);
  });

  it("renegociação diluída em parcelas é reconhecida como juros", () => {
    const t = run(
      [loan({ id: "l1", amount: 1000, interestRate: 20, installments: 2, paidInstallments: 1 })],
      [payment({ id: "p1", loanId: "l1", amount: 700, installmentNumber: 1 })],
      [
        { loanId: "l1", installmentNumber: 1, dueDate: "2026-08-05", amount: 700 },
        { loanId: "l1", installmentNumber: 2, dueDate: "2026-09-05", amount: 700 },
      ],
    );
    expect(t.jurosRecebidos).toBeGreaterThan(0);
    expect(t.receber).toBe(700);
  });

  it("contrato com taxa 0% não gera juros contratados nem pendentes", () => {
    const t = run([loan({ id: "l1", amount: 1000, interestRate: 0 })]);
    expect(t.jurosContratados).toBe(0);
    expect(t.jurosPendentes).toBe(0);
    expect(t.taxaJurosMedia).toBe(0);
  });

  it("juros a receber: regra oficial × leitura literal da especificação", () => {
    const t = run([loan({ id: "l1", amount: 1000, interestRate: 20, installments: 2, paidInstallments: 1 })],
      [], [
        { loanId: "l1", installmentNumber: 1, dueDate: "2026-08-05", amount: 600 },
        { loanId: "l1", installmentNumber: 2, dueDate: "2026-09-05", amount: 600 },
      ]);
    // receber = 1200 (parcelas em aberto: 1 e 2 acima de paid_installments=1 → só a 2ª)
    // capital ativo = 1000 * 1/2 = 500 → juros a receber (oficial) = receber - 500
    expect(t.jurosReceber).toBeCloseTo(t.receber - t.capitalAtivo, 2);
    // leitura literal: receber - emprestado ativo (1000)
    expect(t.jurosReceberSpec).toBeCloseTo(Math.max(0, t.receber - 1000), 2);
  });

  it("diferenças por contrato não se compensam no diagnóstico", () => {
    const legacy = rows([
      loan({ id: "a", amount: 1000, interestRate: 0 }),
      loan({ id: "b", amount: 1000, interestRate: 0 }),
    ]);
    const rpc = legacy.map((r, i) => ({
      ...r,
      receber: r.receber + (i === 0 ? 100 : -100),
    }));
    const diffs = diffDashboardLoanRows(legacy, rpc);
    expect(diffs).toHaveLength(2);
    expect(diffs[0].maxDiff).toBeCloseTo(100, 2);
  });
});
