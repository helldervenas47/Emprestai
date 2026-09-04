import { describe, it, expect } from "vitest";
import {
  calculateFinancialSummaryForMonth,
  computeMonthComparison,
  computeMonthlyClosingGoals,
  computeMonthlyClosingData,
  classifyGoalStatus,
  generateMonthlyClosingInsights,
  getPreviousMonthKey,
  getNextMonthKey,
} from "../index";
import type { Client, Loan, Payment, Expense, InstallmentSchedule } from "@/types/loan";
import type { MonthlyGoal } from "@/features/piggyBanks/hooks/useMonthlyGoals";

describe("Fechamento Mensal Automático + Integração com Metas", () => {
  const mockClients: Client[] = [
    { id: "c1", name: "João Silva", phone: "11999991111", active: true, createdAt: "2026-08-01" },
    { id: "c2", name: "Carlos Souza", phone: "11999992222", active: true, createdAt: "2026-08-01" },
    { id: "c3", name: "Ana Lima", phone: "11999993333", active: true, createdAt: "2026-08-05" },
  ];

  it("Cenário 1 — Todas as metas atingidas (100% de sucesso)", () => {
    const monthKey = "2026-08";

    const loans: Loan[] = [
      {
        id: "l1",
        borrowerId: "c1",
        borrowerName: "João Silva",
        amount: 32450,
        interestRate: 30,
        installments: 1,
        startDate: "2026-08-05",
        dueDate: "2026-09-05",
        status: "active",
        paidInstallments: 0,
        totalAmount: 42185,
        remainingAmount: 42185,
        createdAt: "2026-08-05",
      },
    ];

    const payments: Payment[] = [
      { id: "p1", loanId: "l1", amount: 25000, date: "2026-08-15", installmentNumber: 1 },
    ];

    const goals: MonthlyGoal[] = [
      { id: "g1", goalType: "loan_volume", month: monthKey, targetValue: 30000 },
      { id: "g2", goalType: "received_total", month: monthKey, targetValue: 20000 },
    ];

    const closing = computeMonthlyClosingData({
      monthKey,
      loans,
      payments,
      expenses: [],
      clients: mockClients,
      goals,
    });

    expect(closing.goalsSummary.totalGoals).toBe(2);
    expect(closing.goalsSummary.reachedCount).toBe(2);
    expect(closing.goalsSummary.missedCount).toBe(0);
    expect(closing.goalsSummary.overallAchievementPct).toBe(100);
    expect(closing.goals[0].status).toBe("reached");
    expect(closing.goals[1].status).toBe("reached");
    expect(closing.executiveAnalysis.positiveHighlights.length).toBeGreaterThan(0);
  });

  it("Cenário 2 — Metas parcialmente atingidas (🟢 atingida, 🟡 próxima, 🔴 não atingida)", () => {
    const monthKey = "2026-08";

    const loans: Loan[] = [
      {
        id: "l1",
        borrowerId: "c1",
        borrowerName: "João Silva",
        amount: 32450,
        interestRate: 30,
        installments: 1,
        startDate: "2026-08-05",
        dueDate: "2026-09-05",
        status: "active",
        paidInstallments: 0,
        totalAmount: 42185,
        remainingAmount: 42185,
        createdAt: "2026-08-05",
      },
    ];

    // Recebido 23.800 para meta de 25.000 (95,2% -> próxima)
    const payments: Payment[] = [
      { id: "p1", loanId: "l1", amount: 23800, date: "2026-08-15", installmentNumber: 1 },
    ];

    // Meta de novos clientes = 10, cadastrados = 3 (30% -> não atingida)
    const goals: MonthlyGoal[] = [
      { id: "g1", goalType: "loan_volume", month: monthKey, targetValue: 30000 }, // 32450 -> reached
      { id: "g2", goalType: "received_total", month: monthKey, targetValue: 25000 }, // 23800 -> close
      { id: "g3", goalType: "new_clients_count", month: monthKey, targetValue: 10 }, // 3 -> missed
    ];

    const closing = computeMonthlyClosingData({
      monthKey,
      loans,
      payments,
      expenses: [],
      clients: mockClients,
      goals,
    });

    expect(closing.goalsSummary.totalGoals).toBe(3);
    expect(closing.goalsSummary.reachedCount).toBe(1);
    expect(closing.goalsSummary.closeCount).toBe(1);
    expect(closing.goalsSummary.missedCount).toBe(1);
    expect(closing.goals.find((g) => g.goalType === "loan_volume")?.status).toBe("reached");
    expect(closing.goals.find((g) => g.goalType === "received_total")?.status).toBe("close");
    expect(closing.goals.find((g) => g.goalType === "new_clients_count")?.status).toBe("missed");
  });

  it("Cenário 3 — Meta Inversa: Inadimplência (Menor é melhor)", () => {
    // 1. Inadimplência dentro do limite (Meta: 5%, Realizado: 4% -> reached)
    const statusOk = classifyGoalStatus(5, 4, true);
    expect(statusOk.status).toBe("reached");

    // 2. Inadimplência ligeiramente acima (Meta: 5%, Realizado: 5.8% -> close)
    const statusClose = classifyGoalStatus(5, 5.8, true);
    expect(statusClose.status).toBe("close");

    // 3. Inadimplência bem acima (Meta: 5%, Realizado: 7.2% -> missed)
    const statusMissed = classifyGoalStatus(5, 7.2, true);
    expect(statusMissed.status).toBe("missed");
  });

  it("Cenário 4 — Destaques Positivos e Comparação com Mês Anterior", () => {
    const monthKey = "2026-08";

    // Julho (Mês anterior)
    const julLoans: Loan[] = [
      { id: "l_jul", borrowerId: "c1", borrowerName: "João Silva", amount: 20000, interestRate: 30, installments: 1, startDate: "2026-07-10", dueDate: "2026-08-10", status: "active", paidInstallments: 0, totalAmount: 26000, remainingAmount: 26000, createdAt: "2026-07-10" },
    ];
    const julPayments: Payment[] = [
      { id: "p_jul", loanId: "l_jul", amount: 15000, date: "2026-07-20", installmentNumber: 1 },
    ];
    const julExpenses: Expense[] = [
      { id: "e_jul", description: "Aluguel", amount: 5000, paid: true, paidDate: "2026-07-05", scope: "business" },
    ];

    // Agosto (Mês atual com alta de faturamento e queda de despesas)
    const augLoans: Loan[] = [
      ...julLoans,
      { id: "l_aug", borrowerId: "c2", borrowerName: "Carlos Souza", amount: 30000, interestRate: 30, installments: 1, startDate: "2026-08-10", dueDate: "2026-09-10", status: "active", paidInstallments: 0, totalAmount: 39000, remainingAmount: 39000, createdAt: "2026-08-10" },
    ];
    const augPayments: Payment[] = [
      ...julPayments,
      { id: "p_aug", loanId: "l_aug", amount: 25000, date: "2026-08-20", installmentNumber: 1 },
    ];
    const augExpenses: Expense[] = [
      ...julExpenses,
      { id: "e_aug", description: "Aluguel", amount: 4000, paid: true, paidDate: "2026-08-05", scope: "business" },
    ];

    const closing = computeMonthlyClosingData({
      monthKey,
      loans: augLoans,
      payments: augPayments,
      expenses: augExpenses,
      clients: mockClients,
      goals: [],
    });

    expect(closing.financial.revenue).toBe(30000);
    expect(closing.financial.received).toBe(25000);
    expect(closing.financial.expenses).toBe(4000);
    expect(closing.comparison.revenue.pctDiff).toBe(50); // +50%
    expect(closing.comparison.expenses.pctDiff).toBe(-20); // -20%
    expect(closing.comparison.expenses.isPositiveEvolution).toBe(true); // Despesa caindo é positivo
  });

  it("Cenário 5 — Sem metas cadastradas (Fallback amigável e sem crash)", () => {
    const monthKey = "2026-08";

    const closing = computeMonthlyClosingData({
      monthKey,
      loans: [],
      payments: [],
      expenses: [],
      clients: [],
      goals: [],
    });

    expect(closing.goalsSummary.hasGoals).toBe(false);
    expect(closing.goals.length).toBe(0);
    expect(closing.executiveAnalysis.recommendation.action?.targetTab).toBe("metas");
  });

  it("Cenário 6 — Início de histórico com poucos dados (Sem divisões por zero ou NaN)", () => {
    const monthKey = "2026-08";

    const closing = computeMonthlyClosingData({
      monthKey,
      loans: [],
      payments: [],
      expenses: [],
      clients: [],
      goals: [],
    });

    expect(closing.financial.revenue).toBe(0);
    expect(closing.financial.received).toBe(0);
    expect(closing.financial.defaultRate).toBe(0);
    expect(isNaN(closing.financial.defaultRate)).toBe(false);
    expect(isFinite(closing.financial.defaultRate)).toBe(true);
  });

  it("Cenário 7 — Navegação e utilitários de data de mês", () => {
    expect(getPreviousMonthKey("2026-08")).toBe("2026-07");
    expect(getPreviousMonthKey("2026-01")).toBe("2025-12");
    expect(getNextMonthKey("2026-08")).toBe("2026-09");
    expect(getNextMonthKey("2026-12")).toBe("2027-01");
  });

  it("Cenário 8 — Ação direta recomendada para inadimplência elevada", () => {
    const monthKey = "2026-08";

    const loans: Loan[] = [
      {
        id: "l1",
        borrowerId: "c1",
        borrowerName: "João Silva",
        amount: 20000,
        interestRate: 30,
        installments: 1,
        startDate: "2026-08-01",
        dueDate: "2026-08-05", // Vencido no mês
        status: "active",
        paidInstallments: 0,
        totalAmount: 26000,
        remainingAmount: 26000,
        createdAt: "2026-08-01",
      },
    ];

    const closing = computeMonthlyClosingData({
      monthKey,
      loans,
      payments: [],
      expenses: [],
      clients: mockClients,
      goals: [],
    });

    expect(closing.financial.overdueAmount).toBeGreaterThan(0);
    expect(closing.financial.defaultRate).toBeGreaterThan(0);
    expect(closing.executiveAnalysis.recommendation.action?.label).toContain("clientes");
    expect(closing.executiveAnalysis.recommendation.action?.targetTab).toBe("clientes");
  });
});
