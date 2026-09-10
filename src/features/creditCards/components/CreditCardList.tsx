import React, { useMemo } from "react";
import { CreditCard as CreditCardIcon, ChevronRight, ArrowUpRight } from "lucide-react";
import { emitAppUIEvent } from "@/lib/appUIEvents";
import { Button } from "@/components/ui/button";
import { useCreditCards } from "@/features/creditCards/hooks/useCreditCards";
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
import { useFinanceComponentDebug } from "@/lib/financeDebug";

interface Props {
  readOnly?: boolean;
  /** YYYY-MM — when provided, anchors metrics to this due month */
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

export function CreditCardList({ readOnly = false, referenceMonth }: Props) {
  useFinanceComponentDebug("CreditCardList");
  const { mask } = useHideValues();
  const { cards: allCards, loading } = useCreditCards();
  const cards = useMemo(() => allCards.filter((c) => c.active !== false), [allCards]);
  const { expenses } = useExpenses();
  const { openings, getOpening } = useCreditCardOpenings();

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
      }
    >();
    const expandedAll = expandCreditCardExpenses(expenses);

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

      const inCycle = expandedAll
        .filter((e) => e.scope === "personal")
        .filter((e) => belongsToCardInvoice(e, card, baseCycle.from, baseCycle.to));
      const transactions = inCycle.reduce((s, e) => s + invoiceItemValue(e), 0);
      const cycleKey = cycleKeyFromDate(baseCycle.to);
      const op = getOpening(card.id, cycleKey);
      const opening = Number(op?.openingAmount ?? 0);
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

      map.set(card.id, {
        transactions,
        opening,
        total,
        paidTotal,
        pendingTotal,
        cyclePendingTotal,
        dueDate: baseCycle.dueDate,
        cycleKey,
      });
    });

    return map;
  }, [cards, expenses, openings, getOpening, referenceMonth]);

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

    const usedPercentage =
      totalLimit > 0 ? Math.min(100, Math.max(0, ((totalLimit - totalAvailable) / totalLimit) * 100)) : 0;

    return {
      totalInvoices,
      totalPaid,
      totalPending,
      totalLimit,
      totalAvailable,
      paidInvoicesCount,
      usedPercentage,
    };
  }, [cards, invoiceByCard]);

  const handleOpenGeneralManagement = () => {
    emitAppUIEvent({ type: "NAVIGATE", tab: "expenses", subTab: "cards" });
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground bg-card/50 rounded-2xl border border-border/40 animate-pulse">
        Carregando resumo de cartões...
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div
        onClick={handleOpenGeneralManagement}
        className="group relative cursor-pointer p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 border border-border/60 hover:border-primary/40 hover:shadow-md transition-all duration-200"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
              <CreditCardIcon className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                Cartões de Crédito
              </h4>
              <p className="text-xs text-muted-foreground">
                Nenhum cartão cadastrado. Clique para acessar e cadastrar cartões.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 text-primary">
            Acessar <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleOpenGeneralManagement}
      className="group relative cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-br from-card via-card to-primary/[0.04] border border-primary/20 hover:border-primary/40 hover:shadow-lg transition-all duration-200 p-4 sm:p-5 space-y-4"
      title="Clique para abrir o painel completo de Cartões de Crédito"
    >
      {/* Detalhe de fundo decorativo */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl group-hover:bg-primary/15 transition-all" />

      {/* Header do Card Consolidado */}
      <div className="flex items-center gap-3 pb-3 border-b border-border/50">
        <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold shrink-0 shadow-xs group-hover:scale-105 transition-transform">
          <CreditCardIcon className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <div>
          <h3 className="text-sm sm:text-base font-bold text-foreground group-hover:text-primary transition-colors">
            Cartões de Crédito ({cards.length})
          </h3>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
            {summaryMetrics.paidInvoicesCount} de {cards.length} fatura(s) quitada(s) no período
          </p>
        </div>
      </div>

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
        {/* Total das Faturas */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-background/70 border border-border/50 space-y-1">
          <span className="text-[10px] sm:text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
            Total Faturas
          </span>
          <p className="text-sm sm:text-base md:text-lg font-extrabold text-foreground tabular-nums tracking-tight">
            {mask(fmt(summaryMetrics.totalInvoices))}
          </p>
          <div className="text-[10px] text-muted-foreground pt-0.5">
            Pago: <span className="font-semibold text-foreground/80">{mask(fmt(summaryMetrics.totalPaid))}</span>
          </div>
        </div>

        {/* Fatura a Pagar */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-background/70 border border-border/50 space-y-1">
          <span className="text-[10px] sm:text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
            A Pagar (Mês)
          </span>
          <p className={`text-sm sm:text-base md:text-lg font-extrabold tabular-nums tracking-tight ${
            summaryMetrics.totalPending > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
          }`}>
            {mask(fmt(summaryMetrics.totalPending))}
          </p>
          <div className="text-[10px] text-muted-foreground pt-0.5">
            {summaryMetrics.totalPending <= 0.005 ? "Tudo em dia" : "Aguardando pagamento"}
          </div>
        </div>

        {/* Limite Global Disponível */}
        <div className="col-span-2 sm:col-span-1 p-3 sm:p-3.5 rounded-xl bg-background/70 border border-border/50 space-y-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
              Limite Disp. Global
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">
              Total {mask(fmt(summaryMetrics.totalLimit))}
            </span>
          </div>

          <p className="text-sm sm:text-base md:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight">
            {mask(fmt(summaryMetrics.totalAvailable))}
          </p>

          {/* Barra de progresso de utilização do limite */}
          <div className="space-y-1 pt-0.5">
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-primary to-amber-500 rounded-full transition-all duration-300"
                style={{ width: `${summaryMetrics.usedPercentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] text-muted-foreground">
              <span>{summaryMetrics.usedPercentage.toFixed(0)}% utilizado</span>
              <span>{(100 - summaryMetrics.usedPercentage).toFixed(0)}% livre</span>
            </div>
          </div>
        </div>
      </div>

      {/* Botão Painel Completo ocupando todo o espaço lateral */}
      <div className="pt-1">
        <Button
          size="sm"
          variant="outline"
          className="w-full h-9 sm:h-10 text-xs sm:text-sm font-semibold rounded-xl bg-background/80 border-primary/30 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-xs flex items-center justify-center gap-1.5"
        >
          <span>Painel Completo</span>
          <ArrowUpRight className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Button>
      </div>
    </div>
  );
}
