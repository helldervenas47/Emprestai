import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Loan, LoanRenegotiation, Payment, InstallmentSchedule } from "@/types/loan";
import { getLoanRemainingAmount } from "@/features/loans/hooks/useLoans";
import { useLoanRenegotiations } from "@/features/loans/hooks/useLoanRenegotiations";
import { toast } from "sonner";
import { History, AlertTriangle, ListChecks, CalendarDays, Pencil, Trash2, Save, X } from "lucide-react";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDateBR = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
};

const stepDate = (baseISO: string, freq: "monthly" | "biweekly" | "weekly" | "daily", n: number): string => {
  if (!baseISO || !/^\d{4}-\d{2}-\d{2}/.test(baseISO)) return baseISO;
  const d = new Date(baseISO.slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return baseISO;
  if (freq === "monthly") d.setMonth(d.getMonth() + n);
  else if (freq === "biweekly") d.setDate(d.getDate() + 15 * n);
  else if (freq === "weekly") d.setDate(d.getDate() + 7 * n);
  else d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  history: LoanRenegotiation[];
  onConfirm: (params: {
    type: "no_interest" | "with_penalty";
    penaltyMode?: "fixed" | "percentage" | null;
    penaltyInput?: number | null;
    penaltyDistribution?: "diluted" | "first" | null;
    newInstallments?: number | null;
    notes?: string | null;
    selectedInstallmentNumbers?: number[] | null;
    firstDueDate?: string | null;
    frequency?: "monthly" | "biweekly" | "weekly" | "daily" | null;
    customDates?: string[] | null;
    customInstallmentAmounts?: number[] | null;
    discountNewTotal?: number | null;
  }) => Promise<void>;
}

export function RenegotiateLoanDialog({
  open,
  onOpenChange,
  loan,
  payments,
  installmentSchedules = [],
  history,
  onConfirm,
}: Props) {
  const [type, setType] = useState<"no_interest" | "with_penalty" | "discount">("no_interest");
  const [penaltyMode, setPenaltyMode] = useState<"fixed" | "percentage">("fixed");
  const [penaltyInput, setPenaltyInput] = useState("");
  const [penaltyDistribution, setPenaltyDistribution] = useState<"diluted" | "first">("diluted");
  const [discountNewTotalInput, setDiscountNewTotalInput] = useState("");
  const [newInstallments, setNewInstallments] = useState("");
  const [notes, setNotes] = useState("");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [frequency, setFrequency] = useState<"monthly" | "biweekly" | "weekly" | "daily">("monthly");
  const [customDates, setCustomDates] = useState<Record<number, string>>({});
  const [customAmounts, setCustomAmounts] = useState<Record<number, string>>({});
  const [editedIndexes, setEditedIndexes] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isInstallmentLoan = loan.paymentType === "Parcelado" && loan.installments > 1;

  // Parcelas pendentes do contrato
  const pendingInstallments = useMemo(() => {
    return installmentSchedules
      .filter((s) => s.loanId === loan.id && s.installmentNumber > loan.paidInstallments)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
  }, [installmentSchedules, loan.id, loan.paidInstallments]);

  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set());

  // Inicializa seleção: todas as parcelas pendentes selecionadas por padrão
  useEffect(() => {
    if (open) {
      setSelectedNumbers(new Set(pendingInstallments.map((p) => p.installmentNumber)));
      const defaultDate = pendingInstallments[0]?.dueDate || loan.dueDate || "";
      setFirstDueDate(defaultDate ? defaultDate.slice(0, 10) : "");
      setFrequency("monthly");
      setCustomDates({});
      setCustomAmounts({});
      setEditedIndexes(new Set());
    }
  }, [open, pendingInstallments, loan.dueDate]);

  const totalRemaining = useMemo(
    () => getLoanRemainingAmount(loan, payments),
    [loan, payments]
  );

  // Saldo a renegociar = soma das parcelas selecionadas (para parcelado),
  // ou saldo total (para outros tipos / sem cronograma)
  const remaining = useMemo(() => {
    if (isInstallmentLoan && pendingInstallments.length > 0) {
      const sum = pendingInstallments
        .filter((p) => selectedNumbers.has(p.installmentNumber))
        .reduce((acc, p) => acc + Number(p.amount || 0), 0);
      return Math.round(sum * 100) / 100;
    }
    return totalRemaining;
  }, [isInstallmentLoan, pendingInstallments, selectedNumbers, totalRemaining]);

  const selectedCount = isInstallmentLoan
    ? Array.from(selectedNumbers).length
    : Math.max(1, loan.installments - loan.paidInstallments);

  const remainingPending = Math.max(1, loan.installments - loan.paidInstallments);

  const penaltyAmount = useMemo(() => {
    if (type !== "with_penalty") return 0;
    const v = parseFloat(penaltyInput.replace(",", ".")) || 0;
    if (v <= 0) return 0;
    if (penaltyMode === "percentage") return Math.round((remaining * v / 100) * 100) / 100;
    return Math.round(v * 100) / 100;
  }, [type, penaltyMode, penaltyInput, remaining]);

  const discountNewTotal = useMemo(() => {
    if (type !== "discount") return 0;
    const v = parseFloat(discountNewTotalInput.replace(",", ".")) || 0;
    return v > 0 ? Math.round(v * 100) / 100 : 0;
  }, [type, discountNewTotalInput]);
  const discountAmount = type === "discount" && discountNewTotal > 0 && discountNewTotal < remaining
    ? Math.round((remaining - discountNewTotal) * 100) / 100
    : 0;

  const newTotal = type === "discount" && discountNewTotal > 0
    ? discountNewTotal
    : Math.round((remaining + penaltyAmount) * 100) / 100;

  const installmentsCount = useMemo(() => {
    const n = parseInt(newInstallments) || 0;
    if (n > 0) return n;
    return isInstallmentLoan ? Math.max(1, selectedCount) : remainingPending;
  }, [newInstallments, remainingPending, isInstallmentLoan, selectedCount]);

  // Modo "first" só faz sentido com multa > 0 e mais de uma nova parcela
  const useFirstMode =
    type === "with_penalty" &&
    penaltyAmount > 0 &&
    penaltyDistribution === "first" &&
    installmentsCount > 1;

  // Valor base da parcela (sem a multa, no modo "first" ela vai inteira na 1ª)
  const baseInstallmentValue = installmentsCount > 0
    ? Math.round((useFirstMode ? remaining : newTotal) / installmentsCount * 100) / 100
    : 0;
  const firstInstallmentValue = useFirstMode
    ? Math.round((baseInstallmentValue + penaltyAmount) * 100) / 100
    : baseInstallmentValue;
  // Mantém compat. com a UI atual ("X parcelas de Y")
  const newInstallmentValue = baseInstallmentValue;

  // ---- Valores personalizados por parcela ----
  const parseAmountInput = (raw?: string): number | null | undefined => {
    if (raw == null) return undefined;
    const s = String(raw).trim();
    if (s === "") return undefined;
    const v = parseFloat(s.replace(",", "."));
    if (!Number.isFinite(v)) return null; // inválido
    if (v < 0) return null; // negativo
    return Math.round(v * 100) / 100;
  };

  /** Valores default (rateio automático) de cada nova parcela. */
  const defaultAmountsPlan = useMemo(() => {
    const arr: number[] = [];
    let acc = 0;
    for (let i = 0; i < installmentsCount; i++) {
      const isLast = i === installmentsCount - 1;
      let amt: number;
      if (useFirstMode && i === 0) amt = firstInstallmentValue;
      else if (isLast) amt = Math.round((newTotal - acc) * 100) / 100;
      else amt = baseInstallmentValue;
      acc = Math.round((acc + amt) * 100) / 100;
      arr.push(amt);
    }
    return arr;
  }, [installmentsCount, useFirstMode, firstInstallmentValue, baseInstallmentValue, newTotal]);

  /** Valores finais: default sobrescrito pelo que o usuário editou, 
   * MAS com o comportamento dinâmico de redistribuição.
   */
  const finalAmountsPlan = useMemo(() => {
    const plan = [...defaultAmountsPlan];
    
    // Se não há edições manuais, retorna o padrão
    if (editedIndexes.size === 0) return plan;

    // 1. Aplica os valores fixos editados pelo usuário
    const fixedValues: Record<number, number> = {};
    let sumFixed = 0;
    editedIndexes.forEach(idx => {
      if (idx < plan.length) {
        const val = parseAmountInput(customAmounts[idx]);
        if (typeof val === "number") {
          fixedValues[idx] = val;
          sumFixed = Math.round((sumFixed + val) * 100) / 100;
          plan[idx] = val;
        }
      }
    });

    // 2. Identifica parcelas que ainda podem ser ajustadas (não editadas)
    const adjustableIndexes = plan
      .map((_, i) => i)
      .filter(i => !editedIndexes.has(i));

    if (adjustableIndexes.length > 0) {
      const remainingToDistribute = Math.round((newTotal - sumFixed) * 100) / 100;
      
      if (remainingToDistribute <= 0 && sumFixed > newTotal) {
        // Se o usuário ultrapassou o total, as outras ficam zeradas (ou negativas se permitirmos, mas vamos manter consistency)
        adjustableIndexes.forEach(idx => {
          plan[idx] = 0;
        });
      } else {
        // Distribui o saldo restante entre as ajustáveis
        const baseAdjustable = Math.round((remainingToDistribute / adjustableIndexes.length) * 100) / 100;
        let accAdjustable = 0;
        
        adjustableIndexes.forEach((idx, i) => {
          const isLastAdjustable = i === adjustableIndexes.length - 1;
          let amt: number;
          if (isLastAdjustable) {
            amt = Math.round((remainingToDistribute - accAdjustable) * 100) / 100;
          } else {
            amt = baseAdjustable;
          }
          plan[idx] = amt;
          accAdjustable = Math.round((accAdjustable + amt) * 100) / 100;
        });
      }
    }

    return plan;
  }, [defaultAmountsPlan, customAmounts, editedIndexes, newTotal]);

  const hasInvalidAmount = useMemo(
    () =>
      Array.from({ length: installmentsCount }).some(
        (_, i) => editedIndexes.has(i) && customAmounts[i]?.trim() !== "" && parseAmountInput(customAmounts[i]) === null,
      ),
    [customAmounts, installmentsCount, editedIndexes],
  );

  const hasCustomAmounts = useMemo(
    () => editedIndexes.size > 0,
    [editedIndexes],
  );

  /** Total renegociado = soma dos valores finais das novas parcelas. */
  const renegotiatedTotal = useMemo(
    () => Math.round(finalAmountsPlan.reduce((s, v) => s + v, 0) * 100) / 100,
    [finalAmountsPlan],
  );



  // Simula o novo cronograma de parcelas pendentes (não selecionadas + novas geradas)
  const simulatedSchedule = useMemo(() => {
    const overrideDate = firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(firstDueDate) ? firstDueDate : null;

    const computeNewDate = (i: number, base: string, startsAtBase: boolean) => {
      // Se há override do usuário para esta parcela nova, usa ele
      if (customDates[i] && /^\d{4}-\d{2}-\d{2}$/.test(customDates[i])) return customDates[i];
      // Se i===0 e não devemos avançar a partir da base, retorna a própria base
      const offset = startsAtBase ? i : i + 1;
      return stepDate(base, frequency, offset);
    };

    if (!isInstallmentLoan || pendingInstallments.length === 0) {
      const result: { number: number; dueDate: string; amount: number; isNew: boolean; newIndex?: number }[] = [];
      const baseDate = overrideDate || loan.dueDate;
      let acc = 0;
      for (let i = 0; i < installmentsCount; i++) {
        const dueStr = computeNewDate(i, baseDate, true);
        const amt = finalAmountsPlan[i] ?? 0;
        acc += amt;
        result.push({
          number: loan.paidInstallments + i + 1,
          dueDate: dueStr,
          amount: amt,
          isNew: true,
          newIndex: i,
        });
      }
      return result;
    }

    const remainingPendingScheds = pendingInstallments.filter(
      (s) => !selectedNumbers.has(s.installmentNumber)
    );
    const isPartial = selectedNumbers.size < pendingInstallments.length;

    const lastDate = remainingPendingScheds.length > 0
      ? remainingPendingScheds[remainingPendingScheds.length - 1].dueDate
      : (pendingInstallments[pendingInstallments.length - 1]?.dueDate || loan.dueDate);

    const firstSelectedDate = !isPartial
      ? (pendingInstallments.find((s) => selectedNumbers.has(s.installmentNumber))?.dueDate || loan.dueDate)
      : null;

    // Determina base e se a parcela 0 começa exatamente na base
    let base: string;
    let startsAtBase: boolean;
    if (overrideDate) {
      base = overrideDate;
      startsAtBase = true;
    } else if (!isPartial && firstSelectedDate) {
      base = firstSelectedDate;
      startsAtBase = true;
    } else {
      base = lastDate;
      startsAtBase = false;
    }

    const newScheds: { dueDate: string; amount: number; newIndex: number }[] = [];
    let acc = 0;
    for (let i = 0; i < installmentsCount; i++) {
      const dueStr = computeNewDate(i, base, startsAtBase);
      const amt = finalAmountsPlan[i] ?? 0;
      acc += amt;
      newScheds.push({ dueDate: dueStr, amount: amt, newIndex: i });
    }

    const combined = [
      ...remainingPendingScheds.map((s) => ({
        dueDate: s.dueDate,
        amount: Number(s.amount || 0),
        isNew: false,
        newIndex: undefined as number | undefined,
      })),
      ...newScheds.map((s) => ({ dueDate: s.dueDate, amount: s.amount, isNew: true, newIndex: s.newIndex })),
    ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return combined.map((item, i) => ({
      number: loan.paidInstallments + i + 1,
      dueDate: item.dueDate,
      amount: item.amount,
      isNew: item.isNew,
      newIndex: item.newIndex,
    }));
  }, [
    isInstallmentLoan,
    pendingInstallments,
    selectedNumbers,
    installmentsCount,
    newInstallmentValue,
    baseInstallmentValue,
    firstInstallmentValue,
    useFirstMode,
    newTotal,
    loan.dueDate,
    loan.paidInstallments,
    firstDueDate,
    frequency,
    customDates,
    finalAmountsPlan,
  ]);

  const reset = () => {
    setType("no_interest");
    setPenaltyMode("fixed");
    setPenaltyInput("");
    setPenaltyDistribution("diluted");
    setDiscountNewTotalInput("");
    setNewInstallments("");
    setNotes("");
    setFrequency("monthly");
    setCustomDates({});
    setCustomAmounts({});
    setEditedIndexes(new Set());
    setConfirming(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const toggleAll = () => {
    if (selectedNumbers.size === pendingInstallments.length) {
      setSelectedNumbers(new Set());
    } else {
      setSelectedNumbers(new Set(pendingInstallments.map((p) => p.installmentNumber)));
    }
    setConfirming(false);
  };

  const toggleOne = (n: number) => {
    const next = new Set(selectedNumbers);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setSelectedNumbers(next);
    setConfirming(false);
  };

  const handleSubmit = async () => {
    if (isInstallmentLoan && pendingInstallments.length > 0 && selectedNumbers.size === 0) {
      toast.error("Selecione ao menos uma parcela para renegociar");
      return;
    }
    if (type === "with_penalty") {
      const v = parseFloat(penaltyInput.replace(",", ".")) || 0;
      if (v <= 0) {
        toast.error("Informe o valor da multa");
        return;
      }
    }
    if (hasInvalidAmount) {
      toast.error("Existe parcela com valor inválido ou negativo");
      return;
    }
    if (renegotiatedTotal <= 0) {
      toast.error("O total das parcelas deve ser maior que zero");
      return;
    }
    if (type === "discount") {
      if (discountNewTotal <= 0) {
        toast.error("Informe o novo valor negociado");
        return;
      }
      if (discountNewTotal >= remaining) {
        toast.error("O novo valor deve ser menor que o saldo atual");
        return;
      }
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      setSubmitting(true);
      const submitType: "no_interest" | "with_penalty" =
        type === "with_penalty" ? "with_penalty" : "no_interest";
      const discountNote = type === "discount"
        ? `[Desconto: ${formatCurrency(discountAmount)}]`
        : "";
      const finalNotes = [discountNote, notes.trim()].filter(Boolean).join(" ").trim() || null;
      await onConfirm({
        type: submitType,
        penaltyMode: type === "with_penalty" ? penaltyMode : null,
        penaltyInput: type === "with_penalty"
          ? parseFloat(penaltyInput.replace(",", ".")) || 0
          : null,
        penaltyDistribution: type === "with_penalty" ? penaltyDistribution : null,
        newInstallments: parseInt(newInstallments) || null,
        notes: finalNotes,
        selectedInstallmentNumbers:
          isInstallmentLoan && pendingInstallments.length > 0
            ? Array.from(selectedNumbers).sort((a, b) => a - b)
            : null,
        firstDueDate: firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(firstDueDate) ? firstDueDate : null,
        frequency,
        customDates: (() => {
          const arr: string[] = [];
          for (let i = 0; i < installmentsCount; i++) {
            const row = simulatedSchedule.find((r) => r.isNew && r.newIndex === i);
            arr.push(row?.dueDate || "");
          }
          return arr.length > 0 ? arr : null;
        })(),
        customInstallmentAmounts: finalAmountsPlan.length > 0 ? finalAmountsPlan : null,
        discountNewTotal: type === "discount" ? discountNewTotal : null,
      });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao registrar renegociação");
    } finally {
      setSubmitting(false);
    }
  };

  const sortedHistory = [...history].sort((a, b) =>
    (b.renegotiatedAt || "").localeCompare(a.renegotiatedAt || "")
  );

  const allSelected =
    pendingInstallments.length > 0 && selectedNumbers.size === pendingInstallments.length;

  // Tabs: "renegociar" | "history"
  const [activeTab, setActiveTab] = useState<"renegotiate" | "history">("renegotiate");
  useEffect(() => { if (open) setActiveTab("renegotiate"); }, [open]);

  // Edit/Delete renegotiation history
  const { updateRenegotiation, deleteRenegotiation } = useLoanRenegotiations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editType, setEditType] = useState<"no_interest" | "with_penalty">("no_interest");
  const [editPenaltyMode, setEditPenaltyMode] = useState<"fixed" | "percentage">("fixed");
  const [editPenaltyInput, setEditPenaltyInput] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const startEdit = (r: LoanRenegotiation) => {
    setEditingId(r.id);
    setEditNotes(r.notes ?? "");
    setEditType(r.type);
    setEditPenaltyMode((r.penaltyMode as any) ?? "fixed");
    setEditPenaltyInput(r.penaltyInput != null ? String(r.penaltyInput) : "");
  };
  const cancelEdit = () => {
    setEditingId(null);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    try {
      setSavingEdit(true);
      const penaltyVal = editType === "with_penalty"
        ? (parseFloat(editPenaltyInput.replace(",", ".")) || 0) || null
        : null;
      await updateRenegotiation(editingId, {
        notes: editNotes.trim() || null,
        type: editType,
        penaltyMode: editType === "with_penalty" ? editPenaltyMode : null,
        penaltyInput: penaltyVal,
      });
      toast.success("Renegociação atualizada");
      setEditingId(null);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar");
    } finally {
      setSavingEdit(false);
    }
  };
  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      setDeleting(true);
      await deleteRenegotiation(pendingDeleteId);
      toast.success("Renegociação excluída do histórico");
      setPendingDeleteId(null);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-full sm:max-h-[90vh] max-h-[100dvh] h-[100dvh] sm:h-auto sm:rounded-2xl rounded-none overflow-y-auto overflow-x-hidden break-words">
        <DialogHeader>
          <DialogTitle>Renegociar contrato</DialogTitle>
          <DialogDescription>
            {loan.borrowerName} · saldo total {formatCurrency(totalRemaining)}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full min-w-0">
          <TabsList className="grid w-full grid-cols-2 h-auto p-1">
            <TabsTrigger value="renegotiate">Renegociar</TabsTrigger>
            <TabsTrigger value="history">
              Histórico{sortedHistory.length > 0 ? ` (${sortedHistory.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="renegotiate" className="mt-4 space-y-4 min-w-0">
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data de saída</span>
              <span className="font-medium">{loan.startDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo a renegociar</span>
              <span className="font-medium">{formatCurrency(remaining)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {isInstallmentLoan ? "Parcelas selecionadas" : "Parcelas pendentes"}
              </span>
              <span className="font-medium">
                {isInstallmentLoan
                  ? `${selectedNumbers.size} de ${pendingInstallments.length}`
                  : remainingPending}
              </span>
            </div>
          </div>

          {isInstallmentLoan && pendingInstallments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" /> Parcelas a renegociar
                </Label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[11px] text-primary hover:underline"
                >
                  {allSelected ? "Desmarcar todas" : "Selecionar todas"}
                </button>
              </div>
              <div className="rounded-lg border border-border/60 max-h-44 overflow-y-auto divide-y divide-border/40">
                {pendingInstallments.map((inst) => {
                  const checked = selectedNumbers.has(inst.installmentNumber);
                  return (
                    <label
                      key={inst.installmentNumber}
                      className="flex items-center gap-2.5 px-2.5 py-2 text-xs cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleOne(inst.installmentNumber)}
                      />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="font-medium">
                          Parcela {inst.installmentNumber}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDateBR(inst.dueDate)}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(Number(inst.amount || 0))}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Tipo de renegociação</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => {
                setType(v as any);
                setConfirming(false);
              }}
              className="grid grid-cols-3 gap-1.5"
            >
              <label
                htmlFor="reneg-no-interest"
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 cursor-pointer text-center min-h-[60px] transition-colors ${
                  type === "no_interest" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <RadioGroupItem value="no_interest" id="reneg-no-interest" className="sr-only" />
                <p className="text-[11px] sm:text-xs font-semibold leading-tight">Sem juros</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">
                  Ajusta prazo
                </p>
              </label>
              <label
                htmlFor="reneg-with-penalty"
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 cursor-pointer text-center min-h-[60px] transition-colors ${
                  type === "with_penalty" ? "border-warning bg-warning/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <RadioGroupItem value="with_penalty" id="reneg-with-penalty" className="sr-only" />
                <p className="text-[11px] sm:text-xs font-semibold leading-tight">Com multa</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">
                  Acresce R$ / %
                </p>
              </label>
              <label
                htmlFor="reneg-discount"
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 cursor-pointer text-center min-h-[60px] transition-colors ${
                  type === "discount" ? "border-success bg-success/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <RadioGroupItem value="discount" id="reneg-discount" className="sr-only" />
                <p className="text-[11px] sm:text-xs font-semibold leading-tight">Com desconto</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">
                  Novo total menor
                </p>
              </label>
            </RadioGroup>
          </div>


          {type === "discount" && (
            <div className="space-y-2 rounded-lg border border-success/30 bg-success/5 p-3">
              <Label className="text-xs">Novo valor total negociado</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder={`Menor que ${formatCurrency(remaining)}`}
                value={discountNewTotalInput}
                onChange={(e) => { setDiscountNewTotalInput(e.target.value); setConfirming(false); }}
              />
              {discountNewTotal > 0 && discountNewTotal < remaining && (
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-muted-foreground">Desconto concedido</span>
                  <span className="font-semibold text-success">
                    − {formatCurrency(discountAmount)}
                    <span className="text-[10px] text-muted-foreground ml-1">
                      ({((discountAmount / remaining) * 100).toFixed(1)}%)
                    </span>
                  </span>
                </div>
              )}
              {discountNewTotal > 0 && discountNewTotal >= remaining && (
                <p className="text-[11px] text-destructive">
                  O novo valor deve ser menor que o saldo atual ({formatCurrency(remaining)}).
                </p>
              )}
            </div>
          )}

          {type === "with_penalty" && (
            <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <Label className="text-xs">Multa de renegociação</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant={penaltyMode === "fixed" ? "default" : "outline"}
                  className="h-9 text-xs px-2 whitespace-nowrap"
                  onClick={() => { setPenaltyMode("fixed"); setConfirming(false); }}
                >
                  R$ fixo
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant={penaltyMode === "percentage" ? "default" : "outline"}
                  className="h-9 text-xs px-2 whitespace-nowrap"
                  onClick={() => { setPenaltyMode("percentage"); setConfirming(false); }}
                >
                  % do saldo
                </Button>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder={penaltyMode === "percentage" ? "Ex: 10 (%)" : "Ex: 100,00 (R$)"}
                value={penaltyInput}
                onChange={(e) => { setPenaltyInput(e.target.value); setConfirming(false); }}
              />
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs">Cobrança da multa</Label>
          <div className="grid grid-cols-2 gap-2">

                  <Button
                    size="sm"
                    type="button"
                    variant={penaltyDistribution === "diluted" ? "default" : "outline"}
                    className="h-auto min-h-9 py-1.5 text-[11px] leading-tight px-2 whitespace-normal text-center"
                    onClick={() => { setPenaltyDistribution("diluted"); setConfirming(false); }}
                  >
                    Diluída nas parcelas
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant={penaltyDistribution === "first" ? "default" : "outline"}
                    className="h-auto min-h-9 py-1.5 text-[11px] leading-tight px-2 whitespace-normal text-center"
                    onClick={() => { setPenaltyDistribution("first"); setConfirming(false); }}
                  >
                    Só na 1ª parcela
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {penaltyDistribution === "diluted"
                    ? "A multa é dividida igualmente entre todas as novas parcelas."
                    : "A multa inteira é somada à 1ª nova parcela; as demais ficam sem multa."}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">
              {isInstallmentLoan
                ? "Em quantas parcelas dividir o saldo renegociado (opcional)"
                : "Novo nº de parcelas pendentes (opcional)"}
            </Label>
            <Input
              type="number"
              min="1"
              inputMode="numeric"
              placeholder={`Manter: ${isInstallmentLoan ? Math.max(1, selectedCount) : remainingPending}`}
              value={newInstallments}
              onChange={(e) => { 
                setNewInstallments(e.target.value); 
                setCustomAmounts({}); 
                setEditedIndexes(new Set());
                setConfirming(false); 
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-2">

            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> 1ª parcela
              </Label>
              <DatePickerField
                value={firstDueDate}
                onChange={(v) => { setFirstDueDate(v); setCustomDates({}); setConfirming(false); }}
                className="h-11 text-sm w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Frequência</Label>
              <Select
                value={frequency}
                onValueChange={(v) => { setFrequency(v as any); setCustomDates({}); setConfirming(false); }}
              >
                <SelectTrigger className="h-11 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="biweekly">Quinzenal</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="daily">Diário</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {installmentsCount > 1 && (
            <p className="text-[10px] text-muted-foreground -mt-2">
              Datas das demais parcelas seguem a frequência escolhida. Você pode editar cada uma na tabela abaixo.
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Observações (opcional)</Label>
            <Textarea
              rows={2}
              placeholder="Anote o motivo da renegociação..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5 text-xs">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Pré-visualização
            </p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo das parcelas selecionadas</span>
              <span>{formatCurrency(remaining)}</span>
            </div>
            {type === "with_penalty" && (
              <div className="flex justify-between text-warning">
                <span>+ Multa de renegociação</span>
                <span>{formatCurrency(penaltyAmount)}</span>
              </div>
            )}
            {type === "discount" && discountAmount > 0 && (
              <div className="flex justify-between text-success">
                <span>− Desconto concedido</span>
                <span>{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground border-t border-border/50 pt-1.5">
              <span>Novo total renegociado</span>
              <span className={hasCustomAmounts ? "text-primary" : type === "discount" && discountAmount > 0 ? "text-success" : ""}>
                {formatCurrency(renegotiatedTotal)}
              </span>
            </div>
            {hasCustomAmounts && (
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Total calculado automaticamente</span>
                <span className="line-through">{formatCurrency(newTotal)}</span>
              </div>
            )}
            {useFirstMode ? (
              <>
                <div className="flex justify-between border-t border-border/50 pt-1.5">
                  <span className="text-muted-foreground">Qtd. de parcelas</span>
                  <span className="font-medium">{installmentsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">1ª parcela (com multa)</span>
                  <span className="font-semibold text-warning">{formatCurrency(firstInstallmentValue)}</span>
                </div>
                {installmentsCount > 1 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Demais ({installmentsCount - 1}× sem multa)
                    </span>
                    <span className="font-medium">{formatCurrency(baseInstallmentValue)}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Parcelas</span>
                <span className="font-medium">
                  {hasCustomAmounts
                    ? `${installmentsCount}× (valores personalizados)`
                    : `${installmentsCount}× de ${formatCurrency(newInstallmentValue)}`}
                  {type === "with_penalty" && penaltyAmount > 0 && installmentsCount > 1 && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      (multa diluída)
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>

          {simulatedSchedule.length > 0 && (() => {
            const rate = Number(loan.interestRate) || 0;
            const interestRatio = rate > 0 ? rate / (100 + rate) : 0;
            const newRows = simulatedSchedule.filter((r) => r.isNew);
            const newCount = newRows.length;
            let totMulta = 0;
            let totJuros = 0;
            let totParcela = 0;
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                    <CalendarDays className="h-3.5 w-3.5" /> Novo cronograma de parcelas pendentes
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {simulatedSchedule.length} parcela{simulatedSchedule.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="rounded-lg border border-border/60 max-h-64 overflow-y-auto overflow-x-hidden">
                  <table className="w-full table-fixed text-[11px] sm:text-xs tabular-nums">
                    <colgroup>
                      <col className="w-[14%]" />
                      <col className="w-[26%]" />
                      <col className="w-[14%]" />
                      <col className="w-[14%]" />
                      <col className="w-[32%]" />
                    </colgroup>
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-[9px] sm:text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="text-left px-1 py-1.5 font-semibold">#</th>
                        <th className="text-left px-1 py-1.5 font-semibold">Venc.</th>
                        <th className="text-right px-1 py-1.5 font-semibold">Multa</th>
                        <th className="text-right px-1 py-1.5 font-semibold">Juros</th>
                        <th className="text-right px-1 py-1.5 font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {simulatedSchedule.map((row, idx) => {
                        let rowMulta = 0;
                        if (row.isNew && type === "with_penalty" && penaltyAmount > 0) {
                          if (useFirstMode) {
                            const firstNewIdx = simulatedSchedule.findIndex((s) => s.isNew);
                            rowMulta = idx === firstNewIdx ? penaltyAmount : 0;
                          } else if (newCount > 0) {
                            rowMulta = Math.round((penaltyAmount / newCount) * 100) / 100;
                          }
                        }
                        const baseAmt = Math.max(0, row.amount - rowMulta);
                        const rowJuros = row.isNew
                          ? Math.round(baseAmt * interestRatio * 100) / 100
                          : Math.round(Number(row.amount) * interestRatio * 100) / 100;
                        totMulta += rowMulta;
                        totJuros += rowJuros;
                        totParcela += row.amount;
                        return (
                          <tr
                            key={`${row.number}-${row.dueDate}-${row.isNew}`}
                            className={row.isNew ? "bg-primary/5" : ""}
                          >
                            <td className="px-1 py-1.5 truncate">
                              <span className="font-medium">#{row.number}</span>
                              {row.isNew && (
                                <span className="ml-0.5 text-[8px] uppercase tracking-tight bg-primary/15 text-primary rounded px-1 py-0.5 font-semibold">
                                  Nova
                                </span>
                              )}
                            </td>
                            <td className="px-1 py-1.5 text-muted-foreground truncate">
                              {row.isNew && row.newIndex !== undefined ? (
                                <DatePickerField
                                  value={row.dueDate}
                                  onChange={(v) => {
                                    setCustomDates((prev) => ({ ...prev, [row.newIndex as number]: v }));
                                    setConfirming(false);
                                  }}
                                  className="h-7 px-1 text-[11px] w-full min-w-0"
                                />
                              ) : (
                                formatDateBR(row.dueDate)
                              )}
                            </td>
                            <td className="px-1 py-1.5 text-right text-warning truncate">
                              {rowMulta > 0 ? formatCurrency(rowMulta) : "—"}
                            </td>
                            <td className="px-1 py-1.5 text-right text-muted-foreground truncate">
                              {rowJuros > 0 ? formatCurrency(rowJuros) : "—"}
                            </td>
                            <td className="px-1 py-1.5 text-right font-semibold">
                              {row.isNew && row.newIndex !== undefined ? (
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  inputMode="decimal"
                                  aria-label={`Valor da parcela ${row.number}`}
                                  value={
                                    customAmounts[row.newIndex] !== undefined
                                      ? customAmounts[row.newIndex]
                                      : String(finalAmountsPlan[row.newIndex] || "")
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustomAmounts((prev) => ({ ...prev, [row.newIndex as number]: val }));
                                    setEditedIndexes((prev) => {
                                      const next = new Set(prev);
                                      next.add(row.newIndex as number);
                                      return next;
                                    });
                                    setConfirming(false);
                                  }}
                                  className={`h-7 px-1 text-[11px] text-right w-full min-w-0 tabular-nums ${
                                    parseAmountInput(customAmounts[row.newIndex as number]) === null
                                      ? "border-destructive focus-visible:ring-destructive"
                                      : ""
                                  }`}
                                />
                              ) : (
                                formatCurrency(row.amount)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/40 sticky bottom-0">
                      <tr className="text-[9px] sm:text-[10px] font-semibold">
                        <td className="px-1 py-1.5 truncate" colSpan={2}>Totais</td>
                        <td className="px-1 py-1.5 text-right text-warning truncate">
                          {totMulta > 0 ? formatCurrency(totMulta) : "—"}
                        </td>
                        <td className="px-1 py-1.5 text-right text-muted-foreground truncate">
                          {totJuros > 0 ? formatCurrency(totJuros) : "—"}
                        </td>
                        <td className="px-1 py-1.5 text-right truncate">
                          {formatCurrency(Math.round(totParcela * 100) / 100)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Você pode editar o valor de cada parcela nova. O total da renegociação é
                  recalculado automaticamente pela soma das parcelas.
                </p>
                {hasInvalidAmount && (
                  <p className="text-[11px] text-destructive">
                    Corrija as parcelas com valor inválido ou negativo.
                  </p>
                )}
                {rate > 0 && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Juros estimado por parcela com base na taxa do contrato ({rate}%).
                  </p>
                )}
                {isInstallmentLoan && pendingInstallments.length > 0 && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Parcelas marcadas como "Nova" substituirão as selecionadas. As demais permanecem inalteradas.
                  </p>
                )}
              </div>
            );
          })()}

          {confirming && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1.5 min-w-0">
                <p>
                  Confirma a renegociação? Esta ação será gravada no histórico permanente do contrato.
                </p>
                <div className="rounded-md bg-background/60 border border-border/50 p-2 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Resumo final das parcelas
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {simulatedSchedule.map((row) => (
                      <div
                        key={`sum-${row.number}-${row.dueDate}`}
                        className="flex items-center justify-between gap-2 text-[11px] text-foreground"
                      >
                        <span className="shrink-0">#{row.number}</span>
                        <span className="text-muted-foreground truncate">{formatDateBR(row.dueDate)}</span>
                        <span className="font-semibold tabular-nums">{formatCurrency(row.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-border/50 pt-1 text-[11px] font-semibold text-foreground">
                    <span>Total da renegociação</span>
                    <span className="tabular-nums">{formatCurrency(renegotiatedTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3 min-w-0">
            {sortedHistory.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
                <History className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma renegociação registrada para este contrato.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedHistory.map((r) => {
                  const isEditing = editingId === r.id;
                  return (
                    <div
                      key={r.id}
                      className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{formatDateBR(r.renegotiatedAt)}</span>
                        <div className="flex items-center gap-1">
                          {!isEditing && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => startEdit(r)}
                                title="Editar"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-destructive hover:text-destructive"
                                onClick={() => setPendingDeleteId(r.id)}
                                title="Excluir"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {(() => {
                        const discountVal = r.newAmount < r.previousAmount
                          ? Math.round((r.previousAmount - r.newAmount) * 100) / 100
                          : 0;
                        return (
                          <>
                            <div className="flex justify-between text-muted-foreground">
                              <span>{formatCurrency(r.previousAmount)} → {formatCurrency(r.newAmount)}</span>
                              {r.penaltyAmount > 0 && (
                                <span className="text-warning font-medium">
                                  +{formatCurrency(r.penaltyAmount)}
                                  {r.penaltyMode === "percentage" && r.penaltyInput
                                    ? ` (${r.penaltyInput}%)`
                                    : ""}
                                </span>
                              )}
                              {discountVal > 0 && (
                                <span className="text-success font-medium">
                                  −{formatCurrency(discountVal)}
                                </span>
                              )}
                            </div>

                            {r.previousInstallments != null && r.newInstallments != null && (
                              <div className="text-[11px] text-muted-foreground">
                                Parcelas: {r.previousInstallments} → {r.newInstallments}
                              </div>
                            )}

                            {!isEditing && (
                              <div className="flex items-center justify-between">
                                <span
                                  className={
                                    r.type === "with_penalty"
                                      ? "text-warning font-medium"
                                      : discountVal > 0
                                        ? "text-success font-medium"
                                        : "text-muted-foreground"
                                  }
                                >
                                  {r.type === "with_penalty"
                                    ? "Com multa"
                                    : discountVal > 0
                                      ? "Com desconto"
                                      : "Sem juros"}
                                </span>
                              </div>
                            )}
                          </>
                        );
                      })()}

                      {!isEditing ? (
                        <>
                          {r.notes && (
                            <p className="text-muted-foreground italic border-t border-border/40 pt-1.5">
                              {r.notes}
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2 border-t border-border/40 pt-2">
                          <div>
                            <Label className="text-[11px]">Tipo</Label>
                            <RadioGroup
                              value={editType}
                              onValueChange={(v) => setEditType(v as any)}
                              className="grid grid-cols-2 gap-2 mt-1"
                            >
                              <label className="flex items-center gap-2 rounded border border-border p-2 cursor-pointer">
                                <RadioGroupItem value="no_interest" />
                                <span className="text-[11px]">Sem juros</span>
                              </label>
                              <label className="flex items-center gap-2 rounded border border-border p-2 cursor-pointer">
                                <RadioGroupItem value="with_penalty" />
                                <span className="text-[11px]">Com multa</span>
                              </label>
                            </RadioGroup>
                          </div>
                          {editType === "with_penalty" && (
                            <div className="space-y-1.5">
                              <Label className="text-[11px]">Multa registrada</Label>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  type="button"
                                  variant={editPenaltyMode === "fixed" ? "default" : "outline"}
                                  className="flex-1 h-7 text-[11px]"
                                  onClick={() => setEditPenaltyMode("fixed")}
                                >
                                  R$ fixo
                                </Button>
                                <Button
                                  size="sm"
                                  type="button"
                                  variant={editPenaltyMode === "percentage" ? "default" : "outline"}
                                  className="flex-1 h-7 text-[11px]"
                                  onClick={() => setEditPenaltyMode("percentage")}
                                >
                                  % do saldo
                                </Button>
                              </div>
                              <Input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                value={editPenaltyInput}
                                onChange={(e) => setEditPenaltyInput(e.target.value)}
                                className="h-8 text-xs"
                              />
                            </div>
                          )}
                          <div>
                            <Label className="text-[11px]">Observação</Label>
                            <Textarea
                              rows={2}
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              className="text-xs"
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground italic">
                            A edição altera apenas as informações do registro. Os valores e o cronograma
                            já aplicados ao contrato não são recalculados.
                          </p>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit} disabled={savingEdit}>
                              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                            </Button>
                            <Button size="sm" className="h-7 text-xs" onClick={saveEdit} disabled={savingEdit}>
                              <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {activeTab === "renegotiate" && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Salvando..." : confirming ? "Confirmar renegociação" : "Renegociar"}
            </Button>
          </DialogFooter>
        )}
        {activeTab === "history" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>Fechar</Button>
          </DialogFooter>
        )}
      </DialogContent>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(v) => !v && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir renegociação?</AlertDialogTitle>
            <AlertDialogDescription>
              Este registro será removido permanentemente do histórico do contrato. Os valores
              e o cronograma já aplicados ao contrato continuam inalterados — esta ação afeta
              apenas o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
