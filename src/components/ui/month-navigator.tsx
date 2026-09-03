// Navegador de mês padrão do app: setas laterais para avançar/retroceder e
// clique no rótulo central para voltar ao mês atual.
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { todayInAppTz } from "@/lib/timezone";

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y || 1970, (m || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y || 1970, (m || 1) - 1, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface MonthNavigatorProps {
  /** Mês no formato "YYYY-MM". */
  value: string;
  onChange: (ym: string) => void;
  className?: string;
  labelClassName?: string;
}

export function MonthNavigator({ value, onChange, className, labelClassName }: MonthNavigatorProps) {
  const currentMonth = todayInAppTz().slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(value) ? value : currentMonth;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-full"
        aria-label="Mês anterior"
        onClick={() => onChange(shiftMonth(ym, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        className={cn("h-9 flex-1 min-w-0 justify-center rounded-full text-xs font-semibold capitalize", labelClassName)}
        title="Voltar para o mês atual"
        onClick={() => onChange(currentMonth)}
      >
        {formatMonthLabel(ym)}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-full"
        aria-label="Próximo mês"
        onClick={() => onChange(shiftMonth(ym, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
