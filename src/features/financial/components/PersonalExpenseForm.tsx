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
import { Switch } from "@/components/ui/switch";
import { Plus, X, PiggyBank, PlusCircle, Loader2 } from "lucide-react";
import { Expense } from "@/types/loan";
import { personalCategories, resolvePersonalIcon } from "@/features/financial/lib/personalExpenseCategories";
import { usePiggyBanks, buildPiggyTag } from "@/features/piggyBanks/hooks/usePiggyBanks";
import { useCreditCards } from "@/features/creditCards/hooks/useCreditCards";
import { usePersonalExpenseCategories } from "@/features/financial/hooks/usePersonalExpenseCategories";
import { PersonalCategoryCreator } from "@/features/financial/components/PersonalCategoryCreator";
import { MoneyInput } from "@/components/ui/money-input";
import { useDescriptionHistory } from "@/features/financial/hooks/useDescriptionHistory";

/** Pick the user's default credit card — prefers Nubank, falls back to first card. */
function pickDefaultCard<T extends { bank: string; nickname: string }>(cards: T[]): T | null {
  if (!cards.length) return null;
  const nubank = cards.find(
    (c) =>
      c.bank?.toLowerCase().includes("nubank") ||
      c.nickname?.toLowerCase().includes("nubank"),
  );
  return nubank ?? cards[0];
}

