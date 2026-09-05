import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Normaliza texto para busca: minúsculas e sem acentos. */
const normalizeText = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Cache de observações normalizadas (evita recomputar em listas grandes). */
const normalizedNotesCache = new WeakMap<object, string>();
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Payment, InstallmentSchedule } from "@/types/loan";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { getInstallmentAmount, getOverdueAmount } from "@/features/loans/lib/loanInstallmentAmount";
import {
  getLoanLateFees,
  getBaseRemainingAmount,
  getLoanReceivable,
} from "@/features/loans/lib/loanLateFees";
import { todayInAppTz } from "@/lib/timezone";
import { rawFormatCurrency } from "@/features/loans/components/list/formatting";
import {
  getFirstPendingDate,
  getDaysOverdue,
  getLoanCategory,
  getTotalPaid,
} from "@/features/loans/components/list/calculations";
import type { Category } from "@/features/loans/components/list/types";

export type SortableCol =
  | "borrowerName"
  | "category"
  | "amount"
  | "remaining"
  | "installments"
  | "dueDate"
  | "tags";

interface ControllerInput {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  initialCategory?: Category;
  initialView?: "cards" | "rows" | "folders";
}

const MULTI_SELECT_WINDOW_MS = 2000;

export type ViewType = "cards" | "folders";

function getDefaultView(initialView?: "cards" | "rows" | "folders"): ViewType {
  if (initialView === "folders") return "folders";
  return "cards";
}

