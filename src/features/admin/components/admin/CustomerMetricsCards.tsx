import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  TrendingUp,
  UserPlus,
  Flame,
  ArrowUpRight,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { CustomerSummaryMetrics } from "@/features/admin/hooks/useAdminCustomersSubscribers";

interface Props {
  metrics: CustomerSummaryMetrics;
  loading?: boolean;
  onFilterStatus?: (status: string) => void;
  activeStatusFilter?: string;
}

export function CustomerMetricsCards({ metrics, loading, onFilterStatus, activeStatusFilter = "all" }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 bg-card/60 rounded-xl border border-border/40" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      id: "all",
      label: "TOTAL DE CLIENTES",
      count: metrics.totalCustomers,
      subtitle: "100% da base",
      icon: Users,
      color: "text-foreground",
      badgeClass: "bg-secondary text-secondary-foreground",
      borderActive: activeStatusFilter === "all" ? "ring-2 ring-primary border-transparent" : "",
    },
    {
      id: "active",
      label: "CLIENTES ATIVOS",
      count: metrics.activeCount,
      subtitle: `${metrics.activePct}% da base`,
      icon: CheckCircle2,
      color: "text-emerald-500",
      badgeClass: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
      borderActive: activeStatusFilter === "active" ? "ring-2 ring-emerald-500 border-transparent" : "",
    },
    {
      id: "trial",
      label: "EM TESTE",
      count: metrics.trialCount,
      subtitle: `${metrics.trialPct}% da base`,
      icon: Clock,
      color: "text-amber-500",
      badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30",
      borderActive: activeStatusFilter === "trial" ? "ring-2 ring-amber-500 border-transparent" : "",
    },
    {
      id: "past_due",
      label: "INADIMPLENTES",
      count: metrics.pastDueCount,
      subtitle: `${metrics.pastDuePct}% da base`,
      icon: AlertTriangle,
      color: "text-rose-500",
      badgeClass: "bg-rose-500/15 text-rose-500 border-rose-500/30",
      borderActive: activeStatusFilter === "past_due" ? "ring-2 ring-rose-500 border-transparent" : "",
    },
    {
      id: "expired",
      label: "EXPIRADOS",
      count: metrics.expiredCount,
      subtitle: `${metrics.expiredPct}% da base`,
      icon: RotateCcw,
      color: "text-muted-foreground",
      badgeClass: "bg-muted text-muted-foreground border-border",
      borderActive: activeStatusFilter === "expired" ? "ring-2 ring-muted-foreground border-transparent" : "",
    },
    {
      id: "canceled",
      label: "CANCELADOS",
      count: metrics.canceledCount,
      subtitle: `${metrics.canceledPct}% da base`,
      icon: XCircle,
      color: "text-destructive",
      badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
      borderActive: activeStatusFilter === "canceled" ? "ring-2 ring-destructive border-transparent" : "",
    },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Cards de Resumo no Topo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const isSelected = activeStatusFilter === c.id;
          return (
            <Card
              key={c.id}
              onClick={() => onFilterStatus?.(c.id)}
              className={`cursor-pointer transition-all duration-200 hover:shadow-md hover:border-border p-3.5 bg-card text-card-foreground border-border/80 ${c.borderActive} ${isSelected ? "bg-accent/20" : ""}`}
            >
              <CardContent className="p-0 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    {c.label}
                  </span>
                  <Icon className={`h-4 w-4 ${c.color}`} />
                </div>
                <div className="flex items-baseline justify-between gap-1">
                  <div className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                    {c.count}
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                    {c.subtitle}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 2. Área de Indicadores de Conversão e Cohort */}
      <Card className="border-border/80 bg-gradient-to-r from-card via-card to-primary/5 p-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Indicadores de Conversão do Mês
              </h4>
              <Badge variant="outline" className="text-[10px] font-mono py-0 h-4">
                Coorte Atual
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Acompanhamento de novos cadastros, período de teste e taxa de conversão em clientes pagantes.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
            {/* Novos Clientes */}
            <div className="bg-background/80 rounded-xl p-2.5 border border-border/60 min-w-[120px]">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-semibold uppercase">
                <UserPlus className="h-3 w-3 text-primary" />
                Novos Clientes
              </div>
              <div className="text-lg font-bold text-foreground mt-0.5">
                +{metrics.newCustomersThisMonth}
              </div>
            </div>

            {/* Trials Iniciados */}
            <div className="bg-background/80 rounded-xl p-2.5 border border-border/60 min-w-[120px]">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-semibold uppercase">
                <Clock className="h-3 w-3 text-amber-500" />
                Trials Iniciados
              </div>
              <div className="text-lg font-bold text-foreground mt-0.5">
                {metrics.trialsStartedThisMonth}
              </div>
            </div>

            {/* Conversões Teste -> Pago */}
            <div className="bg-background/80 rounded-xl p-2.5 border border-border/60 min-w-[120px]">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-semibold uppercase">
                <Flame className="h-3 w-3 text-emerald-500" />
                Teste → Pago
              </div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {metrics.convertedTrialsThisMonth}
              </div>
            </div>

            {/* Taxa de Conversão */}
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5 min-w-[130px]">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase">
                <ArrowUpRight className="h-3 w-3" />
                Taxa Conversão
              </div>
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {metrics.conversionRatePct}%
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
