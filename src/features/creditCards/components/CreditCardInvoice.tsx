import { useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Pencil,
  Trash2,
  AlertTriangle,
  Wifi,
  CalendarDays,
  CalendarClock,
  Sparkles,
  CheckCircle2,
  CheckCircle,
  Loader2,
  Clock,
  CreditCard as CreditCardIcon,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CreditCard } from "@/features/creditCards/hooks/useCreditCards";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useCreditCardOpenings, cycleKeyFromDate } from "@/features/creditCards/hooks/useCreditCardOpenings";
import { useDataOwner } from "@/hooks/useDataOwner";
import { belongsToCardInvoice, matchCardLink, invoiceItemValue, cycleKeyForDate, readPaidOverride, writePaidOverride, readTotalOverride, writeTotalOverride, listPaidInvoicesInRange, isCreditCardExpense, type PaidInvoiceEntry } from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { expandCreditCardExpenses, type ExpandedExpense } from "@/features/creditCards/lib/creditCardInstallments";
import { useHideValues } from "@/contexts/HideValuesContext";
import { getBank, brandLabel } from "@/features/creditCards/lib/creditCardBanks";
import { CreditCardOpeningDialog } from "./CreditCardOpeningDialog";
import { ExpenseEditDialog } from "@/features/financial/components/ExpenseEditDialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { Expense } from "@/types/loan";
import { toast } from "sonner";
import { recordLedger } from "@/features/financial/lib/ledger";
import { supabase } from "@/integrations/supabase/userClient";
import { assertWritable } from "@/lib/readOnlyState";
import { useFinanceComponentDebug, financeFetchStart, financeFetchSuccess, financeSetState, financeInvalidate } from "@/lib/financeDebug";
import { formatDateBR } from "@/features/financial/lib/formatDateSafe";

export interface CyclePaymentItem {
  id: string;
  amount: number;
  date: string;
  wallet: "account" | "cash";
  mode?: "total" | "partial";
}

interface Props {
  card: CreditCard;
  onClose: () => void;
  /** YYYY-MM — when provided, the initial cycle is the one whose due date falls in this month. */
  referenceMonth?: string;
  /** Bounding rect of the source mini-card; used to animate from that position into fullscreen. */
  originRect?: DOMRect | null;
  /** Opens the validated invoice payment panel immediately after entering from the card list. */
  autoOpenPayment?: boolean;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const parseCurrencyInput = (value: string): number => {
  const raw = value.trim();
  if (!raw || !/[0-9]/.test(raw)) return Number.NaN;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  if (decimalIndex === -1) return Number(raw.replace(/\D/g, ""));
  const integerPart = raw.slice(0, decimalIndex).replace(/\D/g, "");
  const decimalPart = raw.slice(decimalIndex + 1).replace(/\D/g, "");
  if (!integerPart && !decimalPart) return Number.NaN;
  return Number(`${integerPart || "0"}.${decimalPart}`);
};

/**
 * Calculates the closing/due dates of the billing cycle that contains `ref`.
 */
function getCycle(ref: Date, closingDay: number, dueDay: number) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  const closingThis = new Date(y, m, Math.min(closingDay, new Date(y, m + 1, 0).getDate()));
  const closingNext =
    day >= closingDay
      ? new Date(y, m + 1, Math.min(closingDay, new Date(y, m + 2, 0).getDate()))
      : closingThis;
  const closingPrev =
    day >= closingDay
      ? closingThis
      : new Date(y, m - 1, Math.min(closingDay, new Date(y, m, 0).getDate()));
  const dueMonth = dueDay > closingDay ? closingNext.getMonth() : closingNext.getMonth() + 1;
  const dueYear = closingNext.getFullYear();
  const dueDate = new Date(
    dueYear,
    dueMonth,
    Math.min(dueDay, new Date(dueYear, dueMonth + 1, 0).getDate())
  );
  return { from: closingPrev, to: closingNext, dueDate };
}

