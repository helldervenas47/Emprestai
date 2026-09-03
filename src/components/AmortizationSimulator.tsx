import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Calculator, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Loan, Payment } from "@/types/loan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { NativeDatePicker } from "@/components/ui/native-date-picker";

function rawFormatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

interface Scenario {
  id: string;
  amount: string;
  date: Date;
}

interface SimulationResult {
  valid: boolean;
  reason?: string;
  oldPrincipal: number;
  newPrincipal: number;
  oldInterest: number;
  newInterest: number;
  interestSaved: number;
  oldRemaining: number;
  newRemaining: number;
  oldInstallment: number;
  newInstallment: number;
  amortAmount: number;
}

function newScenario(amount = "", date = new Date()): Scenario {
  return { id: crypto.randomUUID(), amount, date };
}

function computeScenario(loan: Loan, payments: Payment[], amount: string, date: Date): SimulationResult {
  const rate = Number(loan.interestRate) || 0;
  const oldPrincipal = Number(loan.amount) || 0;
  const oldInterest = loan.customInterestValue != null && loan.customInterestValue > 0
    ? Number(loan.customInterestValue)
    : oldPrincipal * (rate / 100);
  const oldTotal = oldPrincipal + oldInterest;
  const paidPrincipalAndInstallments = payments
    .filter((p) => p.loanId === loan.id && p.installmentNumber !== 0 && p.installmentNumber !== -2)
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const oldRemaining = Math.max(0, oldTotal - paidPrincipalAndInstallments);
  const remainingInst = Math.max(1, loan.installments - loan.paidInstallments);
  const oldInstallment = oldRemaining / remainingInst;

  const v = parseFloat(String(amount).replace(",", "."));
  const baseResult: SimulationResult = {
    valid: false,
    oldPrincipal, newPrincipal: oldPrincipal,
    oldInterest, newInterest: oldInterest,
    interestSaved: 0,
    oldRemaining, newRemaining: oldRemaining,
    oldInstallment, newInstallment: oldInstallment,
    amortAmount: 0,
  };

  if (loan.status === "paid") {
    return { ...baseResult, reason: "Contrato já está quitado" };
  }
  if (!isFinite(v) || v <= 0) {
    return { ...baseResult, reason: "Informe um valor válido" };
  }
  if (v > oldPrincipal) {
    return { ...baseResult, reason: "Valor maior que o saldo principal" };
  }
  const dateStr = date.toISOString().split("T")[0];
  if (loan.startDate && dateStr < loan.startDate) {
    return { ...baseResult, reason: "Data anterior ao início do contrato" };
  }
  if (loan.dueDate && dateStr > loan.dueDate) {
    return { ...baseResult, reason: "Data posterior ao vencimento do contrato" };
  }

  const newPrincipal = Math.max(0, oldPrincipal - v);
  const newCustomInterest = loan.customInterestValue != null && loan.customInterestValue > 0 && oldPrincipal > 0
    ? loan.customInterestValue * (newPrincipal / oldPrincipal)
    : null;
  const newInterest = newCustomInterest != null ? newCustomInterest : newPrincipal * (rate / 100);
  const newTotal = newPrincipal + newInterest;
  const newRemaining = Math.max(0, newTotal - paidPrincipalAndInstallments);
  const newInstallment = newRemaining / remainingInst;
  const interestSaved = Math.max(0, oldInterest - newInterest);

  return {
    ...baseResult,
    valid: true,
    newPrincipal, newInterest, interestSaved, newRemaining, newInstallment,
    amortAmount: v,
  };
}

interface Props {
  loan: Loan;
  payments: Payment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: when provided, allows turning a simulated scenario into a real amortization */
  onApply?: (amount: number, date: string) => Promise<void> | void;
}

