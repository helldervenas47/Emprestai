import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { aggregatePortfolioPending } from "@/features/loans/lib/portfolioPending";

function HeaderActionPortal({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("tab-header-actions"));
  }, []);

  if (!target) return <div className="flex justify-end">{children}</div>;
  return createPortal(children, target);
}

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { getLoanFinancialStateForUI, deriveLoanFinancialStatus } from "@/features/loans/lib/loanFinancialAdapter";
import { allocateInterestByPayment } from "@/features/financial/lib/interestAllocation";
import { Search, Users, BarChart3, ArrowUpDown, ChevronRight, ArrowLeft, Filter, X, Clock, CheckCircle2, Wallet, TrendingUp } from "lucide-react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoanPaymentHistoryDialog } from "@/features/loans/components/LoanPaymentHistoryDialog";
import {
  getAppScrollContainer,
  getScrollTop,
  restoreScrollWhenReady,
  setScrollTop,
} from "@/lib/scrollPolicy";

interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  onBackToLoans?: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface ClientRow {
  name: string;
  borrowed: number;
  paid: number;
  interestPaid: number;
  pending: number;
  total: number;
  interestRate: number;
  /** Principal restante real (fonte única de carteira). */
  principalPending: number;
  /** Juros pendentes: juros contratuais + multa + mora (fonte única). */
  interestPending: number;
}


type SortOption =
  | "name-asc"
  | "name-desc"
  | "borrowed-desc"
  | "borrowed-asc"
  | "paid-desc"
  | "paid-asc"
  | "pending-desc"
  | "pending-asc"
  | "total-desc"
  | "total-asc"
  | "rate-desc"
  | "rate-asc"
  | "interest-desc"
  | "interest-asc"
  | "difference-desc"
  | "difference-asc";

const statusLabels: Record<string, string> = {
  active: "Pendente",
  paid: "Quitado",
  overdue: "Atrasado",
  defaulted: "Inadimplente",
};

