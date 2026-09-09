import { useState, useMemo, useCallback } from "react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Payment, InstallmentSchedule, Sale, Client } from "@/types/loan";
import { calculateInstallment, calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  User,
  DollarSign,
  CheckCircle,
  Percent,
  HandCoins,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  Car,
  MessageCircle,
  Copy,
  Search,
  CheckCircle2,
  TrendingUp,
  RotateCcw,
  AlertTriangle,
  Clock,
  Tag,
  Wallet,
  Calendar as CalendarIcon,
} from "lucide-react";
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
  clients?: Client[];
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

export function BillingCalendar({
  loans,
  payments,
  installmentSchedules,
  sales = [],
  clients = [],
  onPayment,
  onPartialPayment,
  onFullPayment,
  onInterestPayment,
  onUpdate,
  readOnly = false,
}: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const today = new Date();
  const todayStr = formatLocalDate(today);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const tomorrowStr = formatLocalDate(tomorrow);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"mes" | "semana" | "agenda" | "lista" | "geral">("mes");
  const [showFullDay, setShowFullDay] = useState(false);
  const [breakdownCard, setBreakdownCard] = useState<null | "hoje" | "atrasados" | "amanha" | "mes">(null);
  const [originFilter, setOriginFilter] = useState<"todos" | "emprestimos" | "vendas" | "veiculos">("todos");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [showPartial, setShowPartial] = useState<string | null>(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<{
    loanId: string;
    type: "installment" | "interest" | "partial" | "full" | "payoff";
    amount?: number;
    borrowerName: string;
  } | null>(null);
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

  // Mapa de telefone de clientes para cobrança rápida via WhatsApp
  const clientPhoneMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach((c) => {
      if (c.id && c.phone) map[c.id] = c.phone;
      if (c.name && c.phone) map[c.name.trim().toLowerCase()] = c.phone;
    });
    return map;
  }, [clients]);

  // Build a map of date -> due items
  const dueMap = useMemo(() => {
    const map: Record<string, DueItem[]> = {};
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    loans.forEach((loan) => {
      if (loan.status === "paid") return;
      if (loan.installments <= 0) return;
      if (loan.paidInstallments >= loan.installments) return;
      const defaultInstallmentAmount =
        loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, loan.installments);

      const nextInstallment = loan.paidInstallments + 1;
      const dueBase = new Date(loan.dueDate + "T00:00:00");

      const loanSchedules = installmentSchedules.filter((s) => s.loanId === loan.id);

      const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
      const totalPaid = payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
      const baseRemaining =
        loan.remainingAmount != null && loan.remainingAmount > 0
          ? loan.remainingAmount
          : Math.max(0, totalWithInterest - totalPaid);

      for (let i = nextInstallment; i <= loan.installments; i++) {
        const schedule = loanSchedules.find((s) => s.installmentNumber === i);
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
        let amount =
          getOpenInstallmentAmount(loan, loanSchedules, i) || (schedule ? schedule.amount : defaultInstallmentAmount);

        // Acréscimos (juros de atraso + multa) somente na próxima parcela vencida
        if (i === nextInstallment) {
          const dueDateObj = new Date(dateStr + "T00:00:00");
          const daysOverdue = Math.max(0, Math.floor((todayNorm.getTime() - dueDateObj.getTime()) / 86400000));
          if (daysOverdue > 0) {
            let lateInterestTotal = 0;
            if (loan.lateInterestValue != null && loan.lateInterestValue > 0) {
              lateInterestTotal =
                loan.lateInterestType === "fixed"
                  ? loan.lateInterestValue * daysOverdue
                  : baseRemaining * (loan.lateInterestValue / 100) * daysOverdue;
            }
            const penaltyTotal = loan.penaltyValue != null && loan.penaltyValue > 0 ? loan.penaltyValue : 0;
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
    const addDays = (d: Date, n: number) => {
      const x = new Date(d);
      x.setDate(x.getDate() + n);
      return x;
    };
    const addByFrequency = (d: Date, freq: string, n: number) => {
      if (["Diário", "Diária", "Diario", "Diaria", "daily"].includes(freq)) return addDays(d, n);
      if (freq === "Semanal") return addDays(d, n * 7);
      if (freq === "Quinzenal") return addDays(d, n * 15);
      const x = new Date(d);
      x.setMonth(x.getMonth() + n);
      return x;
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
          : isRecorrente
          ? addByFrequency(baseDate, sale.frequency || "Mensal", i)
          : baseDate;
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

  // Filtro por origem
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

  // Pagamentos recebidos por data
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

  // Total combinado pendente para uma data
  const pendingForDate = useCallback(
    (dateStr: string) => {
      const loanItems = filteredDueMap[dateStr] || [];
      const saleItems = filteredSalesDueMap[dateStr] || [];
      const total = loanItems.reduce((s, i) => s + i.amount, 0) + saleItems.reduce((s, i) => s + i.amount, 0);
      return { total, count: loanItems.length + saleItems.length };
    },
    [filteredDueMap, filteredSalesDueMap],
  );

  // Resumo financeiro do mês
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthReceivedTotal = useMemo(() => {
    return payments
      .filter((p) => p.date && String(p.date).startsWith(monthPrefix))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }, [payments, monthPrefix]);

  const summary = useMemo(() => {
    const hoje = pendingForDate(todayStr);
    const amanha = pendingForDate(tomorrowStr);
    let overdueTotal = 0,
      overdueCount = 0;
    let monthTotal = 0,
      monthCount = 0;
    const scan = (map: Record<string, { amount: number }[]> | Record<string, DueItem[]> | Record<string, SaleDueItem[]>) => {
      Object.entries(map as any).forEach(([d, arr]: any) => {
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
    return {
      hoje,
      amanha,
      overdue: { total: overdueTotal, count: overdueCount },
      month: { total: monthTotal, count: monthCount },
    };
  }, [filteredDueMap, filteredSalesDueMap, todayStr, tomorrowStr, monthPrefix, pendingForDate]);

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(todayStr);
    setViewMode("mes");
  };

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(selectedDate === dateStr ? null : dateStr);
    setExpandedItem(null);
    setShowPartial(null);
  };

  // Itens da data selecionada
  const rawSelectedItems = selectedDate ? filteredDueMap[selectedDate] || [] : [];
  const rawSelectedSaleItems = selectedDate ? filteredSalesDueMap[selectedDate] || [] : [];

  // Filtro de pesquisa no painel lateral
  const selectedItems = useMemo(() => {
    if (!searchTerm.trim()) return rawSelectedItems;
    const term = searchTerm.toLowerCase();
    return rawSelectedItems.filter((i) => {
      const matchName = i.borrowerName.toLowerCase().includes(term);
      const matchTags = i.loan?.tags?.some((t) => t.toLowerCase().includes(term));
      return matchName || matchTags;
    });
  }, [rawSelectedItems, searchTerm]);

  const selectedSaleItems = useMemo(() => {
    if (!searchTerm.trim()) return rawSelectedSaleItems;
    const term = searchTerm.toLowerCase();
    return rawSelectedSaleItems.filter((s) => {
      return (
        s.customerName.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term)
      );
    });
  }, [rawSelectedSaleItems, searchTerm]);

  // Ordenação dos itens por prioridade: atrasado > hoje > futuro
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

  const toggleExpand = (itemKey: string) => {
    setExpandedItem(expandedItem === itemKey ? null : itemKey);
    setShowPartial(null);
    setPartialAmount("");
  };

  const openPaymentDialog = (
    loanId: string,
    borrowerName: string,
    type: "installment" | "interest" | "partial" | "full" | "payoff",
    amount?: number,
  ) => {
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
    const loan = loans.find((l) => l.id === paymentDialog.loanId);
    if (!loan) return;
    const mid = selectedMethodId || null;

    const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
    const totalPaid = payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
    const remaining =
      loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);

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

  // Disparo de Cobrança WhatsApp individual
  const handleSendWhatsAppBilling = (name: string, amount: number, installmentInfo: string, date: string, loan?: Loan) => {
    const clientPhone =
      (loan?.borrowerId && clientPhoneMap[loan.borrowerId]) ||
      clientPhoneMap[name.trim().toLowerCase()] ||
      "";

    const cleanPhone = clientPhone.replace(/\D/g, "");
    const [y, m, d] = date.split("-");
    const dateFormatted = `${d}/${m}/${y}`;
    const valorFormatted = rawFormatCurrency(amount);

    const message = `Olá, *${name}*! Tudo bem?\nPassando para lembrar do vencimento da sua ${installmentInfo} no valor de *${valorFormatted}* com vencimento em *${dateFormatted}*.\n\nCaso já tenha efetuado o pagamento, por favor desconsidere esta mensagem. Qualquer dúvida, estamos à disposição!`;

    if (cleanPhone && cleanPhone.length >= 10) {
      const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
      window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`, "_blank");
      toast.success(`Abrindo WhatsApp para ${name}...`);
    } else {
      navigator.clipboard.writeText(message);
      toast.success("Mensagem de cobrança copiada para a área de transferência! (Cliente sem telefone cadastrado)");
    }
  };

  // Compartilhar pauta completa do dia
  const handleCopyDaySchedule = () => {
    if (!selectedDate) return;
    const [y, m, d] = selectedDate.split("-");
    const dateFormatted = `${d}/${m}/${y}`;
    const totalDayPending =
      sortedSelectedItems.reduce((s, i) => s + i.amount, 0) +
      selectedSaleItems.reduce((s, i) => s + i.amount, 0);

    let text = `📋 *PAUTA DE COBRANÇA — ${dateFormatted}*\n`;
    text += `💰 *Total Previsto:* ${rawFormatCurrency(totalDayPending)} (${sortedSelectedItems.length + selectedSaleItems.length} contratos)\n`;
    text += `----------------------------------------\n`;

    let count = 1;
    sortedSelectedItems.forEach((i) => {
      text += `${count}. 👤 *${i.borrowerName}* — ${rawFormatCurrency(i.amount)} (Parc. ${i.installmentNumber}/${i.totalInstallments})\n`;
      count++;
    });

    selectedSaleItems.forEach((s) => {
      text += `${count}. 📦 *${s.customerName}* — ${rawFormatCurrency(s.amount)} (${s.description} Parc. ${s.installmentNumber}/${s.totalInstallments})\n`;
      count++;
    });

    text += `----------------------------------------\n`;
    text += `_Gerado via Emprestaii_`;

    navigator.clipboard.writeText(text);
    toast.success("Pauta de cobrança do dia copiada para a área de transferência!");
  };

  // Render do Card de Empréstimo no mesmo padrão da aba Empréstimos
  const renderLoanDecisionCard = (item: DueItem, isOverdue: boolean) => {
    const itemKey = `${item.loanId}-${item.installmentNumber}`;
    const isExpanded = expandedItem === itemKey;
    const loan = item.loan;
    const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
    const totalPaid = payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
    const baseRemaining =
      loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);

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
    const penaltyTotal =
      loan.penaltyValue != null && loan.penaltyValue > 0 && loan.status !== "paid" ? loan.penaltyValue : 0;
    const lateFees = lateInterestTotal + penaltyTotal;
    const remaining = baseRemaining + lateFees;

    const installment = item.amount;
    const interestOnly =
      loan.customInterestValue != null && loan.customInterestValue > 0
        ? loan.customInterestValue
        : loan.amount * (loan.interestRate / 100);

    const expectedProfit = remaining + totalPaid - loan.amount;
    const realizedProfit = Math.max(0, totalPaid - loan.amount);
    const realizedProfitPct = expectedProfit > 0 ? Math.round((realizedProfit / expectedProfit) * 100) : 0;

    const accentColor = isOverdue
      ? "hsl(var(--destructive))"
      : item.date === todayStr
      ? "hsl(var(--warning))"
      : "hsl(var(--primary))";

    const cardBorder = isOverdue
      ? "border-destructive/30"
      : item.date === todayStr
      ? "border-warning/30"
      : "border-border/60";

    const headerBg = isOverdue
      ? "from-destructive/10 to-transparent border-destructive/15"
      : item.date === todayStr
      ? "from-warning/10 to-transparent border-warning/15"
      : "from-primary/[0.06] to-transparent border-border/50";

    const initials = item.borrowerName
      .split(" ")
      .map((w) => w[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();

    return (
      <Card
        key={itemKey}
        no3d
        className={`relative overflow-hidden rounded-2xl transition-all duration-200 border ${cardBorder} bg-card hover:shadow-md`}
      >
        {/* Faixa lateral colorida de status */}
        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentColor }} />

        {/* Cabeçalho do Card */}
        <div className={`border-b px-4 py-3 bg-gradient-to-b ${headerBg} relative flex items-center justify-between gap-2`}>
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full shrink-0"
              style={{ background: accentColor, boxShadow: `0 0 0 3px ${accentColor}22` }}
            />
            <h3 className="font-semibold text-foreground text-sm leading-tight truncate">
              {item.borrowerName}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {loan.tags && loan.tags.length > 0 && (
              <div className="flex flex-wrap gap-0.5">
                {loan.tags.filter(Boolean).map((tag) => (
                  <Badge key={tag} className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0 max-w-[100px] truncate">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <CardContent className="p-4 space-y-3.5">
          {/* Avatar + Badges de Status */}
          <div className="flex items-center gap-3">
            <div
              className={`h-11 w-11 rounded-full flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0 ${
                isOverdue
                  ? "bg-destructive"
                  : item.date === todayStr
                  ? "bg-warning"
                  : "bg-primary"
              }`}
            >
              {initials}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-semibold uppercase",
                  isOverdue
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : item.date === todayStr
                    ? "bg-warning/10 text-warning border-warning/30"
                    : "bg-primary/10 text-primary border-primary/20",
                )}
              >
                {isOverdue ? "Atrasado" : item.date === todayStr ? "Vence hoje" : "A vencer"}
              </Badge>
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 uppercase">
                {loan.interestType || "Mensal"}
              </Badge>
              {daysOverdue > 0 && loan.status !== "paid" && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                  {daysOverdue}d atraso
                </Badge>
              )}
            </div>
          </div>

          {/* Valor Principal em Destaque no Centro */}
          <div className="text-center py-3 rounded-xl bg-gradient-to-b from-muted/30 to-transparent border border-border/30">
            <p
              className={cn(
                "text-[28px] md:text-[32px] leading-none font-bold tracking-tight tabular-nums",
                isOverdue ? "text-destructive" : "text-foreground",
              )}
            >
              {formatCurrency(installment)}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1.5 font-medium">
              Parcela do dia ({item.installmentNumber}ª de {item.totalInstallments})
            </p>
            {lateFees > 0 && (
              <div className="text-[11px] text-destructive mt-1.5 space-y-0.5">
                {lateInterestTotal > 0 && (
                  <p>+ Juros de atraso ({daysOverdue}d): {rawFormatCurrency(lateInterestTotal)}</p>
                )}
                {penaltyTotal > 0 && <p>+ Multa: {rawFormatCurrency(penaltyTotal)}</p>}
              </div>
            )}
          </div>

          {/* Grid de Informações Claras para Tomada de Decisão */}
          <div className="grid grid-cols-2 gap-2.5 border border-border/40 rounded-xl p-2.5 bg-muted/20 text-xs">
            <div>
              <p className="text-[10px] text-muted-foreground">Emprestado</p>
              <p className="font-bold text-foreground text-sm">{formatCurrency(loan.amount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Total do Contrato</p>
              <p className="font-bold text-foreground text-sm">
                {formatCurrency(Math.round((totalPaid + remaining) * 100) / 100)}
              </p>
            </div>
          </div>

          {/* Lucro Previsto vs Lucro Realizado */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                💰 Lucro Previsto
              </p>
              <p className="text-xs md:text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(expectedProfit)}
              </p>
            </div>
            <div className="bg-muted/30 border border-border/50 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                ✅ Já Realizado
              </p>
              <p className="text-xs md:text-sm font-bold text-foreground">
                {formatCurrency(realizedProfit)}{" "}
                <span className="text-[10px] text-muted-foreground font-normal">({realizedProfitPct}%)</span>
              </p>
            </div>
          </div>

          {/* Barra de Ações Decisórias Rápidas */}
          <div className="pt-1 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  handleSendWhatsAppBilling(
                    item.borrowerName,
                    installment,
                    `Parcela ${item.installmentNumber}/${item.totalInstallments}`,
                    item.date,
                    loan,
                  )
                }
                className="h-9 text-xs font-medium border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
              >
                <MessageCircle className="h-4 w-4" />
                <span>WhatsApp</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "installment")}
                className="h-9 text-xs font-medium gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Receber Parcela</span>
              </Button>
            </div>

            {/* Alternar opções avançadas de pagamento */}
            <button
              type="button"
              onClick={() => toggleExpand(itemKey)}
              className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground py-1 flex items-center justify-center gap-1 transition-colors"
            >
              <span>{isExpanded ? "Ocultar outras opções de quitação" : "Ver opções de juros, parcial e quitação total"}</span>
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {isExpanded && !readOnly && (
              <div className="p-3 space-y-2.5 rounded-xl border border-border/50 bg-muted/20 animate-fade-in text-xs">
                <p className="text-[11px] font-semibold text-muted-foreground">Outras formas de recebimento</p>
                <div className="grid grid-cols-2 gap-2">
                  {loan.installments < 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "interest")}
                      className="h-8 text-[11px] justify-start text-purple-600 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                    >
                      <Percent className="h-3 w-3 mr-1" />
                      Juros ({formatCurrency(interestOnly)})
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowPartial(showPartial === itemKey ? null : itemKey);
                      setPartialAmount("");
                    }}
                    className="h-8 text-[11px] justify-start text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                  >
                    <HandCoins className="h-3 w-3 mr-1" />
                    Valor Parcial
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "full")}
                    className="h-8 text-[11px] justify-start text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                  >
                    <DollarSign className="h-3 w-3 mr-1" />
                    Total ({formatCurrency(remaining)})
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "payoff")}
                    className="h-8 text-[11px] justify-start text-primary border-primary/30 hover:bg-primary/10"
                  >
                    <Wallet className="h-3 w-3 mr-1" />
                    Quitar Contrato
                  </Button>
                </div>

                {showPartial === itemKey && (
                  <div className="flex gap-2 pt-1">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Valor parcial (R$)"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      className="h-8 text-xs flex-1"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handlePartialSubmit(item.loanId, item.borrowerName)}
                    >
                      Confirmar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Render do Card de Venda / Veículo com padrão consistente
  const renderSaleDecisionCard = (s: SaleDueItem) => {
    const isOverdue = s.date < todayStr;
    const Icon = s.kind === "vehicle" ? Car : ShoppingBag;
    const label = s.kind === "vehicle" ? "Veículos" : "Vendas";

    return (
      <Card
        key={`${s.kind}-${s.saleId}-${s.installmentNumber}`}
        no3d
        className={`relative overflow-hidden rounded-2xl transition-all duration-200 border ${
          isOverdue ? "border-destructive/30" : "border-border/60"
        } bg-card hover:shadow-md`}
      >
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ background: isOverdue ? "hsl(var(--destructive))" : "hsl(var(--primary))" }}
        />

        <div className="border-b px-4 py-3 bg-gradient-to-b from-primary/[0.04] to-transparent flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <h3 className="font-semibold text-foreground text-sm leading-tight truncate">
              {s.customerName}
            </h3>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {label}
          </Badge>
        </div>

        <CardContent className="p-4 space-y-3">
          <div className="text-center py-2.5 rounded-xl bg-gradient-to-b from-muted/30 to-transparent border border-border/30">
            <p
              className={cn(
                "text-[26px] leading-none font-bold tracking-tight tabular-nums",
                isOverdue ? "text-destructive" : "text-foreground",
              )}
            >
              {formatCurrency(s.amount)}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1 font-medium">
              {s.description} · Parcela {s.installmentNumber} de {s.totalInstallments}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                handleSendWhatsAppBilling(
                  s.customerName,
                  s.amount,
                  `Parcela ${s.installmentNumber}/${s.totalInstallments}`,
                  s.date,
                )
              }
              className="w-full h-8 text-xs font-medium border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Cobrar WhatsApp</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ------------------------------------------------------------------
  // Breakdown por card
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
    const matches = (d: string) => {
      if (breakdownCard === "hoje") return d === todayStr;
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
        const remaining =
          loan.remainingAmount != null && loan.remainingAmount > 0
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
            const vp =
              sale.installments > 0
                ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments
                : sale.total;
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
  }, [breakdownCard, filteredDueMap, filteredSalesDueMap, todayStr, tomorrowStr, monthPrefix, payments, sales]);

  const breakdownTotal = breakdownRows.reduce((s, r) => s + r.pendingAmount, 0);

  const openBreakdownDetail = (row: BreakdownRow) => {
    const [y, m] = row.dueDate.split("-").map(Number);
    setYear(y);
    setMonth(m - 1);
    setSelectedDate(row.dueDate);
    setViewMode("mes");
    setBreakdownCard(null);
  };

  // Totais do dia selecionado para mini resumo
  const selectedDayReceived = selectedDate ? receivedByDate[selectedDate]?.total || 0 : 0;
  const selectedDayPending =
    sortedSelectedItems.reduce((s, i) => s + i.amount, 0) +
    selectedSaleItems.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      {/* Origin filter */}
      <div className="grid grid-cols-4 gap-1.5 md:gap-2">
        {(
          [
            { v: "todos", label: "Todos" },
            { v: "emprestimos", label: "Empréstimos" },
            { v: "vendas", label: "Vendas" },
            { v: "veiculos", label: "Veículos" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => setOriginFilter(opt.v)}
            className={cn(
              "px-2 py-1.5 rounded-lg text-[11px] md:text-xs font-medium border transition-colors whitespace-nowrap truncate",
              originFilter === opt.v
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-muted/30 text-muted-foreground border-border/60 hover:text-foreground hover:bg-background/60",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Summary cards seguindo o design refinado de empréstimos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {(
          [
            {
              key: "hoje",
              label: "Receber hoje",
              tone: "text-amber-600 dark:text-amber-400",
              badgeBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
              bgGradient: "bg-gradient-to-br from-amber-500/10 via-amber-500/[0.04] to-transparent",
              iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
              icon: Clock,
              data: summary.hoje,
              action: () => {
                setSelectedDate(todayStr);
                setViewMode("mes");
              },
            },
            {
              key: "amanha",
              label: "Receber amanhã",
              tone: "text-primary",
              badgeBg: "bg-primary/15 text-primary border-primary/30",
              bgGradient: "bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent",
              iconBg: "bg-primary/15 text-primary",
              icon: CalendarIcon,
              data: summary.amanha,
              action: () => {
                setSelectedDate(tomorrowStr);
                setViewMode("mes");
              },
            },
            {
              key: "atrasados",
              label: "Atrasados",
              tone: "text-destructive",
              badgeBg: "bg-destructive/15 text-destructive border-destructive/30",
              bgGradient: "bg-gradient-to-br from-destructive/10 via-destructive/[0.04] to-transparent",
              iconBg: "bg-destructive/15 text-destructive",
              icon: AlertTriangle,
              data: summary.overdue,
              action: () => setBreakdownCard("atrasados"),
            },
            {
              key: "mes",
              label: "Este mês",
              tone: "text-foreground",
              badgeBg: "bg-muted text-muted-foreground border-border",
              bgGradient: "bg-gradient-to-br from-muted/30 to-transparent",
              iconBg: "bg-muted text-foreground",
              icon: DollarSign,
              data: summary.month,
              action: () => setBreakdownCard("mes"),
            },
          ] as const
        ).map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              type="button"
              onClick={c.action}
              className="text-left focus:outline-none focus:ring-2 focus:ring-primary rounded-2xl group"
              aria-label={`Ver contratos: ${c.label}`}
            >
              <Card
                no3d
                className={`relative overflow-hidden rounded-2xl border border-border/60 hover:shadow-md transition-all duration-200 ${c.bgGradient} cursor-pointer h-full`}
              >
                <CardContent className="p-3.5 flex flex-col justify-between h-full gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">{c.label}</span>
                    <div className={`h-7 w-7 rounded-lg ${c.iconBg} flex items-center justify-center shrink-0`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div>
                    <p className={`text-base md:text-xl font-bold tracking-tight tabular-nums ${c.tone}`}>
                      {formatCurrency(c.data.total)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {c.data.count} {c.data.count === 1 ? "contrato" : "contratos"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* View selector + Navegação de Mês */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-1 gap-1 w-full md:w-auto overflow-x-auto order-2 md:order-1">
          {(
            [
              { v: "mes", label: "Mês" },
              { v: "semana", label: "Semana" },
              { v: "agenda", label: "Agenda" },
              { v: "lista", label: "Lista" },
              { v: "geral", label: "Geral" },
            ] as const
          ).map((opt) => (
            <button
              type="button"
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
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs gap-1"
            onClick={goToToday}
            title="Ir para a data de hoje"
          >
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            <span>Hoje</span>
          </Button>

          <div className="flex items-center gap-1 border border-border/60 rounded-lg p-0.5 bg-background">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md"
              onClick={prevMonth}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs md:text-sm font-semibold text-foreground capitalize px-2 min-w-[130px] text-center">
              {monthNames[month]} {year}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md"
              onClick={nextMonth}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4",
          viewMode === "mes" && "md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]",
        )}
      >
        {viewMode === "mes" && (
          <Card no3d className="md:sticky md:top-4 md:self-start border shadow-sm rounded-2xl">
            <CardContent className="p-3 md:p-4">
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {dayNames.map((d) => (
                  <div key={d} className="text-center text-[10px] md:text-xs font-medium text-muted-foreground py-1">
                    {d}
                  </div>
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
                  const hasReceived = !!received && received.total > 0;
                  const isFullyPaid = hasReceived && !hasPending;
                  const isOverdue = dateStr < todayStr && hasPending;
                  const isUpcoming = dateStr >= todayStr && hasPending;
                  const dayTotal = pending.total;

                  return (
                    <button
                      type="button"
                      key={day}
                      onClick={() => handleDayClick(day)}
                      className={cn(
                        "relative flex flex-col items-stretch rounded-xl p-1 md:p-1.5 min-h-[58px] md:min-h-[68px] text-left transition-all border",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-sm ring-2 ring-primary/40"
                          : isToday
                          ? "bg-primary/5 border-primary/40 ring-1 ring-primary/40"
                          : isOverdue
                          ? "bg-destructive/10 border-destructive/20 hover:bg-destructive/15"
                          : isFullyPaid
                          ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15"
                          : isUpcoming
                          ? "bg-warning/5 border-warning/20 hover:bg-warning/10"
                          : "border-border/40 hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "text-xs md:text-sm font-semibold",
                            isSelected ? "text-primary-foreground" : isToday ? "text-primary font-bold" : "text-foreground",
                          )}
                        >
                          {day}
                        </span>
                        <div className="flex items-center gap-0.5">
                          {isFullyPaid && (
                            <CheckCircle2
                              className={cn(
                                "h-3 w-3",
                                isSelected ? "text-primary-foreground" : "text-emerald-500",
                              )}
                            />
                          )}
                          {hasReceived && !isFullyPaid && (
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                isSelected ? "bg-primary-foreground" : "bg-emerald-500",
                              )}
                            />
                          )}
                          {isUpcoming && (
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                isSelected ? "bg-primary-foreground" : "bg-warning",
                              )}
                            />
                          )}
                          {isOverdue && (
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                isSelected ? "bg-primary-foreground" : "bg-destructive",
                              )}
                            />
                          )}
                          {!hasPending && !hasReceived && (
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                          )}
                        </div>
                      </div>

                      {dayTotal > 0 ? (
                        <div className="mt-auto">
                          <span
                            className={cn(
                              "text-[9px] md:text-[10px] font-bold truncate leading-tight block",
                              isSelected
                                ? "text-primary-foreground"
                                : isOverdue
                                ? "text-destructive"
                                : "text-warning",
                            )}
                          >
                            {formatCurrency(dayTotal)}
                          </span>
                          <span
                            className={cn(
                              "text-[8px] opacity-80 block truncate",
                              isSelected ? "text-primary-foreground/90" : "text-muted-foreground",
                            )}
                          >
                            {pending.count} {pending.count === 1 ? "cobr." : "cobr."}
                          </span>
                        </div>
                      ) : isFullyPaid ? (
                        <span
                          className={cn(
                            "mt-auto text-[8px] font-medium text-emerald-600 dark:text-emerald-400 block truncate",
                            isSelected && "text-primary-foreground",
                          )}
                        >
                          {formatCurrency(received.total)} ✓
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] md:text-xs text-muted-foreground border-t border-border/40 pt-2">
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Recebido
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-warning" /> A vencer
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-destructive" /> Atrasado
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> Sem contratos
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Painel lateral: Lista de Cards Decisórios do dia selecionado */}
        {viewMode === "mes" && (
          <div className="space-y-3">
            {/* Header de Ações e Informações do Dia */}
            <div className="flex items-center justify-between gap-2 flex-wrap bg-card border rounded-2xl p-3 shadow-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>{selectedDate === todayStr ? "Hoje" : selectedDate === tomorrowStr ? "Amanhã" : "Data selecionada"}</span>
                </div>
                <h3 className="text-sm md:text-base font-semibold text-foreground capitalize truncate">
                  {selectedDate
                    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : "Nenhuma data selecionada"}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {(sortedSelectedItems.length > 0 || selectedSaleItems.length > 0) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs px-2.5 gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                    onClick={handleCopyDaySchedule}
                    title="Copiar pauta do dia para o WhatsApp"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Pauta WhatsApp</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Campo de pesquisa dentro do dia */}
            {(rawSelectedItems.length > 2 || rawSelectedSaleItems.length > 2) && (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filtrar contratos do dia..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 pl-9 text-xs rounded-xl"
                />
              </div>
            )}

            {/* Listagem com os Cards Completos no Padrão da Aba Empréstimos */}
            <div className="space-y-3">
              {sortedSelectedItems.length === 0 && selectedSaleItems.length === 0 ? (
                <div className="text-center py-10 px-4 bg-muted/20 rounded-2xl border border-dashed text-muted-foreground text-sm space-y-1">
                  <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
                  <p className="font-medium text-foreground">Nenhuma cobrança para esta data</p>
                  <p className="text-xs">
                    {searchTerm
                      ? "Nenhum contrato encontrado com o termo digitado."
                      : "Selecione outro dia no calendário para ver os contratos."}
                  </p>
                </div>
              ) : (
                <>
                  {sortedSelectedItems.map((item) => renderLoanDecisionCard(item, item.date < todayStr))}
                  {selectedSaleItems.map((s) => renderSaleDecisionCard(s))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Semana / Agenda / Lista / Geral */}
      {viewMode !== "mes" && (
        <Card no3d className="border shadow-sm rounded-2xl">
          <CardContent className="p-3 md:p-4 space-y-3">
            {(() => {
              const startOfWeek = new Date(today);
              startOfWeek.setDate(today.getDate() - today.getDay());
              const endOfWeek = new Date(startOfWeek);
              endOfWeek.setDate(startOfWeek.getDate() + 6);
              const startStr = formatLocalDate(startOfWeek);
              const endStr = formatLocalDate(endOfWeek);

              const collect = () => {
                const out: {
                  date: string;
                  kind: "loan" | "sale" | "vehicle";
                  name: string;
                  subtitle: string;
                  amount: number;
                  status: "overdue" | "due_today" | "upcoming";
                  tags?: string[];
                }[] = [];
                Object.entries(filteredDueMap).forEach(([d, arr]) =>
                  arr.forEach((i) =>
                    out.push({
                      date: d,
                      kind: "loan",
                      name: i.borrowerName,
                      subtitle: `Empréstimo · Parcela ${i.installmentNumber}/${i.totalInstallments}`,
                      amount: i.amount,
                      status: d < todayStr ? "overdue" : d === todayStr ? "due_today" : "upcoming",
                      tags: Array.isArray(i.loan?.tags) ? i.loan.tags.filter(Boolean) : [],
                    }),
                  ),
                );
                Object.entries(filteredSalesDueMap).forEach(([d, arr]) =>
                  arr.forEach((s) =>
                    out.push({
                      date: d,
                      kind: s.kind,
                      name: s.customerName,
                      subtitle: `${s.kind === "vehicle" ? "Veículo" : "Venda"} · ${s.description} · Parcela ${s.installmentNumber}/${s.totalInstallments}`,
                      amount: s.amount,
                      status: d < todayStr ? "overdue" : d === todayStr ? "due_today" : "upcoming",
                    }),
                  ),
                );
                return out;
              };

              let items = collect();
              if (viewMode === "semana") items = items.filter((i) => i.date >= startStr && i.date <= endStr);
              else if (viewMode === "agenda") items = items.filter((i) => i.date >= todayStr).slice(0, 100);
              else if (viewMode === "lista") items = items.filter((i) => i.date.startsWith(monthPrefix));
              items.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);

              if (items.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum contrato para este período.
                  </p>
                );
              }

              const grouped: Record<string, typeof items> = {};
              items.forEach((i) => {
                if (!grouped[i.date]) grouped[i.date] = [];
                grouped[i.date].push(i);
              });

              const originLabel = (k: "loan" | "sale" | "vehicle") =>
                k === "loan" ? "Empréstimo" : k === "vehicle" ? "Veículo" : "Venda";
              const statusLabel = (s: "overdue" | "due_today" | "upcoming") =>
                s === "overdue" ? "Atrasado" : s === "due_today" ? "Vence hoje" : "A vencer";

              return Object.entries(grouped).map(([d, arr]) => (
                <div key={d} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 pt-2 first:pt-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-foreground capitalize">
                        {new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                          year: viewMode === "geral" ? "numeric" : undefined,
                        })}
                      </p>
                      <span className="text-[10px] text-muted-foreground">({arr.length})</span>
                    </div>
                    <p className={cn("text-xs font-bold", d < todayStr ? "text-destructive" : "text-success")}>
                      {formatCurrency(arr.reduce((s, i) => s + i.amount, 0))}
                    </p>
                  </div>
                  {arr.map((i, idx) => {
                    const tone =
                      i.status === "overdue"
                        ? "border-destructive/30 bg-destructive/5"
                        : i.status === "due_today"
                        ? "border-warning/30 bg-warning/5"
                        : "border-border/40 bg-muted/20";
                    const Icon = i.kind === "loan" ? User : i.kind === "vehicle" ? Car : ShoppingBag;
                    const statusTone =
                      i.status === "overdue"
                        ? "text-destructive border-destructive/40"
                        : i.status === "due_today"
                        ? "text-warning border-warning/40"
                        : "text-muted-foreground border-border/60";
                    return (
                      <div
                        key={`${d}-${idx}`}
                        className={cn("flex items-center justify-between gap-2 rounded-xl border p-3", tone)}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-background/60 flex items-center justify-center shrink-0">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <p className="text-xs font-semibold text-foreground truncate">{i.name}</p>
                              {i.kind === "loan" && i.tags && i.tags.length > 0 && (
                                <span className="text-[10px] font-medium text-blue-500 truncate">
                                  {i.tags.join(", ")}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              Vencimento: {i.date.split("-").reverse().join("/")} · {originLabel(i.kind)}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">{i.subtitle}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <p
                            className={cn(
                              "text-xs font-bold",
                              i.status === "overdue" ? "text-destructive" : "text-foreground",
                            )}
                          >
                            {formatCurrency(i.amount)}
                          </p>
                          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", statusTone)}>
                            {statusLabel(i.status)}
                          </Badge>
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

      {/* Payment confirmation dialog */}
      <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
        <DialogContent className="sm:max-w-[420px] md:max-w-[720px] sm:max-h-[92svh] overflow-hidden flex flex-col p-0 rounded-2xl">
          <DialogHeader className="px-6 pt-6 shrink-0">
            <DialogTitle>
              {paymentDialog?.type === "full"
                ? "Pagamento Total"
                : paymentDialog?.type === "payoff"
                ? "Quitar Contrato"
                : paymentDialog?.type === "installment"
                ? "Receber Parcela"
                : paymentDialog?.type === "interest"
                ? "Pagar Juros"
                : "Pagamento Parcial"}
              {paymentDialog && (
                <span className="block text-sm font-normal text-muted-foreground mt-1">
                  {paymentDialog.borrowerName}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-4">
                {paymentDialog?.type === "full" &&
                  paymentDialog.loanId &&
                  (() => {
                    const loan = loans.find((l) => l.id === paymentDialog.loanId);
                    if (!loan) return null;
                    const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
                    const totalPaid = payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
                    const remaining =
                      loan.remainingAmount != null && loan.remainingAmount > 0
                        ? loan.remainingAmount
                        : Math.max(0, total - totalPaid);
                    return (
                      <div className="text-center p-3.5 bg-muted/50 rounded-xl w-full border">
                        <p className="text-xs text-muted-foreground">Total restante a receber</p>
                        <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
                      </div>
                    );
                  })()}
                {paymentDialog?.type === "payoff" &&
                  paymentDialog.loanId &&
                  (() => {
                    const loan = loans.find((l) => l.id === paymentDialog.loanId);
                    if (!loan) return null;
                    const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
                    const totalPaid = payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
                    const remaining =
                      loan.remainingAmount != null && loan.remainingAmount > 0
                        ? loan.remainingAmount
                        : Math.max(0, total - totalPaid);
                    return (
                      <div className="w-full space-y-2">
                        <div className="text-center p-3.5 bg-muted/50 rounded-xl w-full border">
                          <p className="text-xs text-muted-foreground">Total restante a receber</p>
                          <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="payoff-amount-cal" className="text-xs">
                            Valor para quitar (R$)
                          </Label>
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
                            className="rounded-xl"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Informe o valor de quitação. O contrato será marcado como pago.
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                {paymentDialog?.type === "partial" && paymentDialog.amount && (
                  <div className="text-center p-3.5 bg-muted/50 rounded-xl w-full border">
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
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeMethods.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
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
                  className="rounded-xl border pointer-events-auto"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-border/40 md:border-0 md:bg-transparent">
            <Button variant="outline" className="rounded-xl" onClick={() => setPaymentDialog(null)}>
              Cancelar
            </Button>
            <Button
              className="rounded-xl"
              onClick={confirmPayment}
              disabled={
                paymentDialog?.type === "payoff" && !(parseFloat(payoffAmount.replace(",", ".")) > 0)
              }
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Breakdown do card */}
      <Dialog open={breakdownCard !== null} onOpenChange={(o) => !o && setBreakdownCard(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 rounded-2xl">
          <DialogHeader className="px-4 md:px-6 pt-4 md:pt-6 pb-3 border-b border-border/40">
            <DialogTitle className="text-base md:text-lg">
              {breakdownCard ? breakdownLabels[breakdownCard] : ""}
            </DialogTitle>
            <div className="flex items-center justify-between pt-1 text-xs md:text-sm">
              <span className="text-muted-foreground">
                {breakdownRows.length} {breakdownRows.length === 1 ? "contrato" : "contratos"}
              </span>
              <span className="font-bold text-foreground">Total: {formatCurrency(breakdownTotal)}</span>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-3 md:px-6 py-3 space-y-2">
            {breakdownRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum contrato pendente para este período.
              </p>
            ) : (
              breakdownRows.map((r) => {
                const originIcon =
                  r.origin === "Empréstimo" ? (
                    <User className="h-5 w-5" />
                  ) : r.origin === "Aluguel de veículo" ? (
                    <Car className="h-5 w-5" />
                  ) : (
                    <ShoppingBag className="h-5 w-5" />
                  );
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
                          <span className="text-xs font-medium text-blue-500 truncate">{r.tags.join(", ")}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        Vencimento: {r.dueDate.split("-").reverse().join("/")}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 truncate">
                        {r.origin} · {r.installmentInfo}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-bold shrink-0",
                        r.dueDate < todayStr ? "text-destructive" : "text-success",
                      )}
                    >
                      {formatCurrency(r.pendingAmount)}
                    </p>
                  </button>
                );
              })
            )}
          </div>
          <DialogFooter className="px-4 md:px-6 py-3 border-t border-border/40">
            <Button variant="outline" className="rounded-xl" onClick={() => setBreakdownCard(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
