import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Briefcase, UserCheck, UserX, Percent, Coins, Wallet } from "lucide-react";
import type { ManagerSplitData } from "@/features/dashboard/components/dashboard/useDashboardMetrics";

interface Props {
  managerSplit: ManagerSplitData;
  formatCurrency: (value: number) => string;
}

export function DashboardManagerSplitSection({ managerSplit, formatCurrency }: Props) {
  const { withManager, withoutManager, total } = managerSplit;

  // Percentuais de representatividade sobre o total a receber da carteira
  const withManagerPct = total.totalReceivable > 0
    ? Math.round((withManager.totalReceivable / total.totalReceivable) * 100)
    : 0;
  const withoutManagerPct = total.totalReceivable > 0
    ? Math.round((withoutManager.totalReceivable / total.totalReceivable) * 100)
    : 0;

  return (
    <div className="space-y-3">
      {/* Cabeçalho da Seção */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary">
            <Briefcase className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-foreground tracking-tight truncate">
              Empréstimos por Gerenciamento
            </h3>
            <p className="text-[11px] text-muted-foreground truncate">
              Distribuição e valores a receber por modelo de intermediação
            </p>
          </div>
        </div>

        {total.count > 0 && (
          <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/60 text-muted-foreground border border-border/40">
            {total.count} {total.count === 1 ? "empréstimo ativo" : "empréstimos ativos"}
          </span>
        )}
      </div>

      {/* Grid de Cards (Lado a lado tanto no Mobile quanto no Desktop) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        {/* CARD: COM GERENTE */}
        <Card
          no3d
          className="relative overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/[0.04] via-card to-card backdrop-blur-xl shadow-md transition-all hover:border-primary/30"
        >
          {/* Brilho decorativo sutil no topo do card */}
          <div className="pointer-events-none absolute -top-12 -right-12 h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-primary/10 blur-2xl" />

          <CardContent className="p-2.5 sm:p-5 flex flex-col justify-between h-full gap-2.5 sm:gap-4">
            {/* Topo do Card: Badge + Quantidade (Alinhados à esquerda/laterais, não centralizados) */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              <div className="flex items-center justify-start gap-1.5 sm:gap-2 min-w-0">
                <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
                  <UserCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-primary truncate">
                  COM GERENTE
                </span>
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 tabular-nums shrink-0">
                {withManager.count} <span className="hidden sm:inline">{withManager.count === 1 ? "empréstimo" : "empréstimos"}</span><span className="sm:hidden">emp.</span>
              </span>
            </div>

            {/* Valores Principais (Empilhados no mobile, Lado a lado no PC e Tablet) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 sm:gap-2.5">
              {/* Taxa de Juros Geral */}
              <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-background/60 border border-border/50 flex flex-col items-start justify-between text-left min-w-0">
                <div className="flex items-center justify-start gap-1 sm:gap-1.5 text-muted-foreground mb-1 w-full min-w-0">
                  <Percent className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary shrink-0" />
                  <span className="text-[9px] sm:text-[10px] md:text-[11px] font-medium uppercase tracking-wider truncate">
                    Taxa de Juros Geral
                  </span>
                </div>
                <span className="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-foreground tabular-nums tracking-tight truncate w-full text-left">
                  {withManager.interestRate.toFixed(1)}%
                </span>
              </div>

              {/* Juros a Receber */}
              <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-background/60 border border-border/50 flex flex-col items-start justify-between text-left min-w-0">
                <div className="flex items-center justify-start gap-1 sm:gap-1.5 text-muted-foreground mb-1 w-full min-w-0">
                  <Coins className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-warning shrink-0" />
                  <span className="text-[9px] sm:text-[10px] md:text-[11px] font-medium uppercase tracking-wider truncate">
                    Juros a Receber
                  </span>
                </div>
                <span className="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-warning tabular-nums tracking-tight truncate w-full text-left">
                  {formatCurrency(withManager.interestPending)}
                </span>
              </div>

              {/* Total a Receber */}
              <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-background/60 border border-border/50 flex flex-col items-start justify-between text-left min-w-0">
                <div className="flex items-center justify-start gap-1 sm:gap-1.5 text-muted-foreground mb-1 w-full min-w-0">
                  <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-success shrink-0" />
                  <span className="text-[9px] sm:text-[10px] md:text-[11px] font-medium uppercase tracking-wider truncate">
                    Total a Receber
                  </span>
                </div>
                <span className="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-foreground tabular-nums tracking-tight truncate w-full text-left">
                  {formatCurrency(withManager.totalReceivable)}
                </span>
              </div>
            </div>

            {/* Barra de Proporção da Carteira */}
            {total.totalReceivable > 0 && (
              <div className="space-y-1 sm:space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between text-[9px] sm:text-[11px] text-muted-foreground">
                  <span className="truncate">Representatividade</span>
                  <span className="font-semibold text-foreground tabular-nums shrink-0 ml-1">{withManagerPct}%</span>
                </div>
                <div className="h-1 sm:h-1.5 w-full rounded-full bg-muted/70 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, withManagerPct))}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CARD: SEM GERENTE */}
        <Card
          no3d
          className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-muted/[0.04] via-card to-card backdrop-blur-xl shadow-md transition-all hover:border-border"
        >
          {/* Brilho decorativo sutil */}
          <div className="pointer-events-none absolute -top-12 -right-12 h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-emerald-500/10 blur-2xl" />

          <CardContent className="p-2.5 sm:p-5 flex flex-col justify-between h-full gap-2.5 sm:gap-4">
            {/* Topo do Card: Badge + Quantidade (Alinhados à esquerda/laterais, não centralizados) */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              <div className="flex items-center justify-start gap-1.5 sm:gap-2 min-w-0">
                <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md bg-muted/60 border border-border flex items-center justify-center text-muted-foreground shrink-0">
                  <UserX className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">
                  SEM GERENTE
                </span>
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border tabular-nums shrink-0">
                {withoutManager.count} <span className="hidden sm:inline">{withoutManager.count === 1 ? "empréstimo" : "empréstimos"}</span><span className="sm:hidden">emp.</span>
              </span>
            </div>

            {/* Valores Principais (Empilhados no mobile, Lado a lado no PC e Tablet) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 sm:gap-2.5">
              {/* Taxa de Juros Geral */}
              <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-background/60 border border-border/50 flex flex-col items-start justify-between text-left min-w-0">
                <div className="flex items-center justify-start gap-1 sm:gap-1.5 text-muted-foreground mb-1 w-full min-w-0">
                  <Percent className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[9px] sm:text-[10px] md:text-[11px] font-medium uppercase tracking-wider truncate">
                    Taxa de Juros Geral
                  </span>
                </div>
                <span className="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-foreground tabular-nums tracking-tight truncate w-full text-left">
                  {withoutManager.interestRate.toFixed(1)}%
                </span>
              </div>

              {/* Juros a Receber */}
              <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-background/60 border border-border/50 flex flex-col items-start justify-between text-left min-w-0">
                <div className="flex items-center justify-start gap-1 sm:gap-1.5 text-muted-foreground mb-1 w-full min-w-0">
                  <Coins className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-warning shrink-0" />
                  <span className="text-[9px] sm:text-[10px] md:text-[11px] font-medium uppercase tracking-wider truncate">
                    Juros a Receber
                  </span>
                </div>
                <span className="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-warning tabular-nums tracking-tight truncate w-full text-left">
                  {formatCurrency(withoutManager.interestPending)}
                </span>
              </div>

              {/* Total a Receber */}
              <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-background/60 border border-border/50 flex flex-col items-start justify-between text-left min-w-0">
                <div className="flex items-center justify-start gap-1 sm:gap-1.5 text-muted-foreground mb-1 w-full min-w-0">
                  <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-success shrink-0" />
                  <span className="text-[9px] sm:text-[10px] md:text-[11px] font-medium uppercase tracking-wider truncate">
                    Total a Receber
                  </span>
                </div>
                <span className="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-foreground tabular-nums tracking-tight truncate w-full text-left">
                  {formatCurrency(withoutManager.totalReceivable)}
                </span>
              </div>
            </div>

            {/* Barra de Proporção da Carteira */}
            {total.totalReceivable > 0 && (
              <div className="space-y-1 sm:space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between text-[9px] sm:text-[11px] text-muted-foreground">
                  <span className="truncate">Representatividade</span>
                  <span className="font-semibold text-foreground tabular-nums shrink-0 ml-1">{withoutManagerPct}%</span>
                </div>
                <div className="h-1 sm:h-1.5 w-full rounded-full bg-muted/70 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, withoutManagerPct))}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