export function ClientLoanHistory({ loans, payments, installmentSchedules = [], onBackToLoans }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [showSummary, setShowSummary] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches);
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const { hidden } = useHideValues();
  const clientListScrollRef = useRef(0);
  const clientHistoryScrollRef = useRef(0);
  const scrollOperationId = useRef(0);
  const cancelListRestoreRef = useRef<(() => void) | null>(null);

  const beginScrollOperation = useCallback(() => {
    scrollOperationId.current += 1;
    cancelListRestoreRef.current?.();
    cancelListRestoreRef.current = null;
    return scrollOperationId.current;
  }, []);

  const openClient = useCallback((name: string) => {
    const operationId = beginScrollOperation();
    clientListScrollRef.current = getScrollTop(getAppScrollContainer());
    clientHistoryScrollRef.current = 0;
    setSelectedClient(name);
    // Reset status filter when opening a client
    setStatusFilter([]);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (scrollOperationId.current === operationId) setScrollTop(getAppScrollContainer(), 0);
      });
    }
  }, [beginScrollOperation]);

  const closeClient = useCallback(() => {
    const operationId = beginScrollOperation();
    const targetPosition = clientListScrollRef.current;
    setSelectedClient(null);
    setStatusFilter([]);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (scrollOperationId.current !== operationId) return;
        cancelListRestoreRef.current = restoreScrollWhenReady(targetPosition, {
          container: getAppScrollContainer(),
          maxAttempts: 10,
          isCurrent: () => scrollOperationId.current === operationId,
        });
      });
    } else {
      cancelListRestoreRef.current = restoreScrollWhenReady(targetPosition, {
        container: getAppScrollContainer(),
        maxAttempts: 10,
        isCurrent: () => scrollOperationId.current === operationId,
      });
    }
  }, [beginScrollOperation]);

  useLayoutEffect(() => {
    if (!selectedClient) return;
    // O detalhe do cliente é um contexto de scroll diferente da lista: sempre abre no topo.
    setScrollTop(getAppScrollContainer(), clientHistoryScrollRef.current);
  }, [selectedClient]);

  useLayoutEffect(() => {
    return () => cancelListRestoreRef.current?.();
  }, []);

  const filteredLoansForAggregation = loans;

  const rows = useMemo<ClientRow[]>(() => {
    const byName: Record<string, Loan[]> = {};
    filteredLoansForAggregation.forEach((l) => {
      const key = l.borrowerName?.trim() || "—";
      (byName[key] ??= []).push(l);
    });

    const out: ClientRow[] = Object.entries(byName).map(([name, clientLoans]) => {
      let borrowed = 0;
      let paid = 0;
      let pending = 0;

      const loanIds = new Set(clientLoans.map((l) => l.id));
      const clientPayments = payments.filter((p) => loanIds.has(p.loanId));
      const allocated = allocateInterestByPayment(
        clientLoans.map((l) => ({
          id: l.id,
          amount: l.amount || 0,
          interestRate: l.interestRate,
          installments: l.installments,
          status: l.status,
        })),
        clientPayments.map((p) => ({
          id: p.id,
          loanId: p.loanId,
          amount: p.amount,
          date: p.date,
          installmentNumber: p.installmentNumber,
          createdAt: (p as any).createdAt,
        })),
      );
      const interestPaid = clientPayments.reduce((s, p) => s + (allocated.get(p.id) ?? 0), 0);

      clientLoans.forEach((l) => {
        borrowed += l.amount || 0;
        const loanPayments = payments.filter((p) => p.loanId === l.id);
        const totalPaid = loanPayments.reduce((s, p) => s + (p.amount || 0), 0);
        paid += totalPaid;
      });

      const clientPending = aggregatePortfolioPending({
        loans: clientLoans,
        payments: clientPayments,
        installmentSchedules,
      });

      pending = clientPending.capitalOnStreet + clientPending.interestPending;

      const total = paid + pending;
      const interestRate = borrowed > 0 ? ((total - borrowed) / borrowed) * 100 : 0;
      const principalPaid = Math.max(0, paid - interestPaid);

      return {
        name,
        borrowed,
        paid: principalPaid,
        interestPaid,
        pending,
        total,
        interestRate,
        principalPending: clientPending.capitalOnStreet,
        interestPending: clientPending.interestPending,
      };

    });

    const filtered = search.trim()
      ? out.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))
      : out;

    return filtered.sort((a, b) => {
      const diffA = a.paid + a.interestPaid - a.borrowed;
      const diffB = b.paid + b.interestPaid - b.borrowed;
      switch (sortBy) {
        case "name-asc": return a.name.localeCompare(b.name, "pt-BR");
        case "name-desc": return b.name.localeCompare(a.name, "pt-BR");
        case "borrowed-desc": return b.borrowed - a.borrowed;
        case "borrowed-asc": return a.borrowed - b.borrowed;
        case "paid-desc": return b.paid - a.paid;
        case "paid-asc": return a.paid - b.paid;
        case "pending-desc": return b.pending - a.pending;
        case "pending-asc": return a.pending - b.pending;
        case "total-desc": return b.total - a.total;
        case "total-asc": return a.total - b.total;
        case "rate-desc": return b.interestRate - a.interestRate;
        case "rate-asc": return a.interestRate - b.interestRate;
        case "interest-desc": return b.interestPaid - a.interestPaid;
        case "interest-asc": return a.interestPaid - b.interestPaid;
        case "difference-desc": return diffB - diffA;
        case "difference-asc": return diffA - diffB;
        default: return a.name.localeCompare(b.name, "pt-BR");
      }
    });
  }, [loans, payments, search, sortBy]);

  // Cache: payments grouped by loanId — avoids re-filtering for each expanded client
  const paymentsByLoan = useMemo(() => {
    const map: Record<string, number> = {};
    payments.forEach((p) => {
      map[p.loanId] = (map[p.loanId] ?? 0) + (p.amount || 0);
    });
    return map;
  }, [payments]);

  // Cache: last payment date by loanId
  const lastPaymentDateByLoan = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    payments.forEach((p) => {
      const current = map[p.loanId];
      if (!current || (p.date && p.date > current)) {
        map[p.loanId] = p.date;
      }
    });
    return map;
  }, [payments]);

  // Cache: loans grouped by client name and pre-sorted by startDate ASC (oldest → newest)
  const loansByClient = useMemo(() => {
    const map: Record<string, Loan[]> = {};
    filteredLoansForAggregation.forEach((l) => {
      const key = l.borrowerName?.trim() || "—";
      (map[key] ??= []).push(l);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        return da - db;
      });
    });
    return map;
  }, [filteredLoansForAggregation]);

  const totals = useMemo(() => {
    const totalPending = rows.reduce((s, r) => s + r.pending, 0);
    const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
    const totalBorrowed = rows.reduce((s, r) => s + r.borrowed, 0);
    const totalInterestPaid = rows.reduce((s, r) => s + r.interestPaid, 0);
    // Fonte única: soma direta das pendências por contrato (sem resíduo).
    const totalPrincipalPending = rows.reduce((s, r) => s + r.principalPending, 0);
    const totalInterestPending = rows.reduce((s, r) => s + r.interestPending, 0);

    const grandTotal = totalPrincipalPending + totalPaid + totalInterestPending + totalInterestPaid;
    const clientCount = rows.length;
    const avgInterestRate = totalBorrowed > 0 ? ((grandTotal - totalBorrowed) / totalBorrowed) * 100 : 0;
    return { totalPending, totalPaid, totalBorrowed, totalInterestPaid, totalPrincipalPending, totalInterestPending, grandTotal, clientCount, avgInterestRate };
  }, [rows]);

  const mask = (v: string) => (hidden ? "•••" : v);

  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Nenhum cliente com empréstimos</p>
        </CardContent>
      </Card>
    );
  }

  if (selectedClient) {
    const clientLoans = loansByClient[selectedClient] ?? [];
    const summary = rows.find((r) => r.name === selectedClient);
    const borrowed = summary?.borrowed ?? 0;
    const paidTotal = summary?.paid ?? 0;
    const pendingTotal = summary?.pending ?? 0;
    const grandTotal = summary?.total ?? 0;

    // Juros recebidos por cliente:
    // Fonte única: `allocateInterestByPayment` — mesma regra do Dashboard,
    // Contador e do diálogo de Histórico. Vale para contratos quitados E
    // em andamento, garantindo que:
    //   - Juros contratados de todas as parcelas pagas sejam somados;
    //   - Juros avulsos (installment_number = 0 "interest_partial") somem 100%;
    //   - Juros/multa de atraso (installment_number = -2) somem 100%;
    //   - Amortizações (-3) NÃO contem como juros.
    // Antes, contratos "paid" usavam apenas `total - principal` (juros de UM
    // ciclo), descartando juros de extensões e mora efetivamente recebidos.
    let interestReceived = 0;
    if (clientLoans.length > 0) {
      const loanIds = new Set(clientLoans.map((l) => l.id));
      const clientPayments = payments.filter((p) => loanIds.has(p.loanId));
      const allocated = allocateInterestByPayment(
        clientLoans.map((l) => ({
          id: l.id,
          amount: l.amount || 0,
          interestRate: l.interestRate,
          installments: l.installments,
          status: l.status,
        })),
        clientPayments.map((p) => ({
          id: p.id,
          loanId: p.loanId,
          amount: p.amount,
          date: p.date,
          installmentNumber: p.installmentNumber,
          createdAt: (p as any).createdAt,
        })),
      );
      clientPayments.forEach((p) => {
        interestReceived += allocated.get(p.id) ?? 0;
      });
    }

    // Juros a receber: fonte única de carteira (mesma base do Dashboard).
    const interestPending = summary?.interestPending ?? 0;


    const difference = (paidTotal + interestReceived) - borrowed;

    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200">
        <HeaderActionPortal>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={closeClient}
            aria-label="Voltar para Clientes"
            title="Voltar para Clientes"
            className="text-xs text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-auto p-0 sm:px-3 sm:gap-1.5 rounded-lg sm:rounded-xl border-border/60 hover:bg-muted/60"
          >
            <X className="h-4 w-4 sm:hidden" />
            <ArrowLeft className="h-3.5 w-3.5 hidden sm:inline-block" />
            <span className="hidden sm:inline">Voltar para Clientes</span>
          </Button>
        </HeaderActionPortal>

        {/* Client Profile Header Banner */}
        <Card className="border-border/60 bg-gradient-to-r from-card via-card to-muted/20 shadow-xs overflow-hidden">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-sm shrink-0 select-none">
                  {getInitials(selectedClient)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-bold text-foreground leading-tight truncate">
                      {selectedClient}
                    </h2>
                    <Badge variant="secondary" className="text-[11px] font-semibold h-5 px-2">
                      {clientLoans.length} {clientLoans.length === 1 ? "contrato" : "contratos"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    Histórico financeiro consolidado e contratos
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40 sm:border-transparent">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs px-2.5 py-1 font-semibold w-full sm:w-auto justify-center sm:justify-start",
                    difference >= 0
                      ? "bg-success/10 text-success border-success/30"
                      : "bg-destructive/10 text-destructive border-destructive/30"
                  )}
                >
                  {difference >= 0 ? "Lucro: " : "Em Recuperação: "}
                  <span className="tabular-nums ml-1 font-bold">{mask(formatCurrency(Math.abs(difference)))}</span>
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 8 Resilient, High-Readability Summary Cards in Responsive 4-Col Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <Card className="hover:border-border/80 transition-colors shadow-xs">
            <CardContent className="p-3 sm:p-3.5 flex flex-col items-center justify-center text-center h-full">
              <span className="text-[11px] font-medium text-muted-foreground mb-1">Total Emprestado</span>
              <span className="font-bold tabular-nums text-sm sm:text-base text-foreground">
                {mask(formatCurrency(borrowed))}
              </span>
            </CardContent>
          </Card>

          <Card className="hover:border-border/80 transition-colors shadow-xs">
            <CardContent className="p-3 sm:p-3.5 flex flex-col items-center justify-center text-center h-full">
              <span className="text-[11px] font-medium text-muted-foreground mb-1">Total Recebido</span>
              <span className="font-bold tabular-nums text-success text-sm sm:text-base">
                {mask(formatCurrency(paidTotal + interestReceived))}
              </span>
            </CardContent>
          </Card>

          <Card className="hover:border-border/80 transition-colors shadow-xs">
            <CardContent className="p-3 sm:p-3.5 flex flex-col items-center justify-center text-center h-full">
              <span className="text-[11px] font-medium text-muted-foreground mb-1">Principal Recebido</span>
              <span className="font-bold tabular-nums text-success text-sm sm:text-base">
                {mask(formatCurrency(paidTotal))}
              </span>
            </CardContent>
          </Card>

          <Card className="hover:border-border/80 transition-colors shadow-xs">
            <CardContent className="p-3 sm:p-3.5 flex flex-col items-center justify-center text-center h-full">
              <span className="text-[11px] font-medium text-muted-foreground mb-1">Juros Recebidos</span>
              <span className="font-bold tabular-nums text-success text-sm sm:text-base">
                {mask(formatCurrency(interestReceived))}
              </span>
            </CardContent>
          </Card>

          <Card className="hover:border-border/80 transition-colors shadow-xs">
            <CardContent className="p-3 sm:p-3.5 flex flex-col items-center justify-center text-center h-full">
              <span className="text-[11px] font-medium text-muted-foreground mb-1">Pendente Total</span>
              <span className="font-bold tabular-nums text-warning text-sm sm:text-base">
                {mask(formatCurrency(pendingTotal))}
              </span>
            </CardContent>
          </Card>

          <Card className="hover:border-border/80 transition-colors shadow-xs">
            <CardContent className="p-3 sm:p-3.5 flex flex-col items-center justify-center text-center h-full">
              <span className="text-[11px] font-medium text-muted-foreground mb-1">Juros a Receber</span>
              <span className="font-bold tabular-nums text-warning text-sm sm:text-base">
                {mask(formatCurrency(interestPending))}
              </span>
            </CardContent>
          </Card>

          <Card className="hover:border-border/80 transition-colors shadow-xs">
            <CardContent className="p-3 sm:p-3.5 flex flex-col items-center justify-center text-center h-full">
              <span className="text-[11px] font-medium text-muted-foreground mb-1">Lucro</span>
              <span className={cn(
                "font-bold tabular-nums text-sm sm:text-base",
                difference >= 0 ? "text-success" : "text-destructive"
              )}>
                {mask(formatCurrency(difference))}
              </span>
            </CardContent>
          </Card>

          <Card className="hover:border-border/80 transition-colors shadow-xs">
            <CardContent className="p-3 sm:p-3.5 flex flex-col items-center justify-center text-center h-full">
              <span className="text-[11px] font-medium text-muted-foreground mb-1">Total Contratado</span>
              <span className="font-bold tabular-nums text-primary text-sm sm:text-base">
                {mask(formatCurrency(grandTotal))}
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Contract List */}
        <Card className="border-border/60 shadow-xs">
          <CardContent className="p-3.5 sm:p-4.5">
            <ClientLoansList
              loans={clientLoans}
              payments={payments}
              installmentSchedules={installmentSchedules}
              paymentsByLoan={paymentsByLoan}
              lastPaymentDateByLoan={lastPaymentDateByLoan}
              hidden={hidden}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 animate-in fade-in duration-200">
      {onBackToLoans && (
        <HeaderActionPortal>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={onBackToLoans}
            aria-label="Voltar para Empréstimos"
            title="Voltar para Empréstimos"
            className="text-xs text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-auto p-0 sm:px-3 sm:gap-1.5 rounded-lg sm:rounded-xl border-border/60 hover:bg-muted/60"
          >
            <X className="h-4 w-4 sm:hidden" />
            <ArrowLeft className="h-3.5 w-3.5 hidden sm:inline-block" />
            <span className="hidden sm:inline">Voltar para Empréstimos</span>
          </Button>
        </HeaderActionPortal>
      )}

      {/* Top Header */}
      <div className="pb-1 border-b border-border/40">
        <h2 className="text-lg font-bold text-foreground tracking-tight">Histórico de Clientes</h2>
        <p className="text-xs text-muted-foreground">
          Acompanhamento financeiro, carteira e rentabilidade por cliente
        </p>
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-full md:w-[240px] h-10 text-xs">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Ordenar por..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Cliente (A → Z)</SelectItem>
              <SelectItem value="name-desc">Cliente (Z → A)</SelectItem>
              <SelectItem value="borrowed-desc">Maior valor emprestado</SelectItem>
              <SelectItem value="borrowed-asc">Menor valor emprestado</SelectItem>
              <SelectItem value="paid-desc">Maior principal recebido</SelectItem>
              <SelectItem value="paid-asc">Menor principal recebido</SelectItem>
              <SelectItem value="pending-desc">Maior valor pendente</SelectItem>
              <SelectItem value="pending-asc">Menor valor pendente</SelectItem>
              <SelectItem value="total-desc">Maior valor total</SelectItem>
              <SelectItem value="total-asc">Menor valor total</SelectItem>
              <SelectItem value="difference-desc">Maior lucro</SelectItem>
              <SelectItem value="difference-asc">Menor lucro</SelectItem>
              <SelectItem value="rate-desc">Maior taxa de variação</SelectItem>
              <SelectItem value="rate-asc">Menor taxa de variação</SelectItem>
              <SelectItem value="interest-desc">Maior juros pago</SelectItem>
              <SelectItem value="interest-asc">Menor juros pago</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setShowSummary((s) => !s)}
            className="shrink-0 gap-1"
          >
            <BarChart3 className="h-4 w-4" />
            Resumo
          </Button>
        </div>
      </div>

      {showSummary && (
        <div className="space-y-2 sm:space-y-2.5 animate-in fade-in-50 duration-200">
          {/* Health & Capital Recovery Header Banner - Compact */}
          <Card className="border-border/60 bg-gradient-to-br from-card via-card to-muted/20 shadow-xs overflow-hidden">
            <CardContent className="p-2.5 sm:p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                      Recuperação da Carteira
                    </h3>
                    <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">
                      {mask(formatCurrency(totals.totalPaid + totals.totalInterestPaid))} recebidos de {mask(formatCurrency(totals.totalBorrowed))}
                    </p>
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] sm:text-xs px-2 py-0.5 font-semibold shrink-0",
                    (totals.totalPaid + totals.totalInterestPaid - totals.totalBorrowed) >= 0
                      ? "bg-success/10 text-success border-success/30"
                      : "bg-warning/10 text-warning border-warning/30"
                  )}
                >
                  {(totals.totalPaid + totals.totalInterestPaid - totals.totalBorrowed) >= 0 ? "Lucro: " : "Em Recuperação: "}
                  <span className="tabular-nums ml-1 font-bold">
                    {mask(formatCurrency(Math.abs(totals.totalPaid + totals.totalInterestPaid - totals.totalBorrowed)))}
                  </span>
                </Badge>
              </div>

              {/* Compact Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-medium text-muted-foreground">
                  <span>Capital Retornado</span>
                  <span className="font-bold tabular-nums text-foreground">
                    {hidden ? "•••" : `${(totals.totalBorrowed > 0 ? ((totals.totalPaid + totals.totalInterestPaid) / totals.totalBorrowed) * 100 : 0).toFixed(1).replace(".", ",")}%`}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden border border-border/40">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      (totals.totalPaid + totals.totalInterestPaid) >= totals.totalBorrowed
                        ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                        : "bg-gradient-to-r from-amber-500 to-emerald-500"
                    )}
                    style={{
                      width: `${Math.min(100, Math.max(0, totals.totalBorrowed > 0 ? ((totals.totalPaid + totals.totalInterestPaid) / totals.totalBorrowed) * 100 : 0))}%`,
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4 Structured Executive Pillar Cards - Compact 2x2 on Mobile, 4-col on Desktop */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
            {/* Bloco 1: A Receber (Pendente) */}
            <Card className="border-border/60 hover:border-amber-500/30 bg-card/60 hover:bg-card transition-all shadow-xs">
              <CardContent className="p-2.5 sm:p-3 flex flex-col justify-between h-full space-y-2">
                <div className="flex items-center justify-between gap-1 border-b border-border/40 pb-1.5">
                  <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-foreground truncate">
                    <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-warning shrink-0" />
                    <span className="truncate">A Receber</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] font-bold px-1 py-0 bg-warning/10 text-warning border-warning/30 shrink-0">
                    {mask(formatCurrency(totals.totalPrincipalPending + totals.totalInterestPending))}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-center">
                  <div>
                    <div className="text-[9px] sm:text-[10px] text-muted-foreground font-medium">Principal</div>
                    <div className="font-bold tabular-nums text-warning text-[11px] sm:text-xs truncate">
                      {mask(formatCurrency(totals.totalPrincipalPending))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] sm:text-[10px] text-muted-foreground font-medium">Juros</div>
                    <div className="font-bold tabular-nums text-warning text-[11px] sm:text-xs truncate">
                      {mask(formatCurrency(totals.totalInterestPending))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bloco 2: Já Recebido no Caixa */}
            <Card className="border-border/60 hover:border-emerald-500/30 bg-card/60 hover:bg-card transition-all shadow-xs">
              <CardContent className="p-2.5 sm:p-3 flex flex-col justify-between h-full space-y-2">
                <div className="flex items-center justify-between gap-1 border-b border-border/40 pb-1.5">
                  <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-foreground truncate">
                    <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-success shrink-0" />
                    <span className="truncate">Recebido</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] font-bold px-1 py-0 bg-success/10 text-success border-success/30 shrink-0">
                    {mask(formatCurrency(totals.totalPaid + totals.totalInterestPaid))}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-center">
                  <div>
                    <div className="text-[9px] sm:text-[10px] text-muted-foreground font-medium">Principal</div>
                    <div className="font-bold tabular-nums text-success text-[11px] sm:text-xs truncate">
                      {mask(formatCurrency(totals.totalPaid))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] sm:text-[10px] text-muted-foreground font-medium">Juros</div>
                    <div className="font-bold tabular-nums text-success text-[11px] sm:text-xs truncate">
                      {mask(formatCurrency(totals.totalInterestPaid))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bloco 3: Volume da Carteira */}
            <Card className="border-border/60 hover:border-primary/30 bg-card/60 hover:bg-card transition-all shadow-xs">
              <CardContent className="p-2.5 sm:p-3 flex flex-col justify-between h-full space-y-2">
                <div className="flex items-center justify-between gap-1 border-b border-border/40 pb-1.5">
                  <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-foreground truncate">
                    <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary shrink-0" />
                    <span className="truncate">Carteira</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] font-bold px-1 py-0 bg-primary/10 text-primary border-primary/30 shrink-0">
                    {totals.clientCount} clis
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-center">
                  <div>
                    <div className="text-[9px] sm:text-[10px] text-muted-foreground font-medium">Emprestado</div>
                    <div className="font-bold tabular-nums text-foreground text-[11px] sm:text-xs truncate">
                      {mask(formatCurrency(totals.totalBorrowed))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] sm:text-[10px] text-muted-foreground font-medium">Contratado</div>
                    <div className="font-bold tabular-nums text-foreground text-[11px] sm:text-xs truncate">
                      {mask(formatCurrency(totals.grandTotal))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bloco 4: Rentabilidade & Retorno */}
            <Card className="border-border/60 hover:border-violet-500/30 bg-card/60 hover:bg-card transition-all shadow-xs">
              <CardContent className="p-2.5 sm:p-3 flex flex-col justify-between h-full space-y-2">
                <div className="flex items-center justify-between gap-1 border-b border-border/40 pb-1.5">
                  <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-foreground truncate">
                    <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary shrink-0" />
                    <span className="truncate">Rentabilidade</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] font-bold px-1 py-0 bg-primary/10 text-primary border-primary/30 shrink-0">
                    {hidden ? "•••" : `${totals.avgInterestRate.toFixed(1).replace(".", ",")}%`}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-center">
                  <div>
                    <div className="text-[9px] sm:text-[10px] text-muted-foreground font-medium">Lucro Proj.</div>
                    <div className="font-bold tabular-nums text-primary text-[11px] sm:text-xs truncate">
                      {mask(formatCurrency(Math.max(0, totals.grandTotal - totals.totalBorrowed)))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] sm:text-[10px] text-muted-foreground font-medium">Resultado</div>
                    <div className={cn(
                      "font-bold tabular-nums text-[11px] sm:text-xs truncate",
                      (totals.totalPaid + totals.totalInterestPaid - totals.totalBorrowed) >= 0 ? "text-success" : "text-amber-500"
                    )}>
                      {mask(formatCurrency(totals.totalPaid + totals.totalInterestPaid - totals.totalBorrowed))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Loans details renderer (cached lookup, no recompute on toggle) */}
      {/* Inline helper kept here for clarity */}

      {/* Desktop / Tablet — Table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Emprestado</TableHead>
                <TableHead className="text-right">Pendente</TableHead>
                <TableHead className="text-right">Principal Recebido</TableHead>
                <TableHead className="text-right">Juros Pago</TableHead>
                <TableHead className="text-right">Total Recebido</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                <TableHead className="text-right">Total Geral</TableHead>
                <TableHead className="text-right">Taxa de Variação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.name}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => openClient(r.name)}
                >
                  <TableCell className="w-8">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{mask(formatCurrency(r.borrowed))}</TableCell>
                  <TableCell className="text-right tabular-nums text-warning">{mask(formatCurrency(r.pending))}</TableCell>
                  <TableCell className="text-right tabular-nums text-success">{mask(formatCurrency(r.paid))}</TableCell>
                  <TableCell className="text-right tabular-nums text-primary">{mask(formatCurrency(r.interestPaid))}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-success">{mask(formatCurrency(r.paid + r.interestPaid))}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium", r.paid + r.interestPaid - r.borrowed < 0 ? "text-destructive" : r.paid + r.interestPaid - r.borrowed > 0 ? "text-success" : "")}>
                    {mask(formatCurrency(r.paid + r.interestPaid - r.borrowed))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{mask(formatCurrency(r.total))}</TableCell>
                  <TableCell className="text-right tabular-nums text-primary font-medium">
                    {hidden ? "•••" : `${r.interestRate.toFixed(2).replace(".", ",")}%`}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    Nenhum cliente encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {rows.length > 0 && (
              <tfoot className="bg-muted/60 font-bold border-t sticky bottom-0">
                <TableRow className="hover:bg-muted/60">
                  <TableCell className="w-8" />
                  <TableCell className="font-bold">Subtotal ({rows.length})</TableCell>
                  <TableCell className="text-right tabular-nums font-bold">
                    {mask(formatCurrency(rows.reduce((s, r) => s + r.borrowed, 0)))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold text-warning">
                    {mask(formatCurrency(rows.reduce((s, r) => s + r.pending, 0)))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold text-success">
                    {mask(formatCurrency(rows.reduce((s, r) => s + r.paid, 0)))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold text-primary">
                    {mask(formatCurrency(rows.reduce((s, r) => s + r.interestPaid, 0)))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold text-success">
                    {mask(formatCurrency(rows.reduce((s, r) => s + r.paid + r.interestPaid, 0)))}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums font-bold", rows.reduce((s, r) => s + r.paid + r.interestPaid - r.borrowed, 0) < 0 ? "text-destructive" : "text-success")}>
                    {mask(formatCurrency(rows.reduce((s, r) => s + r.paid + r.interestPaid - r.borrowed, 0)))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold">
                    {mask(formatCurrency(rows.reduce((s, r) => s + r.total, 0)))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold text-primary">
                    {(() => {
                      const tb = rows.reduce((s, r) => s + r.borrowed, 0);
                      const tt = rows.reduce((s, r) => s + r.total, 0);
                      const rate = tb > 0 ? ((tt - tb) / tb) * 100 : 0;
                      return hidden ? "•••" : `${rate.toFixed(2).replace(".", ",")}%`;
                    })()}
                  </TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </Card>

      {/* Mobile — Cards */}
      <div className="md:hidden space-y-2.5">
        {rows.map((r) => (
          <Card
            key={r.name}
            className="hover:border-border/80 transition-colors shadow-xs active:scale-[0.99] cursor-pointer"
            onClick={() => openClient(r.name)}
          >
            <CardContent className="p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs shrink-0 select-none">
                    {getInitials(r.name)}
                  </div>
                  <h3 className="font-semibold text-sm truncate text-foreground">{r.name}</h3>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-5 font-semibold",
                      (r.paid + r.interestPaid - r.borrowed) >= 0
                        ? "bg-success/10 text-success border-success/30"
                        : "bg-destructive/10 text-destructive border-destructive/30"
                    )}
                  >
                    {(r.paid + r.interestPaid - r.borrowed) >= 0 ? "Lucro" : "Aberto"}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 rounded-md p-2.5">
                <div>
                  <div className="text-[11px] text-muted-foreground">Emprestado</div>
                  <div className="tabular-nums font-semibold text-foreground">{mask(formatCurrency(r.borrowed))}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Total Recebido</div>
                  <div className="tabular-nums font-semibold text-success">
                    {mask(formatCurrency(r.paid + r.interestPaid))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Principal Recebido</div>
                  <div className="tabular-nums font-medium text-success">{mask(formatCurrency(r.paid))}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Juros Recebidos</div>
                  <div className="tabular-nums font-medium text-success">{mask(formatCurrency(r.interestPaid))}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Pendente</div>
                  <div className="tabular-nums font-semibold text-warning">{mask(formatCurrency(r.pending))}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Lucro</div>
                  <div className={cn(
                    "tabular-nums font-semibold",
                    (r.paid + r.interestPaid - r.borrowed) >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {mask(formatCurrency(r.paid + r.interestPaid - r.borrowed))}
                  </div>
                </div>
                <div className="col-span-2 pt-1.5 border-t border-border/40 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Total Contratado</span>
                  <span className="tabular-nums font-bold text-primary">{mask(formatCurrency(r.total))}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Nenhum cliente encontrado
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function formatDate(d?: string): string {
  if (!d) return "—";
  // ISO date (YYYY-MM-DD) — parse manualmente para evitar deslocamento de fuso horário
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, day] = iso;
    return `${day}/${m}/${y}`;
  }
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}


interface ClientLoansListProps {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  paymentsByLoan: Record<string, number>;
  lastPaymentDateByLoan: Record<string, string | undefined>;
  hidden: boolean;
}

function ClientLoansList({ loans, payments, installmentSchedules = [], paymentsByLoan, lastPaymentDateByLoan, hidden }: ClientLoansListProps) {
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const mask = (v: string) => (hidden ? "•••" : v);

  // Mapeamento semântico dos status calculados para exibição e filtragem
  const statusCounts = useMemo(() => {
    const counts = { all: loans.length, pendente: 0, em_atraso: 0, em_dia: 0, quitado: 0, renegociado: 0 };
    loans.forEach((l) => {
      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const loanSchedules = installmentSchedules.filter((s) => s.loanId === l.id);
      const state = getLoanFinancialStateForUI({ loan: l, payments: loanPayments, installmentSchedules: loanSchedules });
      const derived = deriveLoanFinancialStatus(state, l);
      if (derived.status === "quitado") {
        counts.quitado++;
      } else {
        counts.pendente++;
        if (derived.status === "em_atraso") counts.em_atraso++;
        else if (derived.status === "renegociado") counts.renegociado++;
        else counts.em_dia++;
      }
    });
    return counts;
  }, [loans, payments, installmentSchedules]);

  const filteredLoans = useMemo(() => {
    if (statusFilter === "all") return loans;
    return loans.filter((l) => {
      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const loanSchedules = installmentSchedules.filter((s) => s.loanId === l.id);
      const state = getLoanFinancialStateForUI({ loan: l, payments: loanPayments, installmentSchedules: loanSchedules });
      const derived = deriveLoanFinancialStatus(state, l);
      if (statusFilter === "pendente") return derived.status !== "quitado";
      if (statusFilter === "em_atraso") return derived.status === "em_atraso";
      if (statusFilter === "em_dia") return derived.status === "em_dia" || derived.status === "parcialmente_pago";
      if (statusFilter === "quitado") return derived.status === "quitado";
      if (statusFilter === "renegociado") return derived.status === "renegociado";
      return true;
    });
  }, [loans, statusFilter, payments, installmentSchedules]);

  if (loans.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-2">
        Nenhum empréstimo encontrado.
      </p>
    );
  }

  const renderTags = (tags?: string[]) =>
    tags && tags.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <Badge
            key={t}
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/30"
          >
            {t}
          </Badge>
        ))}
      </div>
    ) : null;

  const computeValueCell = (l: Loan) => {
    const loanPayments = payments.filter((p) => p.loanId === l.id);
    const loanSchedules = installmentSchedules.filter((s) => s.loanId === l.id);
    const state = getLoanFinancialStateForUI({ loan: l, payments: loanPayments, installmentSchedules: loanSchedules });
    const isPaid = l.status === "paid";
    const totalPaid = loanPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return {
      remaining: state.payoffAmount,
      paid: totalPaid,
      isPaid,
      state
    };
  };

  const statusMeta = (l: Loan, state: any) => {
    const s = deriveLoanFinancialStatus(state, l);
    return {
      label: s.label,
      className: `bg-${s.tone}/15 text-${s.tone} border-${s.tone}/30`
    };
  };

  const statusFilterConfig: Array<{ id: string; label: string; dotClass?: string; count: number }> = [
    { id: "all", label: "Todos", count: statusCounts.all },
    { id: "pendente", label: "Pendente (Atraso e em dia)", dotClass: "bg-warning", count: statusCounts.pendente },
    { id: "em_atraso", label: "Em atraso", dotClass: "bg-destructive", count: statusCounts.em_atraso },
    { id: "em_dia", label: "Em dia", dotClass: "bg-primary", count: statusCounts.em_dia },
    { id: "quitado", label: "Quitados", dotClass: "bg-success", count: statusCounts.quitado },
    ...(statusCounts.renegociado > 0
      ? [{ id: "renegociado", label: "Renegociados", dotClass: "bg-primary", count: statusCounts.renegociado }]
      : []),
  ];

  const currentOption = statusFilterConfig.find((o) => o.id === statusFilter) || statusFilterConfig[0];

  return (
    <>
      <div className="flex items-center justify-between gap-2.5 mb-3.5 pb-2.5 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            Contratos
          </span>
          <Badge variant="secondary" className="text-[11px] h-5 px-1.5 font-bold tabular-nums">
            {filteredLoans.length}
          </Badge>
          {statusFilter !== "all" && (
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              <X className="h-3 w-3" />
              <span className="hidden sm:inline">Limpar filtro</span>
            </button>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              type="button"
              className={cn(
                "h-8.5 px-3 text-xs gap-1.5 font-medium shrink-0 transition-colors border-border/70",
                statusFilter !== "all"
                  ? statusFilter === "em_atraso"
                    ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/15"
                    : statusFilter === "quitado"
                    ? "border-success/50 bg-success/10 text-success hover:bg-success/15"
                    : statusFilter === "pendente"
                    ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/15"
                    : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                  : "text-muted-foreground hover:text-foreground bg-card"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Status: {currentOption.label}</span>
              {statusFilter !== "all" && (
                <span className="text-[10px] font-bold tabular-nums">
                  ({filteredLoans.length})
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-xs">Filtrar por Status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {statusFilterConfig.map((opt) => (
              <DropdownMenuItem
                key={opt.id}
                onClick={() => setStatusFilter(opt.id)}
                className={cn(
                  "flex items-center justify-between text-xs cursor-pointer py-1.5",
                  statusFilter === opt.id && "font-semibold bg-accent text-accent-foreground"
                )}
              >
                <div className="flex items-center gap-2">
                  {opt.dotClass && <span className={cn("w-2 h-2 rounded-full", opt.dotClass)} />}
                  <span>{opt.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums font-semibold">
                  {opt.count}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile — Cards */}
      <div className="md:hidden space-y-2">
        {filteredLoans.map((l) => {
          const { remaining, paid, isPaid, state } = computeValueCell(l);
          const { label, className } = statusMeta(l, state);
          const settlementDate = lastPaymentDateByLoan[l.id];
          const isSettled = l.status === "paid" && remaining === 0 && !!settlementDate;
          return (
            <button
              type="button"
              key={l.id}
              onClick={() => setSelectedLoan(l)}
              className="w-full text-left rounded-lg border border-border/50 bg-card/40 p-3 space-y-2 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {formatDate(l.startDate)}
                </span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${className}`}>
                  {label}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-center">
                <div>
                  <div className="text-muted-foreground">Vencimento</div>
                  <div className="tabular-nums font-medium">{formatDate(l.dueDate)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Parcelas</div>
                  <div className="tabular-nums font-medium">
                    {l.paidInstallments ?? 0} / {l.installments}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Valor</div>
                  <div className="tabular-nums font-medium">{mask(formatCurrency(l.amount))}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Restante</div>
                  <div className="tabular-nums font-medium text-warning">
                    {mask(formatCurrency(remaining))}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Pago</div>
                  <div className="tabular-nums font-medium text-success">
                    {mask(formatCurrency(paid))}
                  </div>
                </div>
                {isSettled && (
                  <div>
                    <div className="text-muted-foreground">Quitação</div>
                    <div className="tabular-nums font-medium text-primary">
                      {formatDate(settlementDate)}
                    </div>
                  </div>
                )}
                {l.tags && l.tags.length > 0 && (
                  <div className={isSettled ? "" : "col-span-2"}>
                    <div className="text-muted-foreground">Etiquetas</div>
                    <div className="mt-0.5 flex justify-center">{renderTags(l.tags)}</div>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop / Tablet — Table */}
      <div className="hidden md:block w-full overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground">
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Data</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Vencimento</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Quitação</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Valor</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Restante</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Pago</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Parcelas</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Status</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Etiquetas</th>
            </tr>
          </thead>
          <tbody>
            {filteredLoans.map((l) => {
              const { remaining, paid, state } = computeValueCell(l);
              const { label, className } = statusMeta(l, state);
              const settlementDate = lastPaymentDateByLoan[l.id];
              const isSettled = l.status === "paid" && remaining === 0 && !!settlementDate;
              return (
                <tr
                  key={l.id}
                  onClick={() => setSelectedLoan(l)}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap text-center">{formatDate(l.startDate)}</td>
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap text-center">{formatDate(l.dueDate)}</td>
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap font-medium text-primary text-center">
                    {isSettled ? formatDate(settlementDate) : "—"}
                  </td>
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap font-medium text-center">
                    {mask(formatCurrency(l.amount))}
                  </td>
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap font-medium text-warning text-center">
                    {mask(formatCurrency(remaining))}
                  </td>
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap font-medium text-success text-center">
                    {mask(formatCurrency(paid))}
                  </td>
                  <td className="py-2 px-2 tabular-nums text-center whitespace-nowrap">
                    {l.paidInstallments ?? 0} / {l.installments}
                  </td>
                  <td className="py-2 px-2 text-center whitespace-nowrap">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${className}`}>
                      {label}
                    </Badge>
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    <div className="flex justify-center">{renderTags(l.tags)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* P0-03 (B): não passamos mais `payments` — o diálogo busca sob demanda. */}
      <LoanPaymentHistoryDialog
        loan={selectedLoan}
        open={selectedLoan !== null}
        onOpenChange={(o) => !o && setSelectedLoan(null)}
      />
    </>
  );
}
