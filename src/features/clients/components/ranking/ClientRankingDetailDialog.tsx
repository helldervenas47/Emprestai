import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientRankingItem } from "../../types/clientRanking";
import { getClientRiskScoreInfo } from "../../lib/clientRiskScore";
import { formatBRL } from "@/features/creditCards/lib/creditLimit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  ShieldCheck,
  TrendingUp,
  DollarSign,
  Clock,
  Flame,
  Wallet,
  CheckCircle2,
  Calendar,
  ArrowLeft,
  ArrowRight,
  LayoutGrid,
  Tag,
  AlertTriangle,
} from "lucide-react";
import { Client, InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { todayInAppTz } from "@/lib/timezone";
import {
  getClientLoans,
  getFirstPendingDate,
  getDaysOverdue,
  getInstallmentDueDate,
} from "@/features/loans/lib/clientRisk";
import { getLoanPendingBreakdown } from "@/features/loans/lib/portfolioPending";

function formatDate(d?: string | Date): string {
  if (!d) return "—";
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, day] = iso;
    return `${day}/${m}/${y}`;
  }
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

interface ClientRankingDetailDialogProps {
  item: ClientRankingItem | null;
  onClose: () => void;
  clients?: Client[];
  loans?: Loan[];
  payments?: Payment[];
  installmentSchedules?: InstallmentSchedule[];
}

