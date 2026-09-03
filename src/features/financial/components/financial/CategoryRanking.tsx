import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";

export interface CategoryRankingItem {
  name: string;
  value: number;
  color?: string; // hsl var or hex
}

export interface CategoryRankingProps {
  title?: string;
  items: CategoryRankingItem[];
  formatCurrency: (v: number) => string;
  emptyLabel?: string;
  max?: number;
  className?: string;
  onSelect?: (name: string) => void;
}

const DEFAULT_PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--purple))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
];

export function CategoryRanking({
  title = "Top categorias",
  items,
  formatCurrency,
  emptyLabel = "Sem registros no período",
  max = 5,
  className,
  onSelect,
}: CategoryRankingProps) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, max);
  const total = sorted.reduce((a, b) => a + b.value, 0);
  const largest = sorted[0]?.value || 1;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/50 bg-card/70 p-4 shadow-sm backdrop-blur-xl sm:p-5",
        className,
      )}
    >
      {/* brilho decorativo */}
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full opacity-[0.18] blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)" }}
        aria-hidden
      />

      <div className="relative mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Trophy className="h-3.5 w-3.5" />
          </span>
          <h3 className="truncate text-[13px] font-semibold tracking-tight text-foreground">{title}</h3>
        </div>
        {sorted.length > 0 && (
          <span className="shrink-0 rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {sorted.length}/{items.length}
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <>
          <ul className="relative space-y-2">
            {sorted.map((item, idx) => {
              const pct = total > 0 ? (item.value / total) * 100 : 0;
              const barPct = Math.max((item.value / largest) * 100, 3);
              const color = item.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
              const rowContent = (
                <div className="w-full">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tabular-nums"
                        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                      >
                        {idx + 1}
                      </span>
                      <span className="truncate text-[13px] font-medium text-foreground">{item.name}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums text-foreground">
                      {formatCurrency(item.value)}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2 pl-7">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${barPct}%`,
                          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`,
                        }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
              return (
                <li key={`${item.name}-${idx}`} className="min-w-0">
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(item.name)}
                      className="block w-full rounded-2xl px-2 py-2 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:bg-muted/60"
                      aria-label={`Ver registros de ${item.name}: ${formatCurrency(item.value)}`}
                    >
                      {rowContent}
                    </button>
                  ) : (
                    <div className="px-2 py-2">{rowContent}</div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="relative mt-3 flex items-center justify-between rounded-2xl border border-border/40 bg-muted/30 px-3 py-2.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total</span>
            <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(total)}</span>
          </div>
        </>
      )}
    </div>
  );
}
