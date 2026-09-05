import { useState } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { Expense } from "@/types/loan";
import { MoneyInput } from "@/components/ui/money-input";
import { useDescriptionHistory } from "@/features/financial/hooks/useDescriptionHistory";

// "Combustível" é uma categoria exclusiva da aba Despesas — NÃO incluir aqui.
export const vehicleExpenseCategories = [
  "Manutenção", "Seguro", "IPVA", "Multas",
  "Lavagem", "Estacionamento", "Pneus", "Documentação", "Peças",
  "Guincho", "Financiamento", "Outros (Veículo)",
];

const normalizeVehicleCategory = (value?: string | null) =>
  (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export const isFuelExpense = (expense: Pick<Expense, "category" | "description" | "notes">) => {
  const text = normalizeVehicleCategory(`${expense.category} ${expense.description ?? ""} ${expense.notes ?? ""}`);
  return /\b(combustivel|gasolina|etanol|alcool|diesel|posto|abastec)/i.test(text);
};

export const isVehicleExpenseCategory = (category?: string | null) => {
  const normalized = normalizeVehicleCategory(category);
  return vehicleExpenseCategories.some((c) => normalizeVehicleCategory(c) === normalized);
};

export const isVehicleExpenseForVehicles = (expense: Pick<Expense, "category" | "description" | "notes">) =>
  isVehicleExpenseCategory(expense.category) && !isFuelExpense(expense);

interface Props {
  onAdd: (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => void;
  onClose: () => void;
}

export function VehicleExpenseForm({ onAdd, onClose }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { suggestions, record } = useDescriptionHistory("vehicle-expense");
  const [form, setForm] = useState({
    description: "",
    amount: "",
    type: "fixa" as "fixa" | "recorrente",
    category: "",
    installments: "1",
    dueDate: todayInAppTz(),
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.description || !form.amount || !form.category) return;
    setSubmitting(true);
    const parsedAmount = parseFloat(form.amount) || 0;
    const installments = form.type === "recorrente" ? parseInt(form.installments) || 1 : 1;
    const totalAmount = form.type === "recorrente" ? parsedAmount * installments : parsedAmount;
    onAdd({
      description: form.description,
      amount: totalAmount,
      type: form.type,
      category: form.category,
      installments: form.type === "recorrente" ? parseInt(form.installments) || 1 : undefined,
      paidInstallments: form.type === "recorrente" ? 0 : undefined,
      dueDate: form.dueDate,
      notes: form.notes,
    });
    record(form.description);
    setShowSuccess(true);
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
      <SuccessAnimation show={showSuccess} onComplete={onClose} message="Despesa cadastrada!" />
      <Card className="!bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:border sm:pt-0 sm:pb-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Despesa de Veículo</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="pb-8 sm:pb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Ex: Troca de óleo do veículo X"
                list="vehicle-expense-desc-history"
                required
              />
              <datalist id="vehicle-expense-desc-history">
                {suggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">{form.type === "recorrente" ? "Valor da Parcela (R$)" : "Valor (R$)"}</Label>
                <MoneyInput
                  id="amount"
                  value={form.amount}
                  onChange={(v) => update("amount", v)}
                  placeholder="R$ 0,00"
                  required
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => update("type", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixa">Fixa</SelectItem>
                    <SelectItem value="recorrente">Recorrente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.type === "recorrente" && (
              <div>
                <Label htmlFor="installments">Parcelas</Label>
                <Input
                  id="installments"
                  type="number"
                  min="1"
                  value={form.installments}
                  onChange={(e) => update("installments", e.target.value)}
                  placeholder="12"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => update("category", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleExpenseCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dueDate">Data de Pagamento</Label>
                <DatePickerField
                  id="dueDate"
                  value={form.dueDate}
                  onChange={(v) => update("dueDate", v)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Notas sobre a despesa..."
                rows={2}
              />
            </div>

            {parseFloat(form.amount) > 0 && (
              <div className="rounded-lg bg-muted p-4 space-y-1">
                {form.type === "recorrente" && parseInt(form.installments) > 1 && (
                  <p className="text-sm text-muted-foreground">
                    Valor total: <span className="font-semibold text-foreground">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount) * (parseInt(form.installments) || 1))}
                    </span> ({form.installments}x de {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount))})
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Ao pagar, <span className="font-semibold text-destructive">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount))}
                  </span> será debitado do saldo em conta.
                </p>
              </div>
            )}

            <div className="relative w-full h-11">
              {submitting ? (
                <div className="flex items-center justify-center h-11">
                  <div className="h-8 w-8 rounded-full border-[3px] border-primary border-t-transparent animate-spin" />
                </div>
              ) : (
                <Button type="submit" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Cadastrar Despesa
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
