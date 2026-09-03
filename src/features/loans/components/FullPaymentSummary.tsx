interface Props {
  // Composição do total a receber
  principalRemaining: number;
  interestPending: number;
  penaltyTotal: number;
  lateInterestTotal: number;
  renegPenaltyPending: number;
  totalFinal: number;
  // Resumo pós-operação
  pendingInstallments: number;
  formatCurrency: (v: number) => string;
}

/**
 * Card "Total para recebimento" do modal Pagamento Total.
 * Apenas exibe — não altera regras de cálculo. Valores chegam prontos do
 * escopo do card (LoanCardView / LoanRowView).
 */
export function FullPaymentSummary({
  principalRemaining,
  interestPending,
  penaltyTotal,
  lateInterestTotal,
  renegPenaltyPending,
  totalFinal,
  pendingInstallments,
  formatCurrency,
}: Props) {
  const hasFees = penaltyTotal + lateInterestTotal + renegPenaltyPending > 0;

  return (
    <div className="space-y-3 w-full">
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-primary font-semibold">
          Total para recebimento
        </p>
        <p className="text-2xl font-bold text-primary tabular-nums">
          {formatCurrency(totalFinal)}
        </p>

        <div className="pt-2 border-t border-primary/20 space-y-1 text-[11px]">
          <Row label="Principal restante" value={formatCurrency(principalRemaining)} />
          <Row label="Juros restantes" value={formatCurrency(interestPending)} />
          {penaltyTotal > 0 && (
            <Row label="Multa" value={formatCurrency(penaltyTotal)} warn />
          )}
          {lateInterestTotal > 0 && (
            <Row label="Juros de atraso" value={formatCurrency(lateInterestTotal)} warn />
          )}
          {renegPenaltyPending > 0 && (
            <Row
              label="Multa de renegociação"
              value={formatCurrency(renegPenaltyPending)}
              warn
            />
          )}
          <div className="flex items-center justify-between gap-2 pt-1 mt-1 border-t border-primary/20">
            <span className="text-muted-foreground text-[11px]">Total final</span>
            <span className="font-semibold text-primary tabular-nums">
              {formatCurrency(totalFinal)}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-success/30 bg-success/5 p-3 space-y-1 text-[11px]">
        <p className="text-[10px] uppercase tracking-wide text-success font-semibold">
          Após pagamento
        </p>
        <Item text="Contrato será marcado como quitado" />
        {pendingInstallments > 0 && (
          <Item text={`${pendingInstallments} parcela${pendingInstallments > 1 ? "s" : ""} futura${pendingInstallments > 1 ? "s" : ""} será${pendingInstallments > 1 ? "ão" : ""} encerrada${pendingInstallments > 1 ? "s" : ""}`} />
        )}
        <Item text="Saldo final será zerado" />
        {hasFees && <Item text="Encargos de atraso serão liquidados" />}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          "tabular-nums " + (warn ? "text-warning" : "text-foreground")
        }
      >
        {value}
      </span>
    </div>
  );
}

function Item({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-success mt-[1px]">✓</span>
      <span className="text-foreground/80">{text}</span>
    </div>
  );
}
