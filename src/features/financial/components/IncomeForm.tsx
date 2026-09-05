import { useState, useEffect, useMemo } from "react";
import { Income, IncomeRecurrence, IncomeStatus, useIncomes } from "@/features/financial/hooks/useIncomes";
import { useClients } from "@/features/clients/hooks/useClients";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useIncomeCategories } from "@/features/financial/hooks/useIncomeCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientCombobox } from "@/components/ui/client-combobox";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { PersonalCategoryCreator } from "@/features/financial/components/PersonalCategoryCreator";
import { personalIconMap } from "@/features/financial/lib/personalExpenseCategories";
import { PlusCircle } from "lucide-react";
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

  const handleSave = async () => {
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        style={{
          paddingTop: "calc(clamp(1rem, 4vw, 1.5rem) + env(safe-area-inset-top))",
          paddingRight: "calc(clamp(1rem, 4vw, 1.5rem) + env(safe-area-inset-right))",
          paddingBottom: "calc(clamp(1rem, 4vw, 1.5rem) + env(safe-area-inset-bottom))",
          paddingLeft: "calc(clamp(1rem, 4vw, 1.5rem) + env(safe-area-inset-left))",
        }}
        className="top-0 left-0 translate-x-0 translate-y-0 box-border w-[100dvw] h-[100dvh] max-w-[100dvw] max-h-[100dvh] rounded-none border-0 overflow-y-auto overflow-x-hidden pb-8 sm:pb-6 sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:w-full sm:h-auto sm:max-w-lg sm:max-h-[90vh] sm:rounded-2xl sm:border"
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Editar receita" : "Nova receita"}</DialogTitle>
          <DialogDescription>
            Preencha descrição, valor, data, categoria e forma de recebimento.
          </DialogDescription>
        </DialogHeader>
        <div className="w-full min-w-0 space-y-3">
          <div>
            <Label>Descrição</Label>
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
              placeholder="Ex.: Venda do produto X"
              list="income-desc-history"
            />
            <datalist id="income-desc-history">
              {suggestions.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="min-w-0">
              <Label>Valor</Label>
              <MoneyInput value={amount} onChange={setAmount} placeholder="R$ 0,00" />
            </div>
            <div className="min-w-0">
              <Label>Vencimento</Label>
              <DatePickerField value={receivedDate} onChange={setReceivedDate} />
            </div>
          </div>
          {status === "received" && (
            <div>
              <Label>Data de pagamento</Label>
              <DatePickerField value={actualReceivedDate || receivedDate} onChange={setActualReceivedDate} />
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="min-w-0">
              <div className="flex items-center justify-between">
                <Label>Categoria</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setCreatorOpen(true)}
                >
                  <PlusCircle className="mr-1 h-3.5 w-3.5" />
                  Nova
                </Button>
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
            <div className="min-w-0">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as IncomeStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Recebido</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="overdue">Atrasado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Cliente / Origem</Label>
            <ClientCombobox
              value={clientName}
              onChange={setClientName}
              options={clients.map((c) => ({ id: c.id, name: c.name }))}
              placeholder="Selecione um cliente ou digite uma origem"
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="min-w-0">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {activeMethods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label>Recorrência</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as IncomeRecurrence)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {initial?.id && (
            <IncomeBoletoLinkSection incomeId={initial.id} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !description.trim() || !amount}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <PersonalCategoryCreator
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
        createCategory={createCategory}
        onCreated={(c) => setCategory(c.name)}
      />
    </Dialog>
  );
}
