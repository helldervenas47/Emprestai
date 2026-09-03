import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PieChart,
  Search,
  Calendar,
  CheckCircle2,
  Clock,
  ChevronRight,
  ChevronLeft,
  Layers,
  ArrowLeft,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  DollarSign,
  User,
  CreditCard as PaymentIcon,
} from "lucide-react";
import { Income } from "@/features/financial/hooks/useIncomes";
import { Sale } from "@/types/loan";
import { CategoryEntry } from "@/features/financial/components/CategoryDetailsSheet";
import { displayIncomeCategory, incomeCategoryKey } from "@/features/financial/lib/incomeCategory";

export interface IncomeCategoryItem {
  name: string;
  value: number;
  count: number;
  color: string;
  entries: CategoryEntry[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMonth: string;
  incomes: Income[];
  allIncomes: Income[];
  sales?: Sale[];
  methodName: (id?: string | null) => string;
  clientNameById: Map<string, string>;
  initialCategory?: string | null;
  formatCurrency: (v: number) => string;
}

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--purple))",
  "hsl(var(--warning))",
  "hsl(var(--accent))",
  "hsl(var(--destructive))",
];

function salePaidInMonth(sale: Sale, monthKey: string): number {
  let total = 0;
  if ((sale.downPayment || 0) > 0 && sale.date?.startsWith(monthKey)) {
    total += Number(sale.downPayment) || 0;
  }
  (sale.paymentHistory || []).forEach((p) => {
    if (p?.date?.startsWith(monthKey)) total += Number(p.amount) || 0;
  });
  return total;
}

