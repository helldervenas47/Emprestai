import { useMemo } from "react";
import { AlertTriangle, Clock, CheckCircle, DollarSign, Calendar, RefreshCw, Info } from "lucide-react";
import { SummaryBreakdownCard } from "./productSalesTypes";
import { Sale } from "@/types/loan";
import { getNextDueDateHelper, getNextInstallmentValueHelper, getSaleCategory } from "./productSalesUtils";

interface Props {
  hideOnTrackCard?: boolean;
  formatCurrency: (v: number) => string;
  totalOverdue: number;
  totalOnTrack: number;
  totalDueToday: number;
  totalPaid?: number;
  totalAReceber: number;
  overdueCount: number;
  onTrackCount: number;
  dueTodayCount: number;
  paidContractsCount?: number;
  onSelect: (card: SummaryBreakdownCard) => void;
  selectedCard?: SummaryBreakdownCard | null;
  sales?: Sale[];
}

type Tone = "destructive" | "warning" | "sky" | "indigo";

const TONE = {
  destructive: {
    text: "text-destructive",
    bgGradient: "bg-gradient-to-br from-destructive/10 via-destructive/[0.04] to-transparent",
    iconBg: "bg-destructive/15 text-destructive",
    badgeBg: "bg-destructive/15 text-destructive border-destructive/30",
    dot: "bg-destructive",
    activeRing: "ring-2 ring-destructive/40 border-destructive/50",
    border: "border-destructive/20 hover:border-destructive/40",
  },
  warning: {
    text: "text-amber-600 dark:text-amber-400",
    bgGradient: "bg-gradient-to-br from-amber-500/10 via-amber-500/[0.04] to-transparent",
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    badgeBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    dot: "bg-amber-500",
    activeRing: "ring-2 ring-amber-500/40 border-amber-500/50",
    border: "border-amber-500/20 hover:border-amber-500/40",
  },
  sky: {
    text: "text-sky-600 dark:text-sky-400",
    bgGradient: "bg-gradient-to-br from-sky-500/10 via-sky-500/[0.04] to-transparent",
    iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    badgeBg: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    dot: "bg-sky-500",
    activeRing: "ring-2 ring-sky-500/40 border-sky-500/50",
    border: "border-sky-500/20 hover:border-sky-500/40",
  },
  indigo: {
    text: "text-indigo-600 dark:text-indigo-400",
    bgGradient: "bg-gradient-to-br from-indigo-500/15 via-indigo-500/[0.05] to-transparent",
    iconBg: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    badgeBg: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
    dot: "bg-indigo-500",
    activeRing: "ring-2 ring-indigo-500/40 border-indigo-500/50",
    border: "border-indigo-500/30 hover:border-indigo-500/50",
  },
} as const;

