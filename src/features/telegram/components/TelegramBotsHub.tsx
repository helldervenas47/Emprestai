import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, BarChart3, CalendarCheck, FileSpreadsheet, Sun, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { invokeUserFunction } from "@/features/telegram/lib/telegramLinkCode";
import { TelegramReportsConnectCard } from "@/features/telegram/components/TelegramReportsConnectCard";
import { TelegramDailyPlanningScheduleCard } from "@/features/telegram/components/TelegramDailyPlanningScheduleCard";
import { TelegramIncomesExpensesScheduleCard } from "@/features/telegram/components/TelegramIncomesExpensesScheduleCard";
import { TelegramWeeklyVencimentosCard } from "@/features/telegram/components/TelegramWeeklyVencimentosCard";
import { TelegramAccumulatedDelinquencyScheduleCard } from "@/features/telegram/components/TelegramAccumulatedDelinquencyScheduleCard";
import { TelegramManagerWeeklyCard } from "@/features/telegram/components/TelegramManagerWeeklyCard";
import { TelegramPersonalInsightsCard } from "@/features/telegram/components/TelegramPersonalInsightsCard";
import { TelegramFinancialSummariesCard } from "@/features/telegram/components/TelegramFinancialSummariesCard";
import { ScheduledReportCard } from "@/components/ScheduledReportCard";
import { ReadOnlyOverlay } from "@/features/admin/components/upgrade/ReadOnlyOverlay";


export function TelegramBotsHub() {
  const [syncing, setSyncing] = useState(false);

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

  return (
    <ReadOnlyOverlay message="Seu plano de teste expirou. Os bots cadastrados continuam visíveis, mas não é possível conectar ou alterar configurações sem um plano ativo.">
    <div id="telegram-bots-hub" className="space-y-4 scroll-mt-24">
      <Card no3d>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Bot de Relatórios</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Configure o bot e os horários de envio automático dos relatórios do negócio.
            </p>
          </div>
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
        </CardContent>
      </Card>

      {/* Conexão do bot de relatórios */}
      <TelegramReportsConnectCard />

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
