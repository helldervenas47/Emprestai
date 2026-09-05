import { useState, useCallback, useMemo, useEffect, useId } from "react";
import { formatDateBR } from "@/features/financial/lib/formatDateSafe";
import { todayInAppTz } from "@/lib/timezone";
import { getDueStatusBadge, getDueAccent } from "@/features/financial/lib/dueStatus";
import { toast } from "sonner";
import { usePaymentCelebration } from "@/hooks/usePaymentCelebration";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Expense } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, Trash2, CheckCircle, CheckCircle2, Clock, Receipt, Calendar,
  CircleDollarSign, ChevronLeft, ChevronRight, Undo2, TrendingUp, CalendarDays, Target, Pencil,
  Sparkles, Plus, ChevronDown,
} from "lucide-react";
import { PersonalCategoryCreator } from "@/features/financial/components/PersonalCategoryCreator";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { DeleteScopeDialog } from "@/components/DeleteScopeDialog";
import {
  applyScopedExpenseDelete, isExpenseSeries, isOccurrenceSkipped, type DeleteScope,
} from "@/features/financial/lib/expenseSeriesScope";
import {
  partialPaidForMonth, outstandingForMonth, occurrenceAmount, round2,
} from "@/features/financial/lib/partialPayments";
import { ExpenseEditDialog } from "@/features/financial/components/ExpenseEditDialog";
import { applyExpenseScopedUpdate } from "@/features/financial/lib/seriesEdit";
import { ExpenseBoletoLinkButton } from "@/features/financial/components/ExpenseBoletoLinkButton";
import { supabase } from "@/integrations/supabase/userClient";
import { InstallmentSummaryDialog } from "@/features/financial/components/InstallmentSummaryDialog";
import { personalCategories, getPersonalCategory, resolvePersonalIcon, getIconName, type PersonalCategory } from "@/features/financial/lib/personalExpenseCategories";
import { usePersonalExpenseCategories } from "@/features/financial/hooks/usePersonalExpenseCategories";
import { Progress } from "@/components/ui/progress";
import { usePersonalBudgets } from "@/features/financial/hooks/usePersonalBudgets";
import { isPiggyExpense } from "@/features/piggyBanks/hooks/usePiggyBanks";
import { useCreditCards } from "@/features/creditCards/hooks/useCreditCards";
import { isAfterPaymentRecurrence } from "@/features/financial/lib/expensePaymentUtils";
import { useCreditCardOpenings } from "@/features/creditCards/hooks/useCreditCardOpenings";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import {
  isCreditCardExpense,
  getCardInvoiceTotalsForMonth,
  CREDIT_CARD_INVOICE_CATEGORY,
  belongsToCardInvoice,
  invoiceItemValue,
  getCycleForDueMonth,
  readTotalOverride,
} from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { expandCreditCardExpenses } from "@/features/creditCards/lib/creditCardInstallments";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PersonalAIInsightsCard } from "@/components/PersonalAIInsightsCard";
import { CreditCardInvoice } from "@/features/creditCards/components/CreditCardInvoice";
import type { CreditCard } from "@/features/creditCards/hooks/useCreditCards";
import { CreditCard as CreditCardIcon } from "lucide-react";
import { CategoryDetailsSheet, CategoryEntry } from "@/features/financial/components/CategoryDetailsSheet";
import { AllCategoriesSheet, type UsedCategoryItem } from "@/features/financial/components/AllCategoriesSheet";
import {
  CategoryDonutChart,
  CategoryRanking,
  FinancialHeroCard,
  FinancialMetricCard,
  FinancialHealthCard,
  type HeroMetric,
} from "@/features/financial/components/financial";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { getInstallmentScheduleStart, withoutInstallmentReceipts } from "@/features/financial/lib/installmentEdit";
import { filterBusinessExpenses, isExpenseOccurringInMonth } from "../lib/expenseFilterCore";

  const isTelegramBotExpense = (e: any) =>
    !!(e.metadata?.via_telegram || e.metadata?.kind === "telegram_bot");

  const isCommentBotExpense = (e: any) => /\[\s*bot\s*\]/i.test(e.notes ?? "");

  const isBotExpense = (e: any) => isTelegramBotExpense(e) || isCommentBotExpense(e);

interface Props {
  expenses: Expense[];
  onPay: (id: string, skipBalanceAdjust?: boolean, payDate?: string, paidAmount?: number) => void;
  onUnpay?: (id: string) => void;
  onDelete: (id: string) => void;
  /** Pagamento parcial da ocorrência (competência YYYY-MM). */
  onPayPartial?: (id: string, amount: number, payDate?: string, occurrenceMonth?: string) => Promise<boolean> | boolean;
  /** Exclusão com escopo em séries (somente esta / esta e futuras / todas). */
  onDeleteScoped?: (expense: Expense, month: string, scope: DeleteScope) => Promise<void> | void;
  onUpdate?: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  readOnly?: boolean;
  /**
   * Escopo de exibição:
   *  - "personal" (padrão): mostra limites de gastos, categorias personalizadas
   *    pessoais, insights de IA pessoais e fatura de cartão de crédito.
   *  - "business": aplica o mesmo design visual (hero, donut, top 5, filtros,
   *    lista), porém sem budgets/insights/categorias-pessoais/cartão de crédito.
   */
  mode?: "personal" | "business";
  /**
   * Extra content rendered after the evolution chart.
   * Can be a node, or a render-fn receiving the currently selected month
   * (YYYY-MM) so child components (e.g. credit card invoice) can stay in sync.
   */
  afterEvolution?: React.ReactNode | ((ctx: { selectedMonth: string }) => React.ReactNode);
}

type Filter = "all" | "pending" | "paid" | "overdue";

const FIXED_RECURRING_INSTALLMENTS = 999;

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const isOverdue = (e: Expense) =>
  !e.paid && e.dueDate < todayInAppTz();

