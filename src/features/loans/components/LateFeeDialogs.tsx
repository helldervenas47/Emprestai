import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Percent, DollarSign, AlertTriangle, Trash2, Check, Sparkles } from "lucide-react";
import type { Loan } from "@/types/loan";

interface LateInterestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  baseRemaining: number;
  daysOverdue: number;
  onSave: (type: string | null, value: number | null) => void;
  formatCurrency: (value: number) => string;
}

export function LateInterestDialog({
  open,
  onOpenChange,
  loan,
  baseRemaining,
  daysOverdue,
  onSave,
  formatCurrency,
}: LateInterestDialogProps) {
  const [type, setType] = useState<string>(loan.lateInterestType || "percentage");
  const [valueStr, setValueStr] = useState<string>(
    loan.lateInterestValue != null ? String(loan.lateInterestValue) : ""
  );

  useEffect(() => {
    if (open) {
      setType(loan.lateInterestType || "percentage");
      setValueStr(loan.lateInterestValue != null ? String(loan.lateInterestValue) : "");
    }
  }, [open, loan.lateInterestType, loan.lateInterestValue]);

  const numVal = parseFloat(valueStr.replace(",", ".")) || 0;
  const effectiveDays = Math.max(0, daysOverdue);

  const simulation = useMemo(() => {
    if (numVal <= 0 || effectiveDays <= 0) return { fee: 0, newTotal: baseRemaining };
    let fee = 0;
    if (type === "fixed") {
      fee = numVal * effectiveDays;
    } else {
      fee = baseRemaining * (numVal / 100) * effectiveDays;
    }
    fee = Math.round(fee * 100) / 100;
    return {
      fee,
      newTotal: Math.round((baseRemaining + fee) * 100) / 100,
    };
  }, [numVal, effectiveDays, type, baseRemaining]);

  const handleSave = () => {
    if (numVal > 0) {
      onSave(type, numVal);
    } else {
      onSave(null, null);
    }
    onOpenChange(false);
  };

  const handleRemove = () => {
    onSave(null, null);
    setValueStr("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-5 sm:p-6 rounded-2xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Percent className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold">
                Juros por Atraso
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {loan.borrowerName} • {daysOverdue > 0 ? `${daysOverdue} dias em atraso` : "Sem atraso atual"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tipo de cálculo */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Tipo de Cobrança</Label>
            <div className="grid grid-cols-2 gap-2 bg-muted/50 p-1 rounded-xl border border-border/40">
              <button
                type="button"
                onClick={() => setType("percentage")}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                  type === "percentage"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Percent className="h-3.5 w-3.5" /> % Por dia
              </button>
              <button
                type="button"
                onClick={() => setType("fixed")}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                  type === "fixed"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <DollarSign className="h-3.5 w-3.5" /> R$ Por dia
              </button>
            </div>
          </div>

          {/* Valor */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              {type === "percentage" ? "Taxa Diária (% ao dia)" : "Valor Diário (R$ ao dia)"}
            </Label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                min="0"
                autoFocus
                placeholder={type === "percentage" ? "Ex: 0.5" : "Ex: 5.00"}
                value={valueStr}
                onChange={(e) => setValueStr(e.target.value)}
                className="h-11 text-base font-semibold tabular-nums pr-12 rounded-xl"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                {type === "percentage" ? "% / dia" : "R$ / dia"}
              </span>
            </div>
          </div>

          {/* Simulação em Tempo Real */}
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Simulação de Impacto
              </span>
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-700 dark:text-amber-300">
                {effectiveDays} dias calculados
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <p className="text-[10px] text-muted-foreground">Juros calculados</p>
                <p className="font-bold text-amber-700 dark:text-amber-300 tabular-nums text-sm">
                  + {formatCurrency(simulation.fee)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Novo saldo restante</p>
                <p className="font-bold text-foreground tabular-nums text-sm">
                  {formatCurrency(simulation.newTotal)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 pt-2 border-t border-border/40">
          {loan.lateInterestValue != null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1 h-9 px-2.5 rounded-xl"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs rounded-xl px-3"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              className="h-9 text-xs font-semibold rounded-xl px-4 gap-1.5"
            >
              <Check className="h-3.5 w-3.5" /> Salvar Juros
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PenaltyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  baseRemaining: number;
  onSave: (value: number | null) => void;
  formatCurrency: (value: number) => string;
}

export function PenaltyDialog({
  open,
  onOpenChange,
  loan,
  baseRemaining,
  onSave,
  formatCurrency,
}: PenaltyDialogProps) {
  const [valueStr, setValueStr] = useState<string>(
    loan.penaltyValue != null ? String(loan.penaltyValue) : ""
  );

  useEffect(() => {
    if (open) {
      setValueStr(loan.penaltyValue != null ? String(loan.penaltyValue) : "");
    }
  }, [open, loan.penaltyValue]);

  const numVal = parseFloat(valueStr.replace(",", ".")) || 0;
  const newTotal = Math.round((baseRemaining + numVal) * 100) / 100;

  const handleSave = () => {
    if (numVal > 0) {
      onSave(numVal);
    } else {
      onSave(null);
    }
    onOpenChange(false);
  };

  const handleRemove = () => {
    onSave(null);
    setValueStr("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-5 sm:p-6 rounded-2xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold">
                Multa por Parcela / Atraso
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {loan.borrowerName} • Valor fixo aplicado ao contrato
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Valor */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              Valor da Multa Fixa (R$)
            </Label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                min="0"
                autoFocus
                placeholder="Ex: 50.00"
                value={valueStr}
                onChange={(e) => setValueStr(e.target.value)}
                className="h-11 text-base font-semibold tabular-nums pl-9 rounded-xl"
              />
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                R$
              </span>
            </div>
          </div>

          {/* Simulação em Tempo Real */}
          <div className="rounded-xl bg-destructive/10 border border-destructive/25 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Simulação de Impacto
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <p className="text-[10px] text-muted-foreground">Multa fixa adicionada</p>
                <p className="font-bold text-destructive tabular-nums text-sm">
                  + {formatCurrency(numVal)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Novo saldo restante</p>
                <p className="font-bold text-foreground tabular-nums text-sm">
                  {formatCurrency(newTotal)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 pt-2 border-t border-border/40">
          {loan.penaltyValue != null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1 h-9 px-2.5 rounded-xl"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs rounded-xl px-3"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              className="h-9 text-xs font-semibold rounded-xl px-4 gap-1.5"
            >
              <Check className="h-3.5 w-3.5" /> Salvar Multa
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