export function CreditCardInvoice({ card, onClose, referenceMonth, originRect, autoOpenPayment = false }: Props) {
  useFinanceComponentDebug("CreditCardInvoice");
  const { expenses, payExpense, updateExpense, deleteExpense } = useExpenses();
  const { openings, getOpening, upsertOpening } = useCreditCardOpenings();
  const ownerId = useDataOwner();
  const { mask } = useHideValues();
  const bank = getBank(card.bank);

  const initialOffset = useMemo(() => {
    if (!referenceMonth) return 0;
    const [ty, tm] = referenceMonth.split("-").map(Number);
    if (!ty || !tm) return 0;
    for (let off = -24; off <= 24; off++) {
      const d = new Date();
      d.setMonth(d.getMonth() + off);
      const c = getCycle(d, card.closingDay, card.dueDay);
      if (c.dueDate.getFullYear() === ty && c.dueDate.getMonth() + 1 === tm) {
        return off;
      }
    }
    return 0;
  }, [referenceMonth, card.closingDay, card.dueDay]);

  const [cycleOffset, setCycleOffset] = useState(initialOffset);
  const [editingOpening, setEditingOpening] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [editPaidOpen, setEditPaidOpen] = useState(false);
  const [editPaidValue, setEditPaidValue] = useState("");
  const [savingPaid, setSavingPaid] = useState(false);
  const [payDate, setPayDate] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
  const [paying, setPaying] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payWallet, setPayWallet] = useState<"account" | "cash">("account");
  const [payMode, setPayMode] = useState<"total" | "partial">("total");
  const [invoiceLedgerPaid, setInvoiceLedgerPaid] = useState(0);
  const [cycleLedgerPayments, setCycleLedgerPayments] = useState<CyclePaymentItem[]>([]);
  const [deletingCyclePayment, setDeletingCyclePayment] = useState<CyclePaymentItem | null>(null);
  const autoOpenedPaymentRef = useRef(false);

  const [deletingPayment, setDeletingPayment] = useState<PaidInvoiceEntry | null>(null);
  const [deletingPaymentBusy, setDeletingPaymentBusy] = useState(false);

  const handleDeleteCyclePayment = async (paymentItem: CyclePaymentItem) => {
    assertWritable();
    setDeletingPaymentBusy(true);
    try {
      await supabase.from("account_ledger").delete().eq("id", paymentItem.id);
      const updatedPaidTotal = Math.max(0, Number((paidTotal - paymentItem.amount).toFixed(2)));
      const op = openings.find((o) => o.cardId === card.id && o.cycleKey === cycleKey);
      const cleaned = (op?.notes ?? "")
        .replace(/\[PAID:[0-9]+(?:\.[0-9]+)?\]/gi, "")
        .replace(/\[PAGA\]/gi, "")
        .replace(/\[PAID_DATE:\d{4}-\d{2}-\d{2}\]/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      if (updatedPaidTotal > 0.005) {
        let notes = writePaidOverride(cleaned, updatedPaidTotal);
        notes = `${notes ? notes + " " : ""}[LEDGER]`.trim();
        await upsertOpening(card.id, cycleKey, op?.openingAmount ?? 0, notes);
      } else {
        await upsertOpening(card.id, cycleKey, op?.openingAmount ?? 0, cleaned || undefined);
      }
      // Se a fatura deixou de ser quitada, desmarca os itens pagos
      const cycleItems = items.filter((e) => e.paid);
      for (const e of cycleItems) {
        if (!e.isVirtualInstallment) {
          await updateExpense(e.id, { paid: false, paidDate: null });
        }
      }
      window.dispatchEvent(new CustomEvent("ledger:changed"));
      toast.success("Pagamento estornado com sucesso");
      setDeletingCyclePayment(null);
    } catch {
      toast.error("Erro ao estornar pagamento");
    } finally {
      setDeletingPaymentBusy(false);
    }
  };

  const handleDeleteInvoicePayment = async (entry: PaidInvoiceEntry) => {
    assertWritable();
    setDeletingPaymentBusy(true);
    try {
      const op = openings.find((o) => o.cardId === card.id && o.cycleKey === entry.cycleKey);
      const [cy, cm] = entry.cycleKey.split("-").map(Number);
      const cycleTo = new Date(cy, cm - 1, Math.min(card.closingDay, new Date(cy, cm, 0).getDate()));
      const cycleFrom = new Date(cy, cm - 2, Math.min(card.closingDay, new Date(cy, cm - 1, 0).getDate()));
      const cycleItems = expandedExpenses.filter((e) =>
        belongsToCardInvoice(e, card, cycleFrom, cycleTo),
      );
      const itemsTotal = cycleItems.reduce((s, e) => s + invoiceItemValue(e), 0);
      const override = readPaidOverride(op?.notes);
      const restoredOpening =
        (op?.openingAmount ?? 0) > 0
          ? op!.openingAmount
          : override !== null
            ? Math.max(0, Number((override - itemsTotal).toFixed(2)))
            : 0;

      // Estorna lançamentos pagos do ciclo (desmarca paid).
      const paidIds = Array.from(new Set(cycleItems.filter((e) => e.paid).map((e) => e.id)));
      for (const id of paidIds) {
        await updateExpense(id, { paid: false, paidDate: null });
      }

      // Limpa marcadores [PAID:xxx], [PAGA] e [LEDGER]; restaura o saldo inicial.
      const cleaned = (op?.notes ?? "")
        .replace(/\[PAID:[0-9]+(?:\.[0-9]+)?\]/gi, "")
        .replace(/\[TOTAL:[0-9]+(?:\.[0-9]+)?\]/gi, "")
        .replace(/\[PAID_DATE:\d{4}-\d{2}-\d{2}\]/gi, "")
        .replace(/\[PAGA\]/gi, "")
        .replace(/\[LEDGER\]/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      if (op || restoredOpening > 0) {
        await upsertOpening(card.id, entry.cycleKey, restoredOpening, cleaned || undefined);
      }

      // Remove os lançamentos do extrato (ledger) referentes a esta fatura.
      // Como o pagamento da fatura não toca no saldo das carteiras (Conta/Dinheiro)
      // do Dashboard — debita apenas o "Saldo em Conta" da aba Receitas via leitura
      // do extrato —, ao excluir basta remover os lançamentos. NÃO estornar saldo.
      try {
        const { data: ledgerRows } = await supabase
          .from("account_ledger")
          .select("id")
          .eq("metadata->>credit_card_id", card.id)
          .eq("metadata->>cycle_key", entry.cycleKey)
          .eq("metadata->>kind", "credit_card_invoice_payment");
        if (ledgerRows && ledgerRows.length > 0) {
          const ids = ledgerRows.map((r: any) => r.id);
          await supabase.from("account_ledger").delete().in("id", ids);
          window.dispatchEvent(new CustomEvent("ledger:changed"));
        }
      } catch { /* noop */ }
      toast.success("Pagamento da fatura excluído");
      setDeletingPayment(null);
    } catch {
      toast.error("Erro ao excluir pagamento");
    } finally {
      setDeletingPaymentBusy(false);
    }
  };

  useEffect(() => {
    setCycleOffset(initialOffset);
  }, [initialOffset]);


  const ref = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + cycleOffset);
    return d;
  }, [cycleOffset]);

  const cycle = useMemo(
    () => getCycle(ref, card.closingDay, card.dueDay),
    [ref, card.closingDay, card.dueDay]
  );

  const cycleKey = useMemo(() => cycleKeyFromDate(cycle.to), [cycle.to]);
  const opening = getOpening(card.id, cycleKey);
  const openingAmount = opening?.openingAmount ?? 0;

  // Previous cycle for comparison
  const prevCycle = useMemo(() => {
    const d = new Date(ref);
    d.setMonth(d.getMonth() - 1);
    return getCycle(d, card.closingDay, card.dueDay);
  }, [ref, card.closingDay, card.dueDay]);
  const prevCycleKey = useMemo(() => cycleKeyFromDate(prevCycle.to), [prevCycle.to]);
  const prevOpening = getOpening(card.id, prevCycleKey);

  const cardTag = (card.nickname || card.lastFour || "").toLowerCase();

  const expandedExpenses = useMemo(
    () => expandCreditCardExpenses(expenses),
    [expenses]
  );

  /**
   * Composição da fatura: fonte única de verdade (belongsToCardInvoice).
   * A despesa precisa pertencer ao ciclo [fechamento anterior, fechamento atual)
   * E não estar vinculada a outro cartão. Estar vinculada a ESTE cartão nunca
   * dispensa a janela do ciclo — era exatamente isso que inflava a fatura.
   */
  const filterCardExpenses = (from: Date, to: Date): ExpandedExpense[] =>
    expandedExpenses.filter((e) => belongsToCardInvoice(e, card, from, to));

  const items = useMemo(
    () => filterCardExpenses(cycle.from, cycle.to).sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [expandedExpenses, cycle, cardTag, card.id]
  );

  const prevItems = useMemo(
    () => filterCardExpenses(prevCycle.from, prevCycle.to),
    [expandedExpenses, prevCycle, cardTag]
  );

  const sumItems = (list: ExpandedExpense[]) =>
    list.reduce((s, e) => s + invoiceItemValue(e), 0);

  const transactionsTotal = sumItems(items);
  const totalOverride = readTotalOverride(opening?.notes);
  const total = totalOverride ?? (transactionsTotal + openingAmount);
  const prevTotal = (readTotalOverride(prevOpening?.notes) ?? (sumItems(prevItems) + (prevOpening?.openingAmount ?? 0)));
  const paidOverride = readPaidOverride(opening?.notes);
  const openingPaidFlag = /\[PAGA\]/i.test(opening?.notes ?? "");
  const paidItemsTotal = sumItems(items.filter((e) => e.paid));
  const paidTotal = paidOverride ?? Number((paidItemsTotal + (openingPaidFlag ? openingAmount : 0)).toFixed(2));
  const remainingTotal = Math.max(0, Number((total - paidTotal).toFixed(2)));

  const totalRounded = Number(total.toFixed(2));
  // O saldo da conta deve ser regularizado pelo que já está marcado como pago na fatura,
  // mas ainda não foi efetivamente lançado no extrato. Isso cobre o saldo inicial/anterior.
  const paymentRemaining = Math.max(
    0,
    Number((Math.max(remainingTotal, paidTotal - invoiceLedgerPaid, totalRounded - invoiceLedgerPaid)).toFixed(2)),
  );

  useEffect(() => {
    if (!autoOpenPayment || autoOpenedPaymentRef.current || paymentRemaining <= 0.005) return;
    autoOpenedPaymentRef.current = true;
    setPayAmount(paymentRemaining.toFixed(2).replace(".", ","));
    setPayMode("total");
    setPayDialogOpen(true);
  }, [autoOpenPayment, paymentRemaining]);

  useEffect(() => {
    let cancelled = false;
    const loadInvoiceLedgerPaid = async () => {
      if (!ownerId) {
        if (!cancelled) {
          financeSetState("CreditCardInvoice", "invoiceLedgerPaid", { value: 0, reason: "missing owner" });
          setInvoiceLedgerPaid(0);
        }
        return;
      }
      financeFetchStart("CreditCardInvoice", "account_ledger", { cardId: card.id, cycleKey });
      const { data } = await supabase
        .from("account_ledger")
        .select("id, amount, occurred_on, wallet, metadata, created_at")
        .eq("user_id", ownerId)
        .eq("category", "expense")
        .order("occurred_on", { ascending: false });
      const rawRows = ((data as any[]) ?? []).filter((r) => {
        const m = r.metadata || {};
        return m.credit_card_id === card.id && m.cycle_key === cycleKey && m.kind === "credit_card_invoice_payment";
      });
      const paid = rawRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const cycleItems: CyclePaymentItem[] = rawRows.map((r) => ({
        id: r.id,
        amount: Number(r.amount) || 0,
        date: r.occurred_on,
        wallet: r.wallet === "cash" ? "cash" : "account",
        mode: r.metadata?.pay_mode || (r.metadata?.full_payment ? "total" : "partial"),
      }));
      if (!cancelled) {
        financeSetState("CreditCardInvoice", "invoiceLedgerPaid", { value: Number(paid.toFixed(2)), rows: rawRows.length });
        setCycleLedgerPayments(cycleItems);
        setInvoiceLedgerPaid(Number(paid.toFixed(2)));
        financeFetchSuccess("CreditCardInvoice", "account_ledger", { rows: rawRows.length, paid: Number(paid.toFixed(2)) });
      }
    };
    loadInvoiceLedgerPaid();
    const onChanged = () => {
      financeInvalidate("CreditCardInvoice", "account_ledger", { event: "ledger:changed" });
      loadInvoiceLedgerPaid();
    };
    window.addEventListener("ledger:changed", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("ledger:changed", onChanged);
    };
  }, [ownerId, card.id, cycleKey]);

  // Mantém a fatura do ciclo selecionado mesmo após o pagamento. Antes o modal
  // avançava automaticamente para a próxima fatura em aberto e isso fazia um
  // pagamento total recém-registrado parecer ter virado parcial de outro ciclo.
  useEffect(() => {
    setCycleOffset(initialOffset);
  }, [initialOffset]);




  // Limite disponível = limite total - (despesas pendentes do cartão + saldos iniciais de
  // faturas em aberto). Reflete tudo que ainda foi gasto e não pago neste cartão.
  const pendingTotal = useMemo(() => {
    const paidCycleKeys = new Set(
      openings
        .filter((o) => o.cardId === card.id && /\[PAGA\]/i.test(o.notes ?? ""))
        .map((o) => o.cycleKey),
    );
    // Dívida total em aberto do cartão: soma por ciclo (cada despesa em um único
    // ciclo), ignorando ciclos já quitados. Usa o mesmo vínculo cartão↔despesa.
    const expensesPending = expandedExpenses
      .filter((e) => isCreditCardExpense(e))
      .filter((e) => matchCardLink(e, card) !== "other")
      .filter((e) => !e.paid && !paidCycleKeys.has(cycleKeyForDate(e.dueDate, card.closingDay)))
      .reduce((s, e) => s + invoiceItemValue(e), 0);
    const openingsPending = openings
      .filter((o) => o.cardId === card.id)
      .reduce((s, o) => {
        const paid = readPaidOverride(o.notes) ?? (/\[PAGA\]/i.test(o.notes ?? "") ? Number(o.openingAmount ?? 0) : 0);
        const pending = Math.max(0, Number(o.openingAmount ?? 0) - Math.min(Number(o.openingAmount ?? 0), paid));
        return s + pending;
      }, 0);
    return expensesPending + openingsPending;
  }, [expandedExpenses, openings, cardTag, card.id]);

  const utilization = card.creditLimit > 0 ? Math.min(100, (pendingTotal / card.creditLimit) * 100) : 0;
  const available = Math.max(0, card.creditLimit - pendingTotal);

  // "Melhor dia de compra" = dia seguinte ao fechamento
  const bestPurchaseDay = ((card.closingDay % 31) + 1);

  // Status da fatura
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isClosed = today > cycle.to;
  const isOverdue = isClosed && today > cycle.dueDate && total > 0;
  const daysToDue = Math.ceil((cycle.dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Fatura quitada: existe ao menos um item ou saldo inicial registrado, todos pagos.
  // Usamos uma marca "[PAGA]" no campo notes do opening para preservar a informação
  // de "fatura quitada" mesmo após zerar o saldo inicial.
  const cycleHasPending = remainingTotal > 0.005;
  const cycleEverHadValue = items.length > 0 || openingAmount > 0 || openingPaidFlag || paidOverride !== null;
  const isPaid = cycleEverHadValue && !cycleHasPending;

  // Histórico de pagamentos: faturas pagas deste cartão nos últimos 24 meses,
  // incluindo a fatura aberta quando ela já possui pagamento registrado.
  const paymentHistory = useMemo(() => {
    const today = new Date();
    const fromD = new Date(today.getFullYear(), today.getMonth() - 24, 1);
    const toD = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const fromISO = `${fromD.getFullYear()}-${String(fromD.getMonth() + 1).padStart(2, "0")}-${String(fromD.getDate()).padStart(2, "0")}`;
    const toISO = `${toD.getFullYear()}-${String(toD.getMonth() + 1).padStart(2, "0")}-${String(toD.getDate()).padStart(2, "0")}`;
    return listPaidInvoicesInRange(expenses, [card], openings, fromISO, toISO)
      .sort((a, b) => (a.paidDate < b.paidDate ? 1 : -1));
  }, [expenses, openings, card]);

  const status: { label: string; tone: string; icon: typeof Clock } = isPaid
    ? { label: isClosed ? "Fechada — Paga" : "Paga", tone: "bg-success/15 text-success border-success/30", icon: CheckCircle2 }
    : isOverdue
    ? { label: "Em atraso", tone: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertTriangle }
    : paidTotal > 0.005
    ? { label: "Pagamento parcial", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30", icon: Clock }
    : isClosed
    ? { label: "Fechada — aguardando pagamento", tone: "bg-warning/15 text-warning border-warning/30", icon: Clock }
    : !cycleEverHadValue
    ? { label: "Sem lançamentos", tone: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 }
    : { label: "Em aberto", tone: "bg-primary/15 text-primary border-primary/30", icon: Sparkles };

  const StatusIcon = status.icon;

  // Swipe-down to close (mobile only)
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // FLIP transition state: "enter" → "open" → "exit"
  const [phase, setPhase] = useState<"enter" | "open" | "exit">(originRect ? "enter" : "open");
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  // Compute origin transform that places the panel exactly on top of the source mini-card.
  const originTransform = useMemo(() => {
    if (!originRect || typeof window === "undefined") return undefined;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scaleX = originRect.width / vw;
    const scaleY = originRect.height / vh;
    // Translate to the card's top-left, then scale down from the top-left origin.
    return `translate(${originRect.left}px, ${originRect.top}px) scale(${scaleX}, ${scaleY})`;
  }, [originRect]);

  // Border radius transitions from the mini-card (12px) to fullscreen (0) for smoothness.
  const panelRadius = phase === "open" ? 0 : 16;

  // Run the entrance animation on mount.
  // useLayoutEffect ensures the initial transform paints before we transition to "open".
  useLayoutEffect(() => {
    if (phase !== "enter") return;
    // Force a synchronous reflow so the initial transform commits before transitioning.
    if (cardRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      cardRef.current.getBoundingClientRect();
    }
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => setPhase("open"));
      (window as any).__cardR2 = r2;
    });
    return () => cancelAnimationFrame(r1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle close: if mobile and we have an origin rect, animate back; else close immediately.
  const handleClose = () => {
    if (!originRect || !isMobile) {
      onClose();
      return;
    }
    setDragY(0);
    setPhase("exit");
    window.setTimeout(onClose, 300);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    if ((cardRef.current?.scrollTop ?? 0) > 0) return;
    touchStartY.current = e.touches[0].clientY;
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    setDragY(delta > 0 ? delta : 0);
  };

  const onTouchEnd = () => {
    if (touchStartY.current == null) return;
    if (dragY > 120) {
      handleClose();
    } else {
      setDragY(0);
    }
    touchStartY.current = null;
    setDragging(false);
  };

  // Build the panel transform based on phase + drag.
  const panelTransform = (() => {
    if (phase === "enter" && originTransform) return originTransform;
    if (phase === "exit" && originTransform) return originTransform;
    if (dragY > 0) return `translateY(${dragY}px)`;
    return "translate(0,0) scale(1,1)";
  })();

  // Backdrop opacity follows phase + drag.
  const backdropOpacity = (() => {
    if (phase === "enter" || phase === "exit") return 0;
    if (dragY > 0) return Math.max(0.3, 1 - dragY / 500);
    return 1;
  })();

  // Lock body scroll while the panel is mounted (prevents background scrolling on mobile).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleConfirmInvoicePayment() {
    setPaying(true);
    try {
      const parsedAmount = parseCurrencyInput(payAmount);
      const amount = Math.max(0, Number(parsedAmount.toFixed(2)));
      if (!Number.isFinite(parsedAmount) || amount <= 0) {
        toast.error("Informe um valor válido maior que zero");
        setPaying(false);
        return;
      }
      if (amount > paymentRemaining + 0.005) {
        toast.error(`O valor não pode ser superior ao saldo restante (${mask(fmt(paymentRemaining))})`);
        setPaying(false);
        return;
      }

      // Se o usuário escolheu "total" OU o valor digitado quita a fatura restante:
      const isFull = payMode === "total" || amount >= paymentRemaining - 0.005;

      const newPaidTotal = isFull && payMode === "total"
        ? Number(amount.toFixed(2))
        : Number((paidTotal + amount).toFixed(2));
      const newInvoiceTotal = isFull && payMode === "total" ? Number(amount.toFixed(2)) : total;

      let ledgerPaid = invoiceLedgerPaid;
      if (ownerId) {
        const { data: ledgerRows } = await supabase
          .from("account_ledger")
          .select("amount, metadata")
          .eq("user_id", ownerId)
          .eq("category", "expense");
        ledgerPaid = ((ledgerRows as any[]) ?? [])
          .filter((r) => {
            const m = r.metadata || {};
            return m.credit_card_id === card.id && m.cycle_key === cycleKey && m.kind === "credit_card_invoice_payment";
          })
          .reduce((s, r) => s + (Number(r.amount) || 0), 0);
      }
      const ledgerAmount = Number(amount.toFixed(2));

      if (ledgerAmount > 0.005) {
        try {
          await recordLedger({
            direction: "out",
            category: "expense",
            amount: ledgerAmount,
            description: `Pagamento fatura ${card.nickname || brandLabel(card.bank)}`,
            occurred_on: payDate,
            source: "auto",
            wallet: payWallet,
            metadata: {
              credit_card_id: card.id,
              cycle_key: cycleKey,
              kind: "credit_card_invoice_payment",
              pay_mode: isFull ? "total" : "partial",
              full_payment: isFull,
            },
            syncBalance: false,
          });
          setInvoiceLedgerPaid(Number((ledgerPaid + ledgerAmount).toFixed(2)));
        } catch {
          toast.error("Não foi possível debitar a conta. Pagamento cancelado.");
          setPaying(false);
          return;
        }
      }

      // Limpa marcadores antigos para reescrever de forma idempotente.
      const cleanedNotes = (opening?.notes ?? "")
        .replace(/\[PAGA\]/gi, "")
        .replace(/\[LEDGER\]/gi, "")
        .replace(/\[PAID_DATE:\d{4}-\d{2}-\d{2}\]/gi, "")
        .replace(/\[PAID:[0-9]+(?:\.[0-9]+)?\]/gi, "")
        .replace(/\[TOTAL:[0-9]+(?:\.[0-9]+)?\]/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      if (isFull) {
        // Marca todos os itens do ciclo como pagos.
        const unpaid = items.filter((e) => !e.paid);
        for (const e of unpaid) {
          if (e.isVirtualInstallment) {
            const realId = String(e.id).split("::virt::")[0];
            await payExpense(realId, true, payDate, e.amount);
          } else {
            await updateExpense(e.id, { paid: true, paidDate: payDate });
          }
        }
        // Override de total + paid = amount real informado pelo usuário.
        let notes = writeTotalOverride(cleanedNotes, newInvoiceTotal);
        notes = writePaidOverride(notes, newInvoiceTotal);
        notes = `${notes ? notes + " " : ""}[PAGA] [LEDGER] [PAID_DATE:${payDate}]`.trim();
        await upsertOpening(card.id, cycleKey, openingAmount, notes);
      } else {
        // Parcial: mantém o total original, apenas acumula valor pago.
        let notes = writePaidOverride(cleanedNotes, newPaidTotal);
        notes = `${notes ? notes + " " : ""}[LEDGER] [PAID_DATE:${payDate}]`.trim();
        await upsertOpening(card.id, cycleKey, openingAmount, notes);
      }

      window.dispatchEvent(new CustomEvent("ledger:changed"));
      toast.success(isFull ? `Fatura quitada · ${mask(fmt(amount))}` : `Pagamento parcial registrado · ${mask(fmt(amount))}`);
      setPayDialogOpen(false);
    } catch {
      toast.error("Erro ao pagar fatura");
    } finally {
      setPaying(false);
    }
  }


  const content = (
    <div
      className="fixed inset-0 z-[2147483647] flex items-stretch sm:items-center justify-center p-0 sm:p-4 overscroll-contain"
      style={{ height: "100dvh" }}
      onClick={(e) => {
        if (!isMobile && e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Backdrop — fully opaque on mobile so nothing behind leaks through. */}
      <div
        className="absolute inset-0 bg-background sm:bg-foreground/50 sm:backdrop-blur-md pointer-events-none"
        style={{
          opacity: isMobile ? 1 : backdropOpacity,
          transition: dragging ? "none" : "opacity 300ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
      <Card
        ref={cardRef}
        no3d
        className={`relative w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-2xl border-0 sm:border p-0 will-change-transform bg-background ${
          phase === "open" ? "overflow-y-auto rounded-none" : "overflow-hidden"
        }`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: panelTransform,
          transformOrigin: "top left",
          borderRadius: isMobile && phase !== "open" ? `${panelRadius}px` : undefined,
          transition: dragging
            ? "none"
            : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* Drag handle (mobile only) */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 sticky top-0 z-20 bg-transparent pointer-events-none">
          <div className="h-1.5 w-10 rounded-full bg-white/40" />
        </div>
        {/* HERO — Cartão visual estilo app real */}
        <div className={`${bank.gradient} ${bank.textClass} relative overflow-hidden`}>
          {/* glows */}
          <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-black/25 blur-3xl" />

          {/* Top bar: bank + close */}
          <div className="relative flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="h-5 w-5 opacity-95" />
              <div>
                <p className="text-[11px] opacity-80 leading-none">Fatura</p>
                <p className="font-bold text-base leading-tight">{bank.name}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className={`${bank.textClass} hover:bg-white/15`}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Card meta */}
          <div className="relative px-5 mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-9 rounded-md bg-gradient-to-br from-[hsl(45,90%,75%)] to-[hsl(40,80%,50%)] shadow-inner border border-[hsl(45,90%,80%)]/40" />
              <Wifi className="h-3.5 w-3.5 rotate-90 opacity-80" />
            </div>
            <div className="text-right">
              <p className="font-mono text-xs opacity-95 tracking-[0.2em]">
                •••• {card.lastFour || "0000"}
              </p>
              <p className="text-[10px] italic font-bold tracking-wider opacity-90">
                {brandLabel(card.brand)}
              </p>
            </div>
          </div>

          {/* Cycle nav */}
          <div className="relative flex items-center justify-between gap-2 px-3 mt-4">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${bank.textClass} hover:bg-white/15`}
              onClick={() => setCycleOffset((o) => o - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider opacity-75">Vencimento</p>
              <p className="text-sm font-semibold capitalize">
                {format(cycle.dueDate, "MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${bank.textClass} hover:bg-white/15`}
              onClick={() => setCycleOffset((o) => o + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Total / Pendente */}
          <div className="relative px-5 pt-4 pb-5 text-center">
            <p className="text-[11px] uppercase tracking-wider opacity-75">
              {paidTotal > 0.005 && !isPaid ? "Valor pendente da fatura" : "Valor total da fatura"}
            </p>
            <p className="text-4xl font-bold mt-1 tracking-tight">
              {mask(fmt(paidTotal > 0.005 && !isPaid ? paymentRemaining : total))}
            </p>
            {paidTotal > 0.005 && !isPaid && (
              <p className="text-xs opacity-85 mt-1 font-medium">
                Total: {mask(fmt(total))} · Pago: {mask(fmt(paidTotal))}
              </p>
            )}

            {/* Status pill */}
            <div className="mt-3 flex justify-center">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${status.tone}`}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
                {!isOverdue && !isClosed && daysToDue >= 0 && total > 0 && (
                  <span className="opacity-80">· vence em {daysToDue}d</span>
                )}
              </span>
            </div>

            {/* Valor pago da fatura */}
            <div className="mt-2 flex justify-center">
              <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-white/15 border border-white/25">
                <span className="opacity-80">Valor pago da fatura</span>
                <span className="font-semibold tabular-nums">{mask(fmt(paidTotal))}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditPaidValue(paidTotal > 0 ? paidTotal.toFixed(2) : "");
                    setEditPaidOpen(true);
                  }}
                  className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                  aria-label="Editar valor pago da fatura"
                  title="Editar valor pago"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              </span>
            </div>


            {card.creditLimit > 0 && (
              <div className="mt-4 mx-auto max-w-sm">
                <div className="flex items-center justify-between text-[11px] opacity-90 mb-1.5">
                  <span>Limite disponível</span>
                  <span className="font-semibold">{mask(fmt(available))}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-white/90 rounded-full transition-all"
                    style={{ width: `${Math.min(100, utilization)}%` }}
                  />
                </div>
                <p className="text-[10px] opacity-75 mt-1">
                  {utilization.toFixed(0)}% de {mask(fmt(card.creditLimit))} utilizado
                </p>
              </div>
            )}
          </div>
        </div>

        <CardContent
          className="space-y-4 pt-5 px-4 sm:px-6 pb-6"
          style={{
            opacity: phase === "open" ? 1 : 0,
            transform: phase === "open" ? "translateY(0)" : "translateY(12px)",
            transition: "opacity 240ms ease-out 160ms, transform 280ms cubic-bezier(0.22,1,0.36,1) 160ms",
          }}
        >
          {/* Quick stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border bg-card p-3 text-center">
              <CalendarDays className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fechamento</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {format(cycle.to, "dd/MM", { locale: ptBR })}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <CalendarClock className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vencimento</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {format(cycle.dueDate, "dd/MM", { locale: ptBR })}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <Sparkles className="h-4 w-4 mx-auto text-success mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Melhor compra</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">dia {bestPurchaseDay}</p>
            </div>
          </div>

          {/* Pagar fatura */}
          {(() => {
            const remaining = paymentRemaining;
            if (remaining <= 0.005) return null;
            return (
              <div className="space-y-3">
                <Button
                  onClick={() => {
                    setPayAmount(remaining.toFixed(2).replace(".", ","));
                    setPayMode("total");

                    setPayDialogOpen((open) => !open);
                  }}
                  className="w-full h-11 text-sm font-semibold shadow-md"
                  size="lg"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Pagar fatura · {mask(fmt(remaining))}
                </Button>

                {payDialogOpen && (
                  <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Pagar fatura</p>
                        <p className="text-xs text-muted-foreground">Debita a conta e registra no histórico.</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPayDialogOpen(false)}>
                        <X className="w-[25px] h-[25px]" />
                      </Button>
                    </div>

                    <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Compras do ciclo</span>
                        <span className="font-medium text-foreground">{mask(fmt(transactionsTotal))}</span>
                      </div>
                      {openingAmount > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Saldo inicial</span>
                          <span className="font-medium text-foreground">{mask(fmt(openingAmount))}</span>
                        </div>
                      )}
                      <div className="h-px bg-border/60 my-1" />
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">Total da fatura</span>
                        <span className="font-semibold text-foreground">{mask(fmt(total))}</span>
                      </div>
                      {paidTotal > 0.005 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Já pago</span>
                          <span className="font-medium text-success">{mask(fmt(paidTotal))}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">Restante</span>
                        <span className="font-semibold text-primary">{mask(fmt(remaining))}</span>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="pay-amount-inline">Valor a pagar (R$)</Label>
                        {/*
                          BUGFIX: antes este input era type="number", que descarta
                          silenciosamente a vírgula. Como o campo é pré-preenchido
                          em formato com ponto e o usuário edita em formato BR
                          (vírgula), isso já causou pagamento de um valor
                          completamente diferente do digitado, sem qualquer aviso.
                          Agora aceitamos edição livre (apenas dígitos, vírgula e
                          ponto) e mostramos abaixo o valor interpretado em BRL
                          para confirmação visual antes da confirmação.
                        */}
                        <Input
                          id="pay-amount-inline"
                          type="text"
                          inputMode="decimal"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                        />
                        {(() => {
                          const parsed = parseCurrencyInput(payAmount);
                          const valid = Number.isFinite(parsed) && parsed > 0;
                          const exceeds = valid && parsed > remaining + 0.005;
                          if (!payAmount) return null;
                          if (!valid) return <p className="text-[11px] text-destructive leading-snug">Valor inválido</p>;
                          if (exceeds) return <p className="text-[11px] text-destructive leading-snug">O valor não pode ser superior ao restante ({mask(fmt(remaining))})</p>;
                          return (
                            <p className="text-[11px] leading-snug text-muted-foreground">
                              {`Valor interpretado: ${mask(fmt(parsed))} · Restante após pagamento: ${mask(fmt(Math.max(0, remaining - parsed)))}`}
                            </p>
                          );
                        })()}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pay-date-inline">Data do pagamento</Label>
                        <DatePickerField value={payDate} onChange={setPayDate} id="pay-date-inline" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Tipo de pagamento</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant={payMode === "total" ? "default" : "outline"} size="sm" onClick={() => { setPayMode("total"); setPayAmount(remaining.toFixed(2).replace(".", ",")); }} className="h-9">Total</Button>
                        <Button type="button" variant={payMode === "partial" ? "default" : "outline"} size="sm" onClick={() => setPayMode("partial")} className="h-9">Parcial</Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {payMode === "total"
                          ? "Quita a fatura. O valor informado passa a ser o total real (substitui a prévia)."
                          : "Acumula como pagamento parcial. A fatura continua em aberto pelo restante."}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Conta de origem</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant={payWallet === "account" ? "default" : "outline"} size="sm" onClick={() => setPayWallet("account")} className="h-9">Conta</Button>
                        <Button type="button" variant={payWallet === "cash" ? "default" : "outline"} size="sm" onClick={() => setPayWallet("cash")} className="h-9">Dinheiro</Button>
                      </div>
                    </div>

                    {/* Resumo da confirmação antes de efetivar */}
                    {(() => {
                      const parsedPay = parseCurrencyInput(payAmount);
                      const valid = Number.isFinite(parsedPay) && parsedPay > 0 && parsedPay <= remaining + 0.005;
                      if (!valid) return null;
                      const isFullPay = payMode === "total" || parsedPay >= remaining - 0.005;
                      const remainingAfter = Math.max(0, Number((remaining - parsedPay).toFixed(2)));
                      return (
                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Tipo de pagamento:</span>
                            <Badge variant="outline" className={`text-[10px] py-0 ${isFullPay ? "bg-success/15 text-success border-success/30" : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"}`}>
                              {isFullPay ? "Quitação Total da Fatura" : "Pagamento Parcial"}
                            </Badge>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-semibold text-foreground">Valor a debitar:</span>
                            <span className="font-bold text-primary">{mask(fmt(parsedPay))}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Saldo restante após pagamento:</span>
                            <span className={`font-semibold ${remainingAfter <= 0.005 ? "text-success font-bold" : "text-foreground"}`}>
                              {remainingAfter <= 0.005 ? "Fatura quitada (R$ 0,00)" : mask(fmt(remainingAfter))}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Conta / Data:</span>
                            <span className="font-medium text-foreground">{payWallet === "account" ? "Conta Corrente" : "Dinheiro"} · {formatDateBR(payDate, "dd/MM/yyyy")}</span>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex gap-2 justify-end pt-1">
                      <Button variant="outline" onClick={() => setPayDialogOpen(false)} disabled={paying}>Cancelar</Button>
                      {(() => {
                        const parsedPay = parseCurrencyInput(payAmount);
                        const invalid =
                          paying ||
                          !payDate ||
                          !payAmount ||
                          !Number.isFinite(parsedPay) ||
                          parsedPay <= 0 ||
                          parsedPay > remaining + 0.005;
                        return (
                          <Button data-mutation disabled={invalid} onClick={handleConfirmInvoicePayment} className="gap-1.5 font-semibold">
                            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            {paying ? "Processando..." : "Confirmar e Pagar Fatura"}
                          </Button>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {prevTotal > 0 && (
            <div className="rounded-xl border bg-muted/30 px-3 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground">Fatura anterior</p>
                <p className="text-sm font-medium text-foreground">{mask(fmt(prevTotal))}</p>
              </div>
              {(() => {
                const diff = total - prevTotal;
                const pct = prevTotal > 0 ? (diff / prevTotal) * 100 : 0;
                const up = diff > 0;
                return (
                  <Badge
                    variant="secondary"
                    className={up ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}
                  >
                    {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
                  </Badge>
                );
              })()}
            </div>
          )}

          {cycleOffset !== 0 && (
            <div className="flex items-center gap-2 text-[11px] rounded-md bg-warning/10 border border-warning/30 text-warning-foreground px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {cycleOffset < 0
                ? "Você está vendo uma fatura passada. Edições afetam o histórico."
                : "Você está vendo uma fatura futura. Confira os valores antes de salvar."}
            </div>
          )}

          {/* Opening (saldo inicial) */}
          {opening ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-sm font-medium text-foreground truncate">
                    Saldo inicial da fatura
                  </p>
                </div>
                {opening.notes && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {opening.notes}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <p className="text-sm font-semibold text-foreground">{mask(fmt(openingAmount))}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditingOpening(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setEditingOpening(true)}
            >
              <Receipt className="h-4 w-4 mr-1.5" />
              Adicionar fatura do mês (saldo inicial)
            </Button>
          )}

          {/* Histórico recente / Lançamentos */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Transações ({items.length})
              </p>
              <p className="text-[11px] text-muted-foreground">
                {format(cycle.from, "dd/MM", { locale: ptBR })} —{" "}
                {format(cycle.to, "dd/MM", { locale: ptBR })}
              </p>
            </div>

            <div className="space-y-1.5">
              {items.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-xl">
                  Nenhum lançamento neste período.
                  <p className="text-xs mt-2 max-w-sm mx-auto px-4">
                    Marque a forma de pagamento como "Crédito" e mencione "
                    {card.nickname || card.lastFour}" nas observações.
                  </p>
                </div>
              ) : (
                items.map((e) => {
                  const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
                  const value = isRec ? e.amount / e.installments! : e.amount;
                  const realId = e.isVirtualInstallment ? String(e.id).split("::virt::")[0] : e.id;
                  const realExpense = expenses.find((x) => x.id === realId) ?? e;
                  const installmentLabel = e.isVirtualInstallment && realExpense.installments
                    ? `${e.virtualInstallmentNumber}/${realExpense.installments}`
                    : e.recurrenceType === "after_payment"
                    ? "recorrente"
                    : isRec && e.installments !== 999
                    ? `${e.installments}x`
                    : null;
                  return (
                    <div
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditingExpense(realExpense)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setEditingExpense(realExpense);
                        }
                      }}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl border bg-card hover:bg-muted/40 active:bg-muted/60 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Editar despesa ${e.description}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {e.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] py-0 h-4">
                            {e.category}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(e.dueDate + "T00:00:00"), "dd/MM", { locale: ptBR })}
                          </span>
                          {installmentLabel && (
                            <span className="text-[11px] text-muted-foreground">
                              {installmentLabel}
                            </span>
                          )}
                          {e.isVirtualInstallment && (
                            <Badge variant="outline" className="text-[10px] py-0 h-4">
                              Prevista
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <p className="text-sm font-semibold text-foreground">{mask(fmt(value))}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setEditingExpense(realExpense);
                          }}
                          aria-label="Editar lançamento"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setDeletingExpense(realExpense);
                          }}
                          aria-label="Excluir lançamento"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Histórico de pagamentos de faturas */}
          <div className="mt-2 space-y-4">
            {/* Pagamentos da fatura atual */}
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Pagamentos desta fatura ({cycleLedgerPayments.length})
                </p>
                <p className="text-[11px] text-muted-foreground">Ciclo atual</p>
              </div>

              {cycleLedgerPayments.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded-xl">
                  Nenhum pagamento registrado nesta fatura ainda.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {cycleLedgerPayments.map((p) => {
                    const paidDateObj = new Date(p.date + "T00:00:00");
                    const isTotalMode = p.mode === "total";
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 p-3 rounded-xl border bg-card"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground">
                              {isTotalMode ? "Pagamento Total" : "Pagamento Parcial"}
                            </p>
                            <Badge
                              variant="outline"
                              className={
                                isTotalMode
                                  ? "text-[10px] py-0 h-4 bg-success/15 text-success border-success/30"
                                  : "text-[10px] py-0 h-4 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                              }
                            >
                              {isTotalMode ? "Quitação" : "Parcial"}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] py-0 h-4">
                              {p.wallet === "cash" ? "Dinheiro" : "Conta"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-muted-foreground">
                              Pago em {format(paidDateObj, "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground tabular-nums">
                              {mask(fmt(p.amount))}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingCyclePayment(p)}
                            aria-label="Estornar pagamento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Faturas de outros ciclos */}
            {paymentHistory.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Faturas anteriores ({paymentHistory.length})
                  </p>
                  <p className="text-[11px] text-muted-foreground">Últimos 24 meses</p>
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {paymentHistory.map((p) => {
                    const [cy, cm] = p.cycleKey.split("-").map(Number);
                    const cycleLabel = format(new Date(cy, (cm ?? 1) - 1, 1), "MMM/yy", { locale: ptBR });
                    const paid = new Date(p.paidDate + "T00:00:00");
                    const due = new Date(p.dueDate + "T00:00:00");
                    const partial = p.paidTotal + 0.01 < p.total;
                    return (
                      <div
                        key={`${p.cycleKey}-${p.paidDate}`}
                        className="flex items-center justify-between gap-2 p-3 rounded-xl border bg-card"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground capitalize">
                              Fatura {cycleLabel}
                            </p>
                            <Badge
                              variant="outline"
                              className={
                                partial
                                  ? "text-[10px] py-0 h-4 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                  : "text-[10px] py-0 h-4 bg-success/15 text-success border-success/30"
                              }
                            >
                              {partial ? "Pago parcial" : "Pago"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-muted-foreground">
                              Pago em {format(paid, "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              · Venc. {format(due, "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground tabular-nums">
                              {mask(fmt(p.paidTotal))}
                            </p>
                            {partial && (
                              <p className="text-[10px] text-muted-foreground tabular-nums">
                                de {mask(fmt(p.total))}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingPayment(p)}
                            aria-label="Excluir pagamento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {editingOpening && (
        <CreditCardOpeningDialog
          open={editingOpening}
          onOpenChange={setEditingOpening}
          cardName={card.nickname || bank.name}
          cycleLabel={format(cycle.dueDate, "MMMM/yy", { locale: ptBR })}
          initialAmount={openingAmount}
          initialNotes={opening?.notes ?? null}
          creditLimit={card.creditLimit}
          transactionsTotal={transactionsTotal}
          onSave={async (amount, notes) => {
            await upsertOpening(card.id, cycleKey, amount, notes);
          }}
        />
      )}

      <ExpenseEditDialog
        open={!!editingExpense}
        onOpenChange={(v) => !v && setEditingExpense(null)}
        expense={editingExpense}
        warning={
          cycleOffset !== 0
            ? cycleOffset < 0
              ? "Esta despesa pertence a uma fatura passada."
              : "Esta despesa pertence a uma fatura futura."
            : null
        }
        onSave={async (patch) => {
          if (!editingExpense) return;
          await updateExpense(editingExpense.id, {
            description: patch.description,
            amount: patch.amount,
            dueDate: patch.dueDate,
            category: patch.category,
            notes: patch.notes ?? undefined,
          });
          toast.success("Lançamento atualizado");
        }}
      />

      <ConfirmDeleteDialog
        open={!!deletingExpense}
        onOpenChange={(v) => !v && setDeletingExpense(null)}
        title="Excluir lançamento da fatura?"
        description={
          deletingExpense?.type === "recorrente" &&
          (deletingExpense?.installments ?? 0) > 1
            ? `Este lançamento é parcelado (${deletingExpense.installments}x). A exclusão removerá a despesa inteira de todas as faturas.`
            : "Esta ação não pode ser desfeita."
        }
        onConfirm={async () => {
          if (!deletingExpense) return;
          await deleteExpense(deletingExpense.id);
          toast.success("Lançamento excluído");
          setDeletingExpense(null);
        }}
      />

      {/* Editar valor pago da fatura */}
      <Dialog open={editPaidOpen} onOpenChange={setEditPaidOpen}>
        <DialogContent className="sm:max-w-sm z-[2147483648]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Editar valor pago da fatura
            </DialogTitle>
            <DialogDescription>
              Ajuste o valor efetivamente pago desta fatura. Útil para registrar juros, descontos ou pagamentos parciais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="paid-value">Valor pago (R$)</Label>
              <Input
                id="paid-value"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={editPaidValue}
                onChange={(e) => setEditPaidValue(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Deixe vazio para voltar ao cálculo automático (soma dos lançamentos pagos).
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditPaidOpen(false)} disabled={savingPaid}>
              Cancelar
            </Button>
            <Button
              disabled={savingPaid}
              onClick={async () => {
                setSavingPaid(true);
                try {
                  const raw = editPaidValue.replace(",", ".").trim();
                  const parsed = raw === "" ? null : Number(raw);
                  if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
                    toast.error("Valor inválido");
                    setSavingPaid(false);
                    return;
                  }
                  const newNotes = writePaidOverride(opening?.notes, parsed);
                  const baseAmount = opening?.openingAmount ?? 0;
                  await upsertOpening(card.id, cycleKey, baseAmount, newNotes);
                  toast.success(parsed === null ? "Valor pago restaurado" : "Valor pago atualizado");
                  setEditPaidOpen(false);
                } catch {
                  toast.error("Erro ao salvar valor pago");
                } finally {
                  setSavingPaid(false);
                }
              }}
            >
              {savingPaid ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deletingPayment}
        onOpenChange={(o) => !o && !deletingPaymentBusy && setDeletingPayment(null)}
        title="Excluir pagamento da fatura?"
        description={
          deletingPayment
            ? `O valor de ${fmt(deletingPayment.paidTotal)} será estornado para a conta de origem, os lançamentos individuais voltarão como pendentes e a fatura ficará em aberto novamente.`
            : ""
        }
        onConfirm={() => deletingPayment && handleDeleteInvoicePayment(deletingPayment)}
      />

      <ConfirmDeleteDialog
        open={!!deletingCyclePayment}
        onOpenChange={(o) => !o && !deletingPaymentBusy && setDeletingCyclePayment(null)}
        title="Estornar pagamento da fatura?"
        description={
          deletingCyclePayment
            ? `O valor de ${fmt(deletingCyclePayment.amount)} será estornado para a conta de origem e o saldo restante da fatura será recalculado.`
            : ""
        }
        onConfirm={() => deletingCyclePayment && handleDeleteCyclePayment(deletingCyclePayment)}
      />
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(content, document.body)
    : content;
}
