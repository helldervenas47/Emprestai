import { useCallback, useMemo, useState } from "react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { CustomIncomeCategory, useIncomeCategories } from "@/features/financial/hooks/useIncomeCategories";
import { Sale } from "@/types/loan";
import { SaleCategory, SaleClientGroup } from "./productSalesTypes";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import {
  SalesAdvancedFilters,
  countActiveSalesFilters,
  emptySalesFilters,
  getSaleSellers,
  matchesSalesFilters,
} from "./salesFilters";
import {
  addByFrequency,
  getNextDueDateHelper,
  getSaleCategory,
  getSalePaidAmountHelper,
  rawFormatCurrency,
} from "./productSalesUtils";

export type SalesViewMode = "cards" | "folders";
export type BreakdownCard = null | "overdue" | "paid" | "receivable" | "ontrack";

/**
 * Mantém os filtros avançados enquanto o usuário permanece no app/aba,
 * mesmo quando a lista é desmontada por troca de sub-aba.
 * Só é redefinido ao clicar em "Limpar filtros".
 */
const persistedFilters = new Map<string, SalesAdvancedFilters>();

export function useProductSalesController(sales: Sale[], scopeKey = "sales") {
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<SaleCategory>("all");
  const [incomeCategoryFilter, setIncomeCategoryFilter] = useState<string>("all");
  const [view, setView] = useState<SalesViewMode>("cards");
  const [breakdownCard, setBreakdownCard] = useState<BreakdownCard>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advancedFilters, setAdvancedFiltersState] = useState<SalesAdvancedFilters>(
    () => persistedFilters.get(scopeKey) ?? emptySalesFilters,
  );

  const setAdvancedFilters = useCallback(
    (updater: (prev: SalesAdvancedFilters) => SalesAdvancedFilters) => {
      setAdvancedFiltersState((prev) => {
        const next = updater(prev);
        persistedFilters.set(scopeKey, next);
        return next;
      });
    },
    [scopeKey],
  );

  const clearAdvancedFilters = useCallback(() => {
    persistedFilters.set(scopeKey, emptySalesFilters);
    setAdvancedFiltersState(emptySalesFilters);
    setCategoryFilter("all");
    setSearch("");
  }, [scopeKey]);

  const activeFilterCount = useMemo(() => countActiveSalesFilters(advancedFilters), [advancedFilters]);
  const { methods: paymentMethods } = usePaymentMethods();

  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const { categories: incomeCategories } = useIncomeCategories();
  const incomeCategoryByName = useMemo(() => {
    const m = new Map<string, CustomIncomeCategory>();
    incomeCategories.forEach((c) => m.set(c.name, c));
    return m;
  }, [incomeCategories]);

  const counts = useMemo(() => sales.reduce((acc, s) => {
    const cat = getSaleCategory(s);
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [sales]);

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      const q = search.toLowerCase();
      const matchesSearch = s.description.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.productName.toLowerCase().includes(q) ||
        (s.category || "").toLowerCase().includes(q) ||
        (s.id || "").toLowerCase().includes(q) ||
        (s.notes || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (incomeCategoryFilter !== "all") {
        if (incomeCategoryFilter === "__none__") {
          if (s.category) return false;
        } else if (s.category !== incomeCategoryFilter) {
          return false;
        }
      }
      if (!matchesSalesFilters(s, advancedFilters)) return false;
      if (categoryFilter === "all") return getSaleCategory(s) !== "paid";
      return getSaleCategory(s) === categoryFilter;
    }).sort((a, b) => getNextDueDateHelper(a).getTime() - getNextDueDateHelper(b).getTime());
  }, [sales, search, categoryFilter, incomeCategoryFilter, advancedFilters]);

  const clientOptions = useMemo(() => Array.from(
    new Set(sales.map((s) => (s.customerName || "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR")), [sales]);

  const sellerOptions = useMemo(() => Array.from(
    new Set(sales.flatMap((s) => getSaleSellers(s))),
  ).sort((a, b) => a.localeCompare(b, "pt-BR")), [sales]);

  const categoryOptions = useMemo(() => Array.from(
    new Set(sales.map((s) => (s.category || "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR")), [sales]);

  const total = useMemo(() => filtered.reduce((acc, s) => acc + s.total, 0), [filtered]);

  const folderEligibleNames = useMemo(() => {
    const byName: Record<string, number> = {};
    sales.forEach((s) => {
      const name = s.customerName?.trim();
      if (name) byName[name] = (byName[name] || 0) + 1;
    });
    return new Set(Object.entries(byName).filter(([, c]) => c > 1).map(([name]) => name));
  }, [sales]);

  const folderCount = folderEligibleNames.size;

  const { saleGroups, saleSingles } = useMemo(() => {
    const byName: Record<string, Sale[]> = {};
    const saleSingles: Sale[] = [];
    filtered.forEach((s) => {
      const name = s.customerName?.trim();
      if (name && folderEligibleNames.has(name)) {
        (byName[name] ??= []).push(s);
      } else {
        saleSingles.push(s);
      }
    });
    const saleGroups: SaleClientGroup[] = [];
    Object.entries(byName).forEach(([name, salesGroup]) => {
      const totalPaid = salesGroup.reduce((s, sale) => s + getSalePaidAmountHelper(sale), 0);
      const totalReceivable = salesGroup.reduce((s, sale) => s + Math.max(0, sale.total - getSalePaidAmountHelper(sale)), 0);
      const hasOverdue = salesGroup.some((s) => getSaleCategory(s) === "overdue");
      saleGroups.push({ name, sales: salesGroup, totalAmount: salesGroup.reduce((s, sale) => s + sale.total, 0), totalPaid, totalReceivable, hasOverdue });
    });
    const earliestDue = (g: SaleClientGroup) => Math.min(...g.sales.map((s) => getNextDueDateHelper(s).getTime()));
    saleGroups.sort((a, b) => earliestDue(a) - earliestDue(b));
    saleGroups.forEach((g) => g.sales.sort((a, b) => getNextDueDateHelper(a).getTime() - getNextDueDateHelper(b).getTime()));
    return { saleGroups, saleSingles };
  }, [filtered, folderEligibleNames]);

  const listSorted = useMemo(() => {
    return [...filtered].sort((a, b) => getNextDueDateHelper(a).getTime() - getNextDueDateHelper(b).getTime());
  }, [filtered]);

  const getSalePaidAmount = useCallback((s: Sale) => {
    const amounts = s.installmentAmounts;
    if (amounts && amounts.length > 0) {
      let paid = s.downPayment || 0;
      for (let i = 0; i < s.paidInstallments && i < amounts.length; i++) {
        paid += amounts[i] || 0;
      }
      return paid + (s.partialPaid || 0);
    }
    const vp = s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : s.total;
    return vp * s.paidInstallments + (s.downPayment || 0) + (s.partialPaid || 0);
  }, []);

  const getRemaining = useCallback((s: Sale) => Math.max(0, s.total - getSalePaidAmount(s)), [getSalePaidAmount]);

  const overdueSales = useMemo(() => sales.filter((s) => getSaleCategory(s) === "overdue"), [sales]);
  const onTrackSales = useMemo(() => sales.filter((s) => getSaleCategory(s) === "on_track"), [sales]);
  const dueTodaySales = useMemo(() => sales.filter((s) => getSaleCategory(s) === "due_today"), [sales]);
  const paidSales = useMemo(() => sales.filter((s) => getSaleCategory(s) === "paid"), [sales]);

  const getOverdueInstallmentsValue = useCallback((s: Sale): number => {
    const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
    if (!isRecorrente) return getRemaining(s);
    const baseDate = new Date(s.date + "T00:00:00");
    const today = new Date();
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let overdueValue = 0;
    for (let i = s.paidInstallments; i < s.installments; i++) {
      const customDate = s.installmentDates && s.installmentDates[i];
      const dueDate = customDate ? new Date(customDate + "T00:00:00") : addByFrequency(baseDate, s.frequency || "Mensal", i);
      const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      if (todayNorm.getTime() > dueNorm.getTime()) {
        if (s.installmentAmounts && s.installmentAmounts[i] != null) {
          overdueValue += s.installmentAmounts[i] || 0;
        } else {
          overdueValue += s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : 0;
        }
      }
    }
    return Math.max(0, overdueValue - (s.partialPaid || 0));
  }, [getRemaining]);

  const getFutureInstallmentsValue = useCallback((s: Sale): number => {
    const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
    if (!isRecorrente) return 0;
    const baseDate = new Date(s.date + "T00:00:00");
    const today = new Date();
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let futureValue = 0;
    for (let i = s.paidInstallments; i < s.installments; i++) {
      const customDate = s.installmentDates && s.installmentDates[i];
      const dueDate = customDate ? new Date(customDate + "T00:00:00") : addByFrequency(baseDate, s.frequency || "Mensal", i);
      const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      if (todayNorm.getTime() < dueNorm.getTime()) {
        if (s.installmentAmounts && s.installmentAmounts[i] != null) {
          futureValue += s.installmentAmounts[i] || 0;
        } else {
          futureValue += s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : 0;
        }
      }
    }
    return futureValue;
  }, []);

  const getDueTodayInstallmentValue = useCallback((s: Sale): number => {
    const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
    if (!isRecorrente) return getRemaining(s);
    const baseDate = new Date(s.date + "T00:00:00");
    const today = new Date();
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let todayValue = 0;
    for (let i = s.paidInstallments; i < s.installments; i++) {
      const customDate = s.installmentDates && s.installmentDates[i];
      const dueDate = customDate ? new Date(customDate + "T00:00:00") : addByFrequency(baseDate, s.frequency || "Mensal", i);
      const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      if (todayNorm.getTime() === dueNorm.getTime()) {
        if (s.installmentAmounts && s.installmentAmounts[i] != null) {
          todayValue += s.installmentAmounts[i] || 0;
        } else {
          todayValue += s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : 0;
        }
      }
    }
    return todayValue;
  }, [getRemaining]);

  const totalOverdue = useMemo(() => overdueSales.reduce((acc, s) => acc + getOverdueInstallmentsValue(s), 0), [overdueSales, getOverdueInstallmentsValue]);
  const totalOnTrack = useMemo(() => sales.filter((s) => getSaleCategory(s) !== "paid").reduce((acc, s) => acc + getFutureInstallmentsValue(s), 0)
    + onTrackSales.filter((s) => s.paymentMode !== "recorrente" || s.installments <= 1).reduce((acc, s) => acc + getRemaining(s), 0), [sales, onTrackSales, getFutureInstallmentsValue, getRemaining]);
  const totalDueToday = useMemo(() => dueTodaySales.reduce((acc, s) => acc + getDueTodayInstallmentValue(s), 0), [dueTodaySales, getDueTodayInstallmentValue]);
  const totalPaid = useMemo(() => sales.reduce((acc, s) => acc + getSalePaidAmount(s), 0), [sales, getSalePaidAmount]);
  const paidContractsCount = paidSales.length;
  const totalAReceber = useMemo(() => sales.filter((s) => getSaleCategory(s) !== "paid").reduce((acc, s) => acc + getRemaining(s), 0), [sales, getRemaining]);

  return {
    // state
    editingSale, setEditingSale,
    search, setSearch,
    categoryFilter, setCategoryFilter,
    incomeCategoryFilter, setIncomeCategoryFilter,
    view, setView,
    breakdownCard, setBreakdownCard,
    filtersOpen, setFiltersOpen,
    advancedFilters, setAdvancedFilters, clearAdvancedFilters,
    activeFilterCount,
    paymentMethods,
    clientOptions,
    sellerOptions,
    categoryOptions,
    // derived
    formatCurrency,
    incomeCategoryByName,
    counts,
    filtered,
    total,
    folderCount,
    saleGroups,
    saleSingles,
    listSorted,
    overdueSales,
    onTrackSales,
    dueTodaySales,
    paidSales,
    paidContractsCount,
    totalOverdue,
    totalOnTrack,
    totalDueToday,
    totalPaid,
    totalAReceber,
    // helpers
    getSalePaidAmount,
    getRemaining,
    getOverdueInstallmentsValue,
    getFutureInstallmentsValue,
    getDueTodayInstallmentValue,
  };
}
