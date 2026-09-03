import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductSalesFilters } from "../ProductSalesFilters";

describe("ProductSalesFilters — Visualização por apenas Cards e Pastas", () => {
  it("exibe apenas as opções Cards e Pastas no controle de visualização", () => {
    const setView = vi.fn();
    render(
      <ProductSalesFilters
        view="cards"
        setView={setView}
        search=""
        setSearch={vi.fn()}
        folderCount={3}
        filteredCount={10}
        totalAmount={5000}
        formatCurrency={(v) => `R$ ${v}`}
        activeFilterCount={0}
        showFilters={false}
        onToggleFilters={vi.fn()}
        onClearFilters={vi.fn()}
        filterPanel={<div data-testid="panel" />}
      />
    );

    expect(screen.getByRole("button", { name: /cards/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pastas/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /lista/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /pastas/i }));
    expect(setView).toHaveBeenCalledWith("folders");
  });
});
