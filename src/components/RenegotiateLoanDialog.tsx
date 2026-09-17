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
import { Badge } from "@/components/ui/badge";
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
import {
  History,
  AlertTriangle,
  ListChecks,
  CalendarDays,
  Pencil,
  Trash2,
  Save,
  X,
  Sparkles,
  Percent,
  Calendar,
  Wallet,
  Layers,
  CheckCircle2,
  ArrowRight,
  Calculator,
  RotateCcw,
  Check,
  FileText,
  DollarSign
} from "lucide-react";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDateBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const str = String(iso);
  const datePart = str.includes("T") ? str.split("T")[0] : str.split(" ")[0];
  if (datePart.includes("-")) {
    const parts = datePart.split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
    }
  }
  return str;
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

  /** Valores finais: default sobrescrito pelo que o usuário editou */
  const finalAmountsPlan = useMemo(() => {
    const plan = [...defaultAmountsPlan];
    
    if (editedIndexes.size === 0) return plan;

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

    const adjustableIndexes = plan
      .map((_, i) => i)
      .filter(i => !editedIndexes.has(i));

    if (adjustableIndexes.length > 0) {
      const remainingToDistribute = Math.round((newTotal - sumFixed) * 100) / 100;
      
      if (remainingToDistribute <= 0 && sumFixed > newTotal) {
        adjustableIndexes.forEach(idx => {
          plan[idx] = 0;
        });
      } else {
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
      if (customDates[i] && /^\d{4}-\d{2}-\d{2}$/.test(customDates[i])) return customDates[i];
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
      <DialogContent className="max-w-full sm:max-w-3xl lg:max-w-4xl w-full max-h-[100dvh] h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-2xl rounded-none p-0 flex flex-col overflow-hidden border border-border/80 shadow-2xl bg-card">
        {/* Header Elegante */}
        <DialogHeader className="px-4 py-3 sm:px-6 sm:py-4 border-b border-border/60 bg-muted/20 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 ring-1 ring-primary/20">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                  Renegociar Contrato
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm text-muted-foreground truncate flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className="font-semibold text-foreground">{loan.borrowerName}</span>
                  <span>•</span>
                  <span>Saldo Total: <strong className="text-foreground">{formatCurrency(totalRemaining)}</strong></span>
                  {loan.paymentType && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary bg-primary/5">
                      {loan.paymentType}
                    </Badge>
                  )}
                </DialogDescription>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full mt-3">
            <TabsList className="grid w-full grid-cols-2 h-9 p-1 bg-muted/60">
              <TabsTrigger value="renegotiate" className="text-xs font-medium flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5" />
                Simulação & Proposta
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs font-medium flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                Histórico {sortedHistory.length > 0 && `(${sortedHistory.length})`}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </DialogHeader>

        {/* Conteúdo com scroll independente */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-4 sm:space-y-5">
          {activeTab === "renegotiate" && (
            <div className="space-y-4 sm:space-y-5">
              {/* Cards de Status do Contrato */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-border/60 bg-card p-3 shadow-xs flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase font-medium tracking-wider">Início do Contrato</p>
                    <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
                      {formatDateBR(loan.startDate)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-card p-3 shadow-xs flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase font-medium tracking-wider">Saldo a Renegociar</p>
                    <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
                      {formatCurrency(remaining)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-card p-3 shadow-xs flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase font-medium tracking-wider">
                      {isInstallmentLoan ? "Parcelas Selecionadas" : "Parcelas Pendentes"}
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
                      {isInstallmentLoan
                        ? `${selectedNumbers.size} de ${pendingInstallments.length}`
                        : `${remainingPending} pendente(s)`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Seletor de Parcelas a Renegociar (se for parcelado) */}
              {isInstallmentLoan && pendingInstallments.length > 0 && (
                <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs sm:text-sm font-semibold flex items-center gap-2 text-foreground">
                      <ListChecks className="h-4 w-4 text-primary" /> Parcelas do Contrato a Renegociar
                    </Label>
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="text-xs text-primary font-medium hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {allSelected ? "Desmarcar todas" : "Selecionar todas"}
                    </button>
                  </div>
                  
                  <div className="rounded-lg border border-border/50 max-h-44 sm:max-h-52 overflow-y-auto divide-y divide-border/40 bg-muted/10">
                    {pendingInstallments.map((inst) => {
                      const checked = selectedNumbers.has(inst.installmentNumber);
                      return (
                        <label
                          key={inst.installmentNumber}
                          className={`flex items-center gap-3 px-3 py-2.5 text-xs sm:text-sm cursor-pointer transition-colors ${
                            checked ? "bg-primary/5 font-medium" : "hover:bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleOne(inst.installmentNumber)}
                            className="rounded"
                          />
                          <div className="flex-1 flex items-center justify-between gap-2">
                            <span className="font-semibold text-foreground">
                              Parcela #{inst.installmentNumber}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateBR(inst.dueDate)}
                            </span>
                            <span className="font-semibold tabular-nums text-foreground">
                              {formatCurrency(Number(inst.amount || 0))}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tipo de Renegociação */}
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm font-semibold text-foreground">Tipo de Renegociação</Label>
                <RadioGroup
                  value={type}
                  onValueChange={(v) => {
                    setType(v as any);
                    setConfirming(false);
                  }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                >
                  <label
                    htmlFor="reneg-no-interest"
                    className={`relative flex flex-col justify-between rounded-xl border-2 p-3 sm:p-3.5 cursor-pointer transition-all duration-200 ${
                      type === "no_interest"
                        ? "border-primary bg-primary/5 shadow-xs ring-2 ring-primary/20"
                        : "border-border hover:border-border/80 bg-card hover:bg-muted/30"
                    }`}
                  >
                    <RadioGroupItem value="no_interest" id="reneg-no-interest" className="sr-only" />
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${type === "no_interest" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                          <Sparkles className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-foreground">Sem Juros</span>
                      </div>
                      {type === "no_interest" && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug">
                      Ajusta o prazo ou redistribui parcelas mantendo o saldo original.
                    </p>
                  </label>

                  <label
                    htmlFor="reneg-with-penalty"
                    className={`relative flex flex-col justify-between rounded-xl border-2 p-3 sm:p-3.5 cursor-pointer transition-all duration-200 ${
                      type === "with_penalty"
                        ? "border-amber-500 bg-amber-500/5 shadow-xs ring-2 ring-amber-500/20"
                        : "border-border hover:border-border/80 bg-card hover:bg-muted/30"
                    }`}
                  >
                    <RadioGroupItem value="with_penalty" id="reneg-with-penalty" className="sr-only" />
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${type === "with_penalty" ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"}`}>
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-foreground">Com Multa</span>
                      </div>
                      {type === "with_penalty" && <Check className="h-4 w-4 text-amber-500 shrink-0" />}
                    </div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug">
                      Acresce taxa ou valor fixo pelo atraso ou renegociação.
                    </p>
                  </label>

                  <label
                    htmlFor="reneg-discount"
                    className={`relative flex flex-col justify-between rounded-xl border-2 p-3 sm:p-3.5 cursor-pointer transition-all duration-200 ${
                      type === "discount"
                        ? "border-emerald-500 bg-emerald-500/5 shadow-xs ring-2 ring-emerald-500/20"
                        : "border-border hover:border-border/80 bg-card hover:bg-muted/30"
                    }`}
                  >
                    <RadioGroupItem value="discount" id="reneg-discount" className="sr-only" />
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${type === "discount" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                          <Percent className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-foreground">Com Desconto</span>
                      </div>
                      {type === "discount" && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
                    </div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug">
                      Define um novo valor total menor que o saldo atual.
                    </p>
                  </label>
                </RadioGroup>
              </div>

              {/* Seção Condicional: Desconto */}
              {type === "discount" && (
                <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                      <Percent className="h-4 w-4" /> Novo Valor Total Negociado
                    </Label>
                    <span className="text-[11px] text-muted-foreground">Saldo atual: {formatCurrency(remaining)}</span>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder={`Ex: Menor que ${formatCurrency(remaining)}`}
                    value={discountNewTotalInput}
                    onChange={(e) => { setDiscountNewTotalInput(e.target.value); setConfirming(false); }}
                    className="h-10 text-sm bg-background"
                  />
                  {discountNewTotal > 0 && discountNewTotal < remaining && (
                    <div className="flex items-center justify-between text-xs sm:text-sm p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium">
                      <span>Desconto concedido:</span>
                      <span className="font-bold">
                        − {formatCurrency(discountAmount)} ({((discountAmount / remaining) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  )}
                  {discountNewTotal > 0 && discountNewTotal >= remaining && (
                    <p className="text-xs text-destructive font-medium flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      O novo valor negociado deve ser menor que o saldo atual ({formatCurrency(remaining)}).
                    </p>
                  )}
                </div>
              )}

              {/* Seção Condicional: Multa */}
              {type === "with_penalty" && (
                <div className="space-y-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <Label className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Multa de Renegociação
                    </Label>
                    <div className="inline-flex rounded-lg border border-amber-500/30 p-0.5 bg-background">
                      <button
                        type="button"
                        className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                          penaltyMode === "fixed" ? "bg-amber-500 text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => { setPenaltyMode("fixed"); setConfirming(false); }}
                      >
                        R$ Fixo
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                          penaltyMode === "percentage" ? "bg-amber-500 text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => { setPenaltyMode("percentage"); setConfirming(false); }}
                      >
                        % do Saldo
                      </button>
                    </div>
                  </div>

                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder={penaltyMode === "percentage" ? "Ex: 10 (%)" : "Ex: 100,00 (R$)"}
                    value={penaltyInput}
                    onChange={(e) => { setPenaltyInput(e.target.value); setConfirming(false); }}
                    className="h-10 text-sm bg-background"
                  />

                  {penaltyAmount > 0 && (
                    <div className="flex items-center justify-between text-xs sm:text-sm p-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">
                      <span>Acréscimo calculado:</span>
                      <span className="font-bold">+ {formatCurrency(penaltyAmount)}</span>
                    </div>
                  )}

                  <div className="space-y-2 pt-1 border-t border-amber-500/20">
                    <Label className="text-xs font-semibold text-foreground">Distribuição da Multa</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={`p-2.5 text-left rounded-lg border text-xs transition-colors ${
                          penaltyDistribution === "diluted"
                            ? "border-amber-500 bg-amber-500/10 font-semibold text-foreground"
                            : "border-border bg-background hover:bg-muted/40 text-muted-foreground"
                        }`}
                        onClick={() => { setPenaltyDistribution("diluted"); setConfirming(false); }}
                      >
                        <div className="font-semibold text-foreground mb-0.5">Diluída nas parcelas</div>
                        <div className="text-[11px] text-muted-foreground">Dividida igualmente entre as novas parcelas.</div>
                      </button>
                      <button
                        type="button"
                        className={`p-2.5 text-left rounded-lg border text-xs transition-colors ${
                          penaltyDistribution === "first"
                            ? "border-amber-500 bg-amber-500/10 font-semibold text-foreground"
                            : "border-border bg-background hover:bg-muted/40 text-muted-foreground"
                        }`}
                        onClick={() => { setPenaltyDistribution("first"); setConfirming(false); }}
                      >
                        <div className="font-semibold text-foreground mb-0.5">Somente na 1ª parcela</div>
                        <div className="text-[11px] text-muted-foreground">O valor total da multa vai na 1ª parcela; demais sem acréscimo.</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Configurações de Parcelamento em Grid Responsivo */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4 shadow-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-primary" /> Novas Parcelas
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
                      className="h-10 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-primary" /> 1º Vencimento
                    </Label>
                    <DatePickerField
                      value={firstDueDate}
                      onChange={(v) => { setFirstDueDate(v); setCustomDates({}); setConfirming(false); }}
                      className="h-10 text-sm w-full"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5 text-primary" /> Frequência
                    </Label>
                    <Select
                      value={frequency}
                      onValueChange={(v) => { setFrequency(v as any); setCustomDates({}); setConfirming(false); }}
                    >
                      <SelectTrigger className="h-10 text-sm">
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

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Observações (opcional)
                  </Label>
                  <Textarea
                    rows={2}
                    placeholder="Anote o motivo da renegociação ou termos acordados..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="text-xs sm:text-sm resize-none"
                  />
                </div>
              </div>

              {/* Card de Resumo Financeiro / Pré-visualização */}
              <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-primary/10 p-4 sm:p-5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> Resumo da Proposta de Renegociação
                  </span>
                  <Badge variant="secondary" className="text-[11px] font-semibold">
                    {installmentsCount} {installmentsCount === 1 ? "parcela" : "parcelas"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Saldo Original:</span>
                      <span className="font-medium text-foreground">{formatCurrency(remaining)}</span>
                    </div>
                    {type === "with_penalty" && (
                      <div className="flex justify-between text-amber-600 dark:text-amber-400">
                        <span>(+) Multa de Renegociação:</span>
                        <span className="font-semibold">+{formatCurrency(penaltyAmount)}</span>
                      </div>
                    )}
                    {type === "discount" && discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>(−) Desconto Concedido:</span>
                        <span className="font-semibold">−{formatCurrency(discountAmount)}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 sm:border-l sm:border-border/60 sm:pl-4">
                    <div className="flex justify-between text-xs sm:text-sm font-semibold">
                      <span className="text-foreground">Novo Total Renegociado:</span>
                      <span className={`text-sm sm:text-base font-bold ${hasCustomAmounts ? "text-primary" : type === "discount" && discountAmount > 0 ? "text-emerald-500" : "text-primary"}`}>
                        {formatCurrency(renegotiatedTotal)}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs text-muted-foreground pt-1">
                      <span>Parcelamento Estimado:</span>
                      <span className="font-semibold text-foreground">
                        {hasCustomAmounts
                          ? `${installmentsCount}× (valores manuais)`
                          : useFirstMode
                            ? `1× ${formatCurrency(firstInstallmentValue)} + ${installmentsCount - 1}× ${formatCurrency(baseInstallmentValue)}`
                            : `${installmentsCount}× de ${formatCurrency(newInstallmentValue)}`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabela de Cronograma de Parcelas */}
              {simulatedSchedule.length > 0 && (() => {
                const rate = Number(loan.interestRate) || 0;
                const interestRatio = rate > 0 ? rate / (100 + rate) : 0;
                const newRows = simulatedSchedule.filter((r) => r.isNew);
                const newCount = newRows.length;
                let totMulta = 0;
                let totJuros = 0;
                let totParcela = 0;
                return (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-primary" />
                        <h4 className="text-xs sm:text-sm font-bold text-foreground">
                          Cronograma Simulado das Parcelas
                        </h4>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {simulatedSchedule.length} parcela(s) total no contrato
                      </span>
                    </div>

                    <div className="rounded-xl border border-border/80 overflow-hidden shadow-xs bg-card">
                      <div className="max-h-64 sm:max-h-80 overflow-y-auto overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm tabular-nums border-collapse min-w-[500px]">
                          <thead className="bg-muted/60 sticky top-0 z-10 border-b border-border/60">
                            <tr className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                              <th className="text-left px-3 py-2">#</th>
                              <th className="text-left px-3 py-2">Vencimento</th>
                              <th className="text-right px-3 py-2">Multa</th>
                              <th className="text-right px-3 py-2">Juros Estim.</th>
                              <th className="text-right px-3 py-2">Valor da Parcela</th>
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
                                  className={`transition-colors ${row.isNew ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"}`}
                                >
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-foreground">#{row.number}</span>
                                      {row.isNew && (
                                        <span className="text-[9px] uppercase tracking-wide bg-primary/20 text-primary font-bold px-1.5 py-0.5 rounded">
                                          Nova
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                    {row.isNew && row.newIndex !== undefined ? (
                                      <DatePickerField
                                        value={row.dueDate}
                                        onChange={(v) => {
                                          setCustomDates((prev) => ({ ...prev, [row.newIndex as number]: v }));
                                          setConfirming(false);
                                        }}
                                        className="h-8 px-2 text-xs w-36"
                                      />
                                    ) : (
                                      <span className="font-medium text-foreground">{formatDateBR(row.dueDate)}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
                                    {rowMulta > 0 ? formatCurrency(rowMulta) : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                                    {rowJuros > 0 ? formatCurrency(rowJuros) : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-foreground whitespace-nowrap">
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
                                        className={`h-8 px-2 text-xs text-right w-32 ml-auto tabular-nums font-semibold ${
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
                          <tfoot className="bg-muted/70 sticky bottom-0 z-10 border-t border-border font-bold">
                            <tr className="text-xs sm:text-sm">
                              <td className="px-3 py-2.5" colSpan={2}>
                                Totais das Parcelas
                              </td>
                              <td className="px-3 py-2.5 text-right text-amber-600 dark:text-amber-400">
                                {totMulta > 0 ? formatCurrency(totMulta) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right text-muted-foreground">
                                {totJuros > 0 ? formatCurrency(totJuros) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right text-primary">
                                {formatCurrency(Math.round(totParcela * 100) / 100)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-muted-foreground gap-1 italic">
                      <p>Você pode editar individualmente as datas e valores das novas parcelas.</p>
                      {rate > 0 && <p>Juros calculados com base na taxa contratual ({rate}%).</p>}
                    </div>

                    {hasInvalidAmount && (
                      <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        Existem parcelas com valores inválidos ou negativos. Corrija antes de prosseguir.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Banner de Confirmação Pré-Envio */}
              {confirming && (
                <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4 space-y-3 shadow-md">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs sm:text-sm">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <span>Confirmação da Renegociação de Contrato</span>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">
                    Esta ação atualizará o cronograma e registrará um evento permanente no histórico do contrato. Revise o resumo abaixo antes de confirmar:
                  </p>
                  <div className="rounded-lg bg-background/80 border border-border/60 p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between font-semibold text-foreground">
                      <span>Total Renegociado Final:</span>
                      <span className="text-primary font-bold">{formatCurrency(renegotiatedTotal)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Quantidade de Parcelas:</span>
                      <span>{installmentsCount} parcela(s)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab Histórico */}
          {activeTab === "history" && (
            <div className="space-y-4">
              {sortedHistory.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-border/70 p-8 sm:p-12 text-center space-y-2">
                  <div className="h-12 w-12 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
                    <History className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-foreground">Nenhuma renegociação anterior</h4>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Este contrato ainda não passou por renegociações registradas.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedHistory.map((r) => {
                    const isEditing = editingId === r.id;
                    const discountVal = r.newAmount < r.previousAmount
                      ? Math.round((r.previousAmount - r.newAmount) * 100) / 100
                      : 0;

                    return (
                      <div
                        key={r.id}
                        className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-xs transition-all hover:border-border"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs sm:text-sm text-foreground">
                              {formatDateBR(r.renegotiatedAt)}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                r.type === "with_penalty"
                                  ? "border-amber-500/40 text-amber-600 bg-amber-500/10"
                                  : discountVal > 0
                                    ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                                    : "border-primary/40 text-primary bg-primary/10"
                              }`}
                            >
                              {r.type === "with_penalty"
                                ? "Com Multa"
                                : discountVal > 0
                                  ? "Com Desconto"
                                  : "Sem Juros"}
                            </Badge>
                          </div>

                          {!isEditing && (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => startEdit(r)}
                                title="Editar Registro"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                onClick={() => setPendingDeleteId(r.id)}
                                title="Excluir do Histórico"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {!isEditing ? (
                          <div className="space-y-2 text-xs sm:text-sm">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="text-muted-foreground">Valor:</span>
                              <div className="flex items-center gap-2 font-semibold">
                                <span className="text-muted-foreground line-through">{formatCurrency(r.previousAmount)}</span>
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-foreground">{formatCurrency(r.newAmount)}</span>
                              </div>
                            </div>

                            {r.penaltyAmount > 0 && (
                              <div className="flex justify-between text-amber-600 dark:text-amber-400 font-medium">
                                <span>Multa Aplicada:</span>
                                <span>
                                  +{formatCurrency(r.penaltyAmount)}
                                  {r.penaltyMode === "percentage" && r.penaltyInput ? ` (${r.penaltyInput}%)` : ""}
                                </span>
                              </div>
                            )}

                            {discountVal > 0 && (
                              <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                                <span>Desconto Concedido:</span>
                                <span>−{formatCurrency(discountVal)}</span>
                              </div>
                            )}

                            {r.previousInstallments != null && r.newInstallments != null && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>Parcelas:</span>
                                <span>{r.previousInstallments} → {r.newInstallments} parcelas</span>
                              </div>
                            )}

                            {r.notes && (
                              <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground italic border-l-2 border-primary/40 mt-2">
                                "{r.notes}"
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3 pt-1">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Tipo de Renegociação</Label>
                              <RadioGroup
                                value={editType}
                                onValueChange={(v) => setEditType(v as any)}
                                className="grid grid-cols-2 gap-2"
                              >
                                <label className="flex items-center gap-2 rounded-lg border border-border p-2 cursor-pointer text-xs">
                                  <RadioGroupItem value="no_interest" />
                                  <span>Sem juros</span>
                                </label>
                                <label className="flex items-center gap-2 rounded-lg border border-border p-2 cursor-pointer text-xs">
                                  <RadioGroupItem value="with_penalty" />
                                  <span>Com multa</span>
                                </label>
                              </RadioGroup>
                            </div>

                            {editType === "with_penalty" && (
                              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                                <Label className="text-xs font-semibold">Multa Registrada</Label>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    type="button"
                                    variant={editPenaltyMode === "fixed" ? "default" : "outline"}
                                    className="flex-1 h-8 text-xs"
                                    onClick={() => setEditPenaltyMode("fixed")}
                                  >
                                    R$ Fixo
                                  </Button>
                                  <Button
                                    size="sm"
                                    type="button"
                                    variant={editPenaltyMode === "percentage" ? "default" : "outline"}
                                    className="flex-1 h-8 text-xs"
                                    onClick={() => setEditPenaltyMode("percentage")}
                                  >
                                    % do Saldo
                                  </Button>
                                </div>
                                <Input
                                  type="number"
                                  step="0.01"
                                  inputMode="decimal"
                                  value={editPenaltyInput}
                                  onChange={(e) => setEditPenaltyInput(e.target.value)}
                                  className="h-8 text-xs bg-background"
                                />
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <Label className="text-xs">Observação</Label>
                              <Textarea
                                rows={2}
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                className="text-xs"
                              />
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={cancelEdit}
                                disabled={savingEdit}
                              >
                                <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 text-xs"
                                onClick={saveEdit}
                                disabled={savingEdit}
                              >
                                <Save className="h-3.5 w-3.5 mr-1" /> {savingEdit ? "Salvando..." : "Salvar Alterações"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Fixo */}
        <DialogFooter className="px-4 py-3 sm:px-6 sm:py-4 border-t border-border/60 bg-muted/20 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={submitting}
            className="w-full sm:w-auto h-10 text-xs sm:text-sm font-medium"
          >
            {activeTab === "history" ? "Fechar" : "Cancelar"}
          </Button>

          {activeTab === "renegotiate" && (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className={`w-full sm:w-auto h-10 text-xs sm:text-sm font-semibold transition-all ${
                confirming
                  ? "bg-amber-600 hover:bg-amber-700 text-white animate-pulse"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {submitting ? (
                "Gravando Renegociação..."
              ) : confirming ? (
                "Confirmar Renegociação Agora"
              ) : (
                "Avançar para Confirmação"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(v) => !v && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir histórico de renegociação?</AlertDialogTitle>
            <AlertDialogDescription>
              Este registro será removido permanentemente do histórico do contrato. Os valores
              e o cronograma já aplicados ao contrato continuam inalterados — esta ação afeta
              apenas a lista de histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir Registro"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

