import { useState, useCallback, useMemo, useEffect, useId } from "react";
import { formatDateBR } from "@/features/financial/lib/formatDateSafe";
import { usePaymentCelebration } from "@/hooks/usePaymentCelebration";
import { todayInAppTz, todayDateInAppTz } from "@/lib/timezone";
import { getDueStatusBadge, getDueAccent } from "@/features/financial/lib/dueStatus";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Expense } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Search, Trash2, CheckCircle, CheckCircle2, Clock, Receipt, Calendar, Tag,
  CircleDollarSign, ChevronLeft, ChevronRight, ChevronDown, Undo2, Pencil, Check, CalendarCheck,
  Save, AlertCircle, CreditCard
} from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ExpenseBoletoLinkButton } from "@/features/financial/components/ExpenseBoletoLinkButton";
import { EditScopeDialog } from "@/components/EditScopeDialog";
import { CategoryDetailsSheet, CategoryEntry } from "@/features/financial/components/CategoryDetailsSheet";
import { applyExpenseScopedUpdate, isExpenseInSeries } from "@/features/financial/lib/seriesEdit";
import { useFinanceComponentDebug } from "@/lib/financeDebug";
import { FinancialHeroCard, FinancialMetricCard, type HeroMetric } from "@/features/financial/components/financial";
import { getInstallmentEdits, getInstallmentScheduleStart, IndividualInstallmentEdit, calculateTotalFromInstallments, serializeCustomInstallments, deserializeCustomInstallments, withoutInstallmentReceipts, displayNotes } from "@/features/financial/lib/installmentEdit";
import { supabase } from "@/integrations/supabase/userClient";
import { isAfterPaymentRecurrence } from "@/features/financial/lib/expensePaymentUtils";
import { isCreditCardExpense } from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { filterBusinessExpenses, isExpenseOccurringInMonth, isCoreBotExpense } from "../lib/expenseFilterCore";
import { useBusinessExpenseCategories } from "@/features/financial/hooks/useBusinessExpenseCategories";

interface Props {
  expenses: Expense[];
  onPay: (id: string, skipBalanceAdjust?: boolean, payDate?: string, paidAmount?: number) => void;
  onUnpay?: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  readOnly?: boolean;
}

type Filter = "all" | "pending" | "paid" | "overdue";

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function isOverdue(expense: Expense): boolean {
  if (expense.paid) return false;
  const today = todayInAppTz();
  return expense.dueDate < today;
}

type ExpenseKind = "unica" | "parcelada" | "fixa" | "recorrente_pos_pagamento";
const FIXED_RECURRING_INSTALLMENTS = 999;

function detectKind(expense: Expense): ExpenseKind {
  if (expense.type === "recorrente") {
    if (expense.recurrenceType === "after_payment") return "recorrente_pos_pagamento";
    if ((expense.installments ?? 0) >= FIXED_RECURRING_INSTALLMENTS) return "fixa";
    if ((expense.installments ?? 0) > 1) return "parcelada";
  }
  return "unica";
}

