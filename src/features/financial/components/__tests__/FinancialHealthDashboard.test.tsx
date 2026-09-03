import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FinancialHealthDashboard } from "../FinancialHealthDashboard";
import { Income } from "@/features/financial/hooks/useIncomes";
import { Expense } from "@/types/loan";

vi.mock("@/features/piggyBanks/hooks/usePiggyBanks", () => ({
  usePiggyBanks: () => ({
    piggyBanks: [
      { id: "pb-1", name: "Reserva de Emergência", balance: 15000, category: "reserva" },
    ],
    deposits: [
      { amount: 15000, piggy_bank_id: "pb-1" },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/features/sales/hooks/useProducts", () => ({
  useProducts: () => ({
    products: [],
    sales: [],
  }),
}));

vi.mock("@/contexts/HideValuesContext", () => ({
  useHideValues: () => ({
    hideValues: false,
  }),
}));

vi.mock("@/features/creditCards/hooks/useCreditCards", () => ({
  useCreditCards: () => ({
    cards: [],
  }),
}));

vi.mock("@/features/creditCards/hooks/useCreditCardOpenings", () => ({
  useCreditCardOpenings: () => ({
    openings: [],
  }),
}));

vi.mock("@/features/financial/hooks/useMonthFlow", () => ({
  useMonthFlow: () => ({
    flow: { previousCarryover: 0, previousCarryoverFormatted: "R$ 0,00" },
    loading: false,
  }),
}));

const mockIncomes = [
  {
    id: "inc-1",
    userId: "u1",
    description: "Salário",
    amount: 10000,
    category: "Salário",
    receivedDate: "2026-03-05",
    actualReceivedDate: "2026-03-05",
    status: "received",
    type: "fixa",
    scope: "personal",
    createdAt: "2026-03-01",
    updatedAt: "2026-03-01",
  },
] as unknown as Income[];

const mockExpenses = [
  {
    id: "exp-1",
    userId: "u1",
    description: "Aluguel",
    amount: 3000,
    category: "Moradia",
    dueDate: "2026-03-10",
    paidDate: "2026-03-10",
    paid: true,
    type: "fixa",
    scope: "personal",
    createdAt: "2026-03-01",
    updatedAt: "2026-03-01",
  },
] as unknown as Expense[];

describe("FinancialHealthDashboard — Indicadores Essenciais", () => {
  it("renderiza o cabeçalho moderno e o score de saúde geral", () => {
    render(
      <FinancialHealthDashboard
        incomes={mockIncomes}
        expenses={mockExpenses}
        monthKey="2026-03"
        mode="overall"
      />,
    );

    expect(screen.getByText("Indicadores essenciais")).toBeInTheDocument();
    expect(screen.getByText(/Saúde Financeira/i)).toBeInTheDocument();
    expect(screen.getByText(/Diagnóstico inteligente e saúde patrimonial/i)).toBeInTheDocument();
    expect(screen.getByText("Diagnóstico Consolidado")).toBeInTheDocument();
  });

  it("renderiza os 5 velocímetros de indicadores com métricas de contexto", () => {
    render(
      <FinancialHealthDashboard
        incomes={mockIncomes}
        expenses={mockExpenses}
        monthKey="2026-03"
        mode="overall"
      />,
    );

    expect(screen.getByText("Controle")).toBeInTheDocument();
    expect(screen.getByText("Reserva")).toBeInTheDocument();
    expect(screen.getByText("Dívidas")).toBeInTheDocument();
    expect(screen.getByText("Investim.")).toBeInTheDocument();
    expect(screen.getByText("Estabilid.")).toBeInTheDocument();

    // Context metrics
    expect(screen.getByText(/30% da renda gasta/i)).toBeInTheDocument();
  });

  it("abre o diálogo de ações ao clicar em um indicador", () => {
    render(
      <FinancialHealthDashboard
        incomes={mockIncomes}
        expenses={mockExpenses}
        monthKey="2026-03"
        mode="overall"
      />,
    );

    const controleBtn = screen.getByRole("button", { name: /controle/i });
    fireEvent.click(controleBtn);

    expect(screen.getByText("Controle de gastos")).toBeInTheDocument();
    expect(screen.getByText(/O que fazer agora/i)).toBeInTheDocument();
  });
});
