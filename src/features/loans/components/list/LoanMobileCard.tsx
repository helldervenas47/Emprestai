// Auto-extracted from LoanList.tsx — row component (LoanRowView).
// Keeps behavior, layout, and public name unchanged.
import React, { useState, useMemo, useCallback, useRef } from "react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useHideValues } from "@/contexts/HideValuesContext";
import { format } from "date-fns";
import { Loan, Payment, InstallmentSchedule, Client, PaymentSplit } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { todayInAppTz, formatYmdInAppTz } from "@/lib/timezone";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeDatePicker } from "@/components/ui/native-date-picker";
import { calculateInstallment, calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { getInstallmentAmount, getOverdueAmount } from "@/features/loans/lib/loanInstallmentAmount";
import { getLoanLateFees, getBaseRemainingAmount, getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { cn } from "@/lib/utils";
import {
  CheckCircle, CheckCircle2, Trash2, DollarSign, User, Calendar as CalendarIcon, LayoutGrid, List,
  Search, Percent, Pencil, Check, X, ChevronDown, ChevronRight, ChevronUp, FolderOpen, Folder, HandCoins, Tag, MoreHorizontal, MessageCircle, Filter, SlidersHorizontal, History, UserCog, Calculator, BellRing, BellOff, RefreshCw, FileDown, AlertTriangle, StickyNote, ShoppingBag, Clock,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { usePaymentCelebration } from "@/hooks/usePaymentCelebration";
import { AdjustDueDateDialog } from "@/components/AdjustDueDateDialog";
import { AmortizationSimulator } from "@/components/AmortizationSimulator";
import { RenegotiateLoanDialog } from "@/components/RenegotiateLoanDialog";
import { useLoanRenegotiations } from "@/features/loans/hooks/useLoanRenegotiations";
import { useManagerCommissions } from "@/features/payroll/hooks/useManagerCommissions";
import { generateLoanReportPdf } from "@/features/loans/lib/loanReportPdf";
import type { LoanRenegotiation } from "@/types/loan";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useWhatsappBillingMessages } from "@/hooks/useWhatsappBillingMessages";
import { buildBillingWhatsappLink } from "@/lib/whatsappBilling";
import { WhatsappPreviewDialog } from "@/components/WhatsappPreviewDialog";
import { PartialPaymentDialog } from "@/features/loans/components/PartialPaymentDialog";
import { InterestResultCard } from "@/features/loans/components/InterestResultCard";
import { FullPaymentSummary } from "@/features/loans/components/FullPaymentSummary";
import { PayoffCompositionCard, PayoffSimulationCard } from "@/features/loans/components/PayoffCards";
import { AmortizationResultCard } from "@/features/loans/components/AmortizationResultCard";
import { captureScroll } from "@/features/loans/lib/preserveScroll";
import { PaymentHubDialog } from "@/features/loans/components/payment-hub/PaymentHubDialog";

import { WhatsappBillButton } from "@/features/loans/components/list/WhatsappBillButton";
import { LoanListSummaryCards } from "@/features/loans/components/list/LoanListSummaryCards";
import { LoanCategoryChips, LoanSearchBar, LoanQuickDateFilters, LoanAdvancedFilters } from "@/features/loans/components/list/LoanListFilters";

import type { Category, EditForm } from "@/features/loans/components/list/types";
import { categoryConfig, statusMap } from "@/features/loans/components/list/constants";
import { rawFormatCurrency } from "@/features/loans/components/list/formatting";
import {
  getNextDate,
  getFirstPendingDate,
  getDaysOverdue,
  getLoanCategory,
  getInstallmentDueDate,
  loanToForm,
  getTotalPaid,
} from "@/features/loans/components/list/calculations";
import { PaymentHistoryItem } from "@/features/loans/components/list/PaymentHistoryItem";
import { confirmWithScroll } from "@/lib/confirmWithScroll";


export function LoanCardView({
  loan, payments: allPayments, installmentSchedules, onPayment, onPartialPayment, onFullPayment, onInterestPayment, onAmortize, onRenegotiate, renegotiations = [], onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false, no3d = false, existingTags = [], clients = [],
}: {
  loan: Loan;
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  onPayment: (date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onPartialPayment: (amount: number, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onFullPayment?: (date?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onInterestPayment: (date?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void;
  onAmortize?: (amount: number, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => Promise<void> | void;
  onRenegotiate?: (params: { type: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null; penaltyDistribution?: "diluted" | "first" | null; newInstallments?: number | null; notes?: string | null; selectedInstallmentNumbers?: number[] | null; firstDueDate?: string | null }) => Promise<void> | void;
  renegotiations?: LoanRenegotiation[];
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
  no3d?: boolean;
  existingTags?: string[];
  clients?: Client[];
}) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  // Keep form in sync with loan prop when not editing (prevents stale notes/etc on refetch)
  React.useEffect(() => {
    if (!editing) setForm(loanToForm(loan));
  }, [loan, editing]);
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialDate, setPartialDate] = useState<Date>(new Date());
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<{ type: "installment" | "interest" | "partial" | "full" | "payoff" | "amortize"; amount?: number } | null>(null);
  const [interestSelection, setInterestSelection] = useState<"normal" | "withFees">("normal");
  const [interestPartialEnabled, setInterestPartialEnabled] = useState(false);
  const [interestPartialAmount, setInterestPartialAmount] = useState("");
  const [interestNotes, setInterestNotes] = useState("");
  const [payoffAmount, setPayoffAmount] = useState("");
  const [amortizeAmount, setAmortizeAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [showHistory, setShowHistory] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [editingInstallment, setEditingInstallment] = useState(false);
  const [installmentInput, setInstallmentInput] = useState("");
  const [showEditSchedule, setShowEditSchedule] = useState(false);
  const [editScheduleRows, setEditScheduleRows] = useState<{ date: Date; value: string }[]>([]);
  const [showLateInterest, setShowLateInterest] = useState(false);
  const [lateInterestType, setLateInterestType] = useState<string>(loan.lateInterestType || "percentage");
  const [lateInterestValue, setLateInterestValue] = useState<string>(loan.lateInterestValue != null ? String(loan.lateInterestValue) : "");
  const [showPenalty, setShowPenalty] = useState(false);
  const [penaltyValue, setPenaltyValue] = useState<string>(loan.penaltyValue != null ? String(loan.penaltyValue) : "");
  const [showRenegotiateDialog, setShowRenegotiateDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);
  const [showAdjustDueDate, setShowAdjustDueDate] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [payMenuOpen, setPayMenuOpen] = useState(false);
  const [paymentHubOpen, setPaymentHubOpen] = useState(false);
  // Radix DropdownMenu already handles outside-click/dismiss; a manual
  // pointerdown listener here was closing the menu on the same tap that
  // opened it on mobile (and letting the tap bubble up, which caused the
  // scroll-to-top). Rely on Radix's built-in behavior instead.
  const { activeMethods } = usePaymentMethods();
  const { celebrate } = usePaymentCelebration();
  const [selectedMethodId, setSelectedMethodId] = useState<string>("");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitMethod2Id, setSplitMethod2Id] = useState<string>("");
  const [splitAmount1Input, setSplitAmount1Input] = useState<string>("");
  React.useEffect(() => {
    // Reset selection when payment dialog closes — user must explicitly pick a method.
    if (!paymentDialog) setSelectedMethodId("");
  }, [paymentDialog]);
  React.useEffect(() => {
    if (!showPartial) setSelectedMethodId("");
  }, [showPartial]);
  React.useEffect(() => {
    // Reset split when dialog closes
    if (!paymentDialog) {
      setSplitEnabled(false);
      setSplitMethod2Id("");
      setSplitAmount1Input("");
    }
  }, [paymentDialog]);
  const [editHasManager, setEditHasManager] = useState<boolean>(loan.hasManager ?? false);
  const [editIsSale, setEditIsSale] = useState<boolean>(loan.isSale ?? false);
  const [editManagerId, setEditManagerId] = useState<string>(loan.managerId ?? "");
  const [editCommissionRate, setEditCommissionRate] = useState<string>(String(loan.managerCommissionRate ?? 10));
  const managerOptions = useMemo(() => clients.filter((c) => c.isManager && c.active !== false), [clients]);

  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = getTotalPaid(loan, allPayments);
  const unpaidSchedules = installmentSchedules
    .filter((s) => s.loanId === loan.id && s.installmentNumber > loan.paidInstallments)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const nextSchedule = unpaidSchedules[0];
  const allUnpaidScheduleSum = unpaidSchedules.reduce((sum, s) => sum + s.amount, 0);
  // Source of truth: loan.remainingAmount (same value shown in the create/edit form).
  // Fallback to total - totalPaid só quando o campo salvo está ausente.
  // Contratos quitados sempre têm restante 0 — mesmo se foram quitados com valor menor (acordo/desconto).
  const baseRemaining = loan.status === "paid"
    ? 0
    : loan.remainingAmount != null && loan.remainingAmount > 0
      ? loan.remainingAmount
      : Math.max(0, total - totalPaid);
  const category = getLoanCategory(loan, allPayments, installmentSchedules);
  const daysOverdue = getDaysOverdue(loan, installmentSchedules);

  // Calculate late fees
  const effectiveDaysLate = Math.max(0, daysOverdue);
  let lateInterestTotal = 0;
  if (loan.lateInterestValue != null && loan.lateInterestValue > 0 && effectiveDaysLate > 0 && loan.status !== "paid") {
    if (loan.lateInterestType === "fixed") {
      lateInterestTotal = loan.lateInterestValue * effectiveDaysLate;
    } else {
      lateInterestTotal = baseRemaining * (loan.lateInterestValue / 100) * effectiveDaysLate;
    }
  }
  const penaltyTotal = (loan.penaltyValue != null && loan.penaltyValue > 0 && loan.status !== "paid")
    ? loan.penaltyValue
    : 0;
  // Multa de renegociação pendente — para contratos de parcela única, é cobrada junto
  // com o pagamento de juros (opção "Juros + multa/atraso"). Em parcelados, ela já está
  // diluída nas próximas parcelas.
  const renegPenaltyPending = (loan.installments < 2 && loan.status !== "paid")
    ? Number(loan.renegotiationPenaltyTotal || 0)
    : 0;
  const lateFees = lateInterestTotal + penaltyTotal + renegPenaltyPending;
  const interestPaymentsReceived = allPayments
    .filter((p) => p.loanId === loan.id && p.installmentNumber === 0)
    .reduce((sum, p) => sum + p.amount, 0);
  const remaining = baseRemaining + lateFees;

  const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
  const fullInstallment = nextSchedule
    ? nextSchedule.amount
    : loan.customInstallmentValue != null && loan.customInstallmentValue > 0
      ? loan.customInstallmentValue
      : (loan.installments >= 2 ? total / loan.installments : baseRemaining);
  const actualRemaining = loan.status === "paid"
    ? 0
    : loan.remainingAmount != null && loan.remainingAmount > 0
      ? loan.remainingAmount
      : Math.max(0, total - totalPaid);
  const expectedRemainingForUnpaid = nextSchedule
    ? allUnpaidScheduleSum
    : fullInstallment * remainingInstallments;
  const partialPaidOnCurrent = Math.max(0, expectedRemainingForUnpaid - actualRemaining);
  const installment = Math.max(0, fullInstallment - partialPaidOnCurrent);
  
  const interestOnly = loan.customInterestValue != null && loan.customInterestValue > 0
    ? loan.customInterestValue
    : loan.amount * (loan.interestRate / 100);
  const interestCyclePartialPayments = allPayments
    .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
      && (p as any).metadata?.kind === "interest_partial"
      && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const interestCyclePartials = interestCyclePartialPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const lastCyclePartial = interestCyclePartialPayments[interestCyclePartialPayments.length - 1];
  const lastCyclePendingAfter = lastCyclePartial ? Number((lastCyclePartial as any).metadata?.cycle_pending_after) : NaN;
  const interestPending = Number.isFinite(lastCyclePendingAfter)
    ? Math.max(0, Math.round(lastCyclePendingAfter * 100) / 100)
    : Math.max(0, Math.round((interestOnly - interestCyclePartials) * 100) / 100);
  const totalInterest = total - loan.amount;
  const profit = totalPaid - loan.amount;
  const badge = statusMap[category];

  // Next installment due date = due date (end of contract)
  const nextInstallmentDate = useMemo(() => {
    if (loan.status === "paid") return null;
    if (loan.paidInstallments >= loan.installments) return null;
    return getFirstPendingDate(loan, installmentSchedules).toLocaleDateString("pt-BR");
  }, [loan]);

  const startEdit = () => {
    setForm(loanToForm(loan));
    setEditing(true);
    setShowEditSchedule(false);
    const totalInst = loan.installments;
    const paidInst = loan.paidInstallments || 0;
    const rem = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : total;
    const remInst = Math.max(1, totalInst - paidInst);
    const instVal = (rem / remInst).toFixed(2);
    const freq = loan.interestType || "Mensal";
    // Build rows for ALL installments (paid + pending)
    const allSchedules = installmentSchedules
      .filter((s) => s.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    if (allSchedules.length > 0) {
      // Fill all installments from schedules
      const rows: { date: Date; value: string }[] = [];
      for (let i = 1; i <= totalInst; i++) {
        const sched = allSchedules.find((s) => s.installmentNumber === i);
        if (sched) {
          rows.push({ date: new Date(sched.dueDate + "T00:00:00"), value: sched.amount.toFixed(2) });
        } else {
          // Generate from first due date
          const firstDue = new Date(loan.dueDate + "T00:00:00");
          rows.push({
            date: getNextDate(firstDue, freq, i - 1),
            value: loan.customInstallmentValue != null && loan.customInstallmentValue > 0
              ? loan.customInstallmentValue.toFixed(2)
              : instVal,
          });
        }
      }
      setEditScheduleRows(rows);
    } else {
      const firstDue = new Date(loan.dueDate + "T00:00:00");
      setEditScheduleRows(
        Array.from({ length: totalInst }, (_, i) => ({
          date: i === 0 ? firstDue : getNextDate(firstDue, freq, i),
          value: loan.customInstallmentValue != null && loan.customInstallmentValue > 0
            ? loan.customInstallmentValue.toFixed(2)
            : instVal,
        }))
      );
    }
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = async () => {
    if (editHasManager && !editManagerId) {
      toast.error("Selecione um gerente para o empréstimo com gerente.");
      return;
    }
    const parsedTags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const firstRow = editScheduleRows[0];
    const dueDate = firstRow ? firstRow.date.toISOString().split("T")[0] : form.dueDate || loan.dueDate;
    const firstVal = firstRow ? parseFloat(firstRow.value) || 0 : 0;
    const remInst = Math.max(1, (parseInt(form.installments) || loan.installments) - (parseInt(form.paidInstallments) || 0));
    const defaultCalc = (parseFloat(form.remainingAmount) || 0) / remInst;
    const hasCustom = firstVal > 0 && Math.abs(firstVal - defaultCalc) > 0.01;

    const manualInterest = parseFloat(form.interestValue) || 0;
    const calcInterest = (parseFloat(form.amount) || 0) * ((parseFloat(form.interestRate) || 0) / 100);
    const hasCustomInterest = manualInterest > 0 && Math.abs(manualInterest - calcInterest) > 0.01;

    // Aviso: alterar campos financeiros de contrato com pagamentos pode descalibrar histórico.
    const loanPaymentsCount = allPayments.filter((p) => p.loanId === loan.id).length;
    const newAmount = parseFloat(form.amount) || loan.amount;
    const newRemaining = parseFloat(form.remainingAmount) || 0;
    const newInstallments = parseInt(form.installments) || loan.installments;
    const newPaidInstallments = parseInt(form.paidInstallments) || 0;
    const sensitiveDiff =
      newAmount !== loan.amount ||
      newRemaining !== (loan.remainingAmount ?? 0) ||
      newInstallments !== loan.installments ||
      newPaidInstallments !== loan.paidInstallments;
    if (loanPaymentsCount > 0 && sensitiveDiff) {
      const ok = confirmWithScroll(
        `Este contrato já tem ${loanPaymentsCount} pagamento(s) registrado(s).\n\n` +
        `Alterar o valor emprestado, valor restante ou número de parcelas pode descalibrar o histórico.\n\n` +
        `Para reestruturar valores preservando os pagamentos, use a opção "Renegociar".\n\n` +
        `Deseja continuar mesmo assim?`
      );
      if (!ok) return;
    }

    onUpdate({
      borrowerName: form.borrowerName,
      amount: parseFloat(form.amount) || loan.amount,
      interestRate: form.interestRate.trim() === "" || isNaN(parseFloat(form.interestRate)) ? loan.interestRate : Math.max(0, parseFloat(form.interestRate)),
      installments: parseInt(form.installments) || loan.installments,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate || loan.startDate,
      dueDate,
      interestType: form.interestType,
      notes: form.notes,
      tags: parsedTags,
      remainingAmount: parseFloat(form.remainingAmount) || 0,
      customInstallmentValue: hasCustom ? firstVal : null,
      customInterestValue: hasCustomInterest ? manualInterest : null,
      hasManager: editHasManager,
      managerId: editHasManager && editManagerId ? editManagerId : null,
      managerCommissionRate: editHasManager ? parseFloat(editCommissionRate) || 10 : null,
      isSale: editIsSale,
    });

    // Save ALL installment rows
    if (editScheduleRows.length > 0) {
      await onSaveSchedule(loan.id, editScheduleRows.map((row, idx) => ({
        installmentNumber: idx + 1,
        dueDate: row.date.toISOString().split("T")[0],
        amount: parseFloat(row.value) || 0,
      })));
    }

    setEditing(false);
  };

  const openPaymentDialog = (type: "installment" | "interest" | "partial" | "full" | "payoff" | "amortize", amount?: number) => {
    setPaymentDate(new Date());
    setPayoffAmount("");
    setAmortizeAmount("");
    setInterestSelection("normal");
    setInterestPartialEnabled(false);
    setInterestPartialAmount("");
    setInterestNotes("");
    setPaymentDialog({ type, amount });
  };

  const confirmPayment = async () => {
    if (!paymentDialog) return;
    if (activeMethods.length > 0 && !selectedMethodId) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    const dateStr = formatYmdInAppTz(paymentDate);
    const dialogType = paymentDialog.type;
    const dialogAmount = paymentDialog.amount;
    const mid = selectedMethodId || null;

    // Compute expected total for the chosen action so we can validate the split
    const baseInterestForSplit = loan.customInterestValue != null && loan.customInterestValue > 0
      ? loan.customInterestValue
      : loan.amount * (loan.interestRate / 100);
    const customRawForSplit = parseFloat(payoffAmount.replace(",", "."));
    const amortRawForSplit = parseFloat(amortizeAmount.replace(",", "."));
    let expectedTotal = 0;
    if (dialogType === "full") expectedTotal = remaining;
    else if (dialogType === "payoff") expectedTotal = isFinite(customRawForSplit) && customRawForSplit > 0 ? customRawForSplit : 0;
    else if (dialogType === "amortize") expectedTotal = isFinite(amortRawForSplit) && amortRawForSplit > 0 ? amortRawForSplit : 0;
    else if (dialogType === "installment") expectedTotal = installment + (interestSelection === "withFees" && lateFees > 0 && loan.installments >= 2 ? lateFees : 0);
    else if (dialogType === "interest") {
      expectedTotal = interestSelection === "withFees" && lateFees > 0
        ? baseInterestForSplit + lateFees
        : baseInterestForSplit;
    } else if (dialogType === "partial" && dialogAmount) expectedTotal = dialogAmount;

    // Build split
    let split: PaymentSplit | null = null;
    if (splitEnabled && expectedTotal > 0) {
      if (!splitMethod2Id || splitMethod2Id === selectedMethodId) {
        toast.error("Selecione um segundo meio de pagamento diferente");
        return;
      }
      const a1 = parseFloat(splitAmount1Input.replace(",", "."));
      if (!isFinite(a1) || a1 <= 0 || a1 >= expectedTotal) {
        toast.error("Informe o valor do primeiro meio (entre 0 e o total)");
        return;
      }
      const a2 = Math.round((expectedTotal - a1) * 100) / 100;
      split = {
        parts: [
          { paymentMethodId: mid, amount: Math.round(a1 * 100) / 100 },
          { paymentMethodId: splitMethod2Id, amount: a2 },
        ],
      };
    }

    setPayoffAmount("");
    const amortRaw = parseFloat(amortizeAmount.replace(",", "."));
    setAmortizeAmount("");
    setPaymentDialog(null);
    const restoreScroll = captureScroll();
    try {
      if (dialogType === "full") {
        // Repassa o `remaining` (já inclui juros/multa de atraso) para garantir
        // que o valor total recebido seja registrado, e não só o principal+juros do contrato.
        if (onFullPayment) {
          await onFullPayment(dateStr, remaining, mid, split);
        } else {
          await onPartialPayment(remaining, dateStr, mid, split);
          await onUpdate({ paidInstallments: loan.installments, status: "paid" });
        }
      } else if (dialogType === "payoff") {
        const customRaw = parseFloat(payoffAmount.replace(",", ".") || String(customRawForSplit));
        const custom = isFinite(customRaw) && customRaw > 0 ? customRaw : (customRawForSplit > 0 ? customRawForSplit : 0);
        if (custom <= 0) return;
        if (onFullPayment) {
          await onFullPayment(dateStr, custom, mid, split);
        } else {
          await onPartialPayment(custom, dateStr, mid, split);
          await onUpdate({ paidInstallments: loan.installments, status: "paid" });
        }
      } else if (dialogType === "amortize") {
        if (!onAmortize) { toast.error("Amortização indisponível"); return; }
        const val = isFinite(amortRaw) && amortRaw > 0 ? amortRaw : 0;
        if (val <= 0) { toast.error("Informe um valor válido"); return; }
        await onAmortize(val, dateStr, mid, split);
      } else if (dialogType === "installment") {
        if (interestSelection === "withFees" && lateFees > 0 && loan.installments >= 2) {
          // Registra a multa/juros como um pagamento separado (entrada
          // própria no extrato). Split é forçado para método único pois
          // o valor da parcela em si segue inalterado abaixo.
          await onInterestPayment(dateStr, undefined, lateFees, mid, null, { partial: false, notes: "Juros/multa por atraso" });
          await onPayment(dateStr, mid, null);
        } else {
          await onPayment(dateStr, mid, split);
        }

      } else if (dialogType === "interest") {
        const partialRaw = parseFloat(interestPartialAmount.replace(",", "."));
        const partialVal = interestPartialEnabled && isFinite(partialRaw) && partialRaw > 0 ? partialRaw : undefined;
        const notes = interestNotes.trim() || null;
        const opts = (interestPartialEnabled || notes) ? { partial: interestPartialEnabled, notes } : undefined;
        if (interestSelection === "withFees" && lateFees > 0) {
          await onInterestPayment(dateStr, partialVal, lateFees, mid, split, opts);
        } else {
          await onInterestPayment(dateStr, partialVal, undefined, mid, split, opts);
        }
      } else if (dialogType === "partial" && dialogAmount) {
        await onPartialPayment(dialogAmount, dateStr, mid, split);
      }
      const celebrateAmount =
        dialogType === "full" ? remaining
        : dialogType === "payoff" ? (parseFloat(payoffAmount.replace(",", ".")) || customRawForSplit || undefined)
        : dialogType === "amortize" ? (isFinite(amortRaw) && amortRaw > 0 ? amortRaw : undefined)
        : dialogType === "partial" ? dialogAmount
        : undefined;
      void celebrateAmount;
      toast.success(dialogType === "amortize" ? "Amortização registrada" : "Pagamento registrado");
    } catch (err: any) {
      console.error("[confirmPayment]", err);
      toast.error(`Falha ao registrar: ${err?.message ?? "tente novamente"}`);
    } finally {
      restoreScroll();
    }
  };

  const handlePartialSubmit = () => {
    const val = parseFloat(partialAmount);
    if (val > 0) {
      if (activeMethods.length > 0 && !selectedMethodId) {
        toast.error("Selecione a forma de pagamento");
        return;
      }
      const dateStr = formatYmdInAppTz(partialDate);
      const mid = selectedMethodId || null;
      const restoreScroll = captureScroll();
      Promise.resolve(onPartialPayment(val, dateStr, mid)).finally(restoreScroll);
      setPartialAmount("");
      setPartialDate(new Date());
      setShowPartial(false);
    }
  };

  const updateField = (field: keyof EditForm, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      const amt = parseFloat(next.amount) || 0;
      const months = parseInt(next.installments) || 1;

      if (field === "amount" || field === "interestRate" || field === "installments" || field === "remainingAmount" || field === "paidInstallments") {
        const rate = parseFloat(next.interestRate) || 0;
        next.interestValue = (amt * (rate / 100)).toFixed(2);
        const totalCalc = calculateTotalWithInterest(amt, rate, months);
        const rem = parseFloat(next.remainingAmount) || totalCalc;
        const paidInst = parseInt(next.paidInstallments) || 0;
        const remInst = Math.max(1, months - paidInst);
        next.installmentValue = (rem / remInst).toFixed(2);
        // Rebuild ALL schedule rows (paid rows keep existing values)
        const firstDue = next.dueDate ? new Date(next.dueDate + "T00:00:00") : new Date();
        setEditScheduleRows((prev) => {
          return Array.from({ length: months }, (_, i) => {
            if (i < paidInst && prev[i]) return prev[i]; // Keep paid rows
            return {
              date: i === 0 ? firstDue : getNextDate(firstDue, next.interestType, i),
              value: next.installmentValue,
            };
          });
        });
      } else if (field === "interestValue") {
        const iv = parseFloat(value) || 0;
        const newRate = amt > 0 ? (iv / amt) * 100 : 0;
        next.interestRate = newRate.toFixed(2);
        const totalCalc = calculateTotalWithInterest(amt, newRate, months);
        const rem = parseFloat(next.remainingAmount) || totalCalc;
        const paidInst = parseInt(next.paidInstallments) || 0;
        const remInst = Math.max(1, months - paidInst);
        next.installmentValue = (rem / remInst).toFixed(2);
      } else if (field === "installmentValue") {
        // Manual override — no back-calculation needed
      } else if (field === "interestType" || field === "dueDate") {
        // Rebuild dates when contract type or due date changes
        const paidInst = parseInt(next.paidInstallments) || 0;
        const firstDue = next.dueDate ? new Date(next.dueDate + "T00:00:00") : new Date();
        setEditScheduleRows((prev) =>
          Array.from({ length: months }, (_, i) => {
            if (i < paidInst && prev[i]) return prev[i]; // Keep paid rows
            return {
              date: i === 0 ? firstDue : getNextDate(firstDue, next.interestType, i),
              value: prev[i]?.value || next.installmentValue,
            };
          })
        );
      }
      return next;
    });
  };

  if (editing) {
    return (
      <Card className="overflow-hidden border-primary/30">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Editar Empréstimo</h3>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEdit}><Check className="h-4 w-4 text-success" /></Button>
               <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="w-[25px] h-[25px] text-destructive" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Nome do Devedor</Label><Input value={form.borrowerName} onChange={(e) => updateField("borrowerName", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Valor (R$)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => updateField("amount", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Juros Mensal (%)</Label><Input type="number" step="0.1" value={form.interestRate} onChange={(e) => updateField("interestRate", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Valor do Juros (R$)</Label><Input type="number" step="0.01" value={form.interestValue} onChange={(e) => updateField("interestValue", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Valor da Parcela (R$)</Label><Input type="number" step="0.01" value={form.installmentValue} onChange={(e) => updateField("installmentValue", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Parcelas</Label><Input type="number" value={form.installments} onChange={(e) => updateField("installments", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Parcelas Pagas</Label><Input type="number" value={form.paidInstallments} onChange={(e) => updateField("paidInstallments", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Restante a Receber (R$)</Label><Input type="number" step="0.01" value={form.remainingAmount} onChange={(e) => updateField("remainingAmount", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Total a Receber (R$)</Label><p className="h-8 flex items-center text-sm font-bold text-primary">{formatCurrency((parseFloat(form.amount) || 0) + (parseFloat(form.interestValue) || 0))}</p></div>
            <div><Label className="text-xs">Data Início</Label><DatePickerField value={form.startDate} onChange={(v) => updateField("startDate", v)} className="h-8 text-sm" /></div>
            <div>
              <Label className="text-xs">Data 1ª Parcela</Label>
              <NativeDatePicker
                value={form.dueDate || ""}
                onChange={(v) => updateField("dueDate", v)}
                placeholder="Selecione"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Tipo Contrato</Label>
              <Select value={form.interestType} onValueChange={(v) => updateField("interestType", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Diário">Diário</SelectItem>
                  <SelectItem value="Semanal">Semanal</SelectItem>
                  <SelectItem value="Quinzenal">Quinzenal</SelectItem>
                  <SelectItem value="Mensal">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Ajuste de vencimento */}
          <div className="rounded-lg border border-border/50 p-3 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-foreground">Vencimento atual</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {(() => {
                    const d = getFirstPendingDate(loan, installmentSchedules);
                    return d ? d.toLocaleDateString("pt-BR") : "—";
                  })()}
                </p>
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAdjustDueDate(true)}>
                Ajustar vencimento
              </Button>
            </div>
          </div>

          <AdjustDueDateDialog
            open={showAdjustDueDate}
            onOpenChange={setShowAdjustDueDate}
            loan={loan}
            installmentSchedules={installmentSchedules}
            onSaveSchedule={onSaveSchedule}
            onUpdate={onUpdate}
          />



          {/* Manager edit block */}
          <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`edit-mgr-${loan.id}`}
                checked={editHasManager}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setEditHasManager(checked);
                  updateField("interestRate", checked ? "20" : "30");
                }}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor={`edit-mgr-${loan.id}`} className="text-xs font-medium cursor-pointer">
                Empréstimo com gerente
              </Label>
            </div>
            {editHasManager && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <Label className="text-xs">Gerente</Label>
                  <Select value={editManagerId} onValueChange={setEditManagerId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {managerOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Comissão (%)</Label>
                  <Input type="number" step="0.1" value={editCommissionRate} onChange={(e) => setEditCommissionRate(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
            )}
          </div>

          {/* Sale toggle */}
          <div className="border border-border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`edit-sale-${loan.id}`}
                checked={editIsSale}
                onChange={(e) => setEditIsSale(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor={`edit-sale-${loan.id}`} className="text-xs font-medium cursor-pointer">
                Contrato de venda
              </Label>
            </div>
          </div>

          {/* Installment Schedule */}
          {(parseInt(form.installments) || 0) >= 2 && editScheduleRows.length > 0 && (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowEditSchedule(!showEditSchedule)}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                {showEditSchedule ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Parcelas ({editScheduleRows.length}x)
                <Badge variant="outline" className="ml-auto text-xs">
                  {form.interestType}
                </Badge>
              </button>
              {showEditSchedule && (
                <div>
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
                    <div className="flex gap-3">
                      <span className="text-xs font-medium text-success">{parseInt(form.paidInstallments) || 0} pagas</span>
                      <span className="text-xs font-medium text-warning">{Math.max(0, editScheduleRows.length - (parseInt(form.paidInstallments) || 0))} pendentes</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                    {editScheduleRows.map((row, idx) => {
                      const paidCount = parseInt(form.paidInstallments) || 0;
                      const isPaid = idx < paidCount;
                      return (
                        <div key={idx} className={`flex items-center gap-2 px-3 py-2.5 ${isPaid ? "opacity-60" : ""}`}>
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isPaid ? "bg-success/20 text-success" : "bg-muted/40 text-muted-foreground"
                          }`}>
                            {idx + 1}ª
                          </span>
                          <div className="flex-1">
                            <NativeDatePicker
                              value={format(row.date, "yyyy-MM-dd")}
                              onChange={(v) => {
                                if (!v || isPaid) return;
                                const d = new Date(`${v}T00:00:00`);
                                setEditScheduleRows((prev) => {
                                  const rows = [...prev];
                                  rows[idx] = { ...rows[idx], date: d };
                                  for (let i = idx + 1; i < rows.length; i++) {
                                    if (i >= paidCount) {
                                      rows[i] = { ...rows[i], date: getNextDate(d, form.interestType, i - idx) };
                                    }
                                  }
                                  return rows;
                                });
                              }}
                              disabled={isPaid}
                              className="h-8 text-xs"
                            />
                          </div>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.value}
                            disabled={isPaid}
                            onChange={(e) => {
                              setEditScheduleRows((prev) => {
                                const rows = [...prev];
                                const newVal = e.target.value;
                                rows[idx] = { ...rows[idx], value: newVal };
                                if (idx === paidCount && rows.length > paidCount + 1) {
                                  const firstVal = parseFloat(newVal) || 0;
                                  const totalRem = parseFloat(form.remainingAmount) || 0;
                                  const otherCount = rows.length - paidCount - 1;
                                  const otherVal = (Math.max(0, totalRem - firstVal) / otherCount).toFixed(2);
                                  for (let i = paidCount + 1; i < rows.length; i++) {
                                    rows[i] = { ...rows[i], value: otherVal };
                                  }
                                }
                                return rows;
                              });
                            }}
                            className="h-8 w-24 text-xs text-right"
                          />
                          {isPaid && <Badge variant="outline" className="text-[10px] border-success/30 text-success shrink-0">Pago</Badge>}
                        </div>
                      );
                    })}
                    <div className="px-3 py-2 bg-muted/20">
                      <p className="text-xs text-muted-foreground">
                        Total: <span className="font-bold text-foreground">{rawFormatCurrency(editScheduleRows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0))}</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="text-xs">Etiquetas</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 text-xs">
                    {tag}
                    <button
                      type="button"
                      onClick={() => {
                        const currentTags = form.tags.split(",").map((t) => t.trim()).filter((t) => t !== tag);
                        updateField("tags", currentTags.join(", "));
                      }}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs shrink-0">
                      <ChevronDown className="h-3.5 w-3.5 mr-1" />
                      Existentes
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="start">
                    <div className="flex flex-col max-h-40 overflow-y-auto">
                      {existingTags
                        .filter((t: string) => !form.tags.split(",").map((x: string) => x.trim()).filter(Boolean).includes(t))
                        .sort((a: string, b: string) => a.localeCompare(b, "pt-BR"))
                        .map((tag: string) => (
                          <button
                            key={tag}
                            type="button"
                            className="text-left text-sm px-3 py-1.5 hover:bg-muted rounded-sm"
                            onClick={() => {
                              const currentTags = form.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
                              updateField("tags", [...currentTags, tag].join(", "));
                            }}
                          >
                            {tag}
                          </button>
                        ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Input
                  value={form.tags}
                  onChange={(e) => updateField("tags", e.target.value)}
                  className="h-8 text-sm flex-1"
                  placeholder="Digite etiquetas separadas por vírgula"
                />
              </div>
            </div>
          </div>
          <div><Label className="text-xs">Observações</Label><Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={2} className="text-sm" /></div>
        </CardContent>
      </Card>
    );
  }

  const borderColor =
    category === "overdue" ? "border-l-destructive" :
    category === "due_today" ? "border-l-warning" :
    category === "paid" ? "border-l-success" :
    category === "paid_interest" ? "border-l-purple" :
    "border-l-primary";

  const expectedProfit = remaining + totalPaid - loan.amount;
  const realizedProfit = Math.max(0, totalPaid - loan.amount);
  const realizedProfitPct = expectedProfit > 0 ? Math.round((realizedProfit / expectedProfit) * 100) : 0;

  const accentVar =
    category === "overdue" ? "hsl(var(--destructive))" :
    category === "due_today" ? "hsl(var(--warning))" :
    category === "paid" ? "hsl(var(--success))" :
    category === "paid_interest" ? "hsl(var(--purple, var(--primary)))" :
    "hsl(var(--primary))";

  const cardBorder =
    category === "overdue" ? "border-destructive/25" :
    category === "due_today" ? "border-warning/25" :
    category === "paid" ? "border-success/25" :
    category === "paid_interest" ? "border-purple/25" :
    "border-border/60";

  const cardBg = "bg-card";

  const headerBg =
    category === "overdue" ? "from-destructive/10 to-transparent border-destructive/15" :
    category === "due_today" ? "from-warning/10 to-transparent border-warning/15" :
    category === "paid" ? "from-success/10 to-transparent border-success/15" :
    category === "paid_interest" ? "from-purple/10 to-transparent border-purple/15" :
    "from-primary/[0.06] to-transparent border-border/50";

  return (
    <>
    <Card no3d={no3d} className={`relative overflow-hidden rounded-2xl hover:shadow-[0_10px_32px_-16px_hsl(0_0%_0%/0.18)] hover:-translate-y-[2px] transition-all duration-300 ease-out h-full flex flex-col border ${cardBorder} ${cardBg}`}>
      {/* Left status accent stripe */}
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accentVar }} />
      {/* Client Name Header */}
      <div className={`border-b px-4 py-3 bg-gradient-to-b ${headerBg} relative flex items-center gap-2`}>
        <span aria-hidden className="h-2 w-2 rounded-full shrink-0" style={{ background: accentVar, boxShadow: `0 0 0 3px ${accentVar}22` }} />
        <h3 className="font-semibold text-foreground text-[15px] leading-tight tracking-tight inline-flex items-center gap-1.5 min-w-0">
          <span className="truncate">{loan.borrowerName}</span>
          {renegotiations.length > 0 && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-500/20 text-amber-700 dark:bg-amber-400/25 dark:text-amber-300 border border-amber-500/40 cursor-help shrink-0"
                    aria-label={`Renegociado ${renegotiations.length}x`}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Renegociado {renegotiations.length}x
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </h3>
      </div>

      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        {/* Avatar + Badges + Actions Row */}
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 ${
            category === "overdue" ? "bg-destructive" :
            category === "due_today" ? "bg-warning" :
            category === "paid" ? "bg-success" :
            "gradient-primary"
          }`}>
            {loan.borrowerName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={`${badge.className} text-xs font-semibold`}>{badge.label}</Badge>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20 uppercase">
              {loan.interestType}
            </Badge>
            {loan.hasManager && (
              <Badge variant="outline" className="text-xs bg-[#009C3B]/15 text-[#009C3B] dark:bg-emerald-500/25 dark:text-emerald-300 border-[#009C3B]/60 dark:border-emerald-500/60 gap-1">
                <UserCog className="h-3 w-3" />Com gerente
              </Badge>
            )}
            {loan.isSale && (
              <Badge variant="outline" className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 gap-1">
                <ShoppingBag className="h-3 w-3" />Venda
              </Badge>
            )}
            {daysOverdue > 0 && loan.status !== "paid" && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                {daysOverdue}d atraso
              </Badge>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1 flex-wrap">
            {loan.tags && loan.tags.length > 0 && loan.tags.map((tag) => (
              <Badge key={tag} className="bg-primary text-primary-foreground text-xs gap-0.5 pr-1">
                <Tag className="h-2.5 w-2.5" />{tag}
                <button type="button" onClick={() => { const updated = (loan.tags || []).filter(t => t !== tag); onUpdate({ tags: updated }); }} className="ml-0.5 hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            {showTagInput ? (
              <div className="flex items-center gap-1">
                <Input
                  value={newTag} onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Etiqueta" className="h-6 w-24 text-xs" autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTag.trim()) {
                      onUpdate({ tags: [...(loan.tags || []), newTag.trim()] });
                      setNewTag(""); setShowTagInput(false);
                    }
                    if (e.key === "Escape") { setNewTag(""); setShowTagInput(false); }
                  }}
                />
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                  if (newTag.trim()) { onUpdate({ tags: [...(loan.tags || []), newTag.trim()] }); }
                  setNewTag(""); setShowTagInput(false);
                }}><Check className="h-3 w-3 text-success" /></Button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowTagInput(true)} className="h-6 w-6 rounded-md border border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary hover:text-primary transition-colors" title="Adicionar etiqueta">
                <Tag className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Large remaining amount */}
        <div className="text-center py-3 rounded-xl bg-gradient-to-b from-muted/30 to-transparent">
          {(loan.paymentType === "Parcelado" || loan.installments >= 2) && loan.status !== "paid" && loan.paidInstallments < loan.installments ? (
            <p className={`text-[32px] leading-none font-bold tracking-tight tabular-nums ${remaining > 0 ? "text-foreground" : "text-success"}`}>
              {formatCurrency(installment)}
            </p>
          ) : (
            <p className={`text-[32px] leading-none font-bold tracking-tight tabular-nums ${remaining > 0 ? "text-foreground" : "text-success"}`}>
              {formatCurrency(remaining)}
            </p>
          )}
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-2">
            {(loan.paymentType === "Parcelado" || loan.installments >= 2) && loan.status !== "paid" && loan.paidInstallments < loan.installments
              ? `parcela pendente (${loan.paidInstallments + 1}ª de ${loan.installments})${loan.customInstallmentValue != null ? " • manual" : ""}`
              : "restante a receber"}
          </p>
          {(loan.paymentType === "Parcelado" || loan.installments >= 2) && loan.status !== "paid" && loan.paidInstallments < loan.installments && (
            <p className="text-xs text-muted-foreground mt-1">Total restante: <span className="tabular-nums font-medium text-foreground/80">{formatCurrency(remaining)}</span></p>
          )}
          {lateFees > 0 && (
            <div className="text-xs text-destructive mt-1 space-y-0.5">
              {lateInterestTotal > 0 && (
                <p>+ Juros atraso ({effectiveDaysLate}d): {rawFormatCurrency(lateInterestTotal)}</p>
              )}
              {penaltyTotal > 0 && (
                <p>+ Multa: {rawFormatCurrency(penaltyTotal)}</p>
              )}
              {renegPenaltyPending > 0 && (
                <p>+ Multa de renegociação: {rawFormatCurrency(renegPenaltyPending)}</p>
              )}
            </div>
          )}
        </div>

        {/* Emprestado / Total a Receber */}
        <div className="grid grid-cols-2 gap-3 border border-border/30 rounded-xl p-3">
          <div>
            <p className="text-xs text-muted-foreground">Emprestado</p>
            <p className="text-base font-bold text-foreground">{formatCurrency(loan.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total a Receber</p>
            <p className="text-base font-bold text-foreground">{formatCurrency(Math.round((totalPaid + remaining) * 100) / 100)}</p>
            {loan.amount > 0 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Juros acumulado: {(((totalPaid + remaining) - loan.amount) / loan.amount * 100).toFixed(2)}%
              </p>
            )}
          </div>
        </div>

        {/* Lucro Previsto / Lucro Realizado */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-success/5 border border-success/20 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">💰 Lucro Previsto</p>
            <p className="text-sm font-bold text-success">{formatCurrency(remaining + totalPaid - loan.amount)}</p>
          </div>
          <div className="bg-muted/30 border border-border/50 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">✅ Lucro Realizado</p>
            <p className="text-sm font-bold text-foreground">
              {formatCurrency(realizedProfit)} <span className="text-xs text-muted-foreground">{realizedProfitPct}%</span>
            </p>
          </div>
        </div>

        {/* Saldo pendente de juros do ciclo atual */}
        {loan.installments < 2 && loan.status !== "paid" && (() => {
          const baseInterest = loan.customInterestValue != null && loan.customInterestValue > 0
            ? loan.customInterestValue
            : loan.amount * (loan.interestRate / 100);
          const cyclePartialPayments = allPayments
            .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
              && (p as any).metadata?.kind === "interest_partial"
              && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate));
          const cyclePartials = cyclePartialPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
          if (cyclePartials <= 0) return null;
          const cycleFees = cyclePartialPayments.reduce(
            (m, p) => Math.max(m, Number((p as any).metadata?.cycle_fees_total || 0)),
            0,
          );
          const cycleTarget = Math.round((baseInterest + cycleFees) * 100) / 100;
          const pending = Math.max(0, Math.round((cycleTarget - cyclePartials) * 100) / 100);
          const dueStr = new Date(loan.dueDate + "T00:00:00").toLocaleDateString("pt-BR");
          return (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-warning flex items-center gap-1">⏳ Juros parcial em aberto</span>
                <span className="text-[10px] text-muted-foreground">Ciclo de {dueStr}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-muted-foreground text-[10px]">{cycleFees > 0 ? "Total do ciclo" : "Juros do período"}</p>
                  <p className="font-semibold text-foreground tabular-nums">{formatCurrency(cycleTarget)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px]">Já recebido</p>
                  <p className="font-semibold text-success tabular-nums">{formatCurrency(cyclePartials)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px]">Saldo pendente</p>
                  <p className="font-semibold text-warning tabular-nums">{formatCurrency(pending)}</p>
                </div>
              </div>
              {cycleFees > 0 && (
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Juros base: <span className="tabular-nums text-foreground">{formatCurrency(baseInterest)}</span></span>
                  <span>Encargos: <span className="tabular-nums text-warning">{formatCurrency(cycleFees)}</span></span>
                </div>
              )}
              <div className="border-t border-warning/20 pt-1.5 flex justify-between">
                <span className="text-muted-foreground">Vencimento atual</span>
                <span className="font-medium tabular-nums">{dueStr}</span>
              </div>
              <p className="text-[10px] text-muted-foreground italic">Próximo vencimento será exibido após a quitação total deste ciclo.</p>
            </div>
          );
        })()}

        {/* Vencimento / Pago */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="relative flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer text-left w-full">
              <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Venc: <Pencil className="inline h-2.5 w-2.5 ml-0.5" /></p>
                <p className="text-sm font-semibold text-foreground">{getFirstPendingDate(loan, installmentSchedules).toLocaleDateString("pt-BR")}</p>
              </div>
              <input
                type="date"
                className="absolute inset-0 opacity-0 cursor-pointer"
                value={format(getFirstPendingDate(loan, installmentSchedules), "yyyy-MM-dd")}
                onChange={async (e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const d = new Date(`${v}T00:00:00`);
                  const newDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                  const newDateStr = v;
                  const nextNum = loan.paidInstallments + 1;
                  if (nextNum === 1) {
                    onUpdate({ dueDate: newDateStr });
                  }
                  const freq = loan.interestType || "Mensal";
                  const loanSchedules = installmentSchedules
                    .filter((s) => s.loanId === loan.id)
                    .sort((a, b) => a.installmentNumber - b.installmentNumber);
                  const defaultAmount = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
                  const totalInstallments = loan.installments;
                  const updatedRows = Array.from({ length: totalInstallments }, (_, i) => {
                    const num = i + 1;
                    const existing = loanSchedules.find((s) => s.installmentNumber === num);
                    const amount = existing?.amount ?? defaultAmount;
                    if (num < nextNum) {
                      const firstDue = new Date(loan.dueDate + "T00:00:00");
                      const fallback = getNextDate(firstDue, freq, num - 1).toISOString().split("T")[0];
                      return { installmentNumber: num, dueDate: existing?.dueDate ?? fallback, amount };
                    }
                    const offset = num - nextNum;
                    const computed = getNextDate(newDate, freq, offset).toISOString().split("T")[0];
                    return { installmentNumber: num, dueDate: computed, amount };
                  });
                  await onSaveSchedule(loan.id, updatedRows);
                }}
              />
            </label>
          </div>
          <div className="flex items-center gap-2 bg-success/5 border border-success/20 rounded-lg px-3 py-2">
            <DollarSign className="h-4 w-4 text-success shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Pago:</p>
              <p className="text-sm font-bold text-success">{formatCurrency(totalPaid)}</p>
            </div>
          </div>
        </div>

        <AdjustDueDateDialog
          open={showAdjustDueDate}
          onOpenChange={setShowAdjustDueDate}
          loan={loan}
          installmentSchedules={installmentSchedules}
          onSaveSchedule={onSaveSchedule}
          onUpdate={onUpdate}
        />

        {/* Só Juros (por parcela) */}
        <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-3 border border-border/50">
          <span className="text-sm text-muted-foreground">Só Juros (por parcela):</span>
          <span className="text-sm font-bold text-foreground">{formatCurrency(interestOnly)}</span>
        </div>

        {/* Observação */}
        {loan.notes ? (
          <p className="text-xs text-muted-foreground italic bg-muted/30 rounded-lg px-3 py-2">📝 {loan.notes}</p>
        ) : (
          <div className="h-2" aria-hidden="true" />
        )}

        {/* Mais Detalhes - Installment Schedule */}
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs text-primary hover:underline w-full justify-center py-1"
        >
          {showDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {showDetails ? "Ocultar detalhes" : "Mais detalhes"}
        </button>

        {showDetails && (
          <div className="space-y-2 bg-muted/30 rounded-lg p-3 border border-border/50">
            <p className="text-xs font-semibold text-foreground mb-2">Cronograma de Parcelas</p>
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-1 text-xs">
              <span className="font-medium text-muted-foreground">#</span>
              <span className="font-medium text-muted-foreground">Vencimento</span>
              <span className="font-medium text-muted-foreground">Valor</span>
              <span className="font-medium text-muted-foreground">Status</span>
              {Array.from({ length: loan.installments }, (_, idx) => {
                const i = idx + 1;
                // Priority: 1) saved schedule, 2) payment date, 3) calculated fallback
                const savedSchedule = installmentSchedules.find((s) => s.loanId === loan.id && s.installmentNumber === i);
                const firstDueDate = new Date(loan.dueDate + "T00:00:00");
                const fallbackDate = getNextDate(firstDueDate, loan.interestType || "Mensal", i - 1);
                const instDate = savedSchedule
                  ? new Date(savedSchedule.dueDate + "T00:00:00")
                  : i <= loan.paidInstallments
                    ? (() => {
                        const loanPayment = allPayments.find((p) => p.loanId === loan.id && p.installmentNumber === i);
                        return loanPayment ? new Date(loanPayment.date + "T00:00:00") : fallbackDate;
                      })()
                    : fallbackDate;
                const instDateStr = instDate.toLocaleDateString("pt-BR");
                const instAmount = savedSchedule?.amount ?? installment;
                const isPaid = i <= loan.paidInstallments;
                const todayNorm = new Date();
                const todayStr = `${todayNorm.getFullYear()}-${String(todayNorm.getMonth() + 1).padStart(2, "0")}-${String(todayNorm.getDate()).padStart(2, "0")}`;
                const instIso = instDate.toISOString().split("T")[0];
                const isOverdue = !isPaid && instIso < todayStr;
                const isDueToday = !isPaid && instIso === todayStr;
                return (
                  <React.Fragment key={i}>
                    <span className="text-muted-foreground">{i}</span>
                    <span className="text-foreground">{instDateStr}</span>
                    <span className="text-foreground font-medium">{formatCurrency(instAmount)}</span>
                    <span>
                      {isPaid ? (
                        <Badge className="bg-success/20 text-success border-success/30 text-[10px]">Pago</Badge>
                      ) : isOverdue ? (
                        <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">Atrasado</Badge>
                      ) : isDueToday ? (
                        <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">Hoje</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Pendente</Badge>
                      )}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-border/30 text-xs">
              <div>
                <p className="text-muted-foreground">Valor da Parcela</p>
                <p className="font-semibold text-foreground">{formatCurrency(installment)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Juros por Parcela</p>
                <p className="font-semibold text-foreground">{formatCurrency(installment - (loan.amount / loan.installments))}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total de Juros</p>
                <p className="font-semibold text-foreground">{formatCurrency(totalInterest)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Já Recebido</p>
                <p className="font-semibold text-success">{formatCurrency(totalPaid)}</p>
              </div>
            </div>
          </div>
        )}

        {showDetails && (() => {
          // Auditoria: original_due_date vs due_date atual e próximo vencimento (juros)
          const fmt = (iso?: string | null) => {
            if (!iso) return "—";
            const [y, m, d] = iso.split("-");
            return `${d}/${m}/${y}`;
          };
          const currentDueIso = loan.dueDate;
          const rawOriginal = loan.originalDueDate || loan.dueDate;
          // Proteção: se "original" > due_date atual, está corrompido — usa due_date como âncora.
          const originalDueIso = rawOriginal > currentDueIso ? currentDueIso : rawOriginal;
          const wasRenegotiated = !!loan.originalDueDate && loan.originalDueDate !== loan.dueDate && loan.originalDueDate <= loan.dueDate;
          const freq = loan.interestType || "Mensal";
          // Replica regra de addInterestOnlyPayment: avança 1 período a partir do dueDate atual
          // e, no caso Mensal, "snap" para o dia da âncora (originalDueDate)
          const nextDue = (() => {
            // Regra alinhada com addInterestOnlyPayment: parte da âncora e avança
            // ciclos até ficar > hoje (ignora renegociações no due_date).
            const today = new Date().toISOString().split("T")[0];
            const advance = (d: Date) => {
              if (freq === "Diário") d.setDate(d.getDate() + 1);
              else if (freq === "Semanal") d.setDate(d.getDate() + 7);
              else if (freq === "Quinzenal") d.setDate(d.getDate() + 15);
              else {
                const anchorDay = Number(originalDueIso.split("-")[2]);
                d.setMonth(d.getMonth() + 1);
                if (Number.isFinite(anchorDay)) {
                  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                  d.setDate(Math.min(anchorDay, lastDay));
                }
              }
            };
            const d = new Date(originalDueIso + "T00:00:00");
            advance(d);
            let guard = 0;
            while (d.toISOString().split("T")[0] <= today && guard < 600) {
              advance(d);
              guard += 1;
            }
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${yyyy}-${mm}-${dd}`;
          })();
          return (
            <div className="space-y-2 bg-muted/20 rounded-lg p-3 border border-dashed border-border/60">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                🔍 Auditoria de Vencimento
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Vencimento original (âncora)</p>
                  <p className="font-semibold text-foreground">{fmt(originalDueIso)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Vencimento atual{wasRenegotiated ? " (renegociado)" : ""}</p>
                  <p className={`font-semibold ${wasRenegotiated ? "text-warning" : "text-foreground"}`}>{fmt(currentDueIso)}</p>
                </div>
                <div className="col-span-2 pt-1 mt-1 border-t border-border/30">
                  <p className="text-muted-foreground">Próximo vencimento se pagar apenas juros agora</p>
                  <p className="font-semibold text-primary">{fmt(nextDue)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {freq === "Mensal"
                      ? `Cálculo: próximo dia ${originalDueIso.split("-")[2]} (âncora original) após hoje. Renegociações no vencimento são ignoradas.`
                      : `Cálculo: próximo ciclo de ${freq === "Diário" ? "1" : freq === "Semanal" ? "7" : "15"} dia(s) a partir da âncora, após hoje.`}
                  </p>
                </div>
                <div className="col-span-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs gap-1.5"
                    onClick={() => setShowAccountModal(true)}
                  >
                    📒 Ver conta passo a passo
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal: Conta passo a passo */}
        <Dialog open={showAccountModal} onOpenChange={setShowAccountModal}>
          <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>📒 Conta passo a passo</DialogTitle>
            </DialogHeader>
            {(() => {
              const fmtBR = (iso: string) => {
                const [y, m, d] = iso.split("-");
                return `${d}/${m}/${y}`;
              };
              const addPeriod = (iso: string, anchorIso: string, freq: string) => {
                const d = new Date(iso + "T00:00:00");
                if (freq === "Diário") d.setDate(d.getDate() + 1);
                else if (freq === "Semanal") d.setDate(d.getDate() + 7);
                else if (freq === "Quinzenal") d.setDate(d.getDate() + 15);
                else {
                  const anchorDay = Number(anchorIso.split("-")[2]);
                  d.setMonth(d.getMonth() + 1);
                  if (Number.isFinite(anchorDay)) {
                    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                    d.setDate(Math.min(anchorDay, lastDay));
                  }
                }
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              };
              const freq = loan.interestType || "Mensal";
              const rawBase = loan.originalDueDate || loan.dueDate;
              // Proteção: se "original" > due atual, está corrompido — usa due_date.
              const baseIso = rawBase > loan.dueDate ? loan.dueDate : rawBase;
              const interestPayments = allPayments
                .filter((p) => p.loanId === loan.id && p.metadata?.kind !== "amortization")
                .sort((a, b) => a.date.localeCompare(b.date));
              const steps: { label: string; date: string; detail?: string; highlight?: boolean }[] = [];
              steps.push({
                label: "Data base (vencimento original — âncora fixa)",
                date: fmtBR(baseIso),
                detail: `Frequência: ${freq}. Esta data nunca muda, mesmo após renegociações.`,
              });
              let runningDue = baseIso;
              interestPayments.forEach((p, idx) => {
                const prev = p.previousDueDate || runningDue;
                const next = addPeriod(prev, baseIso, freq);
                steps.push({
                  label: `Pagamento de juros #${idx + 1} em ${fmtBR(p.date)}`,
                  date: `${fmtBR(prev)} → ${fmtBR(next)}`,
                  detail: `Valor pago: ${formatCurrency(p.amount)}. Novo vencimento = ${fmtBR(prev)} + 1 ${freq.toLowerCase()}${freq === "Mensal" ? `, ajustado para o dia ${baseIso.split("-")[2]}` : ""}.`,
                });
                runningDue = next;
              });
              steps.push({
                label: "Vencimento atual no sistema",
                date: fmtBR(loan.dueDate),
                detail: loan.originalDueDate && loan.originalDueDate !== loan.dueDate
                  ? "⚠️ Renegociado — diferente da âncora."
                  : "Alinhado com a âncora original.",
              });
              const todayIso = new Date().toISOString().split("T")[0];
              let nextProj = addPeriod(baseIso, baseIso, freq);
              let g = 0;
              while (nextProj <= todayIso && g < 600) {
                nextProj = addPeriod(nextProj, baseIso, freq);
                g += 1;
              }
              steps.push({
                label: "Se pagar juros agora",
                date: `${fmtBR(loan.dueDate)} → ${fmtBR(nextProj)}`,
                detail: `Próximo vencimento sempre calculado a partir da âncora ${fmtBR(baseIso)}${freq === "Mensal" ? ` (dia ${baseIso.split("-")[2]})` : ""}, ignorando renegociações.`,
                highlight: true,
              });
              return (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Linha do tempo do ciclo de vencimentos baseada nos pagamentos reais registrados.
                  </p>
                  <ol className="space-y-2">
                    {steps.map((s, i) => (
                      <li
                        key={i}
                        className={cn(
                          "rounded-lg border p-3 space-y-1",
                          s.highlight ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/20",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {i + 1}. {s.label}
                          </span>
                          <span className={cn("text-xs font-mono tabular-nums shrink-0", s.highlight ? "text-primary font-bold" : "text-foreground")}>
                            {s.date}
                          </span>
                        </div>
                        {s.detail && <p className="text-[11px] text-muted-foreground">{s.detail}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })()}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAccountModal(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Partial payment input */}
        <PartialPaymentDialog
          open={showPartial}
          onOpenChange={(open) => { if (!open) { setShowPartial(false); setPartialAmount(""); setPartialDate(new Date()); } }}
          loan={loan}
          amount={partialAmount}
          onAmountChange={setPartialAmount}
          date={partialDate}
          onDateChange={setPartialDate}
          methods={activeMethods}
          selectedMethodId={selectedMethodId}
          onSelectedMethodChange={setSelectedMethodId}
          onConfirm={handlePartialSubmit}
          formatCurrency={formatCurrency}
          totalContract={total}
          totalPaid={totalPaid}
          baseRemaining={baseRemaining}
          remainingWithFees={remaining}
          paidInstallments={loan.paidInstallments}
          totalInstallments={loan.installments}
          nextDueDateLabel={nextInstallmentDate}
          interestRate={loan.interestRate}
          interestPendingCycle={interestPending}
          lateInterestTotal={lateInterestTotal}
          penaltyTotal={penaltyTotal}
          daysOverdue={daysOverdue}
        />

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50 mt-auto">
          {!readOnly && loan.status !== "paid" && (
            <Button
              type="button"
              data-mutation
              className="w-full h-10 text-sm font-semibold gap-2"
              onClick={() => setPaymentHubOpen(true)}
            >
              <DollarSign className="h-4 w-4" /> Pagar
            </Button>
           )}
          {!readOnly && loan.status !== "paid" && (
            <div className="flex gap-2">
              {onRenegotiate && (
                <Button data-mutation
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs gap-1.5 border-warning text-warning"
                  onClick={() => setShowRenegotiateDialog(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Renegociar
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9 text-xs gap-1.5 border-primary text-primary"
                onClick={async () => {
                  try {
                    await generateLoanReportPdf({
                      loan,
                      payments: allPayments,
                      installmentSchedules,
                      renegotiations,
                    });
                    toast.success("Relatório gerado");
                  } catch (e: any) {
                    toast.error(e?.message || "Falha ao gerar relatório");
                  }
                }}
              >
                <FileDown className="h-3.5 w-3.5" /> Baixar PDF
              </Button>
            </div>
          )}
          {!readOnly && loan.status !== "paid" && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1.5 border-warning text-warning" onClick={() => setShowLateInterest(!showLateInterest)}>
                <Percent className="h-3.5 w-3.5" /> Juros por Atraso
              </Button>
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1.5 border-destructive text-destructive" onClick={() => setShowPenalty(!showPenalty)}>
                <DollarSign className="h-3.5 w-3.5" /> Aplicar Multa
              </Button>
            </div>
          )}
          {!readOnly && showLateInterest && (
            <div className="p-3 rounded-lg bg-muted border border-border/50 space-y-2">
              <p className="text-xs font-semibold text-foreground">Juros por Atraso</p>
              <div className="flex gap-2">
                <Button size="sm" variant={lateInterestType === "percentage" ? "default" : "outline"} className="flex-1 h-8 text-xs" onClick={() => setLateInterestType("percentage")}>
                  % por dia
                </Button>
                <Button size="sm" variant={lateInterestType === "fixed" ? "default" : "outline"} className="flex-1 h-8 text-xs" onClick={() => setLateInterestType("fixed")}>
                  R$ por dia
                </Button>
              </div>
              <Input
                type="number" step="0.01" min="0"
                placeholder={lateInterestType === "percentage" ? "Ex: 0.5 (%)" : "Ex: 5.00 (R$)"}
                value={lateInterestValue}
                onChange={(e) => setLateInterestValue(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="flex gap-2">
                <Button data-mutation size="sm" className="flex-1 h-8 text-xs" onClick={() => {
                  const val = parseFloat(lateInterestValue) || 0;
                  onUpdate({ lateInterestType, lateInterestValue: val > 0 ? val : null });
                  setShowLateInterest(false);
                }}>Salvar</Button>
                {loan.lateInterestValue != null && (
                  <Button data-mutation size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => {
                    onUpdate({ lateInterestType: null, lateInterestValue: null });
                    setLateInterestValue("");
                    setShowLateInterest(false);
                  }}>Remover</Button>
                )}
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowLateInterest(false)}>Cancelar</Button>
              </div>
            </div>
          )}
          {!readOnly && showPenalty && (
            <div className="p-3 rounded-lg bg-muted border border-border/50 space-y-2">
              <p className="text-xs font-semibold text-foreground">Multa por Parcela (valor fixo único)</p>
              <Input
                type="number" step="0.01" min="0"
                placeholder="Ex: 50.00 (R$)"
                value={penaltyValue}
                onChange={(e) => setPenaltyValue(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="flex gap-2">
                <Button data-mutation size="sm" className="flex-1 h-8 text-xs" onClick={() => {
                  const val = parseFloat(penaltyValue) || 0;
                  onUpdate({ penaltyValue: val > 0 ? val : null });
                  setShowPenalty(false);
                }}>Salvar</Button>
                {loan.penaltyValue != null && (
                  <Button data-mutation size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => {
                    onUpdate({ penaltyValue: null });
                    setPenaltyValue("");
                    setShowPenalty(false);
                  }}>Remover</Button>
                )}
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowPenalty(false)}>Cancelar</Button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-center gap-1">
            {!readOnly && loan.status === "paid" && (
              <Button
                size="icon" variant="ghost" className="h-8 w-8 text-success"
                onClick={() => onUpdate({ status: "active", paidInstallments: 0 })}
                title="Marcar como não pago"
              >
                <CheckCircle className="h-4 w-4" />
              </Button>
            )}
            {loan.status !== "paid" && (loan.autoBillingEnabled ?? true) && (
              <WhatsappBillButton
                loan={loan}
                clients={clients}
                payments={allPayments}
                installmentSchedules={installmentSchedules}
              />
            )}
            {!readOnly && loan.status !== "paid" && (
              <Button
                size="icon"
                variant="ghost"
                className={cn("h-8 w-8", (loan.autoBillingEnabled ?? true) ? "text-primary" : "text-muted-foreground")}
                onClick={() => onUpdate({ autoBillingEnabled: !(loan.autoBillingEnabled ?? true) })}
                title={(loan.autoBillingEnabled ?? true) ? "Desativar cobrança automática" : "Ativar cobrança automática"}
              >
                {(loan.autoBillingEnabled ?? true) ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowHistory(true)} title="Histórico de Pagamentos">
              <History className="h-4 w-4 text-muted-foreground" />
            </Button>
            {!readOnly && (
              <>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={startEdit} title="Editar">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setConfirmDelete(true)} title="Excluir">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
           </div>
        </div>
      </CardContent>
    </Card>
    <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
      <DialogContent
        style={{ padding: 0 }}
        className={cn(
          "left-1 right-1 top-1 bottom-1 h-auto w-auto max-w-none translate-x-0 translate-y-0 flex flex-col overflow-hidden p-0 sm:left-[50%] sm:right-auto sm:top-[50%] sm:bottom-auto sm:h-auto sm:max-h-[92svh] sm:w-full sm:max-w-[440px] md:max-w-[760px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:grid sm:grid-rows-[auto_minmax(0,1fr)_auto] sm:gap-0",
          ((paymentDialog?.type === "interest" || paymentDialog?.type === "installment") && lateFees > 0) && "sm:max-w-[460px] md:max-w-[780px]"
        )}
      >
        <DialogHeader className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle className="text-base sm:text-lg">
            {paymentDialog?.type === "full" ? "Pagamento Total" :
             paymentDialog?.type === "payoff" ? "Quitar Contrato" :
             paymentDialog?.type === "amortize" ? "Amortizar Contrato" :
             paymentDialog?.type === "installment" ? "Receber Parcela" :
             paymentDialog?.type === "interest" ? "Pagar Juros" : "Pagamento Parcial"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] px-4 pb-3 sm:px-6 sm:pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mt-2">
            <div className="space-y-4">
              <div className="hidden md:block rounded-lg border border-border/60 bg-card/60 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Resumo do empréstimo</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                  <div>
                    <p className="text-muted-foreground">Total emprestado</p>
                    <p className="font-semibold text-foreground tabular-nums">{formatCurrency(loan.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Já recebido</p>
                    <p className="font-semibold text-success tabular-nums">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Parcelas pagas</p>
                    <p className="font-semibold text-foreground tabular-nums">{loan.paidInstallments} / {loan.installments}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Pendentes</p>
                    <p className="font-semibold text-foreground tabular-nums">{Math.max(0, loan.installments - loan.paidInstallments)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Próximo vencimento</p>
                    <p className="font-semibold text-foreground tabular-nums">{nextSchedule?.dueDate ? new Date(nextSchedule.dueDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Taxa de juros</p>
                    <p className="font-semibold text-foreground tabular-nums">{Number(loan.interestRate).toFixed(2)}% a.m.</p>
                  </div>
                </div>
              </div>

              {paymentDialog?.type === "full" && (() => {
                const paidPrincipal = Math.max(0, totalPaid - interestPaymentsReceived);
                const principalRemaining = Math.max(0, loan.amount - paidPrincipal);
                const interestPendingTotal = Math.max(0, baseRemaining - principalRemaining);
                return (
                  <FullPaymentSummary
                    principalRemaining={principalRemaining}
                    interestPending={interestPendingTotal}
                    penaltyTotal={penaltyTotal}
                    lateInterestTotal={lateInterestTotal}
                    renegPenaltyPending={renegPenaltyPending}
                    totalFinal={remaining}
                    pendingInstallments={Math.max(0, loan.installments - loan.paidInstallments)}
                    formatCurrency={formatCurrency}
                  />
                );
              })()}
              {paymentDialog?.type === "payoff" && (() => {
                const paidPrincipal = Math.max(0, totalPaid - interestPaymentsReceived);
                const principalRemaining = Math.max(0, loan.amount - paidPrincipal);
                const interestPendingTotal = Math.max(0, baseRemaining - principalRemaining);
                return (
                  <PayoffCompositionCard
                    principalRemaining={principalRemaining}
                    interestPending={interestPendingTotal}
                    penaltyTotal={penaltyTotal}
                    lateInterestTotal={lateInterestTotal}
                    renegPenaltyPending={renegPenaltyPending}
                    totalContract={remaining}
                    formatCurrency={formatCurrency}
                  />
                );
              })()}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                  <div>
                    <p className="text-muted-foreground">Total emprestado</p>
                    <p className="font-semibold text-foreground tabular-nums">{formatCurrency(loan.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Já recebido</p>
                    <p className="font-semibold text-success tabular-nums">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Parcelas pagas</p>
                    <p className="font-semibold text-foreground tabular-nums">{loan.paidInstallments} / {loan.installments}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Pendentes</p>
                    <p className="font-semibold text-foreground tabular-nums">{Math.max(0, loan.installments - loan.paidInstallments)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Próximo vencimento</p>
                    <p className="font-semibold text-foreground tabular-nums">{nextSchedule?.dueDate ? new Date(nextSchedule.dueDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Taxa de juros</p>
                    <p className="font-semibold text-foreground tabular-nums">{Number(loan.interestRate).toFixed(2)}% a.m.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">

              {paymentDialog?.type === "payoff" && (
                <div className="w-full space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="payoff-amount" className="text-xs">Valor da quitação (R$)</Label>
                    <Input
                      id="payoff-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={payoffAmount}
                      onChange={(e) => setPayoffAmount(e.target.value)}
                      placeholder={`Ex: ${remaining.toFixed(2)}`}
                      autoFocus
                    />
                  </div>
                  <PayoffSimulationCard
                    inputAmount={payoffAmount}
                    totalContract={remaining}
                    formatCurrency={formatCurrency}
                  />
                </div>
              )}
          {paymentDialog?.type === "amortize" && (() => {
            const oldPrincipal = Number(loan.amount) || 0;
            const rate = Number(loan.interestRate) || 0;
            const oldInterest = loan.customInterestValue != null && loan.customInterestValue > 0
              ? Number(loan.customInterestValue)
              : oldPrincipal * (rate / 100);
            const oldTotal = oldPrincipal + oldInterest;
            const paidPrincipalAndInstallments = allPayments
              .filter((p) => p.loanId === loan.id && p.installmentNumber !== 0 && p.installmentNumber !== -2)
              .reduce((sum, p) => sum + Number(p.amount), 0);
            const oldRemaining = Math.max(0, oldTotal - paidPrincipalAndInstallments);
            const remainingInst = Math.max(1, loan.installments - loan.paidInstallments);
            const oldInstallment = oldRemaining / remainingInst;
            const amortRaw = parseFloat(amortizeAmount.replace(",", "."));
            const v = isFinite(amortRaw) && amortRaw > 0 ? amortRaw : 0;
            const validV = v > 0 && v <= oldPrincipal;
            const newPrincipal = Math.max(0, oldPrincipal - v);
            const newCustomInterest = loan.customInterestValue != null && loan.customInterestValue > 0 && oldPrincipal > 0
              ? loan.customInterestValue * (newPrincipal / oldPrincipal)
              : null;
            const newInterest = newCustomInterest != null ? newCustomInterest : newPrincipal * (rate / 100);
            const newTotal = newPrincipal + newInterest;
            const newRemaining = Math.max(0, newTotal - paidPrincipalAndInstallments);
            const newInstallment = newRemaining / remainingInst;
            const interestSaved = Math.max(0, oldInterest - newInterest);
            return (
              <div className="w-full space-y-2">
                <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                  <p className="text-xs text-muted-foreground">Saldo principal atual</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(oldPrincipal)}</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amort-amount" className="text-xs">Valor da amortização (R$)</Label>
                  <Input
                    id="amort-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={amortizeAmount}
                    onChange={(e) => setAmortizeAmount(e.target.value)}
                    placeholder="Ex: 500.00"
                    autoFocus
                  />
                </div>
                {v > oldPrincipal && (
                  <p className="text-[11px] text-destructive">O valor não pode ser maior que o principal.</p>
                )}
                {validV && (
                  <AmortizationResultCard
                    oldPrincipal={oldPrincipal}
                    newPrincipal={newPrincipal}
                    oldInterest={oldInterest}
                    newInterest={newInterest}
                    oldRemaining={oldRemaining}
                    newRemaining={newRemaining}
                    oldInstallment={oldInstallment}
                    newInstallment={newInstallment}
                    interestSaved={interestSaved}
                    amortizationValue={v}
                    remainingInstallments={remainingInst}
                    formatCurrency={rawFormatCurrency}
                  />
                )}
                <p className="text-[10px] text-muted-foreground">A amortização reduz o saldo devedor e recalcula os juros e parcelas futuras proporcionalmente.</p>
              </div>
            );
          })()}
          {paymentDialog?.type === "interest" && lateFees > 0 && (() => {
            const baseInterest = loan.customInterestValue != null && loan.customInterestValue > 0
              ? loan.customInterestValue
              : loan.amount * (loan.interestRate / 100);
            const totalWithFees = baseInterest + lateFees;
            return (
              <div className="w-full space-y-2.5">
                <p className="text-xs font-medium text-foreground">Como deseja receber?</p>
                <button
                  type="button"
                  onClick={() => setInterestSelection("normal")}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all",
                    interestSelection === "normal"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                      interestSelection === "normal" ? "border-primary" : "border-muted-foreground/40"
                    )}>
                      {interestSelection === "normal" && <div className="size-2 rounded-full bg-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">Apenas juros</span>
                        <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(baseInterest)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Recebe somente o juros do mês. Multa/atraso continuam pendentes.</p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setInterestSelection("withFees")}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all",
                    interestSelection === "withFees"
                      ? "border-warning bg-warning/5 ring-1 ring-warning"
                      : "border-border bg-card hover:border-warning/40"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                      interestSelection === "withFees" ? "border-warning" : "border-muted-foreground/40"
                    )}>
                      {interestSelection === "withFees" && <div className="size-2 rounded-full bg-warning" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">Juros + multa/atraso</span>
                        <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(totalWithFees)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Quita juros e regulariza encargos de atraso.</p>
                      <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Juros do mês</span>
                          <span className="text-foreground tabular-nums">{rawFormatCurrency(baseInterest)}</span>
                        </div>
                        {penaltyTotal > 0 && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Multa</span>
                            <span className="text-warning tabular-nums">{rawFormatCurrency(penaltyTotal)}</span>
                          </div>
                        )}
                        {lateInterestTotal > 0 && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Juros de atraso ({effectiveDaysLate}d)</span>
                            <span className="text-warning tabular-nums">{rawFormatCurrency(lateInterestTotal)}</span>
                          </div>
                        )}
                        {renegPenaltyPending > 0 && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Multa de renegociação</span>
                            <span className="text-warning tabular-nums">{rawFormatCurrency(renegPenaltyPending)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })()}
          {paymentDialog?.type === "interest" && (() => {
            const baseInterest = loan.customInterestValue != null && loan.customInterestValue > 0
              ? loan.customInterestValue
              : loan.amount * (loan.interestRate / 100);
            const cyclePartialPayments = allPayments
              .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
                && (p as any).metadata?.kind === "interest_partial"
                && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate));
            const cyclePartials = cyclePartialPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
            const priorCycleFees = cyclePartialPayments.reduce(
              (m, p) => Math.max(m, Number((p as any).metadata?.cycle_fees_total || 0)),
              0,
            );
            const includeFeesNow = interestSelection === "withFees" && lateFees > 0;
            const cycleFees = Math.max(priorCycleFees, includeFeesNow ? lateFees : 0);
            const cycleTarget = Math.round((baseInterest + cycleFees) * 100) / 100;
            const pending = Math.max(0, Math.round((cycleTarget - cyclePartials) * 100) / 100);
            const partialRaw = parseFloat(interestPartialAmount.replace(",", "."));
            const partialVal = interestPartialEnabled && isFinite(partialRaw) && partialRaw > 0 ? partialRaw : 0;
            const exceeds = interestPartialEnabled && partialVal > pending && pending > 0;
            const willClose = !interestPartialEnabled || (partialVal + 0.005 >= pending);
            // Próxima data após quitação total: avança 1 ciclo a partir da âncora original
            const rawAnchor = loan.originalDueDate || loan.dueDate;
            const anchorRef = rawAnchor > loan.dueDate ? loan.dueDate : rawAnchor;
            const freq = loan.interestType || "Mensal";
            const advance = (d: Date) => {
              if (freq === "Diário") d.setDate(d.getDate() + 1);
              else if (freq === "Semanal") d.setDate(d.getDate() + 7);
              else if (freq === "Quinzenal") d.setDate(d.getDate() + 15);
              else {
                const anchorDay = Number(anchorRef.split("-")[2]);
                d.setMonth(d.getMonth() + 1);
                if (Number.isFinite(anchorDay)) {
                  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                  d.setDate(Math.min(anchorDay, lastDay));
                }
              }
            };
            const nextD = new Date(anchorRef + "T00:00:00");
            advance(nextD);
            // Alinha com addInterestOnlyPayment: avança a âncora até superar o
            // vencimento ATUAL do contrato (não a data do pagamento). Assim,
            // pagar juros adiantado (ex.: 16/06 p/ venc. 01/07) projeta 01/08.
            const boundStr = loan.dueDate;
            let g = 0;
            while (formatYmdInAppTz(nextD) <= boundStr && g < 600) { advance(nextD); g++; }
            const nextDateStr = nextD.toLocaleDateString("pt-BR");
            const dueStr = new Date(loan.dueDate + "T00:00:00").toLocaleDateString("pt-BR");
            const today = todayInAppTz();
            const isLate = loan.dueDate < today;
            const daysLate = isLate ? Math.floor((new Date(today + "T00:00:00").getTime() - new Date(loan.dueDate + "T00:00:00").getTime()) / 86400000) : 0;
            return (
              <div className="w-full space-y-2.5">
                {isLate && (
                  <Alert variant="destructive" className="py-2.5">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-xs font-semibold">Pagamento atrasado</AlertTitle>
                    <AlertDescription className="text-[11px]">
                      Vencimento em {dueStr} — {daysLate} {daysLate === 1 ? "dia" : "dias"} de atraso. Confirme antes de prosseguir.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Juros base</span><span className="tabular-nums">{rawFormatCurrency(baseInterest)}</span></div>
                  {cycleFees > 0 && (
                    <>
                      {penaltyTotal > 0 && includeFeesNow && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Multa por atraso</span><span className="tabular-nums text-warning">{rawFormatCurrency(penaltyTotal)}</span></div>
                      )}
                      {lateInterestTotal > 0 && includeFeesNow && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Juros de atraso ({effectiveDaysLate}d)</span><span className="tabular-nums text-warning">{rawFormatCurrency(lateInterestTotal)}</span></div>
                      )}
                      {renegPenaltyPending > 0 && includeFeesNow && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Multa de renegociação</span><span className="tabular-nums text-warning">{rawFormatCurrency(renegPenaltyPending)}</span></div>
                      )}
                      {!includeFeesNow && priorCycleFees > 0 && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Encargos do ciclo</span><span className="tabular-nums text-warning">{rawFormatCurrency(priorCycleFees)}</span></div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between border-t border-border/40 pt-1.5"><span className="text-muted-foreground">Total do ciclo</span><span className="font-semibold tabular-nums">{rawFormatCurrency(cycleTarget)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Já pago no ciclo</span><span className="tabular-nums text-success">{rawFormatCurrency(cyclePartials)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Saldo pendente</span><span className="font-semibold tabular-nums text-primary">{rawFormatCurrency(pending)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Vencimento atual</span><span className="tabular-nums">{dueStr}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Próximo após quitação</span><span className="tabular-nums">{nextDateStr}</span></div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" className="size-3.5 accent-primary" checked={interestPartialEnabled} onChange={(e) => { setInterestPartialEnabled(e.target.checked); if (!e.target.checked) setInterestPartialAmount(""); }} />
                  Receber valor parcial
                </label>
                {interestPartialEnabled && (
                  <div className="space-y-1">
                    <Label htmlFor="int-partial" className="text-xs">Valor recebido (R$)</Label>
                    <Input id="int-partial" type="number" step="0.01" min="0" inputMode="decimal" value={interestPartialAmount} onChange={(e) => setInterestPartialAmount(e.target.value)} placeholder={`Pendente: ${pending.toFixed(2)}`} />
                    {exceeds && <p className="text-[11px] text-warning">Valor excede o saldo pendente. O excedente será desconsiderado.</p>}
                    {!willClose && partialVal > 0 && <p className="text-[11px] text-muted-foreground">Vencimento permanece em {dueStr} até a quitação total do ciclo.</p>}
                    {willClose && partialVal > 0 && <p className="text-[11px] text-success">Quita o ciclo. Próximo vencimento: {nextDateStr}.</p>}
                  </div>
                )}
                <InterestResultCard
                  baseInterest={baseInterest}
                  penaltyTotal={penaltyTotal}
                  lateInterestTotal={lateInterestTotal}
                  renegPenaltyPending={renegPenaltyPending}
                  includeFeesNow={includeFeesNow}
                  pending={pending}
                  partialEnabled={interestPartialEnabled}
                  partialVal={partialVal}
                  willClose={willClose}
                  dueStr={dueStr}
                  nextDateStr={nextDateStr}
                  principalAmount={loan.amount}
                  formatCurrency={formatCurrency}
                />
                <div className="space-y-1">
                  <Label htmlFor="int-notes" className="text-xs">Observação (opcional)</Label>
                  <Textarea id="int-notes" value={interestNotes} onChange={(e) => setInterestNotes(e.target.value)} placeholder="Ex: pago via Pix" className="min-h-[60px] text-sm" />
                </div>
              </div>
            );
          })()}
          {paymentDialog?.type === "installment" && loan.installments >= 2 && (() => {
            const baseInstallment = installment;
            const totalWithFees = baseInstallment + lateFees;
            // (reference date is the selected payment date)
            const refDate = formatYmdInAppTz(paymentDate);
            const refStr = new Date(refDate + "T00:00:00").toLocaleDateString("pt-BR");
            return (
              <div className="w-full space-y-2.5">
                {lateFees > 0 ? (
                  <>
                    <p className="text-xs font-medium text-foreground">Como deseja receber esta parcela?</p>
                    <button
                      type="button"
                      onClick={() => setInterestSelection("normal")}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all",
                        interestSelection === "normal"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border bg-card hover:border-primary/40"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                          interestSelection === "normal" ? "border-primary" : "border-muted-foreground/40"
                        )}>
                          {interestSelection === "normal" && <div className="size-2 rounded-full bg-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline gap-2">
                            <span className="text-sm font-medium text-foreground">Apenas a parcela</span>
                            <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(baseInstallment)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Recebe somente o valor da parcela. Multa/atraso seguem pendentes.</p>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInterestSelection("withFees")}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all",
                        interestSelection === "withFees"
                          ? "border-warning bg-warning/5 ring-1 ring-warning"
                          : "border-border bg-card hover:border-warning/40"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                          interestSelection === "withFees" ? "border-warning" : "border-muted-foreground/40"
                        )}>
                          {interestSelection === "withFees" && <div className="size-2 rounded-full bg-warning" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline gap-2">
                            <span className="text-sm font-medium text-foreground">Parcela + juros/multa</span>
                            <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(totalWithFees)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Quita a parcela e regulariza encargos de atraso.</p>
                          <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">Valor da parcela</span>
                              <span className="text-foreground tabular-nums">{rawFormatCurrency(baseInstallment)}</span>
                            </div>
                            {penaltyTotal > 0 && (
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">Multa</span>
                                <span className="text-warning tabular-nums">{rawFormatCurrency(penaltyTotal)}</span>
                              </div>
                            )}
                            {lateInterestTotal > 0 && (
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">Juros de atraso ({effectiveDaysLate}d)</span>
                                <span className="text-warning tabular-nums">{rawFormatCurrency(lateInterestTotal)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-[11px] pt-1 border-t border-border/40">
                              <span className="text-muted-foreground">Total a receber</span>
                              <span className="font-semibold text-foreground tabular-nums">{rawFormatCurrency(totalWithFees)}</span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">Cálculo em</span>
                              <span className="tabular-nums">{refStr}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  </>
                ) : (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Valor da parcela</span><span className="font-semibold tabular-nums">{rawFormatCurrency(baseInstallment)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Referência</span><span className="tabular-nums">{refStr}</span></div>
                  </div>
                )}
              </div>
            );
          })()}
            </div>
            <div className="flex flex-col gap-4">
              {/* Pagamento Total — sumário detalhado renderizado na coluna esquerda */}
              {/* Quitar Contrato — composição/simulação renderizadas na coluna esquerda */}

              <div className="hidden md:block rounded-lg border border-border/60 bg-card/60 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Resumo do empréstimo</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                  <div>
                    <p className="text-muted-foreground">Total emprestado</p>
                    <p className="font-semibold text-foreground tabular-nums">{formatCurrency(loan.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Já recebido</p>
                    <p className="font-semibold text-success tabular-nums">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Parcelas pagas</p>
                    <p className="font-semibold text-foreground tabular-nums">{loan.paidInstallments} / {loan.installments}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Pendentes</p>
                    <p className="font-semibold text-foreground tabular-nums">{Math.max(0, loan.installments - loan.paidInstallments)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Próximo vencimento</p>
                    <p className="font-semibold text-foreground tabular-nums">{nextSchedule?.dueDate ? new Date(nextSchedule.dueDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Taxa de juros</p>
                    <p className="font-semibold text-foreground tabular-nums">{Number(loan.interestRate).toFixed(2)}% a.m.</p>
                  </div>
                </div>
            </div>
          </div>
        </div>

              {activeMethods.length > 0 && (() => {
                const baseInt = loan.customInterestValue != null && loan.customInterestValue > 0 ? loan.customInterestValue : loan.amount * (loan.interestRate / 100);
                const cRaw = parseFloat(payoffAmount.replace(",", "."));
                const aRaw = parseFloat(amortizeAmount.replace(",", "."));
                const dt = paymentDialog?.type;
                let totalForSplit = 0;
                if (dt === "full") totalForSplit = remaining;
                else if (dt === "payoff") totalForSplit = isFinite(cRaw) && cRaw > 0 ? cRaw : 0;
                else if (dt === "amortize") totalForSplit = isFinite(aRaw) && aRaw > 0 ? aRaw : 0;
                else if (dt === "installment") totalForSplit = installment + (interestSelection === "withFees" && lateFees > 0 && loan.installments >= 2 ? lateFees : 0);
                else if (dt === "interest") totalForSplit = interestSelection === "withFees" && lateFees > 0 ? baseInt + lateFees : baseInt;
                else if (dt === "partial") totalForSplit = paymentDialog?.amount ?? 0;
                const a1 = parseFloat(splitAmount1Input.replace(",", "."));
                const validA1 = isFinite(a1) && a1 > 0 && a1 < totalForSplit;
                const a2 = validA1 ? Math.round((totalForSplit - a1) * 100) / 100 : 0;
                return (
                  <div className="w-full space-y-1">
                    <Label className="text-sm text-muted-foreground">Forma de pagamento</Label>
                    <Select value={selectedMethodId} onValueChange={setSelectedMethodId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {activeMethods.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {totalForSplit > 0 && activeMethods.length >= 2 && (
                      <div className="pt-1.5 space-y-1.5">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                          <input type="checkbox" className="size-3.5 accent-primary" checked={splitEnabled} onChange={(e) => setSplitEnabled(e.target.checked)} />
                          Dividir em 2 meios de pagamento
                        </label>
                        {splitEnabled && (
                          <div className="rounded-md border border-border/60 bg-muted/30 p-2 space-y-1.5">
                            <div className="space-y-1">
                              <Label className="text-[11px]">Valor no meio 1 (R$)</Label>
                              <Input type="number" step="0.01" min="0" inputMode="decimal" value={splitAmount1Input} onChange={(e) => setSplitAmount1Input(e.target.value)} placeholder={`Total: ${rawFormatCurrency(totalForSplit)}`} className="h-8 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Meio 2</Label>
                              <Select value={splitMethod2Id} onValueChange={setSplitMethod2Id}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {activeMethods.filter((m) => m.id !== selectedMethodId).map((m) => (
                                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {validA1 && (
                              <div className="flex justify-between text-[11px] pt-1 border-t border-border/40">
                                <span className="text-muted-foreground">Restante meio 2</span>
                                <span className="font-semibold text-primary tabular-nums">{rawFormatCurrency(a2)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-col gap-2">
                <Label className="text-sm text-muted-foreground">Data do pagamento</Label>
                <NativeDatePicker
                  value={paymentDate ? format(paymentDate, "yyyy-MM-dd") : ""}
                  onChange={(v) => { if (v) setPaymentDate(new Date(`${v}T00:00:00`)); }}
                />
              </div>
        </div>


        <DialogFooter className="shrink-0 flex-row gap-2 border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 sm:pt-3 sm:border-0 sm:bg-transparent sm:backdrop-blur-0">
          <Button variant="outline" onClick={() => setPaymentDialog(null)} className="flex-1 sm:flex-none">Cancelar</Button>
          <Button size="lg" onClick={confirmPayment} disabled={(activeMethods.length > 0 && !selectedMethodId) || (paymentDialog?.type === "payoff" && !(parseFloat(payoffAmount.replace(",", ".")) > 0)) || (paymentDialog?.type === "amortize" && !(parseFloat(amortizeAmount.replace(",", ".")) > 0 && parseFloat(amortizeAmount.replace(",", ".")) <= (Number(loan.amount) || 0)))} className="flex-[2] sm:flex-none sm:h-11"><CheckCircle2 className="h-4 w-4" /> Confirmar pagamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AmortizationSimulator
      loan={loan}
      payments={allPayments}
      open={showSimulator}
      onOpenChange={setShowSimulator}
      onApply={onAmortize ? (amount, date) => onAmortize(amount, date, null) : undefined}
    />
    <Dialog open={showHistory} onOpenChange={setShowHistory}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Histórico de Pagamentos — {loan.borrowerName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto">
          {(() => {
            const loanPayments = allPayments.filter((p) => p.loanId === loan.id).sort((a, b) => b.date.localeCompare(a.date));
            if (loanPayments.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">Nenhum pagamento registrado</p>;
            return (
              <div className="space-y-2">
                {loanPayments.map((p) => (
                  <PaymentHistoryItem
                    key={p.id}
                    payment={p}
                    formatCurrency={formatCurrency}
                    onDelete={(id) => setDeletePaymentId(id)}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            );
          })()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowHistory(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir empréstimo</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o empréstimo de <strong>{loan.borrowerName}</strong>? Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!deletePaymentId} onOpenChange={() => setDeletePaymentId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir pagamento</AlertDialogTitle>
          <AlertDialogDescription>Tem certeza que deseja excluir este pagamento?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (deletePaymentId) { const r = captureScroll(); Promise.resolve(onDeletePayment(deletePaymentId)).finally(r); setDeletePaymentId(null); } }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {onRenegotiate && (
      <RenegotiateLoanDialog
        open={showRenegotiateDialog}
        onOpenChange={setShowRenegotiateDialog}
        loan={loan}
        payments={allPayments}
        installmentSchedules={installmentSchedules}
        history={renegotiations}
        onConfirm={async (params) => { await onRenegotiate(params); }}
      />
    )}
    <PaymentHubDialog
      open={paymentHubOpen}
      onOpenChange={setPaymentHubOpen}
      loan={loan}
      payments={allPayments}
      installmentSchedules={installmentSchedules}
      onPayment={onPayment}
      onPartialPayment={onPartialPayment}
      onFullPayment={onFullPayment}
      onInterestPayment={onInterestPayment}
      onAmortize={onAmortize}
    />
    </>
  );
}
