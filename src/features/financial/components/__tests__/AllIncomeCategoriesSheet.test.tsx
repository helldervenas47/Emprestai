import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AllIncomeCategoriesSheet } from "../AllIncomeCategoriesSheet";
import { Income } from "@/features/financial/hooks/useIncomes";
import { Sale } from "@/types/loan";

const mockIncomes = [
  {
    id: "inc-1",
    userId: "u1",
    description: "Salário Empresa",
    amount: 5000,
    category: "Salário",
    receivedDate: "2026-03-05",
    actualReceivedDate: "2026-03-05",
    status: "received",
    type: "fixa",
    scope: "personal",
    createdAt: "2026-03-01",
    updatedAt: "2026-03-01",
  },
  {
    id: "inc-2",
    userId: "u1",
    description: "Consultoria Freelance",
    amount: 2000,
    category: "Serviços",
    receivedDate: "2026-03-10",
    actualReceivedDate: "2026-03-10",
    status: "received",
    type: "variavel",
    scope: "personal",
    createdAt: "2026-03-01",
    updatedAt: "2026-03-01",
  },
  {
    id: "inc-prev",
    userId: "u1",
    description: "Salário Fevereiro",
    amount: 4000,
    category: "Salário",
    receivedDate: "2026-02-05",
    actualReceivedDate: "2026-02-05",
    status: "received",
    type: "fixa",
    scope: "personal",
    createdAt: "2026-02-01",
    updatedAt: "2026-02-01",
  },
] as unknown as Income[];

const mockSales: Sale[] = [
  {
    id: "sale-1",
    userId: "u1",
    customerName: "Carlos Silva",
    description: "Smartphone Venda",
    downPayment: 1000,
    date: "2026-03-12",
    category: "Vendas",
    status: "paid",
    totalAmount: 1000,
    paymentMethod: "pix",
    items: [],
  } as unknown as Sale,
];

describe("AllIncomeCategoriesSheet — Receitas por Categoria", () => {
  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  it("renderiza o cabeçalho com o seletor de mês, contagem de categorias e total", () => {
    render(
      <AllIncomeCategoriesSheet
        open={true}
        onOpenChange={vi.fn()}
        initialMonth="2026-03"
        incomes={mockIncomes.filter((i) => i.receivedDate.startsWith("2026-03"))}
        allIncomes={mockIncomes}
        sales={mockSales}
        methodName={() => "PIX"}
        clientNameById={new Map()}
        formatCurrency={formatCurrency}
      />,
    );

    expect(screen.getByText("Resumo por Categoria de Receitas")).toBeInTheDocument();
    expect(screen.getAllByText(/março de 2026/i).length).toBeGreaterThan(0);
    expect(screen.getByText("3 categorias")).toBeInTheDocument();
  });

  it("calcula o comparativo vs mês anterior para as categorias", () => {
    render(
      <AllIncomeCategoriesSheet
        open={true}
        onOpenChange={vi.fn()}
        initialMonth="2026-03"
        incomes={mockIncomes.filter((i) => i.receivedDate.startsWith("2026-03"))}
        allIncomes={mockIncomes}
        sales={mockSales}
        methodName={() => "PIX"}
        clientNameById={new Map()}
        formatCurrency={formatCurrency}
      />,
    );

    // Salário subiu de R$ 4.000 para R$ 5.000 (+25.0%)
    expect(screen.getAllByText(/\+25\.0%/i).length).toBeGreaterThan(0);

    // Serviços é novo neste mês
    expect(screen.getAllByText(/Nova neste mês/i).length).toBeGreaterThan(0);
  });

  it("permite navegar para uma categoria específica e ver seus lançamentos", () => {
    render(
      <AllIncomeCategoriesSheet
        open={true}
        onOpenChange={vi.fn()}
        initialMonth="2026-03"
        incomes={mockIncomes.filter((i) => i.receivedDate.startsWith("2026-03"))}
        allIncomes={mockIncomes}
        sales={mockSales}
        methodName={() => "PIX"}
        clientNameById={new Map()}
        formatCurrency={formatCurrency}
      />,
    );

    // Clica no card de Salário
    const salarioHeading = screen.getByRole("heading", { name: "Salário" });
    fireEvent.click(salarioHeading);

    // Deve exibir o lançamento de salário
    expect(screen.getByText("Salário Empresa")).toBeInTheDocument();
    expect(screen.getByText("Recebido")).toBeInTheDocument();
  });

  it("permite filtrar por busca de texto", () => {
    render(
      <AllIncomeCategoriesSheet
        open={true}
        onOpenChange={vi.fn()}
        initialMonth="2026-03"
        incomes={mockIncomes.filter((i) => i.receivedDate.startsWith("2026-03"))}
        allIncomes={mockIncomes}
        sales={mockSales}
        methodName={() => "PIX"}
        clientNameById={new Map()}
        formatCurrency={formatCurrency}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/Buscar por categoria, descrição/i);
    fireEvent.change(searchInput, { target: { value: "Consultoria" } });

    // Apenas Serviços deve ser listado nos cards
    expect(screen.getByRole("heading", { name: "Serviços" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Salário" })).not.toBeInTheDocument();
  });
});
