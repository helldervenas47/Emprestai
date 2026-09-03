import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, CalendarDays, TrendingUp, ArrowUpCircle, ArrowDownCircle, Wallet, Pencil, RotateCcw, CreditCard as CreditCardIcon, PiggyBank as PiggyBankIcon, Wand2, User as UserIcon, CalendarIcon } from "lucide-react";
import type { Income } from "@/features/financial/hooks/useIncomes";
import type { Expense, Sale } from "@/types/loan";
import { useProducts } from "@/features/sales/hooks/useProducts";
import { isPiggyExpense, usePiggyBanks } from "@/features/piggyBanks/hooks/usePiggyBanks";
import { useCreditCards } from "@/features/creditCards/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/features/creditCards/hooks/useCreditCardOpenings";
import { getCardInvoiceTotalsForMonth, isCreditCardExpense } from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { useBalanceAdjustments } from "@/features/financial/hooks/useBalanceAdjustments";
import { useUnifiedAccountBalance } from "@/features/financial/hooks/useUnifiedAccountBalance";
import { todayDateInAppTz } from "@/lib/timezone";
import { calculateIncomeProjectedSummary } from "@/features/financial/lib/incomeProjectedSummary";
import { isVehicleExpenseForVehicles } from "@/features/vehicles/components/VehicleExpenseForm";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { toast } from "sonner";


interface Props {
  incomes: Income[];
  expenses?: Expense[];
  /** Override the auto-computed account balance baseline. */
  accountBalance?: number;
  /** All incomes (incl. ajustes) used to compute the account balance baseline. */
  allIncomes?: Income[];
  /** All expenses (incl. business) used to compute the account balance baseline. */
  allExpenses?: Expense[];
  /** Mês selecionado externamente (YYYY-MM). Mantém calendário sincronizado com o filtro geral. */
  monthKey?: string;
  /** Notifica mudança de mês ao navegar pelo calendário. */
  onMonthChange?: (monthKey: string) => void;
}

