import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { formatDateBR } from "@/features/financial/lib/formatDateSafe";
import { useIncomes, Income, IncomeStatus } from "@/features/financial/hooks/useIncomes";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useClients } from "@/features/clients/hooks/useClients";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useProducts } from "@/features/sales/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { todayInAppTz, todayDateInAppTz } from "@/lib/timezone";
import { IncomeBalanceCard } from "./IncomeBalanceCard";
import { IncomeDashboard } from "./IncomeDashboard";
import { FinancialHealthDashboard } from "./FinancialHealthDashboard";

import { IncomePendingCalendar } from "./IncomePendingCalendar";
import { IncomeForm, INCOME_CATEGORIES } from "./IncomeForm";
import { isVehicleExpenseForVehicles } from "@/features/vehicles/components/VehicleExpenseForm";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { MonthTransactionsSheet } from "./MonthTransactionsSheet";
import { FinancialStatement } from "./FinancialStatement";
import { PiggyBanksSummaryCard } from "@/features/piggyBanks/components/PiggyBanksSummaryCard";
import { SilentErrorBoundary } from "@/components/SilentErrorBoundary";
import { getDueStatus } from "@/features/financial/lib/dueStatus";
import { FinancialListMiniCard, HeroCardSkeleton, MetricGridSkeleton } from "@/features/financial/components/financial";
const IncomeTelegramBotButton = lazy(() =>
  import("./IncomeTelegramBotButton")
    .then((m) => ({ default: m.IncomeTelegramBotButton }))
    .catch(() => ({ default: () => null })),
);
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Search, Copy, Pencil, Trash2, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight, CalendarCheck, ChevronDown } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { validateIncomeDate } from "@/features/financial/lib/paymentValidation";
import { toast } from "sonner";
import { EditScopeDialog } from "@/components/EditScopeDialog";
import { applyIncomeScopedUpdate, isIncomeInSeries } from "@/features/financial/lib/seriesEdit";
import { useFinanceComponentDebug } from "@/lib/financeDebug";
import { totalPartialPaid, incomeOutstanding } from "@/features/financial/lib/partialPayments";

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<IncomeStatus, string> = {
  received: "Recebido",
  pending: "Pendente",
  overdue: "Atrasado",
};