export function AllIncomeCategoriesSheet({
  open,
  onOpenChange,
  initialMonth,
  incomes: _incomes,
  allIncomes,
  sales = [],
  methodName,
  clientNameById,
  initialCategory,
  formatCurrency,
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [activeTab, setActiveTab] = useState<string>(initialCategory || "all");
  const [search, setSearch] = useState("");

  // Sincroniza o mês inicial e a aba ao abrir
  useEffect(() => {
    if (open) {
      setSelectedMonth(initialMonth);
      setActiveTab(initialCategory || "all");
    } else {
      setSearch("");
    }
  }, [open, initialMonth, initialCategory]);

  // Trava a rolagem do body enquanto o modal fullscreen estiver aberto
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  // Navegação local de meses
  const prevMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const nextMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  // Suporte a fechar via tecla ESC
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeTab !== "all") {
          setActiveTab("all");
        } else {
          onOpenChange(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, activeTab, onOpenChange]);

  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const monthLabel = format(new Date(selYear, selMonthNum - 1, 1), "MMMM 'de' yyyy", { locale: ptBR });

  // Mês anterior (para base de cálculo comparativo)
  const prevMonthKey = useMemo(() => {
    const d = new Date(selYear, selMonthNum - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [selYear, selMonthNum]);

  const prevMonthLabel = useMemo(() => {
    const d = new Date(selYear, selMonthNum - 2, 1);
    return format(d, "MMMM", { locale: ptBR });
  }, [selYear, selMonthNum]);

  // 1. Receitas do mês selecionado localmente
  const monthIncomes = useMemo(() => {
    return allIncomes.filter((i) => {
      const d = i.actualReceivedDate || i.receivedDate || "";
      return d.startsWith(selectedMonth);
    });
  }, [allIncomes, selectedMonth]);

  // 2. Consolidação de todas as categorias do mês ATUAL
  const categories: IncomeCategoryItem[] = useMemo(() => {
    const map = new Map<string, IncomeCategoryItem>();

    // Receitas normais e recorrentes
    monthIncomes.forEach((i) => {
      const v = Number(i.amount) || 0;
      if (v <= 0) return;
      const catDisplayName = displayIncomeCategory(i.category);
      const catKey = incomeCategoryKey(i.category);

      const prev = map.get(catKey) || {
        name: catDisplayName,
        value: 0,
        count: 0,
        color: PALETTE[map.size % PALETTE.length],
        entries: [],
      };
      prev.value += v;
      prev.count += 1;
      prev.entries.push({
        id: `inc-${i.id}`,
        description: i.description || "Receita",
        amount: v,
        date: i.actualReceivedDate || i.receivedDate,
        type: "receita",
        status: i.status === "received" ? "paid" : i.status === "overdue" ? "overdue" : "pending",
        account: methodName(i.paymentMethodId) || "Receita",
        clientName: i.clientId ? clientNameById.get(i.clientId) || null : null,
      });
      map.set(catKey, prev);
    });

    // Vendas de produtos
    sales.forEach((s) => {
      const paid = salePaidInMonth(s, selectedMonth);
      if (paid <= 0) return;
      const rawCat = (s.category && s.category.trim()) || "Vendas";
      const catDisplayName = displayIncomeCategory(rawCat);
      const catKey = incomeCategoryKey(rawCat);
      const customer = (s as any).customerName || null;

      const prev = map.get(catKey) || {
        name: catDisplayName,
        value: 0,
        count: 0,
        color: PALETTE[map.size % PALETTE.length],
        entries: [],
      };
      prev.value += paid;

      if ((s.downPayment || 0) > 0 && s.date?.startsWith(selectedMonth)) {
        prev.count += 1;
        prev.entries.push({
          id: `sale-${s.id}-down`,
          description: `Venda: ${(s as any).description || (s as any).productName || "—"} (entrada)`,
          amount: Number(s.downPayment) || 0,
          date: s.date,
          type: "receita",
          account: "Entrada de Venda",
          status: "paid",
          clientName: customer,
        });
      }

      (s.paymentHistory || []).forEach((p, idx) => {
        if (!p?.date?.startsWith(selectedMonth)) return;
        prev.count += 1;
        prev.entries.push({
          id: `sale-${s.id}-pay-${idx}`,
          description: `Venda: ${(s as any).description || (s as any).productName || "—"}`,
          amount: Number(p.amount) || 0,
          date: p.date,
          type: "receita",
          account: "Parcela de Venda",
          status: "paid",
          clientName: customer,
        });
      });

      map.set(catKey, prev);
    });

    return Array.from(map.values())
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [monthIncomes, sales, selectedMonth, methodName, clientNameById]);

  const grandTotal = useMemo(() => categories.reduce((s, c) => s + c.value, 0), [categories]);

  // 3. Apuração das categorias do MÊS ANTERIOR para comparação
  const prevCategoryTotalsMap = useMemo(() => {
    const map = new Map<string, number>();

    const prevIncomes = allIncomes.filter((i) => {
      const d = i.actualReceivedDate || i.receivedDate || "";
      return d.startsWith(prevMonthKey);
    });

    prevIncomes.forEach((i) => {
      const v = Number(i.amount) || 0;
      if (v <= 0) return;
      const catDisplayName = displayIncomeCategory(i.category);
      map.set(catDisplayName, (map.get(catDisplayName) || 0) + v);
    });

    sales.forEach((s) => {
      const paid = salePaidInMonth(s, prevMonthKey);
      if (paid <= 0) return;
      const rawCat = (s.category && s.category.trim()) || "Vendas";
      const catDisplayName = displayIncomeCategory(rawCat);
      map.set(catDisplayName, (map.get(catDisplayName) || 0) + paid);
    });

    return map;
  }, [allIncomes, sales, prevMonthKey]);

  const prevGrandTotal = useMemo(
    () => Array.from(prevCategoryTotalsMap.values()).reduce((s, v) => s + v, 0),
    [prevCategoryTotalsMap],
  );

  // Helper para gerar os dados comparativos de cada categoria de RECEITA
  const getComparison = (currentVal: number, prevVal: number) => {
    const diff = currentVal - prevVal;
    if (prevVal <= 0.005) {
      if (currentVal > 0.005) {
        return {
          type: "new" as const,
          diff,
          pct: null,
          text: "Nova neste mês",
          prevValFormatted: "R$ 0,00",
          colorClass: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20",
          icon: Sparkles,
        };
      }
      return {
        type: "equal" as const,
        diff: 0,
        pct: 0,
        text: "Sem alteração",
        prevValFormatted: "R$ 0,00",
        colorClass: "text-muted-foreground bg-muted/40 border-border/40",
        icon: Minus,
      };
    }

    const pct = (diff / prevVal) * 100;
    if (Math.abs(pct) < 0.1 || Math.abs(diff) < 0.01) {
      return {
        type: "equal" as const,
        diff: 0,
        pct: 0,
        text: "0% estável",
        prevValFormatted: formatCurrency(prevVal),
        colorClass: "text-muted-foreground bg-muted/40 border-border/40",
        icon: Minus,
      };
    }

    // Para RECEITAS: aumento é positivo (verde) e queda é alerta (vermelho/âmbar)
    if (diff > 0) {
      return {
        type: "increase" as const,
        diff,
        pct,
        text: `+${pct.toFixed(1)}% (+${formatCurrency(diff)})`,
        shortText: `+${pct.toFixed(1)}%`,
        prevValFormatted: formatCurrency(prevVal),
        colorClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
        icon: TrendingUp,
      };
    }

    return {
      type: "decrease" as const,
      diff,
      pct,
      text: `${pct.toFixed(1)}% (${formatCurrency(diff)})`,
      shortText: `${pct.toFixed(1)}%`,
      prevValFormatted: formatCurrency(prevVal),
      colorClass: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
      icon: TrendingDown,
    };
  };

  const grandComparison = useMemo(
    () => getComparison(grandTotal, prevGrandTotal),
    [grandTotal, prevGrandTotal],
  );

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.trim().toLowerCase();
    return categories
      .map((cat) => {
        const matchesCatName = cat.name.toLowerCase().includes(q);
        const matchingEntries = cat.entries.filter(
          (e) =>
            e.description.toLowerCase().includes(q) ||
            (e.account && e.account.toLowerCase().includes(q)) ||
            (e.clientName && e.clientName.toLowerCase().includes(q)),
        );
        if (matchesCatName || matchingEntries.length > 0) {
          return {
            ...cat,
            entries: matchingEntries.length > 0 ? matchingEntries : cat.entries,
          };
        }
        return null;
      })
      .filter(Boolean) as IncomeCategoryItem[];
  }, [categories, search]);

  if (!open || typeof document === "undefined") return null;

  const handleBack = () => {
    if (activeTab !== "all") {
      setActiveTab("all");
    } else {
      onOpenChange(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-background/95 backdrop-blur-2xl flex flex-col animate-fade-in overflow-hidden"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100dvh",
        margin: 0,
        padding: 0,
        zIndex: 2147483647,
        isolation: "isolate",
      }}
    >
      {/* Efeitos visuais de iluminação no fundo */}
      <div
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full opacity-[0.08] blur-3xl bg-success"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full opacity-[0.08] blur-3xl bg-primary"
        aria-hidden
      />

      {/* Top Navbar Fullscreen */}
      <header
        className="relative px-3.5 sm:px-8 border-b border-border/60 bg-card/80 backdrop-blur-xl shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 z-10"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.875rem)",
          paddingBottom: "0.875rem",
          paddingLeft: "calc(env(safe-area-inset-left, 0px) + 0.875rem)",
          paddingRight: "calc(env(safe-area-inset-right, 0px) + 0.875rem)",
        }}
      >
        <div className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 shrink-0 touch-manipulation active:scale-95 transition-transform"
              title={activeTab !== "all" ? "Voltar para todas as categorias" : "Fechar"}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <span className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
                <PieChart className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg lg:text-xl font-bold text-foreground truncate flex items-center gap-1.5 sm:gap-2">
                  {activeTab === "all" ? (
                    "Resumo por Categoria de Receitas"
                  ) : (
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="text-muted-foreground font-medium hidden sm:inline">Categorias ›</span>
                      <span className="truncate">{activeTab}</span>
                    </span>
                  )}
                </h1>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <Badge
                    variant="outline"
                    className="text-[10px] sm:text-[11px] py-0 px-2 font-semibold border-success/30 text-success bg-success/5"
                  >
                    {categories.length} categoria{categories.length === 1 ? "" : "s"}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="sm:hidden h-10 w-10 min-h-[44px] min-w-[44px] rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 shrink-0 touch-manipulation active:scale-95 transition-transform"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Seletor de mês exclusivo desta aba + total */}
        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 shrink-0">
          <div className="flex items-center gap-0.5 sm:gap-1 bg-muted/60 border border-border/60 rounded-2xl p-1 shrink-0 shadow-sm flex-1 sm:flex-initial justify-between sm:justify-start">
            <Button
              variant="ghost"
              size="icon"
              onClick={prevMonth}
              className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl hover:bg-background/80 text-muted-foreground hover:text-foreground"
              title="Mês anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <span className="text-xs sm:text-sm font-bold text-foreground capitalize px-1 sm:px-2 min-w-[105px] sm:min-w-[140px] text-center select-none truncate">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={nextMonth}
              className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl hover:bg-background/80 text-muted-foreground hover:text-foreground"
              title="Próximo mês"
            >
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>

          <div className="text-right hidden md:block">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
              Total de Receitas
            </span>
            <div className="flex items-baseline justify-end gap-2">
              <span className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight tabular-nums">
                {formatCurrency(grandTotal)}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
              <grandComparison.icon className="h-3 w-3" />
              <span>{grandComparison.shortText || grandComparison.text} vs {prevMonthLabel}</span>
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="hidden sm:inline-flex h-9 px-3 rounded-xl gap-1.5 font-medium border-border/70"
          >
            <X className="h-4 w-4" />
            <span className="hidden md:inline">Fechar</span>
          </Button>
        </div>
      </header>

      {/* Barra de Filtro e Total Mobile */}
      <div className="px-4 sm:px-8 py-3 border-b border-border/40 bg-muted/20 shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por categoria, descrição da receita ou cliente..."
            className="pl-9.5 h-10 text-xs sm:text-sm rounded-xl bg-background/90 border-border/60 shadow-none focus-visible:ring-1"
          />
        </div>

        <div className="md:hidden flex items-center justify-between text-xs px-1">
          <span className="text-muted-foreground font-medium">Total em {monthLabel}:</span>
          <div className="text-right">
            <span className="font-bold text-foreground text-sm block">
              {formatCurrency(grandTotal)}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <grandComparison.icon className="h-2.5 w-2.5" />
              {grandComparison.shortText || grandComparison.text} vs {prevMonthLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Fullscreen Body com Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
      >
        {/* Barra de Abas Horizontais com Scroll */}
        <div className="px-4 sm:px-8 py-2.5 border-b border-border/40 shrink-0 bg-muted/10 overflow-x-auto no-scrollbar">
          <TabsList className="bg-muted/70 p-1.5 rounded-2xl h-auto gap-1.5 inline-flex w-max min-w-full sm:min-w-0">
            <TabsTrigger
              value="all"
              className="h-9 px-4 text-xs sm:text-sm font-semibold rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <Layers className="h-4 w-4 text-success" />
              <span>Todas as Categorias ({categories.length})</span>
            </TabsTrigger>

            {categories.map((cat) => {
              const pct = grandTotal > 0 ? (cat.value / grandTotal) * 100 : 0;
              const prevVal = prevCategoryTotalsMap.get(cat.name) || 0;
              const comp = getComparison(cat.value, prevVal);
              const CompIcon = comp.icon;

              return (
                <TabsTrigger
                  key={cat.name}
                  value={cat.name}
                  className="h-9 px-3.5 text-xs sm:text-sm font-medium rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-sm flex items-center gap-2"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: cat.color }}
                  />
                  <span className="truncate max-w-[130px]">{cat.name}</span>
                  <span className="text-[11px] text-muted-foreground font-semibold">
                    {pct.toFixed(0)}%
                  </span>
                  {comp.shortText && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md flex items-center gap-0.5 ${comp.colorClass}`}>
                      <CompIcon className="h-2.5 w-2.5" />
                      {comp.shortText}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Conteúdo: Visão Geral "Todas as Categorias" */}
        <TabsContent
          value="all"
          className="flex-1 overflow-y-auto p-4 sm:p-8 m-0 focus-visible:outline-none focus-visible:ring-0"
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorY: "contain",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 3.5rem)",
          }}
        >
          {filteredCategories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground mb-3">
                <PieChart className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-foreground">Nenhuma receita encontrada</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {search ? "Tente buscar com outros termos." : `Não há receitas registradas no mês de ${monthLabel}.`}
              </p>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Grid de Cards de Cada Categoria com Comparativo */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCategories.map((cat) => {
                  const pct = grandTotal > 0 ? (cat.value / grandTotal) * 100 : 0;
                  const prevVal = prevCategoryTotalsMap.get(cat.name) || 0;
                  const comp = getComparison(cat.value, prevVal);
                  const CompIcon = comp.icon;

                  return (
                    <div
                      key={cat.name}
                      onClick={() => setActiveTab(cat.name)}
                      className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-5 shadow-xs hover:shadow-lg hover:border-success/40 transition-all duration-200 cursor-pointer flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-xs"
                            style={{ background: cat.color }}
                          >
                            <DollarSign className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-foreground truncate group-hover:text-success transition-colors">
                              {cat.name}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {cat.count} {cat.count === 1 ? "receita" : "receitas"}
                            </p>
                          </div>
                        </div>

                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground shrink-0 tabular-nums">
                          {pct.toFixed(1)}%
                        </span>
                      </div>

                      <div className="space-y-2.5 pt-2 border-t border-border/40">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight tabular-nums">
                            {formatCurrency(cat.value)}
                          </span>

                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1 shrink-0 ${comp.colorClass}`}>
                            <CompIcon className="h-3 w-3" />
                            <span>{comp.text}</span>
                          </span>
                        </div>

                        {/* Barra de Progresso da Categoria */}
                        <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(pct, 100)}%`, background: cat.color }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                          <span>Anterior: {comp.prevValFormatted}</span>
                          <span className="group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-medium text-success">
                            Ver lançamentos <ChevronRight className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Conteúdo de Cada Categoria Específica */}
        {categories.map((cat) => {
          const prevVal = prevCategoryTotalsMap.get(cat.name) || 0;
          const comp = getComparison(cat.value, prevVal);
          const CompIcon = comp.icon;
          const pct = grandTotal > 0 ? (cat.value / grandTotal) * 100 : 0;

          const entriesToShow = cat.entries.filter((e) => {
            if (!search.trim()) return true;
            const q = search.trim().toLowerCase();
            return (
              e.description.toLowerCase().includes(q) ||
              (e.account && e.account.toLowerCase().includes(q)) ||
              (e.clientName && e.clientName.toLowerCase().includes(q))
            );
          });

          return (
            <TabsContent
              key={cat.name}
              value={cat.name}
              className="flex-1 overflow-y-auto p-4 sm:p-8 m-0 focus-visible:outline-none focus-visible:ring-0"
              style={{
                WebkitOverflowScrolling: "touch",
                overscrollBehaviorY: "contain",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 3.5rem)",
              }}
            >
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Hero Card da Categoria Selecionada */}
                <div className="rounded-3xl border border-border/70 bg-card/90 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-md"
                      style={{ background: cat.color }}
                    >
                      <DollarSign className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg sm:text-xl font-bold text-foreground">{cat.name}</h2>
                        <Badge variant="outline" className="text-xs font-semibold">
                          {pct.toFixed(1)}% do total
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cat.count} {cat.count === 1 ? "receita registrada" : "receitas registradas"} em {monthLabel}
                      </p>
                    </div>
                  </div>

                  <div className="text-left sm:text-right w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-border/50">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                      Total da Categoria
                    </span>
                    <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight tabular-nums">
                      {formatCurrency(cat.value)}
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg border mt-1 ${comp.colorClass}`}>
                      <CompIcon className="h-3.5 w-3.5" />
                      <span>{comp.text}</span>
                    </span>
                  </div>
                </div>

                {/* Lista de Lançamentos da Categoria */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Lançamentos ({entriesToShow.length})
                    </h3>
                  </div>

                  {entriesToShow.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/80 p-8 text-center text-muted-foreground text-xs">
                      Nenhum lançamento encontrado para os filtros atuais.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {entriesToShow.map((entry) => {
                        const isPaid = entry.status === "paid";
                        const isOverdue = entry.status === "overdue";

                        return (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 hover:bg-card hover:border-border p-3.5 sm:p-4 transition-all duration-150 shadow-2xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                  isPaid
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : isOverdue
                                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                {isPaid ? (
                                  <CheckCircle2 className="h-4 w-4" />
                                ) : (
                                  <Clock className="h-4 w-4" />
                                )}
                              </span>

                              <div className="min-w-0">
                                <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
                                  {entry.description}
                                </p>
                                <div className="flex items-center gap-2 sm:gap-3 flex-wrap mt-0.5 text-[11px] text-muted-foreground">
                                  {entry.date && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {entry.date.split("-").reverse().join("/")}
                                    </span>
                                  )}
                                  {entry.account && (
                                    <span className="flex items-center gap-1">
                                      <PaymentIcon className="h-3 w-3" />
                                      {entry.account}
                                    </span>
                                  )}
                                  {entry.clientName && (
                                    <span className="flex items-center gap-1 font-medium text-foreground/80">
                                      <User className="h-3 w-3" />
                                      {entry.clientName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums block">
                                +{formatCurrency(entry.amount)}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] py-0 px-1.5 font-medium mt-0.5 ${
                                  isPaid
                                    ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                                    : isOverdue
                                      ? "border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/5"
                                      : "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                                }`}
                              >
                                {isPaid ? "Recebido" : isOverdue ? "Atrasado" : "Pendente"}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>,
    document.body,
  );
}
