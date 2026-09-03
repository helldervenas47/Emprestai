import React, { useState, useMemo, useRef } from "react";
import { Plus, CreditCard as CreditCardIcon, Wifi, Pencil, Trash2, Receipt, CheckCircle, EyeOff, RotateCcw } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
function getCycleForRef(ref: Date, closingDay: number, dueDay: number) {
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

/** Returns the current billing cycle (from, to, dueDate) for a card. */
function getCurrentCycle(closingDay: number, dueDay: number) {
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
  invoiceTotal,
  paidTotal,
  pendingTotal,
  cyclePendingTotal,
  openingAmount,
  hasOpening,
  hasActiveInvoice,
  hasUnpaidInvoice,
  dueDate,
  onClick,
  onEdit,
  onDelete,
  onAddOpening,
  onPayInvoice,
  readOnly,
}, ref) => {
  const bank = getBank(card.bank);
  const { mask } = useHideValues();
  const utilization =
    card.creditLimit > 0 ? Math.min(100, (pendingTotal / card.creditLimit) * 100) : 0;
  const rootRef = (window as any).__cardRefMap || ((window as any).__cardRefMap = new Map());

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onClick(rect);
  };

  return (
    <Card
      ref={ref}
      no3d
      className={`group relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${
        hasActiveInvoice
          ? "border-2 border-warning shadow-[0_0_0_3px_hsl(var(--warning)/0.15)]"
          : ""
      }`}
      onClick={handleClick}
    >
      {hasActiveInvoice && (
        <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-warning text-warning-foreground text-[9px] font-bold uppercase tracking-wide shadow-sm">
          Fatura do mês
        </div>
      )}
      <CardContent className="p-3 space-y-2.5">
        {/* Mini visual card thumbnail */}
        <div
          className={`${bank.gradient} ${bank.textClass} relative aspect-[1.586/1] w-full rounded-lg p-2.5 shadow-sm overflow-hidden`}
        >
          <div className="pointer-events-none absolute -top-6 -right-6 h-20 w-20 rounded-full bg-white/10 blur-xl" />
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

        {/* Summary info */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground truncate">
              {card.nickname || bank.name}
            </p>
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

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">Fatura atual</span>
            <span className="text-sm font-bold text-foreground">
              {mask(
                fmt(
                  paidTotal > 0.005 && paidTotal < invoiceTotal - 0.005
                    ? Math.max(0, Number((invoiceTotal - paidTotal).toFixed(2)))
                    : paidTotal >= invoiceTotal - 0.005 && invoiceTotal > 0
                    ? paidTotal
                    : invoiceTotal
                )
              )}
            </span>
          </div>

          {hasOpening && openingAmount > 0 && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">Saldo inicial</span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {mask(fmt(openingAmount))}
              </span>
            </div>
          )}

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">Valor pago da fatura</span>
            <span className={`text-[11px] font-semibold tabular-nums ${paidTotal > 0 ? "text-success" : "text-muted-foreground"}`}>
              {mask(fmt(paidTotal))}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">Disponível</span>
            <span className="text-[11px] font-semibold text-success tabular-nums">
              {mask(fmt(Math.max(0, card.creditLimit - pendingTotal)))}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>Vence {format(dueDate, "dd 'de' MMM", { locale: ptBR })}</span>
            <span>Limite {mask(fmt(card.creditLimit))}</span>
          </div>

          {/* Utilization bar */}
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all ${
                utilization >= 90
                  ? "bg-destructive"
                  : utilization >= 70
                  ? "bg-warning"
                  : "bg-primary"
              }`}
              style={{ width: `${utilization}%` }}
            />
          </div>

          {!readOnly && (
            <div className="space-y-1 mt-1">
              <Button data-mutation
                variant="default"
                size="sm"
                className="w-full h-7 text-[11px]"
                disabled={cyclePendingTotal <= 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onPayInvoice?.();
                }}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Pagar fatura do mês
              </Button>
              <Button data-mutation
                variant="outline"
                size="sm"
                className="w-full h-7 text-[11px]"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddOpening?.();
                }}
              >
                <Receipt className="h-3 w-3 mr-1" />
                {hasOpening ? "Editar fatura" : "Adicionar fatura"}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

MiniCreditCard.displayName = "MiniCreditCard";

export function CreditCardList({ readOnly = false, referenceMonth }: Props) {
  useFinanceComponentDebug("CreditCardList");
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
    return {
      cycleKey: inv.cycleKey,
      cycleLabel: format(inv.dueDate, "MMMM/yy", { locale: ptBR }),
      initialAmount: inv.opening,
      initialNotes: inv.openingNotes,
    };
  }, [openingCard, invoiceByCard]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-foreground truncate">
          Cartões ({cards.length})
        </h2>
        <div className="flex items-center gap-2 shrink-0">
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
            const da = invoiceByCard.get(a.id)?.dueDate?.getTime() ?? 0;
            const db = invoiceByCard.get(b.id)?.dueDate?.getTime() ?? 0;
            return da - db;
          });
          const isMobileLimited = !showAllMobile && sortedCards.length > 2;
          const mobileVisible = isMobileLimited ? sortedCards.slice(0, 2) : sortedCards;
          const hiddenCount = sortedCards.length - 2;
          return (
            <>
              {/* Mobile: limited list (max 2) */}
              <div className="grid gap-3 grid-cols-2 sm:hidden">
                {mobileVisible.map((card) => {
                  const inv = invoiceByCard.get(card.id) ?? {
                    transactions: 0, opening: 0, total: 0, paidTotal: 0, pendingTotal: 0, cyclePendingTotal: 0,
                    dueDate: getCurrentCycle(card.closingDay, card.dueDay).dueDate,
                    cycleKey: "", openingNotes: null, hasOpening: false,
                    unpaidExpenseIds: [] as string[],
                    cycleUnpaidExpenseIds: [] as string[],
                  };
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
                      hasActiveInvoice={
                        inv.total > 0 &&
                        `${inv.dueDate.getFullYear()}-${String(inv.dueDate.getMonth() + 1).padStart(2, "0")}` === refMonthKey
                      }
                      hasUnpaidInvoice={inv.unpaidExpenseIds.length > 0}
                      dueDate={inv.dueDate}
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
            const inv = invoiceByCard.get(card.id) ?? {
              transactions: 0,
              opening: 0,
              total: 0,
              paidTotal: 0,
              pendingTotal: 0,
              cyclePendingTotal: 0,
              dueDate: getCurrentCycle(card.closingDay, card.dueDay).dueDate,
              cycleKey: "",
              openingNotes: null,
              hasOpening: false,
              unpaidExpenseIds: [] as string[],
              cycleUnpaidExpenseIds: [] as string[],
            };
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
                hasActiveInvoice={
                  inv.total > 0 &&
                  `${inv.dueDate.getFullYear()}-${String(inv.dueDate.getMonth() + 1).padStart(2, "0")}` === refMonthKey
                }
                hasUnpaidInvoice={inv.unpaidExpenseIds.length > 0}
                dueDate={inv.dueDate}
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
