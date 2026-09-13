import React, { useState } from "react";
import { Loan, Payment, InstallmentSchedule, Client } from "@/types/loan";
import { FormModalOverlay } from "@/components/ui/form-modal-overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { NativeDatePicker } from "@/components/ui/native-date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { normalizeClientKey } from "@/features/loans/lib/clientRiskUtils";
import { advanceLoanDueDate } from "@/features/loans/lib/advanceDueDate";
import { format } from "date-fns";
import {
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Calendar as CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AdjustDueDateDialog } from "@/components/AdjustDueDateDialog";
import { EditForm } from "@/features/loans/components/list/types";

interface ScheduleRow {
  date: Date;
  value: string;
}

interface Props {
  loan: Loan;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedLoan: Partial<Loan>) => void | Promise<void>;
  onSaveSchedule?: (loanId: string, schedules: Array<{ installmentNumber: number; dueDate: string; amount: number }>) => void | Promise<void>;
  allPayments?: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  managerOptions?: Array<{ id: string; name: string }>;
  existingTags?: string[];
  clients?: Client[];
  onAdjustDueDateSuccess?: () => void;
}

function getNextDate(baseDate: Date, frequency: string, step: number): Date {
  const d = new Date(baseDate.getTime());
  const freq = (frequency || "").toLowerCase();
  if (freq === "diário" || freq === "diario") {
    d.setDate(d.getDate() + step);
  } else if (freq === "semanal") {
    d.setDate(d.getDate() + step * 7);
  } else if (freq === "quinzenal") {
    d.setDate(d.getDate() + step * 15);
  } else {
    d.setMonth(d.getMonth() + step);
  }
  return d;
}

