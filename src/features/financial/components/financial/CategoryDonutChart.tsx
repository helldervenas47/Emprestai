import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { PieChart, ChevronRight } from "lucide-react";

export interface DonutSlice {
  name: string;
  value: number;
  color?: string;
}

export interface CategoryDonutChartProps {
  title?: string;
  slices: DonutSlice[];
  formatCurrency: (v: number) => string;
  centerLabel?: string;
  emptyLabel?: string;
  className?: string;
  size?: number;
  onClick?: () => void;
  onSelectSlice?: (name: string) => void;
}

const DEFAULT_PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--purple))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
];

/**
 * Donut chart puro em SVG — sem depender do recharts para manter bundle enxuto
 * e evitar sobreposição de rótulos no mobile. Legenda fica abaixo/ao lado.
 */
export function CategoryDonutChart({
  title = "Por categoria",
  slices,
  formatCurrency,
  centerLabel = "Total",
  emptyLabel = "Sem dados no período",
  className,
  size = 172,
  onClick,
  onSelectSlice,
}: CategoryDonutChartProps) {
  const total = useMemo(() => slices.reduce((a, s) => a + s.value, 0), [slices]);
  const stroke = 16;
  const gap = 2.5; // respiro entre fatias
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const segments = useMemo(() => {
    if (total <= 0) return [];
    let acc = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s, i) => {
        const pct = s.value / total;
        const dash = pct * c;
        const seg = {
          ...s,
          color: s.color || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
          dash: Math.max(dash - gap, 1),
          offset: acc,
          pct,
        };
        acc += dash;
        return seg;
      });
  }, [slices, total, c]);

  const isClickable = !!onClick || !!onSelectSlice;

  return (
    <div
      onClick={() => onClick?.()}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/50 bg-card/70 p-4 shadow-sm backdrop-blur-xl sm:p-5 transition-all duration-200",
        isClickable && "cursor-pointer hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 group",
        className,
      )}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <div
        className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full opacity-[0.16] blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--success)) 0%, transparent 70%)" }}
        aria-hidden
      />

      <div className="relative mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success">
            <PieChart className="h-3.5 w-3.5" />
          </span>
          <h3 className="truncate text-[13px] font-semibold tracking-tight text-foreground">{title}</h3>
        </div>

        {isClickable && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground group-hover:text-primary transition-colors shrink-0">
            <span>Ver categorias</span>
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        )}
      </div>

      {total <= 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="relative flex flex-col items-center gap-5 lg:flex-row lg:items-center lg:gap-6">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="-rotate-90 drop-shadow-sm"
              role="img"
              aria-label={title}
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeOpacity={0.5}
                strokeWidth={stroke}
              />
              {segments.map((s, i) => (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${s.dash} ${c - s.dash}`}
                  strokeDashoffset={-s.offset}
                  strokeLinecap="round"
                  className={onSelectSlice ? "cursor-pointer transition-opacity hover:opacity-80" : ""}
                  onClick={
                    onSelectSlice
                      ? (e) => {
                          e.stopPropagation();
                          onSelectSlice(s.name);
                        }
                      : undefined
                  }
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {centerLabel}
              </span>
              <span className="mt-0.5 text-[15px] font-bold leading-tight tabular-nums text-foreground sm:text-lg">
                {formatCurrency(total)}
              </span>
              <span className="mt-0.5 text-[10px] text-muted-foreground">
                {segments.length} categoria{segments.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <ul
            className="w-full min-w-0 space-y-1 max-h-[220px] sm:max-h-[260px] overflow-y-auto pr-1"
            style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain" }}
          >
            {segments.map((s, i) => (
              <li
                key={i}
                onClick={(e) => {
                  if (onSelectSlice) {
                    e.stopPropagation();
                    onSelectSlice(s.name);
                  } else if (onClick) {
                    onClick();
                  }
                }}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60",
                  isClickable && "cursor-pointer active:bg-muted/80"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full ring-2"
                    style={{ background: s.color, ["--tw-ring-color" as string]: `color-mix(in srgb, ${s.color} 22%, transparent)` }}
                    aria-hidden
                  />
                  <span className="truncate text-[13px] font-medium text-foreground">{s.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                  <span className="text-[13px] font-semibold tabular-nums text-foreground">
                    {formatCurrency(s.value)}
                  </span>
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                    style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)`, color: s.color }}
                  >
                    {(s.pct * 100).toFixed(0)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
