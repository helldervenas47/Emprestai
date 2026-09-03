import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  LoanCategoryChips,
  LoanSearchBar,
  LoanQuickDateFilters,
  LoanSavedFiltersBar,
  LoanActiveFiltersBar,
  LoanAdvancedFilters,
} from "../LoanListFilters";
import { FilterState } from "@/features/loans/hooks/useSavedFilters";

const mockSaveFilter = vi.fn();
const mockDeleteFilter = vi.fn();
const mockRenameFilter = vi.fn();
const mockDuplicateFilter = vi.fn();

vi.mock("@/features/loans/hooks/useSavedFilters", () => ({
  useSavedFilters: () => ({
    savedFilters: [
      {
        id: "filter-1",
        name: "Atrasados x Nome",
        state: {
          selectedCategories: ["overdue"],
          dueDateQuick: null,
          dateFrom: "",
          dateTo: "",
          dueDateFrom: "",
          dueDateTo: "",
          amountMin: "",
          amountMax: "",
          tagFilter: "",
          notesFilter: "all",
          notesSearch: "",
          sortBy: "name",
        },
      },
    ],
    loading: false,
    saveFilter: mockSaveFilter,
    deleteFilter: mockDeleteFilter,
    renameFilter: mockRenameFilter,
    duplicateFilter: mockDuplicateFilter,
    maxLimit: 5,
  }),
}));

const defaultFilterState: FilterState = {
  selectedCategories: ["all"],
  dueDateQuick: null,
  dateFrom: "",
  dateTo: "",
  dueDateFrom: "",
  dueDateTo: "",
  amountMin: "",
  amountMax: "",
  tagFilter: "",
  notesFilter: "all",
  notesSearch: "",
  sortBy: "dueDate",
};

describe("LoanListFilters — UX/UI dos Filtros de Empréstimos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Nível 1 — LoanCategoryChips (Status Rápidos)", () => {
    it("renderiza todos os status e contadores de forma compacta", () => {
      const counts = {
        all: 146,
        overdue: 42,
        paid_interest: 45,
        due_today: 13,
        on_track: 91,
        parcelado: 13,
        venda: 8,
        paid: 25,
      };
      const onCategoryClick = vi.fn();

      render(
        <LoanCategoryChips
          selectedCategories={["all"]}
          counts={counts}
          onCategoryClick={onCategoryClick}
        />
      );

      expect(screen.getByText("Todos")).toBeInTheDocument();
      expect(screen.getByText("146")).toBeInTheDocument();
      expect(screen.getByText("Atrasados")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("Juros")).toBeInTheDocument();
      expect(screen.getByText("45")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Atrasados"));
      expect(onCategoryClick).toHaveBeenCalledWith("overdue");
    });
  });

  describe("Nível 2 — LoanSavedFiltersBar (Filtros Salvos)", () => {
    it("renderiza chips compactos de filtros salvos e permite aplicar", () => {
      const applyFilterState = vi.fn();

      render(
        <LoanSavedFiltersBar
          currentFilterState={defaultFilterState}
          applyFilterState={applyFilterState}
          hasActiveFilters={true}
        />
      );

      expect(screen.getByText("Atrasados x Nome")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Atrasados x Nome"));
      expect(applyFilterState).toHaveBeenCalledWith(
        expect.objectContaining({ selectedCategories: ["overdue"], sortBy: "name" })
      );
    });

    it("exibe o botão para salvar filtro atual quando há filtros ativos", () => {
      render(
        <LoanSavedFiltersBar
          currentFilterState={{ ...defaultFilterState, tagFilter: "VIP" }}
          applyFilterState={vi.fn()}
          hasActiveFilters={true}
        />
      );

      expect(screen.getByText("+ Salvar filtro atual")).toBeInTheDocument();
    });
  });

  describe("Nível 3 — LoanActiveFiltersBar (Filtros Ativos com remoção individual)", () => {
    it("renderiza chips de filtros aplicados e aciona remoção individual", () => {
      const onRemoveCategory = vi.fn();
      const onClearDateRange = vi.fn();
      const onClearTag = vi.fn();
      const onClearAll = vi.fn();

      const activeState: FilterState = {
        ...defaultFilterState,
        selectedCategories: ["overdue"],
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        tagFilter: "VIP",
      };

      render(
        <LoanActiveFiltersBar
          filterState={activeState}
          search=""
          setSearch={vi.fn()}
          allTags={["VIP"]}
          formatCurrency={(v) => `R$ ${v}`}
          onRemoveCategory={onRemoveCategory}
          onClearCategories={vi.fn()}
          onClearDueDateQuick={vi.fn()}
          onClearDateRange={onClearDateRange}
          onClearDueDateRange={vi.fn()}
          onClearAmountMin={vi.fn()}
          onClearAmountMax={vi.fn()}
          onClearTag={onClearTag}
          onClearNotesFilter={vi.fn()}
          onClearNotesSearch={vi.fn()}
          onClearSearch={vi.fn()}
          onClearAll={onClearAll}
        />
      );

      expect(screen.getByText("Atrasados")).toBeInTheDocument();
      expect(screen.getByText("Saída: 2026-08-01 a 2026-08-31")).toBeInTheDocument();
      expect(screen.getByText("Etiqueta: VIP")).toBeInTheDocument();
      expect(screen.getByText("Limpar todos")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Limpar todos"));
      expect(onClearAll).toHaveBeenCalled();
    });
  });

  describe("Nível 4 — LoanAdvancedFilters (Painel Expansível de Filtros Avançados)", () => {
    it("permite utilizar os atalhos rápidos de mês de vencimento", () => {
      const setDueDateFrom = vi.fn();
      const setDueDateTo = vi.fn();

      render(
        <LoanAdvancedFilters
          dateFrom=""
          setDateFrom={vi.fn()}
          dateTo=""
          setDateTo={vi.fn()}
          dueDateFrom=""
          setDueDateFrom={setDueDateFrom}
          dueDateTo=""
          setDueDateTo={setDueDateTo}
          amountMin=""
          setAmountMin={vi.fn()}
          amountMax=""
          setAmountMax={vi.fn()}
          tagFilter=""
          setTagFilter={vi.fn()}
          allTags={["VIP", "Bronze"]}
          sortBy="dueDate"
          setSortBy={vi.fn()}
          notesFilter="all"
          setNotesFilter={vi.fn()}
          notesSearch=""
          setNotesSearch={vi.fn()}
          currentFilterState={defaultFilterState}
          applyFilterState={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText(/mês do vencimento/i)).toBeInTheDocument();
      expect(screen.getByText("Hoje")).toBeInTheDocument();
      expect(screen.getByText("Este mês")).toBeInTheDocument();
      expect(screen.getByText("Próximo mês")).toBeInTheDocument();
      expect(screen.getByText("Mês anterior")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Este mês"));
      expect(setDueDateFrom).toHaveBeenCalled();
      expect(setDueDateTo).toHaveBeenCalled();
    });
  });

  describe("LoanSearchBar (Barra de Busca e Toggle)", () => {
    it("exibe badge com contagem de filtros ativos e alterna o painel", () => {
      const setShowFilters = vi.fn();

      render(
        <LoanSearchBar
          search=""
          setSearch={vi.fn()}
          showFilters={false}
          setShowFilters={setShowFilters}
          hasActiveFilters={true}
          activeFiltersCount={3}
        />
      );

      expect(screen.getByText("Filtros")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Filtros"));
      expect(setShowFilters).toHaveBeenCalledWith(true);
    });
  });
});
