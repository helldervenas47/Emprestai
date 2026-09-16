import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type Period, periodLabels } from "@/features/dashboard/components/dashboard/dashboardHelpers";

interface Props {
  rangeLabel: string;
  period: Period;
  offset: number;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onChangePeriod: (p: Period) => void;
}

export function DashboardPeriodFilter({ rangeLabel, period, onPrev, onNext, onReset, onChangePeriod }: Props) {
  return (
    <div className="w-full flex items-center justify-between gap-2 sm:gap-3 flex-nowrap">
      {/* Navegador de Data (Esquerda) */}
      <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground shrink-0"
          onClick={onPrev}
          aria-label="Período anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={onReset}
          title="Voltar para o período atual"
          className="h-8 sm:h-9 min-w-[100px] sm:min-w-[150px] px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-semibold text-foreground text-center hover:text-primary hover:bg-muted/40 transition-colors tabular-nums"
        >
          {rangeLabel}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground shrink-0"
          onClick={onNext}
          aria-label="Próximo período"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Seletor Dia | Semana | Mês (Direita) */}
      <div className="grid grid-cols-3 w-[160px] sm:w-[210px] shrink-0 rounded-2xl bg-muted/50 p-1 gap-0.5 border border-border/40">
        {(["day", "week", "month"] as Period[]).map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => onChangePeriod(p)}
            className={`flex items-center justify-center px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs sm:text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
              period === p
                ? "bg-background text-primary shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>
    </div>
  );
}