interface Props {
  onAdd: (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => void;
  onClose: () => void;
}

const paymentMethods = ["Dinheiro", "Pix", "Débito", "Crédito", "Boleto", "Débito automático"];

type ExpenseKind = "unica" | "parcelada" | "fixa" | "recorrente_pos_pagamento";
const FIXED_RECURRING_INSTALLMENTS = 999;

export function PersonalExpenseForm({ onAdd, onClose }: Props) {
  const { piggyBanks, addDeposit, createRecurrence } = usePiggyBanks();
  const { cards } = useCreditCards();
  const { categories: customCategories, create: createCategory } = usePersonalExpenseCategories();
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const { suggestions, record } = useDescriptionHistory("personal-expense");

  const [form, setForm] = useState({
    description: "",
    amount: "",
    kind: "unica" as ExpenseKind,
    category: "",
    paymentMethod: "Pix",
    installments: "1",
    dueDate: todayInAppTz(),
    notes: "",
  });
  const [cardId, setCardId] = useState<string>("");
  const [toPiggy, setToPiggy] = useState(false);
  const [piggyId, setPiggyId] = useState<string>("");
  const [piggyRecurrence, setPiggyRecurrence] = useState<"none" | "fixed" | "until">("none");
  const [piggyEndDate, setPiggyEndDate] = useState<string>("");

  // Auto-select default card (Nubank preferred) when Crédito is chosen
  useEffect(() => {
    if (form.paymentMethod === "Crédito" && !cardId && cards.length) {
      const def = pickDefaultCard(cards);
      if (def) setCardId(def.id);
    }
    if (form.paymentMethod !== "Crédito" && cardId) {
      setCardId("");
    }
  }, [form.paymentMethod, cards, cardId]);

  const selectedCard = cards.find((c) => c.id === cardId) ?? null;

  const buildPaymentNotes = (freeText: string) => {
    if (form.paymentMethod === "Crédito" && selectedCard) {
      const tag = (selectedCard.nickname || selectedCard.lastFour || selectedCard.bank).trim();
      const head = `[Crédito] Cartão: ${tag} {ID:${selectedCard.id}}`;
      return freeText ? `${head}\n${freeText}` : head;
    }
    return freeText ? `[${form.paymentMethod}] ${freeText}` : `[${form.paymentMethod}]`;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) return;
    if (submitting) return;
    setSubmitting(true);
    const amount = parseFloat(form.amount) || 0;

    if (toPiggy) {
      if (!piggyId) {
        setSubmitting(false);
        return;
      }
      try {
        const baseNotes = buildPaymentNotes(form.notes);
        await onAdd({
          description: form.description,
          amount,
          type: "fixa",
          category: "Cofrinho",
          installments: undefined,
          paidInstallments: undefined,
          dueDate: form.dueDate,
          notes: buildPiggyTag(piggyId, baseNotes),
          scope: "personal",
        });
        // Note: o aporte só é creditado no cofrinho quando a despesa for marcada como paga.

        if (piggyRecurrence !== "none") {
          await createRecurrence({
            piggyBankId: piggyId,
            amount,
            startDate: form.dueDate,
            endDate: piggyRecurrence === "until" ? (piggyEndDate || null) : null,
            description: form.description,
          });
        }
        record(form.description);
        setShowSuccess(true);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!form.category) {
      setSubmitting(false);
      return;
    }
    const notesWithMethod = buildPaymentNotes(form.notes);

    let payload: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">;
    const commonPayload = {
      description: form.description,
      category: form.category,
      dueDate: form.dueDate,
      notes: notesWithMethod,
      scope: "personal" as const,
      // IMPORTANTE: `payment_method_id` tem FK para `payment_methods`.
      // O cartão de crédito NUNCA pode ser gravado aqui — seu vínculo é o
      // marcador {ID:uuid} na nota, lido por isCreditCardExpense/extractCardIdFromNotes.
      paymentMethodId: null,
      recurrenceType: (form.kind === "recorrente_pos_pagamento" ? "after_payment" : "standard") as "standard" | "after_payment",
    };

    if (form.kind === "parcelada") {
      const installments = Math.max(1, parseInt(form.installments) || 1);
      payload = {
        ...commonPayload,
        amount: amount * installments,
        type: "recorrente",
        installments,
        paidInstallments: 0,
      };
    } else if (form.kind === "fixa" || form.kind === "recorrente_pos_pagamento") {
      payload = {
        ...commonPayload,
        amount: amount * FIXED_RECURRING_INSTALLMENTS,
        type: "recorrente",
        installments: FIXED_RECURRING_INSTALLMENTS,
        paidInstallments: 0,
        recurrenceType: commonPayload.recurrenceType,
      };
    } else {
      payload = {
        ...commonPayload,
        amount,
        type: "fixa",
      };
    }
    try {
      await onAdd(payload);
      record(form.description);
      setShowSuccess(true);
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
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
      <SuccessAnimation show={showSuccess} onComplete={onClose} message={toPiggy ? "Aporte registrado!" : "Despesa cadastrada!"} />
      <Card no3d className="!bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:border sm:pt-0 sm:pb-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Nova Despesa Pessoal</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder={toPiggy ? "Ex: Aporte mensal" : "Ex: Supermercado do mês"}
                list="personal-expense-desc-history"
                required
              />
              <datalist id="personal-expense-desc-history">
                {suggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">{amountLabel}</Label>
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
                <Select value={form.kind} onValueChange={(v) => update("kind", v)} disabled={toPiggy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unica">Única</SelectItem>
                    <SelectItem value="parcelada">Parcelada</SelectItem>
                    <SelectItem value="fixa">Fixa (mensal)</SelectItem>
                    <SelectItem value="recorrente_pos_pagamento">Recorrente após pagamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.kind === "parcelada" && !toPiggy && (
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
            {form.kind === "fixa" && !toPiggy && (
              <p className="text-xs text-muted-foreground">
                Despesa mensal recorrente sem prazo final.
              </p>
            )}

            {piggyBanks.length > 0 && (
              <div className="rounded-lg border border-border/50 p-3 space-y-3 bg-primary/[0.03]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <PiggyBank className="h-4 w-4 text-primary shrink-0" />
                    <Label htmlFor="to-piggy" className="text-sm cursor-pointer">
                      Destinar a um cofrinho
                    </Label>
                  </div>
                  <Switch
                    id="to-piggy"
                    checked={toPiggy}
                    onCheckedChange={(v) => {
                      setToPiggy(v);
                      if (v && !piggyId) setPiggyId(piggyBanks[0].id);
                      if (v) update("kind", "unica");
                    }}
                  />
                </div>
                {toPiggy && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Cofrinho</Label>
                      <Select value={piggyId} onValueChange={setPiggyId}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {piggyBanks.map((pb) => (
                            <SelectItem key={pb.id} value={pb.id}>
                              <span className="inline-flex items-center gap-2">
                                <PiggyBank className="h-3.5 w-3.5" style={{ color: `hsl(${pb.color})` }} />
                                {pb.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Recorrência do aporte</Label>
                      <Select value={piggyRecurrence} onValueChange={(v) => setPiggyRecurrence(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Único (apenas hoje)</SelectItem>
                          <SelectItem value="fixed">Fixa (mensal, sem fim)</SelectItem>
                          <SelectItem value="until">Mensal com data de fim</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {piggyRecurrence === "until" && (
                      <div>
                        <Label className="text-xs">Aportar até</Label>
                        <DatePickerField
                          value={piggyEndDate}
                          onChange={setPiggyEndDate}
                          placeholder="Selecione a data final"
                        />
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Aportes não entram no "Gasto do mês" e rendem ~100% CDI ao dia.
                      {piggyRecurrence !== "none" && " Novos aportes serão criados automaticamente a cada mês."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!toPiggy && (
              <div>
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
                    Nova categoria
                  </Button>
                </div>
                <Select value={form.category} onValueChange={(v) => update("category", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      // Customs têm prioridade sobre built-ins de mesmo nome,
                      // assim editar uma categoria padrão não a duplica.
                      const customNames = new Set(
                        customCategories.map((c) => c.name.trim().toLowerCase()),
                      );
                      const builtIns = personalCategories.filter(
                        (c) => !customNames.has(c.name.trim().toLowerCase()),
                      );
                      return (
                        <>
                          {builtIns.map((c) => {
                            const Icon = c.icon;
                            return (
                              <SelectItem key={c.name} value={c.name}>
                                <span className="inline-flex items-center gap-2">
                                  <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${c.color})` }} />
                                  {c.name}
                                </span>
                              </SelectItem>
                            );
                          })}
                          {customCategories.length > 0 && builtIns.length > 0 && (
                            <div className="my-1 border-t border-border" />
                          )}
                          {customCategories.map((c) => {
                            const Icon = resolvePersonalIcon(c.icon);
                            return (
                              <SelectItem key={c.id} value={c.name}>
                                <span className="inline-flex items-center gap-2">
                                  <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${c.color})` }} />
                                  {c.name}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </>
                      );
                    })()}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={form.paymentMethod} onValueChange={(v) => update("paymentMethod", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dueDate">Data {toPiggy ? "do aporte" : "de Pagamento"}</Label>
                <DatePickerField
                  id="dueDate"
                  value={form.dueDate}
                  onChange={(v) => update("dueDate", v)}
                />
              </div>
            </div>
            {form.paymentMethod === "Crédito" && (
              <div>
                <Label>Cartão</Label>
                <Select value={cardId} onValueChange={setCardId}>
                  <SelectTrigger>
                    <SelectValue placeholder={cards.length ? "Selecione" : "Nenhum cartão cadastrado"} />
                  </SelectTrigger>
                  <SelectContent>
                    {cards.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhum cartão cadastrado
                      </div>
                    )}
                    {cards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nickname || c.bank}
                        {c.lastFour ? ` •••• ${c.lastFour}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Notas opcionais..."
                rows={2}
              />
            </div>

            {!toPiggy && parseFloat(form.amount) > 0 && (
              <div className="rounded-lg bg-muted p-4 space-y-1">
                {form.kind === "parcelada" && parseInt(form.installments) > 1 && (
                  <p className="text-sm text-muted-foreground">
                    Valor total: <span className="font-semibold text-foreground">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount) * (parseInt(form.installments) || 1))}
                    </span> ({form.installments}x de <span className="font-semibold text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount))}</span>)
                  </p>
                )}
                {form.kind === "fixa" && (
                  <p className="text-sm text-muted-foreground">
                    Despesa mensal recorrente sem prazo final — <span className="font-semibold text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount))}</span>/mês.
                  </p>
                )}
                {form.kind === "recorrente_pos_pagamento" && (
                  <p className="text-sm text-muted-foreground">
                    A próxima despesa será gerada somente após o pagamento desta — <span className="font-semibold text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount))}</span>/mês.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Ao pagar, <span className="font-semibold text-destructive">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount))}
                  </span> será debitado do saldo.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting || (toPiggy && !piggyId)}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {toPiggy ? "Aportando..." : "Cadastrando..."}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  {toPiggy ? "Aportar no cofrinho" : "Cadastrar Despesa"}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PersonalCategoryCreator
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
        createCategory={createCategory}
        onCreated={(cat) => update("category", cat.name)}
      />
    </div>
  );
}