export function ClientRankingDetailDialog({
  item,
  onClose,
  clients = [],
  loans = [],
  payments = [],
  installmentSchedules = [],
}: ClientRankingDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "delays" | "open_balance">("overview");

  const riskInfo = useMemo(() => {
    if (!item) return null;
    return getClientRiskScoreInfo(item.score);
  }, [item]);

  const todayStr = todayInAppTz();
  const today = useMemo(() => new Date(todayStr + "T00:00:00"), [todayStr]);

  // Obtém todos os empréstimos e pagamentos do cliente garantindo sincronismo por nome e id
  const clientLoansAll = useMemo(() => {
    if (!item) return [];
    const client = clients.find((c) => c.id === item.client_id) || {
      id: item.client_id,
      name: item.client_name,
      cpf: item.client_cpf,
      phone: item.client_phone,
    };
    return getClientLoans(client as Client, loans);
  }, [item, clients, loans]);

  const clientLoanIds = useMemo(
    () => new Set(clientLoansAll.map((l) => l.id)),
    [clientLoansAll]
  );

  const clientPaymentsAll = useMemo(
    () => payments.filter((p) => clientLoanIds.has(p.loanId)),
    [payments, clientLoanIds]
  );

  // 1. Registros considerados para o cálculo do Maior Atraso
  const delayRecords = useMemo(() => {
    if (!item) return [];
    const records: Array<{
      id: string;
      type: "active" | "historical";
      loanId: string;
      loanAmount: number;
      loanNotes?: string;
      loanTags: string[];
      installmentLabel: string;
      dueDate: string | Date;
      paidDate?: string;
      amount?: number;
      pendingAmount?: number;
      daysOverdue: number;
      isMaxDelay: boolean;
    }> = [];

    // A. Contratos ativos com atraso pendente
    clientLoansAll.forEach((loan) => {
      if (loan.status !== "paid" && loan.status !== "cancelled") {
        const days = getDaysOverdue(loan, installmentSchedules, today);
        if (days > 0) {
          const nextDue = getFirstPendingDate(loan, installmentSchedules);
          const breakdown = getLoanPendingBreakdown(loan, payments, installmentSchedules);
          records.push({
            id: `active-${loan.id}`,
            type: "active",
            loanId: loan.id,
            loanAmount: loan.amount || 0,
            loanNotes: loan.notes || loan.description,
            loanTags: loan.tags || [],
            installmentLabel: "Parcela pendente em aberto",
            dueDate: nextDue,
            pendingAmount: breakdown.principalRemaining + breakdown.interestPending,
            daysOverdue: days,
            isMaxDelay: days === item.max_delay_days,
          });
        }
      }
    });

    // B. Pagamentos históricos realizados com atraso
    clientPaymentsAll.forEach((p) => {
      if (p.installmentNumber === -1) return;
      const loan = clientLoansAll.find((l) => l.id === p.loanId);
      if (!loan) return;

      let dueDateStr: string | null = null;
      if (p.installmentNumber === 0) {
        dueDateStr = p.previousDueDate ?? loan.dueDate;
      } else if (p.installmentNumber > 0) {
        dueDateStr = getInstallmentDueDate(loan, p.installmentNumber, installmentSchedules);
      }

      if (dueDateStr && p.date) {
        const dueDate = new Date(dueDateStr + "T00:00:00");
        const pDate = new Date(p.date.split("T")[0] + "T00:00:00");
        if (!isNaN(dueDate.getTime()) && !isNaN(pDate.getTime())) {
          const toleranceDate = new Date(dueDate.getTime() + 3 * 24 * 60 * 60 * 1000);
          if (pDate > toleranceDate) {
            const delayDays = Math.max(
              1,
              Math.floor((pDate.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
            );
            const label =
              p.installmentNumber === 0
                ? "Juros / Renovação"
                : `Parcela ${p.installmentNumber}${loan.installments ? `/${loan.installments}` : ""}`;
            records.push({
              id: `payment-${p.id}`,
              type: "historical",
              loanId: loan.id,
              loanAmount: loan.amount || 0,
              loanNotes: loan.notes || loan.description,
              loanTags: loan.tags || [],
              installmentLabel: label,
              dueDate: dueDateStr,
              paidDate: p.date.split("T")[0],
              amount: p.amount,
              daysOverdue: delayDays,
              isMaxDelay: delayDays === item.max_delay_days,
            });
          }
        }
      }
    });

    // Ordenar: primeiro o recorde de maior atraso, depois por dias de atraso decrescente
    return records.sort((a, b) => {
      if (a.isMaxDelay && !b.isMaxDelay) return -1;
      if (!a.isMaxDelay && b.isMaxDelay) return 1;
      return b.daysOverdue - a.daysOverdue;
    });
  }, [item, clientLoansAll, clientPaymentsAll, installmentSchedules, payments, today]);

  // 2. Contratos considerados para o cálculo do Saldo em Aberto
  const openBalanceContracts = useMemo(() => {
    if (!item) return [];
    const contracts: Array<{
      loanId: string;
      startDate?: string;
      dueDate?: string | Date;
      amount: number;
      notes?: string;
      loanTags: string[];
      paidAmount: number;
      principalRemaining: number;
      interestPending: number;
      totalPending: number;
      daysOverdue: number;
      status: "overdue" | "ontime" | "today";
    }> = [];

    clientLoansAll.forEach((loan) => {
      if (loan.status === "paid" || loan.status === "cancelled") return;
      const breakdown = getLoanPendingBreakdown(loan, payments, installmentSchedules);
      const totalPending = breakdown.principalRemaining + breakdown.interestPending;
      if (totalPending <= 0.001 && loan.status !== "active" && loan.status !== "overdue") return;

      const daysOverdue = getDaysOverdue(loan, installmentSchedules, today);
      const nextDue = getFirstPendingDate(loan, installmentSchedules);
      const nextDueStr = nextDue instanceof Date ? nextDue.toISOString().split("T")[0] : String(nextDue);
      const loanPayments = clientPaymentsAll.filter((p) => p.loanId === loan.id);
      const paidAmount = loanPayments.reduce((s, p) => s + (p.amount || 0), 0);

      let status: "overdue" | "ontime" | "today" = "ontime";
      if (daysOverdue > 0) {
        status = "overdue";
      } else if (nextDueStr === todayStr) {
        status = "today";
      }

      contracts.push({
        loanId: loan.id,
        startDate: loan.startDate || loan.createdAt?.split("T")[0],
        dueDate: nextDue || loan.dueDate,
        amount: loan.amount || 0,
        notes: loan.notes || loan.description,
        loanTags: loan.tags || [],
        paidAmount,
        principalRemaining: breakdown.principalRemaining,
        interestPending: breakdown.interestPending,
        totalPending,
        daysOverdue,
        status,
      });
    });

    return contracts.sort((a, b) => {
      if (a.status === "overdue" && b.status !== "overdue") return -1;
      if (a.status !== "overdue" && b.status === "overdue") return 1;
      return b.totalPending - a.totalPending;
    });
  }, [item, clientLoansAll, clientPaymentsAll, installmentSchedules, payments, today, todayStr]);

  if (!item || !riskInfo) return null;

  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => {
        if (!open) {
          setActiveTab("overview");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[640px] p-0 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header com avatar e score */}
        <DialogHeader className="p-4 sm:p-6 bg-muted/30 border-b border-border/60 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-base shrink-0 uppercase">
                {item.client_name.slice(0, 2)}
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                  {item.client_name}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.client_cpf ? `CPF: ${item.client_cpf}` : "Cliente cadastrado"}
                  {item.client_phone && ` • ${item.client_phone}`}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-semibold text-muted-foreground block">Posição</span>
              <span className="text-base sm:text-lg font-extrabold text-foreground flex items-center justify-end gap-1">
                <Trophy className="h-4 w-4 text-amber-500" />
                #{item.position}
              </span>
            </div>
          </div>

          {/* Badge de Score e Risco */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={`text-xs px-2.5 py-0.5 font-bold ${riskInfo.color} ${riskInfo.bgColor}/10 border-current/30`}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              Score: {riskInfo.score}/100 • {riskInfo.riskLevel}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Pontualidade: {item.on_time_percentage.toFixed(0)}%
            </Badge>
          </div>
          {riskInfo.description ? (
            <DialogDescription className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {riskInfo.description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">
              Detalhes de pontualidade, score de risco e histórico do cliente {item.client_name}.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Barra de Abas do Modal */}
        <div className="px-4 sm:px-6 pt-3 shrink-0 bg-background">
          <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/50 text-xs font-semibold overflow-x-auto scrollbar-hide">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap flex-1 ${
                activeTab === "overview"
                  ? "bg-background text-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Visão Geral
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("delays")}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap flex-1 ${
                activeTab === "delays"
                  ? "bg-background text-destructive shadow-sm font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
            >
              <Flame className="h-3.5 w-3.5 text-destructive" />
              Maior Atraso
              <span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-bold">
                {item.max_delay_days}d
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("open_balance")}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap flex-1 ${
                activeTab === "open_balance"
                  ? "bg-background text-primary shadow-sm font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
            >
              <Wallet className="h-3.5 w-3.5 text-primary" />
              Saldo em Aberto
              <span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                {formatBRL(item.open_amount)}
              </span>
            </button>
          </div>
        </div>

        {/* Conteúdo da Aba Ativa */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {/* ================= ABA 1: VISÃO GERAL ================= */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Resumo Financeiro */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                  Resumo Financeiro
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-lg border border-border/50 bg-card">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                      <TrendingUp className="h-3.5 w-3.5 text-primary" />
                      <span>Emprestado</span>
                    </div>
                    <span className="text-sm sm:text-base font-bold text-foreground block">
                      {formatBRL(item.total_borrowed)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {item.total_loans} contrato(s)
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-border/50 bg-card">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      <span>Total Recebido</span>
                    </div>
                    <span className="text-sm sm:text-base font-bold text-success block">
                      {formatBRL(item.total_received)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {item.total_payments} pagamento(s)
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-border/50 bg-card col-span-2 sm:col-span-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                      <DollarSign className="h-3.5 w-3.5 text-amber-500" />
                      <span>Juros Recebidos</span>
                    </div>
                    <span className="text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400 block">
                      {formatBRL(item.profit_generated)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Total de juros recebidos
                    </span>
                  </div>
                </div>
              </div>

              {/* Pontualidade e Atrasos (Cards que navegam para abas) */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Pontualidade e Atrasos
                  </h4>
                  <span className="text-[11px] text-muted-foreground">
                    Clique no card para abrir a aba correspondente
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {/* Card: Em Dia */}
                  <div className="p-3 rounded-lg border border-border/50 bg-card">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                      <Clock className="h-3.5 w-3.5 text-success" />
                      <span>Em Dia</span>
                    </div>
                    <span className="text-sm sm:text-base font-bold text-foreground block">
                      {item.on_time_payments}
                    </span>
                    <span className="text-[10px] text-success">
                      {item.on_time_percentage.toFixed(0)}% de pontualidade
                    </span>
                  </div>

                  {/* Card: Maior Atraso (Navega para Aba Atrasos) */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("delays")}
                    className="p-3 rounded-lg border border-border/60 bg-card hover:border-destructive/60 hover:bg-destructive/5 text-left transition-all duration-200 cursor-pointer relative group"
                  >
                    <div className="flex items-center justify-between gap-1 text-muted-foreground text-xs mb-1">
                      <div className="flex items-center gap-1.5">
                        <Flame className="h-3.5 w-3.5 text-destructive" />
                        <span className="font-medium">Maior Atraso</span>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-destructive group-hover:translate-x-0.5 shrink-0 transition-all" />
                    </div>
                    <span
                      className={`text-sm sm:text-base font-bold block ${
                        item.max_delay_days > 0 ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {item.max_delay_days} dias
                    </span>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {item.overdue_loans} empréstimo(s) com atraso
                      </span>
                      <span className="text-[10px] font-semibold text-destructive underline decoration-destructive/40">
                        Abrir aba →
                      </span>
                    </div>
                  </button>

                  {/* Card: Saldo em Aberto (Navega para Aba Saldo) */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("open_balance")}
                    className="p-3 rounded-lg border border-border/60 bg-card hover:border-primary/60 hover:bg-primary/5 text-left transition-all duration-200 cursor-pointer col-span-2 sm:col-span-1 relative group"
                  >
                    <div className="flex items-center justify-between gap-1 text-muted-foreground text-xs mb-1">
                      <div className="flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5 text-primary" />
                        <span className="font-medium">Saldo em Aberto</span>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 shrink-0 transition-all" />
                    </div>
                    <span className="text-sm sm:text-base font-bold text-foreground block">
                      {formatBRL(item.open_amount)}
                    </span>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        Principal, juros e multas
                      </span>
                      <span className="text-[10px] font-semibold text-primary underline decoration-primary/40">
                        Abrir aba →
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= ABA 2: MAIOR ATRASO ================= */}
          {activeTab === "delays" && (
            <div className="space-y-3 animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
                    <Flame className="h-5 w-5" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-foreground flex items-center gap-2">
                      Registros Considerados no Maior Atraso
                      <Badge variant="destructive" className="text-xs px-2 py-0">
                        {item.max_delay_days} dias
                      </Badge>
                    </h5>
                    <p className="text-xs text-muted-foreground">
                      Considera atrasos ativos em aberto e pagamentos históricos após tolerância (&gt;3 dias).
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("overview")}
                  className="h-8 text-xs gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Voltar
                </Button>
              </div>

              {delayRecords.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground bg-card/60 rounded-xl border border-border/40 space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-success mx-auto" />
                  <p className="text-sm font-semibold text-foreground">
                    Nenhum atraso registrado
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Este cliente não possui parcelas vencidas em aberto nem histórico de pagamentos em atraso.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {delayRecords.map((record) => (
                    <div
                      key={record.id}
                      className={`p-3.5 rounded-xl border bg-card text-xs space-y-2.5 transition-all ${
                        record.isMaxDelay
                          ? "border-destructive/70 shadow-sm ring-1 ring-destructive/40 bg-destructive/[0.02]"
                          : "border-border/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-sm text-foreground">
                              {record.installmentLabel}
                            </span>
                            {record.isMaxDelay && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] px-2 py-0.5 font-bold bg-destructive text-destructive-foreground animate-pulse"
                              >
                                ⚡ Recorde: Maior Atraso ({record.daysOverdue} dias)
                              </Badge>
                            )}
                          </div>
                          
                          {/* Etiquetas do Contrato */}
                          {record.loanTags && record.loanTags.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap pt-0.5">
                              {record.loanTags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-[10px] px-2 py-0 bg-primary/10 text-primary border-primary/30 font-medium flex items-center gap-1"
                                >
                                  <Tag className="h-2.5 w-2.5" />
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {record.loanNotes && (
                            <p className="text-[11px] text-muted-foreground italic">
                              "{record.loanNotes}"
                            </p>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="font-bold text-sm text-destructive block">
                            {record.daysOverdue} dias de atraso
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Empréstimo original: {formatBRL(record.loanAmount)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-muted-foreground pt-2 border-t border-border/40">
                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">Vencimento</span>
                          <span className="font-medium text-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {formatDate(record.dueDate)}
                          </span>
                        </div>

                        {record.type === "historical" && record.paidDate && (
                          <div>
                            <span className="block text-[10px] text-muted-foreground/80">Pago em</span>
                            <span className="font-medium text-foreground flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-success" />
                              {formatDate(record.paidDate)}
                            </span>
                          </div>
                        )}

                        {record.type === "active" && (
                          <div>
                            <span className="block text-[10px] text-muted-foreground/80">Situação</span>
                            <span className="font-bold text-destructive">
                              Atraso Ativo em Aberto
                            </span>
                          </div>
                        )}

                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">
                            {record.type === "active" ? "Saldo Pendente" : "Valor Pago"}
                          </span>
                          <span className="font-semibold text-foreground text-xs">
                            {formatBRL(record.amount || record.pendingAmount || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= ABA 3: SALDO EM ABERTO ================= */}
          {activeTab === "open_balance" && (
            <div className="space-y-3 animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-foreground flex items-center gap-2">
                      Contratos Considerados no Saldo em Aberto
                      <Badge variant="outline" className="text-xs px-2 py-0 border-primary/40 text-primary">
                        Total: {formatBRL(item.open_amount)}
                      </Badge>
                    </h5>
                    <p className="text-xs text-muted-foreground">
                      Detalhamento do capital principal restante, juros e multas de cada contrato ativo.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("overview")}
                  className="h-8 text-xs gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Voltar
                </Button>
              </div>

              {openBalanceContracts.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground bg-card/60 rounded-xl border border-border/40 space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-success mx-auto" />
                  <p className="text-sm font-semibold text-foreground">
                    Nenhum saldo em aberto
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Todos os empréstimos deste cliente estão 100% quitados no momento.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {openBalanceContracts.map((contract) => (
                    <div
                      key={contract.loanId}
                      className="p-3.5 rounded-xl border border-border/60 bg-card text-xs space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground">
                              Empréstimo de {formatBRL(contract.amount)}
                            </span>
                            {contract.status === "overdue" && (
                              <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                                Atrasado ({contract.daysOverdue}d)
                              </Badge>
                            )}
                            {contract.status === "today" && (
                              <Badge variant="default" className="text-[10px] px-2 py-0.5 bg-amber-500 text-white">
                                Vence Hoje
                              </Badge>
                            )}
                            {contract.status === "ontime" && (
                              <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-success border-success/40">
                                Em Dia
                              </Badge>
                            )}
                          </div>

                          {/* Etiquetas do Contrato */}
                          {contract.loanTags && contract.loanTags.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap pt-0.5">
                              {contract.loanTags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-[10px] px-2 py-0 bg-primary/10 text-primary border-primary/30 font-medium flex items-center gap-1"
                                >
                                  <Tag className="h-2.5 w-2.5" />
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {contract.notes && (
                            <p className="text-[11px] text-muted-foreground italic">
                              "{contract.notes}"
                            </p>
                          )}

                          <span className="block text-[11px] text-muted-foreground">
                            Início: {formatDate(contract.startDate)} • Próximo Vencimento: {formatDate(contract.dueDate)}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground block">Saldo Devedor Total</span>
                          <span className="font-extrabold text-base text-foreground block">
                            {formatBRL(contract.totalPending)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40 text-[11px]">
                        <div className="p-2 rounded-lg bg-muted/40 border border-border/30">
                          <span className="block text-[10px] text-muted-foreground">Capital Restante</span>
                          <span className="font-semibold text-foreground text-xs">
                            {formatBRL(contract.principalRemaining)}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <span className="block text-[10px] text-amber-700 dark:text-amber-300">Juros/Multas</span>
                          <span className="font-semibold text-amber-600 dark:text-amber-400 text-xs">
                            {formatBRL(contract.interestPending)}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-success/10 border border-success/20">
                          <span className="block text-[10px] text-success/80">Total Já Pago</span>
                          <span className="font-semibold text-success text-xs">
                            {formatBRL(contract.paidAmount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
