import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BarChart3, CalendarCheck, FileSpreadsheet, Sun, RefreshCw, Send, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { invokeUserFunction } from "@/features/telegram/lib/telegramLinkCode";
import { TelegramReportsConnectCard } from "@/features/telegram/components/TelegramReportsConnectCard";
import { TelegramConnectCard } from "@/features/telegram/components/TelegramConnectCard";
import { TelegramDailyPlanningScheduleCard } from "@/features/telegram/components/TelegramDailyPlanningScheduleCard";
import { TelegramIncomesExpensesScheduleCard } from "@/features/telegram/components/TelegramIncomesExpensesScheduleCard";
import { TelegramWeeklyVencimentosCard } from "@/features/telegram/components/TelegramWeeklyVencimentosCard";
import { TelegramAccumulatedDelinquencyScheduleCard } from "@/features/telegram/components/TelegramAccumulatedDelinquencyScheduleCard";
import { TelegramManagerWeeklyCard } from "@/features/telegram/components/TelegramManagerWeeklyCard";
import { TelegramPersonalInsightsCard } from "@/features/telegram/components/TelegramPersonalInsightsCard";
import { TelegramFinancialSummariesCard } from "@/features/telegram/components/TelegramFinancialSummariesCard";
import { TelegramPaywallCard } from "@/features/telegram/components/TelegramPaywallCard";
import { useTelegramPremium } from "@/features/telegram/hooks/useTelegramPremium";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { ScheduledReportCard } from "@/components/ScheduledReportCard";
import { ReadOnlyOverlay } from "@/features/admin/components/upgrade/ReadOnlyOverlay";

export function TelegramBotsHub() {
  const { hasPremium, addon, loading: loadingPremium, refetch } = useTelegramPremium();
  const { subscription } = useSubscription();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [syncing, setSyncing] = useState(false);

  const expirationDate = useMemo(() => {
    const raw = addon?.current_period_end || subscription?.current_period_end;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }, [addon?.current_period_end, subscription?.current_period_end]);

  const daysRemaining = useMemo(() => {
    if (!expirationDate) return null;
    return Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }, [expirationDate]);

  const handleSyncCommands = async () => {
    setSyncing(true);
    try {
      const data: any = await invokeUserFunction("telegram-set-commands");
      if (data?.ok === false) {
        toast.error("Falha ao sincronizar comandos", { description: data.error || "Erro desconhecido." });
      } else {
        toast.success("Menu e comandos do Telegram atualizados com sucesso!");
      }
    } catch (e: any) {
      toast.error("Erro ao sincronizar comandos", { description: e?.message ?? "Tente novamente." });
    } finally {
      setSyncing(false);
    }
  };

  if (loadingPremium) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Carregando EmprestAI Telegram...</span>
      </div>
    );
  }

  if (!hasPremium) {
    return <TelegramPaywallCard onSuccess={refetch} />;
  }

  return (
    <ReadOnlyOverlay message="Seu plano de teste expirou. Os recursos cadastrados continuam visíveis, mas não é possível conectar ou alterar configurações sem um plano ativo.">
    <div id="telegram-bots-hub" className="space-y-4 scroll-mt-24">
      <Card no3d className="border-amber-500/20 bg-gradient-to-r from-card via-card to-amber-500/5">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Send className="h-4 w-4 text-primary shrink-0" />
              <h3 className="text-sm font-semibold">EmprestAI Telegram</h3>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] py-0.5 font-medium">
                🟢 Premium Ativo
              </Badge>
              {isAdmin ? (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] py-0.5 font-medium">
                  Acesso Ilimitado (Admin)
                </Badge>
              ) : expirationDate ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] py-0.5 flex items-center gap-1 font-semibold",
                    daysRemaining != null && daysRemaining <= 3
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      : "bg-primary/10 text-primary border-primary/30"
                  )}
                >
                  <Clock className="h-3 w-3 shrink-0" />
                  {daysRemaining != null
                    ? daysRemaining > 1
                      ? `${daysRemaining} dias restantes`
                      : daysRemaining === 1
                      ? "1 dia restante"
                      : "Expira hoje"
                    : "Ativo"}
                  {expirationDate && ` (até ${expirationDate.toLocaleDateString("pt-BR")})`}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Configure o bot de relatórios, o bot de despesas e os horários de envio automático.
            </p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncCommands}
              disabled={syncing}
              className="shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando…" : "Sincronizar Comandos no Telegram"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Conexão do bot de relatórios */}
      <TelegramReportsConnectCard />

      {/* Conexão do bot de despesas */}
      <TelegramConnectCard />

      {/* Relatórios principais */}
      <div className="flex items-center gap-2 pt-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relatórios principais</h4>
        <div className="h-px flex-1 bg-border/60" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Resumo Operacional diário */}
        <ScheduledReportCard
          title="Resumo Operacional"
          description="Indicadores financeiros e operacionais do dia. Até 3 horários."
          Icon={FileSpreadsheet}
          prefsTable="telegram_operational_summary_prefs"
          functionName="telegram-operational-summary"
          defaultTime="19:00"
        />

        {/* Planejamento do dia seguinte */}
        <TelegramDailyPlanningScheduleCard />

        {/* Receitas e Despesas (aba) */}
        <TelegramIncomesExpensesScheduleCard />

        {/* Resumo do dia (empréstimos) — envio automático */}
        <ScheduledReportCard
          title="Resumo do dia"
          description="Novos empréstimos, recebimentos e vencimentos do dia. Até 3 horários."
          Icon={Sun}
          prefsTable="telegram_daily_loans_summary_prefs"
          functionName="telegram-daily-loans-summary"
          defaultTime="19:00"
        />

        {/* Empréstimos em atraso (até 3 horários) */}
        <ScheduledReportCard
          title="Empréstimos em atraso"
          description="Lista de contratos em atraso. Até 3 horários por dia."
          Icon={AlertTriangle}
          prefsTable="telegram_overdue_loans_prefs"
          functionName="telegram-overdue-loans-summary"
          defaultTime="09:00"
        />

        {/* Vencem hoje (até 3 horários) */}
        <ScheduledReportCard
          title="Vencem hoje"
          description="Lista dos contratos com vencimento no dia. Até 3 horários por dia."
          Icon={CalendarCheck}
          prefsTable="telegram_due_today_loans_prefs"
          functionName="telegram-due-today-loans-summary"
          defaultTime="08:00"
        />

        {/* Vencimentos da semana */}
        <TelegramWeeklyVencimentosCard />
      </div>

      {/* Relatórios secundários */}
      <div className="flex items-center gap-2 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relatórios secundários</h4>
        <div className="h-px flex-1 bg-border/60" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Resumos diário, semanal e mensal */}
        <TelegramFinancialSummariesCard />

        {/* Inadimplência acumulada */}
        <TelegramAccumulatedDelinquencyScheduleCard />

        {/* Insights pessoais por IA */}
        <TelegramPersonalInsightsCard />
      </div>

      {/* Resumo semanal do gerente (layout próprio, largura total) */}
      <Card no3d>
        <CardContent className="p-4">
          <TelegramManagerWeeklyCard />
        </CardContent>
      </Card>

    </div>
    </ReadOnlyOverlay>
  );
}