export function PersonalExpenseList({ expenses: expensesInput, onPay, onUnpay, onDelete, onPayPartial, onDeleteScoped, onUpdate, readOnly = false, mode = "personal", afterEvolution }: Props) {
  const instanceId = useId();
  const isBusiness = mode === "business";
  // Em modo empresa, ocultar pagamentos de fatura e despesas da categoria "Cartão de Crédito"
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();
  const { expenses: allExpenses } = useExpenses();
  const expenses = useMemo(
    () => (isBusiness
      ? filterBusinessExpenses(expensesInput)
      : expensesInput.filter(e => {
          if (e.scope !== "personal") return false;
          const isCC = isCreditCardExpense(e) || (e.paymentMethodId && cards.some(c => c.id === e.paymentMethodId));
          return !isCC;
        })),
    [expensesInput, isBusiness, cards],
  );
  const { mask } = useHideValues();
  const { celebrate } = usePaymentCelebration();
  const formatCurrency = useCallback((v: number) => mask(fmt(v)), [mask]);
  const { categories: customCategories, create: createCustomCategory, update: updateCustomCategory, remove: removeCustomCategory } = usePersonalExpenseCategories();
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string; icon: string; color: string } | null>(null);
  const [creatorInitial, setCreatorInitial] = useState<{ name: string; icon: string; color: string } | null>(null);
  const customCategoryList = useMemo<PersonalCategory[]>(
    () => customCategories.map((c) => ({ name: c.name, icon: resolvePersonalIcon(c.icon), color: c.color, id: c.id, custom: true })),
    [customCategories],
  );
  // In business mode, generate categories from the actual expenses so the
  // category filter dropdown works without depending on personal categories.
  const businessCategoryList = useMemo<PersonalCategory[]>(() => {
    if (!isBusiness) return [];
    const palette = ["221 83% 53%", "142 71% 45%", "38 92% 50%", "0 84% 60%", "262 83% 58%", "173 80% 40%", "24 95% 53%", "199 89% 48%"];
    const seen = new Map<string, PersonalCategory>();
    expenses.forEach((e, idx) => {
      const key = (e.category || "Outros").trim() || "Outros";
      if (seen.has(key)) return;
      seen.set(key, {
        name: key,
        icon: Receipt,
        color: palette[seen.size % palette.length],
      });
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [isBusiness, expenses]);
  const resolveCategory = useCallback(
    (name: string) => {
      if (isBusiness) {
        const found = businessCategoryList.find((c) => c.name === name);
        if (found) return found;
        return { name: name || "Outros", icon: Receipt, color: "220 9% 46%" } as PersonalCategory;
      }
      return getPersonalCategory(name, customCategoryList);
    },
    [isBusiness, businessCategoryList, customCategoryList],
  );
  // Lista unificada para limites de gastos: customizadas têm prioridade sobre built-ins
  // (com mesmo nome), permitindo "sobrescrever" uma categoria padrão editando-a.
  const allBudgetCategories = useMemo<PersonalCategory[]>(() => {
    if (isBusiness) return businessCategoryList;
    const seen = new Set<string>();
    const out: PersonalCategory[] = [];
    for (const c of [...customCategoryList, ...personalCategories]) {
      const key = c.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [isBusiness, businessCategoryList, customCategoryList]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [sourceFilter, setSourceFilter] = useState<"all" | "auto" | "manual">("all");
  const [cardFilter, setCardFilter] = useState(false);
  const [budgetDetailCat, setBudgetDetailCat] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selectedTopCategory, setSelectedTopCategory] = useState<string | null>(null);
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  const [allCategoriesInitialTab, setAllCategoriesInitialTab] = useState<string | null>(null);
  const [selectedTopDescription, setSelectedTopDescription] = useState<string | null>(null);
  const { methods: paymentMethodsList } = usePaymentMethods();
  const paymentMethodName = (id?: string | null) =>
    paymentMethodsList.find((m) => m.id === id)?.name || "";
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ expense: Expense; month: string } | null>(null);
  const [partialMode, setPartialMode] = useState(false);
  const [partialValue, setPartialValue] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState("");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [unpayingId, setUnpayingId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [summaryExpense, setSummaryExpense] = useState<Expense | null>(null);
  const [budgetEditOpen, setBudgetEditOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});
  const [expensesExpanded, setExpensesExpanded] = useState(false);
  const [categoryChartExpanded, setCategoryChartExpanded] = useState(false);
  const [invoiceCard, setInvoiceCard] = useState<CreditCard | null>(null);
  const {
    budgets,
    monthBudgets,
    effectiveMonth,
    isInherited,
    targetMonth,
    setBudget,
    deleteBudget,
    inheritIntoMonth,
  } = usePersonalBudgets(true, selectedMonth);
  const [historyMonths, setHistoryMonths] = useState<3 | 6 | 12>(6);

  // Helpers de recorrência: parceladas e fixas se replicam mês a mês.
  const isRecurringMonthly = (e: Expense) =>
    e.type === "recorrente" && !!e.installments && e.installments > 1;

  /** True se a despesa "ocorre" no mês YYYY-MM informado.
   *  Para despesas parceladas (recorrente com installments > 1), TODAS as parcelas
   *  futuras aparecem em seus respectivos meses desde o cadastro — o cronograma
   *  completo é a fonte da previsão financeira, independente do pagamento da
   *  parcela atual. Parcelas já pagas ficam como filhos (rows separadas) e são
   *  captadas via paidDate no mês em que foram efetivamente quitadas.
   */
  const occursInMonth = useCallback((e: Expense, yyyymm: string) => {
    return isExpenseOccurringInMonth(e, yyyymm);
  }, []);

  // Monthly evolution per category — last N months
  const historyData = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    const base = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = historyMonths - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: format(d, "MMM/yy", { locale: ptBR }),
      });
    }
    const categoriesPresent = new Set<string>();
    const byMonth: Record<string, Record<string, number>> = {};
    months.forEach((m) => (byMonth[m.key] = {}));
    expenses.forEach((e) => {
      if (isPiggyExpense(e.notes)) return; // Cofrinho transfers are not spending
      const isRec = isRecurringMonthly(e);
      const amt = isRec ? e.amount / e.installments! : e.amount;
      months.forEach((m) => {
        if (!occursInMonth(e, m.key)) return;
        const cat = (e.category || "Outros").trim() || "Outros";
        byMonth[m.key][cat] = (byMonth[m.key][cat] || 0) + amt;
        categoriesPresent.add(cat);
      });
    });
    if (!isBusiness) {
      const expanded = expandCreditCardExpenses(allExpenses.filter((e) => e.scope === "personal"));
      for (const card of cards) {
        if (card.active === false) continue;
        months.forEach((m) => {
          const cycle = getCycleForDueMonth(m.key, card.closingDay, card.dueDay);
          if (!cycle) return;
          const items = expanded.filter((e) => belongsToCardInvoice(e, card, cycle.from, cycle.to));
          items.forEach((item) => {
            const amt = invoiceItemValue(item);
            if (amt <= 0) return;
            const cat = (item.category || "Outros").trim() || "Outros";
            byMonth[m.key][cat] = (byMonth[m.key][cat] || 0) + amt;
            categoriesPresent.add(cat);
          });
        });
      }
    }
    const data = months.map((m) => ({ month: m.label, ...byMonth[m.key] }));
    const cats = [...categoriesPresent];
    return { data, categories: cats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, allExpenses, cards, isBusiness, historyMonths, occursInMonth]);

  const getInstallmentAmount = useCallback((e: Expense) => {
    const isRec = isRecurringMonthly(e);
    return isRec ? e.amount / e.installments! : e.amount;
  }, []);

  // Filtra exclusivamente pela data de vencimento (dueDate). Despesas pagas em
  // outro mês mas cujo vencimento cai no mês selecionado continuam aparecendo;
  // pagas neste mês com vencimento em outro mês NÃO entram aqui.
  const monthFiltered = useMemo(() => {
    // Fonte única: `expenses` já aplica o escopo (business/personal) e remove
    // despesas de cartão de crédito. Recibos de parcelas pagas (filhos) não
    // entram: o pai já representa cada competência.
    let base = withoutInstallmentReceipts(expenses);
    return base.filter((e) => occursInMonth(e, selectedMonth));
  }, [expenses, selectedMonth, occursInMonth]);



  const isRecFullyPaid = (e: Expense) =>
    e.type === "recorrente" && !!e.installments && e.installments > 1 && e.paid;
  // Cofrinho expenses (savings transfers) stay in the list but must NOT count as monthly spending.
  const visibleMonth = useMemo(() => {
    let base = monthFiltered;
    if (sourceFilter === "auto") base = base.filter(isBotExpense);
    if (sourceFilter === "manual") base = base.filter((e) => !isBotExpense(e));
    return base;
  }, [monthFiltered, sourceFilter]);

  const spendingMonth = useMemo(() => {
    return visibleMonth
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
  }, [visibleMonth, selectedMonth]);

  // Faturas de cartão cujo vencimento está dentro do mês selecionado.
  // Modo empresarial: faturas de cartão são exclusivas do escopo pessoal e
  // NUNCA entram em totais, cards ou gráficos da aba empresarial.
  const cardInvoiceTotalsMonth = useMemo(
    () => (isBusiness ? [] : getCardInvoiceTotalsForMonth(allExpenses, cards, openings, selectedMonth)),
    [allExpenses, cards, openings, selectedMonth, isBusiness],
  );

  // Mapeamento de cartões para seus totais de fatura no mês selecionado
  const cardInvoiceMap = useMemo(() => {
    const map = new Map<string, typeof cardInvoiceTotalsMonth[0]>();
    cardInvoiceTotalsMonth.forEach(x => map.set(x.card.id, x));
    return map;
  }, [cardInvoiceTotalsMonth]);

  // Faturas de cartão cujos vencimentos estão no mês selecionado.
  const invoiceRows = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const [iy, im] = selectedMonth.split("-").map(Number);
    const daysInMonth = new Date(iy, im, 0).getDate();
    const searchLow = search.trim().toLowerCase();
    
    return cardInvoiceTotalsMonth
      .filter((x) => x.total > 0 || x.paidTotal > 0)
      .sort((a, b) => b.total - a.total)
      .map((x) => {
        const dd = String(Math.min(x.card.dueDay, daysInMonth)).padStart(2, "0");
        const due = `${selectedMonth}-${dd}`;
        const overdue = !x.paid && due < todayStr;
        const isPartial = !x.paid && x.paidTotal > 0.005;
        const remaining = Math.max(0, Number((x.total - x.paidTotal).toFixed(2)));
        return { x, due, overdue, paid: x.paid, isPartial, remaining };
      })
      .filter(({ overdue, paid, isPartial }) => {
        if (filter === "pending") return !paid && !overdue;
        if (filter === "paid") return paid;
        if (filter === "overdue") return !paid && overdue;
        return true;
      })
      .filter(() =>
        !categoryFilter || categoryFilter === CREDIT_CARD_INVOICE_CATEGORY,
      )
      .filter(({ x }) => {
        if (!searchLow) return true;
        const nickname = (x.card.nickname ?? "").toLowerCase();
        const lastFour = (x.card.lastFour ?? "").toLowerCase();
        const label = `fatura cartão ${nickname} ${lastFour}`.toLowerCase();
        return label.includes(searchLow);
      })
      .filter(() => sourceFilter !== "auto")
      .filter(() => !isBusiness);
  }, [cardInvoiceTotalsMonth, selectedMonth, filter, categoryFilter, search, sourceFilter, isBusiness]);



  // Para cada fatura no resumo mensal:
  // Soma o total pago (incluindo pagamentos parciais)
  const cardInvoicePaidMonth = useMemo(
    () =>
      cardInvoiceTotalsMonth.reduce((s, x) => {
        return s + (x.paidTotal || 0);
      }, 0),
    [cardInvoiceTotalsMonth],
  );
  // Faturas em aberto (saldo restante a pagar)
  const cardInvoicePendingMonth = useMemo(
    () =>
      cardInvoiceTotalsMonth.reduce((s, x) => {
        if (x.paid) return s;
        return s + Math.max(0, Number((x.total - x.paidTotal).toFixed(2)));
      }, 0),
    [cardInvoiceTotalsMonth],
  );
  // Total da fatura no mês = parte paga + parte pendente (mantém o agregado de gasto).
  const cardInvoiceMonthTotal = cardInvoicePaidMonth + cardInvoicePendingMonth;

  const { totalPending, totalPaid, totalOverdue, totalActuallyPaid } = useMemo(() => {
    let tPending = 0, tPaid = 0, tOverdue = 0, tActuallyPaid = 0;
    const [sYear, sMonth] = selectedMonth.split("-").map(Number);
    const todayStr = todayInAppTz();
    
    for (const e of spendingMonth) {
      const isPaid = e.paid;
      const dueDate = e.dueDate;
      const amt = getInstallmentAmount(e);
      // Pagamentos parciais reduzem o pendente e somam ao efetivamente pago.
      const partial = isPaid ? 0 : Math.min(amt, partialPaidForMonth(e.notes, selectedMonth));
      const remaining = Math.max(0, amt - partial);
      const isOverdueItem = !isPaid && dueDate < todayStr;

      tPaid += amt;
      if (!isPaid) tPending += remaining;
      if (isOverdueItem) tOverdue += remaining;
      tActuallyPaid += isPaid ? amt : partial;
    }

    tPending += cardInvoicePendingMonth;
    tPaid += cardInvoiceMonthTotal;
    tActuallyPaid += cardInvoicePaidMonth;

    return { totalPending: tPending, totalPaid: tPaid, totalOverdue: tOverdue, totalActuallyPaid: tActuallyPaid };
  }, [spendingMonth, getInstallmentAmount, cardInvoicePendingMonth, cardInvoiceMonthTotal, cardInvoicePaidMonth, selectedMonth]);

  // Daily average — divide pelo total de dias do mês vigente
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const daysInMonth = new Date(selYear, selMonthNum, 0).getDate();
  const dailyAverage = daysInMonth > 0 ? totalPaid / daysInMonth : 0;


  interface MonthCardPurchaseItem {
    id: string;
    description: string;
    amount: number;
    category: string;
    dueDate: string;
    paidDate?: string | null;
    paid: boolean;
    cardName: string;
  }

  // Compras de cartão de crédito pertencentes ao ciclo/fatura do mês selecionado
  const { monthCardPurchases, monthCardUnclassifiedTotal } = useMemo(() => {
    if (isBusiness) {
      return { monthCardPurchases: [] as MonthCardPurchaseItem[], monthCardUnclassifiedTotal: 0 };
    }

    const expanded = expandCreditCardExpenses(allExpenses.filter((e) => e.scope === "personal"));
    const purchases: MonthCardPurchaseItem[] = [];
    const matchedExpenseIds = new Set<string>();
    let unclassifiedTotal = 0;

    for (const card of cards) {
      if (card.active === false) continue;
      const cycle = getCycleForDueMonth(selectedMonth, card.closingDay, card.dueDay);
      if (!cycle) continue;

      const items = expanded.filter((e) => belongsToCardInvoice(e, card, cycle.from, cycle.to));
      const cardLabel = card.nickname || card.bank || "Cartão";

      items.forEach((item) => {
        matchedExpenseIds.add(item.id);
        const val = invoiceItemValue(item);
        if (val <= 0) return;
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

      const itemsTotal = items.reduce((s, e) => s + invoiceItemValue(e), 0);
      const cycleKey = `${cycle.to.getFullYear()}-${String(cycle.to.getMonth() + 1).padStart(2, "0")}`;
      const opening = openings.find((o) => o.cardId === card.id && o.cycleKey === cycleKey);
      const openingAmount = opening?.openingAmount ?? 0;
      const totalOverride = readTotalOverride(opening?.notes);
      const total = totalOverride ?? (itemsTotal + openingAmount);
      const unclassified = Math.max(0, total - itemsTotal);
      if (unclassified > 0.005) {
        unclassifiedTotal += unclassified;
      }
    }

    // Despesas de cartão órfãs (sem cartão vinculado) cujo vencimento ocorre no mês selecionado
    const orphanItems = expanded.filter(
      (e) => isCreditCardExpense(e) && !matchedExpenseIds.has(e.id) && e.dueDate.startsWith(selectedMonth),
    );
    orphanItems.forEach((item) => {
      const val = invoiceItemValue(item);
      if (val <= 0) return;
      purchases.push({
        id: item.id,
        description: item.description || "Compra no cartão",
        amount: val,
        category: (item.category || "Outros").trim() || "Outros",
        dueDate: item.dueDate,
        paidDate: item.paidDate,
        paid: !!item.paid,
        cardName: "Cartão de Crédito",
      });
    });

    return { monthCardPurchases: purchases, monthCardUnclassifiedTotal: unclassifiedTotal };
  }, [isBusiness, allExpenses, cards, selectedMonth, openings, occursInMonth]);

  // Category breakdown — includes all expenses of the selected month (paid + pending),
  // ensuring consistency with monthly totals and accurate display for past months.
  // Somando despesas diretas + compras de cartão categorizadas.
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();

    // 1. Despesas diretas (dinheiro, pix, boleto, etc.)
    spendingMonth.forEach((e) => {
      const v = getInstallmentAmount(e);
      if (v <= 0) return;
      const cat = (e.category || "Outros").trim() || "Outros";
      map.set(cat, (map.get(cat) || 0) + v);
    });

    // 2. Compras no cartão de crédito categorizadas
    monthCardPurchases.forEach((p) => {
      if (p.amount <= 0) return;
      map.set(p.category, (map.get(p.category) || 0) + p.amount);
    });

    // 3. Saldo inicial não discriminado ou ajuste de fatura
    if (monthCardUnclassifiedTotal > 0.005) {
      map.set(
        CREDIT_CARD_INVOICE_CATEGORY,
        (map.get(CREDIT_CARD_INVOICE_CATEGORY) || 0) + monthCardUnclassifiedTotal,
      );
    }

    const arr = [...map.entries()]
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value, cat: resolveCategory(name) }))
      .sort((a, b) => b.value - a.value);

    if (arr.length <= 6) return arr;
    const top = arr.slice(0, 5);
    const rest = arr.slice(5).reduce((s, it) => s + it.value, 0);
    return [...top, { name: "Outras categorias", value: rest, cat: resolveCategory("Outros") }];
  }, [spendingMonth, getInstallmentAmount, resolveCategory, monthCardPurchases, monthCardUnclassifiedTotal]);

  // Ranking por descrição — Top 5 despesas por descrição (agrupadas por texto),
  // considerando despesas diretas do mês + compras individuais no cartão de crédito.
  const descriptionData = useMemo(() => {
    const map = new Map<string, { value: number; category: string }>();

    // 1. Despesas diretas
    spendingMonth.forEach((e) => {
      const v = getInstallmentAmount(e);
      if (v <= 0) return;
      const key = (e.description || "Sem descrição").trim() || "Sem descrição";
      const prev = map.get(key);
      map.set(key, { value: (prev?.value || 0) + v, category: prev?.category || e.category || "Outros" });
    });

    // 2. Compras no cartão de crédito
    monthCardPurchases.forEach((p) => {
      if (p.amount <= 0) return;
      const key = (p.description || "Compra no cartão").trim() || "Compra no cartão";
      const prev = map.get(key);
      map.set(key, { value: (prev?.value || 0) + p.amount, category: prev?.category || p.category || "Outros" });
    });

    // 3. Saldo inicial não discriminado
    if (monthCardUnclassifiedTotal > 0.005) {
      const key = "Saldo anterior / Ajuste fatura";
      const prev = map.get(key);
      map.set(key, {
        value: (prev?.value || 0) + monthCardUnclassifiedTotal,
        category: prev?.category || CREDIT_CARD_INVOICE_CATEGORY,
      });
    }

    return [...map.entries()]
      .filter(([, v]) => v.value > 0)
      .map(([name, v]) => ({ name, value: v.value, cat: resolveCategory(v.category) }))
      .sort((a, b) => b.value - a.value);
  }, [spendingMonth, getInstallmentAmount, resolveCategory, monthCardPurchases, monthCardUnclassifiedTotal]);

  // Lista com TODAS as categorias utilizadas no mês e seus respectivos lançamentos
  const allUsedCategories: UsedCategoryItem[] = useMemo(() => {
    const map = new Map<string, UsedCategoryItem>();

    // 1. Despesas diretas
    spendingMonth.forEach((e) => {
      const v = getInstallmentAmount(e);
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

    // 2. Compras no cartão de crédito
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
        date: p.paid && p.paidDate ? p.paidDate : p.dueDate,
        type: "despesa",
        status: p.paid ? "paid" : "pending",
        account: p.cardName || "Cartão de Crédito",
      });
      map.set(catName, prev);
    });

    // 3. Saldo inicial não discriminado ou ajuste de fatura
    if (monthCardUnclassifiedTotal > 0.005) {
      const catName = CREDIT_CARD_INVOICE_CATEGORY;
      const prev = map.get(catName) || {
        name: catName,
        value: 0,
        count: 0,
        cat: resolveCategory(catName),
        entries: [],
      };
      prev.value += monthCardUnclassifiedTotal;
      prev.count += 1;
      prev.entries.push({
        id: `card-unclassified-${selectedMonth}`,
        description: "Saldo anterior / Ajuste de fatura",
        amount: monthCardUnclassifiedTotal,
        date: `${selectedMonth}-01`,
        type: "despesa",
        status: "pending",
        account: "Cartão de Crédito",
      });
      map.set(catName, prev);
    }

    return Array.from(map.values())
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [spendingMonth, getInstallmentAmount, resolveCategory, monthCardPurchases, monthCardUnclassifiedTotal, selectedMonth, paymentMethodsList]);

  const topCategoryEntries: CategoryEntry[] = useMemo(() => {
    if (!selectedTopCategory) return [];
    const topNames = new Set(categoryData.filter((c) => c.name !== "Outras categorias").map((c) => c.name));
    const isAggregated = selectedTopCategory === "Outras categorias";
    const matches = (cat: string) =>
      isAggregated ? !topNames.has(cat) : cat === selectedTopCategory;
    const list: CategoryEntry[] = [];

    // 1. Despesas diretas
    spendingMonth.forEach((e) => {
      const v = getInstallmentAmount(e);
      if (v <= 0) return;
      const cat = (e.category || "Outros").trim() || "Outros";
      if (!matches(cat)) return;
      list.push({
        id: `exp-${e.id}`,
        description: e.description,
        amount: v,
        date: e.paid && e.paidDate ? e.paidDate : e.dueDate,
        type: "despesa",
        status: e.paid ? "paid" : "pending",
        account: paymentMethodName(e.paymentMethodId),
      });
    });

    // 2. Compras no cartão
    monthCardPurchases.forEach((p) => {
      if (p.amount <= 0) return;
      if (!matches(p.category)) return;
      list.push({
        id: `card-${p.id}`,
        description: p.description,
        amount: p.amount,
        date: p.paid && p.paidDate ? p.paidDate : p.dueDate,
        type: "despesa",
        status: p.paid ? "paid" : "pending",
        account: p.cardName,
      });
    });

    // 3. Saldo inicial não discriminado
    if (monthCardUnclassifiedTotal > 0.005 && matches(CREDIT_CARD_INVOICE_CATEGORY)) {
      list.push({
        id: `card-unclassified-${selectedMonth}`,
        description: "Saldo anterior / Ajuste de fatura",
        amount: monthCardUnclassifiedTotal,
        date: `${selectedMonth}-01`,
        type: "despesa",
        status: "pending",
        account: "Cartão de Crédito",
      });
    }

    return list.sort((a, b) => b.amount - a.amount);
  }, [
    selectedTopCategory,
    categoryData,
    spendingMonth,
    getInstallmentAmount,
    monthCardPurchases,
    monthCardUnclassifiedTotal,
    selectedMonth,
    paymentMethodsList,
  ]);

  const selectedTopCategoryTotal =
    categoryData.find((c) => c.name === selectedTopCategory)?.value || 0;

  const topDescriptionEntries: CategoryEntry[] = useMemo(() => {
    if (!selectedTopDescription) return [];
    const norm = (s: string) => (s || "Sem descrição").trim() || "Sem descrição";
    const list: CategoryEntry[] = [];

    // 1. Despesas diretas
    spendingMonth.forEach((e) => {
      const v = getInstallmentAmount(e);
      if (v <= 0) return;
      if (norm(e.description) !== selectedTopDescription) return;
      list.push({
        id: `exp-${e.id}`,
        description: e.description,
        amount: v,
        date: e.paid && e.paidDate ? e.paidDate : e.dueDate,
        type: "despesa",
        status: e.paid ? "paid" : "pending",
        account: paymentMethodName(e.paymentMethodId),
      });
    });

    // 2. Compras no cartão
    monthCardPurchases.forEach((p) => {
      if (p.amount <= 0) return;
      if (norm(p.description) !== selectedTopDescription) return;
      list.push({
        id: `card-${p.id}`,
        description: p.description,
        amount: p.amount,
        date: p.paid && p.paidDate ? p.paidDate : p.dueDate,
        type: "despesa",
        status: p.paid ? "paid" : "pending",
        account: p.cardName,
      });
    });

    // 3. Saldo inicial não discriminado
    if (
      monthCardUnclassifiedTotal > 0.005 &&
      selectedTopDescription === "Saldo anterior / Ajuste fatura"
    ) {
      list.push({
        id: `card-unclassified-${selectedMonth}`,
        description: "Saldo anterior / Ajuste de fatura",
        amount: monthCardUnclassifiedTotal,
        date: `${selectedMonth}-01`,
        type: "despesa",
        status: "pending",
        account: "Cartão de Crédito",
      });
    }

    return list.sort((a, b) => b.amount - a.amount);
  }, [
    selectedTopDescription,
    spendingMonth,
    getInstallmentAmount,
    monthCardPurchases,
    monthCardUnclassifiedTotal,
    selectedMonth,
    paymentMethodsList,
  ]);

  const selectedTopDescriptionTotal = topDescriptionEntries.reduce(
    (s, e) => s + (Number(e.amount) || 0),
    0,
  );

  const totalCategorized = categoryData.reduce((s, it) => s + it.value, 0);

  // Spend per category — includes paid AND pending expenses (excluding cofrinho)
  // so budget limits and the intelligent report reflect the real total commitment.
  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    spendingMonth.forEach((e) => {
      const cat = (e.category || "Outros").trim() || "Outros";
      map.set(cat, (map.get(cat) || 0) + getInstallmentAmount(e));
    });
    if (!isBusiness) {
      monthCardPurchases.forEach((p) => {
        map.set(p.category, (map.get(p.category) || 0) + p.amount);
      });
      if (monthCardUnclassifiedTotal > 0.005) {
        map.set(
          CREDIT_CARD_INVOICE_CATEGORY,
          (map.get(CREDIT_CARD_INVOICE_CATEGORY) || 0) + monthCardUnclassifiedTotal,
        );
      }
    }
    return map;
  }, [spendingMonth, getInstallmentAmount, isBusiness, monthCardPurchases, monthCardUnclassifiedTotal]);

  // Committed per category — used to sort budget subcards.
  // Inclui pagos no mês + pendentes cuja data de vencimento esteja no mês selecionado.
  const committedByCategory = useMemo(() => {
    const map = new Map<string, number>();
    spendingMonth.forEach((e) => {
      const inMonth = e.paid
        ? true // já está em spendingMonth porque foi pago no mês
        : occursInMonth(e, selectedMonth);
      if (!inMonth) return;
      const cat = (e.category || "Outros").trim() || "Outros";
      map.set(cat, (map.get(cat) || 0) + getInstallmentAmount(e));
    });
    if (!isBusiness) {
      monthCardPurchases.forEach((p) => {
        map.set(p.category, (map.get(p.category) || 0) + p.amount);
      });
      if (monthCardUnclassifiedTotal > 0.005) {
        map.set(
          CREDIT_CARD_INVOICE_CATEGORY,
          (map.get(CREDIT_CARD_INVOICE_CATEGORY) || 0) + monthCardUnclassifiedTotal,
        );
      }
    }
    return map;
  }, [spendingMonth, getInstallmentAmount, selectedMonth, isBusiness, monthCardPurchases, monthCardUnclassifiedTotal]);

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpentBudgeted = budgets.reduce((s, b) => s + (spentByCategory.get(b.category) || 0), 0);

  // Budget overrun alert intentionally disabled on the Despesas tab.

  const openBudgetEdit = () => {
    const draft: Record<string, string> = {};
    allBudgetCategories.forEach((c) => {
      // Pré-preenche com o limite do próprio mês; se não houver, usa o herdado
      // (assim editar gera um novo registro próprio sem alterar o mês de origem).
      const own = monthBudgets.find((b) => b.category === c.name);
      const inherited = budgets.find((b) => b.category === c.name);
      const value = own?.amount ?? inherited?.amount ?? 0;
      draft[c.name] = value > 0 ? String(value) : "";
    });
    setBudgetDraft(draft);
    setBudgetEditOpen(true);
  };

  const saveBudgets = async () => {
    for (const c of allBudgetCategories) {
      const raw = budgetDraft[c.name] ?? "";
      const num = Number(raw.replace(",", "."));
      const value = isNaN(num) ? 0 : num;
      const ownExisting = monthBudgets.find((b) => b.category === c.name);
      // Se mantiver o valor herdado e não há limite próprio, não precisa criar.
      const inheritedSame =
        !ownExisting && isInherited &&
        budgets.find((b) => b.category === c.name)?.amount === value &&
        value > 0;
      if (inheritedSame) continue;
      if ((ownExisting?.amount ?? 0) !== value) {
        await setBudget(c.name, value);
      }
    }
    toast.success("Limites atualizados");
    setBudgetEditOpen(false);
  };

  const formatMonthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return format(new Date(y, m - 1, 1), "MMM/yyyy", { locale: ptBR });
  };

  const matchesSourceFilter = (e: Expense, filter: "all" | "auto" | "manual") => {
    if (filter === "all") return true;
    const isBot = isBotExpense(e);
    return filter === "auto" ? isBot : !isBot;
  };

  // Despesas vinculadas a cartão de crédito NÃO aparecem na lista geral —
  // elas são exibidas exclusivamente dentro da fatura do cartão correspondente.
  // Transferências para cofrinho também são excluídas: elas não contam como gasto
  // mensal (ver `spendingMonth`), então precisam ficar fora da lista para que o
  // total de "Pagas" no card bata com o somatório dos itens filtrados.
  const listVisibleMonth = useMemo(
    () => visibleMonth.filter((e) => !cardFilter && !isCreditCardExpense(e) && !isPiggyExpense(e.notes)),
    [visibleMonth, cardFilter],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const [sYear, sMonth] = selectedMonth.split("-").map(Number);
    
    return listVisibleMonth
      .filter((e) => {
        const matchesSearch = !q || e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
        const matchesCategory = !categoryFilter || e.category === categoryFilter;
        const matchesSource = matchesSourceFilter(e, sourceFilter);
        return matchesSearch && matchesCategory && matchesSource;
      })
      .map((e) => {
        // Determina o status da parcela específica para o mês selecionado
        const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
        if (!isRec) return e;

        const scheduleStart = getInstallmentScheduleStart(e);
        const [sy, sm, originalDay] = scheduleStart.split("-");
        const [sYear, sMonth] = selectedMonth.split("-").map(Number);
        const [startYear, startMonth] = [Number(sy), Number(sm)];
        
        // Posição da parcela (0-indexed) baseada no avanço do tempo (meses desde o início)
        const diffMonths = (sYear * 12 + sMonth) - (startYear * 12 + startMonth);
        const installmentIndex = Math.min(Math.max(0, diffMonths), (e.installments || 1) - 1);

        // installmentIndex é 0-based, paidInstallments é 1-based
        const isThisInstallmentPaid = (e.paidInstallments || 0) > installmentIndex;

        const virtualDueDate = `${selectedMonth}-${originalDay}`;

        return {
          ...e,
          paid: isThisInstallmentPaid,
          dueDate: virtualDueDate,
          paidDate: isThisInstallmentPaid ? e.paidDate : undefined
        };
      })
      .filter((e) => {
        if (filter === "pending") return !e.paid;
        if (filter === "paid") return e.paid;
        if (filter === "overdue") return isOverdue(e);
        return true;
      })
      .sort((a, b) => {
        if (a.paid !== b.paid) return a.paid ? 1 : -1;
        return b.dueDate.localeCompare(a.dueDate);
      });
  }, [listVisibleMonth, search, filter, categoryFilter, sourceFilter, selectedMonth]);

  const filters: { id: Filter; label: string; count: number }[] = useMemo(() => {
    let cPending = 0, cOverdue = 0, cPaid = 0, cAll = 0;
    
    // Despesas diretas (caso cardFilter não esteja ativo)
    for (const raw of listVisibleMonth) {
      const e = filtered.find(f => f.id === raw.id) || raw;
      const overdue = isOverdue(e);
      if (!e.paid && !overdue) cPending += 1;
      if (overdue) cOverdue += 1;
      if (e.paid) cPaid += 1;
      cAll += 1;
    }

    // Faturas de cartão de crédito
    if (!isBusiness) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const [iy, im] = selectedMonth.split("-").map(Number);
      const daysInMonth = new Date(iy, im, 0).getDate();
      const searchLow = search.trim().toLowerCase();

      cardInvoiceTotalsMonth
        .filter((x) => x.total > 0 || x.paidTotal > 0)
        .filter(() => !categoryFilter || categoryFilter === CREDIT_CARD_INVOICE_CATEGORY)
        .filter((x) => {
          if (!searchLow) return true;
          const nickname = (x.card.nickname ?? "").toLowerCase();
          const lastFour = (x.card.lastFour ?? "").toLowerCase();
          const label = `fatura cartão ${nickname} ${lastFour}`.toLowerCase();
          return label.includes(searchLow);
        })
        .filter(() => sourceFilter !== "auto")
        .forEach((x) => {
          const dd = String(Math.min(x.card.dueDay, daysInMonth)).padStart(2, "0");
          const due = `${selectedMonth}-${dd}`;
          const overdue = !x.paid && due < todayStr;
          if (!x.paid && !overdue) cPending += 1;
          if (overdue) cOverdue += 1;
          if (x.paid) cPaid += 1;
          cAll += 1;
        });
    }

    return [
      { id: "all", label: "Todas", count: cAll },
      { id: "pending", label: "Pendentes", count: cPending },
      { id: "overdue", label: "Atrasadas", count: cOverdue },
      { id: "paid", label: "Pagas", count: cPaid },
    ];
  }, [listVisibleMonth, filtered, isBusiness, selectedMonth, search, categoryFilter, sourceFilter, cardInvoiceTotalsMonth]);

  const filteredExpensesTotal = useMemo(() => {
    // 1. Despesas diretas
    let sumExpenses = 0;
    for (const e of filtered) {
      const amt = getInstallmentAmount(e);
      const partial = e.paid ? 0 : Math.min(amt, partialPaidForMonth(e.notes, selectedMonth));
      const remaining = Math.max(0, amt - partial);
      if (filter === "paid") {
        sumExpenses += e.paid ? amt : partial;
      } else if (filter === "pending") {
        sumExpenses += e.paid ? 0 : remaining;
      } else if (filter === "overdue") {
        sumExpenses += isOverdue(e) ? remaining : 0;
      } else {
        sumExpenses += amt;
      }
    }

    // 2. Faturas de cartão de crédito
    let sumInvoices = 0;
    for (const r of invoiceRows) {
      if (filter === "paid") {
        sumInvoices += r.x.paidTotal;
      } else if (filter === "pending") {
        sumInvoices += r.remaining;
      } else if (filter === "overdue") {
        sumInvoices += r.overdue ? r.remaining : 0;
      } else {
        sumInvoices += r.x.total;
      }
    }

    return sumExpenses + sumInvoices;
  }, [filtered, invoiceRows, filter, getInstallmentAmount, selectedMonth]);


  const prevMonth = () => {
    const d = new Date(selYear, selMonthNum - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(selYear, selMonthNum, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const openPayDialog = (id: string) => {
    setPayingId(id);
    setPayDate(todayInAppTz());
    setPaidAmountInput("");
  };

  type SummaryView = "all" | "paid" | "pending" | "overdue";
  const [summaryView, setSummaryView] = useState<SummaryView | null>(null);

  const summaryViewMeta: Record<SummaryView, { label: string; total: number }> = {
    all: { label: "Gasto do mês", total: totalPaid + totalPending },
    paid: { label: "Pagas", total: totalActuallyPaid },
    pending: { label: "A pagar", total: totalPending },
    overdue: { label: "Atrasado", total: totalOverdue },
  };

  const summaryEntries: CategoryEntry[] = useMemo(() => {
    if (!summaryView) return [];
    const list: CategoryEntry[] = [];
    listVisibleMonth.forEach((e) => {
      const overdue = isOverdue(e);
      if (summaryView === "paid" && !e.paid) return;
      if (summaryView === "pending" && (e.paid || overdue)) return;
      if (summaryView === "overdue" && !overdue) return;
      const v = getInstallmentAmount(e);
      if (v <= 0) return;
      list.push({
        id: `exp-${e.id}`,
        description: e.description,
        amount: v,
        date: e.paid && e.paidDate ? e.paidDate : e.dueDate,
        type: "despesa",
        status: e.paid ? "paid" : overdue ? "overdue" : "pending",
        account: paymentMethodName(e.paymentMethodId),
      });
    });
    cardInvoiceTotalsMonth.forEach((inv, idx) => {
      const card = inv.card;
      const isPaid = inv.paid || inv.hasPaidOverride;
      const pendingVal = Math.max(0, inv.total - inv.paidTotal);
      let val = 0;
      if (summaryView === "all") val = isPaid ? inv.paidTotal : inv.total;
      else if (summaryView === "paid") val = isPaid ? inv.paidTotal : 0;
      else if (summaryView === "pending") val = isPaid ? 0 : pendingVal;
      if (val <= 0) return;
      const [yy, mm] = selectedMonth.split("-").map(Number);
      const lastDay = new Date(yy, mm, 0).getDate();
      const day = Math.min(card.dueDay || 1, lastDay);
      list.push({
        id: `inv-${card.id || idx}-${selectedMonth}-${summaryView}`,
        description: `Fatura ${card.nickname || card.bank || "Cartão"}`,
        amount: val,
        date: `${selectedMonth}-${String(day).padStart(2, "0")}`,
        type: "despesa",
        status: isPaid ? "paid" : "pending",
        account: card.nickname || card.bank || "Cartão de crédito",
      });
    });
    return list;
  }, [
    summaryView,
    listVisibleMonth,
    getInstallmentAmount,
    cardInvoiceTotalsMonth,
    selectedMonth,
    paymentMethodsList,
  ]);

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      {/* Month nav (acima do card de valor) */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button type="button"
          className="text-sm font-medium text-foreground min-w-[140px] text-center capitalize hover:text-primary transition-colors"
          onClick={() => {
            const n = new Date();
            setSelectedMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
          }}
        >
          {format(new Date(selYear, selMonthNum - 1, 1), "MMMM yyyy", { locale: ptBR })}
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Hero: gasto do mês + saúde financeira */}
      {(() => {
        const committed = totalPaid + totalPending;
        const overdueRatio = committed > 0 ? totalOverdue / committed : 0;
        const pendingRatio = committed > 0 ? totalPending / committed : 0;
        const healthScore = committed === 0
          ? 100
          : Math.max(0, Math.min(100, Math.round(100 - 60 * overdueRatio - 30 * pendingRatio)));

        const heroMetrics: HeroMetric[] = [
          { label: "Pagas", value: formatCurrency(totalActuallyPaid), tone: "success", icon: CheckCircle, onClick: () => setSummaryView("paid") },
          { label: "A pagar", value: formatCurrency(totalPending), tone: "warning", icon: CircleDollarSign, onClick: () => setSummaryView("pending") },
          { label: "Atrasado", value: formatCurrency(totalOverdue), tone: "destructive", icon: CircleDollarSign, onClick: () => setSummaryView("overdue") },
          { label: "Média diária", value: formatCurrency(dailyAverage), icon: CalendarDays },
        ];

        return (
          <div className="w-full space-y-4">
            <FinancialHeroCard
              eyebrow="Despesas do mês"
              value={formatCurrency(totalPaid)}
              metrics={heroMetrics}
            />


          </div>
        );
      })()}

      {/* Despesas (collapsible) */}
      <Card no3d>
        <CardContent className="p-3 sm:p-4">
          <button
            type="button"
            onClick={() => setExpensesExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left rounded-lg -m-1 p-1 hover:bg-muted/40 active:bg-muted/60 transition-colors"
            aria-expanded={expensesExpanded}
            aria-controls="despesas-content"
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Despesas ({filtered.length + invoiceRows.length})
              </h3>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${expensesExpanded ? "rotate-180" : ""}`}
              />
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground leading-none">
                {expensesExpanded
                  ? filter === "paid"
                    ? "Total pago"
                    : filter === "pending"
                    ? "Total a pagar"
                    : filter === "overdue"
                    ? "Total atrasado"
                    : "Total"
                  : cardFilter
                  ? "Pendente (Cartões)"
                  : "Pendente"}
              </div>
              <div
                className={`text-base font-bold ${
                  expensesExpanded
                    ? filter === "paid"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : filter === "pending" || filter === "overdue"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-foreground"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {formatCurrency(
                  expensesExpanded
                    ? filteredExpensesTotal
                    : cardFilter
                    ? invoiceRows.reduce((s, r) => s + r.remaining, 0)
                    : totalPending,
                )}
              </div>
            </div>
          </button>

          <div
            id="despesas-content"
            className={`grid transition-all duration-300 ease-in-out ${expensesExpanded ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"}`}
          >
            <div className="overflow-hidden min-h-0 space-y-3">
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Button
                  type="button"
                  size="sm"
                  variant={filter === "all" ? "default" : "outline"}
                  className="h-9 rounded-full min-w-0"
                  onClick={() => setFilter("all")}
                >
                  Todas
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={filter === "pending" ? "default" : "outline"}
                  className="h-9 rounded-full min-w-0 gap-1.5"
                  onClick={() => setFilter("pending")}
                >
                  <Clock className="h-3.5 w-3.5" /> Pendentes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={filter === "paid" ? "default" : "outline"}
                  className="h-9 rounded-full min-w-0 gap-1.5"
                  onClick={() => setFilter("paid")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Pagas
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>


              {/* Category filter */}
              <div className="flex items-center gap-2">
                <Select
                  value={categoryFilter ?? "__all__"}
                  onValueChange={(v) => setCategoryFilter(v === "__all__" ? null : v)}
                >
                  <SelectTrigger className="h-9 w-full sm:w-64">
                    <SelectValue placeholder="Filtrar por categoria" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__all__">Todas categorias</SelectItem>
                    {allBudgetCategories.map((c) => {
                      const Icon = c.icon;
                      return (
                        <SelectItem key={c.name} value={c.name}>
                          <span className="inline-flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${c.color})` }} />
                            {c.name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {categoryFilter && (
                  <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setCategoryFilter(null)}>
                    Limpar
                  </Button>
                )}
              </div>

              {/* Source filter (auto vs manual) */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSourceFilter(sourceFilter === "auto" ? "all" : "auto")}
                  className={`rounded-xl transition-all duration-200 ${sourceFilter === "auto" ? "bg-primary text-primary-foreground border-primary" : ""}`}
                  title="Despesas lançadas pelo bot do Telegram"
                >
                  Automáticas ({listVisibleMonth.filter(isBotExpense).length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSourceFilter(sourceFilter === "manual" ? "all" : "manual")}
                  className={`rounded-xl transition-all duration-200 ${sourceFilter === "manual" ? "bg-primary text-primary-foreground border-primary" : ""}`}
                  title="Despesas registradas manualmente no app"
                >
                  Manuais ({listVisibleMonth.filter((e) => !isBotExpense(e)).length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCardFilter(!cardFilter)}
                  className={`rounded-xl transition-all duration-200 ${cardFilter ? "bg-primary text-primary-foreground border-primary" : ""}`}
                  title="Despesas vinculadas a cartões de crédito"
                  style={{ display: isBusiness ? 'none' : 'inline-flex' }}
                >
                  Cartões ({isBusiness ? 0 : invoiceRows.length})
                </Button>
              </div>

              {/* Virtual: pending credit card invoices for the current month (UI shortcut) */}
              {(() => {
                const hasAny = filtered.length + invoiceRows.length > 0;


                if (!hasAny) {
                  return (
                    <Card no3d>
                      <CardContent className="py-12 text-center">
                        <Receipt className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-muted-foreground">
                          {expenses.length === 0 ? "Nenhuma despesa pessoal cadastrada" : "Nenhuma despesa encontrada"}
                        </p>
                      </CardContent>
                    </Card>
                  );
                }

                const combined: Array<
                  | { kind: "invoice"; dueDate: string; paid: boolean; total: number; data: typeof invoiceRows[number] }
                  | { kind: "expense"; dueDate: string; paid: boolean; total: number; data: typeof filtered[number] }
                > = [
                  ...invoiceRows.map((r) => ({ kind: "invoice" as const, dueDate: r.due, paid: r.paid, total: r.x.total, data: r })),
                  ...filtered.map((e) => ({ kind: "expense" as const, dueDate: e.dueDate, paid: !!e.paid, total: Number(e.amount) || 0, data: e })),
                ].sort((a, b) => {
                  if (a.paid !== b.paid) return a.paid ? 1 : -1;
                  // Faturas de cartão seguem a mesma classificação das demais despesas: data de vencimento
                  if (a.dueDate !== b.dueDate) return b.dueDate.localeCompare(a.dueDate);
                  return b.total - a.total;
                });


                return (
                  <div className="space-y-2">
                    {combined.map((item) => {
                      if (item.kind === "invoice") {
                        const { x, due, overdue, paid, isPartial, remaining } = item.data;
                        const dueAccent = getDueAccent(due, paid);
                        // O valor exibido no registro da fatura deve ser o total calculado (itens + saldo inicial)
                        // ou o valor pago real caso já esteja quitada (para bater com o extrato).
                        const displayAmount = paid ? x.paidTotal : x.total;
                        const cardLabel = x.card.nickname || "";
                        return (
                          <Card no3d key={`invoice-${x.card.id}`} className={`relative overflow-hidden rounded-2xl border-border/50 bg-card/70 backdrop-blur-xl transition-all duration-300 hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-lg cursor-pointer ${paid ? "" : dueAccent.border}`} onClick={() => setInvoiceCard(x.card)}>
                            <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 w-1 ${dueAccent.bar}`} />
                            <CardContent className="p-3 pl-4 sm:p-4 sm:pl-5">
                              <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/15">
                                  <CreditCardIcon className="h-5 w-5 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-foreground truncate">
                                        Fatura de Cartão{cardLabel ? ` — ${cardLabel}` : ""}
                                      </p>
                                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] px-1.5 py-0 ${
                                            paid
                                              ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                                              : isPartial
                                              ? "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                                              : dueAccent.text
                                          }`}
                                        >
                                          {paid
                                            ? "Paga"
                                            : isPartial
                                            ? "Pagamento parcial"
                                            : overdue
                                            ? "Atrasada"
                                            : dueAccent.status === "due_today"
                                            ? "Vence hoje"
                                            : "A vencer"}
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] px-1.5 py-0 border-primary/40 text-primary"
                                        >
                                          {CREDIT_CARD_INVOICE_CATEGORY}
                                        </Badge>
                                        {x.card.lastFour && (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] px-1.5 py-0 border-primary/20 bg-primary/5 text-primary/80"
                                          >
                                            •••• {x.card.lastFour}
                                          </Badge>
                                        )}
                                        <span className="inline-flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {formatDateBR(due, "dd/MM/yyyy")}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className={`text-sm font-bold ${paid ? "text-emerald-600 dark:text-emerald-400" : isPartial ? "text-amber-600 dark:text-amber-400" : dueAccent.text}`}>
                                        {formatCurrency(isPartial ? remaining : displayAmount)}
                                      </p>
                                      {isPartial && (
                                        <p className="text-[10px] text-muted-foreground tabular-nums">
                                          de {formatCurrency(x.total)} (pago {formatCurrency(x.paidTotal)})
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  {!readOnly && (
                                    <div className="flex items-center gap-1.5 mt-3">
                                      <Button data-mutation
                                        size="sm"
                                        variant={paid ? "outline" : "default"}
                                        className="h-7 text-xs flex-1"
                                        onClick={(e) => { e.stopPropagation(); setInvoiceCard(x.card); }}
                                      >
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        {paid ? "Ver fatura" : isPartial ? "Pagar restante" : "Pagar fatura"}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }

                      const expense = item.data;
                    const overdue = isOverdue(expense);
                    const dueAccent = getDueAccent(expense.dueDate, expense.paid);
                    const isRecorrente = expense.type === "recorrente" && expense.installments && expense.installments > 1;
                    const installmentAmount = isRecorrente ? expense.amount / expense.installments! : expense.amount;
                    const parentExpense = expense.parentExpenseId
                      ? expenses.find((p) => p.id === expense.parentExpenseId)
                      : null;
                    const parentIsParcelada =
                      !!parentExpense &&
                      parentExpense.type === "recorrente" &&
                      !!parentExpense.installments &&
                      parentExpense.installments > 1 &&
                      parentExpense.installments !== FIXED_RECURRING_INSTALLMENTS;
                    const cat = resolveCategory(expense.category);
                    const Icon = cat.icon;

                    return (
                      <Card no3d key={expense.id} className={`relative overflow-hidden rounded-2xl border-border/50 bg-card/70 backdrop-blur-xl transition-all duration-300 hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-lg ${expense.paid ? "opacity-80" : dueAccent.border}`}>
                        <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 w-1 ${dueAccent.bar}`} />
                        <CardContent className="p-3 pl-4 sm:p-4 sm:pl-5">
                          {(() => {
                            const isParceladaFinitaSelf =
                              isRecorrente && expense.installments !== FIXED_RECURRING_INSTALLMENTS;
                            const isParceladaFinita = isParceladaFinitaSelf || parentIsParcelada;
                            const summaryTarget = isParceladaFinitaSelf ? expense : parentExpense;
                            // IMPORTANTE: nunca renderizar como `<button type="button">` porque o conteúdo
                            // interno inclui outros `<button type="button">` (Pagar, Editar, Excluir…).
                            // Botões aninhados são HTML inválido e o parser do navegador
                            // "quebra" a árvore, provocando remontagem do DOM em cada
                            // re-render — o que reposicionava a rolagem ao topo. Usamos um
                            // <div role="button"> quando clicável.
                            const wrapperProps = isParceladaFinita
                              ? {
                                  role: "button" as const,
                                  tabIndex: 0,
                                  onClick: () => summaryTarget && setSummaryExpense(summaryTarget),
                                  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                                    if ((e.key === "Enter" || e.key === " ") && summaryTarget) {
                                      e.preventDefault();
                                      setSummaryExpense(summaryTarget);
                                    }
                                  },
                                  className:
                                    "flex items-start gap-3 w-full text-left rounded-lg -m-1 p-1 hover:bg-muted/40 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  "aria-label": `Ver resumo de ${expense.description}`,
                                }
                              : { className: "flex items-start gap-3" };
                            return (
                              <div {...wrapperProps}>
                            <div
                              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `hsl(${cat.color} / 0.15)` }}
                            >
                              <Icon className="h-5 w-5" style={{ color: `hsl(${cat.color})` }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">{expense.description}</p>
                                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0"
                                      style={{ borderColor: `hsl(${cat.color} / 0.5)`, color: `hsl(${cat.color})` }}
                                    >
                                      {expense.category}
                                    </Badge>
                                    {(() => {
                                      const badge = getDueStatusBadge(expense.dueDate, expense.paid, { overdue: "Atrasada" });
                                      return (
                                        <Badge variant={badge.variant} className={`${badge.className} text-[10px] px-1.5 py-0`}>
                                          {badge.label}
                                        </Badge>
                                      );
                                    })()}
                                    {isParceladaFinita && summaryTarget && (() => {
                                      const total = summaryTarget.installments!;
                                      let current: number;
                                      if (isParceladaFinitaSelf) {
                                         const scheduleStart = getInstallmentScheduleStart(summaryTarget);
                                         const [sy, sm] = scheduleStart.split("-").map(Number);
                                         const [sYear, sMonth] = selectedMonth.split("-").map(Number);
                                         const diffMonths = (sYear * 12 + sMonth) - (sy * 12 + sm);
                                         current = Math.min(Math.max(1, diffMonths + 1), total);
                                      } else {
                                        const siblings = expenses
                                          .filter((c) => c.parentExpenseId === summaryTarget.id && c.paid)
                                          .sort((a, b) => {
                                            const da = a.paidDate ?? a.dueDate ?? "";
                                            const db = b.paidDate ?? b.dueDate ?? "";
                                            if (da !== db) return da.localeCompare(db);
                                            return (a.id ?? "").localeCompare(b.id ?? "");
                                          });
                                        const idx = siblings.findIndex((c) => c.id === expense.id);
                                        current = idx >= 0 ? idx + 1 : 1;
                                      }
                                      return (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                          {current}/{total} parcelas
                                        </Badge>
                                      );
                                    })()}
                                    <span className="inline-flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {formatDateBR(expense.dueDate, "dd/MM/yyyy")}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  {isCreditCardExpense(expense) || (expense.paymentMethodId && cards.some(c => c.id === expense.paymentMethodId)) ? (() => {
                                    // Se a despesa é de cartão, mostramos o total da fatura atual desse cartão no mês
                                    const cardId = expense.paymentMethodId;
                                    const invoiceInfo = cardId ? cardInvoiceMap.get(cardId) : null;
                                    // Se não temos o invoiceInfo pelo paymentMethodId, tentamos pelo notes/tags (ID explícito)
                                    let finalInvoiceInfo = invoiceInfo;
                                    if (!finalInvoiceInfo) {
                                      const idMatch = /\{ID:([a-f0-9-]{36})\}/i.exec(expense.notes || "");
                                      if (idMatch) {
                                        finalInvoiceInfo = cardInvoiceMap.get(idMatch[1]);
                                      }
                                    }

                                    const partialPaid = expense.paid ? 0 : partialPaidForMonth(expense.notes, selectedMonth);
                                    const isPartial = !expense.paid && partialPaid > 0.005;
                                    const remaining = Math.max(0, installmentAmount - partialPaid);

                                    if (finalInvoiceInfo) {
                                      const isPaid = finalInvoiceInfo.paid;
                                      const isCardPartial = !isPaid && finalInvoiceInfo.paidTotal > 0.005;
                                      const cardRemaining = Math.max(0, Number((finalInvoiceInfo.total - finalInvoiceInfo.paidTotal).toFixed(2)));
                                      const val = isPaid ? finalInvoiceInfo.paidTotal : isCardPartial ? cardRemaining : finalInvoiceInfo.total;
                                      
                                      return (
                                        <>
                                          <p className={`text-sm font-bold ${isPaid ? "text-emerald-600 dark:text-emerald-400" : isCardPartial ? "text-amber-600 dark:text-amber-400" : dueAccent.text}`}>
                                            {formatCurrency(val)}
                                          </p>
                                          <p className="text-[10px] text-muted-foreground mt-0.5">
                                            {isCardPartial ? "Fatura atual (restante)" : "Valor da fatura"}
                                          </p>
                                        </>
                                      );
                                    }

                                    return (
                                      <>
                                        <p className={`text-sm font-bold ${isPartial ? "text-amber-600 dark:text-amber-400" : dueAccent.text}`}>
                                          {formatCurrency(isPartial ? remaining : installmentAmount)}
                                        </p>
                                        {isPartial && (
                                          <p className="text-[10px] text-muted-foreground mt-0.5">
                                            Restante de {formatCurrency(installmentAmount)}
                                          </p>
                                        )}
                                      </>
                                    );
                                  })() : (
                                    (() => {
                                      const partialPaid = expense.paid ? 0 : partialPaidForMonth(expense.notes, selectedMonth);
                                      const isPartial = !expense.paid && partialPaid > 0.005;
                                      const remaining = Math.max(0, installmentAmount - partialPaid);
                                      return (
                                        <>
                                          <p className={`text-sm font-bold ${isPartial ? "text-amber-600 dark:text-amber-400" : dueAccent.text}`}>
                                            {formatCurrency(isPartial ? remaining : installmentAmount)}
                                          </p>
                                          {isPartial ? (
                                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                              Restante de {formatCurrency(installmentAmount)}
                                            </p>
                                          ) : expense.paid && expense.paidDate ? (
                                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                              Pago em {formatDateBR(expense.paidDate, "dd/MM/yyyy")}
                                            </p>
                                          ) : null}
                                        </>
                                      );
                                    })()
                                  )}
                                </div>
                              </div>
                              {(() => {
                                const partialPaid = expense.paid ? 0 : partialPaidForMonth(expense.notes, selectedMonth);
                                if (partialPaid <= 0) return null;
                                const remaining = Math.max(0, installmentAmount - partialPaid);
                                return (
                                  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
                                    <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                      Parcialmente paga — {formatCurrency(partialPaid)} de {formatCurrency(installmentAmount)}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      Saldo pendente: {formatCurrency(remaining)}
                                    </p>
                                  </div>
                                );
                              })()}
                              {!readOnly && (
                                <div
                                  className="flex items-center gap-1.5 mt-3"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {!expense.paid && (
                                    <Button data-mutation size="sm" className="h-7 text-xs" onClick={() => openPayDialog(expense.id)}>
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Pagar
                                    </Button>
                                  )}
                                  {expense.paid && onUnpay && (
                                    <Button data-mutation size="sm" variant="outline" className="h-7 text-xs" onClick={() => setUnpayingId(expense.id)}>
                                      <Undo2 className="h-3 w-3 mr-1" />
                                      Estornar
                                    </Button>
                                  )}
                                  {onUpdate && (
                                    <Button data-mutation size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingExpense(expense)}>
                                      <Pencil className="h-3 w-3 mr-1" />
                                      Editar
                                    </Button>
                                  )}
                                  <ExpenseBoletoLinkButton expenseId={expense.id} className="h-7 w-7" />
                                  <Button data-mutation size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget({ expense, month: selectedMonth })}>
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Excluir
                                  </Button>

                                </div>
                              )}

                            </div>
                              </div>
                            );
                          })()}
                        </CardContent>
                      </Card>
                    );
                  })}
                  </div>
                );
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Limites de gastos por categoria (escopo mensal + herança) — apenas modo pessoal */}
      {!isBusiness && (<>
      {/* placeholder-open */}
      <Card no3d className="overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-muted/20">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 ring-1 ring-primary/20">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground leading-tight">
                  Limites de gastos
                </h3>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {budgets.length === 0
                    ? "Defina um valor máximo mensal por categoria"
                    : isInherited && effectiveMonth
                      ? `Herdado de ${formatMonthLabel(effectiveMonth)}`
                      : `${budgets.length} ${budgets.length === 1 ? "categoria" : "categorias"} configuradas`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isInherited && !readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs rounded-lg"
                  onClick={() => inheritIntoMonth()}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Usar para este mês
                </Button>
              )}
              <Button data-mutation
                variant={budgets.length === 0 ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs rounded-lg"
                onClick={openBudgetEdit}
                disabled={readOnly}
              >
                <Target className="h-3.5 w-3.5 mr-1" />
                {budgets.length === 0 ? "Definir limites" : "Editar limites"}
              </Button>
            </div>
          </div>

          {budgets.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {budgets
                  .slice()
                  .sort((a, b) => {
                    const sa = committedByCategory.get(a.category) || 0;
                    const sb = committedByCategory.get(b.category) || 0;
                    if (sb !== sa) return sb - sa;
                    return a.category.localeCompare(b.category, "pt-BR");
                  })
                  .slice(0, 4)
                  .map((b) => {
                    const cat = resolveCategory(b.category);
                    const Icon = cat.icon;
                    const spent = spentByCategory.get(b.category) || 0;
                    const pct = b.amount > 0 ? Math.min(200, (spent / b.amount) * 100) : 0;
                    const over = spent > b.amount;
                    const own = monthBudgets.find((x) => x.id === b.id);
                    const accentColor = over ? "0 84% 60%" : cat.color;
                    return (
                      <button
                        type="button"
                        key={b.id}
                        onClick={() => setBudgetDetailCat(b.category)}
                        className={`text-left rounded-2xl border bg-card p-3 flex flex-col gap-2 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          over
                            ? "border-destructive/40 shadow-[0_2px_8px_-4px_hsl(0_84%_60%_/_0.15)]"
                            : "border-border/60 hover:border-primary/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `hsl(${accentColor} / 0.15)` }}
                            >
                              <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${accentColor})` }} />
                            </div>
                            <span className="truncate text-xs font-semibold text-foreground">
                              {b.category}
                            </span>
                          </div>
                          {own && !readOnly && (
                            <span
                              role="button"
                              tabIndex={0}
                              className="h-5 w-5 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer transition-colors"
                              onClick={(e) => { e.stopPropagation(); deleteBudget(own.id); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); deleteBudget(own.id); } }}
                              title="Remover limite deste mês"
                            >
                              <Trash2 className="h-3 w-3" />
                            </span>
                          )}
                        </div>

                        <div className="flex items-baseline justify-between gap-1 mt-0.5">
                          <span
                            className={`text-[15px] font-bold tabular-nums leading-none ${
                              over ? "text-destructive" : "text-foreground"
                            }`}
                          >
                            {formatCurrency(spent)}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums leading-none">
                            / {formatCurrency(b.amount)}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted/70">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, pct)}%`,
                                backgroundColor: over ? "hsl(0 84% 60%)" : `hsl(${cat.color})`,
                              }}
                            />
                          </div>
                          <span
                            className={`text-[10px] tabular-nums ${
                              over ? "text-destructive font-semibold" : "text-muted-foreground"
                            }`}
                          >
                            {Math.round(pct)}% utilizado
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
              {budgets.length > 4 && (
                <p className="text-[11px] text-muted-foreground text-center">
                  Mostrando as 4 categorias com maior gasto. {budgets.length - 4}{" "}
                  {budgets.length - 4 === 1 ? "outra" : "outras"} configurada
                  {budgets.length - 4 === 1 ? "" : "s"}.
                </p>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/60">
                <span className="font-medium">Total</span>
                <span className="tabular-nums">
                  {formatCurrency(totalSpentBudgeted)} / {formatCurrency(totalBudget)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </>)}


      {/* Category chart — shared financial components (Fase 2) */}
      {categoryData.length > 0 && (() => {
        const slices = categoryData.map((entry) => ({
          name: entry.name,
          value: entry.value,
          color: `hsl(${entry.cat.color})`,
        }));
        return (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CategoryRanking
              title="Top 5 despesas por descrição"
              items={descriptionData.map((entry) => ({
                name: entry.name,
                value: entry.value,
                color: `hsl(${entry.cat.color})`,
              }))}
              formatCurrency={formatCurrency}
              emptyLabel="Sem despesas no período"
              onSelect={(name) => setSelectedTopDescription(name)}
            />

            <CategoryDonutChart
              title="Gastos por categoria"
              slices={slices}
              formatCurrency={formatCurrency}
              centerLabel="Despesas"
              onClick={() => {
                setAllCategoriesInitialTab("all");
                setAllCategoriesOpen(true);
              }}
              onSelectSlice={(sliceName) => {
                setAllCategoriesInitialTab(sliceName);
                setAllCategoriesOpen(true);
              }}
            />
          </div>
        );
      })()}

      <AllCategoriesSheet
        open={allCategoriesOpen}
        onOpenChange={setAllCategoriesOpen}
        initialMonth={selectedMonth}
        expenses={expenses}
        allExpenses={allExpenses}
        cards={cards}
        openings={openings}
        isBusiness={isBusiness}
        resolveCategory={resolveCategory}
        paymentMethodName={paymentMethodName}
        initialCategory={allCategoriesInitialTab}
        formatCurrency={formatCurrency}
      />


      <CategoryDetailsSheet
        open={!!selectedTopCategory}
        onOpenChange={(o) => !o && setSelectedTopCategory(null)}
        categoryName={selectedTopCategory || ""}
        entries={topCategoryEntries}
        total={selectedTopCategoryTotal}
      />

      <CategoryDetailsSheet
        open={!!selectedTopDescription}
        onOpenChange={(o) => !o && setSelectedTopDescription(null)}
        categoryName={selectedTopDescription || ""}
        entries={topDescriptionEntries}
        total={selectedTopDescriptionTotal}
      />

      <CategoryDetailsSheet
        open={!!summaryView}
        onOpenChange={(o) => !o && setSummaryView(null)}
        categoryName={summaryView ? summaryViewMeta[summaryView].label : ""}
        entries={summaryEntries}
        total={summaryView ? summaryViewMeta[summaryView].total : 0}
      />



      {typeof afterEvolution === "function"
        ? afterEvolution({ selectedMonth })
        : afterEvolution}

      {/* Pay dialog */}
      <Dialog open={!!payingId} onOpenChange={(o) => { if (!o) { setPayingId(null); setPartialMode(false); setPartialValue(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription>
              {partialMode
                ? "Informe um valor menor que o saldo pendente para registrar um pagamento parcial."
                : "Confirme a data e, se quiser, informe o valor efetivamente pago."}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const exp = expenses.find((e) => e.id === payingId);
            const suggested = exp ? getInstallmentAmount(exp) : 0;
            const alreadyPartial = exp ? partialPaidForMonth(exp.notes, selectedMonth) : 0;
            const outstanding = Math.max(0, round2(suggested - alreadyPartial));
            return (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Data</Label>
                  <DatePickerField value={payDate} onChange={setPayDate} />
                </div>
                {alreadyPartial > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Já pago parcialmente: {formatCurrency(alreadyPartial)} — saldo {formatCurrency(outstanding)}.
                  </p>
                )}
                {partialMode ? (
                  <div>
                    <Label htmlFor="partial-amount-personal" className="text-xs">Valor do pagamento parcial</Label>
                    <Input
                      id="partial-amount-personal"
                      type="number"
                      step="0.01"
                      min="0"
                      max={outstanding}
                      value={partialValue}
                      onChange={(e) => setPartialValue(e.target.value)}
                      placeholder={outstanding.toFixed(2)}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Máximo: {formatCurrency(outstanding)}. O restante continua pendente.
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="pay-amount-personal" className="text-xs">Valor pago (opcional)</Label>
                    <Input
                      id="pay-amount-personal"
                      type="number"
                      step="0.01"
                      min="0"
                      value={paidAmountInput}
                      onChange={(e) => setPaidAmountInput(e.target.value)}
                      placeholder={outstanding.toFixed(2)}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Em branco usa o valor pendente ({formatCurrency(outstanding)}).
                    </p>
                  </div>
                )}
                {onPayPartial && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-0 text-xs text-primary"
                    onClick={() => { setPartialMode((v) => !v); setPartialValue(""); }}
                  >
                    {partialMode ? "Pagar valor total" : "Registrar pagamento parcial"}
                  </Button>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayingId(null); setPartialMode(false); }}>Cancelar</Button>
            <Button onClick={async () => {
              if (payingId) {
                const exp = expenses.find((e) => e.id === payingId);
                const suggested = exp ? getInstallmentAmount(exp) : 0;
                const outstanding = Math.max(0, round2(suggested - (exp ? partialPaidForMonth(exp.notes, selectedMonth) : 0)));
                if (partialMode && onPayPartial) {
                  const parsed = parseFloat(partialValue);
                  if (!parsed || isNaN(parsed) || parsed <= 0) return;
                  const ok = await onPayPartial(payingId, Math.min(parsed, outstanding), payDate, selectedMonth);
                  if (ok && parsed >= outstanding - 0.005) {
                    celebrate({ kind: "expense", message: "Despesa quitada!", amount: outstanding });
                  }
                } else {
                  const parsed = parseFloat(paidAmountInput);
                  const paidAmount = paidAmountInput.trim() && !isNaN(parsed) && parsed > 0 ? parsed : outstanding || undefined;
                  onPay(payingId, false, payDate, paidAmount);
                  celebrate({ kind: "expense", message: "Despesa quitada!", amount: paidAmount });
                }
              }
              setPayingId(null);
              setPaidAmountInput("");
              setPartialMode(false);
              setPartialValue("");
            }}>
              {partialMode ? "Registrar pagamento parcial" : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete with scope */}
      <DeleteScopeDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        context={isBusiness ? "business" : "personal"}
        label={deleteTarget?.expense.description}
        isSeries={deleteTarget ? isExpenseSeries(deleteTarget.expense) : false}
        onConfirm={async (scope) => {
          if (!deleteTarget) return;
          if (onDeleteScoped) {
            await onDeleteScoped(deleteTarget.expense, deleteTarget.month, scope);
          } else {
            onDelete(deleteTarget.expense.id);
          }
          setDeleteTarget(null);
        }}
      />

      <InstallmentSummaryDialog
        open={!!summaryExpense}
        onOpenChange={(o) => !o && setSummaryExpense(null)}
        expense={summaryExpense}
      />

      {/* Unpay confirm */}
      <Dialog open={!!unpayingId} onOpenChange={(o) => !o && setUnpayingId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Estornar pagamento</DialogTitle>
            <DialogDescription>
              Esta despesa voltará para o status pendente. Aportes vinculados a cofrinhos também serão revertidos. Deseja continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnpayingId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (unpayingId && onUnpay) onUnpay(unpayingId);
                setUnpayingId(null);
              }}
            >
              Confirmar estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <ExpenseEditDialog
        open={!!editingExpense}
        onOpenChange={(o) => !o && setEditingExpense(null)}
        expense={editingExpense}
        onSave={async (patch, scope) => {
          if (!editingExpense || !onUpdate) return;
          const exp = editingExpense;
          const totalInstallments = exp.parentExpenseId
            ? expenses.find((e) => e.id === exp.parentExpenseId)?.installments ?? exp.installments ?? 1
            : (exp.installments ?? 1);
          // patch.amount vem como TOTAL do dialog; converte para POR PARCELA.
          const perInstallment = (exp.type === "recorrente" && (exp.installments ?? 0) > 1)
            ? patch.amount / totalInstallments
            : exp.parentExpenseId
              ? patch.amount
              : patch.amount;
          try {
            await applyExpenseScopedUpdate({
              target: exp,
              patch: {
                description: patch.description,
                amount: perInstallment,
                dueDate: patch.dueDate,
                category: patch.category,
                notes: patch.notes,
              },
              scope,
              expenses,
              onUpdateLocal: async (id, data) => { await onUpdate(id, data); },
            });
          } catch (err) {
            console.error("[scope-edit] propagation failed", err);
          }

          toast.success(
            scope === "all"
              ? "Despesa e histórico atualizados"
              : scope === "pending"
                ? "Esta parcela e as próximas atualizadas"
                : "Parcela atualizada",
          );
        }}
      />
      {!isBusiness && (<>
      <Dialog open={budgetEditOpen} onOpenChange={setBudgetEditOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Limites de {formatMonthLabel(targetMonth)}</DialogTitle>
            <DialogDescription>
              Defina um valor máximo por categoria para este mês. Deixe em branco ou 0 para remover.
              {isInherited && effectiveMonth && (
                <> Sem alteração, os limites de <strong>{formatMonthLabel(effectiveMonth)}</strong> continuam valendo.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 py-2">
            <div className="flex justify-end">
              <Button data-mutation
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryEditorOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Nova categoria
              </Button>
            </div>
            {allBudgetCategories
              .slice()
              .sort((a, b) => {
                const sa = committedByCategory.get(a.name) || 0;
                const sb = committedByCategory.get(b.name) || 0;
                if (sb !== sa) return sb - sa;
                return a.name.localeCompare(b.name, "pt-BR");
              })
              .map((c) => {
                const Icon = c.icon;
                const spent = spentByCategory.get(c.name) || 0;
                const customMatch = c.custom
                  ? customCategories.find((cc) => cc.id === c.id)
                  : null;
                return (
                  <div key={c.name} className="flex items-center gap-2">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `hsl(${c.color} / 0.15)` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: `hsl(${c.color})` }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground truncate flex items-center gap-1.5">
                        {c.name}
                        <button
                          type="button"
                          onClick={async () => {
                            if (customMatch) {
                              setEditingCategory(customMatch);
                              setCreatorInitial(null);
                              setCategoryEditorOpen(true);
                              return;
                            }
                            // Built-in: cria silenciosamente uma categoria
                            // custom equivalente e abre o editor em modo
                            // edição — assim "editar" sempre edita, nunca
                            // cria uma duplicata visível para o usuário.
                            const created = await createCustomCategory({
                              name: c.name,
                              icon: getIconName(c.icon),
                              color: c.color,
                            });
                            if (created) {
                              setEditingCategory(created);
                              setCreatorInitial(null);
                              setCategoryEditorOpen(true);
                            }
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar categoria"
                          aria-label={`Editar ${c.name}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        Gasto: {formatCurrency(spent)}
                      </div>
                    </div>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="0,00"
                      className="w-28 h-8 text-sm"
                      value={budgetDraft[c.name] ?? ""}
                      onChange={(e) => setBudgetDraft((p) => ({ ...p, [c.name]: e.target.value }))}
                    />
                  </div>
                );
              })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetEditOpen(false)}>Cancelar</Button>
            <Button data-mutation onClick={saveBudgets}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PersonalCategoryCreator
        open={categoryEditorOpen}
        onOpenChange={(v) => {
          setCategoryEditorOpen(v);
          if (!v) {
            setEditingCategory(null);
            setCreatorInitial(null);
          }
        }}
        editing={editingCategory}
        initial={creatorInitial}
        createCategory={createCustomCategory}
        updateCategory={updateCustomCategory}
        deleteCategory={removeCustomCategory}
        onCreated={(cat) => {
          setBudgetDraft((p) => ({ ...p, [cat.name]: p[cat.name] ?? "" }));
        }}
        onUpdated={(cat) => {
          // If name changed, migrate any draft entry to the new key
          if (editingCategory && editingCategory.name !== cat.name) {
            setBudgetDraft((p) => {
              const next = { ...p };
              if (next[editingCategory.name] !== undefined) {
                next[cat.name] = next[editingCategory.name];
                delete next[editingCategory.name];
              }
              return next;
            });
          }
        }}
      />

      {/* Budget category detail — lists every expense composing this limit in the selected month */}
      <Dialog open={!!budgetDetailCat} onOpenChange={(v) => !v && setBudgetDetailCat(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {budgetDetailCat && (() => {
            const cat = resolveCategory(budgetDetailCat);
            const Icon = cat.icon;
            const budget = budgets.find((b) => b.category === budgetDetailCat)?.amount ?? 0;
            const items = spendingMonth
              .filter((e) => e.category === budgetDetailCat)
              .map((e) => ({ e, value: getInstallmentAmount(e) }))
              .sort((a, b) => (a.e.dueDate < b.e.dueDate ? -1 : 1));
            const total = items.reduce((s, it) => s + it.value, 0);
            const totalPaid = items.filter((it) => it.e.paid).reduce((s, it) => s + it.value, 0);
            const totalPending = total - totalPaid;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span
                      className="h-7 w-7 rounded-md flex items-center justify-center"
                      style={{ backgroundColor: `hsl(${cat.color} / 0.15)` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: `hsl(${cat.color})` }} />
                    </span>
                    {budgetDetailCat}
                  </DialogTitle>
                  <DialogDescription>
                    Despesas deste mês que compõem o limite{budget > 0 ? ` de ${formatCurrency(budget)}` : ""}.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md border border-border p-2">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</div>
                    <div className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</div>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Pago</div>
                    <div className="text-sm font-semibold tabular-nums text-primary">
                      {formatCurrency(totalPaid)}
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Pendente</div>
                    <div className="text-sm font-semibold tabular-nums text-destructive">
                      {formatCurrency(totalPending)}
                    </div>
                  </div>
                </div>

                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhuma despesa nesta categoria no mês selecionado.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {items.map(({ e, value }) => {
                      const overdueItem = !e.paid && e.dueDate < todayInAppTz();
                      return (
                        <li key={e.id} className="flex items-center gap-3 p-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {e.description}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                              <Calendar className="h-3 w-3" />
                              {formatDateBR(e.dueDate, "dd/MM/yyyy")}
                              {e.type === "recorrente" && e.installments && e.installments > 1 && (
                                <span className="ml-1">
                                  • {e.installments === FIXED_RECURRING_INSTALLMENTS ? "fixa" : `parcelada`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold tabular-nums">
                              {formatCurrency(value)}
                            </div>
                            <Badge
                              variant={e.paid ? "secondary" : overdueItem ? "destructive" : "outline"}
                              className="text-[10px] py-0 px-1.5 mt-0.5"
                            >
                              {e.paid ? "Paga" : overdueItem ? "Atrasada" : "Pendente"}
                            </Badge>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setBudgetDetailCat(null)}>Fechar</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {invoiceCard && (
        <CreditCardInvoice
          card={invoiceCard}
          referenceMonth={selectedMonth}
          onClose={() => setInvoiceCard(null)}
        />
      )}
      </>)}
    </div>
  );
}