function ExpenseEditDialog({ expense, expenses, open, onOpenChange, onSave, formatCurrency }: {
  expense: Expense;
  expenses: Expense[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  formatCurrency: (v: number) => string;
}) {
  const initialKind = detectKind(expense);
  const initialUnit =
    initialKind === "parcelada" ? expense.amount / (expense.installments || 1) :
    initialKind === "fixa" ? expense.amount / FIXED_RECURRING_INSTALLMENTS :
    expense.amount;

  const [form, setForm] = useState({
    description: expense.description,
    amount: String(initialUnit),
    kind: initialKind as ExpenseKind,
    category: expense.category,
    installments: String(expense.installments && expense.installments < FIXED_RECURRING_INSTALLMENTS ? expense.installments : 1),
    dueDate: expense.dueDate,
    notes: expense.notes || "",
    generateIncomeOnPay: !!expense.generateIncomeOnPay,
    customInstallments: [] as IndividualInstallmentEdit[],
  });

  const [savingInstallmentId, setSavingInstallmentId] = useState<string | number | null>(null);
  const { categories } = useBusinessExpenseCategories();

  useEffect(() => {
    if (open) {
      const k = detectKind(expense);
      const unit =
        k === "parcelada" ? expense.amount / (expense.installments || 1) :
        k === "fixa" ? expense.amount / FIXED_RECURRING_INSTALLMENTS :
        expense.amount;
      setForm({
        description: expense.description,
        amount: String(unit),
        kind: k,
        category: expense.category,
        installments: String(expense.installments && expense.installments < FIXED_RECURRING_INSTALLMENTS ? expense.installments : 1),
        dueDate: expense.dueDate,
        notes: expense.notes || "",
        generateIncomeOnPay: !!expense.generateIncomeOnPay,
        customInstallments: getInstallmentEdits(expense, expenses.filter(e => e.parentExpenseId === expense.id)),
      });
    }
  }, [open, expense]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(form.amount) || 0;
    let patch: Partial<Omit<Expense, "id" | "createdAt">>;
    
    if (form.kind === "parcelada") {
      const inst = Math.max(1, parseInt(form.installments) || 1);
      const totalAmount = calculateTotalFromInstallments(form.customInstallments);
      
      // Salva customizações nas notas para persistência se houver edições em parcelas virtuais
      const customData = serializeCustomInstallments(form.customInstallments);
      const baseNotes = form.notes.replace(/\[CustomInstallments:.*?\]/g, "").trim();
      const finalNotes = customData ? `${baseNotes} [CustomInstallments:${customData}]`.trim() : baseNotes;

      patch = {
        description: form.description,
        amount: totalAmount,
        type: "recorrente",
        category: form.category,
        installments: inst,
        dueDate: form.dueDate,
        notes: finalNotes || undefined,
        generateIncomeOnPay: form.generateIncomeOnPay,
      };
    } else if (form.kind === "fixa" || form.kind === "recorrente_pos_pagamento") {
      patch = {
        description: form.description,
        amount: parsedAmount * FIXED_RECURRING_INSTALLMENTS,
        type: "recorrente",
        category: form.category,
        installments: FIXED_RECURRING_INSTALLMENTS,
        dueDate: form.dueDate,
        notes: form.notes || undefined,
        generateIncomeOnPay: form.generateIncomeOnPay,
        recurrenceType: form.kind === "recorrente_pos_pagamento" ? "after_payment" : "standard",
      };
    } else {
      patch = {
        description: form.description,
        amount: parsedAmount,
        type: "fixa",
        category: form.category,
        installments: undefined,
        dueDate: form.dueDate,
        notes: form.notes || undefined,
        generateIncomeOnPay: form.generateIncomeOnPay,
      };
    }
    onSave(patch);
  };

  const handleUpdateInstallment = async (index: number, patch: Partial<IndividualInstallmentEdit>) => {
    const updated = [...form.customInstallments];
    updated[index] = { ...updated[index], ...patch };
    setForm(prev => ({ ...prev, customInstallments: updated }));

    const inst = updated[index];
    if (inst.id) {
      // Parcela já existe como registro individual (filha paga), atualiza no banco
      setSavingInstallmentId(inst.id);
      try {
        const payload: any = {};
        if (patch.amount !== undefined) payload.amount = patch.amount;
        if (patch.dueDate !== undefined) payload.due_date = patch.dueDate;
        
        await supabase.from("expenses").update(payload).eq("id", inst.id);
      } finally {
        setSavingInstallmentId(null);
      }
    }
  };

  const updateIndividualInstallmentAndRecalculateTotal = (index: number, patch: Partial<IndividualInstallmentEdit>) => {
    const updated = [...form.customInstallments];
    updated[index] = { ...updated[index], ...patch };
    
    // Se a parcela for "virtual" (não salva individualmente ainda), atualizamos o total do pai
    const newTotal = calculateTotalFromInstallments(updated);
    
    setForm(prev => ({ 
      ...prev, 
      customInstallments: updated,
      amount: String(newTotal / (parseInt(prev.installments) || 1)) // Mantemos a compatibilidade com o campo amount unitário se necessário
    }));

    handleUpdateInstallment(index, patch);
  };

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const amountLabel =
    form.kind === "parcelada" ? "Valor da Parcela (R$)" :
    (form.kind === "fixa" || form.kind === "recorrente_pos_pagamento") ? "Valor Mensal (R$)" : "Valor (R$)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <DialogTitle>Editar lançamento</DialogTitle>
          </div>
          <Button variant="ghost" className="h-auto p-0 text-sm font-normal" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-desc">Descrição</Label>
            <Input id="edit-desc" value={form.description} onChange={e => update("description", e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-amount">{amountLabel}</Label>
              <Input id="edit-amount" type="number" step="0.01" value={form.amount} onChange={e => update("amount", e.target.value)} required />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.kind} onValueChange={v => update("kind", v)}>
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
          {form.kind === "parcelada" && (
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
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="edit-gen-income" className="text-sm font-medium">Gerar receita ao pagar</Label>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Cria uma receita idêntica ao confirmar o pagamento.
                </p>
              </div>
              <Switch
                id="edit-gen-income"
                checked={form.generateIncomeOnPay}
                onCheckedChange={(v) => setForm(prev => ({ ...prev, generateIncomeOnPay: v }))}
              />
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-2 border-t border-border/40">
              <Receipt className="h-3.5 w-3.5" />
              <span>Boleto vinculado</span>
              <div className="flex-1" />
              <Button type="button" variant="ghost" className="h-7 px-2 text-[11px] text-primary hover:bg-primary/10">
                + Vincular
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/60 italic">Nenhum boleto vinculado. Cada despesa pode ter até 1 boleto.</p>
          </div>
          {form.kind === "parcelada" && parseInt(form.installments) > 1 && (
            <div className="space-y-4 pt-2 border-t border-border/40">
              <div className="rounded-xl bg-muted/50 p-3 flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground/70">Aplicar alteração em</span>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <button
                    type="button"
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl border bg-primary/5 border-primary/20 transition-all active:scale-95"
                  >
                    <div className="h-4 w-4 rounded-full border-2 border-primary flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                    <p className="text-[10px] font-bold text-center leading-tight">Apenas esta</p>
                  </button>
                  <button
                    type="button"
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl border bg-card/50 border-border/50 transition-all active:scale-95"
                  >
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                    <p className="text-[10px] font-bold text-center leading-tight text-muted-foreground">Próximas</p>
                  </button>
                  <button
                    type="button"
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl border bg-card/50 border-border/50 transition-all active:scale-95"
                  >
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                    <p className="text-[10px] font-bold text-center leading-tight text-muted-foreground">Todas</p>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Detalhamento das Parcelas
                  </Label>
                  <span className="text-[11px] font-medium text-muted-foreground truncate max-w-[150px]">
                    Total: {formatCurrency(calculateTotalFromInstallments(form.customInstallments))}
                  </span>
                </div>
                
                <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {form.customInstallments.map((inst, idx) => (
                    <div key={idx} className={`p-3 rounded-xl border bg-card/50 space-y-3 transition-all ${inst.paid ? "opacity-60 bg-muted/20" : "hover:border-primary/30"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground/80 uppercase">Parcela {idx + 1}/{form.installments}</span>
                        {inst.paid && (
                          <Badge variant="outline" className="text-[9px] h-4 bg-success/10 text-success border-success/20 px-1.5 uppercase font-bold">
                            Paga
                          </Badge>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground/60">Vencimento</Label>
                          <DatePickerField 
                            value={inst.dueDate} 
                            onChange={(v) => updateIndividualInstallmentAndRecalculateTotal(idx, { dueDate: v })}
                            disabled={inst.paid}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground/60">Valor (R$)</Label>
                          <Input 
                            type="number" 
                            step="0.01" 
                            value={inst.amount} 
                            onChange={(e) => updateIndividualInstallmentAndRecalculateTotal(idx, { amount: parseFloat(e.target.value) || 0 })}
                            className="h-8 text-xs font-medium"
                            disabled={inst.paid}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {form.kind === "fixa" && (
            <div className="rounded-xl bg-muted/30 p-3 border border-border/30">
              <p className="text-[11px] text-muted-foreground flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                Despesa mensal recorrente sem prazo final definido.
              </p>
            </div>
          )}
          <DialogFooter className="pt-2 border-t border-border/40">
            <Button data-mutation type="submit" className="w-full h-11 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-[0.98]">
              Salvar Alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function isTelegramBotExpense(e: any) {
  return !!(e.metadata?.via_telegram || e.metadata?.kind === "telegram_bot");
}
function isCommentBotExpense(e: any) {
  return /\[\s*bot\s*\]/i.test(e.notes ?? "");
}
function isBotExpense(e: any) {
  return isTelegramBotExpense(e) || isCommentBotExpense(e);
}

export function ExpenseList({ expenses, onPay, onUnpay, onDelete, onUpdate, readOnly = false }: Props) {
  const instanceId = useId();
  useFinanceComponentDebug("ExpenseList");
  const { mask } = useHideValues();
  const { celebrate } = usePaymentCelebration();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [cardFilter, setCardFilter] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "auto" | "manual">("all");
  
  const now = todayDateInAppTz();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [viewPaymentsExpenseId, setViewPaymentsExpenseId] = useState<string | null>(null);
  const [showClearPayments, setShowClearPayments] = useState(false);
  const [expensesExpanded, setExpensesExpanded] = useState(false);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [payingExpenseId, setPayingExpenseId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState<string>("");
  const [paidAmountInput, setPaidAmountInput] = useState<string>("");
  const [unpayingExpenseId, setUnpayingExpenseId] = useState<string | null>(null);
  const [unpayConfirm, setUnpayConfirm] = useState<{ run: () => void | Promise<void>; label: string } | null>(null);
  const [viewDateExpenseId, setViewDateExpenseId] = useState<string | null>(null);
  const [editingPaidDate, setEditingPaidDate] = useState(false);
  const [editPaidDateValue, setEditPaidDateValue] = useState("");
  const [pendingScopeEdit, setPendingScopeEdit] = useState<
    { target: Expense; patch: Partial<Omit<Expense, "id" | "createdAt">> } | null
  >(null);


  const getInstallmentAmount = useCallback((e: Expense) => {
    const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
    return isRec ? e.amount / e.installments! : e.amount;
  }, []);

  const monthFiltered = useMemo(() => {
    // 1. Filtra despesas Business (remove cartões de crédito completamente deste modo)
    const businessData = filterBusinessExpenses(withoutInstallmentReceipts(expenses));

    // 2. Filtra pelo mês selecionado
    return businessData.filter((e) => isExpenseOccurringInMonth(e, selectedMonth));
  }, [expenses, selectedMonth]);

  const isRecFullyPaid = useCallback(
    (e: Expense) => e.type === "recorrente" && !!e.installments && e.installments > 1 && e.paid,
    [],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const [sYear, sMonth] = selectedMonth.split("-").map(Number);
    
    return monthFiltered
      .filter((e) => {
        // No modo empresarial, se for uma despesa automática de bônus (kind: goal_bonus),
        // só mostramos se ela for avulsa (não vinculada a um Payroll principal).
        // Isso evita que o bônus apareça duas vezes: uma na folha cheia e outra no item de bônus.
        if (isCoreBotExpense(e) && e.category === "Salários") {
          const notes = String(e.notes || "");
          if (notes.includes("[Payroll:") || (e as any).metadata?.payroll_id) {
            return false;
          }
        }
        
        const matchesSearch = e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
        const matchesSource = sourceFilter === "all" || (sourceFilter === "auto" ? isBotExpense(e) : !isBotExpense(e));
        return matchesSearch && matchesSource;
      })
      .map((e) => {
        // Para despesas parceladas, precisamos determinar o status da parcela específica deste mês
        const isRec = e.type === "recorrente" && e.installments && e.installments > 1
          && !isAfterPaymentRecurrence(e);
        if (!isRec) return e;

        const scheduleStart = getInstallmentScheduleStart(e);
        const [sy, sm, originalDay] = scheduleStart.split("-");
        const [sYear, sMonth] = selectedMonth.split("-").map(Number);
        const [startYear, startMonth] = [Number(sy), Number(sm)];
        
        // Posição da parcela (0-indexed) baseada no avanço do tempo (meses desde o início)
        const diffMonths = (sYear * 12 + sMonth) - (startYear * 12 + startMonth);
        const installmentIndex = Math.min(Math.max(0, diffMonths), (e.installments || 1) - 1);

        // Se a parcela já foi paga, o total de parcelas pagas será maior que o índice desta parcela
        // installmentIndex é 0-based, paidInstallments é 1-based.
        const isThisInstallmentPaid = (e.paidInstallments || 0) > installmentIndex;
        
        // Ajusta a data de vencimento visual para o mês selecionado (preservando o dia original)
        const virtualDueDate = `${selectedMonth}-${originalDay}`;

        return {
          ...e,
          paid: isThisInstallmentPaid,
          dueDate: virtualDueDate,
          paidDate: isThisInstallmentPaid ? e.paidDate : undefined
        };
      })
      .filter((e) => {
        if (filter === "pending") return !e.paid;
        if (filter === "paid") return e.paid;
        if (filter === "overdue") return isOverdue(e);
        return true;
      })
      .sort((a, b) => {
        if (a.paid !== b.paid) return a.paid ? 1 : -1;
        return b.dueDate.localeCompare(a.dueDate);
      });
  }, [monthFiltered, search, filter, selectedMonth]);

  const visibleMonth = useMemo(
    () => monthFiltered,
    [monthFiltered],
  );

  const { totalPending, totalPaid, totalOverdue, countPending, countOverdue, countPaid } = useMemo(() => {
    let tPending = 0, tPaid = 0, tOverdue = 0;
    let cPending = 0, cOverdue = 0, cPaid = 0;
    const todayStr = todayInAppTz();

    for (const raw of visibleMonth) {
      const e = filtered.find(f => f.id === raw.id) || raw;
      const amt = getInstallmentAmount(e);
      const isPaid = e.paid;
      const isOverdueItem = !isPaid && e.dueDate < todayStr;
      
      if (isPaid) tPaid += amt;
      if (!isPaid) tPending += amt;
      if (isOverdueItem) tOverdue += amt;
      
      if (!isPaid && !isOverdueItem) cPending += 1;
      if (isOverdueItem) cOverdue += 1;
      if (isPaid) cPaid += 1;
    }
    return {
      totalPending: tPending, totalPaid: tPaid, totalOverdue: tOverdue,
      countPending: cPending, countOverdue: cOverdue, countPaid: cPaid,
    };
  }, [visibleMonth, filtered, getInstallmentAmount]);

  void countOverdue;


  type SummaryView = "pending" | "paid" | "overdue";
  const [summaryView, setSummaryView] = useState<SummaryView | null>(null);
  const summaryViewMeta: Record<SummaryView, { label: string; total: number }> = {
    pending: { label: "Pendente", total: totalPending },
    overdue: { label: "Atrasado", total: totalOverdue },
    paid: { label: "Pago", total: totalPaid },
  };
  const summaryEntries: CategoryEntry[] = useMemo(() => {
    if (!summaryView) return [];
    return visibleMonth
      .filter((e) => {
        const item = filtered.find(f => f.id === e.id) || e;
        const isPaid = item.paid;
        const overdue = isOverdue(item);
        if (summaryView === "paid" && !isPaid) return false;
        if (summaryView === "pending" && (isPaid || overdue)) return false;
        if (summaryView === "overdue" && !overdue) return false;
        return true;
      })
      .map((e) => {
        const item = filtered.find(f => f.id === e.id) || e;
        const overdue = isOverdue(item);
        const v = getInstallmentAmount(item);
        return {
          id: `exp-${item.id}`,
          description: item.description,
          amount: v,
          date: item.paid && item.paidDate ? item.paidDate : item.dueDate,
          type: "despesa" as const,
          status: item.paid ? "paid" as const : overdue ? "overdue" as const : "pending" as const,
          account: item.category,
        };
      });
  }, [summaryView, visibleMonth, filtered, getInstallmentAmount]);

  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const prevMonth = () => {
    const d = new Date(selYear, selMonthNum - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(selYear, selMonthNum, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const hasPaidExpenses = expenses.some(e => e.paid || (e.paidInstallments && e.paidInstallments > 0));

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      {/* Month nav (mesmo padrão da aba Receitas) */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button type="button"
          className="text-sm font-medium text-foreground min-w-[140px] text-center capitalize hover:text-primary transition-colors"
          onClick={() => {
            const n = todayDateInAppTz();
            setSelectedMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
          }}
        >
          {format(new Date(selYear, selMonthNum - 1, 1), "MMMM yyyy", { locale: ptBR })}
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Hero: despesas do mês (modelo Finanças) */}
      <FinancialHeroCard
        eyebrow="Despesas da empresa"
        value={formatCurrency(totalPending)}
        metrics={[
          { label: "Pagas", value: formatCurrency(totalPaid), tone: "success", icon: CheckCircle, onClick: () => setSummaryView("paid") },
          { label: "A pagar", value: formatCurrency(totalPending), tone: "warning", icon: CircleDollarSign, onClick: () => setSummaryView("pending") },
          { label: "Atrasado", value: formatCurrency(totalOverdue), tone: "destructive", icon: Clock, onClick: () => setSummaryView("overdue") },
          { label: "Lançamentos", value: String(visibleMonth.length), icon: Receipt },
        ] as any[]}
      />



      {/* Collapsible quick filter card (mirrors Receitas) */}
      <Card no3d className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-border/40 pb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSourceFilter(sourceFilter === "auto" ? "all" : "auto")}
            className={`rounded-xl transition-all duration-200 ${sourceFilter === "auto" ? "bg-primary text-primary-foreground border-primary" : ""}`}
            title="Despesas lançadas pelo bot do Telegram"
          >
            Automáticas ({monthFiltered.filter(isBotExpense).length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSourceFilter(sourceFilter === "manual" ? "all" : "manual")}
            className={`rounded-xl transition-all duration-200 ${sourceFilter === "manual" ? "bg-primary text-primary-foreground border-primary" : ""}`}
            title="Despesas registradas manualmente no app"
          >
            Manuais ({monthFiltered.filter((e) => !isBotExpense(e)).length})
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-border/40 pb-4 hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCardFilter(!cardFilter)}
            className={`rounded-xl transition-all duration-200 ${cardFilter ? "bg-primary text-primary-foreground border-primary" : ""}`}
          >
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Cartões ({monthFiltered.filter(e => isCreditCardExpense(e)).length})
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setExpensesExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 flex-wrap text-left rounded-lg -m-1 p-1 hover:bg-muted/40 active:bg-muted/60 transition-colors"
          aria-expanded={expensesExpanded}
          aria-controls="despesas-content"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Despesas ({filtered.length})</h2>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${expensesExpanded ? "rotate-180" : ""}`}
            />
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground leading-none">
              {!expensesExpanded
                ? "Pendente"
                : filter === "all" ? "Total"
                : filter === "paid" ? "Total pago"
                : filter === "pending" ? "Total a pagar"
                : "Total"}
            </div>
            <div className={`text-base font-bold ${
              !expensesExpanded ? "text-amber-600 dark:text-amber-400" :
              filter === "paid" ? "text-emerald-600 dark:text-emerald-400" :
              filter === "pending" ? "text-amber-600 dark:text-amber-400" :
              "text-foreground"
            }`}>
              {formatCurrency(
                !expensesExpanded
                  ? totalPending
                  : filtered.reduce((s, e) => s + getInstallmentAmount(e), 0)
              )}
            </div>
          </div>
        </button>

        <div
          id="despesas-content"
          className={`grid transition-all duration-300 ease-in-out ${expensesExpanded ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"}`}
        >
          <div className="overflow-hidden min-h-0">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Button
                type="button"
                size="sm"
                variant={filter === "all" ? "default" : "outline"}
                className="h-9 rounded-full min-w-0"
                onClick={() => setFilter("all")}
              >
                Todas
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filter === "pending" ? "default" : "outline"}
                className="h-9 rounded-full min-w-0 gap-1.5"
                onClick={() => setFilter("pending")}
              >
                <Clock className="h-3.5 w-3.5" /> Pendentes
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filter === "paid" ? "default" : "outline"}
                className="h-9 rounded-full min-w-0 gap-1.5"
                onClick={() => setFilter("paid")}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Pagas
              </Button>
            </div>

            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-full" />
              </div>
            </div>
          </div>
        </div>
      </Card>




      {/* Dialog limpar pagamentos */}
      <Dialog open={showClearPayments} onOpenChange={setShowClearPayments}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Limpar Pagamentos</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja limpar todos os dados de pagamento das despesas? As despesas serão mantidas, mas marcadas como não pagas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearPayments(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={async () => {
              for (const exp of expenses) {
                if (exp.paid) {
                  if (onUnpay) await onUnpay(exp.id);
                } else if ((exp.paidInstallments || 0) > 0 && onUnpay) {
                  const times = exp.paidInstallments || 0;
                  for (let t = 0; t < times; t++) {
                    await onUnpay(exp.id);
                  }
                }
              }
              setShowClearPayments(false);
            }}>
              <Trash2 className="h-4 w-4 mr-1" />
              Limpar Pagamentos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List */}
      {filtered.length === 0 ? (
        <Card no3d>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">
              {expenses.length === 0 ? "Nenhuma despesa cadastrada" : "Nenhuma despesa encontrada"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((expense, i) => {
            const overdue = isOverdue(expense);
            const dueAccent = getDueAccent(expense.dueDate, expense.paid);
            const hasPaidSomething = expense.paid || (expense.paidInstallments && expense.paidInstallments > 0);
            const isRecorrente = expense.type === "recorrente" && expense.installments && expense.installments > 1;
            const installmentAmount = isRecorrente ? expense.amount / expense.installments! : expense.amount;

            return (
              <div key={expense.id} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}>
              <Card no3d
                className={`relative overflow-hidden rounded-2xl border-border/50 bg-card/70 backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-lg ${
                  expense.paid ? "opacity-70" : dueAccent.border
                }`}
              >
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-0 left-0 w-1 ${dueAccent.bar}`}
                />
                <CardContent className="p-3 pl-4 sm:p-4 sm:pl-5">

                  <div
                    className={`flex items-start gap-3 sm:items-center sm:gap-4 ${!readOnly && onUpdate ? "cursor-pointer" : ""}`}
                    onClick={(e) => {
                      if (readOnly || !onUpdate) return;
                      const target = e.target as HTMLElement;
                      if (target.closest("[data-actions-row]") || target.closest("button") || target.closest("a")) return;
                      setEditingExpenseId(expense.id);
                    }}
                  >
                    <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center shrink-0 ${dueAccent.iconBg}`}>
                      <Receipt className={`h-4 w-4 sm:h-5 sm:w-5 ${dueAccent.text}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-sm truncate">{expense.description}</h3>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                          {expense.type === "fixa" ? "Fixa" : "Recorrente"}
                        </Badge>
                        {(() => {
                          const badge = getDueStatusBadge(expense.dueDate, expense.paid);
                          return (
                            <Badge className={`${badge.className} text-[10px] px-1.5 py-0 shrink-0`}>
                              {badge.label}
                            </Badge>
                          );
                        })()}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{expense.category}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(expense.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}
                        </span>
                        {expense.paidDate && (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Pago: {new Date(expense.paidDate + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                      {displayNotes(expense.notes) && <p className="text-xs text-muted-foreground mt-1 italic">"{displayNotes(expense.notes)}"</p>}
                      {isRecorrente && expense.installments! < FIXED_RECURRING_INSTALLMENTS && (
                        <p className="text-xs text-muted-foreground">Total: {formatCurrency(expense.amount)} ({expense.installments}x de {formatCurrency(installmentAmount)})</p>
                      )}
                      {isRecorrente && expense.installments! < FIXED_RECURRING_INSTALLMENTS && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {(() => {
                              const scheduleStart = getInstallmentScheduleStart(expense);
                              const [sy, sm] = scheduleStart.split("-").map(Number);
                              const [sYear, sMonth] = selectedMonth.split("-").map(Number);
                              const diffMonths = (sYear * 12 + sMonth) - (sy * 12 + sm);
                              const current = Math.min(Math.max(1, diffMonths + 1), expense.installments!);
                              return `${current}/${expense.installments}`;
                            })()} parcelas
                          </Badge>
                        </div>
                      )}
                      <div className="mt-2 pt-2 border-t border-border/40 space-y-2">
                        <p className={`text-base sm:text-lg font-bold tabular-nums ${dueAccent.text}`}>{formatCurrency(installmentAmount)}</p>
                        <div data-actions-row className="flex items-center justify-between gap-1">
                          <Button variant="ghost" onClick={() => setViewDateExpenseId(expense.id)} className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0" title="Ver data de pagamento" aria-label="Ver data de pagamento">
                            <CalendarCheck className="h-4 w-4" />
                            <span className="hidden md:inline">Data</span>
                          </Button>
                          {hasPaidSomething && onUpdate && (
                            <Button variant="outline" onClick={() => setViewPaymentsExpenseId(expense.id)} className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0" title="Pagamentos" aria-label="Pagamentos">
                              <Receipt className="h-4 w-4" />
                              <span className="hidden md:inline">Pagamentos</span>
                            </Button>
                          )}
                          {!readOnly && !expense.paid && (
                            <Button data-mutation variant="outline" className="text-success border-success/30 hover:bg-success hover:text-success-foreground h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0" title="Pagar" aria-label="Pagar" onClick={() => {
                              setPayDate(todayInAppTz());
                              setPaidAmountInput("");
                              setPayingExpenseId(expense.id);
                            }}>
                              <CheckCircle className="h-4 w-4" />
                              <span className="hidden md:inline">Pagar</span>
                            </Button>
                          )}
                          {!readOnly && onUpdate && (
                            <Button data-mutation variant="ghost" onClick={() => setEditingExpenseId(expense.id)} className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0 text-muted-foreground hover:text-foreground" title="Editar" aria-label="Editar">
                              <Pencil className="h-4 w-4" />
                              <span className="hidden md:inline">Editar</span>
                            </Button>
                          )}
                          {!readOnly && (
                            <ExpenseBoletoLinkButton expenseId={expense.id} className="h-9 w-9 flex-1 md:flex-none min-h-0" />
                          )}
                          {!readOnly && (
                          <Button data-mutation variant="ghost" className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0 text-destructive hover:bg-destructive hover:text-destructive-foreground" title="Excluir" aria-label="Excluir" onClick={() => setDeleteExpenseId(expense.id)}>
                            <Trash2 className="h-4 w-4" />
                            <span className="hidden md:inline">Excluir</span>
                          </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>

                {/* Dialog de pagamentos */}
                <Dialog open={viewPaymentsExpenseId === expense.id} onOpenChange={(open) => { if (!open) setViewPaymentsExpenseId(null); }}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Pagamentos - {expense.description}</DialogTitle>
                      <DialogDescription>Gerencie os pagamentos desta despesa.</DialogDescription>
                    </DialogHeader>
                    <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                      {isRecorrente ? (
                        Array.from({ length: expense.paidInstallments || 0 }, (_, idx) => (
                          <div key={idx} className="flex items-center gap-3 py-3">
                            <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold shrink-0">
                              {idx + 1}ª
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{formatCurrency(installmentAmount)}</p>
                              <p className="text-xs text-muted-foreground">Parcela {idx + 1} de {expense.installments}</p>
                            </div>
                            <Badge className="bg-success/20 text-success border-success/30 text-xs">Paga</Badge>
                            {!readOnly && onUnpay && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => {
                                  setUnpayConfirm({
                                    label: `Estornar a ${idx + 1}ª parcela em diante?`,
                                    run: async () => {
                                      const currentPaid = expense.paidInstallments || 0;
                                      const timesToUnpay = currentPaid - idx;
                                      for (let t = 0; t < timesToUnpay; t++) {
                                        await onUnpay(expense.id);
                                      }
                                      if (idx === 0) setViewPaymentsExpenseId(null);
                                    },
                                  });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))
                      ) : (
                        expense.paid && (
                          <div className="flex items-center gap-3 py-3">
                            <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold shrink-0">
                              <Check className="h-4 w-4" />
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{formatCurrency(expense.amount)}</p>
                              {expense.paidDate && <p className="text-xs text-muted-foreground">{new Date(expense.paidDate + "T00:00:00").toLocaleDateString("pt-BR")}</p>}
                            </div>
                            <Badge className="bg-success/20 text-success border-success/30 text-xs">Paga</Badge>
                            {!readOnly && onUnpay && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => {
                                  setUnpayConfirm({
                                    label: "Estornar este pagamento?",
                                    run: () => {
                                      onUnpay(expense.id);
                                      setViewPaymentsExpenseId(null);
                                    },
                                  });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )
                      )}
                      {(!isRecorrente && !expense.paid && !(expense.paidInstallments && expense.paidInstallments > 0)) && (
                        <div className="py-4 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Dialog de edição */}
                {onUpdate && (
                  <ExpenseEditDialog
                    expense={expense}
                    expenses={expenses}
                    open={editingExpenseId === expense.id}
                    onOpenChange={(open) => { if (!open) setEditingExpenseId(null); }}
                    onSave={(data) => {
                      if (isExpenseInSeries(expense)) {
                        setPendingScopeEdit({ target: expense, patch: data });
                      } else {
                        onUpdate(expense.id, data);
                      }
                      setEditingExpenseId(null);
                    }}
                    formatCurrency={formatCurrency}
                  />
                )}
              </Card>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDeleteDialog
        open={!!deleteExpenseId}
        onOpenChange={() => setDeleteExpenseId(null)}
        onConfirm={() => { if (deleteExpenseId) { onDelete(deleteExpenseId); setDeleteExpenseId(null); } }}
        title="Excluir despesa"
        description="Tem certeza que deseja excluir esta despesa?"
      />

      {/* Dialog para escolher data de pagamento */}
      <Dialog open={!!payingExpenseId} onOpenChange={(open) => { if (!open) setPayingExpenseId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription>Confirme a data e, se quiser, informe o valor efetivamente pago.</DialogDescription>
          </DialogHeader>
          {(() => {
            const exp = expenses.find((e) => e.id === payingExpenseId);
            const suggested = exp ? getInstallmentAmount(exp) : 0;
            return (
              <div className="py-2 space-y-3">
                <div>
                  <Label htmlFor="pay-date">Data</Label>
                  <DatePickerField id="pay-date" value={payDate} onChange={setPayDate} />
                </div>
                <div>
                  <Label htmlFor="pay-amount">Valor pago (opcional)</Label>
                  <Input
                    id="pay-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={paidAmountInput}
                    onChange={(e) => setPaidAmountInput(e.target.value)}
                    placeholder={suggested.toFixed(2)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Em branco usa o valor original ({formatCurrency(suggested)}).
                  </p>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayingExpenseId(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (payingExpenseId) {
                const parsed = parseFloat(paidAmountInput);
                const paidAmount = paidAmountInput.trim() && !isNaN(parsed) && parsed > 0 ? parsed : undefined;
                const exp = expenses.find((e) => e.id === payingExpenseId);
                onPay(payingExpenseId, undefined, payDate, paidAmount);
                celebrate({ kind: "expense", message: "Despesa quitada!", amount: paidAmount ?? (exp ? getInstallmentAmount(exp) : undefined) });
                setPayingExpenseId(null);
                setPaidAmountInput("");
              }
            }}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unpay confirm */}
      <Dialog open={!!unpayConfirm} onOpenChange={(o) => !o && setUnpayConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Estornar pagamento</DialogTitle>
            <DialogDescription>
              {unpayConfirm?.label ?? "Confirma estornar este pagamento?"} Esta ação reverte o status para pendente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnpayConfirm(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const action = unpayConfirm;
                setUnpayConfirm(null);
                if (action) await action.run();
              }}
            >
              Confirmar estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog Ver data de pagamento */}
      <Dialog open={!!viewDateExpenseId} onOpenChange={(o) => { if (!o) { setViewDateExpenseId(null); setEditingPaidDate(false); } }}>
        <DialogContent className="sm:max-w-sm">
          {(() => {
            const exp = expenses.find((e) => e.id === viewDateExpenseId);
            if (!exp) return null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Data de pagamento</DialogTitle>
                  <DialogDescription>{exp.description}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 text-sm">
                  {exp.paid && exp.paidDate ? (
                    <div className="rounded-lg bg-success/10 border border-success/30 p-3">
                      <p className="text-xs text-muted-foreground">Pago em</p>
                      {editingPaidDate ? (
                        <div className="mt-1 space-y-2">
                          <DatePickerField value={editPaidDateValue} onChange={setEditPaidDateValue} />
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditingPaidDate(false)}>Cancelar</Button>
                            <Button data-mutation
                              size="sm"
                              disabled={!editPaidDateValue || !onUpdate}
                              onClick={() => {
                                if (onUpdate) {
                                  onUpdate(exp.id, { paidDate: editPaidDateValue });
                                  setEditingPaidDate(false);
                                }
                              }}
                            >
                              Salvar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-base font-semibold text-success">
                            {formatDateBR(exp.paidDate, "dd 'de' MMMM 'de' yyyy")}
                          </p>
                          {onUpdate && (
                            <Button data-mutation
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Alterar data de pagamento"
                              aria-label="Alterar data de pagamento"
                              onClick={() => {
                                setEditPaidDateValue(exp.paidDate!);
                                setEditingPaidDate(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-warning/10 border border-warning/30 p-3">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="text-base font-semibold text-warning">Ainda não paga</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Vencimento: {formatDateBR(exp.dueDate, "dd/MM/yyyy")}
                      </p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setViewDateExpenseId(null); setEditingPaidDate(false); }}>Fechar</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <EditScopeDialog
        open={!!pendingScopeEdit}
        onOpenChange={(o) => { if (!o) setPendingScopeEdit(null); }}
        onConfirm={async (scope) => {
          if (!pendingScopeEdit || !onUpdate) return;
          const { target, patch } = pendingScopeEdit;
          const totalInstallments = target.parentExpenseId
            ? expenses.find((e) => e.id === target.parentExpenseId)?.installments ?? target.installments ?? 1
            : (target.installments ?? 1);
          const perInstallment = patch.amount === undefined
            ? undefined
            : (target.type === "recorrente" && (target.installments ?? 0) > 1)
              ? (patch.amount as number) / totalInstallments
              : (patch.amount as number);
          try {
            await applyExpenseScopedUpdate({
              target,
              patch: {
                description: patch.description as any,
                amount: perInstallment,
                dueDate: patch.dueDate as any,
                category: patch.category as any,
                notes: patch.notes as any,
                paymentMethodId: patch.paymentMethodId as any,
              },
              scope,
              expenses,
              onUpdateLocal: async (id, data) => { await onUpdate(id, data); },
            });
          } finally {
            setPendingScopeEdit(null);
          }
        }}
      />

      <CategoryDetailsSheet
        open={!!summaryView}
        onOpenChange={(o) => !o && setSummaryView(null)}
        categoryName={summaryView ? summaryViewMeta[summaryView].label : ""}
        entries={summaryEntries}
        total={summaryView ? summaryViewMeta[summaryView].total : 0}
      />
    </div>
  );
}