export function AmortizationSimulator({ loan, payments, open, onOpenChange, onApply }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>([newScenario()]);

  const results = useMemo(
    () => scenarios.map((s) => ({ scenario: s, result: computeScenario(loan, payments, s.amount, s.date) })),
    [scenarios, loan, payments]
  );

  const addScenario = () => setScenarios((prev) => [...prev, newScenario()]);
  const removeScenario = (id: string) => setScenarios((prev) => prev.length > 1 ? prev.filter((s) => s.id !== id) : prev);
  const updateScenario = (id: string, patch: Partial<Scenario>) => {
    setScenarios((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  };
  const reset = () => setScenarios([newScenario()]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Simulação de Amortização
          </DialogTitle>
          <DialogDescription>
            Teste valores e datas diferentes e compare o impacto. Nenhuma alteração é salva.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
            <p className="font-medium text-foreground">{loan.borrowerName}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              <span>Saldo principal: <span className="text-foreground font-semibold tabular-nums">{rawFormatCurrency(Number(loan.amount) || 0)}</span></span>
              <span>Juros: <span className="text-foreground tabular-nums">{Number(loan.interestRate) || 0}%</span></span>
              <span>Parcelas: <span className="text-foreground tabular-nums">{loan.paidInstallments}/{loan.installments}</span></span>
            </div>
          </div>

          <div className="space-y-3">
            {results.map(({ scenario, result }, idx) => (
              <div key={scenario.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px]">Cenário {idx + 1}</Badge>
                  {scenarios.length > 1 && (
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:bg-destructive/10"
                      onClick={() => removeScenario(scenario.id)} title="Remover cenário"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Valor da amortização (R$)</Label>
                    <Input
                      type="number" step="0.01" min="0" inputMode="decimal"
                      value={scenario.amount}
                      onChange={(e) => updateScenario(scenario.id, { amount: e.target.value })}
                      placeholder="Ex: 500.00"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Data</Label>
                    <NativeDatePicker
                      value={format(scenario.date, "yyyy-MM-dd")}
                      onChange={(v) => { if (v) updateScenario(scenario.id, { date: new Date(`${v}T00:00:00`) }); }}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {!result.valid && (
                  <p className="text-[11px] text-destructive">{result.reason}</p>
                )}

                {result.valid && (
                  <div className="rounded-md bg-muted/40 p-2.5 text-[11px] space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-muted-foreground">Principal</p>
                        <p className="line-through text-muted-foreground tabular-nums">{rawFormatCurrency(result.oldPrincipal)}</p>
                        <p className="font-semibold text-primary tabular-nums">{rawFormatCurrency(result.newPrincipal)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Juros total</p>
                        <p className="line-through text-muted-foreground tabular-nums">{rawFormatCurrency(result.oldInterest)}</p>
                        <p className="font-semibold text-primary tabular-nums">{rawFormatCurrency(result.newInterest)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Restante</p>
                        <p className="line-through text-muted-foreground tabular-nums">{rawFormatCurrency(result.oldRemaining)}</p>
                        <p className="font-semibold text-primary tabular-nums">{rawFormatCurrency(result.newRemaining)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/40 pt-2">
                      <span className="text-muted-foreground">Juros economizados</span>
                      <span className="font-semibold text-success tabular-nums">{rawFormatCurrency(result.interestSaved)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Parcela estimada</span>
                      <span className="tabular-nums">
                        <span className="line-through text-muted-foreground mr-2">{rawFormatCurrency(result.oldInstallment)}</span>
                        <span className="font-semibold text-primary">{rawFormatCurrency(result.newInstallment)}</span>
                      </span>
                    </div>
                    {onApply && (
                      <div className="pt-1 flex justify-end">
                        <Button
                          size="sm" variant="secondary" className="h-7 text-[11px]"
                          onClick={async () => {
                            const dateStr = scenario.date.toISOString().split("T")[0];
                            await onApply(result.amortAmount, dateStr);
                            onOpenChange(false);
                          }}
                        >
                          Aplicar este cenário
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={addScenario}>
              <Plus className="h-3.5 w-3.5" /> Adicionar cenário
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> Limpar
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
