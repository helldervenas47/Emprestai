import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ReactNode } from "react";

export interface HeroMetric {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "destructive" | "muted";
  icon?: LucideIcon;
  onClick?: () => void;
}

export interface FinancialHeroCardProps {
  eyebrow?: string;
  title?: string;
  value: string;

  variation?: {
    label: string;
    direction: "up" | "down" | "flat";
    tone?: "positive" | "negative" | "neutral";
  };
  metrics?: HeroMetric[];
  action?: ReactNode;
  className?: string;
  /** Exibe skeleton no lugar do valor (apenas primeira carga real). */
  valueLoading?: boolean;
}

/**
 * Cabeçalho hero financeiro usado por Receitas e Despesas.
 * PC: métricas em linha com divisores. Mobile/Tablet: métricas em grid 2x2.
 * Cores/tokens semânticos — nenhum valor hardcoded.
 */
export function FinancialHeroCard({
  eyebrow,
  title,
  value,
  variation,
  metrics = [],
  action,
  className,
  valueLoading = false,
}: FinancialHeroCardProps) {
  const VarIcon =
    variation?.direction === "up"
      ? TrendingUp
      : variation?.direction === "down"
      ? TrendingDown
      : Minus;

  const varTone =
    variation?.tone === "positive"
      ? "text-success-foreground/95 bg-success/25"
      : variation?.tone === "negative"
      ? "text-destructive-foreground bg-destructive/30"
      : "text-primary-foreground/90 bg-white/15";

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl p-5 sm:p-6 lg:p-8",
        "bg-gradient-to-br from-primary via-primary to-purple",
        "text-primary-foreground shadow-lg",
        className,
      )}
      aria-label={title}
    >
      {/* soft glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 pr-28 sm:pr-32 lg:pr-0">
          {eyebrow && (
            <p className="text-[11px] uppercase tracking-[0.14em] text-primary-foreground/70">
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 className="mt-1 text-sm font-medium text-primary-foreground/85">
              {title}
            </h2>
          )}
          <p className={cn("text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-bold tabular-nums tracking-tight truncate", title ? "mt-2" : "mt-1")}>
            {valueLoading ? (
              <span
                aria-hidden
                className="inline-block h-8 w-36 animate-pulse rounded-md bg-white/25 align-middle sm:h-10 sm:w-44 lg:h-12 lg:w-56"
              />
            ) : (
              value
            )}
          </p>
          {variation && (
            <span
              className={cn(
                "mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                varTone,
              )}
            >
              <VarIcon className="h-3.5 w-3.5" />
              {variation.label}
            </span>
          )}
        </div>
        {action && (
          <div className="absolute top-0 right-0 lg:static lg:shrink-0">
            {action}
          </div>
        )}
      </div>

      {metrics.length > 0 && (
        <div
          className={cn(
            "relative mt-3 grid gap-3",
            "grid-cols-2 sm:grid-cols-2",
            metrics.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
          )}
        >

          {metrics.map((m, i) => {
            const Icon = m.icon;
            const toneClass =
              m.tone === "success"
                ? "text-success-foreground"
                : m.tone === "warning"
                ? "text-warning-foreground"
                : m.tone === "destructive"
                ? "text-destructive-foreground"
                : m.tone === "muted"
                ? "text-primary-foreground/70"
                : "text-primary-foreground";
            const clickable = typeof m.onClick === "function";
            const Wrapper: any = clickable ? "button" : "div";
            return (
              <Wrapper
                key={i}
                {...(clickable
                  ? {
                      type: "button",
                      onClick: m.onClick,
                      "aria-label": `Ver detalhes de ${m.label}`,
                    }
                  : {})}
                className={cn(
                  "rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm text-left",
                  "lg:bg-transparent lg:px-4 lg:py-0",
                  i > 0 && "lg:border-l lg:border-white/15",
                  clickable &&
                    "cursor-pointer transition-colors hover:bg-white/15 active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 lg:hover:bg-white/5",
                )}
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-primary-foreground/70">
                  {m.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 flex items-center gap-1.5 text-base font-semibold tabular-nums sm:text-lg whitespace-nowrap",
                    toneClass,
                  )}
                >
                  {Icon && <Icon className="h-4 w-4 opacity-80" />}
                  {m.value}
                </p>
              </Wrapper>
            );
          })}
        </div>
      )}
    </section>
  );
}
