import { useState, useEffect, useRef, useMemo } from "react";
import { Receipt, Pencil, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardName: string;
  cycleLabel: string;
  initialAmount?: number;
  initialNotes?: string | null;
  /** Optional: shown for real-time feedback while editing */
  creditLimit?: number;
  /** Sum of transactions in the current cycle (excluding the opening) */
  transactionsTotal?: number;
  onSave: (amount: number, notes: string) => Promise<void> | void;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CreditCardOpeningDialog({
  open,
  onOpenChange,
  cardName,
  cycleLabel,
  initialAmount,
  initialNotes,
  creditLimit = 0,
  transactionsTotal = 0,
  onSave,
}: Props) {
  const [amountStr, setAmountStr] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isEditing = !!initialAmount && initialAmount > 0;

  useEffect(() => {
    if (open) {
      setAmountStr(initialAmount && initialAmount > 0 ? String(initialAmount).replace(".", ",") : "");
      setNotes(initialNotes ?? "");
      // Regra global: NÃO focar automaticamente para não abrir o teclado em mobile.
    }
  }, [open, initialAmount, initialNotes]);


  const parsedAmount = useMemo(() => {
    const v = parseFloat(amountStr.replace(/\./g, "").replace(",", "."));
    return isNaN(v) || v < 0 ? 0 : v;
  }, [amountStr]);

  const newTotal = parsedAmount + transactionsTotal;
  const available = Math.max(0, creditLimit - newTotal);
  const utilization = creditLimit > 0 ? Math.min(100, (newTotal / creditLimit) * 100) : 0;

  const handleSave = async () => {
    if (parsedAmount < 0 || isNaN(parsedAmount)) return;
    setSaving(true);
    try {
      await onSave(parsedAmount, notes.trim());
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden border-0 sm:border w-screen h-[100dvh] sm:w-full sm:h-auto sm:max-w-md sm:max-h-[92vh] sm:rounded-2xl flex flex-col"
        style={{ zIndex: 2147483647 }}
      >
        {/* HEADER destacado — usuário sabe imediatamente que está editando */}
        <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground px-5 pt-5 pb-6 relative">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-90">
            {isEditing ? <Pencil className="h-3.5 w-3.5" /> : <Receipt className="h-3.5 w-3.5" />}
            {isEditing ? "Editando fatura" : "Nova fatura"}
          </div>
          <h2 className="text-lg font-bold mt-1 leading-tight">{cardName}</h2>
          <p className="text-xs opacity-85 mt-0.5">Ciclo {cycleLabel}</p>
        </div>

        {/* BODY — campo de valor em destaque máximo */}
        <div className="flex-1 overflow-y-auto px-5 pt-6 pb-4 space-y-5">
          <div className="text-center">
            <Label htmlFor="opening-amount" className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Valor da fatura
            </Label>
            <div className="mt-2 flex items-baseline justify-center gap-1">
              <span className="text-2xl font-semibold text-muted-foreground">R$</span>
              <Input
                ref={inputRef}
                id="opening-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="h-auto border-0 bg-transparent text-center text-5xl font-bold tracking-tight px-0 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/30"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {isEditing
                ? "Altere o valor inicial da fatura deste ciclo"
                : "Despesas anteriores não registradas. Novas transações serão somadas."}
            </p>
          </div>

          {/* Feedback em tempo real — limite e impacto */}
          {creditLimit > 0 && (
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Total da fatura</span>
                <span className="font-semibold tabular-nums">{fmt(newTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Limite disponível</span>
                <span className={`font-semibold tabular-nums ${available === 0 ? "text-destructive" : "text-foreground"}`}>
                  {fmt(available)}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    utilization >= 90 ? "bg-destructive" : utilization >= 70 ? "bg-warning" : "bg-primary"
                  }`}
                  style={{ width: `${utilization}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-right">
                {utilization.toFixed(0)}% de {fmt(creditLimit)}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="opening-notes" className="text-xs">Observações (opcional)</Label>
            <Textarea
              id="opening-notes"
              rows={2}
              placeholder="Ex: fatura aberta antes de começar a usar o app"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[60px] resize-none"
            />
          </div>
        </div>

        {/* FOOTER fixo — botões sempre visíveis */}
        <div className="border-t bg-background px-4 py-3 flex gap-2 sticky bottom-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="flex-1 h-12"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !amountStr}
            className="flex-[2] h-12 text-base font-semibold"
          >
            {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Salvar fatura"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
