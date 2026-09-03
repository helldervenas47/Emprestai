import { CheckCircle2, TrendingDown } from "lucide-react";

interface AmortizationResultCardProps {
  oldPrincipal: number;
  newPrincipal: number;
  oldInterest: number;
  newInterest: number;
  oldRemaining: number;
  newRemaining: number;
  oldInstallment: number;
  newInstallment: number;
  interestSaved: number;
  amortizationValue: number;
  remainingInstallments: number;
  formatCurrency: (value: number) => string;
}

export function AmortizationResultCard({
  oldPrincipal,
  newPrincipal,
  oldInterest,
  newInterest,
  oldRemaining,
  newRemaining,
  oldInstallment,
  newInstallment,
  interestSaved,
  amortizationValue,
  remainingInstallments,
  formatCurrency,
}: AmortizationResultCardProps) {
  const willClose = newPrincipal <= 0;
  const pctReduction = oldPrincipal > 0 ? (amortizationValue / oldPrincipal) * 100 : 0;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="bg-primary/5 px-3 py-2 border-b border-border">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5 text-primary" />
          Resultado da amortização
        </p>
      </div>

      <div className="p-3 space-y-2.5">
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Principal</p>
            <p className="line-through text-muted-foreground tabular-nums">{formatCurrency(oldPrincipal)}</p>
            <p className="font-semibold text-primary tabular-nums">{formatCurrency(newPrincipal)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Juros total</p>
            <p className="line-through text-muted-foreground tabular-nums">{formatCurrency(oldInterest)}</p>
            <p className="font-semibold text-primary tabular-nums">{formatCurrency(newInterest)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Restante</p>
            <p className="line-through text-muted-foreground tabular-nums">{formatCurrency(oldRemaining)}</p>
            <p className="font-semibold text-primary tabular-nums">{formatCurrency(newRemaining)}</p>
          </div>
        </div>

        <div className="border-t border-border/50 pt-2 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Valor amortizado</span>
            <span className="font-semibold text-foreground tabular-nums">
              {formatCurrency(amortizationValue)}{" "}
              <span className="text-[10px] text-muted-foreground">({pctReduction.toFixed(1)}%)</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Juros economizados</span>
            <span className="font-semibold text-success tabular-nums">{formatCurrency(interestSaved)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Parcela estimada ({remainingInstallments}x)</span>
            <span className="tabular-nums">
              <span className="line-through text-muted-foreground mr-1.5">{formatCurrency(oldInstallment)}</span>
              <span className="font-semibold text-primary">{formatCurrency(newInstallment)}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="bg-muted/30 px-3 py-2 border-t border-border">
        <p className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-success" />
          Após confirmação
        </p>
        <ul className="text-[10.5px] text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Saldo devedor reduzido em {formatCurrency(amortizationValue)}</li>
          <li>Juros futuros recalculados proporcionalmente</li>
          <li>Parcelas restantes ajustadas automaticamente</li>
          {willClose && <li className="text-success">Contrato será quitado integralmente</li>}
        </ul>
      </div>
    </div>
  );
}
