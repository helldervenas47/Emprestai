import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Expense } from "@/types/loan";
import { personalCategories } from "@/features/financial/lib/personalExpenseCategories";
import { usePersonalExpenseCategories } from "@/features/financial/hooks/usePersonalExpenseCategories";
import { useCreditCards } from "@/features/creditCards/hooks/useCreditCards";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExpenseBoletoLinkSection } from "@/features/financial/components/ExpenseBoletoLinkSection";



export type EditScope = "this" | "pending" | "all";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: Expense | null;
  warning?: string | null;
  onSave: (
    patch: {
      description: string;
      amount: number;
      dueDate: string;
      category: string;
      notes: string | null;
    },
    scope: EditScope,
  ) => Promise<void> | void;
}

const PAYMENT_METHODS = ["Dinheiro", "Pix", "Débito", "Crédito", "Boleto", "Débito automático"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

const PAYMENT_TAG_RE = /\[\s*(Dinheiro|Pix|D[ée]bito autom[áa]tico|D[ée]bito|Cr[eé]dito|Boleto)\s*\]/i;
const CARD_LINE_RE = /\[\s*Cr[eé]dito\s*\][^\n]*Cart[ãa]o:\s*([^\n(]+?)(?:\s*\(vence[^)]*\))?\s*(?:\n|$)/i;
// Rastreabilidade: marcador de edição
const EDITED_RE = /\n?\[\s*Editado em [^\]]+\]\s*$/i;

/** Detect current payment method from notes; defaults to Pix. */
function detectPaymentMethod(notes: string | null | undefined): PaymentMethod {
  if (!notes) return "Pix";
  const m = notes.match(PAYMENT_TAG_RE);
  if (!m) return "Pix";
  const v = m[1].toLowerCase();
  if (v.startsWith("din")) return "Dinheiro";
  if (v === "pix") return "Pix";
  if (v.startsWith("déb autom") || v.startsWith("deb autom") || v.includes("automá") || v.includes("automa")) return "Débito automático";
  if (v.startsWith("déb") || v.startsWith("deb")) return "Débito";
  if (v.startsWith("cré") || v.startsWith("cre")) return "Crédito";
  if (v.startsWith("bol")) return "Boleto";
  return "Pix";
}

/** Detect linked credit card tag (nickname or lastFour) from notes. */
function detectCardTag(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(CARD_LINE_RE);
  return m ? m[1].trim() : null;
}

/** Detect linked credit card ID from notes. */
function detectCardId(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/\{ID:([a-f0-9-]{36})\}/i);
  return m ? m[1] : null;
}

/** Strip payment tag, card line, and edited marker from notes — leaving only the user's free-text. */
function extractFreeNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  let n = notes;
  // Remove the [Crédito] Cartão: ... line entirely
  n = n.replace(CARD_LINE_RE, "").trim();
  // Remove any [Method] tag
  n = n.replace(PAYMENT_TAG_RE, "").trim();
  // Remove edited marker
  n = n.replace(EDITED_RE, "").trim();
  return n;
}

/**
 * Rebuild the notes payload preserving the same conventions used by
 * the Telegram bot and the manual form, then append an "Editado em" marker
 * for traceability.
 */
function buildNotes(opts: {
  paymentMethod: PaymentMethod;
  cardTag: string | null;
  cardId?: string | null;
  freeNotes: string;
}): string {
  const lines: string[] = [];
  if (opts.paymentMethod === "Crédito" && opts.cardTag) {
    const idSuffix = opts.cardId ? ` {ID:${opts.cardId}}` : "";
    lines.push(`[Crédito] Cartão: ${opts.cardTag.trim()}${idSuffix}`);
  } else {
    lines.push(`[${opts.paymentMethod}]`);
  }
  if (opts.freeNotes.trim()) lines.push(opts.freeNotes.trim());
  if (!EDITED_RE.test(opts.freeNotes)) {
    lines.push(`[Editado em ${format(new Date(), "dd/MM/yy HH:mm")}]`);
  }
  return lines.join("\n");
}

