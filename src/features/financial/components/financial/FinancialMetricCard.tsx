import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { forwardRef, ReactNode } from "react";

export type MetricTone = "neutral" | "success" | "warning" | "destructive" | "info";

export interface FinancialMetricCardProps {
  icon?: LucideIcon;
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: MetricTone;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  loading?: boolean;
  bottomBar?: {
    progress: number;
    label?: string;
  };
}

const toneMap: Record<
  MetricTone,
  { icon: string; ring: string; symbol: string; bar: string; badge: string }
> = {
  neutral: {
    icon: "bg-muted text-muted-foreground",
    ring: "hover:border-border/70",
    symbol: "text-muted-foreground",
    bar: "bg-muted-foreground/40",
    badge: "bg-muted text-muted-foreground",
  },
  success: {
    icon: "bg-success/15 text-success",
    ring: "hover:border-success/40",
    symbol: "text-success",
    bar: "bg-success",
    badge: "bg-success/15 text-success",
  },
  warning: {
    icon: "bg-warning/15 text-warning",
    ring: "hover:border-warning/40",
    symbol: "text-warning",
    bar: "bg-warning",
    badge: "bg-warning/15 text-warning",
  },
  destructive: {
    icon: "bg-destructive/15 text-destructive",
    ring: "hover:border-destructive/40",
    symbol: "text-destructive",
    bar: "bg-destructive",
    badge: "bg-destructive/15 text-destructive",
  },
  info: {
    icon: "bg-primary/15 text-primary",
    ring: "hover:border-primary/40",
    symbol: "text-primary",
    bar: "bg-primary",
    badge: "bg-primary/15 text-primary",
  },
};

function splitCurrency(value: string) {
  const match = value.match(/^(\S+)\s(.+)$/);
  if (!match) return { symbol: "", number: value };
  return { symbol: match[1], number: match[2] };
}

export const FinancialMetricCard = forwardRef<HTMLButtonElement, FinancialMetricCardProps>(
  function FinancialMetricCard(
    { icon: Icon, label, value, hint, tone = "neutral", onClick, ariaLabel, className, loading, bottomBar },
    ref,
  ) {
    const t = toneMap[tone];
    const clickable = !!onClick;
    const Tag: "button" | "div" = clickable ? "button" : ("div" as never);
    const { symbol, number } = loading ? { symbol: "", number: "" } : splitCurrency(value);

    return (
      <Tag
        ref={ref as never}
        onClick={onClick}
        aria-label={ariaLabel || label}
        className={cn(
          "group relative flex w-full flex-col gap-3 rounded-3xl border border-border/50 bg-card p-4 text-left shadow-sm transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          clickable && "cursor-pointer active:scale-95 hover:shadow-md",
          t.ring,
          className,
        )}
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <span
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                t.icon,
              )}
              aria-hidden
            >
              <Icon className="h-5 w-5" size={20} />
            </span>
          )}
          <p className="text-[10px] font-bold uppercase leading-none tracking-widest text-muted-foreground">
            {label}
          </p>
        </div>

        <div className="flex flex-col min-w-0">
          {loading ? (
            <div className="h-6 w-24 animate-pulse rounded bg-muted" />
          ) : (
            <div className="flex items-baseline gap-0.5 overflow-hidden">
              {symbol && (
                <span className={cn("text-xs font-semibold shrink-0", t.symbol)}>
                  {symbol}
                </span>
              )}
              <span className="text-lg font-bold tabular-nums tracking-tight text-foreground truncate break-all">
                {number}
              </span>
            </div>
          )}
        </div>

        {hint && !loading && (
          <div className="mt-auto">
            {typeof hint === "string" ? (
              <span
                className={cn(
                  "inline-flex items-center self-start rounded-full px-2 py-0.5 text-[10px] font-medium",
                  t.badge,
                )}
              >
                {hint}
              </span>
            ) : (
              <div className="text-[10px] font-medium text-muted-foreground">
                {hint}
              </div>
            )}
          </div>
        )}

        {bottomBar && !loading && (
          <div className="mt-auto space-y-1">
            {bottomBar.label && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="truncate">{bottomBar.label}</span>
                <span className="tabular-nums">{Math.round(bottomBar.progress)}%</span>
              </div>
            )}
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", t.bar)}
                style={{ width: `${Math.min(100, Math.max(0, bottomBar.progress))}%` }}
              />
            </div>
          </div>
        )}
      </Tag>
    );
  },
);
