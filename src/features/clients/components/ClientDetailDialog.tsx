import { useMemo } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, CheckCircle2, Minus, ShieldCheck, Wallet } from "lucide-react";
import { Client, InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { buildClientRiskHistory, buildConsolidatedRiskProfile, formatRiskCurrency, getClientLoans, getClientRiskMetrics } from "@/features/loans/lib/clientRisk";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
}

export function ClientDetailDialog({ open, onOpenChange, client, loans, payments, installmentSchedules }: Props) {
  const clientLoans = useMemo(() => (client ? getClientLoans(client, loans) : []), [client, loans]);
  const riskProfile = useMemo(() => (client ? buildConsolidatedRiskProfile(client, loans, payments, installmentSchedules, null) : null), [client, loans, payments, installmentSchedules]);
  const metrics = useMemo(() => (client ? getClientRiskMetrics(client, loans, payments, installmentSchedules) : null), [client, loans, payments, installmentSchedules]);
  const history = useMemo(() => (client ? buildClientRiskHistory(client, loans, payments, installmentSchedules) : []), [client, loans, payments, installmentSchedules]);

  if (!client || !riskProfile || !metrics) return null;

  const totalReceived = clientLoans.reduce((sum, loan) => sum + payments.filter((payment) => payment.loanId === loan.id).reduce((acc, payment) => acc + payment.amount, 0), 0);
  const scoreProgress = riskProfile.score;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{client.name}</DialogTitle>
            <Badge variant="outline" className={riskProfile.badgeClassName}>{riskProfile.label}</Badge>
            {client.active !== false ? <Badge variant="outline" className="bg-success/10 text-success border-success/20">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
          </div>
          <DialogDescription>
            Histórico completo de risco, atrasos, pagamentos em dia e evolução mensal do score.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-4">
            <Card no3d>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm text-muted-foreground">Score Atual</p>
                    <div className="flex items-end gap-3 mt-1">
                      <span className="text-4xl font-bold text-foreground">{riskProfile.currentScore}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-md border border-border/40 bg-background px-2 py-1">Score: {riskProfile.score}/100</span>
                      <span className="rounded-md border border-border/40 bg-background px-2 py-1">{riskProfile.classification}</span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background px-2 py-1">
                        {riskProfile.trend === "improving" ? <ArrowUpRight className="h-3.5 w-3.5 text-success" /> : riskProfile.trend === "worsening" ? <ArrowDownRight className="h-3.5 w-3.5 text-destructive" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                        {riskProfile.trendLabel}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-[220px] flex-1 max-w-sm">
                    <Progress value={scoreProgress} className="h-2.5" />
                    <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                      <span>0 - Alto risco</span>
                      <span>55 - Regular</span>
                      <span>85 - Excelente</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard icon={Wallet} label="Total emprestado" value={formatRiskCurrency(metrics.totalLent)} />
                  <MetricCard icon={CheckCircle2} label="Pagamentos em dia" value={String(metrics.onTimePayments)} helper={`${Math.round(metrics.onTimeRatio * 100)}% de pontualidade`} />
                  <MetricCard icon={AlertTriangle} label="Pagamentos em atraso" value={String(metrics.latePayments)} helper={`${Math.round(metrics.lateRatio * 100)}% do histórico`} tone="alert" />
                  <MetricCard icon={CalendarClock} label="Pior atraso" value={metrics.maxOverdueDays > 0 ? `${metrics.maxOverdueDays} dias` : "0 dia"} helper={metrics.severeOverdueLoans > 0 ? `${metrics.severeOverdueLoans} contrato(s) com 30+ dias` : metrics.highOverdueLoans > 0 ? `${metrics.highOverdueLoans} contrato(s) com 16+ dias` : "Sem atrasos longos"} tone={metrics.maxOverdueDays > 0 ? "alert" : "default"} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/30 p-4 bg-muted/20">
                    <p className="text-sm font-medium text-foreground mb-2">Principais Fatores do Score</p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {riskProfile.reasons.map((reason) => (
                        <li key={reason} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-border/30 p-4 bg-muted/20">
                    <p className="text-sm font-medium text-foreground mb-2">Leitura consolidada</p>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between"><span>Classificação</span><span className="font-medium text-foreground">{riskProfile.classification}</span></div>
                      <div className="flex items-center justify-between"><span>Tendência</span><span className="font-medium text-foreground">{riskProfile.trendLabel}</span></div>
                      <div className="flex items-center justify-between"><span>Contratos quitados</span><span className="font-medium text-foreground">{metrics.paidLoans}</span></div>
                      <div className="flex items-center justify-between"><span>Total recebido</span><span className="font-medium text-foreground">{formatRiskCurrency(totalReceived)}</span></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card no3d>
              <CardContent className="p-5 space-y-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Resumo mensal do relacionamento</h3>
                    <p className="text-sm text-muted-foreground">Visão direta da evolução recente do cliente com foco em pontualidade, atrasos e volume movimentado.</p>
                  </div>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Últimos {Math.min(history.length, 6)} meses</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {history.slice(-6).reverse().map((point) => (
                    <div key={point.month} className="rounded-xl border border-border/30 bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground uppercase tracking-normal">{point.label}</span>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Score {point.score}/100</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground">
                        <div>Em dia: <span className="font-medium text-foreground">{point.onTimePayments}</span></div>
                        <div>Atrasos: <span className="font-medium text-foreground">{point.latePayments}</span></div>
                        <div className="col-span-2">Contratos em atraso: <span className="font-medium text-foreground">{point.overdueLoans}</span></div>
                        <div className="col-span-2">Total emprestado: <span className="font-medium text-foreground">{formatRiskCurrency(point.totalLent)}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
                {history.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/40 p-4 text-sm text-muted-foreground">
                    Nenhum histórico mensal disponível para este cliente até o momento.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({ icon: Icon, label, value, helper, tone = "default" }: { icon: typeof ShieldCheck; label: string; value: string; helper?: string; tone?: "default" | "alert" }) {
  return (
    <div className="rounded-xl border border-border/30 p-3 bg-muted/20">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
        <Icon className={tone === "alert" ? "h-4 w-4 text-destructive" : "h-4 w-4 text-primary"} />
        <span>{label}</span>
      </div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
      {helper ? <p className="text-[11px] text-muted-foreground mt-1">{helper}</p> : null}
    </div>
  );
}