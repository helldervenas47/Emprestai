import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type FinancialListMiniCardStatus =
  | "paid"
  | "pending"
  | "overdue"
  | "due_today"
  | "scheduled"
  | "neutral";

const STATUS_STYLES: Record<
  FinancialListMiniCardStatus,
  { badge: string; label: string; accent: string }
> = {
  paid: {
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    label: "Pago",
    accent: "bg-emerald-500",
  },
  pending: {
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    label: "Pendente",
    accent: "bg-amber-500",
  },
  due_today: {
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    label: "Vence hoje",
    accent: "bg-amber-500",
  },
  overdue: {
    badge: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
    label: "Atrasado",
    accent: "bg-red-500",
  },
  scheduled: {
    badge: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
    label: "Agendado",
    accent: "bg-sky-500",
  },
  neutral: {
    badge: "bg-muted text-muted-foreground border-border",
    label: "—",
    accent: "bg-muted-foreground/40",
  },
};

export interface FinancialListMiniCardProps {
  title: string;
  amount: string;
  amountTone?: "income" | "expense" | "neutral";
  status?: FinancialListMiniCardStatus;
  statusLabel?: string;
  category?: string;
  categoryIcon?: ReactNode;
  dueDate?: string;
  paidDate?: string;
  meta?: ReactNode;
  progress?: number; // 0-100
  progressLabel?: string;
  actions?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function FinancialListMiniCard({
  title,
  amount,
  amountTone = "neutral",
  status = "neutral",
  statusLabel,
  category,
  categoryIcon,
  dueDate,
  paidDate,
  meta,
  progress,
  progressLabel,
  actions,
  onClick,
  className,
}: FinancialListMiniCardProps) {
  const styles = STATUS_STYLES[status];
  const amountColor =
    amountTone === "income"
      ? "text-emerald-600 dark:text-emerald-400"
      : amountTone === "expense"
      ? "text-red-600 dark:text-red-400"
      : "text-foreground";

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm transition-all",
        onClick && "cursor-pointer active:scale-[0.99] hover:border-primary/40",
        className
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", styles.accent)}
      />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {categoryIcon ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {categoryIcon}
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{title}</p>
              {category ? (
                <p className="truncate text-xs text-muted-foreground">{category}</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn("whitespace-nowrap text-base font-bold tabular-nums", amountColor)}>
            {amount}
          </span>
          <Badge variant="outline" className={cn("h-5 px-2 text-[10px] font-medium", styles.badge)}>
            {statusLabel ?? styles.label}
          </Badge>
        </div>
      </div>

      {(dueDate || paidDate || meta) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-2 text-xs text-muted-foreground">
          {dueDate ? <span>Vence: <strong className="text-foreground">{dueDate}</strong></span> : null}
          {paidDate ? <span>Pago: <strong className="text-foreground">{paidDate}</strong></span> : null}
          {meta}
        </div>
      )}

      {typeof progress === "number" && (
        <div className="mt-2 pl-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{progressLabel ?? "Progresso"}</span>
            <span className="tabular-nums">{Math.min(100, Math.max(0, Math.round(progress)))}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", styles.accent)}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {actions ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-2">{actions}</div>
      ) : null}
    </div>
  );
}
