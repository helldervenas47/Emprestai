import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductSalesSummaryCards } from "../ProductSalesSummaryCards";

describe("ProductSalesSummaryCards — Padrão visual dos cards de Empréstimos", () => {
  it("renderiza os 4 cards na ordem correta: Atrasados, Vence Hoje, Em Dia, Total a Receber", () => {
    const onSelect = vi.fn();
    render(
      <ProductSalesSummaryCards
        formatCurrency={(v) => `R$ ${v.toFixed(2)}`}
        totalOverdue={520}
        totalDueToday={195}
        totalOnTrack={585}
        totalAReceber={3705}
        overdueCount={1}
        dueTodayCount={1}
        onTrackCount={2}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText("Atrasados")).toBeInTheDocument();
    expect(screen.getByText("Em atraso")).toBeInTheDocument();
    expect(screen.getByText("R$ 520.00")).toBeInTheDocument();

    expect(screen.getByText("Vence Hoje")).toBeInTheDocument();
    expect(screen.getByText("Para receber hoje")).toBeInTheDocument();
    expect(screen.getByText("R$ 195.00")).toBeInTheDocument();

    expect(screen.getByText("Em Dia")).toBeInTheDocument();
    expect(screen.getByText("Contratos regulares")).toBeInTheDocument();
    expect(screen.getByText("R$ 585.00")).toBeInTheDocument();

    expect(screen.getByText("Total a Receber")).toBeInTheDocument();
    expect(screen.getByText("Carteira ativa")).toBeInTheDocument();
    expect(screen.getByText("R$ 3705.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Vence Hoje/i }));
    expect(onSelect).toHaveBeenCalledWith("due_today");
  });
});
