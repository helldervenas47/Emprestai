interface Props {
  principalRemaining: number;
  interestPending: number;
  penaltyTotal: number;
  lateInterestTotal: number;
  renegPenaltyPending: number;
  totalContract: number; // saldo total do contrato (com encargos)
  formatCurrency: (v: number) => string;
}

/**
 * Composição exibida na coluna esquerda do modal Quitar Contrato.
 * Apenas exibe — não altera nenhuma regra de cálculo.
 */
export function PayoffCompositionCard({
  principalRemaining,
  interestPending,
  penaltyTotal,
  lateInterestTotal,
  renegPenaltyPending,
  totalContract,
  formatCurrency,
}: Props) {
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2 w-full">
      <p className="text-[10px] uppercase tracking-wide text-primary font-semibold">
        Valor total do contrato
      </p>
      <p className="text-2xl font-bold text-primary tabular-nums">
        {formatCurrency(totalContract)}
      </p>
      <div className="pt-2 border-t border-primary/20 space-y-1 text-[11px]">
        <Row label="Saldo principal" value={formatCurrency(principalRemaining)} />
        <Row label="Juros restantes" value={formatCurrency(interestPending)} />
        {penaltyTotal > 0 && (
          <Row label="Multa" value={formatCurrency(penaltyTotal)} warn />
        )}
        {lateInterestTotal > 0 && (
          <Row label="Juros de atraso" value={formatCurrency(lateInterestTotal)} warn />
        )}
        {renegPenaltyPending > 0 && (
          <Row label="Multa de renegociação" value={formatCurrency(renegPenaltyPending)} warn />
        )}
      </div>
    </div>
  );
}

interface SimProps {
  inputAmount: string;
  totalContract: number;
  formatCurrency: (v: number) => string;
}

/**
 * Card de simulação do Quitar Contrato — exibido logo após o input.
 * Mostra desconto concedido, percentual, diferença e o aviso quando há
 * acordo de quitação antecipada.
 */
export function PayoffSimulationCard({
  inputAmount,
  totalContract,
  formatCurrency,
}: SimProps) {
  const raw = parseFloat((inputAmount || "").replace(",", "."));
  const val = isFinite(raw) && raw > 0 ? raw : 0;
  if (val <= 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
        Informe o valor da quitação para ver o resultado.
      </div>
    );
  }

  const discount = Math.max(0, totalContract - val);
  const surplus = Math.max(0, val - totalContract);
  const discountPct = totalContract > 0 ? (discount / totalContract) * 100 : 0;
  const isAgreement = discount > 0.005;
  const isSurplus = surplus > 0.005;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-1.5 text-[11px]">
      <p className="text-[10px] uppercase tracking-wide text-primary font-semibold">
        Resultado da quitação
      </p>
      <Row label="Saldo total" value={formatCurrency(totalContract)} />
      <Row label="Valor da quitação" value={formatCurrency(val)} strong />
      {isAgreement && (
        <>
          <Row label="Desconto concedido" value={formatCurrency(discount)} warn />
          <Row
            label="Percentual de desconto"
            value={`${discountPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}
            warn
          />
        </>
      )}
      {isSurplus && (
        <Row label="Valor acima do saldo" value={formatCurrency(surplus)} warn />
      )}
      <div className="pt-1 mt-1 border-t border-primary/20">
        <Row label="Valor efetivamente recebido" value={formatCurrency(val)} strong />
      </div>
      {isAgreement && (
        <p className="text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-md p-2 mt-1">
          Este contrato será encerrado mediante acordo de quitação antecipada.
        </p>
      )}
      <div className="pt-1 mt-1 border-t border-primary/20 space-y-1">
        <p className="text-[10px] uppercase tracking-wide text-success font-semibold">
          Após confirmação
        </p>
        <Item text="Contrato marcado como quitado" />
        <Item text="Parcelas futuras encerradas" />
        <Item text="Saldo zerado" />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  warn,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          "tabular-nums " +
          (warn
            ? "text-warning"
            : strong
            ? "text-foreground font-semibold"
            : "text-foreground")
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
