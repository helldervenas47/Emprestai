import { AlertTriangle, Clock, CheckCircle, DollarSign, Calendar, RefreshCw, Info, CircleCheck } from "lucide-react";
import { SummaryBreakdownCard } from "./productSalesTypes";

interface Props {
  hideOnTrackCard?: boolean;
  formatCurrency: (v: number) => string;
  totalOverdue: number;
  totalOnTrack: number;
  totalDueToday: number;
  totalPaid: number;
  totalAReceber: number;
  overdueCount: number;
  onTrackCount: number;
  dueTodayCount: number;
  paidContractsCount: number;
  onSelect: (card: SummaryBreakdownCard) => void;
}

type Tone = "destructive" | "warning" | "success" | "primary" | "purple";

const TONE = {
  destructive: {
    text: "text-destructive",
    iconBg: "bg-destructive/10",
    badgeBg: "bg-destructive/10",
    badgeText: "text-destructive",
    stroke: "hsl(var(--destructive))",
    ring: "ring-destructive/40",
    activeBorder: "border-destructive/40",
  },
  warning: {
    text: "text-warning",
    iconBg: "bg-warning/10",
    badgeBg: "bg-warning/10",
    badgeText: "text-warning",
    stroke: "hsl(var(--warning))",
    ring: "ring-warning/40",
    activeBorder: "border-warning/40",
  },
  success: {
    text: "text-success",
    iconBg: "bg-success/10",
    badgeBg: "bg-success/10",
    badgeText: "text-success",
    stroke: "hsl(var(--success))",
    ring: "ring-success/40",
    activeBorder: "border-success/40",
  },
  primary: {
    text: "text-primary",
    iconBg: "bg-primary/10",
    badgeBg: "bg-primary/10",
    badgeText: "text-primary",
    stroke: "hsl(var(--primary))",
    ring: "ring-primary/40",
    activeBorder: "border-primary/40",
  },
  purple: {
    text: "text-primary",
    iconBg: "bg-primary/10",
    badgeBg: "bg-primary/10",
    badgeText: "text-primary",
    stroke: "hsl(var(--primary))",
    ring: "ring-primary/50",
    activeBorder: "border-primary/60",
  },
} as const;