export function ExpenseEditDialog({
  open,
  onOpenChange,
  expense,
  warning,
  onSave,
}: Props) {
  const { cards } = useCreditCards();
  const { categories: customCategories, reload: reloadCategories } = usePersonalExpenseCategories();

  // Re-fetch categories whenever the dialog opens, to pick up any newly created
  // categories without needing to reload the page.
  useEffect(() => {
    if (open) {
      reloadCategories();
    }
  }, [open, reloadCategories]);


  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Pix");
  const [cardId, setCardId] = useState<string>("");
  const [freeNotes, setFreeNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<EditScope>("this");
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  // Hydrate from expense
  useEffect(() => {
    if (!expense) return;
    setDescription(expense.description);
    const inst = expense.installments ?? 0;
    const isParc = expense.type === "recorrente" && inst > 1;
    setAmount(String(isParc ? expense.amount / inst : expense.amount));
    setDueDate(expense.dueDate);
    setCategory(expense.category ?? "");
    const pm = detectPaymentMethod(expense.notes);
    setPaymentMethod(pm);
    setFreeNotes(extractFreeNotes(expense.notes));
    // Try to map the card ID or tag to a known card
    const detectedId = detectCardId(expense.notes);
    const tag = detectCardTag(expense.notes);
    
    if (detectedId && cards.length) {
      const found = cards.find(c => c.id === detectedId);
      if (found) {
        setCardId(found.id);
      } else {
        setCardId("");
      }
    } else if (tag && cards.length) {
      const lower = tag.toLowerCase();
      const found = cards.find(
        (c) =>
          c.nickname.toLowerCase() === lower ||
          c.lastFour === tag ||
          c.bank.toLowerCase() === lower,
      );
      if (found) {
        setCardId(found.id);
      } else {
        setCardId("");
      }
    } else if (pm === "Crédito" && cards.length && expense.paymentMethodId) {
      setCardId(expense.paymentMethodId);
    } else {
      setCardId("");
    }
  }, [expense, cards]);

  const wasEdited = useMemo(
    () => !!expense?.notes && EDITED_RE.test(expense.notes),
    [expense],
  );

  // Reset scope whenever a different expense is loaded
  useEffect(() => {
    setScope("this");
  }, [expense?.id]);

  const categoryOptions = useMemo(() => {
    const customNames = new Set(customCategories.map((c) => c.name.trim().toLowerCase()));
    const names = [
      ...personalCategories
        .filter((c) => !customNames.has(c.name.trim().toLowerCase()))
        .map((c) => c.name),
      ...customCategories.map((c) => c.name),
    ];

    if (category && !names.some((name) => name === category)) {
      names.push(category);
    }

    return names.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [category, customCategories]);

  if (!expense) return null;

  const isParcelada =
    expense.type === "recorrente" && (expense.installments ?? 0) > 1;
  const isChildInstallment = !!expense.parentExpenseId;
  // Show scope selector for installment parents OR for paid child installments
  const showScopeSelector = isParcelada || isChildInstallment;

  const selectedCard = cards.find((c) => c.id === cardId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 left-0 translate-x-0 translate-y-0 w-screen h-[100dvh] max-w-none max-h-[100dvh] rounded-none border-0 overflow-y-auto z-[2147483648] !p-0">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 py-2" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Voltar"
            onClick={() => onOpenChange(false)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base truncate">Editar lançamento</DialogTitle>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
        <div className="px-4 pb-4 pt-3 space-y-3">
        <DialogHeader className="sr-only">
          <DialogTitle>Editar lançamento</DialogTitle>
          <DialogDescription>
            {isParcelada
              ? `Esta despesa é parcelada (${expense.installments}x). Informe o valor da parcela — o total e todas as parcelas serão atualizados.`
              : "Altere os dados do lançamento. As alterações refletem em todos os relatórios."}
          </DialogDescription>
        </DialogHeader>

        {wasEdited && (
          <div className="text-[11px] rounded-md bg-muted text-muted-foreground border px-3 py-1.5">
            ✎ Esta despesa já foi editada anteriormente.
          </div>
        )}

        {warning && (
          <div className="text-xs rounded-md bg-warning/10 text-warning-foreground border border-warning/30 px-3 py-2">
            ⚠ {warning}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">
                {isParcelada ? "Valor da parcela" : "Valor"}
              </Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Data de vencimento</Label>
              <DatePickerField
                value={dueDate}
                onChange={setDueDate}
                placeholder="Selecione a data"
                popoverContentClassName="z-[2147483650]"
              />
            </div>
          </div>

          {isParcelada && Number(amount) > 0 && (expense.installments ?? 0) > 0 && (
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Valor total:{" "}
              <span className="font-semibold text-foreground">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                  Number(amount) * (expense.installments as number),
                )}
              </span>{" "}
              ({expense.installments}x de {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(amount))})
            </div>
          )}

          <div>
            <Label className="text-xs">Categoria</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-11 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>
                Selecione a categoria
              </option>
              {categoryOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => {
                  setPaymentMethod(v as PaymentMethod);
                  if (v !== "Crédito") setCardId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[2147483650]">
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {paymentMethod === "Crédito" && (
              <div>
                <Label className="text-xs">Cartão</Label>
                <Select value={cardId} onValueChange={setCardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="z-[2147483650]">
                    {cards.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhum cartão cadastrado
                      </div>
                    )}
                    {cards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nickname || c.bank}
                        {c.lastFour ? ` ····${c.lastFour}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={freeNotes}
              onChange={(e) => setFreeNotes(e.target.value)}
              rows={2}
              placeholder="Detalhes adicionais (opcional)"
            />
          </div>

          <ExpenseBoletoLinkSection expenseId={expense.id} />


          {showScopeSelector && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
              <Label className="text-xs font-semibold">Aplicar alteração em</Label>
              <RadioGroup
                value={scope}
                onValueChange={(v) => setScope(v as EditScope)}
                className="gap-2"
              >
                <label
                  htmlFor="scope-this"
                  className={`flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors ${
                    scope === "this" ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="this" id="scope-this" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">Apenas esta parcela</div>
                    <div className="text-[11px] text-muted-foreground">Altera somente o lançamento selecionado.</div>
                  </div>
                </label>
                <label
                  htmlFor="scope-pending"
                  className={`flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors ${
                    scope === "pending" ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="pending" id="scope-pending" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">Esta parcela e as próximas</div>
                    <div className="text-[11px] text-muted-foreground">Mantém inalteradas as parcelas anteriores e já pagas.</div>
                  </div>
                </label>
                <label
                  htmlFor="scope-all"
                  className={`flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors ${
                    scope === "all" ? "border-destructive bg-destructive/5" : "border-border/50 hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="all" id="scope-all" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                      Todas as parcelas
                    </div>
                    <div className="text-[11px] text-muted-foreground">Reescreve também o histórico de parcelas já quitadas.</div>
                  </div>
                </label>

              </RadioGroup>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={
              saving ||
              !description ||
              !amount ||
              !category ||
              (paymentMethod === "Crédito" && !cardId)
            }
            onClick={async () => {
              if (showScopeSelector && scope === "all") {
                setConfirmAllOpen(true);
                return;
              }
              await doSave(scope);
            }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>

      <AlertDialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <AlertDialogContent className="z-[2147483649]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar alteração no histórico
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a alterar <strong>todas as despesas relacionadas, incluindo as parcelas já pagas</strong>.
              Esta ação reescreve registros históricos do seu fluxo financeiro e não pode ser desfeita automaticamente.
              Tem certeza que deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setConfirmAllOpen(false);
                await doSave("all");
              }}
            >
              Sim, alterar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );

  async function doSave(effectiveScope: EditScope) {
    setSaving(true);
    try {
      const cardTag = selectedCard
        ? selectedCard.nickname || selectedCard.lastFour || selectedCard.bank
        : null;
      const notes = buildNotes({
        paymentMethod,
        cardTag: paymentMethod === "Crédito" ? cardTag : null,
        cardId: paymentMethod === "Crédito" ? cardId : null,
        freeNotes,
      });
      const inst = expense.installments ?? 0;
      const totalAmount = isParcelada ? Number(amount) * inst : Number(amount);
      await onSave(
        {
          description,
          amount: totalAmount,
          dueDate,
          category,
          notes,
        },
        showScopeSelector ? effectiveScope : "this",
      );
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }
}
