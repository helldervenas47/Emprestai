import React, { useEffect, useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { usePlanEntitlements } from "@/features/admin/hooks/usePlanEntitlements";
import { CalendarClock, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanExpirationInfoProps {
  className?: string;
  showIcon?: boolean;
}

export function PlanExpirationInfo({ className, showIcon = true }: PlanExpirationInfoProps) {
  const { subscription, isActive } = useSubscription();
  const { trial, loading } = usePlanEntitlements();

  // Tick a cada 30 segundos para manter os dias e horas sempre atualizados
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return null;

  // Determina a data de expiração do plano ou do período de teste
  const rawEnd = subscription?.current_period_end || trial?.endsAt;
  if (!rawEnd) return null;

  const expirationDate = typeof rawEnd === "string" ? new Date(rawEnd) : rawEnd;
  if (isNaN(expirationDate.getTime())) return null;

  const msLeft = expirationDate.getTime() - now;
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
  const isExpired = msLeft <= 0 && !isActive;
  const isCritical = daysLeft <= 3 && !isExpired;

  const formattedDate = expirationDate.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] leading-none whitespace-nowrap overflow-hidden transition-colors select-none",
        isExpired
          ? "text-destructive font-medium"
          : isCritical
            ? "text-amber-600 dark:text-amber-400 font-medium"
            : "text-muted-foreground",
        className,
      )}
      title={`Vencimento: ${formattedDate} (${isExpired ? "Expirado" : `${daysLeft} dias restantes`})`}
    >
      {showIcon && (
        isExpired ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : isCritical ? (
          <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500 animate-pulse" />
        ) : (
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
        )
      )}

      {isExpired ? (
        <span className="truncate whitespace-nowrap">
          Plano expirado • Venceu em: <span className="font-semibold">{formattedDate}</span>
        </span>
      ) : (
        <span className="truncate whitespace-nowrap">
          Plano vence em: <span className="font-medium text-foreground/90">{formattedDate}</span>
          <span className="mx-1 text-muted-foreground/60">•</span>
          <span className={cn(isCritical && "font-semibold text-amber-600 dark:text-amber-400")}>
            {daysLeft} {daysLeft === 1 ? "dia restante" : "dias restantes"}
          </span>
        </span>
      )}
    </div>
  );
}
