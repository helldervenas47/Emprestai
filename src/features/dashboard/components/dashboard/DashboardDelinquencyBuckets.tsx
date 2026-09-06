import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Users,
  Receipt,
  MessageCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import type { Loan, InstallmentSchedule, Payment, Client } from "@/types/loan";
import { todayInAppTz } from "@/lib/timezone";
import { getLoanLateFees } from "@/features/loans/lib/loanLateFees";
import { buildBillingWhatsappLink, DEFAULT_WHATSAPP_MESSAGES } from "@/lib/whatsappBilling";

export type DelinquencyBucketId = "1-7" | "8-30" | "31-60" | "60+";

interface BucketStats {
  id: DelinquencyBucketId;
  label: string;
  rangeDays: string;
  amount: number;
  count: number;
  clientIds: Set<string>;
  items: Array<{
    loan: Loan;
    clientName: string;
    clientId?: string;
    clientPhone?: string;
    daysOverdue: number;
    amount: number;
    lateFees: number;
    dueDate: string;
    installmentNumber?: number;
  }>;
}

interface DashboardDelinquencyBucketsProps {
  loans: Loan[];
  installmentSchedules?: InstallmentSchedule[];
  payments?: Payment[];
  clients?: Client[];
  formatCurrency: (v: number) => string;
  onOpenPayment: (loan: Loan) => void;
}

