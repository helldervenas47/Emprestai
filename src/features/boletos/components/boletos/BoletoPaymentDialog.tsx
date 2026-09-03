import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { MyBoleto } from "@/features/boletos/hooks/useMyBoletos";

interface Props {
  boleto: MyBoleto | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (payload: {
    paid_at: string;
    amount: number;
    payment_method: string | null;
    status: string;
    notes: string | null;
  }) => Promise<void>;
}

const METHODS = ["Pix", "Boleto", "Cartão", "Dinheiro", "Transferência", "Débito automático", "Outro"];
const STATUSES = ["pago", "parcial", "estornado"];

export function BoletoPaymentDialog({ boleto, open, onOpenChange, onConfirm }: Props) {
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Pix");
  const [status, setStatus] = useState("pago");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && boleto) {
      setPaidAt(new Date().toISOString().slice(0, 10));
      setAmount(boleto.amount ? String(boleto.amount) : "");
      setMethod("Pix");
      setStatus("pago");
      setNotes("");
    }
  }, [open, boleto]);

  const submit = async () => {
    const n = Number(String(amount).replace(",", "."));
    if (!n || n <= 0) { toast.error("Informe um valor válido"); return; }
    setSaving(true);
    try {
      await onConfirm({
        paid_at: paidAt,
        amount: n,
        payment_method: method || null,
        status,
        notes: notes.trim() || null,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao registrar pagamento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
        </DialogHeader>
        {boleto && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{boleto.description}</span>
              {boleto.beneficiary && <> · {boleto.beneficiary}</>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data do pagamento</Label>
                <DatePickerField value={paidAt} onChange={setPaidAt} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor pago (R$)</Label>
                <Input type="number" step="0.01" inputMode="decimal"
                  value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Forma de pagamento</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea className="min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: pago via app, comprovante #123" />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Registrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