function Sparkline({ stroke }: { stroke: string }) {
  return (
    <svg width="70" height="22" viewBox="0 0 70 22" fill="none" className="opacity-70 group-hover:opacity-100 transition-opacity" aria-hidden>
      <polyline
        points="0,10 10,10 20,10 30,10 40,10 50,10 60,10 70,10"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

export function ProductSalesSummaryCards({
  hideOnTrackCard = false,
  formatCurrency,
  totalOverdue,
  totalOnTrack,
  totalDueToday,
  totalPaid,
  totalAReceber,
  overdueCount,
  onTrackCount,
  dueTodayCount,
  paidContractsCount,
  onSelect,
}: Props) {
  const noPrazoCount = onTrackCount + dueTodayCount;
  const noPrazoValue = totalOnTrack + totalDueToday;
  const totalActive = overdueCount + noPrazoCount;

  const ticketOverdue = overdueCount > 0 ? totalOverdue / overdueCount : 0;
  const ticketNoPrazo = noPrazoCount > 0 ? noPrazoValue / noPrazoCount : 0;
  const ticketPago = paidContractsCount > 0 ? totalPaid / paidContractsCount : 0;
  const ticketMedio = totalActive > 0 ? totalAReceber / totalActive : 0;

  type CardConfig = {
    id: SummaryBreakdownCard;
    label: string;
    value: number;
    count: number;
    countLabel: string;
    icon: typeof AlertTriangle;
    secondaryIcon: typeof AlertTriangle;
    tone: Tone;
    footerLabel: string;
    footerValue: string;
    emphasized?: boolean;
    hidden?: boolean;
  };

  const cards: CardConfig[] = [
    {
      id: "overdue",
      label: "Vencidos",
      value: totalOverdue,
      count: overdueCount,
      countLabel: "contratos",
      icon: AlertTriangle,
      secondaryIcon: Clock,
      tone: "destructive",
      footerLabel: "Ticket médio",
      footerValue: ticketOverdue > 0 ? formatCurrency(ticketOverdue) : "—",
    },
    {
      id: "ontrack",
      label: "No Prazo",
      value: noPrazoValue,
      count: noPrazoCount,
      countLabel: "contratos",
      icon: CheckCircle,
      secondaryIcon: RefreshCw,
      tone: "primary",
      footerLabel: "Ticket médio",
      footerValue: ticketNoPrazo > 0 ? formatCurrency(ticketNoPrazo) : "—",
      hidden: hideOnTrackCard,
    },
    {
      id: "paid",
      label: "Pagos",
      value: totalPaid,
      count: paidContractsCount,
      countLabel: "quitados",
      icon: CircleCheck,
      secondaryIcon: Calendar,
      tone: "success",
      footerLabel: "Ticket médio",
      footerValue: ticketPago > 0 ? formatCurrency(ticketPago) : "—",
    },
    {
      id: "receivable",
      label: "Total a Receber",
      value: totalAReceber,
      count: totalActive,
      countLabel: "contratos",
      icon: DollarSign,
      secondaryIcon: Info,
      tone: "purple",
      footerLabel: "Ticket médio",
      footerValue: ticketMedio > 0 ? formatCurrency(ticketMedio) : "—",
      emphasized: true,
    },
  ];

  const visible = cards.filter((c) => !c.hidden);
  const gridCols = visible.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4";

  return (
    <div className={`grid ${gridCols} gap-1.5 sm:gap-2 lg:gap-3`}>
      {visible.map((c, idx) => {
        const Icon = c.icon;
        const Secondary = c.secondaryIcon;
        const t = TONE[c.tone];
        return (
          <button
            key={c.id}
            type="button"
            aria-label={`${c.label}: ${formatCurrency(c.value)} — ${c.count} ${c.countLabel}`}
            onClick={() => onSelect(c.id)}
            className={[
              "group relative text-left rounded-[12px] sm:rounded-[13px] lg:rounded-[14px] p-2.5 sm:p-3 lg:p-4",
              "bg-card border border-border/60 dark:border-white/5",
              "shadow-[0_1px_2px_hsl(220_40%_2%/0.04)] dark:shadow-none",
              "transition-all duration-200 hover:-translate-y-[2px]",
              "hover:shadow-[0_8px_24px_-10px_hsl(220_40%_2%/0.16)]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              "animate-fade-in flex flex-col",
              c.emphasized ? `${t.activeBorder}` : "",
            ].join(" ")}
            style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "backwards" }}
          >
            {/* Top row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className={`h-7 w-7 lg:h-8 lg:w-8 rounded-lg ${t.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-3.5 w-3.5 lg:h-4 lg:w-4 ${t.text}`} aria-hidden />
                </span>
                <span className="text-[13px] lg:text-sm font-medium text-foreground truncate">{c.label}</span>
              </div>
              <Secondary className={`h-3 w-3 lg:h-3.5 lg:w-3.5 shrink-0 ${t.text} opacity-70`} aria-hidden />
            </div>

            {/* Main value */}
            <p className={`mt-2 lg:mt-3 text-[17px] sm:text-[20px] lg:text-[26px] font-bold tabular-nums leading-none whitespace-nowrap ${t.text}`}>
              {formatCurrency(c.value)}
            </p>

            {/* Contracts */}
            <p className="mt-1 lg:mt-1.5 text-[11px] lg:text-[12px] text-muted-foreground">
              {c.count} {c.count === 1 ? c.countLabel.replace(/s$/, "") : c.countLabel}
            </p>

            {/* Badge + sparkline */}
            <div className="mt-2 lg:mt-3 flex items-end justify-between gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-1.5 lg:px-2 py-0.5 text-[10px] lg:text-[11px] font-medium ${t.badgeBg} ${t.badgeText}`}>
                <span className="opacity-70">—</span>
                sem histórico
              </span>
              <Sparkline stroke={t.stroke} />
            </div>

            {/* Footer */}
            <div className="mt-2 lg:mt-3 pt-2 lg:pt-2.5 border-t border-border/50">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-[11px] lg:text-[12px] text-muted-foreground truncate">{c.footerLabel}</span>
                <span className={`text-[11px] lg:text-[12px] font-semibold tabular-nums whitespace-nowrap ${t.text}`}>
                  {c.footerValue}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
