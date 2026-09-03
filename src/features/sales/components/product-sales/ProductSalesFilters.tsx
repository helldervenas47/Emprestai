import { Search, LayoutGrid, Folder, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

type ViewMode = "cards" | "folders";

interface Props {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  search: string;
  setSearch: (v: string) => void;
  folderCount: number;
  filteredCount: number;
  totalAmount: number;
  formatCurrency: (v: number) => string;
  activeFilterCount: number;
  showFilters: boolean;
  onToggleFilters: () => void;
  onClearFilters: () => void;
  filterPanel: ReactNode;
}

export function ProductSalesFilters({
  view,
  setView,
  search,
  setSearch,
  folderCount,
  filteredCount,
  totalAmount,
  formatCurrency,
  activeFilterCount,
  showFilters,
  onToggleFilters,
  onClearFilters,
  filterPanel,
}: Props) {
  return (
    <>
      {/* View toggle */}
      <div className="w-full">
        <div className="bg-muted/50 rounded-xl p-1 flex gap-0.5 w-full">
          <button type="button"
            onClick={() => setView("cards")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
              view === "cards" ? "bg-card text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />Cards
          </button>
          <button type="button"
            onClick={() => setView("folders")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
              view === "folders" ? "bg-card text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Folder className="h-3.5 w-3.5" />Pastas ({folderCount})
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          <Input
            placeholder="Buscar nº da venda, cliente ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 rounded-xl bg-card/60 border-border/70 dark:border-white/10 focus-visible:border-primary/50 focus-visible:ring-primary/30"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          variant={showFilters || activeFilterCount > 0 ? "default" : "outline"}
          size="sm"
          onClick={onToggleFilters}
          className="gap-1.5 h-11 rounded-xl px-4 shrink-0"
          aria-label="Alternar filtros de vendas"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filtros</span>
          {activeFilterCount > 0 && (
            <Badge className="bg-destructive text-destructive-foreground h-4 min-w-4 px-1 flex items-center justify-center text-[10px] rounded-full tabular-nums">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      {showFilters && filterPanel}

      {activeFilterCount > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{activeFilterCount}</span> filtro{activeFilterCount > 1 ? "s" : ""} ativo{activeFilterCount > 1 ? "s" : ""}
          </p>
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Limpar filtros
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <p className="text-xs text-muted-foreground">{filteredCount} lançamento(s)</p>
        <p className="text-lg font-bold">{formatCurrency(totalAmount)}</p>
      </div>
    </>
  );
}
