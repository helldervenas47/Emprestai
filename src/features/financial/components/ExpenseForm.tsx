import { useState, useEffect } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, PlusCircle, X, Loader2, Tag } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Expense } from "@/types/loan";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";
import { MoneyInput } from "@/components/ui/money-input";
import { useDescriptionHistory } from "@/features/financial/hooks/useDescriptionHistory";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useBusinessExpenseCategories } from "@/features/financial/hooks/useBusinessExpenseCategories";
import { BusinessCategoryCreatorDialog } from "@/features/financial/components/BusinessCategoryCreatorDialog";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useCreditCards } from "@/features/creditCards/hooks/useCreditCards";
import { toast } from "sonner";

type ExpenseKind = "unica" | "parcelada" | "fixa" | "recorrente_pos_pagamento";

// Sentinel for "fixa mensal sem fim" — large installment count keeps recurrence open-ended
const FIXED_RECURRING_INSTALLMENTS = 999;

interface Props {
  onAdd: (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => void;
  onClose: () => void;
  scope?: "business" | "personal";
  defaults?: Partial<{
    description: string;
    amount: string | number;
    category: string;
    dueDate: string;
    notes: string;
    kind: ExpenseKind;
  }>;
}

export function ExpenseForm({ onAdd, onClose, scope = "business", defaults }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFormError, setShowFormError] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [generateIncomeOnPay, setGenerateIncomeOnPay] = useState(false);
  const { suggestions, record, findTemplate, seed } = useDescriptionHistory(`expense-${scope}`);
  const { expenses } = useExpenses();
  const { categories, addCategory } = useBusinessExpenseCategories();
  const { activeMethods } = usePaymentMethods();
  const { cards } = useCreditCards();

  const [form, setForm] = useState({
    description: defaults?.description ?? "",
    amount: defaults?.amount != null ? String(defaults.amount) : "",
    kind: (defaults?.kind ?? "unica") as ExpenseKind,
    category: defaults?.category ?? "",
    installments: "1",
    dueDate: defaults?.dueDate ?? todayInAppTz(),
    notes: defaults?.notes ?? "",
    creditCardId: "",
  });

  // Seed templates with existing expenses of the same scope so previously
  // registered descriptions can pre-fill the form on first use.
  useEffect(() => {
    if (!expenses?.length) return;
    const entries = expenses
      .filter((e) => (e.scope ?? "business") === scope && e.description)
      .map((e) => {
        const installments = Math.max(1, e.installments ?? 1);
        const isRecurring = e.type === "recorrente" && installments > 1;
        const unit = isRecurring ? e.amount / installments : e.amount;
        return {
          description: e.description,
          amount: Number(unit.toFixed(2)),
          category: e.category,
          notes: e.notes ?? "",
          paymentMethodId: e.paymentMethodId ?? null,
        };
      });
    seed(entries);
  }, [expenses, scope, seed]);

