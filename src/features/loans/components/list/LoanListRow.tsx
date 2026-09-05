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
import { Progress } from "@/components/ui/progress";
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

import { LateInterestDialog, PenaltyDialog } from "@/features/loans/components/LateFeeDialogs";
import { WhatsappBillButton } from "@/features/loans/components/list/WhatsappBillButton";
import { LoanListSummaryCards } from "@/features/loans/components/list/LoanListSummaryCards";
import { LoanCategoryChips, LoanSearchBar, LoanQuickDateFilters, LoanAdvancedFilters } from "@/features/loans/components/list/LoanListFilters";


interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  onPayment: (loanId: string, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onPartialPayment: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onFullPayment?: (loanId: string, paymentDate?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onInterestPayment: (loanId: string, paymentDate?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void;
  onAmortize?: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => Promise<void> | void;
  onRenegotiate?: (loanId: string, params: { type: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null; penaltyDistribution?: "diluted" | "first" | null; newInstallments?: number | null; notes?: string | null; selectedInstallmentNumbers?: number[] | null; firstDueDate?: string | null }) => Promise<void> | void;
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (loanId: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
  existingTags?: string[];
  initialCategory?: Category;
  initialView?: "cards" | "rows" | "folders";
  clients?: Client[];
  onOpenClientHistory?: () => void;
  onOpenSimulator?: () => void;
}

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
  getLoanTotalReceivable,
} from "@/features/loans/components/list/calculations";
import { PaymentHistoryItem } from "@/features/loans/components/list/PaymentHistoryItem";
import { confirmWithScroll } from "@/lib/confirmWithScroll";


function LoanRowView({
  loan, payments: allPayments, installmentSchedules = [], onPayment, onPartialPayment, onFullPayment, onInterestPayment, onAmortize, onRenegotiate, renegotiations = [], onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false, existingTags = [], clients = [], managerCommissionTotal = 0, defaultExpanded = false, hideCollapsedRow = false, hideQuickNotes = false,
}: {
  loan: Loan;
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
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
  onSaveSchedule?: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
  existingTags?: string[];
  clients?: Client[];
  managerCommissionTotal?: number;
  defaultExpanded?: boolean;
  hideCollapsedRow?: boolean;
  hideQuickNotes?: boolean;
}) {
  const [showAdjustDueDateRow, setShowAdjustDueDateRow] = useState(false);
  const [payMenuOpen, setPayMenuOpen] = useState(false);
  const [paymentHubOpen, setPaymentHubOpen] = useState(false);
  // Radix DropdownMenu already dismisses on outside interaction; a manual
  // document pointerdown listener was closing the menu on the opening tap
  // on touch devices, which also let the click bubble and scroll to top.
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  // Keep form in sync with loan prop when not editing (prevents stale notes/etc on refetch)
  React.useEffect(() => {
    if (!editing) setForm(loanToForm(loan));
  }, [loan, editing]);
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialDate, setPartialDate] = useState<Date>(new Date());
  const [paymentDialog, setPaymentDialog] = useState<{ type: "installment" | "interest" | "partial" | "full" | "payoff" | "amortize"; amount?: number } | null>(null);
  const [interestSelection, setInterestSelection] = useState<"normal" | "withFees">("normal");
  const [interestPartialEnabled, setInterestPartialEnabled] = useState(false);
  const [interestPartialAmount, setInterestPartialAmount] = useState("");
  const [interestNotes, setInterestNotes] = useState("");
  const [payoffAmount, setPayoffAmount] = useState("");
  const [amortizeAmount, setAmortizeAmount] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);
  const [editHasManager, setEditHasManager] = useState<boolean>(loan.hasManager ?? false);
  const [editIsSale, setEditIsSale] = useState<boolean>(loan.isSale ?? false);
  const [editManagerId, setEditManagerId] = useState<string>(loan.managerId ?? "");
  const [editCommissionRate, setEditCommissionRate] = useState<string>(String(loan.managerCommissionRate ?? 10));
  const [showLateInterest, setShowLateInterest] = useState(false);
  const [lateInterestType, setLateInterestType] = useState<string>(loan.lateInterestType || "percentage");
  const [lateInterestValue, setLateInterestValue] = useState<string>(loan.lateInterestValue != null ? String(loan.lateInterestValue) : "");
  const [showPenalty, setShowPenalty] = useState(false);
  const [penaltyValue, setPenaltyValue] = useState<string>(loan.penaltyValue != null ? String(loan.penaltyValue) : "");
  const [showRenegotiateDialog, setShowRenegotiateDialog] = useState(false);
  const [showRowDetails, setShowRowDetails] = useState(false);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickNoteDraft, setQuickNoteDraft] = useState(loan.notes || "");
  React.useEffect(() => {
    if (!quickNoteOpen) setQuickNoteDraft(loan.notes || "");
  }, [loan, quickNoteOpen]);
  const [showRowAccountModal, setShowRowAccountModal] = useState(false);
  const managerOptions = useMemo(() => clients.filter((c) => c.isManager && c.active !== false), [clients]);
  const { activeMethods: rowActiveMethods } = usePaymentMethods();
  const { celebrate } = usePaymentCelebration();
  const [rowSelectedMethodId, setRowSelectedMethodId] = useState<string>("");
  const [rowSplitEnabled, setRowSplitEnabled] = useState(false);
  const [rowSplitMethod2Id, setRowSplitMethod2Id] = useState<string>("");
  const [rowSplitAmount1Input, setRowSplitAmount1Input] = useState<string>("");
  React.useEffect(() => {
    if (!paymentDialog) setRowSelectedMethodId("");
  }, [paymentDialog]);
  React.useEffect(() => {
    if (!showPartial) setRowSelectedMethodId("");
  }, [showPartial]);
  React.useEffect(() => {
    if (!paymentDialog) {
      setRowSplitEnabled(false);
      setRowSplitMethod2Id("");
      setRowSplitAmount1Input("");
    }
  }, [paymentDialog]);

  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = getTotalPaid(loan, allPayments);
  const unpaidSchedules = installmentSchedules
    .filter((s) => s.loanId === loan.id && s.installmentNumber > loan.paidInstallments)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const allUnpaidScheduleSum = unpaidSchedules.reduce((sum, s) => sum + s.amount, 0);
  // Source of truth: loan.remainingAmount (same value shown in the create/edit form).
  // Fallback to total - totalPaid only when the saved field is missing.
  const baseRemaining = loan.status === "paid"
    ? 0
    : loan.remainingAmount != null && loan.remainingAmount > 0
      ? loan.remainingAmount
      : Math.max(0, total - totalPaid);

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
  const penaltyTotal = (loan.penaltyValue != null && loan.penaltyValue > 0 && loan.status !== "paid") ? loan.penaltyValue : 0;
  const renegPenaltyPending = (loan.installments < 2 && loan.status !== "paid")
    ? Number(loan.renegotiationPenaltyTotal || 0)
    : 0;
  const lateFees = lateInterestTotal + penaltyTotal + renegPenaltyPending;
  const interestPaymentsReceived = allPayments
    .filter((p) => p.loanId === loan.id && p.installmentNumber === 0)
    .reduce((sum, p) => sum + p.amount, 0);
  const remaining = baseRemaining + lateFees;
  const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
  const nextSchedule = unpaidSchedules[0];
  const fullInstallmentValue = nextSchedule
    ? nextSchedule.amount
    : loan.customInstallmentValue != null && loan.customInstallmentValue > 0
      ? loan.customInstallmentValue
      : (loan.installments >= 2 ? total / loan.installments : baseRemaining);
  const actualRemainingRow = loan.status === "paid"
    ? 0
    : loan.remainingAmount != null && loan.remainingAmount > 0
      ? loan.remainingAmount
      : Math.max(0, total - totalPaid);
  const expectedRemainingRow = nextSchedule
    ? allUnpaidScheduleSum
    : fullInstallmentValue * remainingInstallments;
  const partialPaidOnCurrentRow = Math.max(0, expectedRemainingRow - actualRemainingRow);
  const installmentValue = Math.max(0, fullInstallmentValue - partialPaidOnCurrentRow);
  const interestOnlyRow = loan.customInterestValue != null && loan.customInterestValue > 0
    ? loan.customInterestValue
    : loan.amount * (loan.interestRate / 100);
  const interestCyclePartialPaymentsRow = allPayments
    .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
      && (p as any).metadata?.kind === "interest_partial"
      && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const interestCyclePartialsRow = interestCyclePartialPaymentsRow.reduce((s, p) => s + Number(p.amount || 0), 0);
  const lastCyclePartialRow = interestCyclePartialPaymentsRow[interestCyclePartialPaymentsRow.length - 1];
  const lastCyclePendingAfterRow = lastCyclePartialRow ? Number((lastCyclePartialRow as any).metadata?.cycle_pending_after) : NaN;
  const interestPendingRow = Number.isFinite(lastCyclePendingAfterRow)
    ? Math.max(0, Math.round(lastCyclePendingAfterRow * 100) / 100)
    : Math.max(0, Math.round((interestOnlyRow - interestCyclePartialsRow) * 100) / 100);
  const isParcelado = (loan.paymentType === "Parcelado" || loan.installments >= 2) && loan.status !== "paid" && loan.paidInstallments < loan.installments;
  const category = getLoanCategory(loan, allPayments, installmentSchedules);
  const badge = statusMap[category];

  const startEdit = () => {
    setForm(loanToForm(loan));
    setEditHasManager(loan.hasManager ?? false);
    setEditManagerId(loan.managerId ?? "");
    setEditCommissionRate(String(loan.managerCommissionRate ?? 10));
    setEditing(true);
    setExpanded(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    const parsedTags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const manualInterest = parseFloat(form.interestValue) || 0;
    const calcInterest = (parseFloat(form.amount) || 0) * ((parseFloat(form.interestRate) || 0) / 100);
    const hasCustomInterest = manualInterest > 0 && Math.abs(manualInterest - calcInterest) > 0.01;
    if (editHasManager && !editManagerId) {
      toast.error("Selecione um gerente para o empréstimo com gerente.");
      return;
    }
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
    const matchedClient = clients.find(
      (c) => normalizeClientKey(c.name) === normalizeClientKey(form.borrowerName)
    );
    onUpdate({
      borrowerName: form.borrowerName,
      borrowerId: matchedClient ? matchedClient.id : undefined,
      amount: parseFloat(form.amount) || loan.amount,
      interestRate: form.interestRate.trim() === "" || isNaN(parseFloat(form.interestRate)) ? loan.interestRate : Math.max(0, parseFloat(form.interestRate)),
      installments: parseInt(form.installments) || loan.installments,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate || loan.startDate,
      dueDate: form.dueDate || loan.dueDate,
      interestType: form.interestType,
      notes: form.notes,
      tags: parsedTags,
      remainingAmount: parseFloat(form.remainingAmount) || 0,
      customInterestValue: hasCustomInterest ? manualInterest : null,
      hasManager: editHasManager,
      managerId: editHasManager && editManagerId ? editManagerId : null,
      managerCommissionRate: editHasManager ? parseFloat(editCommissionRate) || 10 : null,
      isSale: editIsSale,
    });
    setEditing(false);
  };

  const saveQuickNote = () => {
    const trimmed = quickNoteDraft.trim();
    if (trimmed !== (loan.notes || "")) {
      onUpdate({ notes: trimmed || null });
      toast.success("Observação salva");
    }
    setQuickNoteOpen(false);
  };
  const cancelQuickNote = () => {
    setQuickNoteDraft(loan.notes || "");
    setQuickNoteOpen(false);
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
    if (rowActiveMethods.length > 0 && !rowSelectedMethodId) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    const dateStr = formatYmdInAppTz(paymentDate);
    const dialogType = paymentDialog.type;
    const dialogAmount = paymentDialog.amount;
    const mid = rowSelectedMethodId || null;

    const baseInterestForSplit = loan.customInterestValue != null && loan.customInterestValue > 0
      ? loan.customInterestValue
      : loan.amount * (loan.interestRate / 100);
    const customRawForSplit = parseFloat(payoffAmount.replace(",", "."));
    const amortRawForSplit = parseFloat(amortizeAmount.replace(",", "."));
    let expectedTotal = 0;
    if (dialogType === "full") expectedTotal = remaining;
    else if (dialogType === "payoff") expectedTotal = isFinite(customRawForSplit) && customRawForSplit > 0 ? customRawForSplit : 0;
    else if (dialogType === "amortize") expectedTotal = isFinite(amortRawForSplit) && amortRawForSplit > 0 ? amortRawForSplit : 0;
    else if (dialogType === "installment") expectedTotal = installmentValue + (interestSelection === "withFees" && lateFees > 0 && loan.installments >= 2 ? lateFees : 0);
    else if (dialogType === "interest") {
      expectedTotal = interestSelection === "withFees" && lateFees > 0
        ? baseInterestForSplit + lateFees
        : baseInterestForSplit;
    } else if (dialogType === "partial" && dialogAmount) expectedTotal = dialogAmount;

    let split: PaymentSplit | null = null;
    if (rowSplitEnabled && expectedTotal > 0) {
      if (!rowSplitMethod2Id || rowSplitMethod2Id === rowSelectedMethodId) {
        toast.error("Selecione um segundo meio de pagamento diferente");
        return;
      }
      const a1 = parseFloat(rowSplitAmount1Input.replace(",", "."));
      if (!isFinite(a1) || a1 <= 0 || a1 >= expectedTotal) {
        toast.error("Informe o valor do primeiro meio (entre 0 e o total)");
        return;
      }
      const a2 = Math.round((expectedTotal - a1) * 100) / 100;
      split = {
        parts: [
          { paymentMethodId: mid, amount: Math.round(a1 * 100) / 100 },
          { paymentMethodId: rowSplitMethod2Id, amount: a2 },
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
          await onInterestPayment(dateStr, undefined, lateFees, mid, null, { partial: false, notes: "Parcela paga com juros/multa de atraso" });
        }
        await onPayment(dateStr, mid, split);
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
      if (rowActiveMethods.length > 0 && !rowSelectedMethodId) {
        toast.error("Selecione a forma de pagamento");
        return;
      }
      const dateStr = formatYmdInAppTz(partialDate);
      const mid = rowSelectedMethodId || null;
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
        // Manual installment value — don't auto-recalculate
      }
      return next;
    });
  };

  const accentBorderClass =
    category === "overdue" ? "border-l-destructive" :
    category === "due_today" ? "border-l-warning" :
    category === "paid" ? "border-l-success" :
    category === "paid_interest" ? "border-l-purple" :
    "border-l-primary";

  return (
    <>
    <tr className={`${hideCollapsedRow ? "hidden" : ""} border-b border-border/40 dark:border-white/[0.04] hover:bg-muted/40 dark:hover:bg-white/[0.03] transition-colors group cursor-pointer ${expanded ? "bg-muted/30 dark:bg-white/[0.03]" : ""}`} onClick={() => setExpanded(!expanded)}>
      {/* Cliente */}
      <td className={`relative px-1.5 sm:px-4 py-2 sm:py-3 border-l-[3px] ${accentBorderClass}`}>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className={`h-6 w-6 sm:h-8 sm:w-8 rounded-full flex items-center justify-center text-primary-foreground font-bold text-[9px] sm:text-xs shrink-0 ${
            category === "overdue" ? "bg-destructive" :
            category === "due_today" ? "bg-warning text-warning-foreground" :
            category === "paid" ? "bg-success" :
            category === "paid_interest" ? "bg-purple" :
            "bg-primary"
          }`}>
            {loan.borrowerName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-medium text-[11px] sm:text-sm text-foreground truncate block max-w-[80px] sm:max-w-none">{loan.borrowerName}</span>
              {loan.isSale && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 gap-0.5">
                  <ShoppingBag className="h-2.5 w-2.5" />Venda
                </Badge>
              )}
              {!readOnly && !hideQuickNotes && (
                <Popover open={quickNoteOpen} onOpenChange={setQuickNoteOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-muted text-muted-foreground border border-border/50 shrink-0 hover:text-primary hover:bg-primary/10 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuickNoteDraft(loan.notes || "");
                      }}
                      aria-label={loan.notes?.trim() ? "Editar observação" : "Adicionar observação"}
                    >
                      {loan.notes?.trim() ? (
                        <MessageCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      ) : (
                        <Pencil className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 sm:w-72 p-3" onClick={(e) => e.stopPropagation()} align="start">
                    <p className="text-xs font-medium text-foreground mb-1.5">Observação rápida</p>
                    <Textarea
                      value={quickNoteDraft}
                      onChange={(e) => setQuickNoteDraft(e.target.value)}
                      placeholder="Digite uma observação..."
                      rows={3}
                      className="text-xs resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          saveQuickNote();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelQuickNote();
                        }
                      }}
                    />
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={cancelQuickNote}>
                        <X className="h-3 w-3 mr-1" /> Cancelar
                      </Button>
                      <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={saveQuickNote}>
                        <Check className="h-3 w-3 mr-1" /> Salvar
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {renegotiations.length > 0 && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center justify-center h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-amber-500/20 text-amber-700 dark:bg-amber-400/25 dark:text-amber-300 border border-amber-500/40 shrink-0 cursor-help"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Renegociado ${renegotiations.length}x`}
                      >
                        <RefreshCw className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Renegociado {renegotiations.length}x
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {loan.hasManager && (
                <Badge variant="outline" className="bg-[#009C3B]/15 text-[#009C3B] dark:bg-emerald-500/25 dark:text-emerald-300 border-[#009C3B]/60 dark:border-emerald-500/60 text-[9px] sm:text-[10px] px-1 py-0 gap-0.5 shrink-0" title="Com gerente">
                  <UserCog className="h-3 w-3" /><span className="hidden sm:inline">Gerente</span>
                </Badge>
              )}
            </div>
            {loan.tags && loan.tags.length > 0 && (
              <div className="flex flex-wrap gap-0.5 mt-0.5 sm:hidden">
                {loan.tags.map((tag) => (
                  <Badge key={tag} className="bg-primary text-primary-foreground text-[8px] px-1 py-0">{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>
      {/* Status - hidden on mobile and tablet */}
      <td className="hidden lg:table-cell px-1.5 sm:px-4 py-2 sm:py-3">
        <Badge variant="outline" className={`${badge.className} text-[9px] sm:text-xs px-1.5 sm:px-2.5`}>{badge.label}</Badge>
      </td>
      {/* Emprestado - hidden on mobile */}
      <td className="hidden sm:table-cell px-2 lg:px-4 py-3">
        <span className="text-xs lg:text-sm font-medium text-foreground whitespace-nowrap">
          {formatCurrency(loan.status === "paid" ? totalPaid : loan.amount)}
        </span>
      </td>
      {/* Restante / Parcela / Total Pago */}
      <td className="px-1.5 sm:px-2 lg:px-4 py-2 sm:py-3">
        {loan.status === "paid" ? (
          <span className="text-[11px] sm:text-xs lg:text-sm font-medium text-success whitespace-nowrap">{formatCurrency(totalPaid)}</span>
        ) : isParcelado ? (
          <div className="flex flex-col">
            <span className={`text-[11px] sm:text-xs lg:text-sm font-semibold whitespace-nowrap ${category === "overdue" ? "text-destructive" : category === "due_today" ? "text-warning" : "text-foreground"}`}>{formatCurrency(installmentValue + lateFees)}</span>
          </div>
        ) : (
          <div className="flex flex-col">
            <span className={`text-[11px] sm:text-xs lg:text-sm font-semibold whitespace-nowrap ${category === "overdue" ? "text-destructive" : category === "due_today" ? "text-warning" : "text-foreground"}`}>{formatCurrency(remaining)}</span>
          </div>
        )}
      </td>
      {/* Parcelas - hidden on mobile */}
      <td className="hidden sm:table-cell px-2 lg:px-4 py-3">
        <div className="flex items-center gap-1 lg:gap-1.5">
          <CheckCircle className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-primary shrink-0" />
          <span className="text-xs lg:text-sm font-medium">{loan.paidInstallments}/{loan.installments}</span>
        </div>
        {daysOverdue > 0 && loan.status !== "paid" && (
          <div className="flex items-center gap-1 mt-0.5 whitespace-nowrap">
            <span className="h-2 w-2 rounded-full bg-destructive inline-block shrink-0"></span>
            <span className="text-[10px] text-destructive">{daysOverdue}d em atraso</span>
          </div>
        )}
      </td>
      {/* Vencimento */}
      <td className="px-1.5 sm:px-2 lg:px-4 py-2 sm:py-3 whitespace-nowrap">
        <span className={`text-[11px] sm:text-xs lg:text-sm font-medium tabular-nums ${category === "overdue" ? "text-destructive" : category === "due_today" ? "text-warning" : "text-foreground"}`}>
          {getFirstPendingDate(loan, installmentSchedules).toLocaleDateString("pt-BR")}
        </span>
      </td>
      {/* Etiquetas - hidden on mobile */}
      <td className="hidden sm:table-cell px-2 lg:px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {loan.tags && loan.tags.length > 0 ? loan.tags.map((tag) => (
            <Badge key={tag} className="bg-primary text-primary-foreground text-[10px]">{tag}</Badge>
          )) : <span className="text-xs text-muted-foreground">—</span>}
        </div>
      </td>
      {/* Chevron - somente desktop */}
      <td className="hidden lg:table-cell px-4 py-3 text-right">
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground inline" /> : <ChevronRight className="h-4 w-4 text-muted-foreground inline" />}
      </td>
    </tr>
    {expanded && (
      <tr className="border-b border-border/30 bg-muted/10">
        <td colSpan={8} className="px-3 sm:px-6 py-4" onClick={(e) => e.stopPropagation()}>
          {editing ? (
            <div className="space-y-3">
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
              {/* Manager edit block */}
              <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`row-edit-mgr-${loan.id}`}
                    checked={editHasManager}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEditHasManager(checked);
                      updateField("interestRate", checked ? "20" : "30");
                    }}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <Label htmlFor={`row-edit-mgr-${loan.id}`} className="text-xs font-medium cursor-pointer">
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
                    id={`row-edit-sale-${loan.id}`}
                    checked={editIsSale}
                    onChange={(e) => setEditIsSale(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <Label htmlFor={`row-edit-sale-${loan.id}`} className="text-xs font-medium cursor-pointer">
                    Contrato de venda
                  </Label>
                </div>
              </div>
              <div className="rounded-lg border border-border/50 p-3 bg-muted/20">
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
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAdjustDueDateRow(true)}>
                    Ajustar vencimento
                  </Button>
                </div>
              </div>
              <div><Label className="text-xs">Etiquetas (separar por vírgula)</Label><Input value={form.tags} onChange={(e) => updateField("tags", e.target.value)} className="h-8 text-sm" placeholder="Ex: VIP, Renovação, Garantia" /></div>
              <div><Label className="text-xs">Observações</Label><Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={2} className="text-sm" /></div>
            </div>
          ) : (
          <div className="space-y-3.5">
            {/* 1. Composição Matemática do Saldo (Extrato Resumido) */}
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Composição do Saldo
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
                {/* Emprestado */}
                <div className="bg-card/90 dark:bg-white/[0.03] rounded-xl p-2.5 sm:p-3 border border-border/50 text-left flex flex-col justify-between">
                  <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase">
                    Emprestado
                  </span>
                  <p className="text-sm sm:text-base font-bold text-foreground tabular-nums mt-1">
                    {formatCurrency(loan.amount)}
                  </p>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    Valor original
                  </span>
                </div>

                {/* + Encargos / Juros */}
                <div className="bg-card/90 dark:bg-white/[0.03] rounded-xl p-2.5 sm:p-3 border border-border/50 text-left flex flex-col justify-between">
                  <span className="text-[10px] sm:text-[11px] font-medium text-amber-600 dark:text-amber-400 uppercase">
                    + Encargos & Juros
                  </span>
                  <p className="text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-1">
                    + {formatCurrency(Math.max(0, (total - loan.amount)) + lateFees)}
                  </p>
                  <span className="text-[10px] text-muted-foreground mt-0.5 truncate" title={`Juros: ${rawFormatCurrency(total - loan.amount)}${lateFees > 0 ? ` • Mora/Multa: ${rawFormatCurrency(lateFees)}` : ""}`}>
                    Juros {rawFormatCurrency(total - loan.amount)}{lateFees > 0 ? ` • Multa ${rawFormatCurrency(lateFees)}` : ""}
                  </span>
                </div>

                {/* - Total Pago */}
                <div className="bg-card/90 dark:bg-white/[0.03] rounded-xl p-2.5 sm:p-3 border border-border/50 text-left flex flex-col justify-between">
                  <span className="text-[10px] sm:text-[11px] font-medium text-success uppercase">
                    - Total Pago
                  </span>
                  <p className="text-sm sm:text-base font-bold text-success tabular-nums mt-1">
                    - {formatCurrency(totalPaid)}
                  </p>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    {allPayments.filter(p => p.loanId === loan.id).length} pagamento(s)
                  </span>
                </div>

                {/* = Saldo Restante */}
                <div className={`rounded-xl p-2.5 sm:p-3 border text-left flex flex-col justify-between ${
                  category === "overdue"
                    ? "bg-destructive/10 border-destructive/30"
                    : category === "due_today"
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-primary/10 border-primary/30"
                }`}>
                  <span className={`text-[10px] sm:text-[11px] font-bold uppercase ${
                    category === "overdue" ? "text-destructive" : category === "due_today" ? "text-amber-600 dark:text-amber-400" : "text-primary"
                  }`}>
                    = Saldo Restante
                  </span>
                  <p className={`text-base sm:text-lg font-extrabold tabular-nums mt-1 ${
                    category === "overdue" ? "text-destructive" : category === "due_today" ? "text-amber-600 dark:text-amber-400" : "text-primary"
                  }`}>
                    {formatCurrency(remaining)}
                  </p>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    {loan.status === "paid" ? "Quitado" : isParcelado ? `Próx: ${formatCurrency(installmentValue + lateFees)}` : "Saldo a receber"}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Detalhes Contratuais e Marcos */}
            <div className="bg-muted/30 dark:bg-white/[0.02] rounded-xl p-3 border border-border/40 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground">Início: <strong className="text-foreground">{new Date(loan.startDate + "T00:00:00").toLocaleDateString("pt-BR")}</strong></span>
                  <span className="text-border">•</span>
                  <span className="text-muted-foreground">Vencimento: <strong className="text-foreground">{getFirstPendingDate(loan, installmentSchedules).toLocaleDateString("pt-BR")}</strong></span>
                  <span className="text-border">•</span>
                  <span className="text-muted-foreground">Taxa: <strong className="text-foreground">{loan.interestRate}% ({loan.interestType})</strong></span>
                  <span className="text-border">•</span>
                  <span className="text-muted-foreground">Parcelas: <strong className="text-foreground">{loan.paidInstallments}/{loan.installments}</strong></span>
                </div>

                {(() => {
                  const rate = Number(loan.managerCommissionRate ?? 0);
                  const hasManagerCommission = Boolean(loan.hasManager || loan.managerId);
                  const commissionValue = hasManagerCommission && rate > 0
                    ? (Number(loan.amount) * rate) / 100
                    : 0;
                  if (commissionValue <= 0) return null;
                  return (
                    <Badge variant="outline" className="bg-[#009C3B]/15 text-[#009C3B] dark:bg-emerald-500/25 dark:text-emerald-300 border-[#009C3B]/60 text-[10px] gap-1">
                      <UserCog className="h-3 w-3" /> Gerente: {formatCurrency(commissionValue)} ({rate}%)
                    </Badge>
                  );
                })()}
              </div>

              {daysOverdue > 0 && loan.status !== "paid" && (
                <div className="flex items-center gap-1.5 text-destructive text-xs font-medium pt-1 border-t border-destructive/20">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{daysOverdue} dia{daysOverdue > 1 ? "s" : ""} em atraso</span>
                  {lateInterestTotal > 0 && <span>• Juros mora: {formatCurrency(lateInterestTotal)}</span>}
                  {penaltyTotal > 0 && <span>• Multa: {formatCurrency(penaltyTotal)}</span>}
                </div>
              )}

              {renegPenaltyPending > 0 && loan.status !== "paid" && (
                <div className="flex items-center gap-1.5 text-warning text-xs font-medium pt-1 border-t border-warning/20">
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                  <span>Multa de renegociação pendente: {formatCurrency(renegPenaltyPending)}</span>
                </div>
              )}

              {loan.tags && loan.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <span className="text-[10px] text-muted-foreground mr-1">Etiquetas:</span>
                  {loan.tags.map((tag) => (
                    <Badge key={tag} className="bg-primary/15 text-primary border-primary/30 text-[10px] px-2 py-0.5">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Barra de Ações Integrada */}
            <div className="flex flex-col gap-2 pt-1">
              {!readOnly && loan.status !== "paid" && (
                <Button
                  type="button"
                  data-mutation
                  variant="default"
                  className="w-full h-11 text-sm font-semibold gap-2 rounded-xl shadow-sm"
                  onClick={(e) => { e.stopPropagation(); setPaymentHubOpen(true); }}
                >
                  <DollarSign className="h-4 w-4" /> Registrar Pagamento ({formatCurrency(remaining)})
                </Button>
              )}

              {!readOnly && loan.status === "paid" && (
                <Button variant="outline" className="w-full h-10 text-sm gap-2 rounded-xl" onClick={(e) => { e.stopPropagation(); onUpdate({ status: "active", paidInstallments: 0 }); }}>
                  <X className="w-4 h-4" /> Marcar como não pago
                </Button>
              )}

              {/* Toolbar horizontal de ações rápidas + Menu de opções */}
              <div className="flex items-center gap-1.5 flex-wrap w-full" onClick={(e) => e.stopPropagation()}>
                {loan.status !== "paid" && (
                  <WhatsappBillButton
                    loan={loan}
                    clients={clients}
                    payments={allPayments}
                    installmentSchedules={installmentSchedules}
                    variant="compact"
                  />
                )}

                {onRenegotiate && loan.status !== "paid" && !readOnly && (
                  <Button
                    data-mutation
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[100px] h-9 text-xs gap-1.5 rounded-xl border-border/60 hover:border-amber-500/50 hover:text-amber-600"
                    onClick={(e) => { e.stopPropagation(); setShowRenegotiateDialog(true); }}
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-amber-500" /> Renegociar
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 min-w-[90px] h-9 text-xs gap-1.5 rounded-xl border-border/60 hover:border-primary/50"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await generateLoanReportPdf({
                        loan,
                        payments: allPayments,
                        installmentSchedules,
                        renegotiations,
                      });
                      toast.success("Relatório gerado");
                    } catch (err: any) {
                      toast.error(err?.message || "Falha ao gerar relatório");
                    }
                  }}
                >
                  <FileDown className="h-3.5 w-3.5 text-primary" /> PDF
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 min-w-[90px] h-9 text-xs gap-1.5 rounded-xl border-border/60"
                  onClick={(e) => { e.stopPropagation(); setShowHistory(true); }}
                >
                  <History className="h-3.5 w-3.5 text-muted-foreground" /> Histórico
                </Button>

                {/* Dropdown Menu de Ações Secundárias */}
                {!readOnly && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 text-xs gap-1 rounded-xl border-border/60"
                        title="Mais opções"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="hidden sm:inline">Opções</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 p-1.5 space-y-0.5">
                      {loan.status !== "paid" && (
                        <>
                          <DropdownMenuItem onClick={() => setShowLateInterest((v) => !v)} className="text-xs cursor-pointer gap-2 py-2">
                            <Percent className="h-3.5 w-3.5 text-amber-500" />
                            Adicionar Juros por Atraso
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setShowPenalty((v) => !v)} className="text-xs cursor-pointer gap-2 py-2">
                            <DollarSign className="h-3.5 w-3.5 text-destructive" />
                            Adicionar Multa Fixa
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onUpdate({ autoBillingEnabled: !(loan.autoBillingEnabled ?? true) })} className="text-xs cursor-pointer gap-2 py-2">
                            {(loan.autoBillingEnabled ?? true) ? <BellOff className="h-3.5 w-3.5 text-muted-foreground" /> : <BellRing className="h-3.5 w-3.5 text-primary" />}
                            {(loan.autoBillingEnabled ?? true) ? "Desativar cobrança auto" : "Ativar cobrança auto"}
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem onClick={startEdit} className="text-xs cursor-pointer gap-2 py-2">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        Editar Contrato
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-xs text-destructive focus:text-destructive cursor-pointer gap-2 py-2">
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir Contrato
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

            </div>

            {/* Diálogos de Juros e Multa */}
            <LateInterestDialog
              open={showLateInterest}
              onOpenChange={setShowLateInterest}
              loan={loan}
              baseRemaining={baseRemaining}
              daysOverdue={daysOverdue}
              onSave={(type, val) => {
                onUpdate({
                  lateInterestType: type,
                  lateInterestValue: val,
                });
                toast.success(val ? "Juros por atraso atualizados" : "Juros por atraso removidos");
              }}
              formatCurrency={formatCurrency}
            />

            <PenaltyDialog
              open={showPenalty}
              onOpenChange={setShowPenalty}
              loan={loan}
              baseRemaining={baseRemaining}
              onSave={(val) => {
                onUpdate({
                  penaltyValue: val,
                });
                toast.success(val ? "Multa atualizada" : "Multa removida");
              }}
              formatCurrency={formatCurrency}
            />
            <PartialPaymentDialog
              open={showPartial}
              onOpenChange={(open) => { if (!open) { setShowPartial(false); setPartialAmount(""); setPartialDate(new Date()); } }}
              loan={loan}
              amount={partialAmount}
              onAmountChange={setPartialAmount}
              date={partialDate}
              onDateChange={setPartialDate}
              methods={rowActiveMethods}
              selectedMethodId={rowSelectedMethodId}
              onSelectedMethodChange={setRowSelectedMethodId}
              onConfirm={handlePartialSubmit}
              formatCurrency={formatCurrency}
              totalContract={total}
              totalPaid={totalPaid}
              baseRemaining={baseRemaining}
              remainingWithFees={remaining}
              paidInstallments={loan.paidInstallments}
              totalInstallments={loan.installments}
              nextDueDateLabel={loan.status === "paid" || loan.paidInstallments >= loan.installments ? null : getFirstPendingDate(loan, installmentSchedules).toLocaleDateString("pt-BR")}
              interestRate={loan.interestRate}
              interestPendingCycle={interestPendingRow}
              lateInterestTotal={lateInterestTotal}
              penaltyTotal={penaltyTotal}
              daysOverdue={daysOverdue}
            />

            {/* Mais Detalhes - Installment Schedule (mesmo conteúdo da view por Cards) */}
            {(() => {
              const progress = loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0;
              const totalInterest = total - loan.amount;
              return (
                <>
                  <button type="button"
                    onClick={() => setShowRowDetails(!showRowDetails)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline w-full justify-center py-1"
                  >
                    {showRowDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {showRowDetails ? "Ocultar detalhes" : "Mais detalhes"}
                  </button>

                  {showRowDetails && (
                    <div className="space-y-2 bg-muted/30 rounded-lg p-2 sm:p-3 border border-border/50">
                      <p className="text-xs font-semibold text-foreground mb-1">Cronograma de Parcelas</p>
                      <div className="max-h-64 sm:max-h-80 overflow-y-auto -mx-1 px-1">
                        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-2 gap-y-1 text-[11px] sm:text-xs items-center">
                          <span className="font-medium text-muted-foreground">#</span>
                          <span className="font-medium text-muted-foreground">Venc.</span>
                          <span className="font-medium text-muted-foreground">Valor</span>
                          <span className="font-medium text-muted-foreground text-right">Status</span>
                          {Array.from({ length: loan.installments }, (_, idx) => {
                            const i = idx + 1;
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
                            const instAmount = savedSchedule?.amount ?? installmentValue;
                            const isPaid = i <= loan.paidInstallments;
                            const todayNorm = new Date();
                            const todayStr = `${todayNorm.getFullYear()}-${String(todayNorm.getMonth() + 1).padStart(2, "0")}-${String(todayNorm.getDate()).padStart(2, "0")}`;
                            const instIso = instDate.toISOString().split("T")[0];
                            const isOverdue = !isPaid && instIso < todayStr;
                            const isDueToday = !isPaid && instIso === todayStr;
                            return (
                              <React.Fragment key={i}>
                                <span className="text-muted-foreground tabular-nums">{i}</span>
                                <span className="text-foreground tabular-nums truncate">{instDateStr}</span>
                                <span className="text-foreground font-medium tabular-nums truncate">{formatCurrency(instAmount)}</span>
                                <span className="justify-self-end">
                                  {isPaid ? (
                                    <Badge className="bg-success/20 text-success border-success/30 text-[9px] px-1.5 py-0 h-4">Pago</Badge>
                                  ) : isOverdue ? (
                                    <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px] px-1.5 py-0 h-4">Atraso</Badge>
                                  ) : isDueToday ? (
                                    <Badge className="bg-warning/20 text-warning border-warning/30 text-[9px] px-1.5 py-0 h-4">Hoje</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">Pend.</Badge>
                                  )}
                                </span>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-2 mt-1 border-t border-border/30 text-[11px] sm:text-xs">
                        <div className="min-w-0">
                          <p className="text-muted-foreground truncate">Valor da Parcela</p>
                          <p className="font-semibold text-foreground tabular-nums truncate">{formatCurrency(installmentValue)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-muted-foreground truncate">Juros / Parcela</p>
                          <p className="font-semibold text-foreground tabular-nums truncate">{formatCurrency(installmentValue - (loan.amount / Math.max(1, loan.installments)))}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-muted-foreground truncate">Total de Juros</p>
                          <p className="font-semibold text-foreground tabular-nums truncate">{formatCurrency(totalInterest)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-muted-foreground truncate">Já Recebido</p>
                          <p className="font-semibold text-success tabular-nums truncate">{formatCurrency(totalPaid)}</p>
                        </div>
                      </div>

                      <div className="pt-2">
                        <div className="flex justify-between text-[11px] sm:text-xs mb-1">
                          <span className="text-muted-foreground">{loan.paidInstallments}/{loan.installments} parcelas</span>
                          <span className="font-medium text-foreground tabular-nums">{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                    </div>
                  )}

                  {showRowDetails && (() => {
                    const fmt = (iso?: string | null) => {
                      if (!iso) return "—";
                      const [y, m, d] = iso.split("-");
                      return `${d}/${m}/${y}`;
                    };
                    const currentDueIso = loan.dueDate;
                    const rawOriginal = loan.originalDueDate || loan.dueDate;
                    const originalDueIso = rawOriginal > currentDueIso ? currentDueIso : rawOriginal;
                    const wasRenegotiated = !!loan.originalDueDate && loan.originalDueDate !== loan.dueDate && loan.originalDueDate <= loan.dueDate;
                    const freq = loan.interestType || "Mensal";
                    const nextDue = (() => {
                      const today = new Date().toISOString().split("T")[0];
                      const advance = (d: Date) => {
                        if (freq === "Semanal") d.setDate(d.getDate() + 7);
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
                                : `Cálculo: próximo ciclo de ${freq === "Semanal" ? "7" : "15"} dias a partir da âncora, após hoje.`}
                            </p>
                          </div>
                          <div className="col-span-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full h-8 text-xs gap-1.5"
                              onClick={() => setShowRowAccountModal(true)}
                            >
                              📒 Ver conta passo a passo
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <Dialog open={showRowAccountModal} onOpenChange={setShowRowAccountModal}>
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
                          if (freq === "Semanal") d.setDate(d.getDate() + 7);
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
                        <Button variant="outline" onClick={() => setShowRowAccountModal(false)}>Fechar</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              );
            })()}
          </div>
          )}
        </td>
      </tr>
    )}
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
              <div className="rounded-lg border border-border/60 bg-card/60 p-3 space-y-2">
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

              {paymentDialog?.type === "payoff" && (
                <div className="w-full space-y-2">
                  {(() => {
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
                  <div className="space-y-1">
                    <Label htmlFor="payoff-amount-row" className="text-xs">Valor da quitação (R$)</Label>
                    <Input
                      id="payoff-amount-row"
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
                  <Label htmlFor="amort-amount-row" className="text-xs">Valor da amortização (R$)</Label>
                  <Input
                    id="amort-amount-row"
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
            const rawAnchor = loan.originalDueDate || loan.dueDate;
            const anchorRef = rawAnchor > loan.dueDate ? loan.dueDate : rawAnchor;
            const freq = loan.interestType || "Mensal";
            const advance = (d: Date) => {
              if (freq === "Semanal") d.setDate(d.getDate() + 7);
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
                {/* Flags movidas para a coluna da direita para PC/Tablet */}
                <div className="md:hidden space-y-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                    <input type="checkbox" className="size-3.5 accent-primary" checked={interestPartialEnabled} onChange={(e) => { setInterestPartialEnabled(e.target.checked); if (!e.target.checked) setInterestPartialAmount(""); }} />
                    Receber valor parcial
                  </label>
                  {interestPartialEnabled && (
                    <div className="space-y-1">
                      <Label htmlFor="int-partial-row-mobile" className="text-xs">Valor recebido (R$)</Label>
                      <Input id="int-partial-row-mobile" type="number" step="0.01" min="0" inputMode="decimal" value={interestPartialAmount} onChange={(e) => setInterestPartialAmount(e.target.value)} placeholder={`Pendente: ${pending.toFixed(2)}`} />
                      {exceeds && <p className="text-[11px] text-warning">Valor excede o saldo pendente. O excedente será desconsiderado.</p>}
                      {!willClose && partialVal > 0 && <p className="text-[11px] text-muted-foreground">Vencimento permanece em {dueStr} até a quitação total do ciclo.</p>}
                      {willClose && partialVal > 0 && <p className="text-[11px] text-success">Quita o ciclo. Próximo vencimento: {nextDateStr}.</p>}
                    </div>
                  )}
                </div>
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
                  <Label htmlFor="int-notes-row" className="text-xs">Observação (opcional)</Label>
                  <Textarea id="int-notes-row" value={interestNotes} onChange={(e) => setInterestNotes(e.target.value)} placeholder="Ex: pago via Pix" className="min-h-[60px] text-sm" />
                </div>
              </div>
            );
          })()}
          {paymentDialog?.type === "installment" && loan.installments >= 2 && (() => {
            const baseInstallment = installmentValue;
            const totalWithFees = baseInstallment + lateFees;
            const refStr = new Date(formatYmdInAppTz(paymentDate) + "T00:00:00").toLocaleDateString("pt-BR");
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
              {/* Quitar Contrato — composição/simulação renderizadas na coluna esquerda */}
              {paymentDialog?.type === "installment" && (
                <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                  <p className="text-xs text-muted-foreground">Valor da parcela atual</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(installmentValue)}</p>
                </div>
              )}
              {paymentDialog?.type === "partial" && (
                <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                  <p className="text-xs text-muted-foreground">Valor sugerido</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(paymentDialog.amount || 0)}</p>
                </div>
              )}
              {paymentDialog?.type === "amortize" && (
                <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                  <p className="text-xs text-muted-foreground">Saldo principal</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(loan.amount)}</p>
                </div>
              )}
              {paymentDialog?.type === "interest" && (() => {
                const baseInterest = loan.customInterestValue != null && loan.customInterestValue > 0
                  ? loan.customInterestValue
                  : loan.amount * (loan.interestRate / 100);
                return (
                  <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                    <p className="text-xs text-muted-foreground">Juros do período</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(baseInterest)}</p>
                  </div>
                );
              })()}

              {rowActiveMethods.length > 0 && (() => {
                const baseInt = loan.customInterestValue != null && loan.customInterestValue > 0 ? loan.customInterestValue : loan.amount * (loan.interestRate / 100);
                const cRaw = parseFloat(payoffAmount.replace(",", "."));
                const aRaw = parseFloat(amortizeAmount.replace(",", "."));
                const dt = paymentDialog?.type;
                let totalForSplit = 0;
                if (dt === "full") totalForSplit = remaining;
                else if (dt === "payoff") totalForSplit = isFinite(cRaw) && cRaw > 0 ? cRaw : 0;
                else if (dt === "amortize") totalForSplit = isFinite(aRaw) && aRaw > 0 ? aRaw : 0;
                else if (dt === "installment") totalForSplit = installmentValue + (interestSelection === "withFees" && lateFees > 0 && loan.installments >= 2 ? lateFees : 0);
                else if (dt === "interest") totalForSplit = interestSelection === "withFees" && lateFees > 0 ? baseInt + lateFees : baseInt;
                else if (dt === "partial") totalForSplit = paymentDialog?.amount ?? 0;
                const a1 = parseFloat(rowSplitAmount1Input.replace(",", "."));
                const validA1 = isFinite(a1) && a1 > 0 && a1 < totalForSplit;
                const a2 = validA1 ? Math.round((totalForSplit - a1) * 100) / 100 : 0;
                return (
                  <div className="w-full space-y-3">
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">Forma de pagamento</Label>
                      <Select value={rowSelectedMethodId} onValueChange={setRowSelectedMethodId}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {rowActiveMethods.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {totalForSplit > 0 && rowActiveMethods.length >= 2 && (
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                          <input type="checkbox" className="size-3.5 accent-primary" checked={rowSplitEnabled} onChange={(e) => setRowSplitEnabled(e.target.checked)} />
                          Dividir em 2 meios de pagamento
                        </label>
                        
                        {paymentDialog?.type === "interest" && (
                          <div className="space-y-3">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                              <input type="checkbox" className="size-3.5 accent-primary" checked={interestPartialEnabled} onChange={(e) => { setInterestPartialEnabled(e.target.checked); if (!e.target.checked) setInterestPartialAmount(""); }} />
                              Receber valor parcial
                            </label>
                            {interestPartialEnabled && (
                              <div className="space-y-1 pl-5">
                                <Label htmlFor="int-partial-row" className="text-xs">Valor recebido (R$)</Label>
                                <Input id="int-partial-row" type="number" step="0.01" min="0" inputMode="decimal" value={interestPartialAmount} onChange={(e) => setInterestPartialAmount(e.target.value)} placeholder="0.00" className="h-8 text-sm" />
                              </div>
                            )}
                          </div>
                        )}

                        {rowSplitEnabled && (
                          <div className="rounded-md border border-border/60 bg-muted/30 p-2 space-y-1.5">
                            <div className="space-y-1">
                              <Label className="text-[11px]">Valor no meio 1 (R$)</Label>
                              <Input type="number" step="0.01" min="0" inputMode="decimal" value={rowSplitAmount1Input} onChange={(e) => setRowSplitAmount1Input(e.target.value)} placeholder={`Total: ${rawFormatCurrency(totalForSplit)}`} className="h-8 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Meio 2</Label>
                              <Select value={rowSplitMethod2Id} onValueChange={setRowSplitMethod2Id}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {rowActiveMethods.filter((m) => m.id !== rowSelectedMethodId).map((m) => (
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
                    
                    {totalForSplit > 0 && rowActiveMethods.length < 2 && paymentDialog?.type === "interest" && (
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                          <input type="checkbox" className="size-3.5 accent-primary" checked={interestPartialEnabled} onChange={(e) => { setInterestPartialEnabled(e.target.checked); if (!e.target.checked) setInterestPartialAmount(""); }} />
                          Receber valor parcial
                        </label>
                        {interestPartialEnabled && (
                          <div className="space-y-1 pl-5">
                            <Label htmlFor="int-partial-row" className="text-xs">Valor recebido (R$)</Label>
                            <Input id="int-partial-row" type="number" step="0.01" min="0" inputMode="decimal" value={interestPartialAmount} onChange={(e) => setInterestPartialAmount(e.target.value)} placeholder="0.00" className="h-8 text-sm" />
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
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row gap-2 border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 sm:pt-3 sm:border-0 sm:bg-transparent sm:backdrop-blur-0">
          <Button variant="outline" onClick={() => setPaymentDialog(null)} className="flex-1 sm:flex-none">Cancelar</Button>
          <Button size="lg" onClick={confirmPayment} disabled={(rowActiveMethods.length > 0 && !rowSelectedMethodId) || (paymentDialog?.type === "payoff" && !(parseFloat(payoffAmount.replace(",", ".")) > 0)) || (paymentDialog?.type === "amortize" && !(parseFloat(amortizeAmount.replace(",", ".")) > 0 && parseFloat(amortizeAmount.replace(",", ".")) <= (Number(loan.amount) || 0)))} className="flex-[2] sm:flex-none sm:h-11"><CheckCircle2 className="h-4 w-4" /> Confirmar pagamento</Button>
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
    {onSaveSchedule && (
      <AdjustDueDateDialog
        open={showAdjustDueDateRow}
        onOpenChange={setShowAdjustDueDateRow}
        loan={loan}
        installmentSchedules={installmentSchedules}
        onSaveSchedule={onSaveSchedule}
        onUpdate={onUpdate}
      />
    )}
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

export { LoanRowView };