export function useLoanListController({
  loans,
  payments,
  installmentSchedules,
  initialCategory,
  initialView,
}: ControllerInput) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback(
    (v: number) => mask(rawFormatCurrency(v)),
    [mask],
  );

  // View / filters state
  const [view, setView] = useState<ViewType>(getDefaultView(initialView));
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([
    initialCategory ?? "all",
  ]);
  const lastClickRef = useRef<{ id: Category; time: number } | null>(null);

  const handleCategoryClick = useCallback((id: Category) => {
    const now = Date.now();
    const last = lastClickRef.current;
    setSelectedCategories((prev) => {
      if (last && last.id === id && now - last.time < MULTI_SELECT_WINDOW_MS) {
        return [id];
      }
      if (last && last.id !== id && now - last.time < MULTI_SELECT_WINDOW_MS) {
        const filtered = prev.filter((c) => c !== "all" && c !== id);
        if (prev.includes(id)) {
          return filtered.length === 0 ? ["all"] : filtered;
        }
        return [...filtered, id];
      }
      return [id];
    });
    lastClickRef.current = { id, time: now };
  }, []);

  const category: Category =
    selectedCategories.length === 1 ? selectedCategories[0] : "all";
  const isMultiSelect = selectedCategories.length > 1;

  const [showFilters, setShowFilters] = useState(false);
  const [dueDateQuick, setDueDateQuick] = useState<
    "yesterday" | "today" | "tomorrow" | null
  >(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [notesFilter, setNotesFilter] = useState<"all" | "with" | "without">("all");
  // Busca por conteúdo da observação (parcial, sem acento, case-insensitive)
  const [notesSearch, setNotesSearch] = useState("");
  const [notesSearchDebounced, setNotesSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setNotesSearchDebounced(notesSearch.trim()), 200);
    return () => clearTimeout(t);
  }, [notesSearch]);
  const [sortBy, setSortBy] = useState<
    "dueDate" | "startDate" | "amount" | "name"
  >("dueDate");

  const [columnSort, setColumnSort] = useState<{
    col: SortableCol;
    dir: "desc" | "asc";
  } | null>(null);
  const cycleColumnSort = useCallback((col: SortableCol) => {
    setColumnSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "desc" };
      if (prev.dir === "desc") return { col, dir: "asc" };
      return null;
    });
  }, []);
  const sortIndicator = useCallback(
    (col: SortableCol) =>
      columnSort?.col === col ? (columnSort.dir === "desc" ? " ▼" : " ▲") : "",
    [columnSort],
  );

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    loans.forEach((l) => l.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [loans]);

  const baseFilteredLoans = useMemo(() => {
    let filtered = loans;
    if (search.trim()) {
      filtered = filtered.filter((l) =>
        l.borrowerName.toLowerCase().includes(search.toLowerCase()),
      );
    }

    if (dateFrom) filtered = filtered.filter((l) => l.startDate >= dateFrom);
    if (dateTo) filtered = filtered.filter((l) => l.startDate <= dateTo);

    if (dueDateFrom || dueDateTo) {
      filtered = filtered.filter((l) => {
        const next = getFirstPendingDate(l, installmentSchedules);
        const ymd = !isNaN(next.getTime())
          ? `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`
          : l.dueDate || "";
        if (!ymd) return false;
        if (dueDateFrom && ymd < dueDateFrom) return false;
        if (dueDateTo && ymd > dueDateTo) return false;
        return true;
      });
    }
    const minAmt = parseFloat(amountMin);
    const maxAmt = parseFloat(amountMax);
    if (!isNaN(minAmt) && minAmt > 0) filtered = filtered.filter((l) => l.amount >= minAmt);
    if (!isNaN(maxAmt) && maxAmt > 0) filtered = filtered.filter((l) => l.amount <= maxAmt);

    if (tagFilter) filtered = filtered.filter((l) => l.tags?.includes(tagFilter));

    if (notesFilter === "with") {
      filtered = filtered.filter((l) => Boolean(l.notes?.trim()));
    } else if (notesFilter === "without") {
      filtered = filtered.filter((l) => !l.notes?.trim());
    }

    if (notesSearchDebounced) {
      const q = normalizeText(notesSearchDebounced);
      filtered = filtered.filter((l) => {
        const notes = l.notes;
        if (!notes) return false;
        let norm = normalizedNotesCache.get(l as object);
        if (norm === undefined) {
          norm = normalizeText(notes);
          normalizedNotesCache.set(l as object, norm);
        }
        return norm.includes(q);
      });
    }

    if (dueDateQuick && view === "cards") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(today);
      if (dueDateQuick === "yesterday") target.setDate(target.getDate() - 1);
      else if (dueDateQuick === "tomorrow") target.setDate(target.getDate() + 1);
      const targetStr = target.toISOString().split("T")[0];
      filtered = filtered.filter((l) => l.dueDate === targetStr);
    }

    return filtered;
  }, [
    loans,
    search,
    dateFrom,
    dateTo,
    dueDateFrom,
    dueDateTo,
    amountMin,
    amountMax,
    tagFilter,
    notesFilter,
    notesSearchDebounced,
    dueDateQuick,
    view,
    installmentSchedules,
  ]);

  const categorized = useMemo(() => {
    let filtered = baseFilteredLoans;

    if (isMultiSelect) {
      filtered = filtered.filter((l) => {
        const cat = getLoanCategory(l, payments, installmentSchedules);
        return selectedCategories.some((sel) => {
          if (sel === "all") return cat !== "paid";
          if (sel === "parcelado") return l.installments >= 2 && l.status !== "paid";
          if (sel === "venda") return !!l.isSale;
          if (sel === "on_track") return cat === "on_track" || cat === "paid_interest";
          return cat === sel;
        });
      });
    } else if (category === "all") {
      filtered = filtered.filter(
        (l) => getLoanCategory(l, payments, installmentSchedules) !== "paid",
      );
    } else if (category === "parcelado") {
      filtered = filtered.filter((l) => l.installments >= 2 && l.status !== "paid");
    } else if (category === "venda") {
      filtered = filtered.filter((l) => !!l.isSale);
    } else if (category === "on_track") {
      filtered = filtered.filter((l) => {
        const cat = getLoanCategory(l, payments, installmentSchedules);
        return cat === "on_track" || cat === "paid_interest";
      });
    } else {
      filtered = filtered.filter(
        (l) => getLoanCategory(l, payments, installmentSchedules) === category,
      );
    }

    const defaultSorted = [...filtered].sort((a, b) => {
      if (sortBy === "dueDate") {
        const aDate = getFirstPendingDate(a, installmentSchedules).getTime();
        const bDate = getFirstPendingDate(b, installmentSchedules).getTime();
        if (aDate !== bDate) return aDate - bDate;
        return (a.borrowerName || "").localeCompare(b.borrowerName || "", "pt-BR", { sensitivity: "base" });
      }
      if (sortBy === "startDate") return b.startDate.localeCompare(a.startDate);
      if (sortBy === "amount") {
        const valueOf = (l: Loan) => {
          if (l.installments > 1) {
            const nextSchedule = installmentSchedules.find(
              (s) => s.loanId === l.id && s.installmentNumber === l.paidInstallments + 1,
            );
            const allUnpaid = installmentSchedules.filter(
              (s) => s.loanId === l.id && s.installmentNumber > l.paidInstallments,
            );
            const allUnpaidSum = allUnpaid.reduce((sum, s) => sum + s.amount, 0);
            const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
            const totalPaid = payments
              .filter((p) => p.loanId === l.id)
              .reduce((s, p) => s + p.amount, 0);
            const remainingInstallments = Math.max(1, l.installments - l.paidInstallments);
            const fullInstallment = nextSchedule
              ? nextSchedule.amount
              : l.customInstallmentValue && l.customInstallmentValue > 0
                ? l.customInstallmentValue
                : total / l.installments;
            const actualRemaining =
              l.remainingAmount != null && l.remainingAmount > 0
                ? l.remainingAmount
                : Math.max(0, total - totalPaid);
            const expectedRemaining = nextSchedule
              ? allUnpaidSum
              : fullInstallment * remainingInstallments;
            const partialPaidOnCurrent = Math.max(0, expectedRemaining - actualRemaining);
            return Math.max(0, fullInstallment - partialPaidOnCurrent);
          }
          const base = l.remainingAmount && l.remainingAmount > 0 ? l.remainingAmount : l.amount;
          const fees = getLoanLateFees(l, payments, installmentSchedules);
          const renegPenalty = l.status !== "paid" ? Number(l.renegotiationPenaltyTotal || 0) : 0;
          return base + fees.lateFees + renegPenalty;
        };
        return valueOf(b) - valueOf(a);
      }
      return a.borrowerName.localeCompare(b.borrowerName);
    });

    if (!columnSort) return defaultSorted;
    const { col, dir } = columnSort;
    const mul = dir === "desc" ? -1 : 1;
    const getVal = (l: Loan): { v: number | string; isNull: boolean } => {
      switch (col) {
        case "borrowerName":
          return { v: (l.borrowerName || "").toLowerCase(), isNull: !l.borrowerName };
        case "category":
          return { v: getLoanCategory(l, payments, installmentSchedules), isNull: false };
        case "amount": {
          if (l.status === "paid") {
            return { v: getTotalPaid(l, payments), isNull: false };
          }
          if (l.installments > 1) {
            const loanSchedules = installmentSchedules
              .filter((s) => s.loanId === l.id)
              .sort((a, b) => a.installmentNumber - b.installmentNumber);
            let target = loanSchedules.find(
              (s) => s.installmentNumber === l.paidInstallments + 1,
            );
            if (!target)
              target = loanSchedules.find((s) => s.installmentNumber > l.paidInstallments);
            if (!target && loanSchedules.length > 0)
              target = loanSchedules[loanSchedules.length - 1];
            if (target) return { v: Number(target.amount) || 0, isNull: false };
            if (l.customInstallmentValue && l.customInstallmentValue > 0)
              return { v: l.customInstallmentValue, isNull: false };
            const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
            return { v: total / l.installments, isNull: false };
          }
          const base = l.remainingAmount && l.remainingAmount > 0 ? l.remainingAmount : l.amount;
          return { v: Number(base) || 0, isNull: l.amount == null };
        }
        case "remaining": {
          if (l.status === "paid") return { v: getTotalPaid(l, payments), isNull: false };
          const fees = getLoanLateFees(l, payments, installmentSchedules);
          const renegPenalty = Number(l.renegotiationPenaltyTotal || 0);
          if (l.installments > 1) {
            const loanSchedules = installmentSchedules
              .filter((s) => s.loanId === l.id)
              .sort((a, b) => a.installmentNumber - b.installmentNumber);
            const nextSchedule =
              loanSchedules.find((s) => s.installmentNumber === l.paidInstallments + 1) ||
              loanSchedules.find((s) => s.installmentNumber > l.paidInstallments);
            const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
            const totalPaid = payments
              .filter((p) => p.loanId === l.id)
              .reduce((s, p) => s + p.amount, 0);
            const remainingInstallments = Math.max(1, l.installments - l.paidInstallments);
            const fullInstallment = nextSchedule
              ? nextSchedule.amount
              : l.customInstallmentValue && l.customInstallmentValue > 0
                ? l.customInstallmentValue
                : total / l.installments;
            const actualRemaining =
              l.remainingAmount != null && l.remainingAmount > 0
                ? l.remainingAmount
                : Math.max(0, total - totalPaid);
            const allUnpaidSum = loanSchedules
              .filter((s) => s.installmentNumber > l.paidInstallments)
              .reduce((sum, s) => sum + s.amount, 0);
            const expectedRemaining = nextSchedule
              ? allUnpaidSum
              : fullInstallment * remainingInstallments;
            const partialPaidOnCurrent = Math.max(0, expectedRemaining - actualRemaining);
            const currentInstallmentRemaining = Math.max(
              0,
              fullInstallment - partialPaidOnCurrent,
            );
            return { v: currentInstallmentRemaining + fees.lateFees + renegPenalty, isNull: false };
          }
          const base = getBaseRemainingAmount(l, payments, installmentSchedules);
          return { v: base + fees.lateFees + renegPenalty, isNull: false };
        }
        case "installments":
          return { v: Number(l.installments) || 0, isNull: false };
        case "dueDate": {
          const t = getFirstPendingDate(l, installmentSchedules).getTime();
          return { v: t, isNull: !isFinite(t) || isNaN(t) };
        }
        case "tags": {
          const t = (l.tags && l.tags[0]) || "";
          return { v: t.toLowerCase(), isNull: !t };
        }
      }
    };
    return [...defaultSorted].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va.isNull && vb.isNull) return 0;
      if (va.isNull) return 1;
      if (vb.isNull) return -1;
      if (typeof va.v === "number" && typeof vb.v === "number")
        return (va.v - vb.v) * mul;
      return String(va.v).localeCompare(String(vb.v)) * mul;
    });
  }, [
    baseFilteredLoans,
    payments,
    installmentSchedules,
    category,
    selectedCategories,
    isMultiSelect,
    sortBy,
    columnSort,
  ]);

  const folderCount = useMemo(() => {
    const byName: Record<string, number> = {};
    loans.forEach((l) => {
      byName[l.borrowerName] = (byName[l.borrowerName] || 0) + 1;
    });
    return Object.values(byName).filter((c) => c > 1).length;
  }, [loans]);

  const counts = useMemo(() => {
    const cats = baseFilteredLoans.map((l) => getLoanCategory(l, payments, installmentSchedules));
    return {
      all: cats.filter((c) => c !== "paid").length,
      parcelado: baseFilteredLoans.filter((l) => l.installments >= 2 && l.status !== "paid").length,
      overdue: cats.filter((c) => c === "overdue").length,
      paid_interest: cats.filter((c) => c === "paid_interest").length,
      paid: cats.filter((c) => c === "paid").length,
      due_today: cats.filter((c) => c === "due_today").length,
      on_track: cats.filter((c) => c === "on_track" || c === "paid_interest").length,
      venda: baseFilteredLoans.filter((l) => !!l.isSale && l.status !== "paid").length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilteredLoans, payments, folderCount]);

  const summaryData = useMemo(() => {
    const source = categorized;
    const activeSource = source.filter((l) => l.status !== "paid");
    const totalLentRaw = activeSource.reduce((s, l) => s + l.amount, 0);

    if (category === "paid") {
      const totalPaidSum = source
        .filter((l) => l.status === "paid")
        .reduce((s, l) => s + getTotalPaid(l, payments), 0);
      const totalInterestPaid = source.reduce(
        (s, l) =>
          s + (calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - l.amount),
        0,
      );
      return {
        totalLent: totalLentRaw,
        totalToReceive: totalPaidSum,
        totalInterest: totalInterestPaid,
        activeCount: source.filter((l) => l.status === "active").length,
        overdueCount: 0,
      };
    }

    const isDateFiltered = Boolean(dueDateFrom || dueDateTo || dueDateQuick);
    const shouldShowCashFlow = isDateFiltered || category === "overdue" || category === "due_today" || category === "on_track";
    const today = todayInAppTz();

    const totalToReceive = activeSource.reduce((s, l) => {
      const cat = getLoanCategory(l, payments, installmentSchedules);
      const isParcelado = (l.installments >= 2 || l.paymentType === "Parcelado") && (l.paidInstallments || 0) < (l.installments || 1);

      if (shouldShowCashFlow) {
        if (cat === "overdue") {
          return s + getOverdueAmount(l, installmentSchedules, today, payments);
        }
        if (cat === "due_today" || cat === "on_track" || cat === "paid_interest") {
          return s + (isParcelado ? getInstallmentAmount(l, installmentSchedules) : getLoanReceivable(l, payments, installmentSchedules));
        }
      }

      // Fallback: Visão global do contrato (soma todo o restante a receber)
      return s + getLoanReceivable(l, payments, installmentSchedules);
    }, 0);
    const totalLent = totalLentRaw;

    const totalInterest = source.reduce(
      (s, l) =>
        s + (calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - l.amount),
      0,
    );
    const activeCount = source.filter((l) => l.status === "active").length;
    const overdueCount = source.filter(
      (l) => getDaysOverdue(l) > 0 && l.status !== "paid",
    ).length;
    return { totalLent, totalToReceive, totalInterest, activeCount, overdueCount };
  }, [categorized, payments, dueDateQuick, installmentSchedules, category, dueDateFrom, dueDateTo]);

  const statusSummary = useMemo(() => {
    const today = todayInAppTz();
    const currentMonth = today.slice(0, 7);
    let overdue = 0;
    let dueToday = 0;
    let onTrack = 0;
    let totalReceivable = 0;
    let overdueCount = 0;
    let dueTodayCount = 0;
    let onTrackCount = 0;
    let totalReceivableCount = 0;
    for (const l of baseFilteredLoans) {
      if (l.status === "paid") continue;
      const cat = getLoanCategory(l, payments, installmentSchedules);
      const receivable = getLoanReceivable(l, payments, installmentSchedules);
      totalReceivable += receivable;
      totalReceivableCount += 1;
      if (cat === "overdue") {
        overdue += getOverdueAmount(l, installmentSchedules, today, payments);
        overdueCount += 1;
        continue;
      }
      if (cat === "due_today") {
        const isParcelado = (l.installments >= 2 || l.paymentType === "Parcelado") && (l.paidInstallments || 0) < (l.installments || 1);
        dueToday += isParcelado
          ? getInstallmentAmount(l, installmentSchedules)
          : receivable;
        dueTodayCount += 1;
      } else if (cat === "on_track" || cat === "paid_interest") {
        const nextDue = getFirstPendingDate(l, installmentSchedules);
        const ymd = !isNaN(nextDue.getTime())
          ? `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, "0")}`
          : l.dueDate?.slice(0, 7) || "";
        if (ymd === currentMonth) {
          const isParcelado = (l.installments >= 2 || l.paymentType === "Parcelado") && (l.paidInstallments || 0) < (l.installments || 1);
          onTrack += isParcelado ? getInstallmentAmount(l, installmentSchedules) : receivable;
          onTrackCount += 1;
        }
      }
    }
    return {
      overdue,
      dueToday,
      onTrack,
      total: totalReceivable,
      overdueCount,
      dueTodayCount,
      onTrackCount,
      totalCount: totalReceivableCount,
    };
  }, [baseFilteredLoans, payments, installmentSchedules]);

  const applyCardFilter = useCallback(
    (cardId: "overdue" | "due_today" | "on_track" | "all") => {
      setSelectedCategories([cardId]);
      setDueDateQuick(null);
      if (cardId === "on_track") {
        const today = todayInAppTz();
        const [y, m] = today.split("-");
        const firstOfMonth = `${y}-${m}-01`;
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        const lastOfMonth = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
        setDueDateFrom(firstOfMonth);
        setDueDateTo(lastOfMonth);
      } else {
        setDueDateFrom("");
        setDueDateTo("");
      }
    },
    [],
  );

  // Grouping (for "folders" view)
  const grouping = useMemo(() => {
    const byName: Record<string, Loan[]> = {};
    categorized.forEach((l) => {
      (byName[l.borrowerName] ??= []).push(l);
    });
    const grouped: Array<{
      name: string;
      loans: Loan[];
      totalAmount: number;
      totalPaid: number;
      totalReceivable: number;
      hasOverdue: boolean;
    }> = [];
    const singles: Loan[] = [];
    Object.entries(byName).forEach(([name, loansArr]) => {
      if (loansArr.length > 1) {
        const totalInterestReceivable = loansArr.reduce((s, l) => {
          if (l.status === "paid") return s;

          // URGENTE: O campo "Juros a Receber" da pasta deve ser a soma direta do campo "Juros" 
          // exibido em cada contrato, sem recalcular pagamentos ou multas de atraso.
          const interestValue = l.customInterestValue != null && l.customInterestValue > 0
            ? l.customInterestValue
            : l.amount * (l.interestRate / 100);

          return s + interestValue;
        }, 0);

        const totalReceivable = loansArr.reduce((s, l) => {
          if (l.status === "paid") return s;
          return s + getLoanReceivable(l, payments, installmentSchedules);
        }, 0);
        const hasOverdue = loansArr.some(
          (l) =>
            l.status !== "paid" &&
            getLoanCategory(l, payments, installmentSchedules) === "overdue",
        );
        grouped.push({
          name,
          loans: loansArr,
          totalAmount: loansArr.reduce((s, l) => s + l.amount, 0),
          totalPaid: Math.round(totalInterestReceivable * 100) / 100,
          totalReceivable: Math.round(totalReceivable * 100) / 100,
          hasOverdue,
        });
      } else {
        singles.push(loansArr[0]);
      }
    });
    grouped.sort((a, b) => {
      const getEarliestDue = (g: { loans: Loan[] }) => {
        const activeLoans = g.loans.filter((l) => l.status !== "paid");
        if (activeLoans.length === 0) return "9999-12-31";
        return activeLoans.reduce((earliest, l) => {
          const date = l.dueDate;
          return date < earliest ? date : earliest;
        }, "9999-12-31");
      };
      return getEarliestDue(a).localeCompare(getEarliestDue(b));
    });
    return { grouped, singles };
  }, [categorized, payments, installmentSchedules]);

    const currentFilterState = {
      selectedCategories,
      dueDateQuick,
      dateFrom,
      dateTo,
      dueDateFrom,
      dueDateTo,
      amountMin,
      amountMax,
      tagFilter,
      notesFilter,
      notesSearch,
      sortBy,
    };

    const applyFilterState = useCallback((state: any) => {
      setSelectedCategories(state.selectedCategories);
      setDueDateQuick(state.dueDateQuick);
      setDateFrom(state.dateFrom);
      setDateTo(state.dateTo);
      setDueDateFrom(state.dueDateFrom);
      setDueDateTo(state.dueDateTo);
      setAmountMin(state.amountMin);
      setAmountMax(state.amountMax);
      setTagFilter(state.tagFilter);
      setNotesFilter(state.notesFilter);
      setNotesSearch(state.notesSearch);
      setSortBy(state.sortBy);
    }, []);

  return {
    // formatting
    formatCurrency,
    // view + search
    view,
    setView,
    search,
    setSearch,
    // categories
    selectedCategories,
    handleCategoryClick,
    category,
    // filters
    showFilters,
    setShowFilters,
    dueDateQuick,
    setDueDateQuick,
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
    notesFilter,
    setNotesFilter,
    notesSearch,
    setNotesSearch,
    sortBy,
    setSortBy,
    // sorting
    cycleColumnSort,
    sortIndicator,
    // derived
    allTags,
    baseFilteredLoans,
    categorized,
    counts,
    summaryData,
    statusSummary,
    grouped: grouping.grouped,
    singles: grouping.singles,
    // actions
    applyCardFilter,
    currentFilterState,
    applyFilterState,
  };
}
