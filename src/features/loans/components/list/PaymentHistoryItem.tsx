// Shared helper component used by LoanRowView and LoanCardView.
import { useState } from "react";
import { Payment } from "@/types/loan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";

export function PaymentHistoryItem({
  payment, formatCurrency, onDelete, readOnly,
}: {
  payment: Payment;
  formatCurrency: (v: number) => string;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isAmortization = payment.installmentNumber === -3;
  const meta = payment.metadata || {};

  const badgeLabel = payment.installmentNumber > 0
    ? `Parcela ${payment.installmentNumber}`
    : payment.installmentNumber === 0 ? "Juros"
    : payment.installmentNumber === -3 ? "Amortização"
    : "Parcial";
  const badgeClass = payment.installmentNumber > 0
    ? "bg-success/10 text-success border-success/20"
    : payment.installmentNumber === 0 ? "bg-purple/10 text-purple border-purple/20"
    : payment.installmentNumber === -3 ? "bg-primary/10 text-primary border-primary/20"
    : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30">
      <div className="flex items-center justify-between p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${badgeClass}`}>{badgeLabel}</Badge>
            <span className="text-xs text-muted-foreground">{new Date(payment.date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
          </div>
          <p className="text-sm font-bold text-foreground mt-1">{formatCurrency(payment.amount)}</p>
        </div>
        <div className="flex items-center gap-1">
          {isAmortization && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Ocultar detalhes" : "Ver detalhes"}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          )}
          {!readOnly && onDelete && (
            <Button data-mutation size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onDelete(payment.id)} title="Excluir pagamento">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {isAmortization && expanded && (
        <div className="border-t border-border/50 px-3 py-2.5 space-y-1 text-[11px] bg-background/40">
          {meta.old_principal != null && meta.new_principal != null && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Saldo devedor antes</span><span className="tabular-nums">{formatCurrency(Number(meta.old_principal))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Novo saldo devedor</span><span className="font-semibold text-primary tabular-nums">{formatCurrency(Number(meta.new_principal))}</span></div>
            </>
          )}
          {meta.old_interest_total != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Juros antes</span><span className="tabular-nums">{formatCurrency(Number(meta.old_interest_total))}</span></div>
          )}
          {meta.new_interest_total != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Juros depois</span><span className="tabular-nums">{formatCurrency(Number(meta.new_interest_total))}</span></div>
          )}
          {meta.interest_saved != null && Number(meta.interest_saved) > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Juros economizados</span><span className="font-semibold text-success tabular-nums">{formatCurrency(Number(meta.interest_saved))}</span></div>
          )}
          {meta.new_remaining != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Restante a receber</span><span className="tabular-nums">{formatCurrency(Number(meta.new_remaining))}</span></div>
          )}
          {meta.interest_rate != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Taxa de juros</span><span className="tabular-nums">{Number(meta.interest_rate)}%</span></div>
          )}
          {meta.old_principal == null && (
            <p className="text-muted-foreground italic">Detalhes desta amortização não foram registrados.</p>
          )}
        </div>
      )}
    </div>
  );
}
