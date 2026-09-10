import React, { useState, useMemo } from "react";
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
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CreditCardsDashboardTab({
  readOnly = false,
  initialMonth,
}: CreditCardsDashboardTabProps) {
  const currentMonthKey = useMemo(() => format(new Date(), "yyyy-MM"), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    initialMonth || currentMonthKey
  );

  const { cards: allCards, loading, deleteCard } = useCreditCards();
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

  // Cálculo das faturas para cada cartão no mês selecionado
  const cardDataForSelectedMonth = useMemo(() => {
    return cards.map((card) => {
      const cycle =
        getCycleForDueMonth(selectedMonth, card.closingDay, card.dueDay) || {
          from: new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, card.closingDay),
          to: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), card.closingDay),
          dueDate: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), card.dueDay),
        };

      const inCycleExpenses = expandedAll
        .filter((e) => e.scope === "personal")
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

      const limit = Number(card.limit ?? 0);
      const available = Math.max(0, limit - pendingTotal);

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
        available,
        isPaid,
        isOverdue,
        isDueToday,
        cycleKey,
      };
    });
  }, [cards, selectedMonth, selectedDate, expandedAll, getOpening]);

  // Métricas Consolidadas do Mês Selecionado
  const consolidatedMetrics = useMemo(() => {
    let totalInvoices = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalLimits = 0;
    let totalAvailable = 0;
    let paidCount = 0;
    let overdueCount = 0;

    cardDataForSelectedMonth.forEach((c) => {
      totalInvoices += c.invoiceTotal;
      totalPaid += c.paidTotal;
      totalPending += c.pendingTotal;
      totalLimits += c.limit;
      totalAvailable += c.available;
      if (c.isPaid) paidCount++;
      if (c.isOverdue) overdueCount++;
    });

    const usedPercentage =
      totalLimits > 0 ? Math.min(100, Math.round((totalInvoices / totalLimits) * 100)) : 0;

    return {
      totalInvoices,
      totalPaid,
      totalPending,
      totalLimits,
      totalAvailable,
      paidCount,
      overdueCount,
      usedPercentage,
    };
  }, [cardDataForSelectedMonth]);

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
          .filter((e) => e.scope === "personal")
          .filter((e) => belongsToCardInvoice(e, card, cycle.from, cycle.to));

        const amount = inCycleExpenses.reduce((s, e) => s + invoiceItemValue(e), 0);
        if (amount > 0) {
          totalMonth += amount;
          cardBreakdown.push({
            cardName: card.nickname || card.bank || `Final ${card.lastFour}`,
            amount,
          });
        }
      });

      projections.push({
        monthKey,
        label: format(monthDate, "MMMM 'de' yyyy", { locale: ptBR }),
        shortLabel: format(monthDate, "MMM/yy", { locale: ptBR }),
        total: totalMonth,
        cardBreakdown,
        isCurrent: offset === 0,
      });
    }

    return projections;
  }, [cards, expandedAll]);

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 border border-primary/20 shadow-xs">
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-2 shrink-0">
          {inactiveCards.length > 0 && (
            <Button
              onClick={() => setShowInactive((v) => !v)}
              size="sm"
              variant="outline"
              className="h-9 text-xs font-semibold rounded-xl"
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
              className="h-9 text-xs font-semibold rounded-xl bg-primary shadow-xs"
            >
              <Plus className="h-4 w-4 mr-1" /> Novo Cartão
            </Button>
          )}
        </div>
      </div>

      {/* Seletor de Período (Mês Atual, Próximos Meses e Anteriores) */}
      <div className="space-y-2.5 p-3.5 sm:p-4 rounded-2xl bg-card border border-border/60 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-xl shrink-0"
              onClick={handlePrevMonth}
              title="Mês Anterior"
              aria-label="Mês Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="px-3 py-1 rounded-xl bg-primary/10 border border-primary/20 text-center min-w-[170px]">
              <span className="text-xs sm:text-sm font-bold text-primary capitalize">
                {format(selectedDate, "MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-xl shrink-0"
              onClick={handleNextMonth}
              title="Próximo Mês"
              aria-label="Próximo Mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {selectedMonth !== currentMonthKey && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10 rounded-xl ml-1"
                onClick={handleCurrentMonth}
              >
                Mês Atual
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground flex items-center gap-2">
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
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-extrabold text-primary tabular-nums">
              {mask(fmt(consolidatedMetrics.totalAvailable))}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Limite global: {mask(fmt(consolidatedMetrics.totalLimits))}
            </p>
          </div>
        </div>
      </div>

      {/* Lista / Grid de Cartões no Mês Selecionado */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
            <CreditCardIcon className="h-4 w-4 text-primary" />
            Faturas por Cartão em{" "}
            <span className="capitalize">{format(selectedDate, "MMMM 'de' yyyy", { locale: ptBR })}</span>
          </h3>
          <span className="text-xs text-muted-foreground">
            {cardDataForSelectedMonth.length} {cardDataForSelectedMonth.length === 1 ? "cartão" : "cartões"}
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Carregando cartões...</div>
        ) : cardDataForSelectedMonth.length === 0 ? (
          <Card className="border-dashed p-8 text-center bg-muted/10">
            <CreditCardIcon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-semibold text-foreground">Nenhum cartão ativo encontrado</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Cadastre seus cartões de crédito para acompanhar faturas e limites consolidados.
            </p>
            {!readOnly && (
              <Button
                onClick={() => {
                  setEditingCard(null);
                  setShowForm(true);
                }}
                size="sm"
                className="rounded-xl"
              >
                <Plus className="h-4 w-4 mr-1" /> Cadastrar Cartão
              </Button>
            )}
          </Card>
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
                      className="p-3.5 rounded-xl text-white shadow-xs relative overflow-hidden flex flex-col justify-between min-h-[110px]"
                      style={{
                        background: bank?.gradient || "linear-gradient(135deg, #1e293b, #0f172a)",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs tracking-wider uppercase drop-shadow-xs">
                          {card.nickname || bank?.name || "Cartão"}
                        </span>
                        <Badge
                          variant="outline"
                          className="bg-black/30 border-white/20 text-white text-[10px] px-2 py-0 font-medium"
                        >
                          {brandLabel(card.brand)}
                        </Badge>
                      </div>

                      <div className="flex items-end justify-between pt-3">
                        <div className="font-mono text-xs text-white/90 tracking-widest drop-shadow-xs">
                          •••• {card.lastFour || "••••"}
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-white/70 uppercase">Vencimento</p>
                          <p className="font-semibold text-xs drop-shadow-xs">
                            Dia {card.dueDay} ({format(cycle.dueDate, "dd/MM")})
                          </p>
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

                    {/* Limite Utilizado */}
                    {limit > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Limite: {mask(fmt(limit))}</span>
                          <span>Disp: {mask(fmt(item.available))}</span>
                        </div>
                        <Progress
                          value={Math.min(100, Math.round((pendingTotal / limit) * 100))}
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

      {/* Projeção de Parcelas e Compromissos Futuros */}
      <Card no3d className="border-border/60 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Projeção de Faturas Futuras (Próximos Meses)
          </CardTitle>
          <CardDescription className="text-xs">
            Acompanhe o valor de compras parceladas já lançadas e compromissadas para os próximos ciclos.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {futureProjections.map((proj) => {
              const isSelected = proj.monthKey === selectedMonth;
              return (
                <button
                  key={proj.monthKey}
                  type="button"
                  onClick={() => setSelectedMonth(proj.monthKey)}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[90px] ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                      : "border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider">
                      {proj.shortLabel}
                    </span>
                    {proj.isCurrent && (
                      <span className="h-2 w-2 rounded-full bg-emerald-500" title="Mês Atual" />
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-bold text-foreground tabular-nums">
                      {mask(fmt(proj.total))}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {proj.cardBreakdown.length > 0
                        ? `${proj.cardBreakdown.length} cartão(ões)`
                        : "Sem lançamentos"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Modais e Dialogs de Fatura e Cartão */}
      {invoiceCard && (
        <CreditCardInvoice
          card={invoiceCard}
          onClose={() => setInvoiceCard(null)}
          referenceMonth={selectedMonth}
          autoOpenPayment={invoiceAutoOpenPayment}
        />
      )}

      {showForm && (
        <CreditCardForm
          open={showForm}
          onClose={() => setShowForm(false)}
          initial={editingCard}
        />
      )}

      {deletingCard && (
        <ConfirmDeleteDialog
          open={Boolean(deletingCard)}
          onClose={() => setDeletingCard(null)}
          onConfirm={async () => {
            if (deletingCard) {
              await deleteCard(deletingCard.id);
              setDeletingCard(null);
            }
          }}
          title="Excluir Cartão"
          description={`Tem certeza que deseja excluir o cartão ${deletingCard.nickname || deletingCard.bank}? Os lançamentos associados não serão apagados.`}
        />
      )}
    </div>
  );
}
