import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StockManager } from "../StockManager";

// Mock hooks
const mockProducts = [
  {
    id: "p1",
    name: "Produto A",
    description: "Descrição A",
    price: 100,
    cost: 40,
    lastPurchasePrice: 38,
    suggestedStock: 5,
    stock: 10,
    active: true,
    createdAt: "2026-01-01T10:00:00Z",
  },
  {
    id: "p2",
    name: "Produto B",
    description: "Descrição B",
    price: 50,
    cost: 20,
    lastPurchasePrice: 20,
    suggestedStock: 5,
    stock: 2, // Estoque baixo
    active: true,
    createdAt: "2026-01-02T10:00:00Z",
  },
  {
    id: "p3",
    name: "Produto C",
    description: "Descrição C",
    price: 30,
    cost: 10,
    lastPurchasePrice: 10,
    suggestedStock: 5,
    stock: 0, // Sem estoque
    active: true,
    createdAt: "2026-01-03T10:00:00Z",
  },
];

vi.mock("@/features/sales/hooks/useProducts", () => ({
  useProducts: () => ({
    products: mockProducts,
    addProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
  }),
}));

vi.mock("@/features/financial/hooks/useExpenses", () => ({
  useExpenses: () => ({
    addExpense: vi.fn(),
    payExpense: vi.fn(),
  }),
}));

vi.mock("@/features/sales/hooks/useStockMovements", () => ({
  useStockMovements: () => ({
    movements: [
      {
        id: "m1",
        productId: "p1",
        productName: "Produto A",
        type: "entrada_manual",
        quantity: 10,
        unitCost: null,
        totalValue: null,
        expenseId: null,
        saleId: null,
        notes: null,
        createdAt: "2026-01-01T10:00:00Z",
      },
    ],
    recordMovement: vi.fn(),
    deleteMovement: vi.fn(),
  }),
}));

vi.mock("@/hooks/useDataOwner", () => ({
  useDataOwner: () => "owner-123",
}));

describe("StockManager — Painel de Estoque", () => {
  it("renderiza os 4 indicadores de estoque (venda, custo, lucro potencial, unidades)", () => {
    render(<StockManager />);

    expect(screen.getByText(/Valor de Venda/i)).toBeInTheDocument();
    expect(screen.getByText(/Custo do Estoque/i)).toBeInTheDocument();
    expect(screen.getByText(/Lucro Potencial/i)).toBeInTheDocument();
    expect(screen.getByText(/Unidades/i)).toBeInTheDocument();

    // Total venda: (100 * 10) + (50 * 2) + (30 * 0) = 1100
    expect(screen.getByText(/R\$\s*1\.100,00/i)).toBeInTheDocument();
    // Total custo: (40 * 10) + (20 * 2) + (10 * 0) = 440
    expect(screen.getByText(/R\$\s*440,00/i)).toBeInTheDocument();
    // Lucro potencial: 1100 - 440 = 660
    expect(screen.getByText(/R\$\s*660,00/i)).toBeInTheDocument();
    // Total unidades: 10 + 2 + 0 = 12
    expect(screen.getByText(/12/i)).toBeInTheDocument();
  });

  it("exibe o banner de alerta para produtos com estoque baixo ou zerado", () => {
    render(<StockManager />);

    expect(
      screen.getByText(/Atenção para reposição de estoque/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/1 produto sem estoque/i)).toBeInTheDocument();
    expect(screen.getByText(/1 produto abaixo do mínimo/i)).toBeInTheDocument();
  });

  it("filtra produtos ao clicar no chip de 'Estoque baixo'", () => {
    render(<StockManager />);

    const lowStockChips = screen.getAllByRole("button", {
      name: /estoque baixo/i,
    });
    fireEvent.click(lowStockChips[0]);

    // Produto B deve estar visível
    expect(screen.getAllByText("Produto B").length).toBeGreaterThan(0);
    // Produto A (com 10 unidades) não deve estar na lista filtrada
    expect(screen.queryByText("Produto A")).not.toBeInTheDocument();
  });

  it("abre o diálogo de ajuste ao clicar no botão 'Ajuste de estoque'", () => {
    render(<StockManager />);

    const adjustBtn = screen.getByRole("button", { name: /Ajuste de estoque/i });
    expect(adjustBtn).toBeInTheDocument();
    fireEvent.click(adjustBtn);

    expect(screen.getByText(/Ajuste \/ Baixa de Estoque/i)).toBeInTheDocument();
  });

  it("abre o diálogo de ajuste ao receber o evento 'open-stock-adjust'", async () => {
    render(<StockManager />);

    fireEvent(window, new CustomEvent("open-stock-adjust"));

    expect(await screen.findByText(/Ajuste \/ Baixa de Estoque/i)).toBeInTheDocument();
  });

  it("alterna para movimentações ao clicar no botão flutuante e volta para o estoque", () => {
    render(<StockManager />);

    const movBtn = screen.getByRole("button", { name: /Movimentações/i });
    expect(movBtn).toBeInTheDocument();
    fireEvent.click(movBtn);

    expect(screen.getByText(/Movimentações de Estoque/i)).toBeInTheDocument();

    const backBtns = screen.getAllByRole("button", { name: /Voltar ao estoque/i });
    expect(backBtns.length).toBeGreaterThan(0);
    fireEvent.click(backBtns[0]);

    expect(screen.getByText(/Painel de Estoque/i)).toBeInTheDocument();
  });
});
