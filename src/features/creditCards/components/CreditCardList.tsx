import React, { useState, useMemo, useRef } from "react";
import { Plus, CreditCard as CreditCardIcon, Wifi, Pencil, Trash2, Receipt, CheckCircle, EyeOff, RotateCcw, ChevronRight } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { emitAppUIEvent } from "@/lib/appUIEvents";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCreditCards, CreditCard } from "@/features/creditCards/hooks/useCreditCards";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useCreditCardOpenings, cycleKeyFromDate } from "@/features/creditCards/hooks/useCreditCardOpenings";
import {
  cycleKeyForDate,
  readPaidOverride,
  readTotalOverride,
  getCycleForDueMonth,
  belongsToCardInvoice,
  invoiceItemValue,
} from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { expandCreditCardExpenses } from "@/features/creditCards/lib/creditCardInstallments";
import { useHideValues } from "@/contexts/HideValuesContext";
import { getBank, brandLabel } from "@/features/creditCards/lib/creditCardBanks";
import { CreditCardForm } from "./CreditCardForm";
import { CreditCardInvoice } from "./CreditCardInvoice";
import { CreditCardOpeningDialog } from "./CreditCardOpeningDialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useFinanceComponentDebug } from "@/lib/financeDebug";
import { captureScroll } from "@/features/loans/lib/preserveScroll";

