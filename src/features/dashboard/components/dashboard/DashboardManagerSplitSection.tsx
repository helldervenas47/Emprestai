import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Briefcase, UserCheck, UserX, Coins, Wallet } from "lucide-react";
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

      {/* Grid de Cards (Lado a lado no Desktop, empilhados no Mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* CARD: COM GERENTE */}
        <Card
          no3d
          className="relative overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/[0.04] via-card to-card backdrop-blur-xl shadow-md transition-all hover:border-primary/30"
        >
          {/* Brilho decorativo sutil no topo do card */}
          <div className="pointer-events-none absolute -top-12 -right-12 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />

          <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full gap-4">
            {/* Topo do Card: Badge + Quantidade */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
                  <UserCheck className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  COM GERENTE
                </span>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 tabular-nums">
                {withManager.count} {withManager.count === 1 ? "empréstimo" : "empréstimos"}
              </span>
            </div>

            {/* Valores Principais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Juros a Receber */}
              <div className="p-3 rounded-lg bg-background/60 border border-border/50 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Coins className="h-3.5 w-3.5 text-warning shrink-0" />
                  <span className="text-[11px] font-medium uppercase tracking-wider truncate">
                    Juros a Receber
                  </span>
                </div>
                <span className="text-base sm:text-lg font-bold text-warning tabular-nums tracking-tight">
                  {formatCurrency(withManager.interestPending)}
                </span>
              </div>

              {/* Total a Receber */}
              <div className="p-3 rounded-lg bg-background/60 border border-border/50 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Wallet className="h-3.5 w-3.5 text-success shrink-0" />
                  <span className="text-[11px] font-medium uppercase tracking-wider truncate">
                    Total a Receber
                  </span>
                </div>
                <span className="text-base sm:text-lg font-bold text-foreground tabular-nums tracking-tight">
                  {formatCurrency(withManager.totalReceivable)}
                </span>
              </div>
            </div>

            {/* Barra de Proporção da Carteira */}
            {total.totalReceivable > 0 && (
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Representatividade da carteira</span>
                  <span className="font-semibold text-foreground tabular-nums">{withManagerPct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted/70 overflow-hidden">
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
          <div className="pointer-events-none absolute -top-12 -right-12 h-28 w-28 rounded-full bg-emerald-500/10 blur-2xl" />

          <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full gap-4">
            {/* Topo do Card: Badge + Quantidade */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-muted/60 border border-border flex items-center justify-center text-muted-foreground shrink-0">
                  <UserX className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  SEM GERENTE
                </span>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border tabular-nums">
                {withoutManager.count} {withoutManager.count === 1 ? "empréstimo" : "empréstimos"}
              </span>
            </div>

            {/* Valores Principais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Juros a Receber */}
              <div className="p-3 rounded-lg bg-background/60 border border-border/50 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Coins className="h-3.5 w-3.5 text-warning shrink-0" />
                  <span className="text-[11px] font-medium uppercase tracking-wider truncate">
                    Juros a Receber
                  </span>
                </div>
                <span className="text-base sm:text-lg font-bold text-warning tabular-nums tracking-tight">
                  {formatCurrency(withoutManager.interestPending)}
                </span>
              </div>

              {/* Total a Receber */}
              <div className="p-3 rounded-lg bg-background/60 border border-border/50 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Wallet className="h-3.5 w-3.5 text-success shrink-0" />
                  <span className="text-[11px] font-medium uppercase tracking-wider truncate">
                    Total a Receber
                  </span>
                </div>
                <span className="text-base sm:text-lg font-bold text-foreground tabular-nums tracking-tight">
                  {formatCurrency(withoutManager.totalReceivable)}
                </span>
              </div>
            </div>

            {/* Barra de Proporção da Carteira */}
            {total.totalReceivable > 0 && (
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Representatividade da carteira</span>
                  <span className="font-semibold text-foreground tabular-nums">{withoutManagerPct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted/70 overflow-hidden">
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
