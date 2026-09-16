import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Info, Calendar } from "lucide-react";
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
    <div className="dash-card rounded-2xl border border-border/70 p-3 sm:p-3.5 shadow-xs w-full transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
        {/* Lado Esquerdo: Título & Navegação de Período */}
        <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Calendar className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-foreground leading-tight">Visão Geral</h2>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Como funciona o Dashboard"
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
                >
                  <Info className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="w-80 text-sm leading-relaxed z-50">
                <p className="font-semibold text-foreground mb-1">Como funciona o Dashboard</p>
                <div className="text-muted-foreground space-y-2 text-xs">
                  <p>
                    O Dashboard mostra a situação financeira do período selecionado (dia, semana ou mês). Use as setas para navegar entre períodos.
                  </p>
                  <p>
                    Os cards principais são calculados a partir dos pagamentos, empréstimos, despesas e vendas do período:
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      <strong>Saldo em Conta:</strong> saldo atual + projeções de fluxo do período.
                    </li>
                    <li>
                      <strong>Valores Recebidos:</strong> total recebido no período por forma de pagamento.
                    </li>
                    <li>
                      <strong>Taxa de Juros Mensal:</strong> relação juros/capital dos contratos ativos.
                    </li>
                    <li>
                      <strong>Juros Recebidos:</strong> lucro realizado + lucros previstos no período.
                    </li>
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Navegador de Data com setas */}
          <div className="flex items-center gap-0.5 sm:gap-1 bg-muted/40 p-0.5 rounded-xl border border-border/40">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg hover:bg-background"
              onClick={onPrev}
              aria-label="Período anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <button
              type="button"
              onClick={onReset}
              title="Voltar para o período atual"
              className="h-7 sm:h-8 min-w-[90px] sm:min-w-[130px] px-2 rounded-lg text-xs sm:text-xs font-semibold text-foreground text-center hover:text-primary transition-colors tabular-nums"
            >
              {rangeLabel}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg hover:bg-background"
              onClick={onNext}
              aria-label="Próximo período"
            >
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>

        {/* Lado Direito: Seletor Dia | Semana | Mês */}
        <div className="grid grid-cols-3 w-full sm:w-[210px] shrink-0 rounded-xl bg-muted/50 p-1 gap-0.5 border border-border/40">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => onChangePeriod(p)}
              className={`flex items-center justify-center px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
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
    </div>
  );
}
