import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { buildBillingCandidates, type BillingCandidate } from "@/features/whatsapp/lib/billingCenter";
import { DEFAULT_WHATSAPP_MESSAGES } from "@/lib/whatsappBilling";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Send,
  AlertCircle,
  TrendingUp,
  WalletCards,
  ListChecks,
  XCircle,
  Users,
} from "lucide-react";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const bahiaDay = (dateInput: Date | string) => {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(d);
};

export function WhatsappReportCard() {
  const { user, dataOwnerId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<BillingCandidate[]>([]);
  const [sentQueueRows, setSentQueueRows] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (!user || !dataOwnerId) return;
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
      const todayStart = new Date(`${today}T00:00:00-03:00`).toISOString();
      const tomorrow = new Date(`${today}T00:00:00-03:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [loans, clients, schedules, payments, promises, sentQueueRes, templates] = await Promise.all([
        supabase.from("loans").select("*").eq("user_id", dataOwnerId),
        supabase.from("clients").select("*").eq("user_id", dataOwnerId),
        supabase.from("loan_installments").select("*").eq("user_id", dataOwnerId),
        supabase.from("payments").select("*").eq("user_id", dataOwnerId),
        supabase.from("whatsapp_payment_promises").select("loan_id, installment_number, promised_date").eq("user_id", dataOwnerId),
        supabase
          .from("whatsapp_billing_queue")
          .select("id, client_id, loan_id, loan_ids, status, scheduled_at, sent_at, error_message, attempts")
          .eq("user_id", dataOwnerId)
          .eq("status", "sent")
          .gte("sent_at", todayStart)
          .lt("sent_at", tomorrow.toISOString()),
        supabase
          .from("whatsapp_billing_messages")
          .select("message_upcoming, message_due_today, message_overdue, message_very_overdue, message_center_single, message_center_multiple, very_overdue_days, pix_link")
          .eq("owner_id", dataOwnerId)
          .maybeSingle(),
      ]);

      const errors = [loans.error, clients.error, schedules.error, payments.error, promises.error, sentQueueRes.error].filter(Boolean);
      if (errors.length) {
        toast.error("Não foi possível carregar os dados completos do relatório.");
      }

      const mappedLoans = (loans.data || []).map((l: any) => ({
        ...l,
        borrowerId: l.borrower_id,
        borrowerName: l.borrower_name,
        dueDate: l.due_date,
        amount: Number(l.amount ?? 0),
        interestRate: Number(l.interest_rate ?? 0),
        installments: Math.max(1, Number(l.installments ?? 1)),
        paidInstallments: Number(l.paid_installments ?? 0),
        remainingAmount: l.remaining_amount == null ? undefined : Number(l.remaining_amount),
        customInstallmentValue: l.custom_installment_value == null ? null : Number(l.custom_installment_value),
        lateInterestType: l.late_interest_type,
        lateInterestValue: l.late_interest_value == null ? null : Number(l.late_interest_value),
        penaltyValue: l.penalty_value == null ? null : Number(l.penalty_value),
        renegotiationPenaltyTotal: Number(l.renegotiation_penalty_total ?? 0),
      }));

      const mappedClients = (clients.data || []).map((c: any) => ({ ...c, createdAt: c.created_at }));
      const mappedSchedules = (schedules.data || []).map((s: any) => ({
        ...s,
        loanId: s.loan_id,
        installmentNumber: Number(s.installment_number),
        dueDate: s.due_date,
        amount: Number(s.amount ?? 0),
      }));
      const mappedPayments = (payments.data || []).map((p: any) => ({
        ...p,
        loanId: p.loan_id,
        installmentNumber: Number(p.installment_number),
        amount: Number(p.amount ?? 0),
      }));

      const candidates = buildBillingCandidates({
        loans: mappedLoans as any,
        clients: mappedClients as any,
        schedules: mappedSchedules,
        payments: mappedPayments,
        promises: promises.data || [],
        today,
        messages: (templates.data as any) || undefined,
      });

      setItems(candidates);
      setSentQueueRows((sentQueueRes.data || []) as any[]);
    } catch (e) {
      console.error("[WhatsappReportCard] Erro ao carregar relatório:", e);
      toast.error("Erro ao processar relatório de cobranças.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, dataOwnerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fonte oficial: estritamente os registros da subaba "A cobrar" (billingDate <= hoje)
  const todayInBahia = bahiaDay(new Date());
  const aCobrarItems = useMemo(() => {
    return items.filter((item) => item.billingDate <= todayInBahia);
  }, [items, todayInBahia]);

  // Mapa de empréstimos enviados com sucesso pelo WhatsApp hoje
  const { sentLoanIds, loanSentAtMap } = useMemo(() => {
    const ids = new Set<string>();
    const sentAtMap = new Map<string, string>();
    for (const row of sentQueueRows) {
      const loanList = Array.isArray(row.loan_ids) && row.loan_ids.length ? row.loan_ids : (row.loan_id ? [row.loan_id] : []);
      for (const id of loanList) {
        if (id) {
          ids.add(id);
          if (row.sent_at) sentAtMap.set(id, row.sent_at);
        }
      }
    }
    return { sentLoanIds: ids, loanSentAtMap: sentAtMap };
  }, [sentQueueRows]);

  // Separação em Enviadas e Não Enviadas
  const enviadas = useMemo(() => {
    return aCobrarItems.filter((item) => sentLoanIds.has(item.loanId));
  }, [aCobrarItems, sentLoanIds]);

  const naoEnviadas = useMemo(() => {
    return aCobrarItems.filter((item) => !sentLoanIds.has(item.loanId));
  }, [aCobrarItems, sentLoanIds]);

  // Totais Gerais do Resumo (exclusivos de "A cobrar")
  const totalCobrarCount = aCobrarItems.length;
  const totalCobrarAmount = aCobrarItems.reduce((sum, item) => sum + item.amount, 0);
  const totalCobrarInterest = aCobrarItems.reduce((sum, item) => sum + (item.interestAmount || 0), 0);

  // Totais das Enviadas
  const enviadasCount = enviadas.length;
  const enviadasAmount = enviadas.reduce((sum, item) => sum + item.amount, 0);
  const enviadasInterest = enviadas.reduce((sum, item) => sum + (item.interestAmount || 0), 0);

  // Totais das Não Enviadas
  const naoEnviadasCount = naoEnviadas.length;
  const naoEnviadasAmount = naoEnviadas.reduce((sum, item) => sum + item.amount, 0);
  const naoEnviadasInterest = naoEnviadas.reduce((sum, item) => sum + (item.interestAmount || 0), 0);

  // Filtro de busca por nome
  const filteredEnviadas = useMemo(() => {
    if (!searchTerm.trim()) return enviadas;
    const term = searchTerm.toLowerCase();
    return enviadas.filter((item) => item.clientName.toLowerCase().includes(term));
  }, [enviadas, searchTerm]);

  const filteredNaoEnviadas = useMemo(() => {
    if (!searchTerm.trim()) return naoEnviadas;
    const term = searchTerm.toLowerCase();
    return naoEnviadas.filter((item) => item.clientName.toLowerCase().includes(term));
  }, [naoEnviadas, searchTerm]);

  if (loading) {
    return (
      <div className="py-16 text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-sm font-medium text-muted-foreground">
          Carregando relatório de cobranças via WhatsApp...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Relatório */}
      <Card no3d className="border-border/60 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shadow-xs shrink-0 ring-1 ring-emerald-500/20">
                <Send className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                  Resumo de Cobranças pelo WhatsApp
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Conferência exclusiva das cobranças da subaba <strong>&quot;A cobrar&quot;</strong> e seus disparos automáticos no WhatsApp.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="h-8 rounded-xl text-xs gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                <span>Atualizar</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
          {/* Métricas do Topo (Resumo Geral) */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {/* Total de Cobranças */}
            <div className="p-3.5 rounded-xl border border-border/50 bg-muted/20 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium uppercase tracking-wider">Total a Cobrar</span>
                <ListChecks className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-lg sm:text-xl font-bold text-foreground">{totalCobrarCount}</p>
              <p className="text-[11px] text-muted-foreground">{money.format(totalCobrarAmount)}</p>
            </div>

            {/* Total de Juros */}
            <div className="p-3.5 rounded-xl border border-border/50 bg-muted/20 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium uppercase tracking-wider">Total de Juros</span>
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <p className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {money.format(totalCobrarInterest)}
              </p>
              <p className="text-[11px] text-muted-foreground">Juros previstos hoje</p>
            </div>

            {/* Enviadas pelo WhatsApp */}
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1">
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                <span className="text-[11px] font-medium uppercase tracking-wider">Enviadas</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <p className="text-lg sm:text-xl font-bold text-emerald-700 dark:text-emerald-400">{enviadasCount}</p>
              <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">{money.format(enviadasAmount)}</p>
            </div>

            {/* Não Enviadas */}
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-1">
              <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                <span className="text-[11px] font-medium uppercase tracking-wider">Não Enviadas</span>
                <Clock className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <p className="text-lg sm:text-xl font-bold text-amber-700 dark:text-amber-400">{naoEnviadasCount}</p>
              <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80">{money.format(naoEnviadasAmount)}</p>
            </div>

            {/* Valor Total das Cobranças */}
            <div className="p-3.5 rounded-xl border border-border/50 bg-muted/20 space-y-1 col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium uppercase tracking-wider">Valor Total</span>
                <WalletCards className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-lg sm:text-xl font-bold text-foreground">{money.format(totalCobrarAmount)}</p>
              <p className="text-[11px] text-muted-foreground">
                {totalCobrarCount > 0
                  ? `${Math.round((enviadasCount / totalCobrarCount) * 100)}% processadas`
                  : "0% processadas"}
              </p>
            </div>
          </div>

          {/* Campo de Busca Rápida */}
          {totalCobrarCount > 0 && (
            <div className="relative pt-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar cliente nas listas abaixo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl bg-background"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* SEÇÃO 1: Cobranças enviadas pelo WhatsApp */}
      <Card no3d className="border-emerald-500/25 shadow-xs rounded-2xl overflow-hidden bg-card">
        <CardHeader className="p-4 sm:p-5 pb-3 bg-emerald-500/5 border-b border-emerald-500/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-xs">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                  Cobranças enviadas pelo WhatsApp
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Registros da aba &quot;A cobrar&quot; com envio automático confirmado com sucesso hoje.
                </CardDescription>
              </div>
            </div>

            <Badge
              variant="outline"
              className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs font-bold px-2.5 py-1 rounded-lg shrink-0"
            >
              {enviadasCount} {enviadasCount === 1 ? "enviada" : "enviadas"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredEnviadas.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
              <CheckCircle2 className="h-6 w-6 mx-auto text-muted-foreground/50 mb-1.5" />
              <p className="font-medium text-foreground">
                {searchTerm ? "Nenhuma cobrança enviada encontrada para esta busca." : "Nenhuma cobrança foi enviada pelo WhatsApp hoje."}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {searchTerm ? "Tente outro nome de cliente." : "Assim que o envio automático for processado, as cobranças confirmadas aparecerão aqui."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {/* Header da Tabela em Desktop */}
              <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 bg-muted/20 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-6">Nome do Cliente</div>
                <div className="col-span-3 text-right">Valor dos Juros</div>
                <div className="col-span-3 text-right">Valor Total da Cobrança</div>
              </div>

              {/* Lista de Registros */}
              {filteredEnviadas.map((item) => {
                const sentAt = loanSentAtMap.get(item.loanId);
                const sentTimeFormatted = sentAt
                  ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bahia" }).format(new Date(sentAt))
                  : null;

                return (
                  <div
                    key={`sent-${item.key}`}
                    className="flex flex-col sm:grid sm:grid-cols-12 gap-1.5 sm:gap-3 px-4 py-3 hover:bg-muted/15 transition-colors items-start sm:items-center"
                  >
                    <div className="col-span-6 flex items-center gap-2 min-w-0 w-full">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{item.clientName}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                          <span>{item.contractLabel || "Contrato"}</span>
                          {sentTimeFormatted && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                Enviado às {sentTimeFormatted}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-3 flex sm:block justify-between w-full sm:text-right pt-1 sm:pt-0">
                      <span className="sm:hidden text-xs text-muted-foreground">Valor dos Juros:</span>
                      <span className="text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {money.format(item.interestAmount || 0)}
                      </span>
                    </div>

                    <div className="col-span-3 flex sm:block justify-between w-full sm:text-right">
                      <span className="sm:hidden text-xs text-muted-foreground font-medium">Valor Total:</span>
                      <span className="text-sm font-bold text-foreground">
                        {money.format(item.amount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Rodapé e Totalizadores da Seção 1 */}
          <div className="p-3.5 sm:p-4 bg-emerald-500/10 border-t border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Total de cobranças enviadas: <strong>{enviadasCount}</strong>
              </span>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 font-semibold pt-1 sm:pt-0 border-t sm:border-t-0 border-emerald-500/20">
              <span className="text-muted-foreground">
                Total de juros:{" "}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {money.format(enviadasInterest)}
                </strong>
              </span>
              <span className="text-muted-foreground">
                Total enviado:{" "}
                <strong className="text-foreground">
                  {money.format(enviadasAmount)}
                </strong>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SEÇÃO 2: Cobranças não enviadas pelo WhatsApp */}
      <Card no3d className="border-amber-500/25 shadow-xs rounded-2xl overflow-hidden bg-card">
        <CardHeader className="p-4 sm:p-5 pb-3 bg-amber-500/5 border-b border-amber-500/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                <Clock className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                  Cobranças não enviadas pelo WhatsApp
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Registros da aba &quot;A cobrar&quot; que ainda não tiveram o envio automático realizado hoje.
                </CardDescription>
              </div>
            </div>

            <Badge
              variant="outline"
              className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-xs font-bold px-2.5 py-1 rounded-lg shrink-0"
            >
              {naoEnviadasCount} {naoEnviadasCount === 1 ? "pendente" : "pendentes"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredNaoEnviadas.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
              <CheckCircle2 className="h-6 w-6 mx-auto text-emerald-500 mb-1.5" />
              <p className="font-medium text-foreground">
                {searchTerm ? "Nenhuma cobrança não enviada encontrada para esta busca." : "Todas as cobranças da aba 'A cobrar' foram enviadas com sucesso pelo WhatsApp!"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {searchTerm ? "Tente outro nome de cliente." : "Não há pendências de envio automático para as cobranças prioritárias de hoje."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {/* Header da Tabela em Desktop */}
              <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 bg-muted/20 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-6">Nome do Cliente</div>
                <div className="col-span-3 text-right">Valor dos Juros</div>
                <div className="col-span-3 text-right">Valor Total da Cobrança</div>
              </div>

              {/* Lista de Registros */}
              {filteredNaoEnviadas.map((item) => (
                <div
                  key={`notsent-${item.key}`}
                  className="flex flex-col sm:grid sm:grid-cols-12 gap-1.5 sm:gap-3 px-4 py-3 hover:bg-muted/15 transition-colors items-start sm:items-center"
                >
                  <div className="col-span-6 flex items-center gap-2 min-w-0 w-full">
                    <div className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground truncate">{item.clientName}</p>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                        <span>{item.contractLabel || "Contrato"}</span>
                        <span>•</span>
                        <span className={item.validPhone ? "text-amber-600 dark:text-amber-400" : "text-destructive"}>
                          {item.validPhone ? "Não disparado / Aguardando envio" : "Telefone inválido ou não cadastrado"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-3 flex sm:block justify-between w-full sm:text-right pt-1 sm:pt-0">
                    <span className="sm:hidden text-xs text-muted-foreground">Valor dos Juros:</span>
                    <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                      {money.format(item.interestAmount || 0)}
                    </span>
                  </div>

                  <div className="col-span-3 flex sm:block justify-between w-full sm:text-right">
                    <span className="sm:hidden text-xs text-muted-foreground font-medium">Valor Total:</span>
                    <span className="text-sm font-bold text-foreground">
                      {money.format(item.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Rodapé e Totalizadores da Seção 2 */}
          <div className="p-3.5 sm:p-4 bg-amber-500/10 border-t border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
              <Clock className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                Total de cobranças não enviadas: <strong>{naoEnviadasCount}</strong>
              </span>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 font-semibold pt-1 sm:pt-0 border-t sm:border-t-0 border-amber-500/20">
              <span className="text-muted-foreground">
                Total de juros:{" "}
                <strong className="text-amber-600 dark:text-amber-400">
                  {money.format(naoEnviadasInterest)}
                </strong>
              </span>
              <span className="text-muted-foreground">
                Total não enviado:{" "}
                <strong className="text-foreground">
                  {money.format(naoEnviadasAmount)}
                </strong>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