export function DashboardDelinquencyBuckets({
  loans,
  installmentSchedules = [],
  payments = [],
  clients = [],
  formatCurrency,
  onOpenPayment,
}: DashboardDelinquencyBucketsProps) {
  const todayStr = todayInAppTz();
  const [selectedBucket, setSelectedBucket] = useState<BucketStats | null>(null);

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((c) => map.set(c.id, c));
    return map;
  }, [clients]);

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

  // Agrupa os empréstimos em atraso por faixas
  const buckets = useMemo(() => {
    const stats: Record<DelinquencyBucketId, BucketStats> = {
      "1-7": {
        id: "1-7",
        label: "Atraso Recente",
        rangeDays: "1 a 7 dias",
        amount: 0,
        count: 0,
        clientIds: new Set(),
        items: [],
      },
      "8-30": {
        id: "8-30",
        label: "Atraso Moderado",
        rangeDays: "8 a 30 dias",
        amount: 0,
        count: 0,
        clientIds: new Set(),
        items: [],
      },
      "31-60": {
        id: "31-60",
        label: "Atraso Grave",
        rangeDays: "31 a 60 dias",
        amount: 0,
        count: 0,
        clientIds: new Set(),
        items: [],
      },
      "60+": {
        id: "60+",
        label: "Crítico",
        rangeDays: "60+ dias",
        amount: 0,
        count: 0,
        clientIds: new Set(),
        items: [],
      },
    };

    const activeLoans = loans.filter((l) => l.status === "active");

    for (const loan of activeLoans) {
      const client = loan.borrowerId ? clientMap.get(loan.borrowerId) : null;
      const clientName = client?.name || loan.borrowerName || "Cliente";
      const clientPhone = client?.phone || "";

      const schedules = installmentSchedules
        .filter((s) => s.loanId === loan.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber);

      const paidSet = paidMap.get(loan.id) || new Set<number>();

      if (schedules.length > 0) {
        const pendingSchedules = schedules.filter((s) => !paidSet.has(s.installmentNumber));

        for (const s of pendingSchedules) {
          const sDue = s.dueDate.substring(0, 10);
          if (sDue < todayStr) {
            const dueTimestamp = new Date(`${sDue}T00:00:00`).getTime();
            const todayTimestamp = new Date(`${todayStr}T00:00:00`).getTime();
            const daysOver = Math.max(1, Math.round((todayTimestamp - dueTimestamp) / (1000 * 60 * 60 * 24)));
            const fees = getLoanLateFees(loan, payments, schedules);
            const amountVal = Number(s.amount) || 0;

            let bucketId: DelinquencyBucketId = "1-7";
            if (daysOver > 60) bucketId = "60+";
            else if (daysOver >= 31) bucketId = "31-60";
            else if (daysOver >= 8) bucketId = "8-30";

            stats[bucketId].amount += amountVal;
            stats[bucketId].count += 1;
            if (loan.borrowerId) stats[bucketId].clientIds.add(loan.borrowerId);

            stats[bucketId].items.push({
              loan,
              clientName,
              clientId: loan.borrowerId || undefined,
              clientPhone,
              daysOverdue: daysOver,
              amount: amountVal,
              lateFees: fees.lateFees || 0,
              dueDate: sDue,
              installmentNumber: s.installmentNumber,
            });
          }
        }
      } else {
        const lDue = (loan.dueDate || "").substring(0, 10);
        if (lDue < todayStr) {
          const dueTimestamp = new Date(`${lDue}T00:00:00`).getTime();
          const todayTimestamp = new Date(`${todayStr}T00:00:00`).getTime();
          const daysOver = Math.max(1, Math.round((todayTimestamp - dueTimestamp) / (1000 * 60 * 60 * 24)));
          const amountVal = Number(loan.remainingAmount ?? loan.amount) || 0;
          const fees = getLoanLateFees(loan, payments, schedules);

          let bucketId: DelinquencyBucketId = "1-7";
          if (daysOver > 60) bucketId = "60+";
          else if (daysOver >= 31) bucketId = "31-60";
          else if (daysOver >= 8) bucketId = "8-30";

          stats[bucketId].amount += amountVal;
          stats[bucketId].count += 1;
          if (loan.borrowerId) stats[bucketId].clientIds.add(loan.borrowerId);

          stats[bucketId].items.push({
            loan,
            clientName,
            clientId: loan.borrowerId || undefined,
            clientPhone,
            daysOverdue: daysOver,
            amount: amountVal,
            lateFees: fees.lateFees || 0,
            dueDate: lDue,
          });
        }
      }
    }

    return Object.values(stats);
  }, [loans, installmentSchedules, payments, clientMap, paidMap, todayStr]);

  const totalOverdueAmount = buckets.reduce((acc, b) => acc + b.amount, 0);
  const totalOverdueCount = buckets.reduce((acc, b) => acc + b.count, 0);

  const handleWhatsappClick = (item: any) => {
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

  const formatDateBR = (isoDate: string) => {
    try {
      const [y, m, d] = isoDate.split("-");
      return `${d}/${m}/${y}`;
    } catch {
      return isoDate;
    }
  };

  return (
    <>
      <Card className="border border-border/80 bg-card shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3 border-b border-border/40 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base font-bold text-foreground">
                Inadimplência por Faixas de Atraso
              </CardTitle>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Visão estratificada do risco de crédito para ações de recuperação e cobrança.
              </p>
            </div>
          </div>

          <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/5">
            Total: {formatCurrency(totalOverdueAmount)}
          </Badge>
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          {totalOverdueCount === 0 ? (
            <div className="py-6 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-foreground">Zero Inadimplência</p>
              <p className="text-xs text-muted-foreground">Nenhuma parcela em atraso na sua carteira.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {buckets.map((b) => {
                const isCritical = b.id === "60+" || b.id === "31-60";
                const hasItems = b.count > 0;

                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={!hasItems}
                    onClick={() => hasItems && setSelectedBucket(b)}
                    className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between space-y-3 ${
                      hasItems
                        ? isCritical
                          ? "bg-rose-500/5 border-rose-500/30 hover:border-rose-500/60 hover:shadow-xs cursor-pointer"
                          : "bg-amber-500/5 border-amber-500/30 hover:border-amber-500/60 hover:shadow-xs cursor-pointer"
                        : "bg-muted/20 border-border/40 opacity-60 cursor-default"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-foreground">
                        {b.rangeDays}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 font-semibold ${
                          hasItems
                            ? isCritical
                              ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                              : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {b.count} {b.count === 1 ? "parcela" : "parcelas"}
                      </Badge>
                    </div>

                    <div className="space-y-0.5">
                      <p className={`text-base font-bold tabular-nums ${hasItems ? (isCritical ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400") : "text-muted-foreground"}`}>
                        {formatCurrency(b.amount)}
                      </p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3 shrink-0" />
                        <span>{b.clientIds.size} {b.clientIds.size === 1 ? "cliente" : "clientes"}</span>
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DIÁLOGO COM A LISTA DE CLIENTES DA FAIXA SELECIONADA */}
      <Dialog open={!!selectedBucket} onOpenChange={(open) => !open && setSelectedBucket(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden border-border/80 bg-card shadow-2xl rounded-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-border/60 bg-muted/20">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 bg-rose-500/10 text-rose-600 border-rose-500/20">
                Atraso: {selectedBucket?.rangeDays}
              </Badge>
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                Cobranças da Faixa ({selectedBucket?.count})
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Total acumulado nesta faixa: <strong className="text-foreground">{formatCurrency(selectedBucket?.amount || 0)}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 overflow-y-auto flex-1 divide-y divide-border/40 space-y-2">
            {selectedBucket?.items.map((item, idx) => (
              <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 space-y-0.5">
                  <strong className="text-sm font-semibold text-foreground truncate block">
                    {item.clientName}
                  </strong>
                  <div className="text-muted-foreground flex items-center gap-2">
                    <span>Venceu em: {formatDateBR(item.dueDate)}</span>
                    <Badge className="bg-rose-500/15 text-rose-600 text-[10px] px-1 py-0">
                      {item.daysOverdue} dias
                    </Badge>
                  </div>
                  <div className="text-foreground font-medium">
                    Valor: <strong>{formatCurrency(item.amount)}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleWhatsappClick(item)}
                    className="h-8 px-2 text-xs rounded-lg gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                    title="Cobrar via WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">WhatsApp</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedBucket(null);
                      onOpenPayment(item.loan);
                    }}
                    className="h-8 px-2 text-xs rounded-lg font-semibold gap-1 bg-primary text-primary-foreground"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Pagar</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