export function ProductSalesSummaryCards({
  hideOnTrackCard = false,
  formatCurrency,
  totalOverdue,
  totalOnTrack,
  totalDueToday,
  totalAReceber,
  overdueCount,
  onTrackCount,
  dueTodayCount,
  onSelect,
  selectedCard,
  sales = [],
}: Props) {
  const totalActive = overdueCount + onTrackCount + dueTodayCount;

  const footer = useMemo(() => {
    // 1. Maior atraso entre as vendas vencidas
    let biggestOverdue = 0;
    const overdueList = sales.filter((s) => getSaleCategory(s) === "overdue");
    for (const s of overdueList) {
      const v = getNextInstallmentValueHelper(s);
      if (v > biggestOverdue) biggestOverdue = v;
    }

    // 2. Próximo vencimento entre as vendas ativas
    const today = new Date();
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const pendingByDate = new Map<number, number>();

    const activeList = sales.filter((s) => getSaleCategory(s) !== "paid");
    for (const s of activeList) {
      const due = getNextDueDateHelper(s).getTime();
      if (due > todayNorm) {
        const val = getNextInstallmentValueHelper(s);
        pendingByDate.set(due, (pendingByDate.get(due) || 0) + val);
      }
    }

    let nextDueValue: number | null = null;
    if (pendingByDate.size > 0) {
      const minTs = Math.min(...pendingByDate.keys());
      nextDueValue = pendingByDate.get(minTs) || null;
    }

    // 3. Parcela média das vendas em dia
    const onTrackList = sales.filter((s) => getSaleCategory(s) === "on_track");
    const parcelas = onTrackList
      .map((s) => getNextInstallmentValueHelper(s))
      .filter((v) => v > 0);
    const parcelaMedia = parcelas.length > 0 ? parcelas.reduce((a, b) => a + b, 0) / parcelas.length : 0;

    // 4. Ticket médio geral
    const ticketMedio = totalActive > 0 ? totalAReceber / totalActive : 0;

    return {
      biggestOverdue,
      nextDueValue,
      parcelaMedia,
      ticketMedio,
    };
  }, [sales, totalActive, totalAReceber]);

  type CardConfig = {
    id: SummaryBreakdownCard;
    label: string;
    sublabel: string;
    value: number;
    count: number;
    icon: typeof AlertTriangle;
    tone: Tone;
    footerLabel: string;
    footerValue: string;
    emphasized?: boolean;
    hidden?: boolean;
  };

  const cards: CardConfig[] = [
    {
      id: "overdue",
      label: "Atrasados",
      sublabel: "Em atraso",
      value: totalOverdue,
      count: overdueCount,
      icon: AlertTriangle,
      tone: "destructive",
      footerLabel: "Maior atraso",
      footerValue: footer.biggestOverdue > 0 ? formatCurrency(footer.biggestOverdue) : "—",
    },
    {
      id: "due_today",
      label: "Vence Hoje",
      sublabel: "Para receber hoje",
      value: totalDueToday,
      count: dueTodayCount,
      icon: Calendar,
      tone: "warning",
      footerLabel: "Próx. vencimento",
      footerValue: footer.nextDueValue != null && footer.nextDueValue > 0 ? formatCurrency(footer.nextDueValue) : "—",
    },
    {
      id: "ontrack",
      label: "Em Dia",
      sublabel: "Contratos regulares",
      value: totalOnTrack,
      count: onTrackCount,
      icon: CheckCircle,
      tone: "sky",
      footerLabel: "Parcela média",
      footerValue: footer.parcelaMedia > 0 ? formatCurrency(footer.parcelaMedia) : "—",
      hidden: hideOnTrackCard,
    },
    {
      id: "receivable",
      label: "Total a Receber",
      sublabel: "Carteira ativa",
      value: totalAReceber,
      count: totalActive,
      icon: DollarSign,
      tone: "indigo",
      footerLabel: "Ticket médio",
      footerValue: footer.ticketMedio > 0 ? formatCurrency(footer.ticketMedio) : "—",
      emphasized: true,
    },
  ];

  const visible = cards.filter((c) => !c.hidden);
  const gridCols = visible.length === 3 ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4";

  return (
    <div className={`grid ${gridCols} gap-2 sm:gap-3`}>
      {visible.map((c, idx) => {
        const Icon = c.icon;
        const t = TONE[c.tone];
        const isActive = selectedCard === c.id;
        return (
          <button
            key={c.id}
            type="button"
            aria-label={`${c.label}: ${formatCurrency(c.value)} — ${c.count} contratos`}
            onClick={() => onSelect(c.id)}
            className={[
              "group relative text-left rounded-2xl p-3 sm:p-4",
              "bg-card border transition-all duration-200",
              t.bgGradient,
              isActive ? t.activeRing : `${t.border} shadow-xs hover:shadow-md hover:-translate-y-0.5`,
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              "flex flex-col justify-between overflow-hidden",
            ].join(" ")}
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            {/* Top Row: Icon + Title & Sublabel (badge on right for sm+) */}
            <div>
              <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`h-7 w-7 sm:h-9 sm:w-9 rounded-xl ${t.iconBg} flex items-center justify-center shrink-0 shadow-xs`}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-bold text-foreground block leading-tight truncate">
                      {c.label}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground block leading-tight mt-0.5 truncate">
                      {c.sublabel}
                    </span>
                  </div>
                </div>

                {/* Badge visível no desktop/tablet */}
                <span
                  className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border shrink-0 ${t.badgeBg}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden />
                  {c.count} {c.count === 1 ? "contrato" : "contratos"}
                </span>
              </div>

              {/* Main Financial Value */}
              <div className="mt-2.5 sm:mt-3">
                <p
                  className={`text-base sm:text-2xl lg:text-[26px] font-bold tabular-nums tracking-tight leading-tight ${t.text}`}
                >
                  {formatCurrency(c.value)}
                </p>

                {/* Quantidade de contratos abaixo do valor na versão mobile */}
                <div className="sm:hidden mt-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${t.badgeBg}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden />
                    {c.count} {c.count === 1 ? "contrato" : "contratos"}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer metric */}
            <div className="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 border-t border-border/40 dark:border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-1 text-[10px] sm:text-xs">
              <span className="text-muted-foreground leading-tight text-[10px] sm:text-xs">{c.footerLabel}</span>
              <span className={`font-semibold tabular-nums leading-tight text-[10px] sm:text-xs ${t.text}`}>
                {c.footerValue}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