const STATUS_BADGE: Record<IncomeStatus, string> = {
  received: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  pending: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  overdue: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

/** Cor do registro pendente conforme o vencimento (azul futuro, laranja hoje, vermelho atrasado). */
function incomeStatusBadgeClass(status: IncomeStatus, dueDate?: string | null) {
  if (status !== "pending") return STATUS_BADGE[status];
  const due = getDueStatus(dueDate, false);
  if (due === "overdue") return STATUS_BADGE.overdue;
  if (due === "due_today") return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  return STATUS_BADGE.pending;
}

function incomeMiniCardStatus(status: IncomeStatus, dueDate?: string | null) {
  if (status === "received") return "paid" as const;
  if (status === "overdue") return "overdue" as const;
  const due = getDueStatus(dueDate, false);
  if (due === "overdue") return "overdue" as const;
  if (due === "due_today") return "due_today" as const;
  return "scheduled" as const;
}

interface Props {
  readOnly?: boolean;
}

export function IncomeList({ readOnly }: Props) {
  useFinanceComponentDebug("IncomeList");
  const { incomes, loading: incomesLoading, addIncome, updateIncome, deleteIncome, duplicateIncome, markReceived, payIncomePartial } = useIncomes();
  const { expenses: rawExpenses, payExpense } = useExpenses();
  const { sales: rawSales } = useProducts();
  const { clients } = useClients();
  const { activeMethods } = usePaymentMethods();

  // Isolamento da aba Veículos: receitas/despesas/aluguéis de veículos
  // não devem impactar saldos, listas ou relatórios da aba Receitas.
  const expenses = useMemo(
    () => rawExpenses.filter((e) => !isVehicleExpenseForVehicles(e)),
    [rawExpenses],
  );
  const sales = useMemo(
    () => rawSales.filter((s) => s.businessType !== "aluguel_veiculo"),
    [rawSales],
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Income | null>(null);
  const [deleteScope, setDeleteScope] = useState<"single" | "pending" | "all">("single");
  const [sheetType, setSheetType] = useState<"incomes" | "expenses" | null>(null);
  const [sheetInitialFilter, setSheetInitialFilter] = useState<string | undefined>(undefined);
  const [statementOpen, setStatementOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Income | null>(null);
  const [payDate, setPayDate] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [partialMode, setPartialMode] = useState(false);
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [paySaving, setPaySaving] = useState(false);
  const [viewDateTarget, setViewDateTarget] = useState<Income | null>(null);
  const [editingPayDate, setEditingPayDate] = useState(false);
  const [editPayDateValue, setEditPayDateValue] = useState("");
  const [savingPayDate, setSavingPayDate] = useState(false);
  const [incomesExpanded, setIncomesExpanded] = useState(false);
  const [pendingIncomeScope, setPendingIncomeScope] = useState<
    { target: Income; data: Omit<Income, "id" | "createdAt"> } | null
  >(null);


  const nowD = todayDateInAppTz();
  const [selectedMonth, setSelectedMonth] = useState<string>(
    `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`,
  );
  const monthKey = selectedMonth;
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const prevMonth = () => {
    const d = new Date(selYear, selMonthNum - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(selYear, selMonthNum, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  useEffect(() => {
    if (readOnly) return;
    const handler = () => { setEditing(null); setFormOpen(true); };
    window.addEventListener("open-income-form", handler as EventListener);
    return () => window.removeEventListener("open-income-form", handler as EventListener);
  }, [readOnly]);

  const filtered = useMemo(() => {
    let arr = incomes.filter((i) => {
      if (i.source === "Ajuste manual") return false;
      const inMonth = i.receivedDate.startsWith(monthKey);
      const belongsToRecurringSeries = Boolean(i.parentId) || i.recurrence !== "once";
      const carriedOver = !belongsToRecurringSeries && i.status !== "received" && i.receivedDate < monthKey + "-01";
      if (!inMonth && !carriedOver) return false;
      
      if (statusFilter === "pending_all" || statusFilter === "pending") {
        if (i.status !== "pending" && i.status !== "overdue") return false;
      } else if (statusFilter === "overdue") {
        if (i.status !== "overdue") return false;
      } else if (statusFilter === "received") {
        if (i.status !== "received") return false;
      } else if (statusFilter !== "all") {
        if (i.status !== statusFilter) return false;
      }
      if (categoryFilter !== "all" && (i.category || "Outros") !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const cName = clients.find((c) => c.id === i.clientId)?.name || "";
        const haystack = `${i.description} ${i.category ?? ""} ${i.source ?? ""} ${cName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    arr = [...arr].sort((a, b) => {
      if (sortBy === "amount") return a.amount - b.amount;
      return a.receivedDate.localeCompare(b.receivedDate);
    });
    return arr;
  }, [incomes, search, statusFilter, categoryFilter, sortBy, clients, monthKey]);

  const clientName = (i: Income) =>
    i.clientId ? clients.find((c) => c.id === i.clientId)?.name || "—" : (i.source || "—");

  const methodName = (id: string | null) =>
    id ? activeMethods.find((m) => m.id === id)?.name || "—" : "—";

  return (
    <div className="space-y-4 overflow-x-hidden max-w-full">
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button type="button"
          className="text-sm font-medium text-foreground min-w-[140px] text-center capitalize hover:text-primary transition-colors"
          onClick={() => {
            const n = todayDateInAppTz();
            setSelectedMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
          }}
        >
          {format(new Date(selYear, selMonthNum - 1, 1), "MMMM yyyy", { locale: ptBR })}
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {incomesLoading && incomes.length === 0 ? (
        <div className="space-y-3">
          <HeroCardSkeleton />
          <MetricGridSkeleton />
        </div>
      ) : (
      <IncomeBalanceCard
        incomes={incomes}
        expenses={expenses}
        readOnly={readOnly}
        monthKey={monthKey}
        onOpenIncomes={() => { setSheetInitialFilter(undefined); setSheetType("incomes"); }}
        onOpenExpenses={() => { setSheetInitialFilter(undefined); setSheetType("expenses"); }}
        onOpenPendingIncomes={() => { setSheetInitialFilter("pending"); setSheetType("incomes"); }}
        onOpenPendingExpenses={() => { setSheetInitialFilter("pending"); setSheetType("expenses"); }}
        onOpenStatement={() => setStatementOpen(true)}
        statementLeftSlot={!readOnly ? (
          <SilentErrorBoundary>
            <Suspense fallback={null}>
              <IncomeTelegramBotButton />
            </Suspense>
          </SilentErrorBoundary>
        ) : undefined}
        onAdjust={async (delta) => {
          if (!delta) return;
          const today = todayInAppTz();
          await addIncome({
            description: delta >= 0 ? "Ajuste de saldo (entrada)" : "Ajuste de saldo (saída)",
            amount: Number(delta.toFixed(2)),
            category: "Outros",
            clientId: null,
            source: "Ajuste manual",
            paymentMethodId: null,
            receivedDate: today,
            status: "received",
            notes: "Ajuste manual de saldo",
            recurrence: "once",
            parentId: null,
          });
        }}
      />
      )}

      <MonthTransactionsSheet
        open={sheetType !== null}
        onOpenChange={(o) => { if (!o) setSheetType(null); }}
        type={sheetType ?? "incomes"}
        monthKey={monthKey}
        incomes={incomes}
        expenses={expenses}
        sales={sales}
        initialFilter={sheetInitialFilter}
        onPayIncome={async (id, { date, amount }) => {
          const target = incomes.find((i) => i.id === id);
          if (!target) return;
          const check = validateIncomeDate(target, incomes, date);
          if (!check.ok) { toast.error(check.reason || "Data já utilizada por outra ocorrência."); throw new Error("invalid"); }
          const isRecurring = !!target.parentId || target.recurrence !== "once";
          const patch: any = {
            status: "received",
            amount: amount ?? target.amount,
            actualReceivedDate: date,
          };
          if (!isRecurring) patch.receivedDate = date;
          await updateIncome(id, patch);
        }}
        onPayExpense={async (id, { date, amount }) => {
          await payExpense(id, false, date, amount);
        }}
      />

      <Sheet open={statementOpen} onOpenChange={setStatementOpen}>
        <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Extrato Financeiro</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <FinancialStatement />
          </div>
        </SheetContent>
      </Sheet>

      <Card no3d className="p-4">
        <button
          type="button"
          onClick={() => setIncomesExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 flex-wrap text-left rounded-lg -m-1 p-1 hover:bg-muted/40 active:bg-muted/60 transition-colors"
          aria-expanded={incomesExpanded}
          aria-controls="receitas-content"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Receitas ({filtered.length})</h2>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${incomesExpanded ? "rotate-180" : ""}`}
            />
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground leading-none">
              {!incomesExpanded
                ? "Pendente"
                : statusFilter === "all" ? "Total"
                : statusFilter === "received" ? "Total recebido"
                : statusFilter === "pending" ? "Total a receber"
                : statusFilter === "overdue" ? "Total vencido"
                : statusFilter === "pending_all" ? "Total a receber"
                : "Total"}
            </div>
            <div className={`text-base font-bold ${
              !incomesExpanded ? "text-amber-600 dark:text-amber-400" :
              statusFilter === "received" ? "text-emerald-600 dark:text-emerald-400" :
              statusFilter === "overdue" ? "text-rose-600 dark:text-rose-400" :
              statusFilter === "pending" ? "text-amber-600 dark:text-amber-400" :
              "text-foreground"
            }`}>
              {fmtBRL(
                !incomesExpanded
                  ? incomes
                      .filter((i) =>
                        i.source !== "Ajuste manual" &&
                        i.receivedDate.startsWith(monthKey) &&
                        (i.status === "pending" || i.status === "overdue"),
                      )
                      .reduce((s, i) => s + i.amount, 0)
                  : filtered.reduce((s, i) => s + i.amount, 0),
              )}
            </div>
          </div>
        </button>

        <div
          id="receitas-content"
          className={`grid transition-all duration-300 ease-in-out ${incomesExpanded ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"}`}
        >
          <div className="overflow-hidden min-h-0">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Button
                type="button"
                size="sm"
                variant={statusFilter === "all" ? "default" : "outline"}
                className="h-9 rounded-full min-w-0"
                onClick={() => setStatusFilter("all")}
              >
                Todas
              </Button>
              <Button
                type="button"
                size="sm"
                variant={statusFilter === "pending" ? "default" : "outline"}
                className="h-9 rounded-full min-w-0 gap-1.5"
                onClick={() => setStatusFilter("pending")}
              >
                <Clock className="h-3.5 w-3.5" /> Pendentes
              </Button>
              <Button
                type="button"
                size="sm"
                variant={statusFilter === "received" ? "default" : "outline"}
                className="h-9 rounded-full min-w-0 gap-1.5"
                onClick={() => setStatusFilter("received")}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Pagas
              </Button>
            </div>

            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9 w-full" />
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">Nenhuma receita encontrada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Mobile: mini cards padronizados */}
                <div className="md:hidden space-y-2">
                  {filtered.map((i) => {
                    const isReceived = i.status === "received";
                    const actual = i.actualReceivedDate || i.receivedDate;
                    const dateToShow = isReceived && actual ? actual : i.receivedDate;
                    const alreadyPartial = totalPartialPaid(i.notes);
                    const outstanding = incomeOutstanding(i);

                    const isPartialIncome = alreadyPartial > 0 && i.status !== "received";

                    return (
                      <FinancialListMiniCard
                        key={i.id}
                        title={i.description}
                        amount={fmtBRL(isPartialIncome ? outstanding : i.amount)}
                        amountTone={isPartialIncome ? "neutral" : "income"}
                        status={isPartialIncome ? "pending" : incomeMiniCardStatus(i.status, i.receivedDate)}
                        statusLabel={isPartialIncome ? `Parcial (${fmtBRL(alreadyPartial)})` : STATUS_LABEL[i.status]}
                        category={i.category || undefined}
                        dueDate={formatDateBR(i.receivedDate, "dd/MM/yyyy")}
                        paidDate={isReceived && i.actualReceivedDate ? formatDateBR(i.actualReceivedDate, "dd/MM/yyyy") : undefined}
                        progress={isPartialIncome ? Math.min(100, Math.round((alreadyPartial / i.amount) * 100)) : undefined}
                        progressLabel={isPartialIncome ? `Recebido ${fmtBRL(alreadyPartial)} de ${fmtBRL(i.amount)} (restante: ${fmtBRL(outstanding)})` : undefined}
                        meta={
                          <>
                            {clientName(i) && <span>{clientName(i)}</span>}
                            {methodName(i.paymentMethodId) && <span>· {methodName(i.paymentMethodId)}</span>}
                            {i.recurrence !== "once" && (
                              <span className="text-primary">↻ {({ weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal", yearly: "Anual" } as Record<string, string>)[i.recurrence] ?? i.recurrence}</span>
                            )}
                          </>
                        }
                        actions={
                          !readOnly ? (
                            <div className="grid grid-cols-4 gap-1.5 w-full">
                              <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setViewDateTarget(i); }} className="h-8 w-full px-0" title="Data" aria-label="Data">
                                <CalendarCheck className="h-4 w-4" />
                              </Button>
                              <Button type="button" data-mutation variant="outline" size="sm" disabled={i.status === "received"} onClick={(e) => { e.stopPropagation(); setPayTarget(i); setPayDate(todayInAppTz()); setPayAmount(""); setPartialMode(false); setPartialAmount(""); }} className="h-8 w-full px-0 disabled:opacity-40" title="Pagar" aria-label="Pagar">
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditing(i); setFormOpen(true); }} className="h-8 w-full px-0 text-muted-foreground hover:text-foreground" title="Editar" aria-label="Editar">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteTarget(i); setDeleteScope("single"); }} className="h-8 w-full px-0 text-destructive hover:bg-destructive hover:text-destructive-foreground" title="Excluir" aria-label="Excluir">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : undefined
                        }
                      />
                    );
                  })}
                </div>

                {/* Desktop/Tablet: layout denso original */}
                <div className="hidden md:block space-y-2">
                {filtered.map((i) => {
                  const alreadyPartial = totalPartialPaid(i.notes);
                  const outstanding = incomeOutstanding(i);
                  const isPartialIncome = alreadyPartial > 0 && i.status !== "received";

                  return (
                  <div
                    key={i.id}
                    className="rounded-xl border border-border/40 bg-card/60 p-3 sm:p-4 hover:border-border/80 transition-all"
                  >
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{i.description}</span>
                          <Badge variant="outline" className={incomeStatusBadgeClass(i.status, i.receivedDate)}>
                            {i.status === "received" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {i.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                            {i.status === "overdue" && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {STATUS_LABEL[i.status]}
                          </Badge>
                          {isPartialIncome && (
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-xs font-semibold">
                              Parcial ({fmtBRL(alreadyPartial)} de {fmtBRL(i.amount)})
                            </Badge>
                          )}
                          {i.category && <Badge variant="secondary" className="text-xs">{i.category}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          {(() => {
                            const isReceived = i.status === "received";
                            const actual = i.actualReceivedDate || i.receivedDate;
                            const showActual = isReceived && actual;
                            const dateToShow = showActual ? actual : i.receivedDate;
                            const dueDiff = showActual && i.actualReceivedDate && i.actualReceivedDate !== i.receivedDate
                              ? Math.round((new Date(i.actualReceivedDate + "T00:00:00").getTime() - new Date(i.receivedDate + "T00:00:00").getTime()) / 86400000)
                              : 0;
                            return (
                              <>
                                <span>
                                  {showActual ? "Recebido em " : ""}{formatDateBR(dateToShow, "dd/MM/yyyy")}
                                  {dueDiff !== 0 && (
                                    <span className="ml-1 text-[10px] text-muted-foreground/80">
                                      (venc. {formatDateBR(i.receivedDate, "dd/MM")} · {dueDiff > 0 ? `+${dueDiff}` : dueDiff}d)
                                    </span>
                                  )}
                                </span>
                              </>
                            );
                          })()}
                          <span>{clientName(i)}</span>
                          <span>{methodName(i.paymentMethodId)}</span>
                          {i.recurrence !== "once" && <span className="text-primary">↻ {({ weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal", yearly: "Anual" } as Record<string, string>)[i.recurrence] ?? i.recurrence}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${isPartialIncome ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {fmtBRL(isPartialIncome ? outstanding : i.amount)}
                        </div>
                        {isPartialIncome && (
                          <div className="text-xs text-muted-foreground">
                            Restante de {fmtBRL(i.amount)}
                          </div>
                        )}
                      </div>
                    </div>
                    {!readOnly && (
                       <div className="flex items-center justify-between gap-1 mt-3 pt-3 border-t border-border/30">
                          <Button
                            variant="ghost"
                            onClick={() => setViewDateTarget(i)}
                            className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0"
                            title="Ver data de pagamento"
                            aria-label="Ver data de pagamento"
                          >
                            <CalendarCheck className="h-4 w-4" />
                            <span className="hidden md:inline">Data</span>
                          </Button>
                          {i.status !== "received" && (
                            <Button data-mutation
                              variant="outline"
                              onClick={() => {
                                setPayTarget(i);
                                setPayDate(todayInAppTz());
                                setPayAmount("");
                                setPartialMode(false);
                                setPartialAmount("");
                              }}
                              className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0"
                              title="Pagar"
                              aria-label="Pagar"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="hidden md:inline">Pagar</span>
                            </Button>
                          )}
                          <Button data-mutation variant="ghost" onClick={() => { setEditing(i); setFormOpen(true); }} className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0" title="Editar" aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                            <span className="hidden md:inline">Editar</span>
                          </Button>
                          <Button data-mutation variant="ghost" onClick={() => duplicateIncome(i.id)} className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0" title="Duplicar" aria-label="Duplicar">
                            <Copy className="h-4 w-4" />
                            <span className="hidden md:inline">Duplicar</span>
                          </Button>
                          <Button data-mutation variant="ghost" onClick={() => { setDeleteTarget(i); setDeleteScope("single"); }} className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0 text-destructive hover:text-destructive" title="Excluir" aria-label="Excluir">
                            <Trash2 className="h-4 w-4" />
                            <span className="hidden md:inline">Excluir</span>
                          </Button>
                       </div>
                    )}
                  </div>
                );
                })}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <PiggyBanksSummaryCard readOnly={readOnly} />
      <IncomePendingCalendar
        incomes={incomes.filter((i) => i.source !== "Ajuste manual")}
        expenses={expenses}
        allIncomes={incomes}
        allExpenses={expenses}
        monthKey={monthKey}
        onMonthChange={setSelectedMonth}
      />
      <FinancialHealthDashboard
        incomes={incomes}
        expenses={expenses}
        monthKey={monthKey}
        mode="overall"
      />
      <IncomeDashboard
        incomes={incomes.filter(
          (i) =>
            i.source !== "Ajuste manual" &&
            i.receivedDate.startsWith(monthKey) &&
            i.status !== "received",
        )}
        allMonthIncomes={incomes.filter(
          (i) => i.source !== "Ajuste manual" && i.receivedDate.startsWith(monthKey),
        )}
        allIncomes={incomes.filter((i) => i.source !== "Ajuste manual")}
        sales={sales}
        monthKey={monthKey}
      />

      <IncomeForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing}
        onSubmit={async (data) => {
          if (editing) {
            if (isIncomeInSeries(editing, incomes)) {
              setPendingIncomeScope({ target: editing, data });
            } else {
              await updateIncome(editing.id, data);
            }
          } else {
            await addIncome(data);
          }
        }}
      />

      <Dialog
        open={!!payTarget}
        onOpenChange={(o) => {
          if (!o) {
            setPayTarget(null);
            setPartialMode(false);
            setPartialAmount("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pagar receita</DialogTitle>
            <DialogDescription>
              {partialMode
                ? "Informe o valor do pagamento parcial. O restante continuará pendente."
                : "Confirme a data e o valor recebido."}
            </DialogDescription>
          </DialogHeader>
          {payTarget && (() => {
            const totalAmount = payTarget.amount;
            const alreadyPartial = totalPartialPaid(payTarget.notes);
            const outstanding = incomeOutstanding(payTarget);

            return (
              <div className="space-y-3">
                <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                  <div className="font-medium truncate">{payTarget.description}</div>
                  <div className="text-xs text-muted-foreground">
                    Valor cadastrado: {fmtBRL(totalAmount)}
                  </div>
                  {alreadyPartial > 0 && (
                    <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      Já recebido: {fmtBRL(alreadyPartial)} • Saldo pendente: {fmtBRL(outstanding)}
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Data do recebimento</Label>
                  <DatePickerField value={payDate} onChange={setPayDate} />
                </div>

                {partialMode ? (
                  <div>
                    <Label htmlFor="income-partial-amount" className="text-xs">Valor do pagamento parcial</Label>
                    <Input
                      id="income-partial-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={outstanding}
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      placeholder={outstanding.toFixed(2)}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Máximo: {fmtBRL(outstanding)}. O restante continuará pendente.
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="income-pay-amount" className="text-xs">Valor recebido (opcional)</Label>
                    <Input
                      id="income-pay-amount"
                      type="number"
                      step="0.01"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder={outstanding.toFixed(2)}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Em branco usa o valor pendente ({fmtBRL(outstanding)}).
                    </p>
                  </div>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-0 text-xs text-primary"
                  onClick={() => {
                    setPartialMode((v) => !v);
                    setPartialAmount("");
                  }}
                >
                  {partialMode ? "Receber valor total" : "Registrar pagamento parcial"}
                </Button>
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPayTarget(null);
                setPartialMode(false);
                setPartialAmount("");
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={paySaving || !payDate}
              onClick={async () => {
                if (!payTarget) return;
                const check = validateIncomeDate(payTarget, incomes, payDate);
                if (!check.ok) {
                  toast.error(check.reason || "Data já utilizada por outra ocorrência.");
                  return;
                }
                setPaySaving(true);
                const outstanding = incomeOutstanding(payTarget);

                if (partialMode) {
                  const parsed = parseFloat(partialAmount);
                  if (!parsed || isNaN(parsed) || parsed <= 0) {
                    toast.error("Informe um valor válido para o pagamento parcial");
                    setPaySaving(false);
                    return;
                  }
                  const ok = await payIncomePartial(payTarget.id, Math.min(parsed, outstanding), payDate);
                  if (ok) {
                    if (parsed >= outstanding - 0.005) {
                      toast.success("Receita quitada com sucesso!");
                    } else {
                      toast.success(`Pagamento parcial de ${fmtBRL(parsed)} registrado! Saldo: ${fmtBRL(outstanding - parsed)}`);
                    }
                  }
                } else {
                  const finalAmount = payAmount.trim() && Number(payAmount) > 0
                    ? Number(payAmount)
                    : outstanding || payTarget.amount;
                  const isRecurringOccurrence =
                    !!payTarget.parentId || payTarget.recurrence !== "once";
                  const patch: any = {
                    status: "received",
                    amount: finalAmount,
                    actualReceivedDate: payDate,
                  };
                  if (!isRecurringOccurrence) {
                    patch.receivedDate = payDate;
                  }
                  await updateIncome(payTarget.id, patch);
                  toast.success("Receita confirmada como recebida!");
                }
                setPaySaving(false);
                setPayTarget(null);
                setPartialMode(false);
                setPartialAmount("");
              }}
            >
              {paySaving ? "Salvando..." : (partialMode ? "Registrar pagamento parcial" : "Confirmar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteTarget && (() => {
        const isRecurring = Boolean(deleteTarget.parentId) || deleteTarget.recurrence !== "once";
        if (!isRecurring) {
          return (
            <ConfirmDeleteDialog
              open={!!deleteTarget}
              onOpenChange={(o) => !o && setDeleteTarget(null)}
              title="Excluir receita?"
              description="Esta ação não pode ser desfeita. Se a receita estava marcada como recebida, o saldo será revertido."
              onConfirm={async () => {
                await deleteIncome(deleteTarget.id, "single");
                setDeleteTarget(null);
              }}
            />
          );
        }
        return (
          <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Excluir receita recorrente</DialogTitle>
                <DialogDescription>
                  Esta receita faz parte de uma série recorrente. Escolha o que deseja excluir.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {[
                  { value: "single", label: "Apenas esta receita", desc: "Exclui somente a ocorrência selecionada." },
                  { value: "pending", label: "Apenas as pendentes", desc: "Exclui esta e todas as ocorrências não recebidas da série." },
                  { value: "all", label: "Todas da série", desc: "Exclui todas as ocorrências, inclusive já recebidas." },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDeleteScope(opt.value as any)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${deleteScope === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                <Button data-mutation
                  variant="destructive"
                  onClick={async () => {
                    await deleteIncome(deleteTarget.id, deleteScope);
                    setDeleteTarget(null);
                  }}
                >
                  Excluir
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      <Dialog open={!!viewDateTarget} onOpenChange={(o) => { if (!o) { setViewDateTarget(null); setEditingPayDate(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Data de pagamento</DialogTitle>
            <DialogDescription>
              {viewDateTarget?.description}
            </DialogDescription>
          </DialogHeader>
          {viewDateTarget && (
            <div className="space-y-2 text-sm">
              {viewDateTarget.status === "received" ? (
                <>
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
                    <p className="text-xs text-muted-foreground">Recebido em</p>
                    {editingPayDate ? (
                      <div className="mt-1 space-y-2">
                        <DatePickerField value={editPayDateValue} onChange={setEditPayDateValue} />
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setEditingPayDate(false)}>Cancelar</Button>
                          <Button data-mutation
                            size="sm"
                            disabled={savingPayDate || !editPayDateValue}
                            onClick={async () => {
                              if (!viewDateTarget) return;
                              setSavingPayDate(true);
                              await updateIncome(viewDateTarget.id, { actualReceivedDate: editPayDateValue } as any);
                              setSavingPayDate(false);
                              setEditingPayDate(false);
                              setViewDateTarget({ ...viewDateTarget, actualReceivedDate: editPayDateValue });
                            }}
                          >
                            {savingPayDate ? "Salvando..." : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatDateBR(
                            viewDateTarget.actualReceivedDate || viewDateTarget.receivedDate,
                            "dd 'de' MMMM 'de' yyyy",
                          )}

                        </p>
                        <Button data-mutation
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Alterar data de pagamento"
                          aria-label="Alterar data de pagamento"
                          onClick={() => {
                            setEditPayDateValue(viewDateTarget.actualReceivedDate || viewDateTarget.receivedDate);
                            setEditingPayDate(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Valor: <span className="font-semibold text-foreground">{fmtBRL(viewDateTarget.amount)}</span>
                  </div>
                </>
              ) : (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-base font-semibold text-amber-700 dark:text-amber-400">
                    Ainda não recebida
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Vencimento: {formatDateBR(viewDateTarget.receivedDate, "dd/MM/yyyy")}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setViewDateTarget(null); setEditingPayDate(false); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditScopeDialog
        open={!!pendingIncomeScope}
        onOpenChange={(o) => { if (!o) setPendingIncomeScope(null); }}
        onConfirm={async (scope) => {
          if (!pendingIncomeScope) return;
          const { target, data } = pendingIncomeScope;
          try {
            await applyIncomeScopedUpdate({
              target,
              patch: {
                description: data.description,
                amount: data.amount,
                category: data.category,
                clientId: data.clientId,
                source: data.source,
                paymentMethodId: data.paymentMethodId,
                receivedDate: data.receivedDate,
                notes: data.notes,
              },
              scope,
              incomes,
              onUpdateLocal: async (id, patch) => { await updateIncome(id, patch); },
            });
            toast.success(
              scope === "all"
                ? "Receita e histórico atualizados"
                : scope === "pending"
                  ? "Esta receita e as próximas atualizadas"
                  : "Receita atualizada",
            );
          } finally {
            setPendingIncomeScope(null);
          }
        }}
      />
    </div>
  );
}

