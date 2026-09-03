import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Plus, Receipt, History } from "lucide-react";
import { SpeedDialFab } from "@/components/navigation/SpeedDialFab";
import { TabSkeleton } from "@/components/navigation/TabSkeleton";

describe("SpeedDialFab", () => {
  const primary = { id: "primary", label: "Novo Aluguel", icon: Plus, onSelect: vi.fn() };
  const actions = [
    { id: "expense", label: "Registrar Despesa", icon: Receipt, onSelect: vi.fn() },
    { id: "history", label: "Histórico de Pagamentos", icon: History, onSelect: vi.fn() },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo(0, 0);
  });

  it("executa a ação principal diretamente quando não há ações secundárias", () => {
    render(<SpeedDialFab primary={primary} />);
    fireEvent.click(screen.getByRole("button", { name: "Novo Aluguel" }));
    expect(primary.onSelect).toHaveBeenCalledTimes(1);
  });

  it("expande e exibe todas as ações com ícone e texto", () => {
    render(<SpeedDialFab primary={primary} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir ações" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Novo Aluguel/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Registrar Despesa/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Histórico de Pagamentos/ })).toBeInTheDocument();
  });

  it("fecha o menu ao selecionar uma ação", () => {
    render(<SpeedDialFab primary={primary} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Registrar Despesa/ }));
    expect(actions[0].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("fecha ao pressionar Escape e ao clicar fora", () => {
    render(<SpeedDialFab primary={primary} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir ações" }));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir ações" }));
    act(() => {
      document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("não altera a posição de scroll ao abrir/fechar", () => {
    const spy = vi.spyOn(window, "scrollTo");
    render(<SpeedDialFab primary={primary} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir ações" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar ações" }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("expõe estado acessível para navegação por teclado", () => {
    render(<SpeedDialFab primary={primary} actions={actions} />);
    const trigger = screen.getByRole("button", { name: "Abrir ações" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Fechar ações" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("TabSkeleton", () => {
  it.each(["overview", "dashboard", "expenses", "products", "vehicles", "clients", "calendar", "reports", "system"])(
    "renderiza um esqueleto coerente para %s",
    (tab) => {
      const { unmount } = render(<TabSkeleton tab={tab} />);
      expect(screen.getByTestId(`tab-skeleton-${tab}`)).toBeInTheDocument();
      unmount();
    },
  );

  it("usa fallback genérico para abas desconhecidas", () => {
    render(<TabSkeleton tab="desconhecida" />);
    expect(screen.getByTestId("tab-skeleton-desconhecida")).toHaveAttribute("aria-busy", "true");
  });
});
