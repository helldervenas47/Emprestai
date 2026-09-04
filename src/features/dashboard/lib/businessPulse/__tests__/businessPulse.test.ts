import { describe, it, expect } from "vitest";
import {
  calculateBusinessPulseMetrics,
  generateBusinessPulseAnalysis,
} from "../index";
import type { Client, Loan, Payment, Expense } from "@/types/loan";

describe("Business Pulse Engine — 'O que está acontecendo com seu negócio?'", () => {
  const mockClients: Client[] = [
    { id: "c1", name: "João Silva", phone: "11999991111", active: true, createdAt: "2026-01-01" },
    { id: "c2", name: "Carlos Souza", phone: "11999992222", active: true, createdAt: "2026-01-01" },
    { id: "c3", name: "Marcos Lima", phone: "11999993333", active: true, createdAt: "2026-01-01" },
    { id: "c4", name: "Ana Pereira", phone: "11999994444", active: true, createdAt: "2026-01-01" },
  ];

  const range = {
    start: new Date(2026, 8, 1, 0, 0, 0), // 01/09/2026
    end: new Date(2026, 8, 15, 23, 59, 59), // 15/09/2026
    label: "Setembro de 2026",
  };

  const refDate = new Date(2026, 8, 15, 12, 0, 0); // 15/09/2026

  it("Cenário 1 — Crescimento saudável (Faturamento ↑, Recebimentos ↑, Inadimplência estável/↓)", () => {
    // Período anterior (01/08 a 15/08)
    const prevLoans: Loan[] = [
      { id: "l_prev", borrowerId: "c1", borrowerName: "João Silva", amount: 10000, interestRate: 30, installments: 1, startDate: "2026-08-05", dueDate: "2026-09-05", status: "active", paidInstallments: 0, totalAmount: 13000, remainingAmount: 13000, createdAt: "2026-08-05" },
    ];
    const prevPayments: Payment[] = [
      { id: "p_prev", loanId: "l_prev", amount: 5000, date: "2026-08-10", installmentNumber: 1 },
    ];

    // Período atual (01/09 a 15/09)
    const curLoans: Loan[] = [
      ...prevLoans,
      { id: "l_cur", borrowerId: "c2", borrowerName: "Carlos Souza", amount: 15000, interestRate: 30, installments: 1, startDate: "2026-09-05", dueDate: "2026-10-05", status: "active", paidInstallments: 0, totalAmount: 19500, remainingAmount: 19500, createdAt: "2026-09-05" },
    ];
    const curPayments: Payment[] = [
      ...prevPayments,
      { id: "p_cur", loanId: "l_cur", amount: 8000, date: "2026-09-10", installmentNumber: 1 },
    ];

    const metrics = calculateBusinessPulseMetrics({
      loans: curLoans,
      payments: curPayments,
      expenses: [],
      clients: mockClients,
      range,
      referenceDate: refDate,
    });

    const analysis = generateBusinessPulseAnalysis(metrics);

    expect(metrics.differences.revenuePct).toBeGreaterThan(0);
    expect(metrics.differences.receivedPct).toBeGreaterThan(0);
    expect(analysis.tone).toBe("positive");
    expect(analysis.headline).toContain("Crescimento saudável");
  });

  it("Cenário 2 — Crescimento com Inadimplência (Faturamento ↑, Inadimplência ↑)", () => {
    // Contratos atuais com atraso ativo relevante
    const loans: Loan[] = [
      { id: "l1", borrowerId: "c1", borrowerName: "João Silva", amount: 20000, interestRate: 30, installments: 1, startDate: "2026-09-02", dueDate: "2026-09-05", status: "active", paidInstallments: 0, totalAmount: 26000, remainingAmount: 26000, createdAt: "2026-09-02" },
      { id: "l2", borrowerId: "c2", borrowerName: "Carlos Souza", amount: 15000, interestRate: 30, installments: 1, startDate: "2026-09-03", dueDate: "2026-09-08", status: "active", paidInstallments: 0, totalAmount: 19500, remainingAmount: 19500, createdAt: "2026-09-03" },
    ];
    const payments: Payment[] = [
      { id: "p1", loanId: "l1", amount: 6000, date: "2026-09-04", installmentNumber: 1 },
    ];

    const metrics = calculateBusinessPulseMetrics({
      loans,
      payments,
      expenses: [],
      clients: mockClients,
      range,
      referenceDate: refDate,
    });

    const analysis = generateBusinessPulseAnalysis(metrics);

    expect(analysis.tone).toMatch(/attention|critical/);
    expect(analysis.headline).toContain("inadimplência");
  });

  it("Cenário 3 — Queda operacional (Faturamento ↓, Recebimentos ↓)", () => {
    // Período anterior alto
    const prevLoans: Loan[] = [
      { id: "l_prev", borrowerId: "c1", borrowerName: "João Silva", amount: 30000, interestRate: 30, installments: 1, startDate: "2026-08-05", dueDate: "2026-09-05", status: "active", paidInstallments: 0, totalAmount: 39000, remainingAmount: 39000, createdAt: "2026-08-05" },
    ];
    const prevPayments: Payment[] = [
      { id: "p_prev", loanId: "l_prev", amount: 25000, date: "2026-08-10", installmentNumber: 1 },
    ];

    // Período atual com queda drástica
    const curLoans: Loan[] = [
      ...prevLoans,
      { id: "l_cur", borrowerId: "c2", borrowerName: "Carlos Souza", amount: 5000, interestRate: 30, installments: 1, startDate: "2026-09-05", dueDate: "2026-10-05", status: "active", paidInstallments: 0, totalAmount: 6500, remainingAmount: 6500, createdAt: "2026-09-05" },
    ];
    const curPayments: Payment[] = [
      ...prevPayments,
      { id: "p_cur", loanId: "l_cur", amount: 3000, date: "2026-09-10", installmentNumber: 1 },
    ];

    const metrics = calculateBusinessPulseMetrics({
      loans: curLoans,
      payments: curPayments,
      expenses: [],
      clients: mockClients,
      range,
      referenceDate: refDate,
    });

    const analysis = generateBusinessPulseAnalysis(metrics);

    expect(metrics.differences.revenuePct).toBeLessThan(0);
    expect(metrics.differences.receivedPct).toBeLessThan(0);
    expect(analysis.tone).toBe("attention");
  });

  it("Cenário 4 — Concentração de Dívida e Recomendação com nomes reais", () => {
    const loans: Loan[] = [
      { id: "l1", borrowerId: "c1", borrowerName: "João Silva", amount: 10000, interestRate: 30, installments: 1, startDate: "2026-07-01", dueDate: "2026-08-01", status: "active", paidInstallments: 0, totalAmount: 13000, remainingAmount: 13000, createdAt: "2026-07-01" },
      { id: "l2", borrowerId: "c2", borrowerName: "Carlos Souza", amount: 8000, interestRate: 30, installments: 1, startDate: "2026-07-01", dueDate: "2026-08-01", status: "active", paidInstallments: 0, totalAmount: 10400, remainingAmount: 10400, createdAt: "2026-07-01" },
      { id: "l3", borrowerId: "c3", borrowerName: "Marcos Lima", amount: 5000, interestRate: 30, installments: 1, startDate: "2026-07-01", dueDate: "2026-08-01", status: "active", paidInstallments: 0, totalAmount: 6500, remainingAmount: 6500, createdAt: "2026-07-01" },
      { id: "l4", borrowerId: "c4", borrowerName: "Ana Pereira", amount: 500, interestRate: 30, installments: 1, startDate: "2026-07-01", dueDate: "2026-08-01", status: "active", paidInstallments: 0, totalAmount: 650, remainingAmount: 650, createdAt: "2026-07-01" },
    ];

    const metrics = calculateBusinessPulseMetrics({
      loans,
      payments: [],
      expenses: [],
      clients: mockClients,
      range,
      referenceDate: refDate,
    });

    const analysis = generateBusinessPulseAnalysis(metrics);

    expect(metrics.concentration.topClients.length).toBeGreaterThanOrEqual(3);
    expect(metrics.concentration.hasRelevantConcentration).toBe(true);
    expect(analysis.recommendation.text).toContain("João Silva");
    expect(analysis.recommendation.actionLabel).toBe("Ver clientes prioritários");
  });

  it("Cenário 5 — Histórico inicial com poucos dados", () => {
    const metrics = calculateBusinessPulseMetrics({
      loans: [],
      payments: [],
      expenses: [],
      clients: [],
      range,
      referenceDate: refDate,
    });

    const analysis = generateBusinessPulseAnalysis(metrics);

    expect(analysis.hasSufficientData).toBe(false);
    expect(analysis.headline).toContain("Ainda não há dados suficientes");
  });
});
