import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileDown,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Trophy,
  Lightbulb,
  Sparkles,
  Target,
  Banknote,
  HandCoins,
  Receipt,
  PiggyBank,
  Wallet,
  ArrowRight,
  Layers,
  BarChart3,
  Calendar,
  Info,
} from "lucide-react";
import { formatBRL } from "@/features/creditCards/lib/creditLimit";
import { emitAppUIEvent } from "@/lib/appUIEvents";
import { useMonthlyClosing } from "../useMonthlyClosing";
import { MonthlyClosingOverdueClientsDialog } from "./MonthlyClosingOverdueClientsDialog";
import type { Loan, Payment, Expense, Client, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";
import type { MonthlyClosingGoalItem } from "../types";

interface Props {
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules?: InstallmentSchedule[];
  renegotiations?: LoanRenegotiation[];
  onNavigateToTab?: (tab: string) => void;
  onNavigateToConfig?: () => void;
}

export function MonthlyClosingView({
  loans,
  payments,
  expenses,
  clients,
  installmentSchedules,
  renegotiations,
  onNavigateToTab,
  onNavigateToConfig,
}: Props) {
  const {
    selectedMonth,
    closingData,
    goToPrevMonth,
    goToNextMonth,
    resetToCurrentMonth,
    recalculate,
    exportPdf,
    isExportingPdf,
    lastUpdatedAt,
  } = useMonthlyClosing({
    loans,
    payments,
    expenses,
    clients,
    installmentSchedules,
    renegotiations,
  });

  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isOverdueDialogOpen, setIsOverdueDialogOpen] = useState(false);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    await recalculate();
    setTimeout(() => setIsRecalculating(false), 500);
  };

  const handleDirectAction = (targetTab: string, label?: string) => {
    if (label === "Ver clientes inadimplentes" || targetTab === "clientes_inadimplentes") {
      setIsOverdueDialogOpen(true);
      return;
    }
    if (targetTab === "clientes" && label?.toLowerCase().includes("inadimplente")) {
      setIsOverdueDialogOpen(true);
      return;
    }
    if (targetTab === "metas" && onNavigateToConfig) {
      onNavigateToConfig();
      return;
    }
    if (onNavigateToTab) {
      onNavigateToTab(targetTab);
    } else {
      emitAppUIEvent({ type: "NAVIGATE", tab: targetTab });
    }
  };

  const fin = closingData.financial;
  const comp = closingData.comparison;
  const goalsSummary = closingData.goalsSummary;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* 1. BARRA SUPERIOR EXECUTIVA & NAVEGAÇÃO */}
      <div className="bg-card/60 backdrop-blur-sm p-4 sm:p-5 rounded-2xl border border-border/60 shadow-sm space-y-4 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between sm:justify-start gap-2.5 flex-wrap">
            <span className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-xl md:text-2xl">📊</span> Fechamento Mensal
            </span>
            <Badge
              variant={closingData.isClosedMonth ? "default" : "secondary"}
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${
                closingData.isClosedMonth
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              }`}
            >
              {closingData.isClosedMonth ? "Mês Encerrado" : "Mês em Andamento"}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Fotografia analítica consolidada · Última atualização: {lastUpdatedAt}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between md:justify-end gap-3 sm:gap-4">
          {/* Seletor de Mês (Mesmo design limpo em Mobile, Tablet e Desktop) */}
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-foreground hover:bg-muted shrink-0"
              onClick={goToPrevMonth}
              title="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={resetToCurrentMonth}
              title="Voltar para o mês vigente"
              className="text-sm sm:text-base font-medium sm:font-semibold text-foreground min-w-[130px] sm:min-w-[140px] text-center capitalize hover:text-primary transition-colors cursor-pointer select-none"
            >
              {closingData.monthLabel}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-foreground hover:bg-muted shrink-0"
              onClick={goToNextMonth}
              title="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Botões de Ação */}
          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecalculate}
              disabled={isRecalculating}
              className="rounded-xl text-xs font-semibold gap-1.5 h-9 w-full sm:w-auto justify-center border-border/70"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRecalculating ? "animate-spin text-primary" : ""}`} />
              <span>Atualizar</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={exportPdf}
              disabled={isExportingPdf}
              className="rounded-xl text-xs font-semibold gap-1.5 h-9 w-full sm:w-auto justify-center shadow-sm bg-primary hover:bg-primary/90"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>{isExportingPdf ? "Gerando..." : "Exportar PDF"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 2. RESUMO EXECUTIVO & COMPARATIVO (6 CARDS) */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Resultado do Mês & Comparativo
          </h3>
          <span className="text-xs text-muted-foreground">
            vs. {closingData.previousMonthLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {/* Card 1: Faturamento */}
          <MetricCard
            title="Faturamento (Novos Empréstimos)"
            value={formatBRL(fin.revenue)}
            icon={Banknote}
            pctDiff={comp.revenue.pctDiff}
            previousValue={formatBRL(comp.revenue.previous)}
            isPositiveEvolution={comp.revenue.isPositiveEvolution}
            previousLabel={closingData.previousMonthLabel}
            tooltip="Soma do valor principal de todos os novos empréstimos criados e concedidos no mês."
          />

          {/* Card 2: Recebimentos */}
          <MetricCard
            title="Recebimentos Totais"
            value={formatBRL(fin.received)}
            icon={HandCoins}
            pctDiff={comp.received.pctDiff}
            previousValue={formatBRL(comp.received.previous)}
            isPositiveEvolution={comp.received.isPositiveEvolution}
            previousLabel={closingData.previousMonthLabel}
            tooltip="Soma de todos os pagamentos e entradas recebidas no mês (principal + juros + multas)."
          />

          {/* Card 3: Despesas */}
          <MetricCard
            title="Despesas Operacionais"
            value={formatBRL(fin.expenses)}
            icon={Receipt}
            pctDiff={comp.expenses.pctDiff}
            previousValue={formatBRL(comp.expenses.previous)}
            isPositiveEvolution={comp.expenses.isPositiveEvolution}
            previousLabel={closingData.previousMonthLabel}
            inverse
            tooltip="Soma de todas as despesas pagas da empresa com vencimento ou pagamento no mês."
          />

          {/* Card 4: Resultado do Período */}
          <MetricCard
            title="Resultado do Período"
            value={formatBRL(fin.result)}
            icon={PiggyBank}
            pctDiff={comp.result.pctDiff}
            previousValue={formatBRL(comp.result.previous)}
            isPositiveEvolution={comp.result.isPositiveEvolution}
            previousLabel={closingData.previousMonthLabel}
            tooltip="Fluxo líquido do mês: Recebimentos Totais − Despesas Operacionais − Faturamento (Novos Empréstimos)."
          />

          {/* Card 5: Capital Ativo */}
          <MetricCard
            title="Capital Ativo em Carteira"
            value={formatBRL(fin.activeCapital)}
            icon={Wallet}
            pctDiff={comp.activeCapital.pctDiff}
            previousValue={formatBRL(comp.activeCapital.previous)}
            isPositiveEvolution={comp.activeCapital.isPositiveEvolution}
            previousLabel={closingData.previousMonthLabel}
            tooltip="Soma do saldo restante a receber de todos os contratos ativos na data de fechamento do mês."
          />

          {/* Card 6: Inadimplência */}
          <MetricCard
            title="Taxa de Inadimplência"
            value={`${(fin.defaultRate ?? 0).toFixed(1).replace(".", ",")}%`}
            icon={AlertTriangle}
            ppDiff={comp.defaultRate?.ppDiff}
            previousValue={`${(comp.defaultRate?.previous ?? 0).toFixed(1).replace(".", ",")}%`}
            isPositiveEvolution={comp.defaultRate?.isPositiveEvolution ?? true}
            previousLabel={closingData.previousMonthLabel}
            inverse
            isRate
            extraInfo={(fin.overdueAmount ?? 0) > 0 ? `${formatBRL(fin.overdueAmount)} vencidos (ver lista)` : undefined}
            onClick={(fin.overdueAmount ?? 0) > 0 || (fin.overdueLoansCount ?? 0) > 0 ? () => setIsOverdueDialogOpen(true) : undefined}
            tooltip="Percentual do valor vencido em atraso em relação ao total a receber da carteira no mês."
          />
        </div>
      </div>

      {/* 3. SEÇÃO DE METAS INTEGRADAS */}
      <Card className="rounded-2xl border-border/70 shadow-sm overflow-hidden">
        <CardHeader className="p-4 sm:p-5 bg-muted/30 border-b border-border/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5">
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Suas Metas em {closingData.monthLabel}
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Planejado vs. Realizado com base nas regras oficiais do sistema
              </CardDescription>
            </div>

            {goalsSummary.hasGoals && (
              <div className="flex items-center gap-2 bg-background/80 px-3 py-1.5 rounded-xl border border-border/50 text-xs font-semibold">
                <span className="text-muted-foreground">{goalsSummary.totalGoals} metas:</span>
                <span className="text-emerald-600 dark:text-emerald-400">🟢 {goalsSummary.reachedCount}</span>
                <span className="text-amber-600 dark:text-amber-400">🟡 {goalsSummary.closeCount}</span>
                <span className="text-rose-600 dark:text-rose-400">🔴 {goalsSummary.missedCount}</span>
              </div>
            )}
          </div>

          {/* Barra de Progresso Geral de Metas */}
          {goalsSummary.hasGoals && (
            <div className="mt-4 pt-3 border-t border-border/40 space-y-2">
              <div className="flex justify-between items-center text-xs font-medium">
                <span className="text-foreground">
                  Você atingiu <strong>{(goalsSummary.overallAchievementPct ?? 0).toFixed(0)}%</strong> das suas metas neste mês.
                </span>
                <span className="text-muted-foreground">
                  {goalsSummary.reachedCount ?? 0} de {goalsSummary.totalGoals ?? 0} metas atingidas
                </span>
              </div>
              <Progress
                value={goalsSummary.overallAchievementPct ?? 0}
                className="h-2 rounded-full bg-muted"
              />
            </div>
          )}
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          {!goalsSummary.hasGoals ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <Target className="h-6 w-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <p className="font-semibold text-sm sm:text-base">
                  Você ainda não possui metas definidas para este período.
                </p>
                <p className="text-xs text-muted-foreground">
                  Defina suas metas de faturamento, recebimentos e limites de inadimplência para acompanhar a evolução automática do seu negócio.
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleDirectAction("metas")}
                className="rounded-xl font-semibold gap-2 mt-2"
              >
                <Target className="h-4 w-4" />
                Definir Metas
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {(closingData.goals || []).map((g) => (
                <GoalClosingCard key={g.goalType} goal={g} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. DESTAQUES POSITIVOS & PONTOS DE ATENÇÃO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Destaques Positivos */}
        <Card className="rounded-2xl border-emerald-500/20 bg-emerald-500/[0.02] shadow-sm">
          <CardHeader className="p-4 sm:p-5 pb-2">
            <CardTitle className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              🏆 Destaques Positivos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-2 space-y-2.5">
            {(!closingData.executiveAnalysis?.positiveHighlights || closingData.executiveAnalysis.positiveHighlights.length === 0) ? (
              <p className="text-xs sm:text-sm text-muted-foreground py-2">
                Nenhum destaque positivo relevante registrado no período.
              </p>
            ) : (
              closingData.executiveAnalysis.positiveHighlights.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-card border border-emerald-500/15 shadow-xs"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs sm:text-sm truncate">{h.title}</span>
                      {h.badgeText && (
                        <Badge variant="outline" className="text-[10px] font-bold px-2 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shrink-0">
                          {h.badgeText}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{h.description}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Pontos de Atenção */}
        <Card className="rounded-2xl border-rose-500/20 bg-rose-500/[0.02] shadow-sm">
          <CardHeader className="p-4 sm:p-5 pb-2">
            <CardTitle className="text-sm sm:text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              ⚠️ Pontos de Atenção
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-2 space-y-2.5">
            {(!closingData.executiveAnalysis?.attentionPoints || closingData.executiveAnalysis.attentionPoints.length === 0) ? (
              <p className="text-xs sm:text-sm text-muted-foreground py-2">
                Nenhum ponto crítico ou desvio identificado no período.
              </p>
            ) : (
              closingData.executiveAnalysis.attentionPoints.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-card border border-rose-500/15 shadow-xs"
                >
                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs sm:text-sm truncate">{p.title}</span>
                      {p.badgeText && (
                        <Badge variant="outline" className="text-[10px] font-bold px-2 py-0 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 shrink-0">
                          {p.badgeText}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. ANÁLISE EXECUTIVA — O QUE ESTÁ ACONTECENDO COM SEU NEGÓCIO? */}
      <Card className="rounded-2xl border-primary/20 bg-gradient-to-br from-primary/[0.04] via-card to-card shadow-sm">
        <CardHeader className="p-4 sm:p-5 pb-2">
          <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
            <Sparkles className="h-5 w-5 text-primary" />
            🧠 O que está acontecendo com seu negócio?
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Diagnóstico consolidado gerado a partir dos indicadores matemáticos do sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-2 space-y-3">
          <div className="p-4 rounded-xl bg-background/80 border border-border/60 border-l-4 border-l-primary space-y-2">
            <p className="font-bold text-xs sm:text-sm text-foreground">
              {closingData.executiveAnalysis?.headline || ""}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {closingData.executiveAnalysis?.narrative || ""}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 6. RECOMENDAÇÃO ACIONÁVEL PARA O PRÓXIMO MÊS */}
      <Card className="rounded-2xl border-border/70 shadow-sm bg-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                💡 {closingData.isClosedMonth ? "Recomendação para o próximo mês" : "Recomendação para o mês vigente"}
              </span>
              <h4 className="text-sm sm:text-base font-bold text-foreground">
                {closingData.executiveAnalysis?.recommendation?.title || "Acompanhamento de Metas"}
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-3xl">
                {closingData.executiveAnalysis?.recommendation?.text || ""}
              </p>
            </div>
          </div>

          {closingData.executiveAnalysis?.recommendation?.action && (
            <Button
              variant="default"
              size="sm"
              onClick={() =>
                handleDirectAction(
                  closingData.executiveAnalysis.recommendation.action!.targetTab,
                  closingData.executiveAnalysis.recommendation.action!.label
                )
              }
              className="rounded-xl font-semibold gap-2 w-full sm:w-auto shrink-0 shadow-xs cursor-pointer"
            >
              <span>{closingData.executiveAnalysis.recommendation.action.label}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>

      {/* 7. DIÁLOGO DETALHADO DE CLIENTES INADIMPLENTES DO MÊS */}
      <MonthlyClosingOverdueClientsDialog
        open={isOverdueDialogOpen}
        onOpenChange={setIsOverdueDialogOpen}
        monthLabel={closingData.monthLabel}
        overdueItems={fin.overdueLoansList || []}
        totalOverdueAmount={fin.overdueAmount || 0}
        onNavigateToTab={onNavigateToTab}
      />
    </div>
  );
}

// Subcomponente: Card de Métrica Individual
interface MetricCardProps {
  title: string;
  value: string;
  icon: any;
  pctDiff?: number;
  ppDiff?: number;
  previousValue: string;
  isPositiveEvolution: boolean;
  previousLabel: string;
  inverse?: boolean;
  isRate?: boolean;
  extraInfo?: string;
  tooltip?: string;
  onClick?: () => void;
}

function MetricCard({
  title,
  value,
  icon: Icon,
  pctDiff,
  ppDiff,
  previousValue,
  isPositiveEvolution,
  previousLabel,
  isRate = false,
  extraInfo,
  tooltip,
  onClick,
}: MetricCardProps) {
  const hasDiff = isRate
    ? ppDiff !== undefined && isFinite(ppDiff) && Math.abs(ppDiff) >= 0.01
    : pctDiff !== undefined && isFinite(pctDiff) && Math.abs(pctDiff) >= 0.1;

  const displayPpDiff = typeof ppDiff === "number" && isFinite(ppDiff) ? ppDiff : 0;
  const displayPctDiff = typeof pctDiff === "number" && isFinite(pctDiff) ? pctDiff : 0;

  return (
    <Card
      onClick={onClick}
      className={`rounded-2xl border-border/70 bg-card p-4 sm:p-5 shadow-xs transition-all flex flex-col justify-between ${
        onClick
          ? "cursor-pointer hover:border-primary/50 hover:shadow-md active:scale-[0.99]"
          : "hover:border-primary/30"
      }`}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-semibold text-muted-foreground truncate">{title}</span>
            {tooltip && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground/60 hover:text-foreground transition-colors p-0.5 rounded-full inline-flex items-center justify-center shrink-0"
                  >
                    <Info className="h-3.5 w-3.5" />
                    <span className="sr-only">Como é calculado</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-xs text-center z-50">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {value}
          </span>

          {hasDiff && (
            <Badge
              variant="outline"
              className={`text-[11px] font-bold px-2 py-0.5 rounded-md gap-1 ${
                isPositiveEvolution
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
              }`}
            >
              {isPositiveEvolution ? (
                <TrendingUp className="h-3 w-3 inline" />
              ) : (
                <TrendingDown className="h-3 w-3 inline" />
              )}
              <span>
                {isRate
                  ? `${displayPpDiff > 0 ? "+" : ""}${displayPpDiff.toFixed(1).replace(".", ",")} p.p.`
                  : `${displayPctDiff > 0 ? "+" : ""}${displayPctDiff.toFixed(1).replace(".", ",")}%`}
              </span>
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>vs. {previousValue} em {previousLabel.split(" ")[0].toLowerCase()}</span>
        {extraInfo && <span className="font-semibold text-rose-600 dark:text-rose-400">{extraInfo}</span>}
      </div>
    </Card>
  );
}

// Subcomponente: Card de Meta Individual
function GoalClosingCard({ goal }: { goal: MonthlyClosingGoalItem }) {
  const statusConfig = {
    reached: {
      label: "Meta atingida",
      badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      progressClass: "[&>div]:bg-emerald-500",
      dot: "🟢",
    },
    close: {
      label: "Próximo da meta",
      badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      progressClass: "[&>div]:bg-amber-500",
      dot: "🟡",
    },
    missed: {
      label: "Não atingida",
      badgeClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
      progressClass: "[&>div]:bg-rose-500",
      dot: "🔴",
    },
  }[goal.status || "reached"];

  const achievement = typeof goal.achievementPct === "number" && isFinite(goal.achievementPct) ? goal.achievementPct : 0;
  const diff = typeof goal.diffValue === "number" && isFinite(goal.diffValue) ? goal.diffValue : 0;

  return (
    <div className="p-3.5 sm:p-4 rounded-xl bg-card border border-border/70 shadow-xs space-y-3 flex flex-col justify-between">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <span className="text-xs sm:text-sm font-bold text-foreground block truncate">
              {goal.label}
            </span>
            <span className="text-[11px] text-muted-foreground block">
              Meta: <strong>{goal.formattedTarget}</strong>
            </span>
          </div>

          <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusConfig.badgeClass}`}>
            {statusConfig.dot} {statusConfig.label}
          </Badge>
        </div>

        <div className="flex items-baseline justify-between pt-1">
          <span className="text-base sm:text-lg font-bold text-foreground">
            {goal.formattedActual}
          </span>
          <span className="text-xs font-bold text-muted-foreground">
            {achievement.toFixed(1).replace(".", ",")}% atingido
          </span>
        </div>

        <Progress
          value={Math.min(100, Math.max(5, achievement))}
          className={`h-1.5 rounded-full bg-muted ${statusConfig.progressClass}`}
        />
      </div>

      <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between pt-2 border-t border-border/40">
        <span>Diferença:</span>
        <span className={diff >= 0 && !goal.isInverse ? "text-emerald-600 font-bold" : "text-muted-foreground font-semibold"}>
          {goal.formattedDiff}
        </span>
      </div>
    </div>
  );
}

