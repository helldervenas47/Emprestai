import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useDashboardMetrics } from "../useDashboardMetrics";
import { DashboardManagerSplitSection } from "../DashboardManagerSplitSection";
import type { Loan, Payment, InstallmentSchedule } from "@/types/loan";

function rawFormatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

describe("Dashboard Manager Split (Com Gerente / Sem Gerente)", () => {
  const baseRange = {
    start: new Date("2026-09-01T00:00:00"),
    end: new Date("2026-09-30T23:59:59"),
    label: "Setembro de 2026",
  };

  const defaultInput = {
    loans: [] as Loan[],
    sales: [],
    payments: [] as Payment[],
    expenses: [],
    installmentSchedules: [] as InstallmentSchedule[],
    ledgerEntries: [],
    range: baseRange,
    period: "month" as const,
    includeSales: false,
    comparisonWindow: 6 as const,
    chartOverrides: {},
    interestOverrides: {},
    paymentMethods: [],
    profitGoal: null,
    receivedDetailMethodId: null,
  };

  // 1. Empréstimo com gerente sem pagamentos
  it("1. calcula corretamente empréstimo com gerente sem pagamentos", () => {
    const loanWithMgr: Loan = {
      id: "l1",
      borrowerName: "Cliente 1",
      amount: 1000,
      interestRate: 20, // total esperado: 1200
      interestType: "simple",
      paymentType: "single",
      startDate: "2026-09-01",
      dueDate: "2026-10-01",
      installments: 1,
      paidInstallments: 0,
      status: "active",
      hasManager: true,
      managerId: "mgr1",
      createdAt: "2026-09-01T00:00:00Z",
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        ...defaultInput,
        loans: [loanWithMgr],
      }),
    );

    const { managerSplit } = result.current;
    expect(managerSplit.withManager.count).toBe(1);
    expect(managerSplit.withManager.totalReceivable).toBe(1200);
    expect(managerSplit.withManager.interestPending).toBe(200);
    expect(managerSplit.withManager.capitalOnStreet).toBe(1000);

    expect(managerSplit.withoutManager.count).toBe(0);
    expect(managerSplit.withoutManager.totalReceivable).toBe(0);
    expect(managerSplit.withoutManager.interestPending).toBe(0);
  });

  // 2. Empréstimo sem gerente sem pagamentos
  it("2. calcula corretamente empréstimo sem gerente sem pagamentos", () => {
    const loanNoMgr: Loan = {
      id: "l2",
      borrowerName: "Cliente 2",
      amount: 2000,
      interestRate: 15, // total esperado: 2300 (juros: 300)
      interestType: "simple",
      paymentType: "single",
      startDate: "2026-09-01",
      dueDate: "2026-10-01",
      installments: 1,
      paidInstallments: 0,
      status: "active",
      hasManager: false,
      managerId: null,
      createdAt: "2026-09-01T00:00:00Z",
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        ...defaultInput,
        loans: [loanNoMgr],
      }),
    );

    const { managerSplit } = result.current;
    expect(managerSplit.withoutManager.count).toBe(1);
    expect(managerSplit.withoutManager.totalReceivable).toBe(2300);
    expect(managerSplit.withoutManager.interestPending).toBe(300);
    expect(managerSplit.withoutManager.capitalOnStreet).toBe(2000);

    expect(managerSplit.withManager.count).toBe(0);
    expect(managerSplit.withManager.totalReceivable).toBe(0);
  });

  // 3. Empréstimo parcialmente pago
  it("3. calcula corretamente empréstimo parcialmente pago", () => {
    const loan: Loan = {
      id: "l3",
      borrowerName: "Cliente 3",
      amount: 1000,
      interestRate: 20, // Total 1200
      interestType: "simple",
      paymentType: "installments",
      startDate: "2026-08-01",
      dueDate: "2026-10-01",
      installments: 2,
      paidInstallments: 1,
      status: "active",
      hasManager: true,
      managerId: "mgr1",
      remainingAmount: 600, // Parcela de 600 restante
      createdAt: "2026-08-01T00:00:00Z",
    };

    const payment: Payment = {
      id: "p1",
      loanId: "l3",
      amount: 600,
      date: "2026-09-01",
      installmentNumber: 1,
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        ...defaultInput,
        loans: [loan],
        payments: [payment],
      }),
    );

    const { managerSplit } = result.current;
    expect(managerSplit.withManager.count).toBe(1);
    expect(managerSplit.withManager.totalReceivable).toBe(600);
    expect(managerSplit.withManager.interestPending).toBe(100);
    expect(managerSplit.withManager.capitalOnStreet).toBe(500);
  });

  // 4. Empréstimo quitado
  it("4. não gera saldo nem juros pendentes para empréstimos quitados", () => {
    const paidLoan: Loan = {
      id: "l4",
      borrowerName: "Cliente 4",
      amount: 1000,
      interestRate: 20,
      interestType: "simple",
      paymentType: "single",
      startDate: "2026-08-01",
      dueDate: "2026-09-01",
      installments: 1,
      paidInstallments: 1,
      status: "paid",
      hasManager: true,
      managerId: "mgr1",
      remainingAmount: 0,
      createdAt: "2026-08-01T00:00:00Z",
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        ...defaultInput,
        loans: [paidLoan],
      }),
    );

    const { managerSplit } = result.current;
    expect(managerSplit.withManager.count).toBe(0);
    expect(managerSplit.withManager.totalReceivable).toBe(0);
    expect(managerSplit.withManager.interestPending).toBe(0);
  });

  // 5. Empréstimo em atraso (com multa/juros de atraso)
  it("5. calcula encargos e saldo em atraso corretamente", () => {
    const overdueLoan: Loan = {
      id: "l5",
      borrowerName: "Cliente 5",
      amount: 1000,
      interestRate: 20, // Total 1200
      interestType: "simple",
      paymentType: "single",
      startDate: "2026-08-01",
      dueDate: "2026-08-15", // vencido
      installments: 1,
      paidInstallments: 0,
      status: "overdue",
      hasManager: false,
      managerId: null,
      penaltyValue: 50,
      createdAt: "2026-08-01T00:00:00Z",
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        ...defaultInput,
        loans: [overdueLoan],
      }),
    );

    const { managerSplit } = result.current;
    expect(managerSplit.withoutManager.count).toBe(1);
    // Total a receber = 1200 + 50 multa = 1250
    expect(managerSplit.withoutManager.totalReceivable).toBe(1250);
    // Juros pendentes = 200 + 50 = 250
    expect(managerSplit.withoutManager.interestPending).toBe(250);
  });

  // 6. Empréstimo renegociado
  it("6. calcula corretamente empréstimo renegociado", () => {
    const renegLoan: Loan = {
      id: "l6",
      borrowerName: "Cliente 6",
      amount: 1500, // Novo principal
      interestRate: 10, // Total 1650
      interestType: "simple",
      paymentType: "single",
      startDate: "2026-09-01",
      dueDate: "2026-10-01",
      installments: 1,
      paidInstallments: 0,
      status: "active",
      hasManager: true,
      managerId: "mgr2",
      renegotiationPenaltyTotal: 50,
      createdAt: "2026-09-01T00:00:00Z",
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        ...defaultInput,
        loans: [renegLoan],
      }),
    );

    const { managerSplit } = result.current;
    expect(managerSplit.withManager.count).toBe(1);
    expect(managerSplit.withManager.totalReceivable).toBe(1700); // 1650 + 50
  });

  // 7. Empréstimo com pagamento antecipado
  it("7. calcula corretamente amortização/pagamento antecipado", () => {
    const amortizedLoan: Loan = {
      id: "l7",
      borrowerName: "Cliente 7",
      amount: 2000,
      interestRate: 20,
      interestType: "simple",
      paymentType: "single",
      startDate: "2026-09-01",
      dueDate: "2026-10-01",
      installments: 1,
      paidInstallments: 0,
      status: "active",
      hasManager: false,
      remainingAmount: 1200, // 1000 amortizado
      createdAt: "2026-09-01T00:00:00Z",
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        ...defaultInput,
        loans: [amortizedLoan],
      }),
    );

    const { managerSplit } = result.current;
    expect(managerSplit.withoutManager.count).toBe(1);
    expect(managerSplit.withoutManager.totalReceivable).toBe(1200);
  });

  // 8. Usuário que possui apenas empréstimos com gerente
  it("8. suporta usuário com apenas empréstimos com gerente", () => {
    const loan: Loan = {
      id: "l8",
      borrowerName: "Cliente 8",
      amount: 1000,
      interestRate: 10,
      interestType: "simple",
      paymentType: "single",
      startDate: "2026-09-01",
      dueDate: "2026-10-01",
      installments: 1,
      paidInstallments: 0,
      status: "active",
      hasManager: true,
      managerId: "mgr1",
      createdAt: "2026-09-01T00:00:00Z",
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        ...defaultInput,
        loans: [loan],
      }),
    );

    const { managerSplit } = result.current;
    expect(managerSplit.withManager.count).toBe(1);
    expect(managerSplit.withoutManager.count).toBe(0);
    expect(managerSplit.withoutManager.totalReceivable).toBe(0);
    expect(managerSplit.total.count).toBe(1);
  });

  // 9. Usuário que possui apenas empréstimos sem gerente
  it("9. suporta usuário com apenas empréstimos sem gerente", () => {
    const loan: Loan = {
      id: "l9",
      borrowerName: "Cliente 9",
      amount: 1000,
      interestRate: 10,
      interestType: "simple",
      paymentType: "single",
      startDate: "2026-09-01",
      dueDate: "2026-10-01",
      installments: 1,
      paidInstallments: 0,
      status: "active",
      hasManager: false,
      managerId: null,
      createdAt: "2026-09-01T00:00:00Z",
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        ...defaultInput,
        loans: [loan],
      }),
    );

    const { managerSplit } = result.current;
    expect(managerSplit.withManager.count).toBe(0);
    expect(managerSplit.withoutManager.count).toBe(1);
    expect(managerSplit.total.count).toBe(1);
  });

  // 10. Usuário sem empréstimos
  it("10. renderiza zerado sem erros quando não há empréstimos", () => {
    const { result } = renderHook(() =>
      useDashboardMetrics({
        ...defaultInput,
        loans: [],
      }),
    );

    const { managerSplit } = result.current;
    expect(managerSplit.withManager.count).toBe(0);
    expect(managerSplit.withManager.totalReceivable).toBe(0);
    expect(managerSplit.withoutManager.count).toBe(0);
    expect(managerSplit.withoutManager.totalReceivable).toBe(0);
    expect(managerSplit.total.count).toBe(0);
  });

  // Invariante: Com Gerente + Sem Gerente = Total Carteira
  it("invariante: soma Com Gerente + Sem Gerente é igual ao total correspondente da carteira", () => {
    const l1: Loan = {
      id: "l1",
      borrowerName: "Cliente 1",
      amount: 1000,
      interestRate: 20,
      interestType: "simple",
      paymentType: "single",
      startDate: "2026-09-01",
      dueDate: "2026-10-01",
      installments: 1,
      paidInstallments: 0,
      status: "active",
      hasManager: true,
      managerId: "mgr1",
      createdAt: "2026-09-01T00:00:00Z",
    };

    const l2: Loan = {
      id: "l2",
      borrowerName: "Cliente 2",
      amount: 3000,
      interestRate: 10,
      interestType: "simple",
      paymentType: "single",
      startDate: "2026-09-01",
      dueDate: "2026-10-01",
      installments: 1,
      paidInstallments: 0,
      status: "active",
      hasManager: false,
      managerId: null,
      createdAt: "2026-09-01T00:00:00Z",
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        ...defaultInput,
        loans: [l1, l2],
      }),
    );

    const { managerSplit, portfolio } = result.current;
    expect(managerSplit.withManager.count + managerSplit.withoutManager.count).toBe(managerSplit.total.count);
    expect(managerSplit.withManager.totalReceivable + managerSplit.withoutManager.totalReceivable).toBe(managerSplit.total.totalReceivable);
    expect(managerSplit.withManager.interestPending + managerSplit.withoutManager.interestPending).toBe(managerSplit.total.interestPending);
    expect(managerSplit.total.totalReceivable).toBe(portfolio.pendingReceivable);
    expect(managerSplit.total.interestPending).toBe(portfolio.estimatedProfit);
  });

  // Teste de renderização do componente UI
  it("renderiza visualmente os dois cards e os valores formatados", () => {
    const mockSplit = {
      withManager: { count: 12, interestPending: 8450, totalReceivable: 32700, capitalOnStreet: 24250 },
      withoutManager: { count: 18, interestPending: 11320, totalReceivable: 48900, capitalOnStreet: 37580 },
      total: { count: 30, interestPending: 19770, totalReceivable: 81600, capitalOnStreet: 61830 },
    };

    render(
      <DashboardManagerSplitSection
        managerSplit={mockSplit}
        formatCurrency={rawFormatCurrency}
      />,
    );

    expect(screen.getByText("Empréstimos por Gerenciamento")).toBeDefined();
    expect(screen.getByText("COM GERENTE")).toBeDefined();
    expect(screen.getByText("SEM GERENTE")).toBeDefined();
    expect(screen.getByText("12 empréstimos")).toBeDefined();
    expect(screen.getByText("18 empréstimos")).toBeDefined();
    expect(screen.getAllByText("Juros a Receber")).toHaveLength(2);
    expect(screen.getAllByText("Total a Receber")).toHaveLength(2);
  });
});
