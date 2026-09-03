import { cn } from "@/lib/utils";
import type { LoanSummaryPresentation } from "@/features/loans/lib/loanOutstanding";

interface Props {
  presentation: LoanSummaryPresentation;
  formatCurrency: (v: number) => string;
}

/**
 * Renderização ÚNICA do resumo financeiro do contrato (abas Total e Quitar).
 * Somente apresentação: as linhas somáveis fecham exatamente com o total, e os
 * juros do ciclo atual aparecem apenas como detalhe dos juros restantes.
 */
export function LoanSummaryComposition({ presentation, formatCurrency }: Props) {
  return (
    <>
      {presentation.context.map((l) => (
        <Line key={l.key} label={l.label} value={formatCurrency(l.value)} muted />
      ))}

      <div className="border-t border-border/60 pt-1.5 mt-1.5 space-y-1.5">
        {presentation.lines.map((l) => (
          <Line
            key={l.key}
            label={l.detail ? `• ${l.label}` : l.label}
            value={formatCurrency(l.value)}
            detail={l.detail}
            warn={l.emphasis === "warn"}
            muted={l.emphasis === "muted"}
          />
        ))}
      </div>

      <div className="border-t border-border/60 pt-1.5 mt-1.5">
        <Line label={presentation.totalLabel} value={formatCurrency(presentation.total)} strong />
      </div>

      {presentation.notes.length > 0 && (
        <div className="border-t border-dashed border-border/60 pt-1.5 mt-1.5 space-y-1">
          {presentation.notes.map((n) => (
            <Line key={n.key} label={n.label} value={formatCurrency(n.value)} muted />
          ))}
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            Não somado ao total: cobrança do ciclo corrente, calculada sobre o valor emprestado.
          </p>
        </div>
      )}
    </>
  );
}


function Line({
  label,
  value,
  strong,
  muted,
  warn,
  detail,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  warn?: boolean;
  detail?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2 text-xs", detail && "pl-3")}>
      <span className={cn("truncate", detail ? "text-muted-foreground/80 text-[11px]" : "text-muted-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums shrink-0",
          warn ? "text-warning" : strong ? "text-foreground font-semibold" : muted ? "text-foreground/80" : "text-foreground",
          detail && "text-[11px] text-muted-foreground/80",
        )}
      >
        {value}
      </span>
    </div>
  );
}
