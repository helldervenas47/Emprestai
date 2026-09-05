import { useMemo } from "react";
import {
  ClientRankingItem,
  ClientRankingType,
} from "../../types/clientRanking";
import { getClientRiskScoreInfo } from "../../lib/clientRiskScore";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/features/creditCards/lib/creditLimit";
import { ChevronRight, ShieldCheck, Clock, TrendingUp, DollarSign, Repeat, Flame } from "lucide-react";

interface ClientRankingCardProps {
  item: ClientRankingItem;
  rankingType: ClientRankingType;
  onClick: () => void;
}

export function ClientRankingCard({
  item,
  rankingType,
  onClick,
}: ClientRankingCardProps) {
  const riskInfo = useMemo(() => getClientRiskScoreInfo(item.score), [item.score]);

  // Renderização da medalha / badge de posição
  const positionBadge = useMemo(() => {
    if (item.position === 1) {
      return (
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/20 text-amber-500 font-extrabold text-sm border border-amber-500/30 shrink-0">
          🥇
        </span>
      );
    }
    if (item.position === 2) {
      return (
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-300/20 text-slate-300 font-extrabold text-sm border border-slate-300/30 shrink-0">
          🥈
        </span>
      );
    }
    if (item.position === 3) {
      return (
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-700/20 text-amber-700 font-extrabold text-sm border border-amber-700/30 shrink-0">
          🥉
        </span>
      );
    }
    return (
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-muted/60 text-muted-foreground font-semibold text-xs shrink-0">
        #{item.position}
      </span>
    );
  }, [item.position]);

  // Indicador principal em destaque
  const primaryMetric = useMemo(() => {
    switch (rankingType) {
      case "on_time":
        return {
          label: "Pontualidade",
          value: `${item.on_time_percentage.toFixed(0)}%`,
          subValue: `${item.on_time_payments} de ${item.total_payments} pagos em dia`,
          icon: Clock,
          color: "text-success",
        };
      case "revenue":
        return {
          label: "Juros Recebidos",
          value: formatBRL(item.profit_generated),
          subValue: `Recebido: ${formatBRL(item.total_received)}`,
          icon: DollarSign,
          color: "text-primary",
        };
      case "volume":
        return {
          label: "Volume Emprestado",
          value: formatBRL(item.total_borrowed),
          subValue: `${item.total_loans} empréstimo(s)`,
          icon: TrendingUp,
          color: "text-primary",
        };
      case "frequent":
        return {
          label: "Frequência",
          value: `${item.total_loans} contratos`,
          subValue: `Total: ${formatBRL(item.total_borrowed)}`,
          icon: Repeat,
          color: "text-foreground",
        };
      case "risk":
        return {
          label: "Risco Atual",
          value: riskInfo.riskLevel,
          subValue: `Em aberto: ${formatBRL(item.open_amount)}`,
          icon: ShieldCheck,
          color: riskInfo.color,
        };
      case "late":
        return {
          label: "Maior Atraso",
          value: `${item.max_delay_days} dias`,
          subValue: `${item.overdue_loans} empréstimo(s) com atraso`,
          icon: Flame,
          color: "text-destructive",
        };
      case "best":
      default:
        return {
          label: "Pontualidade & Volume",
          value: `${item.on_time_percentage.toFixed(0)}%`,
          subValue: `Total recebido: ${formatBRL(item.total_received)}`,
          icon: TrendingUp,
          color: "text-success",
        };
    }
  }, [rankingType, item, riskInfo]);

  const MetricIcon = primaryMetric.icon;

  return (
    <div
      onClick={onClick}
      className="p-3.5 sm:p-4 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer flex flex-col items-start justify-between gap-3 group"
    >
      <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Lado Esquerdo: Posição, Avatar e Dados Principais */}
        <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0 flex-1 w-full sm:w-auto">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {positionBadge}

            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 uppercase">
              {item.client_name.slice(0, 2)}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm sm:text-base text-foreground truncate group-hover:text-primary transition-colors">
                {item.client_name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {item.client_phone || item.client_cpf || "Cliente cadastrado"}
              </p>
            </div>
          </div>

          {/* Score no topo direito em telas mobile */}
          <Badge
            variant="outline"
            className={`sm:hidden text-[10px] px-2 py-0.5 h-5 font-bold shrink-0 ${riskInfo.color} border-current/30`}
          >
            Score: {riskInfo.score}/100
          </Badge>
        </div>

        {/* Lado Direito: Score (desktop), Métrica em Destaque e Ação */}
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
          {/* Score no lado direito em desktop */}
          <Badge
            variant="outline"
            className={`hidden sm:inline-flex text-[11px] px-2.5 py-0.5 h-6 font-bold shrink-0 ${riskInfo.color} border-current/30`}
          >
            Score: {riskInfo.score}/100
          </Badge>

          <div className="text-left sm:text-right">
            <div className="flex items-center sm:justify-end gap-1">
              <MetricIcon className={`h-3.5 w-3.5 ${primaryMetric.color}`} />
              <span className="text-xs font-medium text-muted-foreground">
                {primaryMetric.label}:
              </span>
              <span className={`text-sm sm:text-base font-bold ${primaryMetric.color}`}>
                {primaryMetric.value}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground block">
              {primaryMetric.subValue}
            </span>
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </div>
    </div>
  );
}
