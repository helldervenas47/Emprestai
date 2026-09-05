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
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  X,
  FileSpreadsheet,
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
  const [activeDetail, setActiveDetail] = useState<"delays" | "open_balance" | null>(null);

  const riskInfo = useMemo(() => {
    if (!item) return null;
    return getClientRiskScoreInfo(item.score);
  }, [item]);

  const todayStr = todayInAppTz();
  const today = useMemo(() => new Date(todayStr + "T00:00:00"), [todayStr]);

  // Obtém todos os empréstimos e pagamentos do cliente
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
      const loanPayments = clientPaymentsAll.filter((p) => p.loanId === loan.id);
      const paidAmount = loanPayments.reduce((s, p) => s + (p.amount || 0), 0);

      let status: "overdue" | "ontime" | "today" = "ontime";
      if (daysOverdue > 0) {
        status = "overdue";
      } else if (nextDue === todayStr) {
        status = "today";
      }

      contracts.push({
        loanId: loan.id,
        startDate: loan.startDate || loan.createdAt?.split("T")[0],
        dueDate: nextDue || loan.dueDate,
        amount: loan.amount || 0,
        notes: loan.notes || loan.description,
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

  const toggleDetail = (type: "delays" | "open_balance") => {
    setActiveDetail((prev) => (prev === type ? null : type));
  };

  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => {
        if (!open) {
          setActiveDetail(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden max-h-[90vh] flex flex-col">
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

        {/* Conteúdo rolável */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
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

          {/* Pontualidade e Atrasos (Cards Interativos) */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Pontualidade e Atrasos
              </h4>
              <span className="text-[11px] text-muted-foreground">
                Toque nos cards com detalhe para ver os registros
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

              {/* Card: Maior Atraso (Clicável) */}
              <button
                type="button"
                onClick={() => toggleDetail("delays")}
                className={`p-3 rounded-lg border text-left transition-all duration-200 cursor-pointer relative group ${
                  activeDetail === "delays"
                    ? "border-destructive ring-2 ring-destructive/30 bg-destructive/10"
                    : "border-border/60 bg-card hover:border-destructive/60 hover:bg-destructive/5"
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-muted-foreground text-xs mb-1">
                  <div className="flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5 text-destructive" />
                    <span className="font-medium">Maior Atraso</span>
                  </div>
                  {activeDetail === "delays" ? (
                    <ChevronUp className="h-3.5 w-3.5 text-destructive shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-destructive shrink-0 transition-colors" />
                  )}
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
                  <span className="text-[9px] font-semibold text-destructive/90 underline decoration-destructive/40">
                    {activeDetail === "delays" ? "Ocultar" : "Ver registros"}
                  </span>
                </div>
              </button>

              {/* Card: Saldo em Aberto (Clicável) */}
              <button
                type="button"
                onClick={() => toggleDetail("open_balance")}
                className={`p-3 rounded-lg border text-left transition-all duration-200 cursor-pointer col-span-2 sm:col-span-1 relative group ${
                  activeDetail === "open_balance"
                    ? "border-primary ring-2 ring-primary/30 bg-primary/10"
                    : "border-border/60 bg-card hover:border-primary/60 hover:bg-primary/5"
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-muted-foreground text-xs mb-1">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium">Saldo em Aberto</span>
                  </div>
                  {activeDetail === "open_balance" ? (
                    <ChevronUp className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                  )}
                </div>
                <span className="text-sm sm:text-base font-bold text-foreground block">
                  {formatBRL(item.open_amount)}
                </span>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    Principal, juros e multas
                  </span>
                  <span className="text-[9px] font-semibold text-primary/90 underline decoration-primary/40">
                    {activeDetail === "open_balance" ? "Ocultar" : "Ver registros"}
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Detalhamento Expandido: MAIOR ATRASO */}
          {activeDetail === "delays" && (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 sm:p-4 space-y-3 animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between border-b border-destructive/20 pb-2.5">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-destructive" />
                  <div>
                    <h5 className="text-xs sm:text-sm font-bold text-foreground">
                      Registros Considerados no Maior Atraso
                    </h5>
                    <p className="text-[11px] text-muted-foreground">
                      Considera atrasos ativos em aberto e pagamentos históricos com atraso (&gt;3 dias de tolerância).
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveDetail(null)}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Fechar
                </Button>
              </div>

              {delayRecords.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground bg-card/60 rounded-lg border border-border/40">
                  <CheckCircle2 className="h-5 w-5 text-success mx-auto mb-1.5" />
                  Nenhum registro de atraso encontrado para este cliente. Todos os pagamentos foram pontuais!
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {delayRecords.map((record) => (
                    <div
                      key={record.id}
                      className={`p-3 rounded-lg border bg-card text-xs space-y-1.5 transition-all ${
                        record.isMaxDelay
                          ? "border-destructive/60 shadow-sm ring-1 ring-destructive/40"
                          : "border-border/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-foreground">
                            {record.installmentLabel}
                          </span>
                          {record.loanNotes && (
                            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                              {record.loanNotes}
                            </span>
                          )}
                          {record.isMaxDelay && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] px-1.5 py-0 font-bold bg-destructive text-destructive-foreground animate-pulse"
                            >
                              ⚡ Recorde: Maior Atraso ({record.daysOverdue} dias)
                            </Badge>
                          )}
                        </div>
                        <span className="font-bold text-destructive whitespace-nowrap">
                          {record.daysOverdue} dias de atraso
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
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
                          <span className="font-semibold text-foreground">
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

          {/* Detalhamento Expandido: SALDO EM ABERTO */}
          {activeDetail === "open_balance" && (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3.5 sm:p-4 space-y-3 animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between border-b border-primary/20 pb-2.5">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <div>
                    <h5 className="text-xs sm:text-sm font-bold text-foreground">
                      Contratos Considerados no Saldo em Aberto
                    </h5>
                    <p className="text-[11px] text-muted-foreground">
                      Detalhamento do capital principal restante, juros e multas de cada contrato ativo.
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveDetail(null)}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Fechar
                </Button>
              </div>

              {openBalanceContracts.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground bg-card/60 rounded-lg border border-border/40">
                  <CheckCircle2 className="h-5 w-5 text-success mx-auto mb-1.5" />
                  Nenhum contrato com saldo em aberto. Todos os empréstimos deste cliente estão quitados!
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {openBalanceContracts.map((contract) => (
                    <div
                      key={contract.loanId}
                      className="p-3 rounded-lg border border-border/60 bg-card text-xs space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-semibold text-foreground">
                            Empréstimo de {formatBRL(contract.amount)}
                          </span>
                          {contract.notes && (
                            <span className="ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                              {contract.notes}
                            </span>
                          )}
                          <span className="block text-[11px] text-muted-foreground mt-0.5">
                            Início: {formatDate(contract.startDate)} • Vencimento: {formatDate(contract.dueDate)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-sm text-foreground block">
                            {formatBRL(contract.totalPending)}
                          </span>
                          {contract.status === "overdue" && (
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                              Atrasado ({contract.daysOverdue}d)
                            </Badge>
                          )}
                          {contract.status === "today" && (
                            <Badge variant="default" className="text-[9px] px-1.5 py-0 bg-amber-500 text-white">
                              Vence Hoje
                            </Badge>
                          )}
                          {contract.status === "ontime" && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-success border-success/40">
                              Em Dia
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-border/40 text-[11px]">
                        <div>
                          <span className="block text-[10px] text-muted-foreground">Capital Restante</span>
                          <span className="font-medium text-foreground">
                            {formatBRL(contract.principalRemaining)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground">Juros/Multas</span>
                          <span className="font-medium text-amber-600 dark:text-amber-400">
                            {formatBRL(contract.interestPending)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground">Total Já Pago</span>
                          <span className="font-medium text-success">
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
