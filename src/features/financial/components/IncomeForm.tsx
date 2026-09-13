import { useState, useEffect, useMemo } from "react";
import { Income, IncomeRecurrence, IncomeStatus, useIncomes } from "@/features/financial/hooks/useIncomes";
import { useClients } from "@/features/clients/hooks/useClients";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useIncomeCategories } from "@/features/financial/hooks/useIncomeCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientCombobox } from "@/components/ui/client-combobox";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { PersonalCategoryCreator } from "@/features/financial/components/PersonalCategoryCreator";
import { personalIconMap } from "@/features/financial/lib/personalExpenseCategories";
import { PlusCircle, TrendingUp, X, Loader2, Plus } from "lucide-react";
import { todayInAppTz } from "@/lib/timezone";
import { MoneyInput } from "@/components/ui/money-input";
import { useDescriptionHistory } from "@/features/financial/hooks/useDescriptionHistory";
import { displayIncomeCategory, incomeCategoryKey } from "@/features/financial/lib/incomeCategory";
import { IncomeBoletoLinkSection } from "@/features/financial/components/IncomeBoletoLinkSection";

export const INCOME_CATEGORIES = [
  "Vendas",
  "Serviços",
  "Comissões",
  "Aluguel",
  "Investimentos",
  "Salário",
  "Reembolso",
  "Outros",
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Income, "id" | "createdAt">) => Promise<any>;
  initial?: Income | null;
}

