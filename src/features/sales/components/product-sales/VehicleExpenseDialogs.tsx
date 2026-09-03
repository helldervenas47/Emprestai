import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { CheckCircle } from "lucide-react";
import { Expense } from "@/types/loan";
import { vehicleExpenseCategories } from "@/features/vehicles/components/VehicleExpenseForm";
import { ExpenseBoletoLinkSection } from "@/features/financial/components/ExpenseBoletoLinkSection";
import { todayInAppTz } from "@/lib/timezone";

export function VehicleExpenseEditDialog({ expense, open, onOpenChange, onSave, formatCurrency }: {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  formatCurrency: (v: number) => string;
}) {
  const isRecorrente = expense.type === "recorrente" && expense.installments && expense.installments > 1;
  const installmentVal = isRecorrente ? expense.amount / expense.installments! : expense.amount;
  const [form, setForm] = useState({
    description: expense.description,
    amount: String(installmentVal),
    type: expense.type as "fixa" | "recorrente",
    category: expense.category,
    installments: String(expense.installments || 1),
    dueDate: expense.dueDate,
    notes: expense.notes || "",
  });

  useEffect(() => {
    if (open) {
      const isRec = expense.type === "recorrente" && expense.installments && expense.installments > 1;
      const instVal = isRec ? expense.amount / expense.installments! : expense.amount;
      setForm({
        description: expense.description,
        amount: String(instVal),
        type: expense.type as "fixa" | "recorrente",
        category: expense.category,
        installments: String(expense.installments || 1),
        dueDate: expense.dueDate,
        notes: expense.notes || "",
      });
    }
  }, [open, expense]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(form.amount) || 0;
    const installments = form.type === "recorrente" ? parseInt(form.installments) || 1 : 1;
    const totalAmount = form.type === "recorrente" ? parsedAmount * installments : parsedAmount;
    onSave({
      description: form.description,
      amount: totalAmount,
      type: form.type,
      category: form.category,
      installments: form.type === "recorrente" ? installments : undefined,
      dueDate: form.dueDate,
      notes: form.notes || undefined,
    });
  };

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Despesa</DialogTitle>
          <DialogDescription>Altere os dados da despesa de veículo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-desc">Descrição</Label>
            <Input id="edit-desc" value={form.description} onChange={e => update("description", e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-amount">{form.type === "recorrente" ? "Valor da Parcela (R$)" : "Valor (R$)"}</Label>
              <Input id="edit-amount" type="number" step="0.01" value={form.amount} onChange={e => update("amount", e.target.value)} required />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={v => update("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixa">Fixa</SelectItem>
                  <SelectItem value="recorrente">Recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.type === "recorrente" && (
            <div>
              <Label htmlFor="edit-inst">Parcelas</Label>
              <Input id="edit-inst" type="number" min="1" value={form.installments} onChange={e => update("installments", e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => update("category", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {vehicleExpenseCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-due">Data de Pagamento</Label>
              <DatePickerField id="edit-due" value={form.dueDate} onChange={(v) => update("dueDate", v)} />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-notes">Observações</Label>
            <Textarea id="edit-notes" value={form.notes} onChange={e => update("notes", e.target.value)} rows={2} />
          </div>
          <ExpenseBoletoLinkSection expenseId={expense.id} />

          {parseFloat(form.amount) > 0 && form.type === "recorrente" && parseInt(form.installments) > 1 && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                Valor total: <span className="font-semibold text-foreground">
                  {formatCurrency(parseFloat(form.amount) * (parseInt(form.installments) || 1))}
                </span> ({form.installments}x de {formatCurrency(parseFloat(form.amount))})
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button data-mutation type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VehiclePayExpenseDialog({ expense, open, onOpenChange, onConfirm, formatCurrency }: {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payDate: string, paidAmount: number) => void;
  formatCurrency: (v: number) => string;
}) {
  const isRecorrente = expense.type === "recorrente" && expense.installments && expense.installments > 1;
  const defaultAmount = isRecorrente ? expense.amount / expense.installments! : expense.amount;
  const [payDate, setPayDate] = useState(todayInAppTz());
  const [amountStr, setAmountStr] = useState(String(defaultAmount.toFixed(2)));

  useEffect(() => {
    if (open) {
      setPayDate(todayInAppTz());
      setAmountStr(String(defaultAmount.toFixed(2)));
    }
  }, [open, defaultAmount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amountStr);
    if (isNaN(parsed) || parsed <= 0) return;
    onConfirm(payDate, parsed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar Pagamento</DialogTitle>
          <DialogDescription>
            Informe a data e o valor efetivamente pago{isRecorrente ? " desta parcela" : ""}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="pay-date">Data do pagamento</Label>
            <DatePickerField id="pay-date" value={payDate} onChange={setPayDate} />
          </div>
          <div>
            <Label htmlFor="pay-amount">Valor pago (R$)</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Valor original: {formatCurrency(defaultAmount)}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">
              <CheckCircle className="h-4 w-4 mr-1" />
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
