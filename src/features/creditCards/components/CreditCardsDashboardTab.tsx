import React, { useState, useMemo, useEffect } from "react";
import { format, addMonths, subMonths, parseISO, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CreditCard as CreditCardIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Receipt,
  EyeOff,
  ShieldCheck,
  CalendarClock,
  Wifi,
  ArrowLeft,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useCreditCards, CreditCard } from "@/features/creditCards/hooks/useCreditCards";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useCreditCardOpenings, cycleKeyFromDate } from "@/features/creditCards/hooks/useCreditCardOpenings";
import {
  getCycleForDueMonth,
  belongsToCardInvoice,
  invoiceItemValue,
  readPaidOverride,
  readTotalOverride,
  cycleKeyForDate,
} from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { expandCreditCardExpenses } from "@/features/creditCards/lib/creditCardInstallments";
import { useHideValues } from "@/contexts/HideValuesContext";
import { getBank, brandLabel } from "@/features/creditCards/lib/creditCardBanks";
import { CreditCardForm } from "./CreditCardForm";
import { CreditCardInvoice } from "./CreditCardInvoice";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { captureScroll } from "@/features/loans/lib/preserveScroll";

interface CreditCardsDashboardTabProps {
  readOnly?: boolean;
  initialMonth?: string;
  onBack?: () => void;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CreditCardsDashboardTab({
  readOnly = false,
  initialMonth,
  onBack,
}: CreditCardsDashboardTabProps) {
  const currentMonthKey = useMemo(() => format(new Date(), "yyyy-MM"), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    initialMonth || currentMonthKey
  );

  const { cards: allCards, loading, addCard, updateCard, deleteCard } = useCreditCards();
  const cards = useMemo(() => allCards.filter((c) => c.active !== false), [allCards]);
  const inactiveCards = useMemo(() => allCards.filter((c) => c.active === false), [allCards]);
  const { expenses } = useExpenses();
  const { openings, getOpening } = useCreditCardOpenings();
  const { mask } = useHideValues();

  const [showForm, setShowForm] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [deletingCard, setDeletingCard] = useState<CreditCard | null>(null);
  const [invoiceCard, setInvoiceCard] = useState<CreditCard | null>(null);
  const [invoiceAutoOpenPayment, setInvoiceAutoOpenPayment] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const selectedDate = useMemo(() => {
    try {
      return parseISO(`${selectedMonth}-01`);
    } catch {
      return new Date();
    }
  }, [selectedMonth]);

  const handlePrevMonth = () => {
    const prev = subMonths(selectedDate, 1);
    setSelectedMonth(format(prev, "yyyy-MM"));
  };

  const handleNextMonth = () => {
    const next = addMonths(selectedDate, 1);
    setSelectedMonth(format(next, "yyyy-MM"));
  };

  const handleCurrentMonth = () => {
    setSelectedMonth(currentMonthKey);
  };

  // Garante que ao abrir a aba de cartões a tela inicie no topo
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.documentElement.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  // Carrossel de navegação rápida de meses (-2 até +5 meses)
  const quickMonths = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let offset = -2; offset <= 5; offset++) {
      const d = addMonths(now, offset);
      const key = format(d, "yyyy-MM");
      months.push({
        key,
        date: d,
        label: format(d, "MMM/yy", { locale: ptBR }),
        isCurrent: isSameMonth(d, now),
        isSelected: key === selectedMonth,
      });
    }
    return months;
  }, [selectedMonth]);

  // Expansão das despesas de cartão (incluindo parceladas)
  const expandedAll = useMemo(() => expandCreditCardExpenses(expenses), [expenses]);

  // Cálculo do Limite Disponível Atual (Global e por Cartão) - Valor fixo neste momento
  const cardGlobalLimits = useMemo(() => {
    const map = new Map<string, { currentPending: number; currentAvailable: number }>();

    cards.forEach((card) => {
      const paidCycleKeys = new Set(
        openings
          .filter((o) => o.cardId === card.id && /\[PAGA\]/i.test(o.notes ?? ""))
          .map((o) => o.cycleKey)
      );

      const cardExpenses = expandedAll
        .filter((e) => !e.scope || e.scope === "personal")
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

      const totalCardPending = expensesPending + openingsPending;
      const currentLimit = Number(card.creditLimit ?? 0);
      const currentAvailable = Math.max(0, currentLimit - totalCardPending);

      map.set(card.id, {
        currentPending: totalCardPending,
        currentAvailable,
      });
    });

    return map;
  }, [cards, expandedAll, openings]);

  // Limite Global Total e Disponível neste momento
  const globalLimitsSummary = useMemo(() => {
    let totalLimits = 0;
    let totalAvailable = 0;
    let totalPendingAllCards = 0;

    cards.forEach((card) => {
      const currentLimit = Number(card.creditLimit ?? 0);
      const cardData = cardGlobalLimits.get(card.id) ?? { currentPending: 0, currentAvailable: currentLimit };
      totalLimits += currentLimit;
      totalAvailable += cardData.currentAvailable;
      totalPendingAllCards += cardData.currentPending;
    });

    return { totalLimits, totalAvailable, totalPendingAllCards };
  }, [cards, cardGlobalLimits]);

  // Cálculo das faturas para cada cartão no mês selecionado (ordenado por vencimento)
  const cardDataForSelectedMonth = useMemo(() => {
    const list = cards.map((card) => {
      const cycle =
        getCycleForDueMonth(selectedMonth, card.closingDay, card.dueDay) || {
          from: new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, card.closingDay),
          to: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), card.closingDay),
          dueDate: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), card.dueDay),
        };

      const inCycleExpenses = expandedAll
        .filter((e) => !e.scope || e.scope === "personal")
        .filter((e) => belongsToCardInvoice(e, card, cycle.from, cycle.to));

      const itemsTotal = inCycleExpenses.reduce((s, e) => s + invoiceItemValue(e), 0);
      const cycleKey = cycleKeyFromDate(cycle.to);
      const opening = getOpening(card.id, cycleKey);
      const openingAmount = opening?.openingAmount ?? 0;
      const openingPaidFlag = /\[PAGA\]/i.test(opening?.notes ?? "");
      const paidOverride = readPaidOverride(opening?.notes);
      const totalOverride = readTotalOverride(opening?.notes);

      const invoiceTotal = totalOverride ?? itemsTotal + openingAmount;
      const itemsPaid = inCycleExpenses
        .filter((e) => e.paid)
        .reduce((s, e) => s + invoiceItemValue(e), 0);
      const paidTotal =
        paidOverride ??
        Number((itemsPaid + (openingPaidFlag ? openingAmount : 0)).toFixed(2));
      const pendingTotal = Math.max(0, invoiceTotal - paidTotal);

      const limit = Number(card.creditLimit ?? 0);
      const globalInfo = cardGlobalLimits.get(card.id) ?? { currentPending: 0, currentAvailable: limit };

      // Status da fatura
      const isPaid = invoiceTotal > 0 && pendingTotal === 0;
      const isOverdue =
        !isPaid &&
        pendingTotal > 0 &&
        cycle.dueDate < new Date() &&
        format(cycle.dueDate, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd");
      const isDueToday =
        !isPaid &&
        pendingTotal > 0 &&
        format(cycle.dueDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

      return {
        card,
        cycle,
        itemsCount: inCycleExpenses.length,
        openingAmount,
        invoiceTotal,
        paidTotal,
        pendingTotal,
        limit,
        currentAvailable: globalInfo.currentAvailable,
        currentPending: globalInfo.currentPending,
        isPaid,
        isOverdue,
        isDueToday,
        cycleKey,
      };
    });

    // Ordena por data de vencimento da fatura (mais próximos primeiro)
    return list.sort((a, b) => a.cycle.dueDate.getTime() - b.cycle.dueDate.getTime());
  }, [cards, selectedMonth, selectedDate, expandedAll, getOpening, cardGlobalLimits]);

  // Métricas Consolidadas do Mês Selecionado
  const consolidatedMetrics = useMemo(() => {
    let totalInvoices = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let paidCount = 0;
    let overdueCount = 0;

    cardDataForSelectedMonth.forEach((c) => {
      totalInvoices += c.invoiceTotal;
      totalPaid += c.paidTotal;
      totalPending += c.pendingTotal;
      if (c.isPaid) paidCount++;
      if (c.isOverdue) overdueCount++;
    });

    return {
      totalInvoices,
      totalPaid,
      totalPending,
      totalLimits: globalLimitsSummary.totalLimits,
      totalAvailable: globalLimitsSummary.totalAvailable,
      paidCount,
      overdueCount,
    };
  }, [cardDataForSelectedMonth, globalLimitsSummary]);

  // Projeção futura dos próximos 6 meses consolidada
  const futureProjections = useMemo(() => {
    const projections = [];
    const base = new Date();

    for (let offset = 0; offset <= 5; offset++) {
      const monthDate = addMonths(base, offset);
      const monthKey = format(monthDate, "yyyy-MM");

      let totalMonth = 0;
      const cardBreakdown: { cardName: string; amount: number }[] = [];

      cards.forEach((card) => {
        const cycle = getCycleForDueMonth(monthKey, card.closingDay, card.dueDay);
        if (!cycle) return;

        const inCycleExpenses = expandedAll
          .filter((e) => !e.scope || e.scope === "personal")
          .filter((e) => belongsToCardInvoice(e, card, cycle.from, cycle.to));

        const itemsTotal = inCycleExpenses.reduce((s, e) => s + invoiceItemValue(e), 0);
        const cycleKey = cycleKeyFromDate(cycle.to);
        const opening = getOpening(card.id, cycleKey);
        const openingAmount = opening?.openingAmount ?? 0;
        const totalOverride = readTotalOverride(opening?.notes);

        const cardTotal = totalOverride ?? (itemsTotal + openingAmount);
        if (cardTotal > 0) {
          totalMonth += cardTotal;
          cardBreakdown.push({
            cardName: card.nickname || getBank(card.bank).name,
            amount: cardTotal,
          });
        }
      });

      projections.push({
        monthKey,
        monthDate,
        label: format(monthDate, "MMMM 'de' yyyy", { locale: ptBR }),
        shortLabel: format(monthDate, "MMM/yy", { locale: ptBR }),
        total: totalMonth,
        cardsCount: cardBreakdown.length,
        breakdown: cardBreakdown,
        isCurrent: offset === 0,
        isSelected: monthKey === selectedMonth,
      });
    }

    return projections;
  }, [cards, expandedAll, selectedMonth, getOpening]);

  const openInvoiceDetail = (card: CreditCard) => {
    captureScroll();
    setInvoiceAutoOpenPayment(false);
    setInvoiceCard(card);
  };

  const openInvoicePay = (card: CreditCard) => {
    captureScroll();
    setInvoiceAutoOpenPayment(true);
    setInvoiceCard(card);
  };

  return (
    <div className="space-y-5">
      {/* Header Geral da Aba de Cartões */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 border border-primary/20 shadow-xs">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
            title="Fechar e voltar para despesas"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="flex items-center gap-3 pr-8 sm:pr-0">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-bold shadow-xs shrink-0">
            <CreditCardIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground leading-tight flex items-center gap-2">
              Gestão Geral de Cartões de Crédito
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Controle de faturas, vencimentos, projeções futuras e limites consolidados.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0 sm:pr-8">
          {inactiveCards.length > 0 && (
            <Button
              onClick={() => setShowInactive((v) => !v)}
              size="sm"
              variant="outline"
              className="h-10 sm:h-9 w-full sm:w-auto text-xs font-semibold rounded-xl"
            >
              <EyeOff className="h-3.5 w-3.5 mr-1.5" />
              {showInactive ? "Ocultar inativos" : `Inativos (${inactiveCards.length})`}
            </Button>
          )}

          {!readOnly && (
            <Button
              onClick={() => {
                setEditingCard(null);
                setShowForm(true);
              }}
              size="sm"
              className="h-10 sm:h-9 w-full sm:w-auto text-xs font-semibold rounded-xl bg-primary shadow-xs justify-center flex items-center"
            >
              <Plus className="h-4 w-4 mr-1" /> Novo Cartão
            </Button>
          )}
        </div>
      </div>

      {/* Seletor de Período (Mês Atual, Próximos Meses e Anteriores) */}
      <div className="space-y-2.5 p-3.5 sm:p-4 rounded-2xl bg-card border border-border/60 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Card de Mês ocupando todo o espaço entre as setas */}
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl shrink-0"
              onClick={handlePrevMonth}
              title="Mês Anterior"
              aria-label="Mês Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <button
              type="button"
              onClick={handleCurrentMonth}
              className="flex-1 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/15 active:scale-[0.99] border border-primary/20 text-center transition-all cursor-pointer w-full"
              title="Clique para voltar ao mês atual"
            >
              <span className="text-xs sm:text-sm font-bold text-primary capitalize block truncate">
                {format(selectedDate, "MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </button>

            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl shrink-0"
              onClick={handleNextMonth}
              title="Próximo Mês"
              aria-label="Próximo Mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="text-xs text-muted-foreground flex items-center gap-2 shrink-0">
            <span>Competência de Vencimento</span>
            {selectedMonth === currentMonthKey && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] py-0 px-1.5">
                Mês Vigente
              </Badge>
            )}
          </div>
        </div>

        {/* Chips de Navegação Rápida entre Meses */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-hide">
          {quickMonths.map((qm) => (
            <button
              key={qm.key}
              type="button"
              onClick={() => setSelectedMonth(qm.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                qm.isSelected
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40"
              }`}
            >
              <span className="capitalize">{qm.label}</span>
              {qm.isCurrent && !qm.isSelected && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Painel de Indicadores Consolidados do Mês Selecionado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3.5">
        {/* 1. Total em Faturas */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Faturas do Mês</span>
            <Receipt className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-extrabold text-foreground tabular-nums">
              {mask(fmt(consolidatedMetrics.totalInvoices))}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {cards.length} {cards.length === 1 ? "cartão cadastrado" : "cartões no total"}
            </p>
          </div>
        </div>

        {/* 2. Total Pago */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Total Pago</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {mask(fmt(consolidatedMetrics.totalPaid))}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {consolidatedMetrics.paidCount} de {cards.length} fatura(s) quitada(s)
            </p>
          </div>
        </div>

        {/* 3. Saldo Pendente a Pagar */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">A Pagar / Restante</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <p
              className={`text-base sm:text-xl font-extrabold tabular-nums ${
                consolidatedMetrics.overdueCount > 0
                  ? "text-destructive"
                  : consolidatedMetrics.totalPending > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-foreground"
              }`}
            >
              {mask(fmt(consolidatedMetrics.totalPending))}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {consolidatedMetrics.overdueCount > 0
                ? `${consolidatedMetrics.overdueCount} fatura(s) em atraso`
                : "Saldo devedor do período"}
            </p>
          </div>
        </div>

        {/* 4. Limite Total & Disponível */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Limite Disponível</span>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {mask(fmt(consolidatedMetrics.totalAvailable))}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Limite global: {mask(fmt(consolidatedMetrics.totalLimits))}
            </p>
          </div>
        </div>
      </div>

      {/* Lista Principal de Cartões com Faturas do Mês Selecionado */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
            <span>Faturas e Limites por Cartão</span>
            <Badge variant="secondary" className="text-xs font-medium">
              {cards.length} {cards.length === 1 ? "cartão" : "cartões"}
            </Badge>
          </h3>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-12">Carregando cartões e faturas...</div>
        ) : cards.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border/60 bg-muted/10">
            <CreditCardIcon className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <h4 className="text-base font-semibold text-foreground mb-1">Nenhum cartão ativo cadastrado</h4>
            <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
              Cadastre seus cartões de crédito para acompanhar faturas e limites consolidados.
            </p>
            {!readOnly && (
              <Button
                onClick={() => {
                  setEditingCard(null);
                  setShowForm(true);
                }}
                className="bg-primary shadow-xs"
              >
                <Plus className="h-4 w-4 mr-1" /> Cadastrar Primeiro Cartão
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {cardDataForSelectedMonth.map((item) => {
              const { card, cycle, invoiceTotal, paidTotal, pendingTotal, limit, isPaid, isOverdue, isDueToday } = item;
              const bank = getBank(card.bank);

              return (
                <Card
                  key={card.id}
                  no3d
                  className={`overflow-hidden border transition-all duration-200 hover:shadow-md rounded-2xl ${
                    isOverdue
                      ? "border-destructive/40 bg-destructive/[0.015]"
                      : isDueToday
                      ? "border-amber-500/40 bg-amber-500/[0.015]"
                      : isPaid
                      ? "border-emerald-500/30 bg-emerald-500/[0.015]"
                      : "border-border/60 hover:border-primary/40 bg-card"
                  }`}
                >
                  {/* Cartão Visual com Estilo do Banco */}
                  <div className="p-3.5 pb-2">
                    <div
                      className={`${bank.gradient} ${bank.textClass} relative aspect-[1.586/1] w-full rounded-xl p-3.5 shadow-sm overflow-hidden flex flex-col justify-between`}
                    >
                      <div className="pointer-events-none absolute -top-6 -right-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
                      
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-6 rounded-sm bg-gradient-to-br from-[hsl(45,90%,75%)] to-[hsl(40,80%,50%)] border border-[hsl(45,90%,80%)]/40 shadow-xs" />
                          <Wifi className="h-3 w-3 rotate-90 opacity-80" />
                        </div>
                        <span className="text-xs font-bold tracking-wide truncate max-w-[65%] text-right drop-shadow-xs">
                          {card.nickname || bank.name}
                        </span>
                      </div>

                      <div className="flex items-end justify-between">
                        <div>
                          <div className="font-mono text-xs sm:text-sm tracking-[0.15em] opacity-95 drop-shadow-xs">
                            •••• {card.lastFour || "0000"}
                          </div>
                          <div className="text-[10px] opacity-80 mt-0.5">
                            Vence dia {card.dueDay} ({format(cycle.dueDate, "dd/MM", { locale: ptBR })})
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold italic opacity-95 drop-shadow-xs">
                            {brandLabel(card.brand)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Informações Financeiras do Mês */}
                  <CardContent className="p-3.5 pt-1 space-y-3">
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">Fatura do Mês</p>
                        <p className="text-base font-extrabold text-foreground tabular-nums">
                          {mask(fmt(invoiceTotal))}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">Status</p>
                        {isPaid ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] py-0 px-2">
                            Fatura Paga
                          </Badge>
                        ) : isOverdue ? (
                          <Badge variant="destructive" className="text-[10px] py-0 px-2">
                            Atrasada
                          </Badge>
                        ) : isDueToday ? (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] py-0 px-2">
                            Vence Hoje
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] py-0 px-2">
                            Aberta
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Detalhamento de Valores */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Valor Pago</p>
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {mask(fmt(paidTotal))}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">Saldo a Pagar</p>
                        <p className="font-semibold text-foreground tabular-nums">
                          {mask(fmt(pendingTotal))}
                        </p>
                      </div>
                    </div>

                    {/* Limite Total e Disponível (fixo no momento atual) */}
                    {limit > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Limite: {mask(fmt(limit))}</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            Disponível: {mask(fmt(item.currentAvailable))}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(100, Math.round((item.currentPending / limit) * 100))}
                          className="h-1.5 bg-muted"
                        />
                      </div>
                    )}

                    {/* Botões de Ação */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-semibold rounded-xl w-full justify-center"
                        onClick={() => openInvoiceDetail(card)}
                      >
                        <Receipt className="h-3.5 w-3.5 mr-1" />
                        Ver Fatura
                      </Button>

                      {!readOnly && (
                        <Button
                          size="sm"
                          className="h-8 text-xs font-semibold rounded-xl w-full justify-center bg-primary"
                          onClick={() => openInvoicePay(card)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          {isPaid ? "Editar Fatura" : "Pagar Fatura"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Projeção de Faturas dos Próximos Meses (Abaixo da lista de cartões) */}
      <Card no3d className="rounded-2xl border border-border/60 overflow-hidden shadow-xs">
        <CardHeader className="p-4 sm:p-5 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-sm sm:text-base font-bold text-foreground">
                  Projeção de Faturas Futuras (Próximos 6 Meses)
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Previsão consolidada de parcelas futuras e gastos recorrentes já programados.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
            {futureProjections.map((proj) => (
              <button
                key={proj.monthKey}
                type="button"
                onClick={() => setSelectedMonth(proj.monthKey)}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[90px] cursor-pointer ${
                  proj.isSelected
                    ? "bg-primary/10 border-primary shadow-xs ring-1 ring-primary/30"
                    : "bg-muted/20 hover:bg-muted/40 border-border/60"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold capitalize text-foreground">
                      {proj.shortLabel}
                    </span>
                    {proj.isCurrent && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                        Atual
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {proj.cardsCount} {proj.cardsCount === 1 ? "cartão c/ gasto" : "cartões"}
                  </p>
                </div>

                <p className="text-sm font-extrabold text-foreground tabular-nums mt-2">
                  {mask(fmt(proj.total))}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modais de Formulário, Fatura e Exclusão */}
      {showForm && (
        <CreditCardForm
          initial={editingCard ?? undefined}
          onSave={async (input) => {
            if (editingCard) {
              await updateCard(editingCard.id, input);
            } else {
              await addCard(input);
            }
            setShowForm(false);
            setEditingCard(null);
          }}
          onClose={() => {
            setShowForm(false);
            setEditingCard(null);
          }}
        />
      )}

      {invoiceCard && (
        <CreditCardInvoice
          card={invoiceCard}
          onClose={() => {
            setInvoiceCard(null);
            setInvoiceAutoOpenPayment(false);
          }}
          autoOpenPayment={invoiceAutoOpenPayment}
          readOnly={readOnly}
          referenceMonth={selectedMonth}
        />
      )}

      {deletingCard && (
        <ConfirmDeleteDialog
          open={!!deletingCard}
          onOpenChange={(open) => !open && setDeletingCard(null)}
          onConfirm={() => {
            if (deletingCard) {
              deleteCard(deletingCard.id);
              setDeletingCard(null);
            }
          }}
          title="Excluir Cartão de Crédito"
          description={`Tem certeza que deseja excluir o cartão "${
            deletingCard.nickname || getBank(deletingCard.bank).name
          }"? Todas as faturas associadas também deixarão de ser vinculadas a este cartão.`}
        />
      )}
    </div>
  );
}
