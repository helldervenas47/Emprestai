import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeDatePicker } from "@/components/ui/native-date-picker";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Loan } from "@/types/loan";

interface MethodOpt {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  amount: string;
  onAmountChange: (s: string) => void;
  date: Date;
  onDateChange: (d: Date) => void;
  methods: MethodOpt[];
  selectedMethodId: string;
  onSelectedMethodChange: (s: string) => void;
  onConfirm: () => void;
  formatCurrency: (v: number) => string;
  // Computed from the loan card scope
  totalContract: number; // total esperado do contrato (com juros)
  totalPaid: number; // total recebido até agora
  baseRemaining: number; // saldo (principal + juros restantes), sem encargos
  remainingWithFees: number; // baseRemaining + lateFees
  paidInstallments: number;
  totalInstallments: number;
  nextDueDateLabel: string | null;
  interestRate: number;
  interestPendingCycle: number; // juros do ciclo pendentes
  lateInterestTotal: number;
  penaltyTotal: number;
  daysOverdue: number;
}

export function PartialPaymentDialog({
  open,
  onOpenChange,
  loan,
  amount,
  onAmountChange,
  date,
  onDateChange,
  methods,
  selectedMethodId,
  onSelectedMethodChange,
  onConfirm,
  formatCurrency,
  totalContract,
  totalPaid,
  baseRemaining,
  remainingWithFees,
  paidInstallments,
  totalInstallments,
  nextDueDateLabel,
  interestRate,
  interestPendingCycle,
  lateInterestTotal,
  penaltyTotal,
  daysOverdue,
}: Props) {
  const pendingInstallments = Math.max(0, totalInstallments - paidInstallments);
  const totalFees = lateInterestTotal + penaltyTotal;

  const sim = useMemo(() => {
    const val = parseFloat(amount.replace(",", ".")) || 0;
    if (val <= 0) {
      return {
        val: 0,
        toFees: 0,
        toInterest: 0,
        toPrincipal: 0,
        newRemaining: remainingWithFees,
        situation: "—",
      };
    }
    // Ordem assumida de abatimento (espelha a lógica do card):
    // 1) encargos de atraso (multa + juros de mora)
    // 2) juros do ciclo pendentes
    // 3) principal
    const toFees = Math.min(val, totalFees);
    const afterFees = val - toFees;
    const toInterest = Math.min(afterFees, Math.max(0, interestPendingCycle));
    const toPrincipal = Math.max(0, afterFees - toInterest);
    const newRemaining = Math.max(0, remainingWithFees - val);
    const situation =
      newRemaining <= 0.005
        ? "Contrato será quitado"
        : pendingInstallments > 0
        ? "Em andamento (saldo atualizado)"
        : "Saldo residual atualizado";
    return { val, toFees, toInterest, toPrincipal, newRemaining, situation };
  }, [amount, totalFees, interestPendingCycle, remainingWithFees, pendingInstallments]);

  const canConfirm =
    sim.val > 0 && (methods.length === 0 || !!selectedMethodId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        style={{ padding: 0 }}
        className={cn(
          "left-1 right-1 top-1 bottom-1 h-auto w-auto max-w-none translate-x-0 translate-y-0 flex flex-col overflow-hidden p-0",
          "sm:left-[50%] sm:right-auto sm:top-[50%] sm:bottom-auto sm:h-auto sm:max-h-[88svh] sm:w-full sm:max-w-[640px] sm:translate-x-[-50%] sm:translate-y-[-50%]",
          // Open animation: slide-up on mobile, zoom-in on desktop
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-300 data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)]",
          "data-[state=open]:slide-in-from-bottom-10 sm:data-[state=open]:zoom-in-98 sm:data-[state=open]:slide-in-from-bottom-0",
          // Close animation: slide-down on mobile, zoom-out on desktop
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-200 data-[state=closed]:[animation-timing-function:cubic-bezier(0.4,0,1,1)]",
          "data-[state=closed]:slide-out-to-bottom-10 sm:data-[state=closed]:zoom-out-98 sm:data-[state=closed]:slide-out-to-bottom-0",
        )}
      >
        <DialogHeader className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-5">
          <DialogTitle className="text-base sm:text-lg">
            Pagamento Parcial
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Receba um valor parcial e veja em tempo real como ele será abatido
            do contrato.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] px-4 pb-3 sm:px-6 sm:pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Coluna esquerda — Resumo do contrato */}
            <section className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">
                Resumo do contrato
              </p>
              <Row label="Valor emprestado" value={formatCurrency(loan.amount)} />
              <Row label="Valor já recebido" value={formatCurrency(totalPaid)} success />
              <Row
                label="Saldo restante"
                value={formatCurrency(remainingWithFees)}
                strong
              />
              <Row
                label="Parcelas pagas"
                value={`${paidInstallments} / ${totalInstallments}`}
              />
              <Row
                label="Parcelas pendentes"
                value={String(pendingInstallments)}
              />
              {nextDueDateLabel && (
                <Row label="Próximo vencimento" value={nextDueDateLabel} />
              )}
              <Row
                label="Taxa de juros"
                value={`${interestRate.toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                })}%`}
              />
              {daysOverdue > 0 && (
                <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                  <p className="text-[11px] font-semibold text-warning">
                    Em atraso
                  </p>
                  <Row
                    label="Dias em atraso"
                    value={`${daysOverdue}d`}
                    muted
                  />
                  {penaltyTotal > 0 && (
                    <Row
                      label="Multa acumulada"
                      value={formatCurrency(penaltyTotal)}
                      muted
                    />
                  )}
                  {lateInterestTotal > 0 && (
                    <Row
                      label="Juros de atraso"
                      value={formatCurrency(lateInterestTotal)}
                      muted
                    />
                  )}
                  <Row
                    label="Total atualizado"
                    value={formatCurrency(remainingWithFees)}
                    strong
                  />
                </div>
              )}
            </section>

            {/* Coluna direita — Operação */}
            <section className="space-y-3">
              <div>
                <Label htmlFor="partial-payment-amount" className="text-sm">Valor recebido (R$)</Label>
                <Input
                  id="partial-payment-amount"
                  type="number"
                  step="0.01"
                  placeholder="Ex: 150,00"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                  className="h-10 text-sm mt-1"
                />
              </div>

              {methods.length > 0 && (
                <div>
                  <Label className="text-sm">Forma de pagamento</Label>
                  <Select
                    value={selectedMethodId}
                    onValueChange={onSelectedMethodChange}
                  >
                    <SelectTrigger className="h-10 text-sm mt-1">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-sm">Data do pagamento</Label>
                <div className="mt-1">
                  <NativeDatePicker
                    value={date ? format(date, "yyyy-MM-dd") : ""}
                    onChange={(v) => { if (v) onDateChange(new Date(`${v}T00:00:00`)); }}
                  />
                </div>
              </div>

              {/* Card de simulação */}
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-primary">
                  Resultado da operação
                </p>
                <Row
                  label="Valor recebido"
                  value={formatCurrency(sim.val)}
                  strong
                />
                {totalFees > 0 && (
                  <Row
                    label="Abatimento em encargos"
                    value={formatCurrency(sim.toFees)}
                    muted
                  />
                )}
                <Row
                  label="Abatimento em juros"
                  value={formatCurrency(sim.toInterest)}
                  muted
                />
                <Row
                  label="Abatimento em principal"
                  value={formatCurrency(sim.toPrincipal)}
                  muted
                />
                <div className="mt-1 pt-1 border-t border-primary/20">
                  <Row
                    label="Saldo após operação"
                    value={formatCurrency(sim.newRemaining)}
                    strong
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Situação: <span className="font-medium text-foreground">{sim.situation}</span>
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row gap-2 border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5 sm:pt-3">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            className="flex-[2] sm:flex-none sm:h-11 gap-2"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            <CheckCircle2 className="h-4 w-4" /> Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  success,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  success?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className={muted ? "text-muted-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        className={
          "tabular-nums " +
          (strong
            ? "text-foreground font-semibold"
            : success
            ? "text-success font-semibold"
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
