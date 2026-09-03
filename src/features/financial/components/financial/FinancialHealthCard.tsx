import { cn } from "@/lib/utils";
import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useState } from "react";

export interface FinancialHealthCardProps {
  score: number; // 0..100
  previousScore?: number;
  onOpenDetails?: () => void;
  compactByDefault?: boolean;
  className?: string;
}

function statusFor(score: number) {
  if (score >= 70) return { label: "Saudável", tone: "success" as const };
  if (score >= 40) return { label: "Atenção", tone: "warning" as const };
  return { label: "Crítico", tone: "destructive" as const };
}

const toneToColor: Record<"success" | "warning" | "destructive", string> = {
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  destructive: "hsl(var(--destructive))",
};

export function FinancialHealthCard({
  score,
  previousScore,
  onOpenDetails,
  compactByDefault = false,
  className,
}: FinancialHealthCardProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const status = statusFor(clamped);
  const color = toneToColor[status.tone];
  const [expanded, setExpanded] = useState(!compactByDefault);

  const delta =
    typeof previousScore === "number" ? Math.round(clamped - previousScore) : null;
  const DeltaIcon =
    delta === null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  // semicircle geometry
  const size = 180;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = Math.PI * r;
  const dash = (clamped / 100) * c;

  const CompactRow = (
    <button
      type="button"
      onClick={() => (onOpenDetails ? onOpenDetails() : setExpanded((v) => !v))}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Saúde financeira ${clamped} — ${status.label}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Saúde Financeira
        </p>
        <p className="mt-0.5 text-lg font-bold text-foreground">
          {clamped}
          <span className="ml-2 text-sm font-medium" style={{ color }}>
            {status.label}
          </span>
        </p>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </button>
  );

  if (compactByDefault && !expanded) return <div className={className}>{CompactRow}</div>;

  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-4 sm:p-5", className)}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Saúde Financeira</h3>
        {compactByDefault && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setExpanded(false)}
          >
            Recolher
          </button>
        )}
      </div>

      <div className="flex items-center justify-center py-2">
        <svg
          width={size}
          height={size / 2 + stroke}
          viewBox={`0 0 ${size} ${size / 2 + stroke}`}
          role="img"
          aria-label={`Score ${clamped}`}
        >
          <path
            d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
          />
        </svg>
      </div>

      <div className="-mt-6 text-center">
        <p className="text-3xl font-bold tabular-nums text-foreground">{clamped}</p>
        <p className="text-sm font-medium" style={{ color }}>
          {status.label}
        </p>
        {delta !== null && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <DeltaIcon className="h-3.5 w-3.5" />
            {delta > 0 ? `+${delta}` : delta} vs. período anterior
          </p>
        )}
      </div>

      {onOpenDetails && (
        <button
          type="button"
          onClick={onOpenDetails}
          className="mt-4 flex w-full items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
        >
          Ver análise completa
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
