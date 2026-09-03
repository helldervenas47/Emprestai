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
  CreditCard as CreditCardIcon,
  CheckCircle2,
  Clock,
  ChevronRight,
  ChevronLeft,
  Receipt,
  Layers,
  ArrowLeft,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
} from "lucide-react";
import { Expense } from "@/types/loan";
import { CreditCard } from "@/features/creditCards/hooks/useCreditCards";
import { InvoiceOpening } from "@/features/creditCards/hooks/useCreditCardOpenings";
import { CategoryEntry } from "@/features/financial/components/CategoryDetailsSheet";
import {
  belongsToCardInvoice,
  invoiceItemValue,
  isCreditCardExpense,
} from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { expandCreditCardExpenses } from "@/features/creditCards/lib/creditCardInstallments";
import { getInstallmentScheduleStart, withoutInstallmentReceipts } from "@/features/financial/lib/installmentEdit";
import { isExpenseOccurringInMonth } from "@/features/financial/lib/expenseFilterCore";
import { isAfterPaymentRecurrence } from "@/features/financial/lib/expensePaymentUtils";

export interface UsedCategoryItem {
  name: string;
  value: number;
  count: number;
  cat: {
    color: string;
    icon?: unknown;
  };
  entries: CategoryEntry[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMonth: string;
  expenses: Expense[];
  allExpenses: Expense[];
  cards: CreditCard[];
  openings?: InvoiceOpening[];
  isBusiness?: boolean;
  resolveCategory: (name: string) => { color: string; icon?: any };
  paymentMethodName: (id?: string | null) => string;
  initialCategory?: string | null;
  formatCurrency: (v: number) => string;
}

const isPiggyExpense = (notes?: string | null) => /\[\s*cofrinho\s*\]/i.test(notes ?? "");

export function AllCategoriesSheet({
  open,
  onOpenChange,
  initialMonth,
  expenses,
  allExpenses,
  cards,
  isBusiness = false,
  resolveCategory,
  paymentMethodName,
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

  // Suporte a fechar via tecla ESC (volta para 'all' antes de fechar)
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

  // 1. Despesas diretas do mês selecionado localmente
  const baseExpenses = useMemo(() => {
    return withoutInstallmentReceipts(expenses).filter((e) => isExpenseOccurringInMonth(e, selectedMonth));
  }, [expenses, selectedMonth]);

  const spendingMonth = useMemo(() => {
    return baseExpenses
      .filter((e) => !isPiggyExpense(e.notes) && !isCreditCardExpense(e))
      .map((e) => {
        const isRec = e.type === "recorrente" && e.installments && e.installments > 1
          && !isAfterPaymentRecurrence(e);
        if (!isRec) return e;

        const scheduleStart = getInstallmentScheduleStart(e);
        const [sy, sm, originalDay] = scheduleStart.split("-");
        const [sYear, sMonth] = selectedMonth.split("-").map(Number);
        const [startYear, startMonth] = [Number(sy), Number(sm)];

        const diffMonths = (sYear * 12 + sMonth) - (startYear * 12 + startMonth);
        const installmentIndex = Math.min(Math.max(0, diffMonths), (e.installments || 1) - 1);
        const isThisInstallmentPaid = (e.paidInstallments || 0) > installmentIndex;
        const virtualDueDate = `${selectedMonth}-${originalDay || "01"}`;

        return {
          ...e,
          paid: isThisInstallmentPaid,
          dueDate: virtualDueDate,
          paidDate: isThisInstallmentPaid ? e.paidDate : undefined,
        };
      });
  }, [baseExpenses, selectedMonth]);

  // 2. Compras no cartão de crédito alocadas ESTRITAMENTE POR DATA DE COMPRA
  const monthCardPurchases = useMemo(() => {
    if (isBusiness) return [];
    const expanded = expandCreditCardExpenses(allExpenses.filter((e) => e.scope === "personal"));
    const purchases: Array<{
      id: string;
      description: string;
      amount: number;
      category: string;
      dueDate: string;
      paidDate?: string | null;
      paid: boolean;
      cardName: string;
    }> = [];

    expanded.forEach((item) => {
      if (!isCreditCardExpense(item)) return;
      if (!item.dueDate || !item.dueDate.startsWith(selectedMonth)) return;

      const val = invoiceItemValue(item);
      if (val <= 0) return;

      let cardLabel = "Cartão de Crédito";
      for (const card of cards) {
        if (belongsToCardInvoice(item, card, new Date(0), new Date(8640000000000000))) {
          cardLabel = card.nickname || card.bank || "Cartão";
          break;
        }
      }

      purchases.push({
        id: item.id,
        description: item.description || "Compra no cartão",
        amount: val,
        category: (item.category || "Outros").trim() || "Outros",
        dueDate: item.dueDate,
        paidDate: item.paidDate,
        paid: !!item.paid,
        cardName: cardLabel,
      });
    });

    return purchases;
  }, [isBusiness, allExpenses, cards, selectedMonth]);

  // 3. Consolidação de todas as categorias do mês ATUAL
  const categories: UsedCategoryItem[] = useMemo(() => {
    const map = new Map<string, UsedCategoryItem>();

    spendingMonth.forEach((e) => {
      const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
      const v = isRec ? e.amount / e.installments! : e.amount;
      if (v <= 0) return;
      const catName = (e.category || "Outros").trim() || "Outros";
      const prev = map.get(catName) || {
        name: catName,
        value: 0,
        count: 0,
        cat: resolveCategory(catName),
        entries: [],
      };
      prev.value += v;
      prev.count += 1;
      prev.entries.push({
        id: `exp-${e.id}`,
        description: e.description,
        amount: v,
        date: e.paid && e.paidDate ? e.paidDate : e.dueDate,
        type: "despesa",
        status: e.paid ? "paid" : "pending",
        account: paymentMethodName(e.paymentMethodId) || "Despesa",
      });
      map.set(catName, prev);
    });

    monthCardPurchases.forEach((p) => {
      if (p.amount <= 0) return;
      const catName = (p.category || "Outros").trim() || "Outros";
      const prev = map.get(catName) || {
        name: catName,
        value: 0,
        count: 0,
        cat: resolveCategory(catName),
        entries: [],
      };
      prev.value += p.amount;
      prev.count += 1;
      prev.entries.push({
        id: `card-${p.id}`,
        description: p.description,
        amount: p.amount,
        date: p.dueDate,
        type: "despesa",
        status: p.paid ? "paid" : "pending",
        account: p.cardName || "Cartão de Crédito",
      });
      map.set(catName, prev);
    });

    return Array.from(map.values())
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [spendingMonth, monthCardPurchases, resolveCategory, paymentMethodName]);

  const grandTotal = useMemo(() => categories.reduce((s, c) => s + c.value, 0), [categories]);

  // 4. Apuração das categorias do MÊS ANTERIOR para comparação
  const prevCategoryTotalsMap = useMemo(() => {
    const map = new Map<string, number>();

    // 4.1 Despesas diretas do mês anterior
    const prevBase = withoutInstallmentReceipts(expenses).filter((e) =>
      isExpenseOccurringInMonth(e, prevMonthKey)
    );

    const prevSpending = prevBase
      .filter((e) => !isPiggyExpense(e.notes) && !isCreditCardExpense(e))
      .map((e) => {
        const isRec = e.type === "recorrente" && e.installments && e.installments > 1
          && !isAfterPaymentRecurrence(e);
        if (!isRec) return e;

        const scheduleStart = getInstallmentScheduleStart(e);
        const [sy, sm, originalDay] = scheduleStart.split("-");
        const [pYear, pMonth] = prevMonthKey.split("-").map(Number);
        const [startYear, startMonth] = [Number(sy), Number(sm)];

        const diffMonths = (pYear * 12 + pMonth) - (startYear * 12 + startMonth);
        const installmentIndex = Math.min(Math.max(0, diffMonths), (e.installments || 1) - 1);
        const isThisInstallmentPaid = (e.paidInstallments || 0) > installmentIndex;
        const virtualDueDate = `${prevMonthKey}-${originalDay || "01"}`;

        return {
          ...e,
          paid: isThisInstallmentPaid,
          dueDate: virtualDueDate,
          paidDate: isThisInstallmentPaid ? e.paidDate : undefined,
        };
      });

    prevSpending.forEach((e) => {
      const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
      const v = isRec ? e.amount / e.installments! : e.amount;
      if (v <= 0) return;
      const catName = (e.category || "Outros").trim() || "Outros";
      map.set(catName, (map.get(catName) || 0) + v);
    });

    // 4.2 Compras no cartão no mês anterior
    if (!isBusiness) {
      const expanded = expandCreditCardExpenses(allExpenses.filter((e) => e.scope === "personal"));
      expanded.forEach((item) => {
        if (!isCreditCardExpense(item)) return;
        if (!item.dueDate || !item.dueDate.startsWith(prevMonthKey)) return;
        const val = invoiceItemValue(item);
        if (val <= 0) return;
        const catName = (item.category || "Outros").trim() || "Outros";
        map.set(catName, (map.get(catName) || 0) + val);
      });
    }

    return map;
  }, [expenses, allExpenses, prevMonthKey, isBusiness]);

  const prevGrandTotal = useMemo(
    () => Array.from(prevCategoryTotalsMap.values()).reduce((s, v) => s + v, 0),
    [prevCategoryTotalsMap]
  );

  // Helper para gerar os dados comparativos de cada categoria
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

    if (diff > 0) {
      return {
        type: "increase" as const,
        diff,
        pct,
        text: `+${pct.toFixed(1)}% (+${formatCurrency(diff)})`,
        shortText: `+${pct.toFixed(1)}%`,
        prevValFormatted: formatCurrency(prevVal),
        colorClass: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
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
      colorClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      icon: TrendingDown,
    };
  };

  const grandComparison = useMemo(
    () => getComparison(grandTotal, prevGrandTotal),
    [grandTotal, prevGrandTotal]
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
            (e.account && e.account.toLowerCase().includes(q))
        );
        if (matchesCatName || matchingEntries.length > 0) {
          return {
            ...cat,
            entries: matchingEntries.length > 0 ? matchingEntries : cat.entries,
          };
        }
        return null;
      })
      .filter(Boolean) as UsedCategoryItem[];
  }, [categories, search]);

  if (!open || typeof document === "undefined") return null;

  const handleBack = () => {
    if (activeTab !== "all") {
      setActiveTab("all");
    } else {
      onOpenChange(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-[100dvh] min-h-[100dvh] max-w-none max-h-none z-[2147483647] bg-background text-foreground flex flex-col overflow-hidden animate-in fade-in duration-200"
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
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full opacity-[0.07] blur-3xl bg-primary"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full opacity-[0.07] blur-3xl bg-purple-500"
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
              <span className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <PieChart className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg lg:text-xl font-bold text-foreground truncate flex items-center gap-1.5 sm:gap-2">
                  {activeTab === "all" ? (
                    "Resumo por Categoria"
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
                    className="text-[10px] sm:text-[11px] py-0 px-2 font-semibold border-primary/30 text-primary bg-primary/5"
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
          {/* Seletor com setas de avançar e retroceder */}
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
              Total do Mês
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
            placeholder="Buscar por categoria, descrição da despesa ou cartão..."
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
              <Layers className="h-4 w-4 text-primary" />
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
                    style={{ background: `hsl(${cat.cat.color})` }}
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

        {/* Conteúdo Aba Geral: "Todas as Categorias" */}
        <TabsContent
          value="all"
          className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 m-0 focus-visible:outline-none"
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorY: "contain",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 3.5rem)",
          }}
        >
          <div className="max-w-7xl mx-auto space-y-6">
            {filteredCategories.length === 0 ? (
              <div className="py-24 text-center text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-base font-medium">Nenhum lançamento encontrado em {monthLabel}.</p>
                <p className="text-xs text-muted-foreground mt-1">Utilize as setas no topo para navegar entre os meses.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {filteredCategories.map((cat) => {
                  const pct = grandTotal > 0 ? (cat.value / grandTotal) * 100 : 0;
                  const prevVal = prevCategoryTotalsMap.get(cat.name) || 0;
                  const comp = getComparison(cat.value, prevVal);
                  const CompIcon = comp.icon;

                  return (
                    <div
                      key={cat.name}
                      onClick={() => setActiveTab(cat.name)}
                      className="group relative flex flex-col justify-between p-5 rounded-2xl border border-border/60 bg-card/70 hover:bg-card hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer space-y-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className="h-4 w-4 rounded-full shrink-0 ring-4"
                              style={{
                                background: `hsl(${cat.cat.color})`,
                                ["--tw-ring-color" as string]: `hsl(${cat.cat.color} / 0.25)`,
                              }}
                            />
                            <div className="min-w-0">
                              <h3 className="font-bold text-sm sm:text-base text-foreground truncate group-hover:text-primary transition-colors">
                                {cat.name}
                              </h3>
                              <span className="text-xs text-muted-foreground">
                                {cat.entries.length} {cat.entries.length === 1 ? "lançamento" : "lançamentos"}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-base sm:text-lg font-bold text-foreground block tabular-nums">
                              {formatCurrency(cat.value)}
                            </span>
                            <span className="text-xs font-semibold text-primary">
                              {pct.toFixed(1)}% do mês
                            </span>
                          </div>
                        </div>

                        {/* Barra de Progresso */}
                        <div className="h-2 w-full rounded-full bg-muted/80 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, Math.max(2, pct))}%`,
                              background: `hsl(${cat.cat.color})`,
                            }}
                          />
                        </div>

                        {/* Chip comparativo com o mês anterior */}
                        <div className="flex items-center justify-between pt-1 text-xs">
                          <span className="text-muted-foreground text-[11px]">
                            Em {prevMonthLabel}: <span className="font-medium text-foreground/80">{comp.prevValFormatted}</span>
                          </span>

                          <Badge
                            variant="outline"
                            className={`text-[11px] py-0.5 px-2 font-semibold flex items-center gap-1 border ${comp.colorClass}`}
                          >
                            <CompIcon className="h-3 w-3 shrink-0" />
                            <span>{comp.text}</span>
                          </Badge>
                        </div>
                      </div>

                      {/* Prévia de lançamentos */}
                      <div className="pt-3 border-t border-border/40 space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Lançamentos em {monthLabel}</span>
                          <span className="text-primary font-medium flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                            Ver detalhes <ChevronRight className="h-3.5 w-3.5" />
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {cat.entries.slice(0, 2).map((e) => (
                            <div
                              key={e.id}
                              className="flex items-center justify-between gap-2 text-xs py-1.5 px-2.5 rounded-lg bg-muted/40 text-muted-foreground"
                            >
                              <span className="truncate max-w-[180px] font-medium text-foreground/80">
                                {e.description}
                              </span>
                              <span className="font-semibold text-foreground shrink-0 tabular-nums">
                                {formatCurrency(e.amount)}
                              </span>
                            </div>
                          ))}
                          {cat.entries.length > 2 && (
                            <p className="text-[11px] text-muted-foreground text-center pt-0.5">
                              +{cat.entries.length - 2} outros lançamentos
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Conteúdo de Cada Categoria Individual */}
        {categories.map((cat) => {
          const pct = grandTotal > 0 ? (cat.value / grandTotal) * 100 : 0;
          const prevVal = prevCategoryTotalsMap.get(cat.name) || 0;
          const comp = getComparison(cat.value, prevVal);
          const CompIcon = comp.icon;

          const entriesToDisplay = search.trim()
            ? cat.entries.filter(
                (e) =>
                  e.description.toLowerCase().includes(search.toLowerCase()) ||
                  (e.account && e.account.toLowerCase().includes(search.toLowerCase()))
              )
            : cat.entries;

          return (
            <TabsContent
              key={cat.name}
              value={cat.name}
              className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 m-0 focus-visible:outline-none"
              style={{
                WebkitOverflowScrolling: "touch",
                overscrollBehaviorY: "contain",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 3.5rem)",
              }}
            >
              <div className="max-w-5xl mx-auto space-y-6">
                {/* Hero Card da Categoria */}
                <div className="p-6 rounded-3xl border border-border/60 bg-gradient-to-br from-card to-muted/30 shadow-sm space-y-5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <span
                        className="h-7 w-7 rounded-full ring-8 shrink-0"
                        style={{
                          background: `hsl(${cat.cat.color})`,
                          ["--tw-ring-color" as string]: `hsl(${cat.cat.color} / 0.25)`,
                        }}
                      />
                      <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                          {cat.name}
                        </h2>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                          {cat.entries.length} lançamentos registrados em {monthLabel}
                        </p>
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">
                        Total da Categoria
                      </span>
                      <span className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight tabular-nums">
                        {formatCurrency(cat.value)}
                      </span>
                      <div className="flex items-center sm:justify-end gap-2 mt-1">
                        <span className="text-xs sm:text-sm font-semibold text-primary">
                          {pct.toFixed(1)}% do mês
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs py-0.5 px-2.5 font-bold flex items-center gap-1 border ${comp.colorClass}`}
                        >
                          <CompIcon className="h-3.5 w-3.5" />
                          <span>{comp.text} vs {prevMonthLabel}</span>
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Comparativo detalhado em caixa destacada */}
                  <div className="p-4 rounded-2xl bg-muted/40 border border-border/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4 text-primary shrink-0" />
                      <span>
                        Gasto em <strong>{prevMonthLabel}</strong>: <strong className="text-foreground">{comp.prevValFormatted}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Variação:</span>
                      <span className="font-bold flex items-center gap-1 text-foreground">
                        <CompIcon className="h-4 w-4" />
                        {comp.text}
                      </span>
                    </div>
                  </div>

                  {/* Barra de Progresso com Percentual */}
                  <div className="space-y-1.5 pt-1">
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.max(3, pct))}%`,
                          background: `hsl(${cat.cat.color})`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Lista Completa de Transações da Categoria */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">
                      Lançamentos Detalhados ({entriesToDisplay.length})
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab("all")}
                      className="text-xs text-primary font-medium hover:bg-primary/10 h-8 px-2.5 rounded-xl"
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                      Ver todas as categorias
                    </Button>
                  </div>

                  {entriesToDisplay.length === 0 ? (
                    <div className="py-20 text-center text-muted-foreground border border-dashed border-border/60 rounded-2xl">
                      <p className="text-sm font-medium">Nenhum lançamento encontrado em {monthLabel} com os filtros atuais.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {entriesToDisplay.map((e) => {
                        const isCard = e.id.startsWith("card-") || e.account?.includes("Cartão");
                        const isPaid = e.status === "paid";
                        return (
                          <div
                            key={e.id}
                            className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-border/50 bg-card/80 hover:bg-card hover:border-primary/30 transition-all shadow-sm"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <span
                                className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                                  isCard
                                    ? "bg-primary/15 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {isCard ? (
                                  <CreditCardIcon className="h-5 w-5" />
                                ) : (
                                  <Receipt className="h-5 w-5" />
                                )}
                              </span>

                              <div className="min-w-0">
                                <p className="text-sm sm:text-base font-semibold text-foreground truncate">
                                  {e.description}
                                </p>
                                <div className="flex items-center gap-2.5 mt-1 text-xs text-muted-foreground flex-wrap">
                                  {e.account && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] py-0 px-2 border-border/60 bg-muted/40"
                                    >
                                      {e.account}
                                    </Badge>
                                  )}
                                  <span className="inline-flex items-center gap-1 text-xs">
                                    <Calendar className="h-3 w-3" />
                                    {e.date}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <p className="text-sm sm:text-base font-bold text-foreground tabular-nums">
                                {formatCurrency(e.amount)}
                              </p>
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-semibold mt-0.5 ${
                                  isPaid
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                {isPaid ? (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Pago
                                  </>
                                ) : (
                                  <>
                                    <Clock className="h-3.5 w-3.5" /> Pendente
                                  </>
                                )}
                              </span>
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
    </div>
  );

  return createPortal(modalContent, document.body);
}