function saleReceivedTotal(sale: Sale): number {
  if (sale.paymentHistory && sale.paymentHistory.length > 0) {
    return sale.paymentHistory.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }
  const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  return (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const compactCurrency = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}R$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${sign}R$${Math.round(abs)}`;
};

const formatLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

type CardInvoiceEntry = {
  cardId: string;
  cardLabel: string;
  total: number;
  paidTotal: number;
  remaining: number;
  paid: boolean;
};

type PiggyMovementEntry = {
  id: string;
  piggyBankId: string;
  piggyName?: string;
  amount: number; // positive = guardar (saída), negative = resgatar (entrada)
};

type DayInfo = {
  incomes: Income[];
  expenses: Expense[];
  cardInvoices: CardInvoiceEntry[];
  piggyMovements: PiggyMovementEntry[];
  totalIncome: number;
  totalExpense: number;
  projectedIncome: number;
  projectedExpense: number;
};

/**
 * Calendário diário: exibe receitas e despesas pessoais por dia,
 * com totais por categoria e saldo final do dia.
 */
export function IncomePendingCalendar({
  incomes,
  expenses = [],
  accountBalance,
  allIncomes,
  allExpenses,
  monthKey,
  onMonthChange,
}: Props) {
  const today = todayDateInAppTz();
  const todayStr = formatLocalDate(today);

  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const initialY = monthKey ? Number(monthKey.split("-")[0]) : today.getFullYear();
  const initialM = monthKey ? Number(monthKey.split("-")[1]) - 1 : today.getMonth();
  const [year, setYear] = useState(initialY);
  const [month, setMonth] = useState(initialM);

  // Sincroniza com o filtro externo (monthKey controlado).
  useEffect(() => {
    if (!monthKey) return;
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return;
    if (y !== year) setYear(y);
    if (m - 1 !== month) setMonth(m - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  // Notifica o pai quando o mês muda pelo calendário.
  useEffect(() => {
    if (!onMonthChange) return;
    const mk = `${year}-${String(month + 1).padStart(2, "0")}`;
    if (mk !== monthKey) onMonthChange(mk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { adjustments, setAdjustment, clearAdjustment } = useBalanceAdjustments();
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [editDate, setEditDate] = useState<string>("");

  const { sales: rawSales } = useProducts(true);
  // Aluguéis de veículo são isolados na aba "Veículos" e não devem aparecer aqui.
  const sales = useMemo(
    () => (rawSales || []).filter((s) => s.businessType !== "aluguel_veiculo"),
    [rawSales],
  );
  const { deposits: piggyDeposits, piggyBanks } = usePiggyBanks();

  // Saldo em conta — usa o hook unificado para garantir IDENTIDADE com o
  // card "Saldo em Conta" (IncomeBalanceCard). Antes, este componente
  // recomputava a base com uma fórmula divergente (subtraía TODAS as
  // despesas pagas, sem filtrar escopo/cartão/veículo), o que fazia o
  // "Saldo previsto" do calendário ficar diferente do card dos resumos.
  const unifiedBalance = useUnifiedAccountBalance();
  const baseBalance = accountBalance ?? unifiedBalance;

  // Status do dia para colorir o calendário:
  // - "paid": todos os lançamentos do dia (receitas, despesas e faturas) estão pagos/recebidos
  // - "pending": existe ao menos 1 lançamento pendente no dia
  // - "none": nenhum lançamento
  const getDayStatus = (info?: DayInfo): "paid" | "pending" | "none" => {
    if (!info) return "none";
    const total =
      info.incomes.length + info.expenses.length + info.cardInvoices.length;
    if (total === 0) return "none";
    const hasPending =
      info.incomes.some((i) => i.status !== "received") ||
      info.expenses.some((e) => !e.paid) ||
      info.cardInvoices.some((c) => !c.paid);
    return hasPending ? "pending" : "paid";
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(i);
    return arr;
  }, [year, month]);

  const weekDays = useMemo(() => {
    const base = todayDateInAppTz();
    const dow = base.getDay();
    const start = new Date(base);
    start.setDate(base.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, []);


  const personalExpenses = useMemo(
    () => expenses.filter(
      (e) =>
        (e.scope ?? "business") === "personal" &&
        !isCreditCardExpense(e) &&
        !isPiggyExpense(e.notes) &&
        !isVehicleExpenseForVehicles(e),
    ),
    [expenses]
  );

  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();

  const dayMap = useMemo(() => {
    const map: Record<string, DayInfo> = {};
    const ensure = (d: string) => {
      if (!map[d]) map[d] = { incomes: [], expenses: [], cardInvoices: [], piggyMovements: [], totalIncome: 0, totalExpense: 0, projectedIncome: 0, projectedExpense: 0 };
      return map[d];
    };
    for (const i of incomes) {
      // Posiciona pela data real do recebimento quando recebida; senão pela data prevista.
      const d = i.status === "received" ? (i.actualReceivedDate || i.receivedDate) : i.receivedDate;
      if (!d) continue;
      const e = ensure(d);
      e.incomes.push(i);
      e.totalIncome += Number(i.amount) || 0;
      if (i.status !== "received") e.projectedIncome += Number(i.amount) || 0;
    }

    // Vendas recebidas: cada pagamento (paymentHistory) aparece no calendário no dia
    // do recebimento como uma receita sintética. Para vendas antigas sem histórico,
    // usa a diferença legacy (downPayment + paidInstallments + partialPaid) na data da venda.
    for (const s of (sales || [])) {
      const desc = s.description || s.productName || "Venda";
      const account = s.customerName || "";
      const history = s.paymentHistory || [];
      const iv = s.installmentValue ?? (s.installments > 0 ? s.total / s.installments : s.total);
      const legacyTotal = (s.downPayment || 0) + (s.paidInstallments || 0) * iv + (s.partialPaid || 0);
      const historyTotal = history.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

      history.forEach((p, idx) => {
        const amt = Number(p.amount) || 0;
        if (amt <= 0) return;
        const date = p.date || s.date;
        if (!date) return;
        const isPartial = p.type === "partial";
        const e = ensure(date);
        const synth: Income = {
          id: `sale-${s.id}-p${idx}`,
          description: `Venda${account ? ` · ${account}` : ""} — ${desc}${isPartial ? " (Parcial)" : ""}`,
          amount: amt,
          category: "Vendas",
          clientId: null,
          source: "Venda",
          paymentMethodId: null,
          receivedDate: date,
          actualReceivedDate: date,
          status: "received",
          notes: null,
          recurrence: "once",
          parentId: null,
          createdAt: date,
        };
        e.incomes.push(synth);
        e.totalIncome += amt;
      });

      const missing = legacyTotal - historyTotal;
      if (missing > 0.005 && s.date) {
        const e = ensure(s.date);
        const synth: Income = {
          id: `sale-${s.id}-legacy`,
          description: `Venda${account ? ` · ${account}` : ""} — ${desc}`,
          amount: missing,
          category: "Vendas",
          clientId: null,
          source: "Venda",
          paymentMethodId: null,
          receivedDate: s.date,
          actualReceivedDate: s.date,
          status: "received",
          notes: null,
          recurrence: "once",
          parentId: null,
          createdAt: s.date,
        };
        e.incomes.push(synth);
        e.totalIncome += missing;
      }
    }
    // Determina o intervalo (em meses) que precisa ser projetado, considerando o mês
    // visível, a semana atual e o mês corrente — assim despesas fixas/parceladas
    // aparecem antecipadamente nos próximos meses, espelhando a aba "Despesas pessoais".
    const todayRefForExp = todayDateInAppTz();
    const visibleMonthIdxs = [
      todayRefForExp.getFullYear() * 12 + todayRefForExp.getMonth(),
      year * 12 + month,
    ];
    if (weekDays.length) {
      visibleMonthIdxs.push(
        weekDays[0].getFullYear() * 12 + weekDays[0].getMonth(),
        weekDays[weekDays.length - 1].getFullYear() * 12 +
          weekDays[weekDays.length - 1].getMonth(),
      );
    }
    const projHiIdx = Math.max(...visibleMonthIdxs);
    const projEnd = new Date(
      Math.floor(projHiIdx / 12),
      (projHiIdx % 12) + 1,
      0,
    );

    for (const ex of personalExpenses) {
      const isRecurringParent =
        ex.type === "recorrente" && (ex.installments ?? 0) > 1;

      if (ex.paid && ex.paidDate) {
        const e = ensure(ex.paidDate);
        e.expenses.push(ex);
        e.totalExpense += Number(ex.amount) || 0;
        continue;
      }

      if (isRecurringParent) {
        const installmentAmount =
          (Number(ex.amount) || 0) / (ex.installments as number);
        const paidCount = ex.paidInstallments ?? 0;
        const remaining = (ex.installments as number) - paidCount;
        if (remaining <= 0 || !ex.dueDate) continue;
        const start = new Date(ex.dueDate + "T00:00:00");
        for (let i = 0; i < remaining; i++) {
          const occ = new Date(start);
          // `ex.dueDate` já é avançado a cada parcela paga (vide useExpenses.payExpense),
          // portanto NÃO somamos `paidCount` aqui — isso pularia as parcelas pendentes
          // e fazia as despesas pendentes desaparecerem do calendário.
          occ.setMonth(start.getMonth() + i);
          if (occ > projEnd) break;
          const lastDay = new Date(
            occ.getFullYear(),
            occ.getMonth() + 1,
            0,
          ).getDate();
          const day = Math.min(start.getDate(), lastDay);
          const ds = `${occ.getFullYear()}-${String(occ.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const e = ensure(ds);
          e.expenses.push({ ...ex, amount: installmentAmount, dueDate: ds });
          e.totalExpense += installmentAmount;
          e.projectedExpense += installmentAmount;
        }
        continue;
      }

      if (!ex.dueDate) continue;
      const e = ensure(ex.dueDate);
      e.expenses.push(ex);
      e.totalExpense += Number(ex.amount) || 0;
      e.projectedExpense += Number(ex.amount) || 0;
    }

    // Faturas de cartão de crédito — uma entrada por cartão por mês,
    // lançada no dia exato do vencimento da fatura.
    // Cobrimos meses prev/atual/próximo para suportar tanto o mês visível
    // (modo expandido) quanto a semana atual (que pode cruzar meses).
    const monthsToCover = new Set<string>();
    const addMonth = (y: number, m: number) => {
      monthsToCover.add(`${y}-${String(m + 1).padStart(2, "0")}`);
    };
    addMonth(year, month);
    const prev = new Date(year, month - 1, 1);
    const next = new Date(year, month + 1, 1);
    addMonth(prev.getFullYear(), prev.getMonth());
    addMonth(next.getFullYear(), next.getMonth());
    // Cobre semana atual também
    if (weekDays.length) {
      addMonth(weekDays[0].getFullYear(), weekDays[0].getMonth());
      const last = weekDays[weekDays.length - 1];
      addMonth(last.getFullYear(), last.getMonth());
    }
    // Encadeamento entre meses: para projetar corretamente o saldo de meses futuros,
    // cobrimos todos os meses entre o mês corrente e o mês navegado (em ambos os sentidos).
    {
      const todayRef = todayDateInAppTz();
      const fromIdx = todayRef.getFullYear() * 12 + todayRef.getMonth();
      const toIdx = year * 12 + month;
      const lo = Math.min(fromIdx, toIdx);
      const hi = Math.max(fromIdx, toIdx);
      for (let idx = lo; idx <= hi; idx++) {
        addMonth(Math.floor(idx / 12), idx % 12);
      }
    }

    for (const ym of monthsToCover) {
      const totals = getCardInvoiceTotalsForMonth(expenses, cards, openings, ym);
      const [y, mm] = ym.split("-").map(Number);
      for (const t of totals) {
        if (t.total <= 0) continue;
        const remaining = Math.max(0, t.total - t.paidTotal);
        const lastDay = new Date(y, mm, 0).getDate();
        const day = Math.min(t.card.dueDay, lastDay);
        const ds = `${y}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const e = ensure(ds);
        const label =
          t.card.nickname?.trim() ||
          (t.card.lastFour ? `Final ${t.card.lastFour}` : t.card.bank || "Cartão");
        e.cardInvoices.push({
          cardId: t.card.id,
          cardLabel: label,
          total: t.total,
          paidTotal: t.paidTotal,
          remaining,
          paid: t.paid,
        });
        // Espelha o card de resumo: só faturas ainda pendentes entram no saldo previsto.
        if (t.total > 0 && !t.paid && !t.hasPaidOverride) {
          e.totalExpense += t.total;
          e.projectedExpense += t.total;
        }
      }
    }
    // Movimentações de cofrinhos (guardar/resgatar) — apenas movimentos manuais
    // (sem expenseId), pois aportes vinculados a despesa já são contabilizados
    // pela própria despesa. Guardar (amount > 0) reduz o saldo do dia; resgatar
    // (amount < 0) aumenta o saldo do dia.
    const piggyNameById = new Map(piggyBanks.map((pb) => [pb.id, pb.name]));
    for (const d of piggyDeposits) {
      if (d.expenseId) continue;
      if (!d.depositDate) continue;
      const e = ensure(d.depositDate);
      const amt = Number(d.amount) || 0;
      e.piggyMovements.push({
        id: d.id,
        piggyBankId: d.piggyBankId,
        piggyName: piggyNameById.get(d.piggyBankId),
        amount: amt,
      });
    }
    return map;
  }, [incomes, personalExpenses, expenses, cards, openings, year, month, weekDays, piggyDeposits, piggyBanks, sales]);


  const monthTotals = useMemo(() => {
    let inc = 0, exp = 0;
    Object.entries(dayMap).forEach(([date, info]) => {
      const [y, m] = date.split("-").map(Number);
      if (y === year && m === month + 1) {
        inc += info.totalIncome;
        exp += info.totalExpense;
      }
    });
    return { inc, exp, balance: inc - exp };
  }, [dayMap, year, month]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  };
  const goToToday = () => {
    const n = todayDateInAppTz();
    setMonth(n.getMonth());
    setYear(n.getFullYear());
    setSelectedDate(formatLocalDate(n));
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
  };

  const handleWeekDayClick = (d: Date) => {
    const dateStr = formatLocalDate(d);
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const emptyDay: DayInfo = { incomes: [], expenses: [], cardInvoices: [], piggyMovements: [], totalIncome: 0, totalExpense: 0, projectedIncome: 0, projectedExpense: 0 };
  const selectedInfo: DayInfo = selectedDate ? (dayMap[selectedDate] ?? emptyDay) : emptyDay;
  // Saldo previsto acumulado dia a dia.
  // Cobre tanto o mês expandido quanto a semana atual.
  const runningBalanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    // Determinar período: união do mês visível e da semana atual.
    // O saldo base já reflete as movimentações até hoje; por isso a projeção
    // começa amanhã para não somar novamente receitas/despesas já realizadas.
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const weekStart = weekDays[0];
    const weekEnd = weekDays[weekDays.length - 1];
    const todayRef = todayDateInAppTz();
    const tomorrow = new Date(todayRef);
    tomorrow.setDate(todayRef.getDate() + 1);
    let start = monthStart < weekStart ? monthStart : weekStart;
    if (start < tomorrow) start = tomorrow;
    const end = monthEnd > weekEnd ? monthEnd : weekEnd;

    if (start > end) return map;

    let running = baseBalance;
    const cursor = new Date(start);
    while (cursor <= end) {
      const ds = formatLocalDate(cursor);
      // Ajuste manual de saldo base — vira nova âncora a partir daquela data.
      // O ajuste sobrescreve o saldo do dia ANTES do delta do dia ser somado.
      const adj = adjustments[ds];
      if (adj !== undefined) {
        running = adj.amount;
      }
      const info = dayMap[ds];
      running += (info?.projectedIncome ?? 0) - (info?.projectedExpense ?? 0);
      map[ds] = running;
      cursor.setDate(cursor.getDate() + 1);
    }
    return map;
  }, [dayMap, baseBalance, year, month, weekDays, adjustments]);

  // Saldo Previsto do mês selecionado — usa a mesma regra do card de resumo.
  const monthEndProjectedBalance = useMemo(() => {
    const currentMonthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    return calculateIncomeProjectedSummary({
      baseBalance,
      incomes,
      expenses,
      cards,
      openings,
      monthKey: currentMonthKey,
    }).projected;
  }, [baseBalance, incomes, expenses, cards, openings, year, month]);

  const selectedHasMovement = selectedInfo.totalIncome > 0 || selectedInfo.totalExpense > 0;
  const selectedBalance = selectedDate
    ? (runningBalanceMap[selectedDate] ?? baseBalance)
    : baseBalance;
  // Saldo do dia anterior (base do cálculo do dia)
  const selectedPrevBalance = (() => {
    if (!selectedDate) return baseBalance;
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const prevDs = formatLocalDate(d);
    return runningBalanceMap[prevDs] ?? baseBalance;
  })();

  // Itens individuais do dia (por descrição), ordenados pelo valor.
  const dayIncomeItems = useMemo(
    () => [...selectedInfo.incomes].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)),
    [selectedInfo],
  );
  const dayExpenseItems = useMemo(
    () => [...selectedInfo.expenses].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)),
    [selectedInfo],
  );

  // Bloqueio de meses encerrados: só permite ajustar a partir do 1º dia do mês corrente.
  const currentMonthStartStr = useMemo(() => {
    const t = todayDateInAppTz();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);
  const isPastMonthDate = (ds: string) => ds < currentMonthStartStr;

  const openAdjustModal = (ds: string) => {
    if (isPastMonthDate(ds)) {
      toast.error("Não é possível recalcular saldos de meses encerrados.");
      return;
    }
    const existing = adjustments[ds];
    const auto = runningBalanceMap[ds] ?? baseBalance;
    setEditDate(ds);
    setEditValue((existing?.amount ?? auto).toFixed(2));
    setEditOpen(true);
  };

  const renderDayDetails = () => {
    if (!selectedDate) return null;
    const hasAdjustment = adjustments[selectedDate] !== undefined;
    const isPastMonth = isPastMonthDate(selectedDate);

    const dayBalanceDelta = selectedInfo.totalIncome - selectedInfo.totalExpense;
    const totalCount =
      selectedInfo.incomes.length +
      selectedInfo.expenses.length +
      selectedInfo.cardInvoices.length +
      selectedInfo.piggyMovements.length;
    const isPositive = dayBalanceDelta >= 0;
    return (
      <>
        <div className="flex items-start justify-between gap-2 mb-3">
          <h4 className="text-sm font-semibold text-foreground capitalize">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </h4>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground uppercase">Saldo do dia</p>
            <p className={`text-sm font-bold tabular-nums ${selectedBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {formatCurrency(selectedBalance)}
            </p>
          </div>
        </div>

        {/* Resumo do dia */}
        <div className={`rounded-lg border px-3 py-2 mb-3 ${isPositive ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"}`}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Receitas</p>
              <p className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(selectedInfo.totalIncome)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Despesas</p>
              <p className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-400">{formatCurrency(selectedInfo.totalExpense)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Saldo</p>
              <p className={`text-xs font-bold tabular-nums ${isPositive ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                {isPositive ? "+" : ""}{formatCurrency(dayBalanceDelta)}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            {totalCount} {totalCount === 1 ? "lançamento" : "lançamentos"} no dia
          </p>
        </div>

        <div className="space-y-3 md:max-h-[420px] md:overflow-y-auto pr-1">
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <ArrowUpCircle className="h-3.5 w-3.5" /> Receitas
                <span className="text-[10px] text-muted-foreground font-normal">({dayIncomeItems.length})</span>
              </div>
              <span className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(selectedInfo.totalIncome)}
              </span>
            </div>
            {dayIncomeItems.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic px-1">Nenhuma movimentação encontrada para esta data.</p>
            ) : (
              <ul className="space-y-1">
                {dayIncomeItems.map((inc) => {
                  const isReceived = inc.status === "received";
                  const dueOriginal = inc.receivedDate;
                  const actual = inc.actualReceivedDate || inc.receivedDate;
                  const diffDays = isReceived && dueOriginal && actual
                    ? Math.round((new Date(actual + "T00:00:00").getTime() - new Date(dueOriginal + "T00:00:00").getTime()) / 86400000)
                    : 0;
                  const isLate = !isReceived && selectedDate < todayStr;
                  let statusLabel = "Pendente";
                  let statusCls = "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
                  if (isReceived) {
                    if (diffDays < 0) { statusLabel = "Pago antecipadamente"; statusCls = "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30"; }
                    else if (diffDays > 0) { statusLabel = "Pago com atraso"; statusCls = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"; }
                    else { statusLabel = "Pago em dia"; statusCls = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"; }
                  } else if (isLate) {
                    statusLabel = "Atrasado";
                    statusCls = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
                  }
                  const fmtBR = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  const dotCls = isReceived ? "bg-emerald-500" : "bg-rose-500";
                  return (
                    <li key={`inc-${inc.id}`} className="flex items-start justify-between gap-2 rounded-md bg-emerald-500/5 border border-emerald-500/20 px-2.5 py-1.5">
                      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="text-xs text-foreground break-words leading-snug font-medium inline-flex items-center gap-1.5">
                          {dotCls && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotCls}`} aria-hidden />}
                          <span className="break-words">{inc.description}</span>
                        </span>
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {inc.category && <span className="text-[10px] text-muted-foreground">{inc.category}</span>}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${statusCls}`}>{statusLabel}</span>
                        </span>
                        {isReceived && diffDays !== 0 && dueOriginal && (
                          <span className="text-[10px] text-muted-foreground">
                            Venc. {fmtBR(dueOriginal)} · Recebido {fmtBR(actual!)} ({diffDays > 0 ? `+${diffDays}` : diffDays}d)
                          </span>
                        )}
                      </span>
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0 whitespace-nowrap">
                        {formatCurrency(Number(inc.amount) || 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                <ArrowDownCircle className="h-3.5 w-3.5" /> Despesas
                <span className="text-[10px] text-muted-foreground font-normal">({dayExpenseItems.length})</span>
              </div>
              <span className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                {formatCurrency(selectedInfo.totalExpense)}
              </span>
            </div>
            {dayExpenseItems.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic px-1">Nenhuma movimentação encontrada para esta data.</p>
            ) : (
              <ul className="space-y-1">
                {dayExpenseItems.map((ex) => {
                  const isPaid = !!ex.paid;
                  const dueOriginal = ex.dueDate;
                  const actual = ex.paidDate;
                  const diffDays = isPaid && dueOriginal && actual
                    ? Math.round((new Date(actual + "T00:00:00").getTime() - new Date(dueOriginal + "T00:00:00").getTime()) / 86400000)
                    : 0;
                  const isLate = !isPaid && !!ex.dueDate && ex.dueDate < todayStr;
                  let statusLabel = "Pendente";
                  let statusCls = "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
                  if (isPaid) {
                    if (diffDays < 0) { statusLabel = "Pago antecipadamente"; statusCls = "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30"; }
                    else if (diffDays > 0) { statusLabel = "Pago com atraso"; statusCls = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"; }
                    else { statusLabel = "Pago em dia"; statusCls = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"; }
                  } else if (isLate) {
                    statusLabel = "Atrasado";
                    statusCls = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
                  }
                  const fmtBR = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  const dotCls = isPaid ? "bg-emerald-500" : "bg-rose-500";
                  return (
                    <li key={`exp-${ex.id}`} className="flex items-start justify-between gap-2 rounded-md bg-rose-500/5 border border-rose-500/20 px-2.5 py-1.5">
                      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="text-xs text-foreground break-words leading-snug font-medium inline-flex items-center gap-1.5">
                          {dotCls && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotCls}`} aria-hidden />}
                          <span className="break-words">{ex.description}</span>
                        </span>
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {ex.category && <span className="text-[10px] text-muted-foreground">{ex.category}</span>}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${statusCls}`}>{statusLabel}</span>
                        </span>
                        {isPaid && diffDays !== 0 && dueOriginal && actual && (
                          <span className="text-[10px] text-muted-foreground">
                            Venc. {fmtBR(dueOriginal)} · Pago {fmtBR(actual)} ({diffDays > 0 ? `+${diffDays}` : diffDays}d)
                          </span>
                        )}
                      </span>
                      <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 tabular-nums shrink-0 whitespace-nowrap">
                        {formatCurrency(Number(ex.amount) || 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {selectedInfo.cardInvoices.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-400">
                  <CreditCardIcon className="h-3.5 w-3.5" /> Faturas de cartão
                </div>
                <span className="text-xs font-semibold tabular-nums text-violet-700 dark:text-violet-400">
                  {formatCurrency(selectedInfo.cardInvoices.reduce((s, c) => s + c.total, 0))}
                </span>
              </div>
              <ul className="space-y-1">
                {selectedInfo.cardInvoices.map((c) => {
                  const dotCls = c.paid ? "bg-emerald-500" : "bg-rose-500";
                  return (
                  <li key={`inv-${c.cardId}`} className="flex items-start justify-between gap-2 rounded-md bg-violet-500/5 border border-violet-500/20 px-2.5 py-1.5">
                    <span className="flex items-start gap-1.5 text-xs text-foreground min-w-0 flex-1">
                      {dotCls && <span className={`h-1.5 w-1.5 mt-1 rounded-full shrink-0 ${dotCls}`} aria-hidden />}
                      <CreditCardIcon className="h-3 w-3 mt-0.5 text-violet-600 dark:text-violet-400 shrink-0" />
                      <span className="break-words leading-snug">{c.cardLabel}</span>
                      {c.paid && <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">paga</span>}
                    </span>
                    <span className="text-xs font-semibold text-violet-700 dark:text-violet-400 tabular-nums shrink-0 whitespace-nowrap">
                      {formatCurrency(c.total)}
                    </span>
                  </li>
                  );
                })}
              </ul>
              <p className="text-[10px] text-muted-foreground italic mt-1 px-1">
                Faturas em aberto entram no cálculo do saldo previsto do dia.
              </p>
            </section>
          )}

          {selectedInfo.piggyMovements.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <PiggyBankIcon className="h-3.5 w-3.5" /> Cofrinhos
                </div>
                <span className="text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {formatCurrency(selectedInfo.piggyMovements.reduce((s, p) => s - p.amount, 0))}
                </span>
              </div>
              <ul className="space-y-1">
                {selectedInfo.piggyMovements.map((p) => {
                  const isStore = p.amount >= 0;
                  return (
                    <li key={`piggy-${p.id}`} className="flex items-start justify-between gap-2 rounded-md bg-amber-500/5 border border-amber-500/20 px-2.5 py-1.5">
                      <span className="flex items-start gap-1.5 text-xs text-foreground min-w-0 flex-1">
                        {isStore ? <ArrowDownCircle className="h-3 w-3 mt-0.5 text-rose-600 dark:text-rose-400 shrink-0" /> : <ArrowUpCircle className="h-3 w-3 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                        <span className="break-words leading-snug">
                          {isStore ? "Guardar" : "Resgatar"}
                          {p.piggyName ? ` · ${p.piggyName}` : ""}
                        </span>
                      </span>
                      <span className={`text-xs font-semibold tabular-nums shrink-0 whitespace-nowrap ${isStore ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                        {isStore ? "-" : "+"}{formatCurrency(Math.abs(p.amount))}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[10px] text-muted-foreground italic mt-1 px-1">
                Movimentações dos cofrinhos afetam apenas o saldo previsto, não receitas/despesas.
              </p>
            </section>
          )}

          <div className="rounded-md border border-border bg-card px-3 py-2 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Wallet className="h-3 w-3" /> Saldo previsto do dia anterior</span>
              <span className="tabular-nums">{formatCurrency(selectedPrevBalance)}</span>
            </div>
            {hasAdjustment && (
              <div className="flex items-center justify-between text-[11px] text-primary">
                <span className="flex items-center gap-1"><Wand2 className="h-3 w-3" /> Ajuste de saldo base</span>
                <span className="tabular-nums">{formatCurrency(adjustments[selectedDate]!.amount)}</span>
              </div>
            )}
            {selectedHasMovement && (
              <>
                <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400">
                  <span>+ Recebimentos do dia</span>
                  <span className="tabular-nums">{formatCurrency(selectedInfo.totalIncome)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-rose-700 dark:text-rose-400">
                  <span>− Despesas do dia</span>
                  <span className="tabular-nums">{formatCurrency(selectedInfo.totalExpense)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-border/60">
              <span className="text-xs font-semibold text-foreground">Saldo previsto do dia</span>
              <span className={`text-sm font-bold tabular-nums ${selectedBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {formatCurrency(selectedBalance)}
              </span>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 flex-1"
                disabled={isPastMonth}
                onClick={() => openAdjustModal(selectedDate)}
              >
                <Wand2 className="h-3 w-3" /> Ajustar saldo base
              </Button>
              {hasAdjustment && !isPastMonth && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { void clearAdjustment(selectedDate); }}>
                  <RotateCcw className="h-3 w-3" /> Remover ajuste
                </Button>
              )}
            </div>
            {isPastMonth && (
              <p className="text-[10px] text-muted-foreground italic pt-1">
                Meses encerrados são congelados para preservar o histórico financeiro.
              </p>
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <Card no3d className="animate-fade-in overflow-hidden rounded-3xl border-border/50 bg-card/70 backdrop-blur-xl">
      <CardContent className="relative p-4 sm:p-5">
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full opacity-[0.15] blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)" }}
          aria-hidden
        />

        <div className="relative mb-4 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-semibold tracking-tight text-foreground">Calendário</h3>
              <p className="truncate text-[11px] text-muted-foreground">
                {monthNames[month]} {year} ·{" "}
                <span className={`font-semibold ${monthEndProjectedBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {formatCurrency(monthEndProjectedBalance)}
                </span>
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="h-8 shrink-0 gap-1 rounded-full border border-border/50 bg-muted/40 px-3 text-[11px] font-medium hover:bg-muted"
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5" /> Recolher</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5" /> Expandir</>
            )}
          </Button>
        </div>

        {/* Legenda compacta de status (pill) */}
        <div className="relative mb-4 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Pago
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 font-medium text-rose-600 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Pendente
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 font-medium text-primary">
            <Wand2 className="h-3 w-3" /> Ajuste
          </span>
        </div>



        <div className="relative grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* Calendário (semana ou mês expandido) permanece sempre visível acima dos detalhes,
              inclusive no mobile, dando contexto ao dia selecionado. */}
          <div className="rounded-2xl border border-border/40 bg-muted/20 p-3">
            {expanded ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <button type="button"
                    className="rounded-full px-3 py-1 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted hover:text-primary"
                    onClick={goToToday}
                  >
                    {monthNames[month]} {year}
                  </button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mb-1 grid grid-cols-7 gap-1">
                  {dayNames.map((d) => (
                    <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, idx) => {
                    if (day === null) return <div key={`empty-${idx}`} />;
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const info = dayMap[dateStr];
                    const status = getDayStatus(info);
                    const hasMovement = status !== "none";
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;

                    return (
                      <button type="button"
                        key={day}
                        onClick={() => handleDayClick(day)}
                        className={`relative flex min-h-[42px] flex-col items-center justify-center rounded-xl p-1 text-xs transition-all duration-200
                          ${isSelected ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : ""}
                          ${isToday && !isSelected ? "border border-primary/40 bg-primary/10 font-bold" : ""}
                          ${!isSelected && !isToday && status === "paid" ? "bg-emerald-500/10 hover:bg-emerald-500/20" : ""}
                          ${!isSelected && !isToday && status === "pending" ? "bg-rose-500/10 hover:bg-rose-500/20" : ""}
                          ${!isSelected && !isToday && status === "none" ? "hover:bg-muted/70" : ""}
                        `}
                      >
                        {adjustments[dateStr] && (
                          <Wand2 className={`absolute right-1 top-1 h-2.5 w-2.5 ${isSelected ? "text-primary-foreground" : "text-primary"}`} />
                        )}
                        <span className={`tabular-nums ${isSelected ? "text-primary-foreground" : "text-foreground"}`}>
                          {day}
                        </span>
                        <span
                          className={`mt-1 h-1 w-1 rounded-full transition-colors ${
                            !hasMovement
                              ? "bg-transparent"
                              : isSelected
                                ? "bg-primary-foreground"
                                : status === "paid"
                                  ? "bg-emerald-500"
                                  : "bg-rose-500"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2.5 text-[11px]">
                  <span className="text-muted-foreground">Saldo do mês</span>
                  <span className={`font-bold tabular-nums ${monthEndProjectedBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {formatCurrency(monthEndProjectedBalance)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="mb-2.5 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Semana atual</p>
                  <Button variant="ghost" size="sm" className="h-7 rounded-full px-3 text-[11px]" onClick={goToToday}>Hoje</Button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map((d) => {
                    const dateStr = formatLocalDate(d);
                    const info = dayMap[dateStr];
                    const status = getDayStatus(info);
                    const hasMovement = status !== "none";
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    return (
                      <button type="button"
                        key={dateStr}
                        onClick={() => handleWeekDayClick(d)}
                        className={`flex min-h-[62px] flex-col items-center justify-center gap-0.5 rounded-2xl p-1.5 text-xs transition-all duration-200
                          ${isSelected ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : ""}
                          ${isToday && !isSelected ? "border border-primary/40 bg-primary/10" : ""}
                          ${!isSelected && !isToday && status === "paid" ? "bg-emerald-500/10 hover:bg-emerald-500/20" : ""}
                          ${!isSelected && !isToday && status === "pending" ? "bg-rose-500/10 hover:bg-rose-500/20" : ""}
                          ${!isSelected && !isToday && status === "none" ? "bg-background/60 hover:bg-muted" : ""}
                        `}
                      >
                        <span className={`text-[9px] font-semibold uppercase tracking-wide ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground/80"}`}>
                          {dayNames[d.getDay()]}
                        </span>
                        <span className={`text-[17px] font-bold leading-none tabular-nums ${isSelected ? "text-primary-foreground" : "text-foreground"}`}>
                          {d.getDate()}
                        </span>
                        <span
                          className={`h-1 w-1 rounded-full transition-colors ${
                            !hasMovement
                              ? "bg-transparent"
                              : isSelected
                                ? "bg-primary-foreground"
                                : status === "paid"
                                  ? "bg-emerald-500"
                                  : "bg-rose-500"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2.5 text-[10px] text-muted-foreground">
                  Toque em <span className="font-semibold text-foreground">Expandir</span> para ver o mês inteiro.
                </p>
              </>
            )}
          </div>

          <div className={`animate-fade-in rounded-2xl border border-border/40 bg-muted/20 p-3 min-h-[200px] ${selectedDate ? "" : "hidden md:block"}`}>
            {!selectedDate ? (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center px-4 text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <p className="text-[13px] font-semibold text-foreground">Nenhum dia selecionado</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Toque em um dia do calendário para ver os lançamentos.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between md:hidden">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 -ml-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedDate(null)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Voltar ao calendário
                  </Button>
                </div>

                {renderDayDetails()}
              </>
            )}
          </div>
        </div>
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /> Ajustar saldo base</DialogTitle>
            <DialogDescription>
              Informe o saldo real em uma data específica. A projeção dos próximos dias passa a ser recalculada a partir desse valor.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const autoBalance = editDate ? (runningBalanceMap[editDate] ?? baseBalance) : baseBalance;
            const v = Number(editValue);
            // Prévia: dias até o fim do mês visível, ou até +60d se anterior.
            const previewEnd = (() => {
              const monthEnd = new Date(year, month + 1, 0);
              if (!editDate) return monthEnd;
              const d = new Date(editDate + "T00:00:00");
              const sixty = new Date(d); sixty.setDate(sixty.getDate() + 60);
              return monthEnd > d ? monthEnd : sixty;
            })();
            const previewDays = editDate
              ? Math.max(0, Math.round((previewEnd.getTime() - new Date(editDate + "T00:00:00").getTime()) / 86400000))
              : 0;
            const dateBlocked = editDate ? isPastMonthDate(editDate) : false;
            return (
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Saldo previsto atual</span>
                  <span className="text-sm font-semibold tabular-nums">{formatCurrency(autoBalance)}</span>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adj-amount">Saldo correto</Label>
                  <MoneyInput id="adj-amount" value={editValue} onChange={setEditValue} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adj-date">Data do saldo</Label>
                  <DatePickerField id="adj-date" value={editDate} onChange={setEditDate} />
                  {dateBlocked && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400">
                      Não é possível recalcular saldos de meses encerrados.
                    </p>
                  )}
                </div>
                {!dateBlocked && editDate && !isNaN(v) && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
                    Os próximos <span className="font-semibold">{previewDays} dias</span> serão recalculados usando este valor como nova base.
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                const v = Number(editValue);
                if (!editDate || isNaN(v)) return;
                if (isPastMonthDate(editDate)) {
                  toast.error("Não é possível recalcular saldos de meses encerrados.");
                  return;
                }
                const prevAuto = runningBalanceMap[editDate] ?? baseBalance;
                void setAdjustment(editDate, v, prevAuto);
                toast.success("Saldo base ajustado — projeção recalculada.");
                setEditOpen(false);
              }}
              disabled={!editDate || editValue === "" || isNaN(Number(editValue)) || (editDate ? isPastMonthDate(editDate) : false)}
            >
              Recalcular saldo futuro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
