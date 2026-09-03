import { useState, useMemo, useCallback } from "react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Payment, InstallmentSchedule, Sale } from "@/types/loan";
import { calculateInstallment, calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, CalendarDays, User, DollarSign, CheckCircle, Percent, HandCoins, ChevronDown, ChevronUp, Calendar as CalendarIcon, ShoppingBag, Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDueStatusBadge } from "@/features/financial/lib/dueStatus";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { toast } from "sonner";
import { getOpenInstallmentAmount } from "@/features/loans/lib/loanInstallmentAmount";

interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  sales?: Sale[];
  onPayment?: (loanId: string, paymentDate?: string, paymentMethodId?: string | null) => void;
  onPartialPayment?: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null) => void;
  onFullPayment?: (loanId: string, paymentDate?: string, customAmount?: number, paymentMethodId?: string | null) => void;
  onInterestPayment?: (loanId: string, paymentDate?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null) => void;
  onUpdate?: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  readOnly?: boolean;
}

const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface DueItem {
  loanId: string;
  borrowerName: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  paid: boolean;
  date: string;
  loan: Loan;
}

interface SaleDueItem {
  kind: "sale" | "vehicle";
  saleId: string;
  customerName: string;
  description: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  date: string;
}

export function BillingCalendar({ loans, payments, installmentSchedules, sales = [], onPayment, onPartialPayment, onFullPayment, onInterestPayment, onUpdate, readOnly = false }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"mes" | "semana" | "agenda" | "lista" | "geral">("mes");
  const [showFullDay, setShowFullDay] = useState(false);
  const [breakdownCard, setBreakdownCard] = useState<null | "hoje" | "atrasados" | "amanha" | "mes">(null);
  const [originFilter, setOriginFilter] = useState<"todos" | "emprestimos" | "vendas" | "veiculos">("todos");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [showPartial, setShowPartial] = useState<string | null>(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<{ loanId: string; type: "installment" | "interest" | "partial" | "full" | "payoff"; amount?: number; borrowerName: string } | null>(null);
  const [payoffAmount, setPayoffAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const { activeMethods } = usePaymentMethods();
  const [selectedMethodId, setSelectedMethodId] = useState<string>("");
  useMemo(() => {
    if (paymentDialog && !selectedMethodId && activeMethods.length > 0) {
      setSelectedMethodId(activeMethods[0].id);
    }
    return null;
  }, [paymentDialog, activeMethods, selectedMethodId]);

  // Build a map of date -> due items
  const dueMap = useMemo(() => {
    const map: Record<string, DueItem[]> = {};
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    loans.forEach((loan) => {
      if (loan.status === "paid") return;
      if (loan.installments <= 0) return;
      if (loan.paidInstallments >= loan.installments) return;
      const defaultInstallmentAmount = loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, loan.installments);

      const nextInstallment = loan.paidInstallments + 1;
      const dueBase = new Date(loan.dueDate + "T00:00:00");

      const loanSchedules = installmentSchedules.filter(s => s.loanId === loan.id);

      // Saldo remanescente após pagamentos parciais (base para cálculo de juros/multa)
      const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
      const totalPaid = payments.filter(p => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
      const baseRemaining = loan.remainingAmount != null && loan.remainingAmount > 0
        ? loan.remainingAmount
        : Math.max(0, totalWithInterest - totalPaid);

      for (let i = nextInstallment; i <= loan.installments; i++) {
        const schedule = loanSchedules.find(s => s.installmentNumber === i);
        let dateStr: string;
        if (schedule) {
          dateStr = schedule.dueDate;
        } else {
          const offsetFromNext = i - nextInstallment;
          const freq = loan.interestType || "Mensal";
          const d = new Date(dueBase.getFullYear(), dueBase.getMonth(), dueBase.getDate());
          if (freq === "Diário") d.setDate(d.getDate() + offsetFromNext);
          else if (freq === "Semanal") d.setDate(d.getDate() + offsetFromNext * 7);
          else if (freq === "Quinzenal") d.setDate(d.getDate() + offsetFromNext * 15);
          else d.setMonth(d.getMonth() + offsetFromNext);
          dateStr = formatLocalDate(d);
        }
        let amount = getOpenInstallmentAmount(loan, loanSchedules, i) || (schedule ? schedule.amount : defaultInstallmentAmount);

        // Acréscimos (juros de atraso + multa) somente na próxima parcela vencida
        if (i === nextInstallment) {
          const dueDateObj = new Date(dateStr + "T00:00:00");
          const daysOverdue = Math.max(0, Math.floor((todayNorm.getTime() - dueDateObj.getTime()) / 86400000));
          if (daysOverdue > 0) {
            let lateInterestTotal = 0;
            if (loan.lateInterestValue != null && loan.lateInterestValue > 0) {
              lateInterestTotal = loan.lateInterestType === "fixed"
                ? loan.lateInterestValue * daysOverdue
                : baseRemaining * (loan.lateInterestValue / 100) * daysOverdue;
            }
            const penaltyTotal = (loan.penaltyValue != null && loan.penaltyValue > 0) ? loan.penaltyValue : 0;
            amount = amount + lateInterestTotal + penaltyTotal;
          }
        }

        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push({
          loanId: loan.id,
          borrowerName: loan.borrowerName,
          installmentNumber: i,
          totalInstallments: loan.installments,
          amount,
          paid: false,
          date: dateStr,
          loan,
        });
      }
    });

    return map;
  }, [loans, installmentSchedules, payments, today]);


  // Map of date -> sale/vehicle pending installments
  const salesDueMap = useMemo(() => {
    const map: Record<string, SaleDueItem[]> = {};
    const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const addByFrequency = (d: Date, freq: string, n: number) => {
      if (["Diário", "Diária", "Diario", "Diaria", "daily"].includes(freq)) return addDays(d, n);
      if (freq === "Semanal") return addDays(d, n * 7);
      if (freq === "Quinzenal") return addDays(d, n * 15);
      const x = new Date(d); x.setMonth(x.getMonth() + n); return x;
    };

    sales.forEach((sale) => {
      const isRecorrente = sale.paymentMode === "recorrente";
      const totalInst = isRecorrente ? Math.max(1, sale.installments || 1) : 1;
      if (sale.paidInstallments >= totalInst) return;
      const baseDate = new Date(sale.date + "T00:00:00");
      const kind: "sale" | "vehicle" = sale.businessType === "aluguel_veiculo" ? "vehicle" : "sale";

      for (let i = sale.paidInstallments; i < totalInst; i++) {
        const customDate = sale.installmentDates && sale.installmentDates[i];
        const due = customDate
          ? new Date(customDate + "T00:00:00")
          : (isRecorrente ? addByFrequency(baseDate, sale.frequency || "Mensal", i) : baseDate);
        const dateStr = formatLocalDate(due);

        let amount = 0;
        if (sale.installmentAmounts && sale.installmentAmounts[i] != null) {
          amount = Number(sale.installmentAmounts[i]) || 0;
        } else if (sale.installmentValue && sale.installmentValue > 0) {
          amount = sale.installmentValue;
        } else {
          const base = Math.max(0, (sale.total || 0) - (sale.downPayment || 0));
          amount = isRecorrente ? base / totalInst : base;
        }

        // Pagamento parcial abate somente a próxima parcela em aberto
        if (i === sale.paidInstallments && sale.partialPaid && sale.partialPaid > 0) {
          amount = Math.max(0, amount - sale.partialPaid);
        }

        if (amount <= 0) continue;

        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push({
          kind,
          saleId: sale.id,
          customerName: sale.customerName || "—",
          description: sale.description || sale.productName || "Venda",
          installmentNumber: i + 1,
          totalInstallments: totalInst,
          amount,
          date: dateStr,
        });
      }

    });

    return map;
  }, [sales]);

  // Filtro por origem: aplicado sobre as fontes brutas para que TODAS as leituras
  // (cards, calendário, semana/agenda/lista, detalhes do dia e breakdown) fiquem
  // consistentes com a origem selecionada.
  const filteredDueMap = useMemo(() => {
    if (originFilter === "todos" || originFilter === "emprestimos") return dueMap;
    return {} as typeof dueMap;
  }, [dueMap, originFilter]);

  const filteredSalesDueMap = useMemo(() => {
    if (originFilter === "emprestimos") return {} as typeof salesDueMap;
    if (originFilter === "todos") return salesDueMap;
    const wanted: "sale" | "vehicle" = originFilter === "veiculos" ? "vehicle" : "sale";
    const out: typeof salesDueMap = {};
    Object.entries(salesDueMap).forEach(([d, arr]) => {
      const kept = arr.filter((i) => i.kind === wanted);
      if (kept.length) out[d] = kept;
    });
    return out;
  }, [salesDueMap, originFilter]);


  // Calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const todayStr = formatLocalDate(today);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const tomorrowStr = formatLocalDate(tomorrow);

  // Payments received per date (for green status dot)
  const receivedByDate = useMemo(() => {
    const m: Record<string, { total: number; count: number }> = {};
    payments.forEach((p) => {
      if (!p.date) return;
      const d = String(p.date).slice(0, 10);
      if (!m[d]) m[d] = { total: 0, count: 0 };
      m[d].total += Number(p.amount) || 0;
      m[d].count += 1;
    });
    return m;
  }, [payments]);

  // Combined pending items across loans + sales for a given date
  const pendingForDate = useCallback(
    (dateStr: string) => {
      const loanItems = filteredDueMap[dateStr] || [];
      const saleItems = filteredSalesDueMap[dateStr] || [];
      const total = loanItems.reduce((s, i) => s + i.amount, 0) + saleItems.reduce((s, i) => s + i.amount, 0);
      return { total, count: loanItems.length + saleItems.length };
    },
    [filteredDueMap, filteredSalesDueMap],
  );

  // Summary cards
  const summary = useMemo(() => {
    const hoje = pendingForDate(todayStr);
    const amanha = pendingForDate(tomorrowStr);
    let overdueTotal = 0, overdueCount = 0;
    let monthTotal = 0, monthCount = 0;
    const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const scan = (map: Record<string, { amount: number }[]> | Record<string, DueItem[]> | Record<string, SaleDueItem[]>) => {
      Object.entries(map as any).forEach(([d, arr]: any) => {
        // Atrasados seguem o filtro de mês: apenas itens vencidos no mês selecionado
        if (d < todayStr && d.startsWith(monthPrefix)) {
          overdueTotal += arr.reduce((s: number, i: any) => s + i.amount, 0);
          overdueCount += arr.length;
        }
        if (d.startsWith(monthPrefix)) {
          monthTotal += arr.reduce((s: number, i: any) => s + i.amount, 0);
          monthCount += arr.length;
        }
      });
    };
    scan(filteredDueMap);
    scan(filteredSalesDueMap);
    return { hoje, amanha, overdue: { total: overdueTotal, count: overdueCount }, month: { total: monthTotal, count: monthCount } };
  }, [filteredDueMap, filteredSalesDueMap, todayStr, tomorrowStr, year, month, pendingForDate]);


  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(todayStr);
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(selectedDate === dateStr ? null : dateStr);
    setExpandedItem(null);
    setShowPartial(null);
  };

  const selectedItems = selectedDate ? (filteredDueMap[selectedDate] || []) : [];
  const selectedSaleItems = selectedDate ? (filteredSalesDueMap[selectedDate] || []) : [];
  const overdueSelected = selectedItems.filter((i) => i.date < todayStr);
  const upcomingSelected = selectedItems.filter((i) => i.date >= todayStr);

  const toggleExpand = (itemKey: string) => {
    setExpandedItem(expandedItem === itemKey ? null : itemKey);
    setShowPartial(null);
    setPartialAmount("");
  };

  const openPaymentDialog = (loanId: string, borrowerName: string, type: "installment" | "interest" | "partial" | "full" | "payoff", amount?: number) => {
    setPaymentDate(new Date());
    setPayoffAmount("");
    setPaymentDialog({ loanId, type, amount, borrowerName });
  };

  const confirmPayment = async () => {
    if (!paymentDialog) return;
    if (activeMethods.length > 0 && !selectedMethodId) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    const dateStr = formatLocalDate(paymentDate);
    const loan = loans.find(l => l.id === paymentDialog.loanId);
    if (!loan) return;
    const mid = selectedMethodId || null;

    const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
    const totalPaid = payments.filter(p => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
    const remaining = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);

    if (paymentDialog.type === "full") {
      if (onFullPayment) {
        await onFullPayment(paymentDialog.loanId, dateStr, undefined, mid);
      } else {
        await onPartialPayment?.(paymentDialog.loanId, remaining, dateStr, mid);
        await onUpdate?.(paymentDialog.loanId, { paidInstallments: loan.installments, status: "paid" });
      }
    } else if (paymentDialog.type === "payoff") {
      const customRaw = parseFloat(payoffAmount.replace(",", "."));
      const custom = isFinite(customRaw) && customRaw > 0 ? customRaw : 0;
      if (custom <= 0) return;
      if (onFullPayment) {
        await onFullPayment(paymentDialog.loanId, dateStr, custom, mid);
      } else {
        await onPartialPayment?.(paymentDialog.loanId, custom, dateStr, mid);
        await onUpdate?.(paymentDialog.loanId, { paidInstallments: loan.installments, status: "paid" });
      }
      setPayoffAmount("");
    } else if (paymentDialog.type === "installment") {
      await onPayment?.(paymentDialog.loanId, dateStr, mid);
    } else if (paymentDialog.type === "interest") {
      await onInterestPayment?.(paymentDialog.loanId, dateStr, undefined, undefined, mid);
    } else if (paymentDialog.type === "partial" && paymentDialog.amount) {
      await onPartialPayment?.(paymentDialog.loanId, paymentDialog.amount, dateStr, mid);
    }
    setPaymentDialog(null);
    setExpandedItem(null);
  };

  const handlePartialSubmit = (loanId: string, borrowerName: string) => {
    const val = parseFloat(partialAmount);
    if (val > 0) {
      openPaymentDialog(loanId, borrowerName, "partial", val);
      setPartialAmount("");
      setShowPartial(null);
    }
  };

  const renderItemWithActions = (item: DueItem, isOverdue: boolean) => {
    const itemKey = `${item.loanId}-${item.installmentNumber}`;
    const isExpanded = expandedItem === itemKey;
    const loan = item.loan;
    const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
    const totalPaid = payments.filter(p => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
    const baseRemaining = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);

    // Calculate late fees (same as LoanCardView)
    const dueDate = new Date(loan.dueDate + "T00:00:00");
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daysOverdue = Math.max(0, Math.floor((todayNorm.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
    let lateInterestTotal = 0;
    if (loan.lateInterestValue != null && loan.lateInterestValue > 0 && daysOverdue > 0 && loan.status !== "paid") {
      if (loan.lateInterestType === "fixed") {
        lateInterestTotal = loan.lateInterestValue * daysOverdue;
      } else {
        lateInterestTotal = baseRemaining * (loan.lateInterestValue / 100) * daysOverdue;
      }
    }
    const penaltyTotal = (loan.penaltyValue != null && loan.penaltyValue > 0 && loan.status !== "paid") ? loan.penaltyValue : 0;
    const lateFees = lateInterestTotal + penaltyTotal;
    const remaining = baseRemaining + lateFees;

    const installment = item.amount;
    const interestOnly = loan.customInterestValue != null && loan.customInterestValue > 0
      ? loan.customInterestValue
      : loan.amount * (loan.interestRate / 100);

    const colorClass = isOverdue ? "destructive" : "warning";
    const bgClass = isOverdue ? "bg-destructive/5 border-destructive/20" : "bg-warning/5 border-warning/20";
    const avatarBg = isOverdue ? "bg-destructive/10" : "bg-warning/10";
    const avatarText = isOverdue ? "text-destructive" : "text-warning";
    const amountColor = isOverdue ? "text-destructive" : "text-warning";

    return (
      <div key={itemKey} className="overflow-hidden rounded-lg border">
        <button type="button"
          onClick={() => toggleExpand(itemKey)}
          className={`flex items-center justify-between p-3 w-full text-left ${bgClass} transition-colors hover:opacity-90`}
        >
          <div className="flex items-center gap-3">
            <div className={`h-8 w-8 rounded-full ${avatarBg} flex items-center justify-center`}>
              <User className={`h-4 w-4 ${avatarText}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-medium text-foreground truncate">{item.borrowerName}</p>
                {loan.tags && loan.tags.length > 0 && (
                  <div className="flex flex-wrap gap-0.5">
                    {loan.tags.filter(Boolean).map((tag) => (
                      <Badge key={tag} className="bg-primary text-primary-foreground text-[8px] px-1 py-0 max-w-[120px] truncate">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Parcela {item.installmentNumber}/{item.totalInstallments}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const badge = getDueStatusBadge(item.date, item.paid, { overdue: "Atrasado" });
              return (
                <div className="text-right">
                  <p className={`text-sm font-bold ${amountColor}`}>{formatCurrency(installment)}</p>
                  <Badge variant={badge.variant} className={`text-[10px] ${badge.className}`}>
                    {badge.label}
                  </Badge>
                </div>
              );
            })()}
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>

        {isExpanded && (
          <div className="p-3 space-y-3 bg-card border-t">
            {/* Loan info */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">Valor empréstimo</p>
                <p className="font-semibold text-foreground">{formatCurrency(loan.amount)}</p>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">Juros</p>
                <p className="font-semibold text-foreground">{loan.interestRate}% ({loan.interestType})</p>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">Parcelas pagas</p>
                <p className="font-semibold text-foreground">{loan.paidInstallments}/{loan.installments}</p>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">Restante</p>
                <p className="font-semibold text-foreground">{formatCurrency(remaining)}</p>
              </div>
            </div>

            {/* Payment buttons */}
            {!readOnly && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Formas de pagamento</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "installment")}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <CheckCircle className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-foreground">Parcela</p>
                      <p className="text-[10px] text-primary font-semibold">{formatCurrency(installment)}</p>
                    </div>
                  </button>

                  {loan.installments < 2 && (
                    <button type="button"
                      onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "interest")}
                      className="flex items-center gap-2 p-2.5 rounded-lg border border-purple/20 bg-purple/5 hover:bg-purple/10 transition-colors"
                    >
                      <div className="h-7 w-7 rounded-full bg-purple/15 flex items-center justify-center shrink-0">
                        <Percent className="h-3.5 w-3.5 text-purple" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-medium text-foreground">Juros</p>
                        <p className="text-[10px] text-purple font-semibold">{formatCurrency(interestOnly)}</p>
                      </div>
                    </button>
                  )}

                  <button type="button"
                    onClick={() => {
                      setShowPartial(showPartial === itemKey ? null : itemKey);
                      setPartialAmount("");
                    }}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-warning/20 bg-warning/5 hover:bg-warning/10 transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
                      <HandCoins className="h-3.5 w-3.5 text-warning" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-foreground">Parcial</p>
                      <p className="text-[10px] text-warning font-semibold">Definir valor</p>
                    </div>
                  </button>

                  <button type="button"
                    onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "full")}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-success/20 bg-success/5 hover:bg-success/10 transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                      <DollarSign className="h-3.5 w-3.5 text-success" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-foreground">Total</p>
                      <p className="text-[10px] text-success font-semibold">{formatCurrency(remaining)}</p>
                    </div>
                  </button>

                  <button type="button"
                    onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "payoff")}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors col-span-2"
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <DollarSign className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-foreground">Quitar Contrato</p>
                      <p className="text-[10px] text-primary font-semibold">Definir valor de quitação</p>
                    </div>
                  </button>
                </div>

                {showPartial === itemKey && (
                  <div className="flex gap-2 mt-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Valor parcial (R$)"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      className="h-8 text-sm flex-1"
                      autoFocus
                    />
                    <Button size="sm" className="h-8" onClick={() => handlePartialSubmit(item.loanId, item.borrowerName)}>
                      Pagar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Sort selected items by priority: overdue > today > future, then desc value
  const sortedSelectedItems = useMemo(() => {
    const priority = (d: string) => {
      if (d < todayStr) return 0;
      if (d === todayStr) return 1;
      return 2;
    };
    return [...selectedItems].sort((a, b) => {
      const pa = priority(a.date);
      const pb = priority(b.date);
      if (pa !== pb) return pa - pb;
      return b.amount - a.amount;
    });
  }, [selectedItems, todayStr]);

  // ------------------------------------------------------------------
  // Breakdown por card: usa exatamente as mesmas fontes (dueMap + salesDueMap)
  // que alimentam os totais dos cards, garantindo paridade total.
  // ------------------------------------------------------------------
  type BreakdownRow = {
    key: string;
    clientName: string;
    dueDate: string;
    pendingAmount: number;
    originalTotal: number;
    received: number;
    remaining: number;
    status: string;
    origin: "Empréstimo" | "Venda" | "Aluguel de veículo";
    loanId?: string;
    saleId?: string;
    installmentInfo: string;
    tags?: string[];
  };

  const breakdownLabels: Record<NonNullable<typeof breakdownCard>, string> = {
    hoje: "Receber hoje",
    atrasados: "Atrasados",
    amanha: "Receber amanhã",
    mes: `Este mês (${monthNames[month]}/${year})`,
  };

  const breakdownRows = useMemo<BreakdownRow[]>(() => {
    if (!breakdownCard) return [];
    const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const matches = (d: string) => {
      if (breakdownCard === "hoje") return d === todayStr;
      // Atrasados seguem o filtro de mês selecionado
      if (breakdownCard === "atrasados") return d < todayStr && d.startsWith(monthPrefix);
      if (breakdownCard === "amanha") return d === tomorrowStr;
      return d.startsWith(monthPrefix);
    };
    const rows: BreakdownRow[] = [];
    Object.entries(filteredDueMap).forEach(([d, arr]) => {
      if (!matches(d)) return;
      arr.forEach((it) => {
        const loan = it.loan;
        const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
        const paid = payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
        const remaining = loan.remainingAmount != null && loan.remainingAmount > 0
          ? loan.remainingAmount
          : Math.max(0, totalWithInterest - paid);
        rows.push({
          key: `loan-${loan.id}-${it.installmentNumber}-${d}`,
          clientName: it.borrowerName,
          dueDate: d,
          pendingAmount: it.amount,
          originalTotal: loan.amount,
          received: paid,
          remaining,
          status: loan.status || "active",
          origin: "Empréstimo",
          loanId: loan.id,
          installmentInfo: `Parcela ${it.installmentNumber}/${it.totalInstallments}`,
          tags: Array.isArray(loan.tags) ? loan.tags.filter(Boolean) : [],
        });
      });
    });
    Object.entries(filteredSalesDueMap).forEach(([d, arr]) => {
      if (!matches(d)) return;
      arr.forEach((it) => {
        const sale = sales.find((s) => s.id === it.saleId);
        const originalTotal = sale?.total || 0;
        let received = sale?.downPayment || 0;
        if (sale) {
          if (sale.installmentAmounts && sale.installmentAmounts.length > 0) {
            for (let k = 0; k < sale.paidInstallments && k < sale.installmentAmounts.length; k++) {
              received += Number(sale.installmentAmounts[k]) || 0;
            }
          } else {
            const vp = sale.installments > 0 ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments : sale.total;
            received += vp * sale.paidInstallments;
          }
          received += sale.partialPaid || 0;
        }
        const remaining = Math.max(0, originalTotal - received);
        rows.push({
          key: `sale-${it.saleId}-${it.installmentNumber}-${d}`,
          clientName: it.customerName,
          dueDate: d,
          pendingAmount: it.amount,
          originalTotal,
          received,
          remaining,
          status: (sale as any)?.status || "pending",
          origin: it.kind === "vehicle" ? "Aluguel de veículo" : "Venda",
          saleId: it.saleId,
          installmentInfo: `Parcela ${it.installmentNumber}/${it.totalInstallments}`,
        });
      });
    });
    rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.clientName.localeCompare(b.clientName));
    return rows;
  }, [breakdownCard, filteredDueMap, filteredSalesDueMap, todayStr, tomorrowStr, year, month, payments, sales]);

  const breakdownTotal = breakdownRows.reduce((s, r) => s + r.pendingAmount, 0);

  const openBreakdownDetail = (row: BreakdownRow) => {
    // Navega para o dia do vencimento e fecha o modal, revelando o painel de detalhes existente.
    const [y, m] = row.dueDate.split("-").map(Number);
    setYear(y);
    setMonth(m - 1);
    setSelectedDate(row.dueDate);
    setViewMode("mes");
    setBreakdownCard(null);
  };



  return (
    <div className="space-y-4">

      {/* Origin filter */}
      <div className="grid grid-cols-4 gap-1.5 md:gap-2">
        {([
          { v: "todos", label: "Todos" },
          { v: "emprestimos", label: "Empréstimos" },
          { v: "vendas", label: "Vendas" },
          { v: "veiculos", label: "Veículos" },
        ] as const).map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => setOriginFilter(opt.v)}
            className={cn(
              "px-2 py-1.5 rounded-md text-[11px] md:text-xs font-medium border transition-colors whitespace-nowrap truncate",
              originFilter === opt.v
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-muted/30 text-muted-foreground border-border/60 hover:text-foreground hover:bg-background/60",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {([
          { key: "hoje", label: "Receber hoje", tone: "text-warning", bar: "bg-warning", data: summary.hoje },
          { key: "amanha", label: "Receber amanhã", tone: "text-primary", bar: "bg-primary", data: summary.amanha },
          { key: "atrasados", label: "Atrasados", tone: "text-destructive", bar: "bg-destructive", data: summary.overdue },
          { key: "mes", label: "Este mês", tone: "text-foreground", bar: "bg-muted-foreground", data: summary.month },
        ] as const).map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setBreakdownCard(c.key as any)}
            className="text-left focus:outline-none focus:ring-2 focus:ring-primary rounded-lg"
            aria-label={`Ver contratos: ${c.label}`}
          >
            <Card no3d className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-3">
                <div className={`h-1 w-8 rounded-full ${c.bar} mb-2`} />
                <p className="text-[11px] text-muted-foreground truncate">{c.label}</p>
                <p className={`text-sm md:text-base font-bold ${c.tone} truncate`}>{formatCurrency(c.data.total)}</p>
                <p className="text-[10px] text-muted-foreground">{c.data.count} {c.data.count === 1 ? "contrato" : "contratos"}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* View selector + Month filter */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-1 gap-1 w-full md:w-auto overflow-x-auto order-2 md:order-1">
          {([
            { v: "mes", label: "Mês" },
            { v: "semana", label: "Semana" },
            { v: "agenda", label: "Agenda" },
            { v: "lista", label: "Lista" },
            { v: "geral", label: "Geral" },
          ] as const).map((opt) => (
            <button type="button"
              key={opt.v}
              onClick={() => setViewMode(opt.v)}
              className={cn(
                "flex-1 md:flex-none px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                viewMode === opt.v
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between md:justify-end gap-2 md:gap-3 order-1 md:order-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg"
            onClick={prevMonth}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={goToToday}
            title="Voltar para o mês atual"
            className="text-sm md:text-base font-semibold text-foreground hover:text-primary transition-colors capitalize min-w-[140px] text-center"
          >
            {monthNames[month]} {year}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg"
            onClick={nextMonth}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={cn(
        "grid gap-4",
        viewMode === "mes" && "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]",
      )}>
      {viewMode === "mes" && (
      <Card no3d className="md:sticky md:top-4 md:self-start">
        <CardContent className="p-3 md:p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {dayNames.map((d) => (
              <div key={d} className="text-center text-[10px] md:text-xs font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const pending = pendingForDate(dateStr);
              const received = receivedByDate[dateStr];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const hasPending = pending.count > 0;
              const hasReceived = !!received;
              const isOverdue = dateStr < todayStr && hasPending;
              const isUpcoming = dateStr >= todayStr && hasPending;
              // Exibir somente valores pendentes de recebimento no calendário.
              // Contratos quitados continuam sinalizados pelo status (bolinha verde), mas não somam.
              const dayTotal = pending.total;

              return (
                <button type="button"
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "relative flex flex-col items-stretch rounded-md md:rounded-lg p-1 md:p-1.5 min-h-[52px] md:min-h-[64px] text-left transition-colors border border-transparent",
                    isSelected && "bg-primary text-primary-foreground ring-2 ring-primary",
                    !isSelected && isToday && "bg-background ring-2 ring-primary/60 ring-inset",
                    !isSelected && !isToday && isOverdue && "bg-destructive/10",
                    !isSelected && !isToday && !isOverdue && !hasPending && !hasReceived && "hover:bg-muted",
                    !isSelected && !isToday && isUpcoming && "hover:bg-warning/10",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-xs md:text-sm font-semibold",
                      isSelected ? "text-primary-foreground" : isToday ? "text-primary" : "text-foreground",
                    )}>
                      {day}
                    </span>
                    <div className="flex gap-0.5">
                      {hasReceived && <span className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-primary-foreground" : "bg-success")} />}
                      {isUpcoming && <span className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-primary-foreground" : "bg-warning")} />}
                      {isOverdue && <span className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-primary-foreground" : "bg-destructive")} />}
                      {!hasPending && !hasReceived && <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />}
                    </div>
                  </div>
                  {dayTotal > 0 && (
                    <span className={cn(
                      "mt-auto text-[9px] md:text-[10px] font-semibold truncate leading-tight",
                      isSelected
                        ? "text-primary-foreground"
                        : isOverdue
                        ? "text-destructive"
                        : hasReceived && !hasPending
                        ? "text-success"
                        : "text-warning",
                    )}>
                      {formatCurrency(dayTotal)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend + Ver todos */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] md:text-xs text-muted-foreground border-t border-border/40 pt-2">
            <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> Recebido</div>
            <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" /> A vencer</div>
            <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" /> Atrasado</div>
            <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> Sem contratos</div>
          </div>
          {selectedDate && (sortedSelectedItems.length > 0 || selectedSaleItems.length > 0) && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3"
              onClick={() => setShowFullDay(true)}
            >
              Ver todos os contratos do dia
            </Button>
          )}
        </CardContent>
      </Card>
      )}


      {/* Selected day details — split view on desktop/tablet, stacked on mobile */}
      {viewMode === "mes" && (
      <Card no3d className="md:max-h-[calc(100vh-8rem)] md:flex md:flex-col animate-fade-in">

        <CardContent className="p-4 md:flex-1 md:overflow-y-auto">
          {!selectedDate ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Selecione uma data no calendário para ver os contratos a receber.</p>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-foreground mb-3">
                {new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </h3>

              {sortedSelectedItems.length === 0 && selectedSaleItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma parcela a receber nesta data.</p>
              ) : (
                <div className="space-y-4 animate-fade-in">
                  {sortedSelectedItems.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Empréstimos
                      </p>
                      {sortedSelectedItems.map((item) => renderItemWithActions(item, item.date < todayStr))}
                      <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
                        <span className="text-xs font-medium text-muted-foreground">Subtotal Empréstimos</span>
                        <span className="text-xs font-bold text-foreground">
                          {formatCurrency(sortedSelectedItems.reduce((s, i) => s + i.amount, 0))}
                        </span>
                      </div>
                    </div>
                  )}

                  {(["sale", "vehicle"] as const).map((kind) => {
                    const list = selectedSaleItems.filter((s) => s.kind === kind);
                    if (list.length === 0) return null;
                    const label = kind === "vehicle" ? "Veículos" : "Vendas";
                    const Icon = kind === "vehicle" ? Car : ShoppingBag;
                    const subtotal = list.reduce((s, i) => s + i.amount, 0);
                    return (
                      <div key={kind} className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {label}
                        </p>
                        {list
                          .slice()
                          .sort((a, b) => b.amount - a.amount)
                          .map((s) => {
                            const isOverdue = s.date < todayStr;
                            return (
                              <div
                                key={`${s.kind}-${s.saleId}-${s.installmentNumber}`}
                                className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${
                                  isOverdue ? "bg-destructive/5 border-destructive/20" : "bg-muted/30 border-border/40"
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                                    isOverdue ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                                  }`}>
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{s.customerName}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {s.description} · Parcela {s.installmentNumber}/{s.totalInstallments}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className={`text-sm font-bold ${isOverdue ? "text-destructive" : "text-foreground"}`}>
                                    {formatCurrency(s.amount)}
                                  </p>
                                  <Badge variant="outline" className="text-[10px]">
                                    {label}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                        <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
                          <span className="text-xs font-medium text-muted-foreground">Subtotal {label}</span>
                          <span className="text-xs font-bold text-foreground">{formatCurrency(subtotal)}</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Total geral */}
                  <div className="flex items-center justify-between pt-2 border-t mt-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <DollarSign className="h-4 w-4" /> Total geral
                    </div>
                    <p className="text-sm font-bold text-foreground">
                      {formatCurrency(
                        sortedSelectedItems.reduce((s, i) => s + i.amount, 0) +
                        selectedSaleItems.reduce((s, i) => s + i.amount, 0)
                      )}
                    </p>
                  </div>

                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* Semana / Agenda / Lista */}
      {viewMode !== "mes" && (
        <Card no3d>
          <CardContent className="p-3 md:p-4 space-y-2">
            {(() => {
              const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
              const startOfWeek = new Date(today);
              startOfWeek.setDate(today.getDate() - today.getDay());
              const endOfWeek = new Date(startOfWeek);
              endOfWeek.setDate(startOfWeek.getDate() + 6);
              const startStr = formatLocalDate(startOfWeek);
              const endStr = formatLocalDate(endOfWeek);

              const collect = () => {
                const out: { date: string; kind: "loan" | "sale" | "vehicle"; name: string; subtitle: string; amount: number; status: "overdue" | "due_today" | "upcoming"; tags?: string[] }[] = [];
                Object.entries(filteredDueMap).forEach(([d, arr]) => arr.forEach((i) => out.push({
                  date: d, kind: "loan", name: i.borrowerName,
                  subtitle: `Empréstimo · Parcela ${i.installmentNumber}/${i.totalInstallments}`,
                  amount: i.amount,
                  status: d < todayStr ? "overdue" : d === todayStr ? "due_today" : "upcoming",
                  tags: Array.isArray(i.loan?.tags) ? i.loan.tags.filter(Boolean) : [],
                })));
                Object.entries(filteredSalesDueMap).forEach(([d, arr]) => arr.forEach((s) => out.push({
                  date: d, kind: s.kind, name: s.customerName,
                  subtitle: `${s.kind === "vehicle" ? "Veículo" : "Venda"} · ${s.description} · Parcela ${s.installmentNumber}/${s.totalInstallments}`,
                  amount: s.amount,
                  status: d < todayStr ? "overdue" : d === todayStr ? "due_today" : "upcoming",
                })));
                return out;
              };

              let items = collect();
              if (viewMode === "semana") items = items.filter((i) => i.date >= startStr && i.date <= endStr);
              else if (viewMode === "agenda") items = items.filter((i) => i.date >= todayStr).slice(0, 100);
              else if (viewMode === "lista") items = items.filter((i) => i.date.startsWith(monthPrefix));
              // "geral": sem filtro de data — todos os pendentes cronologicamente
              items.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);

              if (items.length === 0) {
                return <p className="text-sm text-muted-foreground text-center py-8">Nenhum contrato para este período.</p>;
              }

              const grouped: Record<string, typeof items> = {};
              items.forEach((i) => {
                if (!grouped[i.date]) grouped[i.date] = [];
                grouped[i.date].push(i);
              });

              const originLabel = (k: "loan" | "sale" | "vehicle") => k === "loan" ? "Empréstimo" : k === "vehicle" ? "Veículo" : "Venda";
              const statusLabel = (s: "overdue" | "due_today" | "upcoming") => s === "overdue" ? "Atrasado" : s === "due_today" ? "Vence hoje" : "A vencer";

              return Object.entries(grouped).map(([d, arr]) => (
                <div key={d} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 pt-2 first:pt-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-foreground capitalize">
                        {new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: viewMode === "geral" ? "numeric" : undefined })}
                      </p>
                      <span className="text-[10px] text-muted-foreground">({arr.length})</span>
                    </div>
                    <p className={cn("text-xs font-bold", d < todayStr ? "text-destructive" : "text-success")}>
                      {formatCurrency(arr.reduce((s, i) => s + i.amount, 0))}
                    </p>
                  </div>
                  {arr.map((i, idx) => {
                    const tone = i.status === "overdue" ? "border-destructive/30 bg-destructive/5" : i.status === "due_today" ? "border-warning/30 bg-warning/5" : "border-border/40 bg-muted/20";
                    const Icon = i.kind === "loan" ? User : i.kind === "vehicle" ? Car : ShoppingBag;
                    const statusTone = i.status === "overdue" ? "text-destructive border-destructive/40" : i.status === "due_today" ? "text-warning border-warning/40" : "text-muted-foreground border-border/60";
                    return (
                      <div key={`${d}-${idx}`} className={cn("flex items-center justify-between gap-2 rounded-lg border p-2.5", tone)}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-background/60 flex items-center justify-center shrink-0">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <p className="text-xs font-medium text-foreground truncate">{i.name}</p>
                              {i.kind === "loan" && i.tags && i.tags.length > 0 && (
                                <span className="text-[10px] font-medium text-blue-500 truncate">{i.tags.join(", ")}</span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              Vencimento: {i.date.split("-").reverse().join("/")} · {originLabel(i.kind)}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">{i.subtitle}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <p className={cn("text-xs font-bold", i.status === "overdue" ? "text-destructive" : "text-foreground")}>{formatCurrency(i.amount)}</p>
                          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", statusTone)}>{statusLabel(i.status)}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </CardContent>
        </Card>
      )}
      </div>

      {/* Full day contracts dialog */}
      <Dialog open={showFullDay} onOpenChange={setShowFullDay}>
        <DialogContent className="sm:max-w-[560px] max-h-[85svh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {selectedDate && new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 -mx-2 px-2">
            {sortedSelectedItems.map((item) => (
              <div key={`fd-l-${item.loanId}-${item.installmentNumber}`} className={cn("flex items-center justify-between gap-2 rounded-lg border p-3", item.date < todayStr ? "bg-destructive/5 border-destructive/20" : "bg-muted/30 border-border/40")}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><User className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.borrowerName}</p>
                    <p className="text-xs text-muted-foreground truncate">Empréstimo · Parcela {item.installmentNumber}/{item.totalInstallments}</p>
                  </div>
                </div>
                <p className="text-sm font-bold shrink-0 text-success">{formatCurrency(item.amount)}</p>
              </div>
            ))}
            {selectedSaleItems.map((s) => {
              const Icon = s.kind === "vehicle" ? Car : ShoppingBag;
              return (
                <div key={`fd-s-${s.kind}-${s.saleId}-${s.installmentNumber}`} className={cn("flex items-center justify-between gap-2 rounded-lg border p-3", s.date < todayStr ? "bg-destructive/5 border-destructive/20" : "bg-muted/30 border-border/40")}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.customerName}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.kind === "vehicle" ? "Veículo" : "Venda"} · {s.description} · Parcela {s.installmentNumber}/{s.totalInstallments}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold shrink-0 text-success">{formatCurrency(s.amount)}</p>
                </div>
              );
            })}
            {sortedSelectedItems.length === 0 && selectedSaleItems.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum contrato nesta data.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>


      {/* Payment confirmation dialog */}
      <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
        <DialogContent className="sm:max-w-[420px] md:max-w-[720px] sm:max-h-[92svh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 shrink-0">
            <DialogTitle>
              {paymentDialog?.type === "full" ? "Pagamento Total" :
               paymentDialog?.type === "payoff" ? "Quitar Contrato" :
               paymentDialog?.type === "installment" ? "Receber Parcela" :
               paymentDialog?.type === "interest" ? "Pagar Juros" : "Pagamento Parcial"}
              {paymentDialog && <span className="block text-sm font-normal text-muted-foreground mt-1">{paymentDialog.borrowerName}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-4">

            {paymentDialog?.type === "full" && paymentDialog.loanId && (() => {
              const loan = loans.find(l => l.id === paymentDialog.loanId);
              if (!loan) return null;
              const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
              const totalPaid = payments.filter(p => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
              const remaining = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);
              return (
                <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                  <p className="text-xs text-muted-foreground">Total restante a receber</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
                </div>
              );
            })()}
            {paymentDialog?.type === "payoff" && paymentDialog.loanId && (() => {
              const loan = loans.find(l => l.id === paymentDialog.loanId);
              if (!loan) return null;
              const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
              const totalPaid = payments.filter(p => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
              const remaining = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);
              return (
                <div className="w-full space-y-2">
                  <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                    <p className="text-xs text-muted-foreground">Total restante a receber</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="payoff-amount-cal" className="text-xs">Valor para quitar (R$)</Label>
                    <Input
                      id="payoff-amount-cal"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={payoffAmount}
                      onChange={(e) => setPayoffAmount(e.target.value)}
                      placeholder={`Ex: ${remaining.toFixed(2)}`}
                      autoFocus
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Informe o valor de quitação. O contrato será marcado como pago.
                    </p>
                  </div>
                </div>
              );
            })()}
            {paymentDialog?.type === "partial" && paymentDialog.amount && (
              <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                <p className="text-xs text-muted-foreground">Valor parcial</p>
                <p className="text-2xl font-bold text-warning">{formatCurrency(paymentDialog.amount)}</p>
              </div>
            )}
              </div>
              <div className="space-y-4">
                {activeMethods.length > 0 && (


              <div className="w-full space-y-1">
                <Label className="text-sm text-muted-foreground">Forma de pagamento</Label>
                <Select value={selectedMethodId} onValueChange={setSelectedMethodId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {activeMethods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Label className="text-sm text-muted-foreground">Selecione a data do pagamento</Label>
            <CalendarUI
              mode="single"
              selected={paymentDate}
              onSelect={(d) => d && setPaymentDate(d)}
              className="rounded-md border pointer-events-auto"
            />
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-border/40 md:border-0 md:bg-transparent">
            <Button variant="outline" onClick={() => setPaymentDialog(null)}>Cancelar</Button>
            <Button onClick={confirmPayment} disabled={paymentDialog?.type === "payoff" && !(parseFloat(payoffAmount.replace(",", ".")) > 0)}>Confirmar</Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* Breakdown do card: lista todos os registros que compõem o total exibido */}
      <Dialog open={breakdownCard !== null} onOpenChange={(o) => !o && setBreakdownCard(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 md:px-6 pt-4 md:pt-6 pb-3 border-b border-border/40">
            <DialogTitle className="text-base md:text-lg">
              {breakdownCard ? breakdownLabels[breakdownCard] : ""}
            </DialogTitle>
            <div className="flex items-center justify-between pt-1 text-xs md:text-sm">
              <span className="text-muted-foreground">
                {breakdownRows.length} {breakdownRows.length === 1 ? "contrato" : "contratos"}
              </span>
              <span className="font-bold text-foreground">
                Total: {formatCurrency(breakdownTotal)}
              </span>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-3 md:px-6 py-3 space-y-2">
            {breakdownRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum contrato pendente para este período.
              </p>
            ) : (
              breakdownRows.map((r) => {
                const originIcon = r.origin === "Empréstimo" ? <User className="h-5 w-5" /> : r.origin === "Aluguel de veículo" ? <Car className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => openBreakdownDetail(r)}
                    className="w-full text-left rounded-2xl bg-muted/40 hover:bg-muted/60 transition-colors p-3 flex items-center gap-3"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      {originIcon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{r.clientName}</p>
                        {r.origin === "Empréstimo" && r.tags && r.tags.length > 0 && (
                          <span className="text-xs font-medium text-blue-500 truncate">
                            {r.tags.join(", ")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        Vencimento: {r.dueDate.split("-").reverse().join("/")}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 truncate">
                        {r.origin} · {r.installmentInfo}
                      </p>
                    </div>
                    <p className={cn("text-sm font-bold shrink-0", r.dueDate < todayStr ? "text-destructive" : "text-success")}>
                      {formatCurrency(r.pendingAmount)}
                    </p>
                  </button>
                );
              })
            )}
          </div>
          <DialogFooter className="px-4 md:px-6 py-3 border-t border-border/40">
            <Button variant="outline" onClick={() => setBreakdownCard(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
