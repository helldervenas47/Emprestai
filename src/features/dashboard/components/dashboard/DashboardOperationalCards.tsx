import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutoFitText } from "@/components/ui/auto-fit-text";
import {
  Wallet,
  HandCoins,
  Calendar,
  AlertTriangle,
  ArrowDownToLine,
  Users,
  TrendingUp,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useHideValues } from "@/contexts/HideValuesContext";

interface DashboardOperationalCardsProps {
  // Valores calculados
  capitalOnStreet: number;      // Carteira ativa (principal na rua)
  totalToReceive: number;       // Saldo total a receber (principal + juros futuros)
  dueTodayAmount: number;       // Valor que vence hoje
  dueTodayCount: number;        // Qtd de parcelas que vencem hoje
  overdueAmount: number;        // Valor total em atraso
  overdueCount: number;         // Qtd de parcelas em atraso
  receivedThisMonth: number;    // Total recebido no mês atual
  activeClientsCount: number;   // Qtd de clientes com contratos ativos
  totalLoansActiveCount: number;// Qtd de empréstimos ativos
  formatCurrency: (value: number) => string;
  onFilterOverdue?: () => void;
  onFilterDueToday?: () => void;
}

export function DashboardOperationalCards({
  capitalOnStreet,
  totalToReceive,
  dueTodayAmount,
  dueTodayCount,
  overdueAmount,
  overdueCount,
  receivedThisMonth,
  activeClientsCount,
  totalLoansActiveCount,
  formatCurrency,
  onFilterOverdue,
  onFilterDueToday,
}: DashboardOperationalCardsProps) {
  const { mask } = useHideValues();

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
      {/* 1. CARTEIRA ATIVA */}
      <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-card to-muted/20 shadow-xs hover:border-primary/40 transition-all rounded-2xl">
        <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Carteira Ativa
            </span>
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="space-y-1">
            <AutoFitText
              text={formatCurrency(capitalOnStreet)}
              maxFontSize={20}
              minFontSize={12}
              className="font-bold text-foreground tabular-nums tracking-tight"
            />
            <p className="text-[10px] text-muted-foreground truncate">
              {totalLoansActiveCount} {totalLoansActiveCount === 1 ? "contrato ativo" : "contratos ativos"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2. A RECEBER */}
      <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-card to-muted/20 shadow-xs hover:border-primary/40 transition-all rounded-2xl">
        <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              A Receber
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <HandCoins className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="space-y-1">
            <AutoFitText
              text={formatCurrency(totalToReceive)}
              maxFontSize={20}
              minFontSize={12}
              className="font-bold text-blue-600 dark:text-blue-400 tabular-nums tracking-tight"
            />
            <p className="text-[10px] text-muted-foreground truncate">
              Saldo futuro total
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 3. VENCE HOJE */}
      <Card
        onClick={dueTodayCount > 0 ? onFilterDueToday : undefined}
        className={`relative overflow-hidden border transition-all rounded-2xl ${
          dueTodayCount > 0
            ? "border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-card hover:border-amber-500/60 cursor-pointer"
            : "border-border/60 bg-gradient-to-br from-card to-muted/20"
        }`}
      >
        <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Vence Hoje
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              dueTodayCount > 0 ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
            }`}>
              <Calendar className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="space-y-1">
            <AutoFitText
              text={formatCurrency(dueTodayAmount)}
              maxFontSize={20}
              minFontSize={12}
              className={`font-bold tabular-nums tracking-tight ${
                dueTodayCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
              }`}
            />
            <p className="text-[10px] text-muted-foreground truncate">
              {dueTodayCount === 0 ? "Nenhum vencimento" : `${dueTodayCount} ${dueTodayCount === 1 ? "parcela" : "parcelas"}`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4. EM ATRASO */}
      <Card
        onClick={overdueCount > 0 ? onFilterOverdue : undefined}
        className={`relative overflow-hidden border transition-all rounded-2xl ${
          overdueCount > 0
            ? "border-rose-500/40 bg-gradient-to-br from-rose-500/5 to-card hover:border-rose-500/60 cursor-pointer"
            : "border-border/60 bg-gradient-to-br from-card to-muted/20"
        }`}
      >
        <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Em Atraso
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              overdueCount > 0 ? "bg-rose-500/20 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"
            }`}>
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="space-y-1">
            <AutoFitText
              text={formatCurrency(overdueAmount)}
              maxFontSize={20}
              minFontSize={12}
              className={`font-bold tabular-nums tracking-tight ${
                overdueCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
              }`}
            />
            <p className="text-[10px] text-muted-foreground truncate">
              {overdueCount === 0 ? "Zero inadimplência" : `${overdueCount} ${overdueCount === 1 ? "em atraso" : "em atraso"}`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 5. RECEBIDO NO MÊS */}
      <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-card to-muted/20 shadow-xs hover:border-primary/40 transition-all rounded-2xl">
        <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Recebido no Mês
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="space-y-1">
            <AutoFitText
              text={formatCurrency(receivedThisMonth)}
              maxFontSize={20}
              minFontSize={12}
              className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight"
            />
            <p className="text-[10px] text-muted-foreground truncate">
              Total liquidado no mês
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 6. CLIENTES ATIVOS */}
      <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-card to-muted/20 shadow-xs hover:border-primary/40 transition-all rounded-2xl">
        <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Clientes Ativos
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="space-y-1">
            <AutoFitText
              text={mask(String(activeClientsCount))}
              maxFontSize={20}
              minFontSize={12}
              className="font-bold text-foreground tabular-nums tracking-tight"
            />
            <p className="text-[10px] text-muted-foreground truncate">
              Tomadores com contrato
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
