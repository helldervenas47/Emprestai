import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Loan, Payment, InstallmentSchedule, PaymentSplit } from "@/types/loan";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Percent, HandCoins, Wallet, CheckCircle2, TrendingDown, Receipt,
  X, AlertTriangle, Calendar as CalIcon, Loader2,
} from "lucide-react";
import { formatYmdInAppTz } from "@/lib/timezone";
import { focusWithoutScrollOnNextFrame } from "@/lib/focusWithoutScroll";
import { LoanPaymentSplitEditor, SplitState, buildSplitFromState } from "@/features/loans/components/LoanPaymentSplitEditor";
import { calculateTotalWithInterest, getOpenInstallmentAmountForLoan } from "@/features/loans/hooks/useLoans";
import { getTotalPaid, getFirstPendingDate } from "@/features/loans/components/list/calculations";
import { getLoanOutstandingBreakdown, buildLoanSummaryPresentation } from "@/features/loans/lib/loanOutstanding";
import { getCurrentCycleInterest } from "@/features/loans/lib/currentCycleInterest";
import { getLoanFinancialStateForUI } from "@/features/loans/lib/loanFinancialAdapter";
import { simulateLoanPayment, type LoanPaymentKind } from "@/features/loans/lib/simulateLoanPayment";
import { roundCurrency } from "@/lib/money";
import { advanceLoanDueDateAfter } from "@/features/loans/lib/advanceDueDate";

import { LoanSummaryComposition } from "@/features/loans/components/payment-hub/LoanSummaryComposition";

import { rawFormatCurrency } from "@/features/loans/components/list/formatting";
import { useHideValues } from "@/contexts/HideValuesContext";
import { captureScroll } from "@/features/loans/lib/preserveScroll";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePickerField } from "@/components/ui/date-picker-field";

const emptySplit = (): SplitState => ({ method1Id: null, method2Id: null, amount1: "", amount2: "", enabled: false });

