import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Calendar,
  Clock,
  MessageCircle,
  Receipt,
  User,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import type { Loan, InstallmentSchedule, Payment, Client } from "@/types/loan";
import { todayInAppTz } from "@/lib/timezone";
import { getLoanLateFees } from "@/features/loans/lib/loanLateFees";
import { buildBillingWhatsappLink, DEFAULT_WHATSAPP_MESSAGES } from "@/lib/whatsappBilling";

export interface AttentionItem {
  id: string;
  type: "overdue" | "due_today" | "upcoming" | "multiple_overdue";
  loanId: string;
  clientId?: string;
  clientName: string;
  clientPhone?: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  lateFees: number;
  totalWithFees: number;
  installmentNumber?: number;
  loan: Loan;
}

interface DashboardAttentionSectionProps {
  loans: Loan[];
  installmentSchedules?: InstallmentSchedule[];
  payments?: Payment[];
  clients?: Client[];
  formatCurrency: (v: number) => string;
  onOpenPayment: (loan: Loan) => void;
  onNavigateToLoan?: (loanId: string) => void;
  onNavigateToClient?: (clientId: string) => void;
}

export function DashboardAttentionSection({
  loans,
  installmentSchedules = [],
  payments = [],
  clients = [],
  formatCurrency,
  onOpenPayment,
  onNavigateToLoan,
  onNavigateToClient,
}: DashboardAttentionSectionProps) {
  const todayStr = todayInAppTz();

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((c) => map.set(c.id, c));
    return map;
  }, [clients]);

  // Mapeia as parcelas pagas por empréstimo
  const paidMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    payments.forEach((p) => {
      if (p.loanId && p.installmentNumber > 0) {
        const set = map.get(p.loanId) || new Set<number>();
        set.add(p.installmentNumber);
        map.set(p.loanId, set);
      }
    });
    return map;
  }, [payments]);

  // Monta a lista de itens prioritários
  const attentionItems = useMemo(() => {
    const items: AttentionItem[] = [];
    const activeLoans = loans.filter((l) => l.status === "active");

    for (const loan of activeLoans) {
      const client = loan.borrowerId ? clientMap.get(loan.borrowerId) : null;
      const clientName = client?.name || loan.borrowerName || "Cliente";
      const clientPhone = client?.phone || "";

      const schedules = installmentSchedules
        .filter((s) => s.loanId === loan.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber);

      const paidSet = paidMap.get(loan.id) || new Set<number>();

      // Se possui cronograma de parcelas
      if (schedules.length > 0) {
        const pendingSchedules = schedules.filter((s) => !paidSet.has(s.installmentNumber));

        for (const s of pendingSchedules) {
          const sDue = s.dueDate.substring(0, 10);
          const isOverdue = sDue < todayStr;
          const isDueToday = sDue === todayStr;

          // Próximos 3 dias
          const dueTimestamp = new Date(`${sDue}T00:00:00`).getTime();
          const todayTimestamp = new Date(`${todayStr}T00:00:00`).getTime();
          const diffDays = Math.round((dueTimestamp - todayTimestamp) / (1000 * 60 * 60 * 24));
          const isUpcoming = diffDays > 0 && diffDays <= 3;

          if (isOverdue || isDueToday || isUpcoming) {
            const fees = getLoanLateFees(loan, payments, schedules);
            const daysOver = isOverdue ? Math.max(1, Math.abs(diffDays)) : 0;
            const lateFeesVal = isOverdue ? fees.lateFees : 0;
            const amountVal = Number(s.amount) || 0;

            items.push({
              id: `${loan.id}_inst_${s.installmentNumber}`,
              type: isOverdue ? "overdue" : isDueToday ? "due_today" : "upcoming",
              loanId: loan.id,
              clientId: loan.borrowerId || undefined,
              clientName,
              clientPhone,
              amount: amountVal,
              dueDate: sDue,
              daysOverdue: daysOver,
              lateFees: lateFeesVal,
              totalWithFees: amountVal + lateFeesVal,
              installmentNumber: s.installmentNumber,
              loan,
            });
          }
        }
      } else {
        // Empréstimo sem cronograma detalhado (vencimento único no contrato)
        const lDue = (loan.dueDate || "").substring(0, 10);
        const isOverdue = lDue < todayStr;
        const isDueToday = lDue === todayStr;

        const dueTimestamp = new Date(`${lDue}T00:00:00`).getTime();
        const todayTimestamp = new Date(`${todayStr}T00:00:00`).getTime();
        const diffDays = Math.round((dueTimestamp - todayTimestamp) / (1000 * 60 * 60 * 24));
        const isUpcoming = diffDays > 0 && diffDays <= 3;

        if (isOverdue || isDueToday || isUpcoming) {
          const fees = getLoanLateFees(loan, payments, schedules);
          const daysOver = isOverdue ? Math.max(1, Math.abs(diffDays)) : 0;
          const amountVal = Number(loan.remainingAmount ?? loan.amount) || 0;

          items.push({
            id: `${loan.id}_main`,
            type: isOverdue ? "overdue" : isDueToday ? "due_today" : "upcoming",
            loanId: loan.id,
            clientId: loan.borrowerId || undefined,
            clientName,
            clientPhone,
            amount: amountVal,
            dueDate: lDue,
            daysOverdue: daysOver,
            lateFees: fees.lateFees || 0,
            totalWithFees: amountVal + (fees.lateFees || 0),
            loan,
          });
        }
      }
    }

    // Ordenação por prioridade:
    // 1º Atrasados (maior número de dias primeiro)
    // 2º Vence Hoje
    // 3º Próximos vencimentos
    return items.sort((a, b) => {
      const priorityOrder = { overdue: 1, due_today: 2, upcoming: 3, multiple_overdue: 1 };
      if (priorityOrder[a.type] !== priorityOrder[b.type]) {
        return priorityOrder[a.type] - priorityOrder[b.type];
      }
      if (a.type === "overdue" && b.type === "overdue") {
        return b.daysOverdue - a.daysOverdue;
      }
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [loans, installmentSchedules, payments, clientMap, paidMap, todayStr]);

  const formatDateBR = (isoDate: string) => {
    try {
      const [y, m, d] = isoDate.split("-");
      return `${d}/${m}`;
    } catch {
      return isoDate;
    }
  };

  const handleWhatsappClick = (item: AttentionItem) => {
    const client = item.clientId ? clientMap.get(item.clientId) : null;
    const { url } = buildBillingWhatsappLink({
      client,
      loan: item.loan,
      schedules: installmentSchedules,
      payments,
      messages: DEFAULT_WHATSAPP_MESSAGES,
    });
    window.open(url, "_blank");
  };

  const overdueItemsCount = attentionItems.filter((i) => i.type === "overdue").length;
  const dueTodayItemsCount = attentionItems.filter((i) => i.type === "due_today").length;

  return (
    <Card className="border border-border/80 bg-card shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3 border-b border-border/40 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm sm:text-base font-bold text-foreground">
                Precisam da sua atenção
              </CardTitle>
              {attentionItems.length > 0 && (
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold">
                  {attentionItems.length} {attentionItems.length === 1 ? "pendência" : "pendências"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Ações operacionais prioritárias: cobranças atrasadas, vencimentos de hoje e próximos dias.
            </p>
          </div>
        </div>

        {/* Badges rápidos de resumo */}
        <div className="flex items-center gap-1.5 text-xs">
          {overdueItemsCount > 0 && (
            <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 border-rose-500/20 text-[10px]">
              {overdueItemsCount} atrasados
            </Badge>
          )}
          {dueTodayItemsCount > 0 && (
            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border-amber-500/20 text-[10px]">
              {dueTodayItemsCount} hoje
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 divide-y divide-border/40">
        {attentionItems.length === 0 ? (
          /* ESTADO VAZIO POSITIVO */
          <div className="py-10 px-4 text-center space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-0.5">
              <p className="font-semibold text-foreground text-sm sm:text-base">
                Tudo em dia por aqui!
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Nenhuma parcela em atraso ou com vencimento previsto para hoje na sua carteira.
              </p>
            </div>
          </div>
        ) : (
          /* LISTA DE ITENS PRIORITÁRIOS (Limitada aos 10 principais com scroll se maior) */
          <div className="max-h-[440px] overflow-y-auto divide-y divide-border/30">
            {attentionItems.slice(0, 15).map((item) => {
              const isOverdue = item.type === "overdue";
              const isDueToday = item.type === "due_today";

              return (
                <div
                  key={item.id}
                  className="p-3.5 sm:p-4 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  {/* Informações do Cliente & Parcela */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isOverdue
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : isDueToday
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-blue-500/10 text-blue-500"
                      }`}
                    >
                      {isOverdue ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : (
                        <Calendar className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-sm font-semibold text-foreground truncate">
                          {item.clientName}
                        </strong>
                        {item.installmentNumber ? (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4.5 font-medium">
                            Parcela {item.installmentNumber}
                          </Badge>
                        ) : null}
                        {isOverdue ? (
                          <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] px-1.5 py-0">
                            {item.daysOverdue} {item.daysOverdue === 1 ? "dia de atraso" : "dias de atraso"}
                          </Badge>
                        ) : isDueToday ? (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                            Vence Hoje
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            Vence em {formatDateBR(item.dueDate)}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Valor: <strong className="text-foreground">{formatCurrency(item.amount)}</strong></span>
                        {item.lateFees > 0 && (
                          <span className="text-rose-600 font-medium">
                            + {formatCurrency(item.lateFees)} (encargos)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações Rápidas por Item */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {/* Botão Cobrança WhatsApp */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleWhatsappClick(item)}
                      className="h-8 px-2.5 text-xs rounded-xl gap-1.5 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                      title="Enviar lembrete ou cobrança pelo WhatsApp"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Cobrar WhatsApp</span>
                    </Button>

                    {/* Botão Registrar Pagamento */}
                    <Button
                      size="sm"
                      onClick={() => onOpenPayment(item.loan)}
                      className="h-8 px-2.5 text-xs rounded-xl font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xs"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Registrar Pagamento</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
