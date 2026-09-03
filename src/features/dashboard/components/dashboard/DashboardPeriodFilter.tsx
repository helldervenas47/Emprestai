import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
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
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-lg md:text-xl font-semibold text-foreground leading-tight">Visão Geral</h2>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Como funciona o Dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Info className="h-5 w-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-80 text-sm leading-relaxed">
            <p className="font-semibold text-foreground mb-1">Como funciona o Dashboard</p>
            <div className="text-muted-foreground space-y-2">
              <p>
                O Dashboard mostra a situação financeira do período selecionado (dia, semana ou mês). Use os botões ao lado para navegar entre períodos.
              </p>
              <p>
                Os cards principais são calculados a partir dos pagamentos, empréstimos, despesas e vendas dentro do período:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Saldo em Conta:</strong> saldo informado + projeção de entradas e saídas do período.
                </li>
                <li>
                  <strong>Valores Recebidos:</strong> total dos pagamentos recebidos no período, separados por forma de recebimento.
                </li>
                <li>
                  <strong>Taxa de Juros Mensal:</strong> relação entre os juros a receber e o capital emprestado, considerando apenas os contratos com juros no período.
                </li>
                <li>
                  <strong>Faturamento do Período:</strong> lucro já realizado + lucros pendentes que vencem no período, usando a contabilidade "Juros Primeiro".
                </li>
              </ul>
              <p>
                Clique em cada card para ver o detalhamento. A contabilidade "Juros Primeiro" amortiza os juros pendentes antes de reduzir o principal de cada contrato.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center justify-between gap-2 flex-nowrap md:justify-start md:gap-3">
        <div className="flex items-center gap-1 md:gap-2 md:order-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg"
            onClick={onPrev}
            aria-label="Período anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={onReset}
            title="Voltar para o período atual"
            className="h-9 min-w-[110px] md:min-w-[180px] px-2 md:px-3 rounded-lg text-xs md:text-sm font-medium text-foreground text-center hover:text-primary hover:bg-accent/40 transition-colors tabular-nums"
          >
            {rangeLabel}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg"
            onClick={onNext}
            aria-label="Próximo período"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 w-[170px] md:w-[210px] shrink-0 rounded-xl bg-muted/50 p-1 gap-0.5 md:order-2">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <button type="button"
              key={p}
              onClick={() => onChangePeriod(p)}
              className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                period === p ? "bg-background !text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
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
