import React, { useState, useMemo, useCallback, useRef } from "react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useHideValues } from "@/contexts/HideValuesContext";
import { format } from "date-fns";
import { Loan, Payment, InstallmentSchedule, Client, PaymentSplit } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { todayInAppTz, formatYmdInAppTz } from "@/lib/timezone";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calculateInstallment, calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { getInstallmentAmount, getOverdueAmount } from "@/features/loans/lib/loanInstallmentAmount";
import { getLoanLateFees, getBaseRemainingAmount, getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { cn } from "@/lib/utils";
import {
  CheckCircle, CheckCircle2, Trash2, DollarSign, User, Calendar as CalendarIcon, LayoutGrid, List,
  Search, Percent, Pencil, Check, X, ChevronDown, ChevronRight, ChevronUp, FolderOpen, Folder, HandCoins, Tag, MoreHorizontal, MessageCircle, Filter, SlidersHorizontal, History, UserCog, Calculator, BellRing, BellOff, RefreshCw, FileDown, AlertTriangle, StickyNote, ShoppingBag, Clock,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { usePaymentCelebration } from "@/hooks/usePaymentCelebration";
import { AdjustDueDateDialog } from "@/components/AdjustDueDateDialog";
import { AmortizationSimulator } from "@/components/AmortizationSimulator";
import { RenegotiateLoanDialog } from "@/components/RenegotiateLoanDialog";
import { useLoanRenegotiations } from "@/features/loans/hooks/useLoanRenegotiations";
import { useManagerCommissions } from "@/features/payroll/hooks/useManagerCommissions";
import { generateLoanReportPdf } from "@/features/loans/lib/loanReportPdf";
import type { LoanRenegotiation } from "@/types/loan";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useWhatsappBillingMessages } from "@/hooks/useWhatsappBillingMessages";
import { buildBillingWhatsappLink } from "@/lib/whatsappBilling";
import { WhatsappPreviewDialog } from "@/components/WhatsappPreviewDialog";
import { PartialPaymentDialog } from "@/features/loans/components/PartialPaymentDialog";
import { InterestResultCard } from "@/features/loans/components/InterestResultCard";
import { FullPaymentSummary } from "@/features/loans/components/FullPaymentSummary";
import { PayoffCompositionCard, PayoffSimulationCard } from "@/features/loans/components/PayoffCards";
import { AmortizationResultCard } from "@/features/loans/components/AmortizationResultCard";
import { OverdueAnalysisDialog } from "@/features/loans/components/OverdueAnalysisDialog";

import { LoanListSummaryCards } from "@/features/loans/components/list/LoanListSummaryCards";
import {
  LoanCategoryChips,
  LoanSearchBar,
  LoanQuickDateFilters,
  LoanAdvancedFilters,
  LoanSavedFiltersBar,
  LoanActiveFiltersBar,
} from "@/features/loans/components/list/LoanListFilters";
import { LoanRowView } from "@/features/loans/components/list/LoanListRow";
import { LoanListTable } from "@/features/loans/components/list/LoanListTable";


interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  onPayment: (loanId: string, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onPartialPayment: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onFullPayment?: (loanId: string, paymentDate?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onInterestPayment: (loanId: string, paymentDate?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void;
  onAmortize?: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => Promise<void> | void;
  onRenegotiate?: (loanId: string, params: { type: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null; penaltyDistribution?: "diluted" | "first" | null; newInstallments?: number | null; notes?: string | null; selectedInstallmentNumbers?: number[] | null; firstDueDate?: string | null }) => Promise<void> | void;
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (loanId: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
  existingTags?: string[];
  initialCategory?: Category;
  initialView?: "cards" | "rows" | "folders";
  clients?: Client[];
  onOpenClientHistory?: () => void;
  onOpenSimulator?: () => void;
}

import type { Category, EditForm } from "@/features/loans/components/list/types";
import { categoryConfig, statusMap } from "@/features/loans/components/list/constants";
import { rawFormatCurrency } from "@/features/loans/components/list/formatting";
import {
  getNextDate,
  getFirstPendingDate,
  getDaysOverdue,
  getLoanCategory,
  getInstallmentDueDate,
  loanToForm,
  getTotalPaid,
} from "@/features/loans/components/list/calculations";

import { LoanListMobileCards } from "@/features/loans/components/list/LoanListMobileCards";
import { useLoanListController } from "@/features/loans/components/list/useLoanListController";



import { ClientFolder } from "@/features/loans/components/list/ClientFolder";


export function LoanList({ loans, payments, installmentSchedules, onPayment, onPartialPayment, onFullPayment, onInterestPayment, onAmortize, onRenegotiate, onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false, initialCategory, initialView, clients = [], onOpenClientHistory, onOpenSimulator }: Props) {
  const [isOverdueAnalysisOpen, setIsOverdueAnalysisOpen] = useState(false);
  const { mask } = useHideValues();
  const { renegotiations: allRenegotiations } = useLoanRenegotiations();
  const { commissions: allCommissions } = useManagerCommissions();
  const commissionTotalByLoan = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of allCommissions) {
      m.set(c.loanId, (m.get(c.loanId) || 0) + Number(c.amount || 0));
    }
    return m;
  }, [allCommissions]);
  const renegotiationsByLoan = useMemo(() => {
    const map = new Map<string, LoanRenegotiation[]>();
    for (const r of allRenegotiations) {
      const arr = map.get(r.loanId) || [];
      arr.push(r);
      map.set(r.loanId, arr);
    }
    return map;
  }, [allRenegotiations]);

  const {
    formatCurrency,
    view, setView,
    search, setSearch,
    selectedCategories, handleCategoryClick, category,
    showFilters, setShowFilters,
    dueDateQuick, setDueDateQuick,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    dueDateFrom, setDueDateFrom,
    dueDateTo, setDueDateTo,
    amountMin, setAmountMin,
    amountMax, setAmountMax,
    tagFilter, setTagFilter,
    notesFilter, setNotesFilter,
    notesSearch, setNotesSearch,
    sortBy, setSortBy,
    cycleColumnSort, sortIndicator,
    allTags, categorized, counts, summaryData, statusSummary,
    grouped,
    applyCardFilter,
    currentFilterState,
    applyFilterState,
  } = useLoanListController({
    loans,
    payments,
    installmentSchedules,
    initialCategory,
    initialView,
  });

  const hasActiveFilters = useMemo(() => {
    const cats = Array.isArray(selectedCategories) ? selectedCategories : Array.from(selectedCategories || []);
    const hasCategoryFilter =
      cats.length > 0 &&
      !(cats.length === 1 && cats[0] === "all");
    return Boolean(
      hasCategoryFilter ||
        (search || "").trim() ||
        dueDateQuick ||
        dateFrom ||
        dateTo ||
        dueDateFrom ||
        dueDateTo ||
        amountMin ||
        amountMax ||
        tagFilter ||
        (notesSearch || "").trim() ||
        (notesFilter && notesFilter !== "all")
    );
  }, [
    selectedCategories,
    search,
    dueDateQuick,
    dateFrom,
    dateTo,
    dueDateFrom,
    dueDateTo,
    amountMin,
    amountMax,
    tagFilter,
    notesSearch,
    notesFilter,
  ]);

  const activeFiltersCount = useMemo(() => {
    const cats = Array.isArray(selectedCategories) ? selectedCategories : Array.from(selectedCategories || []);
    let count = 0;
    if (
      cats.length > 0 &&
      !(cats.length === 1 && cats[0] === "all")
    ) {
      count += cats.length;
    }
    if ((search || "").trim()) count += 1;
    if (dueDateQuick) count += 1;
    if (dateFrom || dateTo) count += 1;
    if (dueDateFrom || dueDateTo) count += 1;
    if (amountMin) count += 1;
    if (amountMax) count += 1;
    if (tagFilter) count += 1;
    if (notesFilter && notesFilter !== "all") count += 1;
    if ((notesSearch || "").trim()) count += 1;
    return count;
  }, [
    selectedCategories,
    search,
    dueDateQuick,
    dateFrom,
    dateTo,
    dueDateFrom,
    dueDateTo,
    amountMin,
    amountMax,
    tagFilter,
    notesFilter,
    notesSearch,
  ]);

  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Nenhum empréstimo cadastrado</p>
          <p className="text-sm text-muted-foreground/70">Clique em "Novo Empréstimo" para começar</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cards de resumo dos empréstimos */}
      <LoanListSummaryCards
        statusSummary={statusSummary}
        selectedCategories={selectedCategories}
        applyCardFilter={applyCardFilter}
        formatCurrency={formatCurrency}
        loans={loans}
        payments={payments}
        schedules={installmentSchedules}
      />

      {/* Barra de Busca, Botão de Filtros e Visualização */}
      <div className="flex items-center gap-2 flex-wrap">
        <LoanSearchBar
          search={search}
          setSearch={setSearch}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          hasActiveFilters={hasActiveFilters}
          activeFiltersCount={activeFiltersCount}
        />

        {(Array.isArray(selectedCategories) ? selectedCategories.includes("overdue") : (selectedCategories as any)?.has?.("overdue")) && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsOverdueAnalysisOpen(true)}
            className="h-11 rounded-xl border-destructive/30 hover:bg-destructive/10 text-destructive gap-1.5"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Análise Anual</span>
          </Button>
        )}

        {/* Botões — versão PC/Tablet */}
        {onOpenSimulator && (
          <Button variant="outline" size="sm" onClick={onOpenSimulator} className="hidden md:inline-flex gap-1.5 h-11 rounded-xl" title="Simular Empréstimo" aria-label="Simular Empréstimo">
            <Calculator className="h-4 w-4" />
            <span className="hidden lg:inline">Simular</span>
          </Button>
        )}
        {onOpenClientHistory && (
          <Button variant="outline" size="sm" type="button" onClick={onOpenClientHistory} className="hidden md:inline-flex gap-1.5 h-11 rounded-xl" title="Histórico do Cliente" aria-label="Histórico do Cliente">
            <User className="h-4 w-4" />
            <span className="hidden lg:inline">Histórico</span>
          </Button>
        )}
        <div className="flex flex-col gap-1 w-full sm:w-auto sm:ml-auto">
          {/* Segmented control estilo iOS */}
          <div
            role="tablist"
            aria-label="Visualização"
            className="flex w-full sm:w-auto bg-muted/60 dark:bg-white/5 rounded-full p-1 backdrop-blur-sm border border-border/40 dark:border-white/5"
          >
            {([
              { id: "cards" as const, label: "Cards", icon: LayoutGrid },
              { id: "folders" as const, label: "Pastas", icon: Folder },
            ]).map(({ id, label, icon: Icon }) => {
              const active = view === id;
              return (
                <button type="button"
                  key={id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(id)}
                  className={[
                    "flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-full",
                    "text-xs font-medium transition-all duration-200",
                    active
                      ? "bg-background text-foreground shadow-sm dark:bg-white/10 dark:text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Ações — cards no mobile */}
          {(onOpenSimulator || onOpenClientHistory) && (
            <div className="grid grid-cols-2 gap-2 mt-1 md:hidden">
              {onOpenSimulator && (
                <button
                  type="button"
                  onClick={onOpenSimulator}
                  className="text-left p-3 rounded-2xl bg-card border border-border/60 dark:border-white/5 hover:border-primary/40 transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  aria-label="Simular Empréstimo"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center">
                      <Calculator className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight">Simular</p>
                      <p className="text-[11px] text-muted-foreground leading-tight truncate">Calcule parcelas rapidamente</p>
                    </div>
                  </div>
                </button>
              )}
              {onOpenClientHistory && (
                <button
                  type="button"
                  onClick={onOpenClientHistory}
                  className="text-left p-3 rounded-2xl bg-card border border-border/60 dark:border-white/5 hover:border-primary/40 transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  aria-label="Histórico do Cliente"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-8 w-8 rounded-lg bg-purple/10 text-purple inline-flex items-center justify-center">
                      <User className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight">Histórico</p>
                      <p className="text-[11px] text-muted-foreground leading-tight truncate">Pagamentos e contratos</p>
                    </div>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO DE FILTROS: Oculta por padrão, só aparece ao clicar no botão de filtros */}
      {showFilters && (
        <div className="space-y-3 p-3.5 sm:p-4 rounded-2xl bg-card/80 border border-border/70 shadow-sm animate-in fade-in duration-200">
          {/* NÍVEL 1: Chips rápidos de Status */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Status do Empréstimo
            </span>
            <LoanCategoryChips
              selectedCategories={selectedCategories}
              counts={counts}
              onCategoryClick={handleCategoryClick}
            />
          </div>

          {/* NÍVEL 2: Filtros Salvos */}
          <LoanSavedFiltersBar
            currentFilterState={currentFilterState}
            applyFilterState={applyFilterState}
            hasActiveFilters={hasActiveFilters}
          />

          {/* NÍVEL 3: Filtros Ativos */}
          <LoanActiveFiltersBar
            filterState={currentFilterState}
            search={search}
            setSearch={setSearch}
            allTags={allTags}
            formatCurrency={formatCurrency}
            onRemoveCategory={handleCategoryClick}
            onClearCategories={() => handleCategoryClick("all")}
            onClearDueDateQuick={() => setDueDateQuick(null)}
            onClearDateRange={() => { setDateFrom(""); setDateTo(""); }}
            onClearDueDateRange={() => { setDueDateFrom(""); setDueDateTo(""); }}
            onClearAmountMin={() => setAmountMin("")}
            onClearAmountMax={() => setAmountMax("")}
            onClearTag={() => setTagFilter("")}
            onClearNotesFilter={() => setNotesFilter("all")}
            onClearNotesSearch={() => setNotesSearch("")}
            onClearSearch={() => setSearch("")}
            onClearAll={() => {
              setSearch("");
              handleCategoryClick("all");
              setDueDateQuick(null);
              setDateFrom(""); setDateTo("");
              setDueDateFrom(""); setDueDateTo("");
              setAmountMin(""); setAmountMax("");
              setTagFilter(""); setNotesFilter("all"); setSortBy("dueDate");
              setNotesSearch("");
            }}
          />

          {/* NÍVEL 4: Filtros Avançados */}
          <LoanAdvancedFilters
            dateFrom={dateFrom} setDateFrom={setDateFrom}
            dateTo={dateTo} setDateTo={setDateTo}
            dueDateFrom={dueDateFrom} setDueDateFrom={setDueDateFrom}
            dueDateTo={dueDateTo} setDueDateTo={setDueDateTo}
            amountMin={amountMin} setAmountMin={setAmountMin}
            amountMax={amountMax} setAmountMax={setAmountMax}
            tagFilter={tagFilter} setTagFilter={setTagFilter}
            allTags={allTags}
            sortBy={sortBy} setSortBy={setSortBy}
            notesFilter={notesFilter} setNotesFilter={setNotesFilter}
            notesSearch={notesSearch} setNotesSearch={setNotesSearch}
            dueDateQuick={dueDateQuick} setDueDateQuick={setDueDateQuick}
            currentFilterState={currentFilterState}
            applyFilterState={applyFilterState}
            onClose={() => setShowFilters(false)}
          />
        </div>
      )}


      {categorized.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum empréstimo encontrado nesta categoria</p>
          </CardContent>
        </Card>
      ) : (
        <div>
          {view === "cards" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs sm:text-sm text-muted-foreground tabular-nums">
                  {categorized.length} {categorized.length === 1 ? "empréstimo" : "empréstimos"}
                </span>
                <span className={`text-xs sm:text-sm font-semibold tabular-nums ${category === "paid" ? "text-success" : "text-primary"}`}>
                  {mask(rawFormatCurrency(summaryData.totalToReceive))}
                </span>
              </div>
              <LoanListMobileCards
                loans={categorized}
                allLoans={loans}
                payments={payments}
                installmentSchedules={installmentSchedules}
                renegotiationsByLoan={renegotiationsByLoan}
                clients={clients}
                readOnly={readOnly}
                onPayment={onPayment}
                onPartialPayment={onPartialPayment}
                onFullPayment={onFullPayment}
                onInterestPayment={onInterestPayment}
                onAmortize={onAmortize}
                onRenegotiate={onRenegotiate}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onDeletePayment={onDeletePayment}
                onSaveSchedule={onSaveSchedule}
              />
            </div>

          ) : view === "folders" ? (
            <>
            <div className="space-y-4">
              {grouped.map((g) => (
                <ClientFolder key={g.name} group={g} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} clients={clients} renegotiations={allRenegotiations} commissionTotalByLoan={commissionTotalByLoan}
                  onPayment={onPayment} onPartialPayment={onPartialPayment} onFullPayment={onFullPayment}
                  onInterestPayment={onInterestPayment} onAmortize={onAmortize} onRenegotiate={onRenegotiate} onUpdate={onUpdate} onDelete={onDelete} onDeletePayment={onDeletePayment} onSaveSchedule={onSaveSchedule} />
              ))}
              {grouped.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">Nenhum cliente com múltiplos empréstimos</p>
                  </CardContent>
                </Card>
              )}
            </div>
            </>
          ) : (
            <LoanListTable
              categorized={categorized}
              loans={loans}
              payments={payments}
              installmentSchedules={installmentSchedules}
              category={category}
              totalToReceive={summaryData.totalToReceive}
              readOnly={readOnly}
              clients={clients}
              renegotiationsByLoan={renegotiationsByLoan}
              commissionTotalByLoan={commissionTotalByLoan}
              cycleColumnSort={cycleColumnSort}
              sortIndicator={sortIndicator}
              onPayment={onPayment}
              onPartialPayment={onPartialPayment}
              onFullPayment={onFullPayment}
              onInterestPayment={onInterestPayment}
              onAmortize={onAmortize}
              onRenegotiate={onRenegotiate}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onDeletePayment={onDeletePayment}
              onSaveSchedule={onSaveSchedule}
            />
          )}
        </div>
      )}

      <OverdueAnalysisDialog 
        open={isOverdueAnalysisOpen}
        onOpenChange={setIsOverdueAnalysisOpen}
        loans={loans}
        payments={payments}
        installmentSchedules={installmentSchedules}
      />
    </div>
  );
}
