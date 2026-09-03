import { TrendingUp, TrendingDown, Minus, Trophy, History } from "lucide-react";

interface ScoreCardProps {
  label: string;
  value: number;
  max?: number;
  variant?: "current" | "previous";
}

export function ScoreCard({ label, value, max = 100, variant = "current" }: ScoreCardProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const isCurrent = variant === "current";
  const Icon = isCurrent ? Trophy : History;
  const color = isCurrent
    ? pct >= 70 ? "text-success" : pct >= 40 ? "text-warning" : "text-destructive"
    : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-1 h-full">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-3xl font-bold tabular-nums ${color}`}>{Math.round(value)}</span>
        <span className="text-xs text-muted-foreground">/ {max} pts</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full ${
            isCurrent ? (pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-destructive") : "bg-muted-foreground/40"
          }`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">{pct}% de aproveitamento</p>
    </div>
  );
}

export function VariationCard({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : (current > 0 ? 100 : 0);
  const positive = diff > 0;
  const neutral = diff === 0;
  const color = neutral ? "text-muted-foreground" : positive ? "text-success" : "text-destructive";
  const Icon = neutral ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-col items-center text-center gap-1 h-full">
      <div className="flex items-center justify-center gap-1.5 w-full">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Variação</p>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <div className="flex items-baseline justify-center gap-1">
        <span className={`text-3xl font-bold tabular-nums ${color}`}>
          {positive ? "+" : ""}{Math.round(diff)}
        </span>
        <span className="text-xs text-muted-foreground">pts</span>
      </div>
      <p className={`text-xs font-semibold ${color}`}>
        {positive ? "+" : ""}{pct.toFixed(1).replace(".", ",")}%
      </p>
      <p className="text-[10px] text-muted-foreground">vs período anterior</p>
    </div>
  );
}