function getFirstPendingDate(loan: Loan, installmentSchedules: InstallmentSchedule[]): Date {
  const schedules = installmentSchedules
    .filter((s) => s.loanId === loan.id && !s.paid)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  if (schedules.length > 0 && schedules[0].dueDate) {
    const raw = schedules[0].dueDate;
    return new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  }
  const raw = loan.dueDate;
  return raw ? new Date(raw.length === 10 ? `${raw}T00:00:00` : raw) : new Date();
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

export function LoanEditModal({
  loan,
  isOpen,
  onClose,
  onUpdate,
  onSaveSchedule,
  allPayments = [],
  installmentSchedules = [],
  managerOptions = [],
  existingTags = [],
  clients = [],
  onAdjustDueDateSuccess,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [showAdjustDueDate, setShowAdjustDueDate] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  // Inicialização do formulário
  const [form, setForm] = useState<EditForm>(() => {
    const totalInst = loan.installments;
    const paidInst = loan.paidInstallments || 0;
    const rem = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : loan.amount;
    const remInst = Math.max(1, totalInst - paidInst);
    const instVal = (rem / remInst).toFixed(2);
    const interestVal = loan.customInterestValue != null && loan.customInterestValue > 0
      ? String(loan.customInterestValue)
      : ((loan.amount * (loan.interestRate / 100))).toFixed(2);

    return {
      borrowerName: loan.borrowerName,
      amount: String(loan.amount),
      interestRate: String(loan.interestRate),
      interestValue: interestVal,
      installmentValue: instVal,
      installments: String(loan.installments),
      paidInstallments: String(loan.paidInstallments || 0),
      remainingAmount: String(loan.remainingAmount ?? loan.amount),
      startDate: loan.startDate ? (loan.startDate.length === 10 ? `${loan.startDate}T00:00:00` : loan.startDate) : "",
      dueDate: loan.dueDate ? (loan.dueDate.length === 10 ? loan.dueDate : loan.dueDate.split("T")[0]) : "",
      interestType: loan.interestType || "Mensal",
      notes: loan.notes || "",
      tags: (loan.tags || []).join(", "),
    };
  });

  const [hasManager, setHasManager] = useState<boolean>(loan.hasManager ?? false);
  const [managerId, setManagerId] = useState<string>(loan.managerId ?? "");
  const [commissionRate, setCommissionRate] = useState<string>(String(loan.managerCommissionRate ?? 10));
  const [isSale, setIsSale] = useState<boolean>(loan.isSale ?? false);

  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>(() => {
    const totalInst = loan.installments;
    const paidInst = loan.paidInstallments || 0;
    const rem = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : loan.amount;
    const remInst = Math.max(1, totalInst - paidInst);
    const instVal = (rem / remInst).toFixed(2);
    const freq = loan.interestType || "Mensal";

    const allSchedules = installmentSchedules
      .filter((s) => s.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    if (allSchedules.length > 0) {
      return allSchedules.map((s) => ({
        date: new Date(s.dueDate.length === 10 ? `${s.dueDate}T00:00:00` : s.dueDate),
        value: String(s.amount),
      }));
    }

    const firstDue = loan.dueDate ? new Date(loan.dueDate.length === 10 ? `${loan.dueDate}T00:00:00` : loan.dueDate) : new Date();
    return Array.from({ length: totalInst }, (_, i) => ({
      date: getNextDate(firstDue, freq, i),
      value: instVal,
    }));
  });

  if (!isOpen) return null;

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
        const firstDue = next.dueDate ? new Date(next.dueDate + "T00:00:00") : new Date();
        setScheduleRows((prevRows) =>
          Array.from({ length: months }, (_, i) => {
            if (i < paidInst && prevRows[i]) return prevRows[i];
            return {
              date: getNextDate(firstDue, next.interestType, i - paidInst),
              value: next.installmentValue,
            };
          })
        );
      } else if (field === "interestValue") {
        const iv = parseFloat(value) || 0;
        const newRate = amt > 0 ? (iv / amt) * 100 : 0;
        next.interestRate = newRate.toFixed(2);
        const totalCalc = calculateTotalWithInterest(amt, newRate, months);
        const rem = parseFloat(next.remainingAmount) || totalCalc;
        const paidInst = parseInt(next.paidInstallments) || 0;
        const remInst = Math.max(1, months - paidInst);
        next.installmentValue = (rem / remInst).toFixed(2);
      } else if (field === "interestType" || field === "dueDate" || field === "startDate") {
        const paidInst = parseInt(next.paidInstallments) || 0;
        const firstDue = next.dueDate ? new Date(next.dueDate + "T00:00:00") : new Date();
        setScheduleRows((prevRows) =>
          Array.from({ length: months }, (_, i) => {
            if (i < paidInst && prevRows[i]) return prevRows[i];
            return {
              date: getNextDate(firstDue, next.interestType, i - paidInst),
              value: prevRows[i]?.value || next.installmentValue,
            };
          })
        );
      }
      return next;
    });
  };

  const handleSave = async () => {
    const parsedTags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const manualInterest = parseFloat(form.interestValue) || 0;
    const calcInterest = (parseFloat(form.amount) || 0) * ((parseFloat(form.interestRate) || 0) / 100);
    const hasCustomInterest = manualInterest > 0 && Math.abs(manualInterest - calcInterest) > 0.01;

    if (hasManager && !managerId) {
      toast.error("Selecione um gerente para o empréstimo com gerente.");
      return;
    }

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
      const ok = window.confirm(
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

    setSaving(true);
    try {
      const newDueDate = form.dueDate || loan.dueDate;
      await Promise.resolve(
        onUpdate({
          borrowerName: form.borrowerName,
          borrowerId: matchedClient ? matchedClient.id : undefined,
          amount: parseFloat(form.amount) || loan.amount,
          interestRate: form.interestRate.trim() === "" || isNaN(parseFloat(form.interestRate)) ? loan.interestRate : Math.max(0, parseFloat(form.interestRate)),
          installments: parseInt(form.installments) || loan.installments,
          paidInstallments: parseInt(form.paidInstallments) || 0,
          startDate: form.startDate || loan.startDate,
          dueDate: newDueDate,
          interestType: form.interestType,
          notes: form.notes,
          tags: parsedTags,
          remainingAmount: parseFloat(form.remainingAmount) || 0,
          customInterestValue: hasCustomInterest ? manualInterest : null,
          hasManager: hasManager,
          managerId: hasManager && managerId ? managerId : null,
          managerCommissionRate: hasManager ? parseFloat(commissionRate) || 10 : null,
          isSale: isSale,
        })
      );

      if (onSaveSchedule && newDueDate !== loan.dueDate) {
        const totalInst = parseInt(form.installments) || loan.installments;
        const paidInst = parseInt(form.paidInstallments) || 0;
        const nextNum = paidInst + 1;
        const freq = form.interestType || loan.interestType || "Mensal";
        const rem = parseFloat(form.remainingAmount) || loan.amount;
        const remInst = Math.max(1, totalInst - paidInst);
        const instVal = rem / remInst;
        const rows = Array.from({ length: totalInst }, (_, i) => {
          const num = i + 1;
          const existing = installmentSchedules.find((s) => s.loanId === loan.id && s.installmentNumber === num);
          if (num < nextNum) {
            return { installmentNumber: num, dueDate: existing?.dueDate || advanceLoanDueDate(loan.dueDate, freq, num - 1), amount: existing?.amount ?? instVal };
          }
          const offset = num - nextNum;
          return { installmentNumber: num, dueDate: advanceLoanDueDate(newDueDate, freq, offset), amount: existing?.amount ?? instVal };
        });
        await onSaveSchedule(loan.id, rows);
      }

      toast.success("Empréstimo atualizado com sucesso!");
      onClose();
    } catch (err: any) {
      console.error("[LoanEditModal] Erro ao salvar:", err);
      toast.error("Erro ao salvar alterações: " + (err?.message || "Tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  const totalReceivable = (parseFloat(form.amount) || 0) + (parseFloat(form.interestValue) || 0);

  return (
    <FormModalOverlay className="flex items-center justify-center p-0 sm:p-4">
      <div className="w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl bg-card rounded-none sm:rounded-2xl border-0 sm:border border-border/80 shadow-2xl flex flex-col overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border/60 px-4 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              <Pencil className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                Editar Empréstimo
              </h2>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Atualize as condições financeiras, prazos e configurações do contrato
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
          {/* Bloco 1: Devedor e Valores Principais */}
          <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nome do Devedor *
              </Label>
              <Input
                value={form.borrowerName}
                onChange={(e) => updateField("borrowerName", e.target.value)}
                placeholder="Nome completo do cliente"
                className="h-10 text-sm font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Valor Emprestado (R$) *
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => updateField("amount", e.target.value)}
                  placeholder="0,00"
                  className="h-10 text-sm font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Juros Mensal (%)
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.interestRate}
                  onChange={(e) => updateField("interestRate", e.target.value)}
                  placeholder="0"
                  className="h-10 text-sm font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Valor do Juros (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.interestValue}
                  onChange={(e) => updateField("interestValue", e.target.value)}
                  placeholder="0,00"
                  className="h-10 text-sm font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total a Receber (R$)
                </Label>
                <div className="h-10 px-3 rounded-lg border border-primary/25 bg-primary/5 flex items-center justify-between">
                  <span className="text-sm font-bold text-primary tabular-nums">
                    {formatCurrency(totalReceivable)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bloco 2: Parcelamento e Saldos a Receber */}
          <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Valor da Parcela (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.installmentValue}
                  onChange={(e) => updateField("installmentValue", e.target.value)}
                  placeholder="0,00"
                  className="h-10 text-sm font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Parcelas Totais
                </Label>
                <Input
                  type="number"
                  value={form.installments}
                  onChange={(e) => updateField("installments", e.target.value)}
                  placeholder="1"
                  min="1"
                  className="h-10 text-sm font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Parcelas Pagas
                </Label>
                <Input
                  type="number"
                  value={form.paidInstallments}
                  onChange={(e) => updateField("paidInstallments", e.target.value)}
                  placeholder="0"
                  min="0"
                  className="h-10 text-sm font-semibold border-emerald-500/30 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Restante a Receber (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.remainingAmount}
                  onChange={(e) => updateField("remainingAmount", e.target.value)}
                  placeholder="0,00"
                  className="h-10 text-sm font-semibold border-primary/30 focus-visible:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Bloco 3: Prazos e Modalidade de Contrato */}
          <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 shadow-xs space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Data Início
                </Label>
                <DatePickerField
                  value={form.startDate}
                  onChange={(v) => updateField("startDate", v)}
                  className="h-10 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Data 1ª Parcela
                </Label>
                <NativeDatePicker
                  value={form.dueDate || ""}
                  onChange={(v) => updateField("dueDate", v)}
                  placeholder="Selecione"
                  className="h-10 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tipo Contrato
                </Label>
                <Select value={form.interestType} onValueChange={(v) => updateField("interestType", v)}>
                  <SelectTrigger className="h-10 text-sm font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Diário">Diário</SelectItem>
                    <SelectItem value="Semanal">Semanal</SelectItem>
                    <SelectItem value="Quinzenal">Quinzenal</SelectItem>
                    <SelectItem value="Mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Ajuste de Vencimento Integrado */}
            <div className="rounded-lg border border-border/60 p-3 bg-muted/20 flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vencimento atual</p>
                <p className="text-sm font-bold tabular-nums text-foreground">
                  {(() => {
                    const d = getFirstPendingDate(loan, installmentSchedules);
                    return d ? d.toLocaleDateString("pt-BR") : "—";
                  })()}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs font-medium"
                onClick={() => setShowAdjustDueDate(true)}
              >
                Ajustar vencimento
              </Button>
            </div>
          </div>

          {/* Bloco 4: Opções Avançadas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Manager edit block */}
            <div className="rounded-xl border border-border/70 p-3.5 bg-card space-y-3">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id={`modal-edit-mgr-${loan.id}`}
                  checked={hasManager}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setHasManager(checked);
                    updateField("interestRate", checked ? "20" : "30");
                  }}
                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
                <Label htmlFor={`modal-edit-mgr-${loan.id}`} className="text-xs font-semibold cursor-pointer">
                  Empréstimo com gerente
                </Label>
              </div>
              {hasManager && (
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">Gerente</Label>
                    <Select value={managerId} onValueChange={setManagerId}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {managerOptions.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">Comissão (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={commissionRate}
                      onChange={(e) => setCommissionRate(e.target.value)}
                      className="h-9 text-xs"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sale toggle */}
            <div className="rounded-xl border border-border/70 p-3.5 bg-card flex items-center">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id={`modal-edit-sale-${loan.id}`}
                  checked={isSale}
                  onChange={(e) => setIsSale(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
                <Label htmlFor={`modal-edit-sale-${loan.id}`} className="text-xs font-semibold cursor-pointer">
                  Contrato de venda
                </Label>
              </div>
            </div>
          </div>

          {/* Bloco 5: Cronograma de Parcelas */}
          {(parseInt(form.installments) || 0) >= 2 && scheduleRows.length > 0 && (
            <div className="rounded-xl border border-border/70 overflow-hidden bg-card">
              <button
                type="button"
                onClick={() => setShowSchedule(!showSchedule)}
                className="flex items-center gap-2 w-full px-4 py-3 text-xs sm:text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
              >
                {showSchedule ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                Cronograma de Parcelas ({scheduleRows.length}x)
                <Badge variant="outline" className="ml-auto text-[10px] font-normal">
                  {form.interestType}
                </Badge>
              </button>
              {showSchedule && (
                <div>
                  <div className="flex items-center justify-between px-3.5 py-2 bg-muted/30 border-t border-b border-border/50">
                    <div className="flex gap-3 text-xs font-medium">
                      <span className="text-emerald-600 dark:text-emerald-400">{parseInt(form.paidInstallments) || 0} pagas</span>
                      <span className="text-amber-600 dark:text-amber-400">{Math.max(0, scheduleRows.length - (parseInt(form.paidInstallments) || 0))} pendentes</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border/40 max-h-64 overflow-y-auto">
                    {scheduleRows.map((row, idx) => {
                      const paidCount = parseInt(form.paidInstallments) || 0;
                      const isPaid = idx < paidCount;
                      return (
                        <div key={idx} className={`flex items-center gap-2 px-3 py-2.5 ${isPaid ? "opacity-60 bg-muted/20" : "bg-card"}`}>
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isPaid ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                          }`}>
                            {idx + 1}ª
                          </span>
                          <div className="flex-1">
                            <NativeDatePicker
                              value={format(row.date, "yyyy-MM-dd")}
                              onChange={(v) => {
                                if (!v || isPaid) return;
                                const d = new Date(`${v}T00:00:00`);
                                setScheduleRows((prev) => {
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
                              setScheduleRows((prev) => {
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
                            className="h-8 w-24 text-xs text-right font-medium"
                          />
                          {isPaid && <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shrink-0">Pago</Badge>}
                        </div>
                      );
                    })}
                    <div className="px-3.5 py-2.5 bg-muted/30 border-t border-border/50 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Soma das parcelas:</span>
                      <span className="text-xs font-bold text-foreground">
                        {formatCurrency(scheduleRows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0))}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bloco 6: Etiquetas */}
          <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 space-y-2.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Etiquetas
            </Label>
            {form.tags.split(",").map((t) => t.trim()).filter(Boolean).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1">
                {form.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 text-xs py-1 px-2.5 bg-secondary/80">
                    {tag}
                    <button
                      type="button"
                      onClick={() => {
                        const currentTags = form.tags.split(",").map((t) => t.trim()).filter((t) => t !== tag);
                        updateField("tags", currentTags.join(", "));
                      }}
                      className="ml-0.5 hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 text-xs shrink-0">
                    <ChevronDown className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
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
                className="h-10 text-sm flex-1"
                placeholder="Digite etiquetas separadas por vírgula (Ex: VIP, Renovação)"
              />
            </div>
          </div>

          {/* Bloco 7: Observações */}
          <div className="rounded-xl border border-border/70 bg-card p-3.5 sm:p-4 space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Observações
            </Label>
            <Textarea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={3}
              placeholder="Anotações internas sobre este empréstimo..."
              className="text-sm resize-none"
            />
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-20 bg-card/95 backdrop-blur-md border-t border-border/60 p-4 sm:p-6 flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="h-11 px-5 font-medium rounded-xl"
          >
            <X className="h-4 w-4 mr-1.5" />
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-11 px-6 font-semibold rounded-xl bg-primary text-primary-foreground shadow-md transition-all active:scale-[0.99]"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 mr-2 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                Salvando Alterações...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-1.5" />
                Salvar Alterações
              </>
            )}
          </Button>
        </div>
      </div>

      {showAdjustDueDate && (
        <AdjustDueDateDialog
          loan={loan}
          installmentSchedules={installmentSchedules}
          isOpen={showAdjustDueDate}
          onClose={() => setShowAdjustDueDate(false)}
          onSuccess={() => {
            setShowAdjustDueDate(false);
            if (onAdjustDueDateSuccess) onAdjustDueDateSuccess();
          }}
        />
      )}
    </FormModalOverlay>
  );
}
