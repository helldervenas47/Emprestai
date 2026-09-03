import React, { useMemo } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  Save,
  Trash2,
  Edit2,
  Copy,
  Play,
  MoreVertical,
  Loader2,
  Calendar,
  DollarSign,
  Tag,
  ArrowUpDown,
  FileText,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { addMonths, startOfMonth, endOfMonth, format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categoryConfig } from "./constants";
import type { Category } from "./types";
import { useSavedFilters, FilterState } from "@/features/loans/hooks/useSavedFilters";

export type DueDateQuick = "yesterday" | "today" | "tomorrow" | null;
export type NotesFilter = "all" | "with" | "without";
export type SortBy = "dueDate" | "startDate" | "amount" | "name";

/* -------------------------------------------------------------------------- */
/*                        NÍVEL 1 — FILTROS RÁPIDOS DE STATUS                 */
/* -------------------------------------------------------------------------- */

interface LoanCategoryChipsProps {
  selectedCategories: Category[];
  counts: Record<string, number>;
  onCategoryClick: (id: Category) => void;
}

export function LoanCategoryChips({
  selectedCategories,
  counts,
  onCategoryClick,
}: LoanCategoryChipsProps) {
  return (
    <div className="w-full overflow-x-auto no-scrollbar py-0.5">
      <div className="flex items-center gap-1.5 min-w-max">
        {categoryConfig.map((cat) => {
          const isActive = selectedCategories.includes(cat.id);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCategoryClick(cat.id)}
              aria-pressed={isActive}
              className={[
                "inline-flex items-center gap-1.5 h-8.5 px-3 rounded-full text-xs font-semibold whitespace-nowrap",
                "transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                isActive
                  ? `${cat.activeColor} shadow-sm scale-[1.02]`
                  : `bg-card/70 border border-border/70 dark:border-white/10 ${cat.color} hover:bg-muted/70 hover:border-primary/40`,
              ].join(" ")}
            >
              <span>{cat.label}</span>
              <span
                className={[
                  "inline-flex items-center justify-center min-w-[18px] h-4.5 px-1.5 rounded-full text-[10px] font-bold tabular-nums",
                  isActive
                    ? "bg-black/20 dark:bg-white/20 text-current"
                    : "bg-muted/80 text-muted-foreground",
                ].join(" ")}
              >
                {counts[cat.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         BARRA DE BUSCA E BOTÃO FILTROS                     */
/* -------------------------------------------------------------------------- */

interface LoanSearchBarProps {
  search: string;
  setSearch: (v: string) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  hasActiveFilters: boolean;
  activeFiltersCount?: number;
}

export function LoanSearchBar({
  search,
  setSearch,
  showFilters,
  setShowFilters,
  hasActiveFilters,
  activeFiltersCount = 0,
}: LoanSearchBarProps) {
  return (
    <>
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
        <Input
          placeholder="Buscar cliente, contrato ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar empréstimos"
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
        variant={showFilters ? "default" : "outline"}
        size="sm"
        onClick={() => setShowFilters(!showFilters)}
        className="gap-1.5 h-11 rounded-xl px-3.5 shrink-0 font-medium"
        aria-label="Alternar filtros"
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden sm:inline">
          {showFilters ? "Ocultar filtros" : "Filtros"}
        </span>
        {showFilters ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        {hasActiveFilters && !showFilters && activeFiltersCount > 0 && (
          <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 h-5 px-1.5 text-[11px] font-bold rounded-full ml-0.5">
            {activeFiltersCount}
          </Badge>
        )}
      </Button>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                         FILTROS RÁPIDOS DE VENCIMENTO                      */
/* -------------------------------------------------------------------------- */

interface LoanQuickDateFiltersProps {
  dueDateQuick: DueDateQuick;
  setDueDateQuick: (v: DueDateQuick) => void;
}

export function LoanQuickDateFilters({ dueDateQuick, setDueDateQuick }: LoanQuickDateFiltersProps) {
  const filters = [
    { id: "yesterday" as const, label: "Ontem" },
    { id: "today" as const, label: "Hoje" },
    { id: "tomorrow" as const, label: "Amanhã" },
  ];
  return (
    <div className="flex w-full bg-muted/60 rounded-xl p-0.5 backdrop-blur-sm border border-border/30">
      {filters.map((f) => (
        <button
          type="button"
          key={f.id}
          onClick={() => setDueDateQuick(dueDateQuick === f.id ? null : f.id)}
          className={`flex-1 flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
            dueDateQuick === f.id
              ? "bg-card text-foreground shadow-sm font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        NÍVEL 2 — BARRA DE FILTROS SALVOS                   */
/* -------------------------------------------------------------------------- */

interface LoanSavedFiltersBarProps {
  currentFilterState: FilterState;
  applyFilterState: (state: FilterState) => void;
  hasActiveFilters: boolean;
}

export function LoanSavedFiltersBar({
  currentFilterState,
  applyFilterState,
  hasActiveFilters,
}: LoanSavedFiltersBarProps) {
  const {
    savedFilters,
    saveFilter,
    deleteFilter,
    renameFilter,
    duplicateFilter,
    maxLimit,
    loading,
  } = useSavedFilters();

  const handleSaveFilter = () => {
    const name = prompt("Nome do filtro (ex: Atrasados x Nome):");
    if (name && name.trim()) {
      saveFilter(name.trim(), currentFilterState);
    }
  };

  if (loading) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold shrink-0 mr-1">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="hidden sm:inline">Filtros salvos:</span>
      </div>

      <div className="flex items-center gap-1.5 min-w-max">
        {savedFilters.map((sf) => (
          <div
            key={sf.id}
            className="flex items-center bg-card/80 border border-border/60 rounded-xl overflow-hidden shadow-xs hover:border-primary/40 transition-colors"
          >
            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-foreground hover:text-primary transition-colors"
              onClick={() => applyFilterState(sf.state)}
              title={`Aplicar filtro: ${sf.name}`}
            >
              <Play className="h-2.5 w-2.5 text-primary fill-primary" />
              <span>{sf.name}</span>
            </button>

            <div className="px-0.5 border-l border-border/50">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem
                    onClick={() => {
                      const newName = prompt("Novo nome:", sf.name);
                      if (newName && newName.trim()) renameFilter(sf.id, newName.trim());
                    }}
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => duplicateFilter(sf.id)}>
                    <Copy className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (confirm(`Excluir o filtro "${sf.name}"?`)) deleteFilter(sf.id);
                    }}
                    className="text-destructive focus:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}

        {hasActiveFilters && savedFilters.length < maxLimit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveFilter}
            className="h-7 px-2 text-xs rounded-xl border border-dashed border-border/80 hover:border-primary/50 text-muted-foreground hover:text-foreground gap-1"
          >
            <Save className="h-3 w-3" />
            <span>+ Salvar filtro atual</span>
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        NÍVEL 3 — BARRA DE FILTROS ATIVOS                   */
/* -------------------------------------------------------------------------- */

interface LoanActiveFiltersBarProps {
  filterState: FilterState;
  search: string;
  setSearch: (v: string) => void;
  allTags: string[];
  formatCurrency: (v: number) => string;
  onRemoveCategory: (cat: Category) => void;
  onClearCategories: () => void;
  onClearDueDateQuick: () => void;
  onClearDateRange: () => void;
  onClearDueDateRange: () => void;
  onClearAmountMin: () => void;
  onClearAmountMax: () => void;
  onClearTag: () => void;
  onClearNotesFilter: () => void;
  onClearNotesSearch: () => void;
  onClearSearch: () => void;
  onClearAll: () => void;
}

export function LoanActiveFiltersBar({
  filterState,
  search,
  formatCurrency,
  onRemoveCategory,
  onClearCategories,
  onClearDueDateQuick,
  onClearDateRange,
  onClearDueDateRange,
  onClearAmountMin,
  onClearAmountMax,
  onClearTag,
  onClearNotesFilter,
  onClearNotesSearch,
  onClearSearch,
  onClearAll,
}: LoanActiveFiltersBarProps) {
  const activeChips: { id: string; label: string; onRemove: () => void }[] = [];

  // Categorias ativas (se não for "all")
  if (
    filterState.selectedCategories.length > 0 &&
    !(filterState.selectedCategories.length === 1 && filterState.selectedCategories[0] === "all")
  ) {
    filterState.selectedCategories.forEach((catId) => {
      const cfg = categoryConfig.find((c) => c.id === catId);
      if (cfg) {
        activeChips.push({
          id: `cat-${catId}`,
          label: cfg.label,
          onRemove: () => onRemoveCategory(catId),
        });
      }
    });
  }

  // Busca textual
  if (search.trim()) {
    activeChips.push({
      id: "search",
      label: `Busca: "${search.trim()}"`,
      onRemove: onClearSearch,
    });
  }

  // Vencimento rápido (Ontem, Hoje, Amanhã)
  if (filterState.dueDateQuick) {
    const quickLabels: Record<string, string> = {
      yesterday: "Vencimento: Ontem",
      today: "Vencimento: Hoje",
      tomorrow: "Vencimento: Amanhã",
    };
    activeChips.push({
      id: "due-quick",
      label: quickLabels[filterState.dueDateQuick] || "Vencimento rápido",
      onRemove: onClearDueDateQuick,
    });
  }

  // Período de Vencimento
  if (filterState.dueDateFrom || filterState.dueDateTo) {
    let lbl = "Vencimento: ";
    if (filterState.dueDateFrom && filterState.dueDateTo) {
      lbl += `${filterState.dueDateFrom} a ${filterState.dueDateTo}`;
    } else if (filterState.dueDateFrom) {
      lbl += `a partir de ${filterState.dueDateFrom}`;
    } else {
      lbl += `até ${filterState.dueDateTo}`;
    }
    activeChips.push({
      id: "due-range",
      label: lbl,
      onRemove: onClearDueDateRange,
    });
  }

  // Período de Saída
  if (filterState.dateFrom || filterState.dateTo) {
    let lbl = "Saída: ";
    if (filterState.dateFrom && filterState.dateTo) {
      lbl += `${filterState.dateFrom} a ${filterState.dateTo}`;
    } else if (filterState.dateFrom) {
      lbl += `a partir de ${filterState.dateFrom}`;
    } else {
      lbl += `até ${filterState.dateTo}`;
    }
    activeChips.push({
      id: "date-range",
      label: lbl,
      onRemove: onClearDateRange,
    });
  }

  // Valor Mínimo
  if (filterState.amountMin) {
    activeChips.push({
      id: "amt-min",
      label: `Min: R$ ${filterState.amountMin}`,
      onRemove: onClearAmountMin,
    });
  }

  // Valor Máximo
  if (filterState.amountMax) {
    activeChips.push({
      id: "amt-max",
      label: `Max: R$ ${filterState.amountMax}`,
      onRemove: onClearAmountMax,
    });
  }

  // Etiqueta
  if (filterState.tagFilter) {
    activeChips.push({
      id: "tag",
      label: `Etiqueta: ${filterState.tagFilter}`,
      onRemove: onClearTag,
    });
  }

  // Observação (status)
  if (filterState.notesFilter === "with") {
    activeChips.push({
      id: "notes-with",
      label: "Com observação",
      onRemove: onClearNotesFilter,
    });
  } else if (filterState.notesFilter === "without") {
    activeChips.push({
      id: "notes-without",
      label: "Sem observação",
      onRemove: onClearNotesFilter,
    });
  }

  // Observação (texto)
  if (filterState.notesSearch.trim()) {
    activeChips.push({
      id: "notes-text",
      label: `Obs: "${filterState.notesSearch.trim()}"`,
      onRemove: onClearNotesSearch,
    });
  }

  if (activeChips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap pt-1 pb-0.5">
      <span className="text-xs font-semibold text-muted-foreground">Filtros ativos:</span>

      <div className="flex items-center gap-1.5 flex-wrap">
        {activeChips.map((chip) => (
          <Badge
            key={chip.id}
            variant="secondary"
            className="h-6 pl-2.5 pr-1 text-xs font-medium rounded-lg gap-1 bg-muted/80 hover:bg-muted text-foreground border border-border/50"
          >
            <span>{chip.label}</span>
            <button
              type="button"
              onClick={chip.onRemove}
              className="h-4 w-4 rounded-md inline-flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground"
              title="Remover filtro"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}

        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg gap-1 font-semibold"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Limpar todos</span>
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                       NÍVEL 4 — PAINEL DE FILTROS AVANÇADOS                */
/* -------------------------------------------------------------------------- */

interface LoanAdvancedFiltersProps {
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  dueDateFrom: string;
  setDueDateFrom: (v: string) => void;
  dueDateTo: string;
  setDueDateTo: (v: string) => void;
  amountMin: string;
  setAmountMin: (v: string) => void;
  amountMax: string;
  setAmountMax: (v: string) => void;
  tagFilter: string;
  setTagFilter: (v: string) => void;
  allTags: string[];
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  notesFilter: NotesFilter;
  setNotesFilter: (v: NotesFilter) => void;
  notesSearch: string;
  setNotesSearch: (v: string) => void;
  dueDateQuick?: DueDateQuick;
  setDueDateQuick?: (v: DueDateQuick) => void;
  currentFilterState: FilterState;
  applyFilterState: (state: FilterState) => void;
  onClose?: () => void;
}

export function LoanAdvancedFilters({
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  dueDateFrom,
  setDueDateFrom,
  dueDateTo,
  setDueDateTo,
  amountMin,
  setAmountMin,
  amountMax,
  setAmountMax,
  tagFilter,
  setTagFilter,
  allTags,
  sortBy,
  setSortBy,
  notesFilter,
  setNotesFilter,
  notesSearch,
  setNotesSearch,
  currentFilterState,
  onClose,
}: LoanAdvancedFiltersProps) {
  const { saveFilter, maxLimit, savedFilters } = useSavedFilters();

  const clearAll = () => {
    setDateFrom("");
    setDateTo("");
    setDueDateFrom("");
    setDueDateTo("");
    setAmountMin("");
    setAmountMax("");
    setTagFilter("");
    setNotesFilter("all");
    setSortBy("dueDate");
    setNotesSearch("");
  };

  const handleSaveFilter = () => {
    const name = prompt("Nome do filtro (ex: Atrasados x Nome):");
    if (name && name.trim()) {
      saveFilter(name.trim(), currentFilterState);
    }
  };

  // Funções de atalho para o mês de vencimento
  const handleMonthChange = (offset: number) => {
    const cursor = dueDateFrom && isValid(parseISO(dueDateFrom)) ? parseISO(dueDateFrom) : new Date();
    const nextDate = addMonths(cursor, offset);
    setDueDateFrom(format(startOfMonth(nextDate), "yyyy-MM-dd"));
    setDueDateTo(format(endOfMonth(nextDate), "yyyy-MM-dd"));
  };

  const setShortcutToday = () => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    setDueDateFrom(todayStr);
    setDueDateTo(todayStr);
  };

  const setShortcutCurrentMonth = () => {
    const now = new Date();
    setDueDateFrom(format(startOfMonth(now), "yyyy-MM-dd"));
    setDueDateTo(format(endOfMonth(now), "yyyy-MM-dd"));
  };

  const setShortcutNextMonth = () => {
    const next = addMonths(new Date(), 1);
    setDueDateFrom(format(startOfMonth(next), "yyyy-MM-dd"));
    setDueDateTo(format(endOfMonth(next), "yyyy-MM-dd"));
  };

  const setShortcutPrevMonth = () => {
    const prev = addMonths(new Date(), -1);
    setDueDateFrom(format(startOfMonth(prev), "yyyy-MM-dd"));
    setDueDateTo(format(endOfMonth(prev), "yyyy-MM-dd"));
  };

  const hasActiveAdvancedFilters = Boolean(
    dateFrom ||
      dateTo ||
      dueDateFrom ||
      dueDateTo ||
      amountMin ||
      amountMax ||
      tagFilter ||
      notesSearch.trim() ||
      notesFilter !== "all"
  );

  const cursorDate = dueDateFrom && isValid(parseISO(dueDateFrom)) ? parseISO(dueDateFrom) : new Date();
  const currentMonthDisplay = format(cursorDate, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <Card className="border border-border/70 dark:border-white/10 bg-card/80 shadow-sm backdrop-blur-xl rounded-2xl animate-in fade-in duration-200">
      <CardContent className="p-4 sm:p-5 space-y-5">
        {/* SEÇÃO 1: Mês do Vencimento & Atalhos Rápidos */}
        <div className="p-4 rounded-xl bg-muted/40 border border-border/40 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <Label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                Mês do Vencimento
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Atalho rápido para preencher automaticamente o período de vencimento.
              </p>
            </div>

            {/* Navegador de Mês */}
            <div className="flex items-center gap-1.5 bg-background border border-border/60 rounded-xl px-1.5 h-9 shadow-xs">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg hover:bg-muted"
                onClick={() => handleMonthChange(-1)}
                title="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <span className="text-xs font-bold capitalize px-2 min-w-[130px] text-center select-none text-foreground">
                {currentMonthDisplay}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg hover:bg-muted"
                onClick={() => handleMonthChange(1)}
                title="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Botões de Atalhos Rápidos */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/30">
            <span className="text-[11px] text-muted-foreground font-medium mr-1">Atalhos:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={setShortcutToday}
              className="h-7 px-2.5 text-xs rounded-lg bg-background/80"
            >
              Hoje
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={setShortcutCurrentMonth}
              className="h-7 px-2.5 text-xs rounded-lg bg-background/80"
            >
              Este mês
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={setShortcutNextMonth}
              className="h-7 px-2.5 text-xs rounded-lg bg-background/80"
            >
              Próximo mês
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={setShortcutPrevMonth}
              className="h-7 px-2.5 text-xs rounded-lg bg-background/80"
            >
              Mês anterior
            </Button>
            {dueDateFrom && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDueDateFrom("");
                  setDueDateTo("");
                }}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive ml-auto"
              >
                Limpar datas
              </Button>
            )}
          </div>
        </div>

        {/* SEÇÃO 2: Grade de Campos Avançados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Período de Saída */}
          <div className="space-y-2 p-3 rounded-xl bg-card/60 border border-border/40">
            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              Período de Saída
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">De</span>
                <DatePickerField value={dateFrom} onChange={(v) => setDateFrom(v)} className="h-8.5 text-xs" />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">Até</span>
                <DatePickerField value={dateTo} onChange={(v) => setDateTo(v)} className="h-8.5 text-xs" />
              </div>
            </div>
          </div>

          {/* Período de Vencimento */}
          <div className="space-y-2 p-3 rounded-xl bg-card/60 border border-border/40">
            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              Período de Vencimento
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">De</span>
                <DatePickerField value={dueDateFrom} onChange={(v) => setDueDateFrom(v)} className="h-8.5 text-xs" />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">Até</span>
                <DatePickerField value={dueDateTo} onChange={(v) => setDueDateTo(v)} className="h-8.5 text-xs" />
              </div>
            </div>
          </div>

          {/* Valores (Min / Max) */}
          <div className="space-y-2 p-3 rounded-xl bg-card/60 border border-border/40">
            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
              Faixa de Valor (R$)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">Mínimo</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  className="h-8.5 text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">Máximo</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Sem limite"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  className="h-8.5 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Ordenação & Etiqueta */}
          <div className="space-y-2 p-3 rounded-xl bg-card/60 border border-border/40">
            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-purple" />
              Etiqueta & Ordenação
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">Etiqueta</span>
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="flex h-8.5 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Todas</option>
                  {allTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">Ordenar</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="flex h-8.5 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="dueDate">Vencimento</option>
                  <option value="startDate">Data Saída</option>
                  <option value="amount">Valor</option>
                  <option value="name">Nome</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* SEÇÃO 3: Filtro por Observação */}
        <div className="p-3 rounded-xl bg-card/60 border border-border/40 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-1.5">
              <FileText className="h-3.5 w-3.5 text-amber-500" />
              Presença de Observação
            </Label>
            <select
              value={notesFilter}
              onChange={(e) => setNotesFilter(e.target.value as NotesFilter)}
              className="flex h-8.5 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">Todas as observações</option>
              <option value="with">Apenas com observação</option>
              <option value="without">Apenas sem observação</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <Label className="text-xs font-bold text-foreground mb-1.5 block">
              Pesquisar texto na observação
            </Label>
            <div className="relative">
              <Input
                value={notesSearch}
                onChange={(e) => setNotesSearch(e.target.value)}
                placeholder="Ex: renegociado, ligar depois, garantia..."
                aria-label="Buscar na observação"
                className="h-8.5 text-xs pr-8"
              />
              {notesSearch && (
                <button
                  type="button"
                  onClick={() => setNotesSearch("")}
                  aria-label="Limpar busca na observação"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* SEÇÃO 4: Rodapé de Ações do Painel */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-border/40">
          <div className="flex items-center gap-2">
            {hasActiveAdvancedFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveFilter}
                disabled={savedFilters.length >= maxLimit}
                className="h-8.5 text-xs gap-1.5 rounded-xl border-border/80"
              >
                <Save className="h-3.5 w-3.5 text-primary" />
                <span>Salvar combinação atual</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={!hasActiveAdvancedFilters}
              className="h-8.5 text-xs text-muted-foreground hover:text-destructive gap-1 rounded-xl"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Limpar filtros</span>
            </Button>

            {onClose && (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onClose}
                className="h-8.5 text-xs px-4 rounded-xl font-medium"
              >
                Aplicar e Fechar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