export function IncomeForm({ open, onClose, onSubmit, initial }: Props) {
  const { clients } = useClients();
  const { activeMethods } = usePaymentMethods();
  const { categories: customCategories, create: createCategory } = useIncomeCategories();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Vendas");
  const [clientName, setClientName] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");
  const [receivedDate, setReceivedDate] = useState(todayInAppTz());
  const [actualReceivedDate, setActualReceivedDate] = useState<string>("");
  const [status, setStatus] = useState<IncomeStatus>("received");
  const [recurrence, setRecurrence] = useState<IncomeRecurrence>("once");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const { suggestions, record, findTemplate, seed } = useDescriptionHistory("income");
  const { incomes } = useIncomes();

  // Seed templates from previously stored incomes for autofill.
  useEffect(() => {
    if (!incomes?.length) return;
    const entries = incomes
      .filter((i) => i.description)
      .map((i) => {
        const clientObj = clients.find((c) => c.id === i.clientId);
        return {
          description: i.description,
          amount: Number(i.amount),
          category: displayIncomeCategory(i.category),
          notes: i.notes ?? "",
          paymentMethodId: i.paymentMethodId ?? null,
          clientName: clientObj?.name || i.source || "",
        };
      });
    seed(entries);
  }, [incomes, clients, seed]);

  const allCategories = useMemo(() => {
    const customKeys = new Set(customCategories.map((c) => incomeCategoryKey(c.name)));
    const builtIns = INCOME_CATEGORIES.filter((c) => !customKeys.has(incomeCategoryKey(c)));
    const seenCustoms = new Set<string>();
    const customs = customCategories.filter((c) => {
      const key = incomeCategoryKey(c.name);
      if (seenCustoms.has(key)) return false;
      seenCustoms.add(key);
      return true;
    });
    return { builtIns, customs };
  }, [customCategories]);

  useEffect(() => {
    if (open) {
      if (initial) {
        setDescription(initial.description);
        setAmount(String(initial.amount));
        setCategory(displayIncomeCategory(initial.category));
        const c = clients.find((c) => c.id === initial.clientId);
        setClientName(c?.name || initial.source || "");
        setPaymentMethodId(initial.paymentMethodId || "");
        setReceivedDate(initial.receivedDate);
        setActualReceivedDate(initial.actualReceivedDate || (initial.status === "received" ? initial.receivedDate : ""));
        setStatus(initial.status);
        setRecurrence(initial.recurrence);
        setNotes(initial.notes || "");
      } else {
        setDescription("");
        setAmount("");
        setCategory("Vendas");
        setClientName("");
        setPaymentMethodId("");
        setReceivedDate(todayInAppTz());
        setActualReceivedDate(todayInAppTz());
        setStatus("received");
        setRecurrence("once");
        setNotes("");
      }
    }
  }, [open, initial, clients]);

  // Auto: para novas receitas com data futura → status pendente
  useEffect(() => {
    if (!open || initial) return;
    const today = todayInAppTz();
    if (receivedDate > today && status === "received") setStatus("pending");
    else if (receivedDate <= today && status === "pending") setStatus("received");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivedDate, open, initial]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!description.trim() || !amount) return;
    setSaving(true);
    const matched = clients.find((c) => c.name.toLowerCase() === clientName.trim().toLowerCase());
    const today = todayInAppTz();
    const finalStatus: IncomeStatus = !initial && receivedDate > today && status === "received"
      ? "pending"
      : status;
    await onSubmit({
      description: description.trim(),
      amount: Number(amount),
      category: displayIncomeCategory(category),
      clientId: matched?.id || null,
      source: !matched && clientName.trim() ? clientName.trim() : null,
      paymentMethodId: paymentMethodId || null,
      receivedDate,
      actualReceivedDate: finalStatus === "received" ? (actualReceivedDate || today) : null,
      status: finalStatus,
      notes: notes.trim() || null,
      recurrence,
      parentId: initial?.parentId || null,
    });
    record(description, {
      amount: Number(amount),
      category: displayIncomeCategory(category),
      notes: notes.trim(),
      paymentMethodId: paymentMethodId || null,
      clientName: clientName.trim(),
    });
    setSaving(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-0 sm:p-4 animate-in fade-in-0">
      <Card no3d className="modal-form-scrollable w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-lg rounded-none sm:rounded-2xl border-0 sm:border border-border/80 shadow-2xl flex flex-col bg-card overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border/60 px-4 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                {initial ? "Editar Receita" : "Nova Receita"}
              </h2>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Cadastre e controle entradas financeiras
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
          <form id="income-form" onSubmit={handleSave} className="space-y-4">
            {/* Bloco 1: Detalhes da Receita */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Descrição *
                </Label>
                <Input
                  value={description}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDescription(v);
                    if (initial) return;
                    if (findTemplate(v)) {
                      const tpl = findTemplate(v);
                      if (tpl) {
                        if (!amount && tpl.amount != null) setAmount(String(tpl.amount));
                        if ((category === "Vendas" || !category) && tpl.category) setCategory(String(tpl.category));
                        if (!notes && tpl.notes) setNotes(String(tpl.notes));
                        if (!paymentMethodId && tpl.paymentMethodId) setPaymentMethodId(String(tpl.paymentMethodId));
                        if (!clientName && tpl.clientName) setClientName(String(tpl.clientName));
                      }
                    }
                  }}
                  onBlur={(e) => {
                    if (initial) return;
                    const tpl = findTemplate(e.target.value);
                    if (!tpl) return;
                    if (!amount && tpl.amount != null) setAmount(String(tpl.amount));
                    if ((category === "Vendas" || !category) && tpl.category) setCategory(String(tpl.category));
                    if (!notes && tpl.notes) setNotes(String(tpl.notes));
                    if (!paymentMethodId && tpl.paymentMethodId) setPaymentMethodId(String(tpl.paymentMethodId));
                    if (!clientName && tpl.clientName) setClientName(String(tpl.clientName));
                  }}
                  placeholder="Ex.: Venda de produto, Consultoria..."
                  list="income-desc-history"
                  className="h-10 text-sm font-medium"
                  required
                />
                <datalist id="income-desc-history">
                  {suggestions.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>

              {/* Grid 2x2 no mobile: Valor e Vencimento */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Valor *
                  </Label>
                  <MoneyInput value={amount} onChange={setAmount} placeholder="R$ 0,00" required />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Vencimento *
                  </Label>
                  <DatePickerField value={receivedDate} onChange={setReceivedDate} />
                </div>
              </div>

              {status === "received" && (
                <div className="space-y-1.5 animate-in fade-in-50 duration-200">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Data de Pagamento
                  </Label>
                  <DatePickerField value={actualReceivedDate || receivedDate} onChange={setActualReceivedDate} />
                </div>
              )}
            </div>

            {/* Bloco 2: Categoria e Status */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
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
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {allCategories.builtIns.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                      {allCategories.customs.length > 0 && allCategories.builtIns.length > 0 && (
                        <div className="my-1 border-t border-border" />
                      )}
                      {allCategories.customs.map((c) => {
                        const Icon = personalIconMap[c.icon] ?? personalIconMap.Package;
                        const name = displayIncomeCategory(c.name);
                        return (
                          <SelectItem key={c.id} value={name}>
                            <span className="inline-flex items-center gap-2">
                              <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${c.color})` }} />
                              {name}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Status *
                  </Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as IncomeStatus)}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="received">Recebido</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="overdue">Atrasado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Bloco 3: Cliente e Origem */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cliente / Origem
              </Label>
              <ClientCombobox
                value={clientName}
                onChange={setClientName}
                options={clients.map((c) => ({ id: c.id, name: c.name }))}
                placeholder="Selecione um cliente ou digite uma origem"
              />
            </div>

            {/* Bloco 4: Forma de Pagamento e Recorrência */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Forma de Pagamento
                  </Label>
                  <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeMethods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recorrência
                  </Label>
                  <Select value={recurrence} onValueChange={(v) => setRecurrence(v as IncomeRecurrence)}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">Única</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="biweekly">Quinzenal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Bloco 5: Observações */}
            <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Observações
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Notas ou detalhes desta receita..."
                className="resize-none"
              />
            </div>

            {/* Link Boleto (se edição) */}
            {initial?.id && (
              <IncomeBoletoLinkSection incomeId={initial.id} />
            )}
          </form>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-20 bg-card/95 backdrop-blur-md border-t border-border/60 p-4 sm:p-6 flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 h-12 text-sm font-semibold rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="income-form"
            onClick={handleSave}
            disabled={saving || !description.trim() || !amount}
            className="flex-1 h-12 text-sm font-semibold rounded-xl shadow-md transition-all active:scale-[0.99]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                {initial ? "Salvar Alterações" : "Salvar Receita"}
              </>
            )}
          </Button>
        </div>
      </Card>

      <PersonalCategoryCreator
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
        createCategory={createCategory}
        onCreated={(c) => setCategory(c.name)}
      />
    </div>
  );
}