interface Props {
  readOnly?: boolean;
  /** YYYY-MM — when provided, opens the credit card invoice anchored to the cycle whose due date falls in this month. */
  referenceMonth?: string;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Returns cycle for a reference Date (today inside the cycle window). */
function getCycleForRef(ref: Date, closingDay?: number, dueDay?: number) {
  const safeRef = ref instanceof Date && !isNaN(ref.getTime()) ? ref : new Date();
  const safeClosing = Math.min(31, Math.max(1, Number(closingDay) || 1));
  const safeDue = Math.min(31, Math.max(1, Number(dueDay) || 10));
  const y = safeRef.getFullYear();
  const m = safeRef.getMonth();
  const day = safeRef.getDate();
  const closingThis = new Date(y, m, Math.min(safeClosing, new Date(y, m + 1, 0).getDate()));
  const closingNext =
    day >= safeClosing
      ? new Date(y, m + 1, Math.min(safeClosing, new Date(y, m + 2, 0).getDate()))
      : closingThis;
  const closingPrev =
    day >= safeClosing
      ? closingThis
      : new Date(y, m - 1, Math.min(safeClosing, new Date(y, m, 0).getDate()));
  const dueMonth = safeDue > safeClosing ? closingNext.getMonth() : closingNext.getMonth() + 1;
  const dueYear = closingNext.getFullYear();
  const dueDate = new Date(
    dueYear,
    dueMonth,
    Math.min(safeDue, new Date(dueYear, dueMonth + 1, 0).getDate())
  );
  return { from: closingPrev, to: closingNext, dueDate };
}

/** Returns the current billing cycle (from, to, dueDate) for a card. */
function getCurrentCycle(closingDay?: number, dueDay?: number) {
  return getCycleForRef(new Date(), closingDay, dueDay);
}


interface MiniCardProps {
  card: CreditCard;
  invoiceTotal: number;
  paidTotal: number;
  pendingTotal: number;
  cyclePendingTotal: number;
  openingAmount: number;
  hasOpening: boolean;
  hasActiveInvoice: boolean;
  hasUnpaidInvoice: boolean;
  dueDate: Date;
  onClick: (rect: DOMRect) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAddOpening?: () => void;
  onPayInvoice?: () => void;
  readOnly?: boolean;
}

const MiniCreditCard = React.forwardRef<HTMLDivElement, MiniCardProps>(({
  card,
  invoiceTotal = 0,
  paidTotal = 0,
  pendingTotal = 0,
  cyclePendingTotal = 0,
  openingAmount = 0,
  hasOpening = false,
  hasActiveInvoice = false,
  hasUnpaidInvoice = false,
  dueDate,
  onClick,
  onEdit,
  onDelete,
  onAddOpening,
  onPayInvoice,
  readOnly,
}, ref) => {
  const bank = getBank(card?.bank);
  const { mask } = useHideValues();
  const limit = Number(card?.creditLimit ?? 0);
  const available = Math.max(0, limit - Number(pendingTotal || 0));
  const validDueDate = dueDate instanceof Date && !isNaN(dueDate.getTime()) ? dueDate : new Date();
  const isPaid = (invoiceTotal || 0) > 0 && (cyclePendingTotal || 0) <= 0.005;
  const isOverdue =
    !isPaid &&
    (cyclePendingTotal || 0) > 0 &&
    validDueDate < new Date() &&
    format(validDueDate, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd");
  const isDueToday =
    !isPaid &&
    (cyclePendingTotal || 0) > 0 &&
    format(validDueDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onClick(rect);
  };

  return (
    <Card
      ref={ref}
      no3d
      className={`group relative overflow-hidden cursor-pointer hover:shadow-md transition-all duration-200 rounded-2xl border ${
        isOverdue
          ? "border-destructive/40 bg-destructive/[0.015]"
          : isDueToday
          ? "border-amber-500/40 bg-amber-500/[0.015]"
          : isPaid
          ? "border-emerald-500/30 bg-emerald-500/[0.015]"
          : "border-border/60 hover:border-primary/40 bg-card"
      }`}
      onClick={handleClick}
    >
      {/* Miniatura do Cartão */}
      <div className="p-3 pb-2">
        <div
          className={`${bank.gradient} ${bank.textClass} relative aspect-[1.8/1] w-full rounded-xl p-3 shadow-xs overflow-hidden flex flex-col justify-between`}
        >
          <div className="pointer-events-none absolute -top-5 -right-5 h-16 w-16 rounded-full bg-white/10 blur-lg" />
          
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1">
              <div className="h-4 w-5 rounded-xs bg-gradient-to-br from-[hsl(45,90%,75%)] to-[hsl(40,80%,50%)] border border-[hsl(45,90%,80%)]/40 shadow-xs" />
              <Wifi className="h-2.5 w-2.5 rotate-90 opacity-80" />
            </div>
            <span className="text-[10px] font-bold tracking-wide truncate max-w-[65%] text-right drop-shadow-xs">
              {bank.name}
            </span>
          </div>

          <div className="flex items-end justify-between">
            <span className="font-mono text-[10px] tracking-[0.15em] opacity-95 drop-shadow-xs">
              •••• {card.lastFour || "0000"}
            </span>
            <span className="text-[10px] font-bold italic opacity-95 drop-shadow-xs">
              {brandLabel(card.brand)}
            </span>
          </div>
        </div>
      </div>

      <CardContent className="p-3 pt-1 space-y-2.5">
        {/* Nome do cartão e Status */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-foreground truncate">
            {card.nickname || bank.name}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {isPaid ? (
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] py-0 px-1.5 h-4">
                Paga
              </Badge>
            ) : isOverdue ? (
              <Badge variant="destructive" className="text-[9px] py-0 px-1.5 h-4">
                Atrasada
              </Badge>
            ) : isDueToday ? (
              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[9px] py-0 px-1.5 h-4">
                Hoje
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">
                Aberta
              </Badge>
            )}

            {!readOnly && (
              <div
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <RowActions
                  actions={[
                    { label: "Editar", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => onEdit?.() },
                    { label: "Excluir", icon: <Trash2 className="h-3.5 w-3.5" />, destructive: true, onClick: () => onDelete?.() },
                  ]}
                />
              </div>
            )}
          </div>
        </div>

        {/* Informações financeiras */}
        <div className="space-y-1 bg-muted/30 p-2 rounded-xl border border-border/40">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">Fatura</span>
            <span className="text-xs sm:text-sm font-extrabold text-foreground tabular-nums">
              {mask(fmt(invoiceTotal))}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2 text-[10px]">
            <span className="text-muted-foreground">Disponível</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {mask(fmt(available))}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 text-[9px] text-muted-foreground pt-0.5 border-t border-border/30">
            <span>Vence {format(validDueDate, "dd/MM", { locale: ptBR })}</span>
            <span>Limite {mask(fmt(Number(card?.creditLimit ?? 0)))}</span>
          </div>
        </div>

        {/* Botão de Ação Rápida */}
        {!readOnly && (
          <div className="pt-0.5">
            <Button
              variant={cyclePendingTotal > 0 ? "default" : "outline"}
              size="sm"
              className="w-full h-7 text-[11px] rounded-lg shadow-xs"
              onClick={(e) => {
                e.stopPropagation();
                if (cyclePendingTotal > 0 && onPayInvoice) {
                  onPayInvoice();
                } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onClick(rect);
                }
              }}
            >
              {cyclePendingTotal > 0 ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" /> Pagar Fatura
                </>
              ) : (
                <>
                  <Receipt className="h-3 w-3 mr-1" /> Ver Detalhes
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

MiniCreditCard.displayName = "MiniCreditCard";

export function CreditCardList({ readOnly = false, referenceMonth }: Props) {
  useFinanceComponentDebug("CreditCardList");
  const { mask } = useHideValues();
  const { cards: allCards, loading, addCard, updateCard, deleteCard } = useCreditCards();
  const cards = useMemo(() => allCards.filter((c) => c.active !== false), [allCards]);
  const inactiveCards = useMemo(() => allCards.filter((c) => c.active === false), [allCards]);
  const { expenses } = useExpenses();
  const { openings, getOpening, upsertOpening } = useCreditCardOpenings();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [deleting, setDeleting] = useState<CreditCard | null>(null);
  const [invoiceCard, setInvoiceCard] = useState<CreditCard | null>(null);
  const [invoiceOriginRect, setInvoiceOriginRect] = useState<DOMRect | null>(null);
  const [invoiceAutoOpenPayment, setInvoiceAutoOpenPayment] = useState(false);
  const [openingCard, setOpeningCard] = useState<CreditCard | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [showAllMobile, setShowAllMobile] = useState(false);
  const restoreAfterInvoiceCloseRef = useRef<(() => void) | null>(null);
  const restoreAfterFormCloseRef = useRef<(() => void) | null>(null);

  const openInvoice = (card: CreditCard, rect: DOMRect) => {
    restoreAfterInvoiceCloseRef.current = captureScroll();
    setInvoiceOriginRect(rect);
    setInvoiceAutoOpenPayment(false);
    setInvoiceCard(card);
  };

  const openInvoicePayment = (card: CreditCard) => {
    restoreAfterInvoiceCloseRef.current = captureScroll();
    setInvoiceOriginRect(null);
    setInvoiceAutoOpenPayment(true);
    setInvoiceCard(card);
  };

  const restoreAfterInvoiceClose = () => {
    const restore = restoreAfterInvoiceCloseRef.current;
    restoreAfterInvoiceCloseRef.current = null;
    restore?.();
  };

  const restoreAfterFormClose = () => {
    const restore = restoreAfterFormCloseRef.current;
    restoreAfterFormCloseRef.current = null;
    restore?.();
  };

  const handleNew = () => {
    restoreAfterFormCloseRef.current = captureScroll();
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (card: CreditCard) => {
    restoreAfterFormCloseRef.current = captureScroll();
    setEditing(card);
    setShowForm(true);
  };

  // Compute current invoice total per card (transactions + opening)
  const invoiceByCard = useMemo(() => {
    const map = new Map<
      string,
      {
        transactions: number;
        opening: number;
        total: number;
        paidTotal: number;
        pendingTotal: number;
        cyclePendingTotal: number;
        dueDate: Date;
        cycleKey: string;
        openingNotes: string | null;
        hasOpening: boolean;
        unpaidExpenseIds: string[];
        cycleUnpaidExpenseIds: string[];
      }
    >();
    const expandedAll = expandCreditCardExpenses(expenses);
    const installmentValue = (e: typeof expandedAll[number]) => {
      const isRec = e.type === "recorrente" && !!e.installments && e.installments > 1;
      return isRec ? e.amount / e.installments! : e.amount;
    };
    cards.forEach((card) => {
      const baseCycle = referenceMonth
        ? (getCycleForDueMonth(referenceMonth, card.closingDay, card.dueDay) ??
           getCurrentCycle(card.closingDay, card.dueDay))
        : getCurrentCycle(card.closingDay, card.dueDay);

      const paidCycleKeys = new Set(
        openings
          .filter((o) => o.cardId === card.id && /\[PAGA\]/i.test(o.notes ?? ""))
          .map((o) => o.cycleKey),
      );

      const cardExpenses = expandedAll
        .filter((e) => e.scope === "personal")
        .filter((e) => belongsToCardInvoice(e, card, new Date(0), new Date(8640000000000000)));

      const expensesPending = cardExpenses
        .filter((e) => !e.paid && !paidCycleKeys.has(cycleKeyForDate(e.dueDate, card.closingDay)))
        .reduce((s, e) => s + invoiceItemValue(e), 0);
      const openingsPending = openings
        .filter((o) => o.cardId === card.id)
        .reduce((s, o) => {
          const openingAmount = Number(o.openingAmount ?? 0);
          const paid = readPaidOverride(o.notes) ?? (/\[PAGA\]/i.test(o.notes ?? "") ? openingAmount : 0);
          return s + Math.max(0, openingAmount - Math.min(openingAmount, paid));
        }, 0);
      const pendingTotal = expensesPending + openingsPending;
      const unpaidExpenseIds = cardExpenses.filter((e) => !e.paid).map((e) => e.id);

      const computeCycle = (cycle: ReturnType<typeof getCurrentCycle>) => {
        const inCycle = expandedAll
          .filter((e) => e.scope === "personal")
          .filter((e) => belongsToCardInvoice(e, card, cycle.from, cycle.to));
        const transactions = inCycle.reduce((s, e) => s + invoiceItemValue(e), 0);
        const cycleKey = cycleKeyFromDate(cycle.to);
        const op = getOpening(card.id, cycleKey);
        const opening = op?.openingAmount ?? 0;
        const cycleUnpaidExpenseIds = inCycle.filter((e) => !e.paid).map((e) => e.id);
        const cycleExpensesPending = inCycle
          .filter((e) => !e.paid)
          .reduce((s, e) => s + invoiceItemValue(e), 0);
        const itemsPaidTotal = inCycle
          .filter((e) => e.paid)
          .reduce((s, e) => s + invoiceItemValue(e), 0);
        const paidOverride = readPaidOverride(op?.notes);
        const totalOverride = readTotalOverride(op?.notes);
        const openingPaidFlag = /\[PAGA\]/i.test(op?.notes ?? "");
        const paidTotal = paidOverride ?? Number((itemsPaidTotal + (openingPaidFlag ? opening : 0)).toFixed(2));
        const total = totalOverride ?? (transactions + opening);
        const remaining = Math.max(0, Number((total - paidTotal).toFixed(2)));
        const cyclePendingTotal = remaining;
        const everHadValue = inCycle.length > 0 || opening > 0 || openingPaidFlag || paidOverride !== null;
        const isPaid = everHadValue && remaining <= 0.005;
        return {
          cycle,
          cycleKey,
          op,
          opening,
          transactions,
          total,
          paidTotal,
          cyclePendingTotal,
          cycleUnpaidExpenseIds,
          hasData: everHadValue,
          isPaid,
        };
      };

      // Mantém o ciclo consultado. Antes a lista avançava automaticamente para a
      // próxima fatura em aberto quando a atual era paga; isso fazia o cartão
      // Nubank parecer ter considerado R$ 28,27 como pagamento parcial, quando
      // na verdade já estava exibindo outro ciclo.
      let chosen = computeCycle(baseCycle);

      map.set(card.id, {
        transactions: chosen.transactions,
        opening: chosen.opening,
        total: chosen.total,
        paidTotal: chosen.paidTotal,
        pendingTotal,
        cyclePendingTotal: chosen.cyclePendingTotal,
        dueDate: chosen.cycle.dueDate,
        cycleKey: chosen.cycleKey,
        openingNotes: chosen.op?.notes ?? null,
        hasOpening: !!chosen.op,
        unpaidExpenseIds,
        cycleUnpaidExpenseIds: chosen.cycleUnpaidExpenseIds,
      });
    });

    return map;
  }, [cards, expenses, openings, getOpening, referenceMonth]);

  // Month key used to decide which cards should be highlighted as "Fatura do mês".
  const refMonthKey = referenceMonth
    ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const openingDialogData = useMemo(() => {
    if (!openingCard) return null;
    const inv = invoiceByCard.get(openingCard.id);
    if (!inv) return null;
    const validDueDate = inv.dueDate instanceof Date && !isNaN(inv.dueDate.getTime()) ? inv.dueDate : new Date();
    return {
      cycleKey: inv.cycleKey,
      cycleLabel: format(validDueDate, "MMMM/yy", { locale: ptBR }),
      initialAmount: inv.opening,
      initialNotes: inv.openingNotes,
    };
  }, [openingCard, invoiceByCard]);

  // Métricas Consolidadas do Resumo
  const summaryMetrics = useMemo(() => {
    let totalInvoices = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalLimit = 0;
    let totalAvailable = 0;
    let paidInvoicesCount = 0;

    cards.forEach((card) => {
      const inv = invoiceByCard.get(card.id);
      const invTotal = Number(inv?.total || 0);
      const invPaid = Number(inv?.paidTotal || 0);
      const invPending = Number(inv?.cyclePendingTotal || 0);
      const cardLimit = Number(card.creditLimit || 0);
      const globalPending = Number(inv?.pendingTotal || 0);

      totalInvoices += invTotal;
      totalPaid += invPaid;
      totalPending += invPending;
      totalLimit += cardLimit;
      totalAvailable += Math.max(0, cardLimit - globalPending);
      if (invTotal > 0 && invPending <= 0.005) paidInvoicesCount++;
    });

    return {
      totalInvoices,
      totalPaid,
      totalPending,
      totalLimit,
      totalAvailable,
      paidInvoicesCount,
    };
  }, [cards, invoiceByCard]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <button
          type="button"
          onClick={() => emitAppUIEvent({ type: "NAVIGATE", tab: "expenses", subTab: "cards" })}
          className="group flex items-center gap-1.5 text-lg font-semibold text-foreground hover:text-primary transition-colors text-left"
          title="Abrir painel geral de cartões"
        >
          <span>Cartões ({cards.length})</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => emitAppUIEvent({ type: "NAVIGATE", tab: "expenses", subTab: "cards" })}
            size="sm"
            variant="ghost"
            className="hidden sm:inline-flex text-xs text-muted-foreground hover:text-primary"
          >
            Visão Geral <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
          {inactiveCards.length > 0 && (
            <Button
              onClick={() => setShowInactive((v) => !v)}
              size="sm"
              variant="outline"
            >
              <EyeOff className="h-4 w-4 mr-1" />
              {showInactive ? "Ocultar inativos" : `Inativos (${inactiveCards.length})`}
            </Button>
          )}
          {!readOnly && (
            <Button data-mutation onClick={handleNew} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Novo Cartão
            </Button>
          )}
        </div>
      </div>

      {/* Resumo Consolidado dos Cartões */}
      {cards.length > 0 && !loading && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 border border-primary/20 shadow-xs mb-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold shrink-0 shadow-xs">
                <CreditCardIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-foreground leading-tight">
                  Resumo Geral dos Cartões
                </h4>
                <p className="text-[10px] text-muted-foreground">
                  {summaryMetrics.paidInvoicesCount} de {cards.length} fatura(s) quitada(s)
                </p>
              </div>
            </div>

            <Button
              onClick={() => emitAppUIEvent({ type: "NAVIGATE", tab: "expenses", subTab: "cards" })}
              size="sm"
              variant="outline"
              className="h-8 text-xs font-semibold rounded-xl bg-background/50 border-primary/30 text-primary hover:bg-primary/10 w-full sm:w-auto"
            >
              Painel Completo <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-background/60 border border-border/40">
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Total Faturas</p>
              <p className="text-xs sm:text-sm font-extrabold text-foreground tabular-nums mt-0.5">
                {mask(fmt(summaryMetrics.totalInvoices))}
              </p>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-background/60 border border-border/40">
              <p className="text-[10px] text-muted-foreground uppercase font-medium">A Pagar</p>
              <p className="text-xs sm:text-sm font-extrabold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                {mask(fmt(summaryMetrics.totalPending))}
              </p>
            </div>

            <div className="col-span-2 sm:col-span-1 p-2 sm:p-2.5 rounded-xl bg-background/60 border border-border/40">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Limite Disp.</p>
                <span className="text-[9px] text-muted-foreground">Total: {mask(fmt(summaryMetrics.totalLimit))}</span>
              </div>
              <p className="text-xs sm:text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                {mask(fmt(summaryMetrics.totalAvailable))}
              </p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Carregando...</div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 px-4">
          <CreditCardIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground mb-4">Nenhum cartão cadastrado</p>
          {!readOnly && (
            <Button data-mutation onClick={handleNew} variant="outline">
              <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro cartão
            </Button>
          )}
        </div>
      ) : (
        <>
        {(() => {
          // Sort by nearest due date (soonest first) for mobile prioritization
          const sortedCards = [...cards].sort((a, b) => {
            const da = invoiceByCard.get(a.id)?.dueDate?.getTime();
            const db = invoiceByCard.get(b.id)?.dueDate?.getTime();
            const timeA = typeof da === "number" && !isNaN(da) ? da : 0;
            const timeB = typeof db === "number" && !isNaN(db) ? db : 0;
            return timeA - timeB;
          });
          const isMobileLimited = !showAllMobile && sortedCards.length > 2;
          const mobileVisible = isMobileLimited ? sortedCards.slice(0, 2) : sortedCards;
          const hiddenCount = sortedCards.length - 2;
          return (
            <>
              {/* Mobile: limited list (max 2) */}
              <div className="grid gap-3 grid-cols-2 sm:hidden">
                {mobileVisible.map((card) => {
                  const fallbackDueDate = getCurrentCycle(card.closingDay, card.dueDay).dueDate;
                  const inv = invoiceByCard.get(card.id) ?? {
                    transactions: 0, opening: 0, total: 0, paidTotal: 0, pendingTotal: 0, cyclePendingTotal: 0,
                    dueDate: fallbackDueDate,
                    cycleKey: "", openingNotes: null, hasOpening: false,
                    unpaidExpenseIds: [] as string[],
                    cycleUnpaidExpenseIds: [] as string[],
                  };
                  const safeDue = inv.dueDate instanceof Date && !isNaN(inv.dueDate.getTime()) ? inv.dueDate : fallbackDueDate;
                  const isMonthActive = inv.total > 0 && `${safeDue.getFullYear()}-${String(safeDue.getMonth() + 1).padStart(2, "0")}` === refMonthKey;
                  return (
                    <MiniCreditCard
                      key={card.id}
                      card={card}
                      invoiceTotal={inv.total}
                      paidTotal={inv.paidTotal}
                      pendingTotal={inv.pendingTotal}
                      cyclePendingTotal={inv.cyclePendingTotal}
                      openingAmount={inv.opening}
                      hasOpening={inv.hasOpening}
                      hasActiveInvoice={isMonthActive}
                      hasUnpaidInvoice={inv.unpaidExpenseIds.length > 0}
                      dueDate={safeDue}
                      onClick={(rect) => openInvoice(card, rect)}
                      onEdit={readOnly ? undefined : () => handleEdit(card)}
                      onDelete={readOnly ? undefined : () => setDeleting(card)}
                      onAddOpening={readOnly ? undefined : () => setOpeningCard(card)}
                      onPayInvoice={readOnly ? undefined : () => openInvoicePayment(card)}
                      readOnly={readOnly}
                    />
                  );
                })}
              </div>
              {sortedCards.length > 2 && (
                <div className="sm:hidden mt-3 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowAllMobile((v) => !v)}
                  >
                    {showAllMobile ? "Mostrar menos" : `Ver todos (${hiddenCount} a mais)`}
                  </Button>
                </div>
              )}
            </>
          );
        })()}

        {/* Tablet/Desktop: full grid */}
        <div className="hidden sm:grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => {
            const fallbackDueDate = getCurrentCycle(card.closingDay, card.dueDay).dueDate;
            const inv = invoiceByCard.get(card.id) ?? {
              transactions: 0,
              opening: 0,
              total: 0,
              paidTotal: 0,
              pendingTotal: 0,
              cyclePendingTotal: 0,
              dueDate: fallbackDueDate,
              cycleKey: "",
              openingNotes: null,
              hasOpening: false,
              unpaidExpenseIds: [] as string[],
              cycleUnpaidExpenseIds: [] as string[],
            };
            const safeDue = inv.dueDate instanceof Date && !isNaN(inv.dueDate.getTime()) ? inv.dueDate : fallbackDueDate;
            const isMonthActive = inv.total > 0 && `${safeDue.getFullYear()}-${String(safeDue.getMonth() + 1).padStart(2, "0")}` === refMonthKey;
            return (
              <MiniCreditCard
                key={card.id}
                card={card}
                invoiceTotal={inv.total}
                paidTotal={inv.paidTotal}
                pendingTotal={inv.pendingTotal}
                cyclePendingTotal={inv.cyclePendingTotal}
                openingAmount={inv.opening}
                hasOpening={inv.hasOpening}
                hasActiveInvoice={isMonthActive}
                hasUnpaidInvoice={inv.unpaidExpenseIds.length > 0}
                dueDate={safeDue}
                onClick={(rect) => openInvoice(card, rect)}
                onEdit={readOnly ? undefined : () => handleEdit(card)}
                onDelete={readOnly ? undefined : () => setDeleting(card)}
                onAddOpening={readOnly ? undefined : () => setOpeningCard(card)}
                onPayInvoice={readOnly ? undefined : () => openInvoicePayment(card)}
                readOnly={readOnly}
              />
            );
          })}
        </div>
        </>
      )}

      {showInactive && inactiveCards.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground">
              Cartões inativos ({inactiveCards.length})
            </h3>
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {inactiveCards.map((card) => {
              const bank = getBank(card.bank);
              return (
                <Card key={card.id} no3d className="opacity-60 hover:opacity-100 transition-opacity">
                  <CardContent className="p-3 space-y-2.5">
                    <div className={`${bank.gradient} ${bank.textClass} relative aspect-[1.586/1] w-full rounded-lg p-2.5 shadow-sm overflow-hidden grayscale`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-1">
                          <div className="h-4 w-5 rounded-sm bg-gradient-to-br from-[hsl(45,90%,75%)] to-[hsl(40,80%,50%)] border border-[hsl(45,90%,80%)]/40" />
                          <Wifi className="h-2.5 w-2.5 rotate-90 opacity-80" />
                        </div>
                        <span className="text-[9px] font-bold tracking-wide truncate max-w-[60%] text-right">
                          {bank.name}
                        </span>
                      </div>
                      <div className="absolute left-2.5 right-2.5 bottom-2 flex items-end justify-between">
                        <span className="font-mono text-[10px] tracking-[0.15em] opacity-95">
                          •••• {card.lastFour || "0000"}
                        </span>
                        <span className="text-[9px] font-bold italic opacity-95">
                          {brandLabel(card.brand)}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {card.nickname || bank.name}
                      </p>
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold uppercase tracking-wide">
                        Inativo
                      </span>
                      {!readOnly && (
                        <div className="flex gap-1 pt-1">
                          <Button
                            variant="default"
                            size="sm"
                            className="flex-1 h-7 text-[11px]"
                            onClick={() => updateCard(card.id, {
                              nickname: card.nickname,
                              bank: card.bank,
                              brand: card.brand,
                              lastFour: card.lastFour,
                              creditLimit: card.creditLimit,
                              closingDay: card.closingDay,
                              dueDay: card.dueDay,
                              active: true,
                            })}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Reativar
                          </Button>
                          <Button data-mutation
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleting(card)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {showForm && (
        <CreditCardForm
          initial={editing ?? undefined}
          onSave={(input) =>
            editing ? updateCard(editing.id, input) : addCard(input)
          }
          onClose={() => {
            setShowForm(false);
            setEditing(null);
            restoreAfterFormClose();
          }}
        />
      )}

      {invoiceCard && (
        <CreditCardInvoice
          card={invoiceCard}
          originRect={invoiceOriginRect}
          onClose={() => {
            setInvoiceCard(null);
            setInvoiceOriginRect(null);
            setInvoiceAutoOpenPayment(false);
            restoreAfterInvoiceClose();
          }}
          referenceMonth={referenceMonth}
          autoOpenPayment={invoiceAutoOpenPayment}
        />
      )}

      {openingCard && openingDialogData && (
        <CreditCardOpeningDialog
          open={!!openingCard}
          onOpenChange={(o) => !o && setOpeningCard(null)}
          cardName={openingCard.nickname || getBank(openingCard.bank).name}
          cycleLabel={openingDialogData.cycleLabel}
          initialAmount={openingDialogData.initialAmount}
          initialNotes={openingDialogData.initialNotes}
          creditLimit={openingCard.creditLimit}
          transactionsTotal={invoiceByCard.get(openingCard.id)?.transactions ?? 0}
          onSave={async (amount, notes) => {
            await upsertOpening(openingCard.id, openingDialogData.cycleKey, amount, notes);
          }}
        />
      )}

      {deleting && (
        <ConfirmDeleteDialog
          open={!!deleting}
          onOpenChange={(o) => !o && setDeleting(null)}
          onConfirm={async () => {
            await deleteCard(deleting.id);
            setDeleting(null);
          }}
          title="Excluir cartão?"
          description={`Tem certeza que deseja excluir o cartão ${deleting.nickname || deleting.bank}?`}
        />
      )}
    </div>
  );
}