  const applyTemplateFromDescription = (desc: string) => {
    const tpl = findTemplate(desc);
    if (!tpl) return;
    setForm((prev) => ({
      ...prev,
      amount: prev.amount || (tpl.amount != null ? String(tpl.amount) : ""),
      category: prev.category || ((tpl.category as string) ?? ""),
      notes: prev.notes || ((tpl.notes as string) ?? ""),
    }));
    if (!paymentMethodId && tpl.paymentMethodId) setPaymentMethodId(tpl.paymentMethodId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount || !form.category) return;
    if (!paymentMethodId) { setShowFormError(true); return; }
    
    const method = activeMethods.find(m => m.id === paymentMethodId);
    const isCredit = method?.name.toLowerCase().includes("crédito");
    if (isCredit && !form.creditCardId) {
      toast.error("Selecione um cartão de crédito");
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    const parsedAmount = parseFloat(form.amount) || 0;

    // Gerar nota com tag do cartão se for crédito
    let finalNotes = form.notes;
    if (isCredit && form.creditCardId) {
      const selectedCard = cards.find(c => c.id === form.creditCardId);
      if (selectedCard) {
        const cardTag = selectedCard.nickname || selectedCard.lastFour || selectedCard.bank;
        const tagLine = `[Crédito] Cartão: ${cardTag.trim()} {ID:${selectedCard.id}}`;
        finalNotes = finalNotes.trim() ? `${tagLine}\n${finalNotes}` : tagLine;
      }
    }

    let payload: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">;
    const commonPayload = {
      description: form.description,
      category: form.category,
      dueDate: form.dueDate,
      notes: finalNotes,
      scope,
      paymentMethodId: isCredit ? paymentMethodId : paymentMethodId,
      generateIncomeOnPay,
    };

    if (form.kind === "parcelada") {
      const installments = Math.max(1, parseInt(form.installments) || 1);
      payload = {
        ...commonPayload,
        amount: parsedAmount * installments,
        type: "recorrente",
        installments,
        paidInstallments: 0,
      };
    } else if (form.kind === "fixa") {
      payload = {
        ...commonPayload,
        amount: parsedAmount * FIXED_RECURRING_INSTALLMENTS,
        type: "recorrente",
        installments: FIXED_RECURRING_INSTALLMENTS,
        paidInstallments: 0,
      };
    } else if (form.kind === "recorrente_pos_pagamento") {
      payload = {
        ...commonPayload,
        amount: parsedAmount,
        type: "recorrente",
        installments: FIXED_RECURRING_INSTALLMENTS,
        paidInstallments: 0,
        recurrenceType: "after_payment",
      };
    } else {
      payload = {
        ...commonPayload,
        amount: parsedAmount,
        type: "fixa",
      };
    }

    try {
      const result = await onAdd(payload);
      // Se retornou null, houve um erro lógico e o rollback já foi feito no hook
      if (result === null) {
        setSubmitting(false);
        return;
      }
      
      record(form.description, {
        amount: parsedAmount,
        category: form.category,
        notes: form.notes, // Salvamos a nota original sem a tag no histórico de sugestões
        paymentMethodId,
      });
      setShowSuccess(true);
    } catch (err) {
      console.error("[ExpenseForm] error adding expense:", err);
      toast.error("Ocorreu um erro ao tentar cadastrar a despesa.");
    } finally {
      setSubmitting(false);
    }
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const amountLabel =
    form.kind === "parcelada" ? "Valor da Parcela (R$)" :
    form.kind === "fixa" || form.kind === "recorrente_pos_pagamento" ? "Valor Mensal (R$)" : "Valor (R$)";

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-0 sm:p-4 animate-in fade-in-0">
      <SuccessAnimation show={showSuccess} onComplete={onClose} message="Despesa cadastrada!" />
      <Card no3d className="modal-form-scrollable w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-lg rounded-none sm:rounded-2xl border-0 sm:border border-border/80 shadow-2xl flex flex-col bg-card overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border/60 px-4 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shadow-xs">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                Nova Despesa {scope === "personal" ? "Pessoal" : "da Empresa"}
              </h2>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Cadastre e controle pagamentos empresariais
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Bloco 1: Detalhes da Despesa */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Descrição *
                </Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(e) => {
                    update("description", e.target.value);
                    if (findTemplate(e.target.value)) {
                      applyTemplateFromDescription(e.target.value);
                    }
                  }}
                  onBlur={(e) => applyTemplateFromDescription(e.target.value)}
                  placeholder="Ex: Aluguel do escritório, Fornecedor..."
                  list="expense-desc-history"
                  className="h-10 text-sm font-medium"
                  required
                />
                <datalist id="expense-desc-history">
                  {suggestions.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>

              {/* Grid 2x2 no mobile: Valor e Tipo */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="amount" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {amountLabel} *
                  </Label>
                  <MoneyInput
                    id="amount"
                    value={form.amount}
                    onChange={(v) => update("amount", v)}
                    placeholder="R$ 0,00"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tipo *
                  </Label>
                  <Select value={form.kind} onValueChange={(v) => update("kind", v)}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unica">Única</SelectItem>
                      <SelectItem value="parcelada">Parcelada</SelectItem>
                      <SelectItem value="fixa">Fixa (mensal)</SelectItem>
                      <SelectItem value="recorrente_pos_pagamento">Recorrente após pgto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.kind === "parcelada" && (
                <div className="space-y-1.5 animate-in fade-in-50 duration-200">
                  <Label htmlFor="installments" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Número de Parcelas *
                  </Label>
                  <Input
                    id="installments"
                    type="number"
                    min="1"
                    value={form.installments}
                    onChange={(e) => update("installments", e.target.value)}
                    placeholder="12"
                    className="h-10"
                  />
                </div>
              )}

              {/* Grid 2x2 no mobile: Categoria e Data de Pagamento */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Categoria *
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-[11px] text-primary hover:text-primary/80 hover:bg-primary/10"
                      onClick={() => setCreatorOpen(true)}
                    >
                      <PlusCircle className="mr-1 h-3 w-3" />
                      Nova
                    </Button>
                  </div>
                  <Select
                    value={form.category}
                    onValueChange={(v) => {
                      if (v === "__create_new__") {
                        setCreatorOpen(true);
                        return;
                      }
                      update("category", v);
                    }}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                      <div className="my-1 border-t border-border/50" />
                      <SelectItem
                        value="__create_new__"
                        className="text-primary font-medium focus:text-primary focus:bg-primary/10 cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <PlusCircle className="h-3.5 w-3.5" />
                          + Criar nova categoria...
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dueDate" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Data de Pagamento *
                  </Label>
                  <DatePickerField
                    id="dueDate"
                    value={form.dueDate}
                    onChange={(v) => update("dueDate", v)}
                  />
                </div>
              </div>
            </div>

            {/* Bloco 2: Forma de Pagamento e Cartão */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
              <PaymentMethodPicker
                value={paymentMethodId}
                onChange={(id) => { 
                  setPaymentMethodId(id); 
                  setShowFormError(false);
                  const method = activeMethods.find(m => m.id === id);
                  if (!method?.name.toLowerCase().includes("crédito")) {
                    update("creditCardId", "");
                  }
                }}
                required
                showError={showFormError}
              />

              {activeMethods.find(m => m.id === paymentMethodId)?.name.toLowerCase().includes("crédito") && (
                <div className="space-y-1.5 animate-in fade-in-50 slide-in-from-top-1 duration-200">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cartão de Crédito *
                  </Label>
                  <Select value={form.creditCardId} onValueChange={(v) => update("creditCardId", v)}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Selecione o cartão" />
                    </SelectTrigger>
                    <SelectContent>
                      {cards.length === 0 && (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                          Nenhum cartão ativo encontrado
                        </div>
                      )}
                      {cards.filter(c => c.active !== false).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nickname || c.bank} {c.lastFour ? `(**** ${c.lastFour})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Bloco 3: Gerar Receita ao Pagar (Se Business) */}
            {scope === "business" && (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-3.5 sm:p-4 shadow-xs">
                <div className="space-y-0.5 pr-2">
                  <Label htmlFor="generate-income" className="text-xs font-semibold uppercase tracking-wider text-foreground cursor-pointer">
                    Gerar receita ao pagar
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ao marcar como paga, cria automaticamente uma receita do mesmo valor no saldo em conta.
                  </p>
                </div>
                <Switch
                  id="generate-income"
                  checked={generateIncomeOnPay}
                  onCheckedChange={setGenerateIncomeOnPay}
                />
              </div>
            )}

            {/* Bloco 4: Observações */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-1.5">
              <Label htmlFor="notes" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Observações
              </Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Notas ou detalhes sobre esta despesa..."
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Resumo Dinâmico do Valor */}
            {parseFloat(form.amount) > 0 && (
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3.5 space-y-1 text-xs sm:text-sm">
                {form.kind === "parcelada" && parseInt(form.installments) > 1 && (
                  <p className="text-muted-foreground">
                    Valor total: <span className="font-semibold text-foreground">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount) * (parseInt(form.installments) || 1))}
                    </span> ({form.installments}x de {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount))})
                  </p>
                )}
                {form.kind === "fixa" && (
                  <p className="text-muted-foreground">
                    Despesa mensal recorrente sem prazo final.
                  </p>
                )}
                {form.kind === "recorrente_pos_pagamento" && (
                  <p className="text-muted-foreground">
                    A próxima despesa será gerada somente após o pagamento desta.
                  </p>
                )}
                <p className="text-muted-foreground">
                  Ao pagar, <span className="font-semibold text-destructive">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount))}
                  </span> será debitado do saldo em conta.
                </p>
              </div>
            )}
          </form>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-20 bg-card/95 backdrop-blur-md border-t border-border/60 p-4 sm:p-6">
          <Button
            type="submit"
            form="expense-form"
            className="w-full h-12 text-sm font-semibold rounded-xl shadow-md transition-all active:scale-[0.99]"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cadastrando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar Despesa
              </>
            )}
          </Button>
        </div>
      </Card>

      <BusinessCategoryCreatorDialog
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
        onCreated={(name) => update("category", name)}
        addCategory={addCategory}
      />
    </div>
  );
}
