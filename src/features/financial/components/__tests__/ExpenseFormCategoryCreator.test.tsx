import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { useBusinessExpenseCategories, DEFAULT_BUSINESS_CATEGORIES } from "@/features/financial/hooks/useBusinessExpenseCategories";
import { BusinessCategoryCreatorDialog } from "../BusinessCategoryCreatorDialog";
import { ExpenseForm } from "../ExpenseForm";

// Polyfill ResizeObserver for Radix UI Switch in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "test-user-1" } }),
}));

vi.mock("@/features/financial/hooks/useExpenses", () => ({
  useExpenses: () => ({
    expenses: [
      { id: "e1", description: "Marketing Digital", amount: 500, category: "Marketing", scope: "business" },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/usePaymentMethods", () => ({
  usePaymentMethods: () => ({
    activeMethods: [
      { id: "pm-pix", name: "Pix", active: true },
      { id: "pm-card", name: "Cartão de Crédito", active: true },
    ],
  }),
}));

vi.mock("@/features/creditCards/hooks/useCreditCards", () => ({
  useCreditCards: () => ({
    cards: [],
  }),
}));

describe("useBusinessExpenseCategories & BusinessCategoryCreatorDialog", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("retorna categorias padrão combinadas com as do histórico de despesas", () => {
    const { result } = renderHook(() => useBusinessExpenseCategories());

    expect(result.current.categories).toContain("Aluguel");
    expect(result.current.categories).toContain("Marketing");
    expect(result.current.categories.length).toBeGreaterThan(DEFAULT_BUSINESS_CATEGORIES.length);
  });

  it("permite adicionar uma nova categoria personalizada", () => {
    const { result } = renderHook(() => useBusinessExpenseCategories());

    act(() => {
      const added = result.current.addCategory("consultoria jurídica");
      expect(added).toBe("Consultoria jurídica");
    });

    expect(result.current.categories).toContain("Consultoria jurídica");
  });

  it("renderiza o diálogo de criação de categoria e executa callback ao salvar", () => {
    const onCreatedMock = vi.fn();
    const onOpenChangeMock = vi.fn();
    const addCategoryMock = vi.fn((name: string) => name);

    render(
      <BusinessCategoryCreatorDialog
        open={true}
        onOpenChange={onOpenChangeMock}
        onCreated={onCreatedMock}
        addCategory={addCategoryMock}
      />,
    );

    expect(screen.getByText("Nova Categoria Empresarial")).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ex\.: Marketing, Consultoria/i);
    fireEvent.change(input, { target: { value: "Softwares SaaS" } });

    const submitBtn = screen.getByRole("button", { name: /Criar Categoria/i });
    fireEvent.click(submitBtn);

    expect(addCategoryMock).toHaveBeenCalledWith("Softwares SaaS");
    expect(onCreatedMock).toHaveBeenCalledWith("Softwares SaaS");
    expect(onOpenChangeMock).toHaveBeenCalledWith(false);
  });

  it("renderiza o botão '+ Nova' e abre o modal de criação de categoria no ExpenseForm", () => {
    render(
      <ExpenseForm
        onAdd={vi.fn()}
        onClose={vi.fn()}
        scope="business"
      />,
    );

    const novaBtn = screen.getByRole("button", { name: /Nova/i });
    expect(novaBtn).toBeInTheDocument();

    fireEvent.click(novaBtn);

    expect(screen.getByText("Nova Categoria Empresarial")).toBeInTheDocument();
  });
});
