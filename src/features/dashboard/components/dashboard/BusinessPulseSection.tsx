import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertOctagon,
  Lightbulb,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Users,
  ChevronRight,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import type { BusinessPulseAnalysis, PulseEventItem } from "../../lib/businessPulse/types";
import { BusinessPulsePrioritaryClientsDialog } from "./BusinessPulsePrioritaryClientsDialog";

interface Props {
  analysis: BusinessPulseAnalysis;
  onRefresh?: () => void;
  onNavigateToClients?: () => void;
  onNavigateToRanking?: () => void;
}

export function BusinessPulseSection({
  analysis,
  onRefresh,
  onNavigateToClients,
  onNavigateToRanking,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshClick = () => {
    setRefreshing(true);
    onRefresh?.();
    setTimeout(() => setRefreshing(false), 400);
  };

  const toneConfig = {
    positive: {
      border: "border-emerald-500/20",
      glow: "hsl(var(--success) / 0.15)",
      badgeBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      quoteBorder: "border-l-emerald-500",
    },
    attention: {
      border: "border-amber-500/20",
      glow: "hsl(var(--warning) / 0.15)",
      badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      quoteBorder: "border-l-amber-500",
    },
    critical: {
      border: "border-destructive/20",
      glow: "hsl(var(--destructive) / 0.15)",
      badgeBg: "bg-destructive/10 text-destructive border-destructive/20",
      quoteBorder: "border-l-destructive",
    },
    opportunity: {
      border: "border-primary/20",
      glow: "hsl(var(--primary) / 0.15)",
      badgeBg: "bg-primary/10 text-primary border-primary/20",
      quoteBorder: "border-l-primary",
    },
  }[analysis.tone || "positive"];

  const renderEventIcon = (type: PulseEventItem["type"]) => {
    switch (type) {
      case "positive":
        return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case "attention":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "critical":
        return <AlertOctagon className="h-4 w-4 text-destructive" />;
      case "opportunity":
        return <Lightbulb className="h-4 w-4 text-primary" />;
      default:
        return <Sparkles className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <>
      <Card no3d className={`relative overflow-hidden border ${toneConfig.border} bg-card/60 backdrop-blur-xl shadow-xl`}>
        {/* Glow dinâmico sutil de fundo */}
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full blur-[90px] opacity-40"
          style={{ background: toneConfig.glow }}
        />

        <CardContent className="p-5 sm:p-6 space-y-5">
          {/* Cabeçalho Responsivo Otimizado */}
          <div className="flex items-start sm:items-center justify-between gap-2.5 sm:gap-3 pb-3 border-b border-border/50">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-inner">
                <span className="text-lg sm:text-xl select-none" role="img" aria-label="Cérebro">🧠</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-foreground font-bold text-sm sm:text-base md:text-lg tracking-tight leading-snug">
                  O que está acontecendo com seu negócio?
                </h3>
                <p className="text-muted-foreground text-[10px] sm:text-[11px] tracking-wide mt-0.5">
                  Análise baseada nos dados registrados até {analysis.generatedAt}
                </p>
              </div>
            </div>

            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshClick}
                disabled={refreshing}
                className="h-8 px-2 sm:px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5 shrink-0 bg-background/50 border-border/60 shadow-sm"
                title="Atualizar análise"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
                <span className="hidden sm:inline font-medium">Atualizar</span>
              </Button>
            )}
          </div>

          {/* Diagnóstico Principal */}
          <div className={`p-4 rounded-xl bg-muted/30 border-l-4 ${toneConfig.quoteBorder} space-y-1`}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Diagnóstico Executivo
            </p>
            <p className="text-base sm:text-lg font-bold text-foreground leading-snug">
              {analysis.headline}
            </p>
          </div>

          {/* Grid de Acontecimentos Relevantes */}
          {analysis.events.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {analysis.events.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-xl border border-border/60 bg-card p-3.5 space-y-2 flex flex-col justify-between shadow-sm transition-all hover:border-border hover:shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      {renderEventIcon(ev.type)}
                      <span className="truncate">{ev.title}</span>
                    </div>
                    {ev.badgeText && (
                      <Badge variant={ev.badgeVariant || "secondary"} className="text-[10px] px-1.5 py-0 shrink-0">
                        {ev.badgeText}
                      </Badge>
                    )}
                  </div>

                  <div>
                    <span className="text-xl sm:text-2xl font-black text-foreground tracking-tight tabular-nums block">
                      {ev.metric}
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2">
                      {ev.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recomendação Prática */}
          {analysis.recommendation && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <Lightbulb className="h-4 w-4 text-primary" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider block">
                    Recomendação Prática
                  </span>
                  <p className="text-xs sm:text-sm text-foreground leading-relaxed font-medium">
                    {analysis.recommendation.text}
                  </p>
                </div>
              </div>

              {analysis.recommendation.actionLabel && (
                <div className="self-end sm:self-center shrink-0">
                  {analysis.recommendation.actionType === "view_overdue_clients" ? (
                    <Button
                      size="sm"
                      onClick={() => setDialogOpen(true)}
                      className="gap-1.5 text-xs h-8 font-semibold shadow-sm"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {analysis.recommendation.actionLabel}
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  ) : analysis.recommendation.actionType === "view_ranking" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onNavigateToRanking || (() => setDialogOpen(true))}
                      className="gap-1.5 text-xs h-8 font-semibold"
                    >
                      {analysis.recommendation.actionLabel}
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Detalhamento dos Clientes Prioritários */}
      <BusinessPulsePrioritaryClientsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clients={analysis.prioritaryClients || []}
        totalOverdueAmount={analysis.metrics?.concentration?.totalOverdueAmount || 0}
      />
    </>
  );
}