export type HubModuleId = "interest" | "installment" | "partial" | "full" | "payoff" | "amortize";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  onPayment?: (date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void | Promise<void>;
  onPartialPayment: (amount: number, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void | Promise<void>;
  onFullPayment?: (date?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void | Promise<void>;
  onInterestPayment: (date?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void | Promise<void>;
  onAmortize?: (amount: number, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void | Promise<void>;
  initialModule?: HubModuleId;
}

const MODULES: { id: HubModuleId; title: string; shortTitle?: string; description: string; Icon: any; accent: string }[] = [
  { id: "interest",    title: "Juros",           description: "Pagar somente os juros.",              Icon: Percent,      accent: "purple" },
  { id: "installment", title: "Parcela",         description: "Pagar a próxima parcela.",             Icon: Receipt,      accent: "primary" },
  { id: "partial",     title: "Parcial",         description: "Pagamento parcial do contrato.",       Icon: HandCoins,    accent: "warning" },
  { id: "full",        title: "Total",           description: "Pagar o valor total em aberto.",       Icon: Wallet,       accent: "success" },
  { id: "payoff",      title: "Quitar Contrato", shortTitle: "Quitar", description: "Encerrar totalmente o contrato.",      Icon: CheckCircle2, accent: "primary" },
  { id: "amortize",    title: "Amortizar",       description: "Reduzir saldo devedor antecipadamente.", Icon: TrendingDown, accent: "primary" },
];

export function PaymentHubDialog({
  open, onOpenChange, loan, payments, installmentSchedules = [],
  onPayment, onPartialPayment, onFullPayment, onInterestPayment, onAmortize,
  initialModule,
}: Props) {
  const { mask } = useHideValues();
  const fmt = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const dialogStartRef = useRef<HTMLDivElement>(null);

  // -------- derived summary (mirrors LoanListRow logic) --------
  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = getTotalPaid(loan, payments);
  const contractualBalanceRemaining = loan.status === "paid" ? 0
    : loan.remainingAmount != null && loan.remainingAmount > 0
      ? loan.remainingAmount
      : Math.max(0, total - totalPaid);

  const firstPending = getFirstPendingDate(loan, installmentSchedules);
  const safeFormat = (s?: string | Date | null) => {
    if (!s) return null;
    const d = typeof s === "string" ? new Date(`${s}T00:00:00`) : s;
    return isNaN(d.getTime()) ? null : format(d, "dd/MM/yyyy");
  };
  const nextDueLabel = safeFormat(firstPending) ?? safeFormat(loan.dueDate) ?? "—";

  // late fees
  const daysOverdue = (() => {
    if (loan.status === "paid" || !firstPending) return 0;
    const due = firstPending instanceof Date ? firstPending : new Date(`${firstPending}T00:00:00`);
    if (isNaN(due.getTime())) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
  })();
  const lateInterestTotal = (() => {
    if (!loan.lateInterestValue || loan.lateInterestValue <= 0 || daysOverdue <= 0 || loan.status === "paid") return 0;
    return loan.lateInterestType === "fixed"
      ? loan.lateInterestValue * daysOverdue
      : contractualBalanceRemaining * (loan.lateInterestValue / 100) * daysOverdue;
  })();
  const penaltyTotal = loan.penaltyValue && loan.penaltyValue > 0 && loan.status !== "paid" ? loan.penaltyValue : 0;
  const lateFees = lateInterestTotal + penaltyTotal;

  const interestOnly = loan.customInterestValue != null && loan.customInterestValue > 0
    ? loan.customInterestValue
    : loan.amount * (loan.interestRate / 100);
  const interestCyclePartials = payments
    .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
      && (p as any).metadata?.kind === "interest_partial"
      && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const singleCyclePending = Math.max(0, Math.round((interestOnly - interestCyclePartials) * 100) / 100);

  // Juros do CICLO ATUAL: em contratos parcelados vem da parcela vigente
  // (cronograma oficial), nunca do juro total do contrato.
  const cycleInterest = useMemo(
    () => getCurrentCycleInterest({
      loan,
      payments,
      schedules: installmentSchedules,
      singleCycleInterest: singleCyclePending,
    }),
    [loan, payments, installmentSchedules, singleCyclePending],
  );
  // FONTE ÚNICA do estado financeiro do modal (mesma instância usada pela aba
  // Empréstimos). A feature flag é resolvida dentro do adaptador — com a flag
  // desligada os números são exatamente os legados.
  const financialState = useMemo(
    () => getLoanFinancialStateForUI({ loan, payments, installmentSchedules }),
    [loan, payments, installmentSchedules],
  );

  const interestPending = roundCurrency(
    Math.max(0, financialState.currentInstallmentInterest - financialState.currentInstallmentPaid)
      || cycleInterest.currentInterestPending,
  );

  // Composição do saldo em aberto derivada do estado financeiro (nunca recalculada no JSX).
  const breakdown = useMemo(() => {
    const interestRemaining = financialState.contractualInterestRemaining;
    return {
      originalPrincipal: financialState.originalPrincipal,
      principalPaid: financialState.principalPaid,
      principalRemaining: financialState.principalRemaining,
      contractualBalanceRemaining: financialState.contractualBalanceRemaining,
      contractualInterestRemaining: interestRemaining,
      currentInterestPending: interestPending,
      currentInterestIncluded: interestPending > 0 && interestPending <= interestRemaining + 0.01,
      lateInterest: financialState.lateInterestPending,
      penalty: financialState.penaltyPending,
      lateFees: roundCurrency(financialState.penaltyPending + financialState.lateInterestPending),
      payoffTotal: financialState.payoffAmount,
    };
  }, [financialState, interestPending]);
  const principalRemaining = breakdown.principalRemaining;
  // Composição de apresentação única (abas Total e Quitar Contrato).
  const cycleLabel = cycleInterest.installments > 1
    ? `Juros da parcela atual (${cycleInterest.currentInstallmentNumber}/${cycleInterest.installments})`
    : "Juros do ciclo atual";
  const fullPresentation = useMemo(
    () => buildLoanSummaryPresentation(breakdown, { totalLabel: "Total final", currentInterestLabel: cycleLabel }),
    [breakdown, cycleLabel],
  );
  const payoffPresentation = useMemo(
    () => buildLoanSummaryPresentation(breakdown, { totalLabel: "Saldo sugerido", currentInterestLabel: cycleLabel }),
    [breakdown, cycleLabel],
  );

  // Saldo total em aberto (contratual + encargos), sempre do estado financeiro.
  const remaining = financialState.payoffAmount;





  // Próximo vencimento após fechar o ciclo de juros, sempre a partir do
  // vencimento pendente atual.
  const nextCycleDueLabel = useMemo(() => {
    if (loan.status === "paid") return null;
    if (!loan.dueDate) return null;
    const nextDueDate = advanceLoanDueDateAfter(loan.dueDate, loan.interestType || "Mensal");
    return format(new Date(`${nextDueDate}T00:00:00`), "dd/MM/yyyy");
  }, [loan.status, loan.dueDate, loan.interestType]);


  // -------- state --------
  const [activeModule, setActiveModule] = useState<HubModuleId>(initialModule ?? "interest");
  const [splitState, setSplitState] = useState<SplitState>(emptySplit());
  const [date, setDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // per-module fields
  const [interestWithFees, setInterestWithFees] = useState(true);
  const [interestPartialEnabled, setInterestPartialEnabled] = useState(false);
  const [interestPartialAmount, setInterestPartialAmount] = useState("");
  const [installmentWithFees, setInstallmentWithFees] = useState(true);
  const [partialAmount, setPartialAmount] = useState("");
  const [payoffAmount, setPayoffAmount] = useState("");
  const [amortizeAmount, setAmortizeAmount] = useState("");

  // next installment info (parcelados) — considera pagamentos parciais já
  // recebidos na parcela atual, deixando evidente o saldo remanescente.
  const isInstallmentLoan = loan.installments >= 2;
  const nextInstallmentNumber = Math.min(loan.installments, loan.paidInstallments + 1);
  const nextInstallmentBreakdown = useMemo(() => {
    const fullValue = (() => {
      const sched = installmentSchedules.find(
        (s) => s.loanId === loan.id && s.installmentNumber === nextInstallmentNumber,
      );
      if (sched && sched.amount > 0) return sched.amount;
      if (loan.customInstallmentValue && loan.customInstallmentValue > 0) return loan.customInstallmentValue;
      return loan.installments > 0 ? total / loan.installments : 0;
    })();
    const remainingValue = getOpenInstallmentAmountForLoan(loan, installmentSchedules, nextInstallmentNumber);
    const partialPaid = roundCurrency(Math.max(0, fullValue - remainingValue));
    return {
      fullValue: roundCurrency(fullValue),
      remainingValue: roundCurrency(remainingValue),
      partialPaid,
    };
  }, [installmentSchedules, loan, nextInstallmentNumber, total]);
  const nextInstallmentValue = nextInstallmentBreakdown.remainingValue;

  // module total (used to validate split sum)
  const moduleTotal = useMemo(() => {
    const parseAmt = (s: string) => {
      const n = parseFloat(s.replace(",", "."));
      return isFinite(n) && n > 0 ? n : 0;
    };
    switch (activeModule) {
      case "interest": {
        const base = interestPartialEnabled && parseAmt(interestPartialAmount) > 0
          ? parseAmt(interestPartialAmount)
          : interestPending;
        return base + (interestWithFees ? lateFees : 0);
      }
      case "installment":
        return nextInstallmentValue + (installmentWithFees ? lateFees : 0);
      case "partial":
        return parseAmt(partialAmount);
      case "full":
        return remaining;
      case "payoff":
        return parseAmt(payoffAmount) || remaining;
      case "amortize":
        return parseAmt(amortizeAmount);
    }
  }, [activeModule, interestPartialEnabled, interestPartialAmount, interestPending, interestWithFees, lateFees, nextInstallmentValue, installmentWithFees, partialAmount, remaining, payoffAmount, amortizeAmount]);

  useEffect(() => {
    if (open) {
      const fallback: HubModuleId = isInstallmentLoan ? "installment" : "interest";
      setActiveModule(initialModule ?? fallback);
      setSplitState(emptySplit());
      setDate(new Date());
      setNotes("");
      setInterestWithFees(true);
      setInterestPartialEnabled(false);
      setInterestPartialAmount("");
      setInstallmentWithFees(true);
      setPartialAmount("");
      setPayoffAmount("");
      setAmortizeAmount("");
      setSubmitting(false);
    }
  }, [open, initialModule, isInstallmentLoan]);

  // Preservação de scroll no ciclo abrir/fechar é feita globalmente pelo
  // wrapper `withScrollPreserve` em src/components/ui/dialog.tsx.


  // Reset split when switching module (avoids stale totals mismatch)
  useEffect(() => { setSplitState(emptySplit()); }, [activeModule]);

  // hide modules that don't apply
  const availableModules = useMemo(() => MODULES.filter((m) => {
    if (loan.status === "paid" && m.id !== "payoff") return false;
    if (m.id === "full" && !onFullPayment) return false;
    if (m.id === "amortize" && !onAmortize) return false;
    if (m.id === "installment" && (!isInstallmentLoan || !onPayment)) return false;
    return true;
  }), [onAmortize, isInstallmentLoan, onPayment, onFullPayment, loan.status]);

  // ---------- confirm handler ----------
  const handleConfirm = async () => {
    if (submitting) return;
    const dateStr = formatYmdInAppTz(date);

    // Validate primary payment method
    if (!splitState.method1Id) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    const mid = splitState.method1Id;

    // Build split (validated against moduleTotal)
    const splitResult = buildSplitFromState(splitState, moduleTotal);
    if (!splitResult.ok) {
      toast.error(splitResult.error);
      return;
    }
    const split = splitResult.split;

    const restore = captureScroll();
    setSubmitting(true);
    try {
      if (activeModule === "interest") {
        const partialRaw = parseFloat(interestPartialAmount.replace(",", "."));
        const partialVal = interestPartialEnabled && isFinite(partialRaw) && partialRaw > 0 ? partialRaw : undefined;
        const feesVal = interestWithFees && lateFees > 0 ? lateFees : undefined;
        const opts = (interestPartialEnabled || notes.trim())
          ? { partial: interestPartialEnabled, notes: notes.trim() || null }
          : undefined;
        await onInterestPayment(dateStr, partialVal, feesVal, mid, split, opts);
      } else if (activeModule === "installment") {
        if (!onPayment) { toast.error("Pagamento de parcela indisponível"); setSubmitting(false); return; }
        if (installmentWithFees && lateFees > 0) {
          await onInterestPayment(dateStr, undefined, lateFees, mid, null, { partial: false, notes: "Juros/multa por atraso" });
        }
        await onPayment(dateStr, mid, split);
      } else if (activeModule === "partial") {
        const val = parseFloat(partialAmount.replace(",", "."));
        if (!isFinite(val) || val <= 0) { toast.error("Informe um valor válido"); setSubmitting(false); return; }
        const sim = simulateLoanPayment(financialState, { kind: "partial", amount: val });
        if (!sim.isValid) { toast.error(sim.validationErrors[0]); setSubmitting(false); return; }
        await onPartialPayment(val, dateStr, mid, split);
      } else if (activeModule === "full") {
        if (onFullPayment) await onFullPayment(dateStr, remaining, mid, split);
        else await onPartialPayment(remaining, dateStr, mid, split);
      } else if (activeModule === "payoff") {
        const val = parseFloat(payoffAmount.replace(",", "."));
        if (!isFinite(val) || val <= 0) { toast.error("Informe o valor de quitação"); setSubmitting(false); return; }
        if (onFullPayment) await onFullPayment(dateStr, val, mid, split);
        else await onPartialPayment(val, dateStr, mid, split);
      } else if (activeModule === "amortize") {
        const val = parseFloat(amortizeAmount.replace(",", "."));
        if (!isFinite(val) || val <= 0) { toast.error("Informe o valor da amortização"); setSubmitting(false); return; }
        if (!onAmortize) { toast.error("Amortização indisponível"); setSubmitting(false); return; }
        const sim = simulateLoanPayment(financialState, { kind: "amortize", amount: val });
        if (!sim.isValid) { toast.error(sim.validationErrors[0]); setSubmitting(false); return; }
        await onAmortize(val, dateStr, mid, split);
      }
      toast.success(activeModule === "amortize" ? "Amortização registrada" : "Pagamento registrado");
      onOpenChange(false);
    } catch (err: any) {
      console.error("[PaymentHub] confirm error", err);
      toast.error(`Falha: ${err?.message ?? "tente novamente"}`);
    } finally {
      setSubmitting(false);
      restore();
    }
  };

  // ---------- module previews (mesma função pura usada na persistência) ----------
  const simulationFor = useCallback(
    (kind: LoanPaymentKind, rawValue: string, includeLateFees?: boolean) =>
      simulateLoanPayment(financialState, {
        kind,
        amount: parseFloat(rawValue.replace(",", ".")) || 0,
        includeLateFees,
      }),
    [financialState],
  );

  const partialPreview = useMemo(() => {
    const sim = simulationFor("partial", partialAmount);
    return {
      val: sim.paymentAmount,
      toFees: roundCurrency(sim.allocatedPenalty + sim.allocatedLateInterest),
      toInterest: sim.allocatedInterest,
      toPrincipal: sim.allocatedPrincipal,
      newRemaining: sim.projectedTotalReceivable,
      errors: sim.validationErrors,
    };
  }, [simulationFor, partialAmount]);


  const amortizePreview = useMemo(() => {
    const sim = simulationFor("amortize", amortizeAmount);
    const val = sim.paymentAmount;
    const newBalance = roundCurrency(sim.projectedPrincipalRemaining + sim.projectedInterestRemaining);
    const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
    const perInst = contractualBalanceRemaining / remainingInstallments;
    const reducedInstallments = perInst > 0 ? Math.floor(val / perInst) : 0;
    const interestSavings = roundCurrency(val * (loan.interestRate / 100));
    return { val, newBalance, reducedInstallments, interestSavings, errors: sim.validationErrors };
  }, [simulationFor, amortizeAmount, contractualBalanceRemaining, loan.installments, loan.paidInstallments, loan.interestRate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusWithoutScrollOnNextFrame(dialogStartRef.current);
        }}
        style={{ padding: 0 }}
        className={cn(
          "flex flex-col overflow-hidden overflow-x-hidden p-0 gap-0",
          // Mobile: fullscreen
          "left-0 right-0 top-0 bottom-0 h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0",
          // Desktop: centered large modal
          "sm:left-[50%] sm:top-[50%] sm:right-auto sm:bottom-auto sm:h-auto sm:max-h-[92vh] sm:w-[95vw] sm:max-w-[1200px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl sm:border sm:shadow-2xl",
          // Open animation: slide-up on mobile, zoom-in on desktop
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-300 data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)]",
          "data-[state=open]:slide-in-from-bottom-10 sm:data-[state=open]:zoom-in-98 sm:data-[state=open]:slide-in-from-bottom-0",
          // Close animation: slide-down on mobile, zoom-out on desktop
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-200 data-[state=closed]:[animation-timing-function:cubic-bezier(0.4,0,1,1)]",
          "data-[state=closed]:slide-out-to-bottom-10 sm:data-[state=closed]:zoom-out-98 sm:data-[state=closed]:slide-out-to-bottom-0",
        )}
      >
        <div className="sr-only">
          <DialogTitle>Realizar pagamento do empréstimo</DialogTitle>
          <DialogDescription>
            Escolha o tipo de pagamento que deseja realizar neste contrato.
          </DialogDescription>
        </div>
        {/* Header */}
        <div
          ref={dialogStartRef}
          tabIndex={-1}
          className="shrink-0 border-b border-border/60 bg-card/80 backdrop-blur px-4 sm:px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 sm:pt-5 sm:pb-4 outline-none"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-full">
              <h2 className="text-base sm:text-xl font-semibold text-foreground">Realizar Pagamento</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Escolha o tipo de pagamento que deseja realizar neste contrato.
              </p>
            </div>
          </div>

          {/* Type cards */}
          <div className="mt-3 sm:mt-4">

            <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
              {availableModules.map((m) => {
                const selected = m.id === activeModule;
                const Icon = m.Icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveModule(m.id)}
                    className={cn(
                      "text-left rounded-xl border p-2 sm:p-3 transition-all duration-200",
                      "hover:shadow-md sm:hover:-translate-y-0.5 active:scale-[0.98]",
                      "aspect-square sm:aspect-auto flex flex-col items-center justify-center sm:block",
                      selected
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40"
                        : "border-border bg-card hover:border-primary/30",
                    )}
                  >
                    <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:gap-2.5">
                      <div className={cn(
                        "h-8 w-8 sm:h-9 sm:w-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                        selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}>
                        <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                      </div>
                      <div className="min-w-0 w-full text-center sm:text-left">
                        <p className={cn(
                          "text-[10.5px] leading-tight sm:text-sm font-semibold truncate",
                          selected ? "text-primary" : "text-foreground",
                        )}>
                          <span className="sm:hidden">{m.shortTitle ?? m.title}</span>
                          <span className="hidden sm:inline">{m.title}</span>
                        </p>
                        <p className="hidden sm:block text-[11px] text-muted-foreground truncate">{m.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Contract summary strip */}
        <div className="shrink-0 border-b border-border/40 bg-muted/30 px-4 sm:px-6 py-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-3 text-xs">
            <SummaryChip label="Cliente" value={loan.borrowerName} strong />
            <SummaryChip label="Status" value={<Badge variant="outline" className="text-[10px] h-4 px-1.5">{loan.status === "paid" ? "Pago" : "Ativo"}</Badge>} />
            <SummaryChip label="Emprestado" value={fmt(loan.amount)} />
            <SummaryChip label="Total pago" value={fmt(totalPaid)} success />
            <SummaryChip label="Saldo devedor" value={fmt(remaining)} accent />
            <SummaryChip label="Juros pendentes" value={fmt(interestPending)} />
            <SummaryChip label="Taxa de juros" value={`${loan.interestRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`} />
            {loan.installments >= 2 && (
              <SummaryChip label="Parcelas" value={`${loan.paidInstallments} / ${loan.installments}`} />
            )}
            <SummaryChip label="Vencimento" value={nextDueLabel} icon={CalIcon} />
          </div>
        </div>

        {/* Dynamic module content */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 sm:px-6 py-4">
          <div key={activeModule} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
            {activeModule === "interest" && (
              <ModuleGrid>
                <div className="space-y-3">
                  <FieldGroup label="Juros do período">
                    <StatRow label="Valor de juros" value={fmt(interestOnly)} />
                    {interestCyclePartials > 0 && (
                      <StatRow label="Já recebido no ciclo" value={fmt(interestCyclePartials)} muted />
                    )}
                    <StatRow label="Pendente" value={fmt(interestPending)} strong />
                    {!interestPartialEnabled && nextCycleDueLabel && (
                      <StatRow label="Próximo vencimento" value={nextCycleDueLabel} muted />
                    )}
                  </FieldGroup>

                  {lateFees > 0 && (
                    <FieldGroup label="Encargos de atraso">
                      {penaltyTotal > 0 && <StatRow label="Multa" value={fmt(penaltyTotal)} muted />}
                      {lateInterestTotal > 0 && <StatRow label="Juros de atraso" value={fmt(lateInterestTotal)} muted />}
                      <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={interestWithFees}
                          onChange={(e) => setInterestWithFees(e.target.checked)}
                        />
                        <span>Incluir encargos de atraso ({fmt(lateFees)})</span>
                      </label>
                    </FieldGroup>
                  )}

                  <FieldGroup label="Pagamento parcial de juros (opcional)">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={interestPartialEnabled}
                        onChange={(e) => { setInterestPartialEnabled(e.target.checked); if (!e.target.checked) setInterestPartialAmount(""); }}
                      />
                      <span>Receber apenas parte dos juros</span>
                    </label>
                    {interestPartialEnabled && (
                      <Input
                        type="number" step="0.01" min="0" inputMode="decimal"
                        value={interestPartialAmount}
                        onChange={(e) => setInterestPartialAmount(e.target.value)}
                        placeholder={`Pendente: ${interestPending.toFixed(2)}`}
                        className="h-9 text-sm mt-2"
                      />
                    )}
                  </FieldGroup>
                </div>

                <div className="space-y-3">
                  {renderCommonFields({ splitState, setSplitState, moduleTotal, date, setDate, notes, setNotes })}
                  <FieldGroup label="Total a receber">
                    <StatRow
                      label="Total"
                      value={fmt((interestPartialEnabled && parseFloat(interestPartialAmount.replace(",", ".")) > 0
                        ? parseFloat(interestPartialAmount.replace(",", "."))
                        : interestPending) + (interestWithFees ? lateFees : 0))}
                      strong
                    />
                  </FieldGroup>
                </div>
              </ModuleGrid>
            )}

            {activeModule === "installment" && (
              <ModuleGrid>
                <div className="space-y-3">
                  <FieldGroup label={`Parcela ${nextInstallmentNumber} de ${loan.installments}`}>
                    <StatRow label="Valor da parcela" value={fmt(nextInstallmentValue)} strong />
                    {nextInstallmentBreakdown.partialPaid > 0 && (
                      <p className="text-[10px] text-muted-foreground text-right mt-[-2px] mb-1">
                        original {fmt(nextInstallmentBreakdown.fullValue)} — pago {fmt(nextInstallmentBreakdown.partialPaid)}
                      </p>
                    )}
                    <StatRow label="Vencimento" value={nextDueLabel} muted />
                    <StatRow label="Parcelas pagas" value={`${loan.paidInstallments} / ${loan.installments}`} muted />
                  </FieldGroup>
                  {lateFees > 0 && (
                    <FieldGroup label="Encargos de atraso">
                      {penaltyTotal > 0 && <StatRow label="Multa" value={fmt(penaltyTotal)} muted />}
                      {lateInterestTotal > 0 && <StatRow label="Juros de atraso" value={fmt(lateInterestTotal)} muted />}
                      <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={installmentWithFees}
                          onChange={(e) => setInstallmentWithFees(e.target.checked)}
                        />
                        <span>Registrar encargos junto ({fmt(lateFees)})</span>
                      </label>
                    </FieldGroup>
                  )}
                </div>
                <div className="space-y-3">
                  {renderCommonFields({ splitState, setSplitState, moduleTotal, date, setDate, notes, setNotes })}
                  <FieldGroup label="Total a receber" accent>
                    <StatRow label="Parcela" value={fmt(nextInstallmentValue)} />
                    {installmentWithFees && lateFees > 0 && (
                      <StatRow label="Encargos" value={fmt(lateFees)} muted />
                    )}
                    <div className="border-t border-primary/20 pt-1.5 mt-1.5">
                      <StatRow label="Total" value={fmt(nextInstallmentValue + (installmentWithFees ? lateFees : 0))} strong />
                    </div>
                  </FieldGroup>
                </div>
              </ModuleGrid>
            )}

            {activeModule === "partial" && (
              <ModuleGrid>
                <div className="space-y-3">
                  <FieldGroup label="Valor recebido (R$)">
                    <Input
                      type="number" step="0.01" inputMode="decimal"
                      placeholder="Ex: 150,00"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      className="h-10 text-base"
                      autoFocus={false}
                    />
                  </FieldGroup>
                  {renderCommonFields({ splitState, setSplitState, moduleTotal, date, setDate, notes, setNotes })}
                </div>
                <div className="space-y-3">
                  <FieldGroup label="Prévia da operação" accent>
                    <StatRow label="Valor recebido" value={fmt(partialPreview.val)} strong />
                    {lateFees > 0 && <StatRow label="Abatimento em encargos" value={fmt(partialPreview.toFees)} muted />}
                    <StatRow label="Abatimento em juros" value={fmt(partialPreview.toInterest)} muted />
                    <StatRow label="Abatimento em principal" value={fmt(partialPreview.toPrincipal)} muted />
                    <div className="border-t border-primary/20 pt-1.5 mt-1.5">
                      <StatRow label="Saldo restante" value={fmt(partialPreview.newRemaining)} strong />
                    </div>
                  </FieldGroup>
                </div>
              </ModuleGrid>
            )}

            {activeModule === "full" && (
              <ModuleGrid>
                <div className="space-y-3">
                  <FieldGroup label="Resumo financeiro">
                    <LoanSummaryComposition presentation={fullPresentation} formatCurrency={fmt} />
                  </FieldGroup>
                </div>

                <div className="space-y-3">
                  {renderCommonFields({ splitState, setSplitState, moduleTotal, date, setDate, notes, setNotes })}
                </div>
              </ModuleGrid>
            )}

            {activeModule === "payoff" && (
              <ModuleGrid>
                <div className="space-y-3">
                  <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning-foreground">
                      Após confirmar, o contrato será encerrado automaticamente.
                    </p>
                  </div>
                  <FieldGroup label="Resumo do contrato">
                    <LoanSummaryComposition presentation={payoffPresentation} formatCurrency={fmt} />
                  </FieldGroup>

                </div>
                <div className="space-y-3">
                  <FieldGroup label="Valor final de quitação (R$)">
                    <Input
                      type="number" step="0.01" inputMode="decimal"
                      placeholder={remaining.toFixed(2)}
                      value={payoffAmount}
                      onChange={(e) => setPayoffAmount(e.target.value)}
                      className="h-10 text-base"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Deixe em branco para usar o sugerido — ou informe descontos/acréscimos aplicando um valor custom.
                    </p>
                  </FieldGroup>
                  {renderCommonFields({ splitState, setSplitState, moduleTotal, date, setDate, notes, setNotes })}
                </div>
              </ModuleGrid>
            )}

            {activeModule === "amortize" && (
              <ModuleGrid>
                <div className="space-y-3">
                  <FieldGroup label="Valor da amortização (R$)">
                    <Input
                      type="number" step="0.01" inputMode="decimal"
                      placeholder="Ex: 500,00"
                      value={amortizeAmount}
                      onChange={(e) => setAmortizeAmount(e.target.value)}
                      className="h-10 text-base"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Máximo: {fmt(principalRemaining)} (principal restante).
                    </p>
                    {amortizePreview.errors.length > 0 && (
                      <p className="text-[11px] text-destructive mt-1">{amortizePreview.errors[0]}</p>
                    )}
                  </FieldGroup>
                  {renderCommonFields({ splitState, setSplitState, moduleTotal, date, setDate, notes, setNotes })}
                </div>
                <div className="space-y-3">
                  <FieldGroup label="Comparativo antes × depois" accent>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md border border-border/60 bg-background/50 p-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Antes</p>
                        <p className="font-semibold text-foreground mt-0.5">{fmt(contractualBalanceRemaining)}</p>
                      </div>
                      <div className="rounded-md border border-primary/40 bg-primary/5 p-2">
                        <p className="text-[10px] uppercase text-primary">Depois</p>
                        <p className="font-semibold text-primary mt-0.5">{fmt(amortizePreview.newBalance)}</p>
                      </div>
                    </div>
                    <StatRow label="Parcelas reduzidas (est.)" value={String(amortizePreview.reducedInstallments)} muted />
                    <StatRow label="Economia de juros (est.)" value={fmt(amortizePreview.interestSavings)} muted />
                  </FieldGroup>
                </div>
              </ModuleGrid>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-border/60 bg-background/95 backdrop-blur px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2 items-center">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="hidden sm:inline-flex">
            Cancelar
          </Button>
          <div className="hidden sm:block flex-1" />
          {/* Cancelar ao lado do confirmar apenas no mobile */}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="sm:hidden flex-1 h-11">
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting} className="flex-1 sm:flex-none h-11 sm:h-10 sm:min-w-[220px] gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {getConfirmLabel(activeModule)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- helpers ----------

function getConfirmLabel(m: HubModuleId): string {
  switch (m) {
    case "interest":    return "Receber Juros";
    case "installment": return "Receber Parcela";
    case "partial":   return "Registrar Pagamento Parcial";
    case "full":      return "Receber Valor Total";
    case "payoff":    return "Quitar Contrato";
    case "amortize":  return "Aplicar Amortização";
  }
}

function renderCommonFields({ splitState, setSplitState, moduleTotal, date, setDate, notes, setNotes }: {
  splitState: SplitState; setSplitState: (s: SplitState) => void; moduleTotal: number;
  date: Date; setDate: (d: Date) => void;
  notes: string; setNotes: (v: string) => void;
}) {
  return (
    <>
      <div>
        <LoanPaymentSplitEditor
          total={moduleTotal}
          state={splitState}
          onChange={setSplitState}
          primaryLabel="Forma de pagamento"
        />
      </div>
      <div>
        <Label className="text-xs">Data do pagamento</Label>
        <DatePickerField
          value={format(date, "yyyy-MM-dd")}
          onChange={(v) => {
            if (v) {
              const d = new Date(`${v}T00:00:00`);
              if (!isNaN(d.getTime())) setDate(d);
            }
          }}
          className="h-9 text-sm mt-1"
        />
      </div>
      <div>
        <Label className="text-xs">Observações</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Opcional"
          className="min-h-[60px] text-sm mt-1"
        />
      </div>
    </>
  );
}

function ModuleGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>;
}

function FieldGroup({ label, children, accent }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn(
      "rounded-lg border p-3",
      accent ? "border-primary/30 bg-primary/5" : "border-border/60 bg-muted/20",
    )}>
      <p className={cn("text-[11px] font-semibold uppercase tracking-wide mb-2", accent ? "text-primary" : "text-muted-foreground")}>
        {label}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function StatRow({ label, value, strong, muted }: { label: string; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(
        "tabular-nums",
        strong ? "text-foreground font-semibold" : muted ? "text-foreground/80" : "text-foreground",
      )}>
        {value}
      </span>
    </div>
  );
}

function SummaryChip({ label, value, strong, mono, accent, success, icon: Icon }: {
  label: string; value: React.ReactNode; strong?: boolean; mono?: boolean; accent?: boolean; success?: boolean; icon?: any;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn(
        "text-xs mt-0.5 flex items-center gap-1 truncate",
        strong ? "font-semibold text-foreground" : accent ? "font-semibold text-primary" : success ? "font-semibold text-success" : "text-foreground",
        mono && "font-mono",
      )}>
        {Icon && <Icon className="h-3 w-3 text-muted-foreground shrink-0" />}
        <span className="truncate min-w-0">{value}</span>
      </span>
    </div>
  );
}
