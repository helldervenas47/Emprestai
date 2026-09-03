interface Props {
  baseInterest: number;
  penaltyTotal: number;
  lateInterestTotal: number;
  renegPenaltyPending: number;
  includeFeesNow: boolean;
  pending: number;
  partialEnabled: boolean;
  partialVal: number;
  willClose: boolean;
  dueStr: string;
  nextDateStr: string;
  principalAmount: number;
  formatCurrency: (v: number) => string;
}

/**
 * Card "Resultado da operação" para o modal Pagar Juros.
 * Apenas exibe o que será recebido e o estado após o pagamento.
 * Não altera nenhuma regra de cálculo — espelha o que já está
 * computado nas variáveis recebidas via props.
 */
export function InterestResultCard({
  baseInterest,
  penaltyTotal,
  lateInterestTotal,
  renegPenaltyPending,
  includeFeesNow,
  pending,
  partialEnabled,
  partialVal,
  willClose,
  dueStr,
  nextDateStr,
  principalAmount,
  formatCurrency,
}: Props) {
  const amountNow = partialEnabled
    ? Math.min(Math.max(0, partialVal), pending)
    : pending;

  // Distribuição visual: primeiro encargos (se inclusos), depois multa de
  // renegociação e juros do mês. Não é regra de negócio — só visual.
  let remaining = amountNow;
  const feesShare =
    includeFeesNow
      ? Math.min(remaining, lateInterestTotal + penaltyTotal + renegPenaltyPending)
      : 0;
  remaining -= feesShare;
  const interestShare = Math.min(remaining, baseInterest);

  const totalFees = lateInterestTotal + penaltyTotal + renegPenaltyPending;
  const penaltyShare = totalFees > 0 ? (feesShare * penaltyTotal) / totalFees : 0;
  const lateShare = totalFees > 0 ? (feesShare * lateInterestTotal) / totalFees : 0;
  const renegShare = totalFees > 0 ? (feesShare * renegPenaltyPending) / totalFees : 0;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-primary">Resultado da operação</p>

      <div className="space-y-1 text-[11px]">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Recebimento
        </p>
        <Row label="Juros do período" value={formatCurrency(interestShare)} />
        {includeFeesNow && penaltyTotal > 0 && (
          <Row label="Multa" value={formatCurrency(penaltyShare)} muted />
        )}
        {includeFeesNow && lateInterestTotal > 0 && (
          <Row label="Juros de atraso" value={formatCurrency(lateShare)} muted />
        )}
        {includeFeesNow && renegPenaltyPending > 0 && (
          <Row label="Multa de renegociação" value={formatCurrency(renegShare)} muted />
        )}
        <Row
          label="Total a receber agora"
          value={formatCurrency(amountNow)}
          strong
        />
      </div>

      <div className="pt-2 border-t border-primary/20 space-y-1 text-[11px]">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Após pagamento
        </p>
        <Row
          label="Principal"
          value={`${formatCurrency(principalAmount)} (inalterado)`}
        />
        <Row
          label="Novo vencimento"
          value={willClose ? nextDateStr : `${dueStr} (sem alteração)`}
        />
        <Row
          label="Próximo juros previsto"
          value={formatCurrency(baseInterest)}
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          "tabular-nums " +
          (strong
            ? "text-foreground font-semibold"
            : muted
            ? "text-foreground/80"
            : "text-foreground")
        }
      >
        {value}
      </span>
    </div>
  );
}
