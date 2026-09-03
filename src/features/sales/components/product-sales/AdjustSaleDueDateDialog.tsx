// Diálogo para ajustar a data de vencimento de uma venda.
// Regrava apenas o array `installmentDates` (datas customizadas por parcela),
// preservando toda a lógica financeira existente.
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Sale } from "@/types/loan";
import { addByFrequency } from "./productSalesUtils";

function toISO(d: Date) {
  return format(d, "yyyy-MM-dd");
}

/** Datas atuais de todas as parcelas (customizadas ou calculadas). */
export function buildSaleDueDates(sale: Sale): string[] {
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const total = isRecorrente ? sale.installments : 1;
  const base = new Date(sale.date + "T00:00:00");
  return Array.from({ length: total }, (_, i) => {
    const custom = sale.installmentDates && sale.installmentDates[i];
    if (custom) return custom;
    return toISO(isRecorrente ? addByFrequency(base, sale.frequency || "Mensal", i) : base);
  });
}

export function AdjustSaleDueDateDialog({
  open,
  onOpenChange,
  sale,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale: Sale;
  onUpdate: (data: Partial<Omit<Sale, "id">>) => void;
}) {
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const dates = useMemo(() => buildSaleDueDates(sale), [sale]);
  const targetIdx = Math.min(sale.paidInstallments, dates.length - 1);
  const currentDate = dates[targetIdx] || toISO(new Date());

  const [newDate, setNewDate] = useState(currentDate);
  const [scope, setScope] = useState<"single" | "future">("single");

  useEffect(() => {
    if (open) {
      setNewDate(currentDate);
      setScope("single");
    }
  }, [open, currentDate]);

  const handleSave = () => {
    if (!newDate) {
      toast.error("Selecione uma data de vencimento.");
      return;
    }
    const prev = new Date(currentDate + "T00:00:00");
    const next = new Date(newDate + "T00:00:00");
    const deltaDays = Math.round((next.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

    const updated = dates.map((d, i) => {
      if (i === targetIdx) return newDate;
      if (scope === "future" && i > targetIdx) {
        const shifted = new Date(d + "T00:00:00");
        shifted.setDate(shifted.getDate() + deltaDays);
        return toISO(shifted);
      }
      return d;
    });

    onUpdate({ installmentDates: updated });
    toast.success("Vencimento atualizado.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar vencimento</DialogTitle>
          <DialogDescription>
            {isRecorrente
              ? `Altere a data da ${targetIdx + 1}ª parcela desta venda.`
              : "Altere a data de vencimento desta venda."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Vencimento atual: </span>
            <span className="font-semibold text-foreground">
              {format(new Date(currentDate + "T00:00:00"), "dd/MM/yyyy")}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sale-due-date">Nova data</Label>
            <DatePickerField id="sale-due-date" value={newDate} onChange={setNewDate} />
          </div>

          {isRecorrente && targetIdx < dates.length - 1 && (
            <div className="space-y-2">
              <Label>Aplicar em</Label>
              <RadioGroup value={scope} onValueChange={(v) => setScope(v as "single" | "future")}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="single" id="scope-single" />
                  <Label htmlFor="scope-single" className="font-normal">Somente esta parcela</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="future" id="scope-future" />
                  <Label htmlFor="scope-future" className="font-normal">Esta e as parcelas futuras</Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
