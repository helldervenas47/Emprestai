import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NativeDatePicker } from "@/components/ui/native-date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, X, CalendarIcon, ChevronDown, ChevronRight, UserPlus, DollarSign, TrendingUp, Calendar, ShieldCheck, Wallet, AlertTriangle as AlertTriangleIcon } from "lucide-react";
import { calculateInstallment, calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { advanceLoanDueDate } from "@/features/loans/lib/advanceDueDate";
import { Loan, Client } from "@/types/loan";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useCreditLimits } from "@/features/creditCards/hooks/useCreditLimits";
import { computeUsedLimit, computeAvailableLimit, formatBRL } from "@/features/creditCards/lib/creditLimit";
import { buildRiskProfile } from "@/features/loans/lib/clientRisk";
import { LoanPaymentSplitEditor, buildSplitFromState, type SplitState } from "@/features/loans/components/LoanPaymentSplitEditor";
import { formatCPF, formatCpfOrCnpj, onlyDigits } from "@/lib/brDocuments";
import { useLoanRenegotiations } from "@/features/loans/hooks/useLoanRenegotiations";

interface Props {
  onAdd: (loan: Omit<Loan, "id" | "status" | "paidInstallments"> & { paymentMethodId?: string | null; paymentSplit?: import("@/types/loan").PaymentSplit | null }) => Promise<string | null>;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  onClose: () => void;
  clients: Client[];
  loans: Loan[];
  payments: { id: string; loanId: string; amount: number; date: string; installmentNumber: number; previousDueDate?: string }[];
  installmentSchedules: { id?: string; loanId: string; installmentNumber: number; dueDate: string; amount: number }[];
  existingTags?: string[];
  /** Optional inline client creation. Returns the new client id when created. */
  onAddClient?: (client: Omit<Client, "id" | "createdAt">) => Promise<string | null>;
  /** Optional initial values, e.g. when coming from the loan simulator. */
  prefill?: {
    clientId: string | null;
    clientName: string;
    amount: number;
    interestRate: number;
    installments: number;
    customInstallmentValue?: number | null;
  };
}

function getNextDate(base: Date, frequency: string, periods: number): Date {
  const baseIso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  const advancedIso = advanceLoanDueDate(baseIso, frequency, periods);
  return new Date(`${advancedIso}T00:00:00`);
}

export function LoanForm({ onAdd, onSaveSchedule, onClose, clients, loans, payments, installmentSchedules, existingTags = [], prefill, onAddClient }: Props) {
  const { renegotiations } = useLoanRenegotiations();

  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [splitState, setSplitState] = useState<SplitState>({ method1Id: null, method2Id: null, amount1: "", amount2: "", enabled: false });
  const [showFormError, setShowFormError] = useState(false);
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [quickClient, setQuickClient] = useState({ name: "", phone: "", cpf: "" });
  const [savingQuickClient, setSavingQuickClient] = useState(false);
  const activeClients = clients.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const defaultStart = todayInAppTz();
  const defaultFirstDue = new Date();
  defaultFirstDue.setMonth(defaultFirstDue.getMonth() + 1);

  const [form, setForm] = useState({
    borrowerName: prefill?.clientId ?? "",
    amount: prefill?.amount ? String(prefill.amount) : "",
    interestRate: prefill?.interestRate != null ? String(prefill.interestRate) : "30",
    installments: prefill?.installments ? String(prefill.installments) : "1",
    startDate: defaultStart,
    notes: "",
    interestType: "Mensal",
  });

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [hasManager, setHasManager] = useState(false);
  const [isSale, setIsSale] = useState(false);
  const [managerId, setManagerId] = useState<string>("");
  const [commissionRate, setCommissionRate] = useState<string>("10");
  const [commissionAmount, setCommissionAmount] = useState<string>("");
  // Tracks which commission field was last edited so we can highlight it and avoid loops
  const [commissionLastEdited, setCommissionLastEdited] = useState<"rate" | "amount">("rate");

  const toggleHasManager = (checked: boolean) => {
    setHasManager(checked);
    setForm((prev) => ({ ...prev, interestRate: checked ? "20" : "30" }));
  };

  const [firstDueDate, setFirstDueDate] = useState<Date>(defaultFirstDue);
  const [showSchedule, setShowSchedule] = useState(false);

  const managerClients = activeClients.filter((c) => c.isManager);
  const selectedClient = useMemo(() => activeClients.find((c) => c.id === form.borrowerName), [activeClients, form.borrowerName]);
  const clientRiskProfile = useMemo(() => {
    if (!selectedClient) return null;
    try {
      return buildRiskProfile(
        selectedClient,
        loans || [],
        (payments || []) as any,
        (installmentSchedules || []) as any,
        new Date(),
        renegotiations
      );
    } catch (err) {
      console.error("[LoanForm] Erro ao calcular perfil de risco do cliente:", err);
      return null;
    }
  }, [selectedClient, loans, payments, installmentSchedules, renegotiations]);

  const { getLimitForClient } = useCreditLimits();
  const selectedClientLimit = selectedClient ? getLimitForClient(selectedClient.id) : undefined;
  const selectedClientUsed = useMemo(
    () => (selectedClient ? computeUsedLimit(selectedClient, loans, payments) : 0),
    [selectedClient, loans, payments],
  );
  const selectedClientAvailable = computeAvailableLimit(
    selectedClientLimit?.currentLimit ?? 0,
    selectedClientUsed,
  );
  const requestedAmount = parseFloat(form.amount.replace(",", ".")) || 0;
  const exceedsLimit = !!selectedClient && requestedAmount > selectedClientAvailable && (selectedClientLimit?.currentLimit ?? 0) > 0;

  // Auto-toggle: when selected client is a manager, default hasManager=true
  // Also pre-fill interest rate from client's defaultInterestRate (fallback 30 / 20 with manager)
  useEffect(() => {
    const selected = activeClients.find((c) => c.id === form.borrowerName);
    if (!selected) return;
    if (selected.isManager) {
      setHasManager(true);
      if (!managerId && managerClients.length > 0) {
        setManagerId(selected.id);
      }
    }
    const fallback = (selected.isManager || hasManager) ? 20 : 30;
    const rateToUse = selected.defaultInterestRate != null ? selected.defaultInterestRate : fallback;
    setForm((prev) => ({ ...prev, interestRate: String(rateToUse) }));
  }, [form.borrowerName]);

  const amount = parseFloat(form.amount) || 0;
  const rate = parseFloat(form.interestRate) || 0;
  const installments = parseInt(form.installments) || 0;

  const calcTotal = installments > 0 ? calculateTotalWithInterest(amount, rate, installments) : 0;
  const calcMonthly = installments > 0 ? calcTotal / installments : 0;
  const calcInterest = calcTotal - amount;

  const [monthlyOverride, setMonthlyOverride] = useState("");
  const [monthlyTouched, setMonthlyTouched] = useState(false);
  const [interestOverride, setInterestOverride] = useState("");
  const [interestTouched, setInterestTouched] = useState(false);

  const skipResetRef = (typeof window !== "undefined") ? (window as any) : null;
  // Use a ref to skip the reset effect when overrides are the origin of the rate change
  const skipNextResetRef = useState({ current: false })[0];

  useEffect(() => {
    if (skipNextResetRef.current) {
      skipNextResetRef.current = false;
      return;
    }
    setMonthlyOverride("");
    setMonthlyTouched(false);
    setInterestOverride("");
    setInterestTouched(false);
  }, [form.amount, form.interestRate, form.installments]);

  const monthlyPayment = monthlyOverride !== "" ? parseFloat(monthlyOverride) || 0 : calcMonthly;
  const totalInterest = interestOverride !== "" ? parseFloat(interestOverride) || 0 : calcInterest;
  const totalAmount = amount + totalInterest;

  // Auto-update firstDueDate when startDate or frequency changes
  useEffect(() => {
    if (form.startDate) {
      const start = new Date(form.startDate + "T00:00:00");
      setFirstDueDate(getNextDate(start, form.interestType, 1));
    }
  }, [form.startDate, form.interestType]);

  // Commission sync: base = loan principal (amount). Keeps % and R$ in sync.
  useEffect(() => {
    if (!hasManager || amount <= 0) return;
    if (commissionLastEdited === "rate") {
      const r = parseFloat(commissionRate) || 0;
      const v = (amount * r) / 100;
      const formatted = v > 0 ? v.toFixed(2) : "";
      if (formatted !== commissionAmount) setCommissionAmount(formatted);
    } else {
      const v = parseFloat(commissionAmount) || 0;
      const r = (v / amount) * 100;
      const formatted = r > 0 ? r.toFixed(2) : "";
      if (formatted !== commissionRate) setCommissionRate(formatted);
    }
  }, [hasManager, amount, commissionRate, commissionAmount, commissionLastEdited]);

  const commissionExceedsLoan = hasManager && (parseFloat(commissionAmount) || 0) > amount && amount > 0;

  // Generate schedule rows with editable values
  const [installmentRows, setInstallmentRows] = useState<{ date: Date; value: string }[]>([]);

  // Rebuild rows when installments/firstDueDate/frequency changes
  useEffect(() => {
    if (installments <= 0) {
      setInstallmentRows([]);
      return;
    }
    const baseValue = monthlyPayment > 0 ? monthlyPayment.toFixed(2) : calcMonthly.toFixed(2);
    setInstallmentRows(
      Array.from({ length: installments }, (_, i) => ({
        date: i === 0 ? firstDueDate : getNextDate(firstDueDate, form.interestType, i),
        value: baseValue,
      }))
    );
  }, [installments, firstDueDate, form.interestType]);

  // Sync row values when calcMonthly changes (amount/rate change)
  useEffect(() => {
    if (monthlyOverride !== "" || installmentRows.length === 0) return;
    setInstallmentRows((prev) => prev.map((r) => ({ ...r, value: calcMonthly.toFixed(2) })));
  }, [calcMonthly]);

  const syncRateFromInterest = (ti: number) => {
    if (amount > 0) {
      const newRate = (ti / amount) * 100;
      skipNextResetRef.current = true;
      setForm((prev) => ({ ...prev, interestRate: newRate.toFixed(2) }));
    }
  };

  const handleMonthlyChange = (val: string) => {
    setMonthlyOverride(val);
    setMonthlyTouched(true);
    const mp = parseFloat(val) || 0;
    if (mp > 0 && installments > 0) {
      const newTotal = mp * installments;
      const ti = newTotal - amount;
      setInterestOverride(ti.toFixed(2));
      setInterestTouched(true);
      syncRateFromInterest(ti);
    }
  };

  const handleInterestChange = (val: string) => {
    setInterestOverride(val);
    setInterestTouched(true);
    const ti = parseFloat(val) || 0;
    if (installments > 0) {
      setMonthlyOverride(((amount + ti) / installments).toFixed(2));
      setMonthlyTouched(true);
    }
    syncRateFromInterest(ti);
  };

  const handleTotalChange = (val: string) => {
    const tot = parseFloat(val) || 0;
    const ti = tot - amount;
    const positiveInterest = ti >= 0 ? ti : 0;
    setInterestOverride(positiveInterest.toFixed(2));
    setInterestTouched(true);
    if (installments > 0) {
      setMonthlyOverride((tot / installments).toFixed(2));
      setMonthlyTouched(true);
    }
    syncRateFromInterest(positiveInterest);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!selectedClient || !amount || !installments || isNaN(rate) || rate < 0) return;
    const effectivePrimaryId = splitState.enabled ? splitState.method1Id : paymentMethodId;
    if (!effectivePrimaryId) {
      setShowFormError(true);
      toast.error("Selecione a forma de pagamento (Conta ou Dinheiro).");
      return;
    }
    const splitResult = buildSplitFromState(splitState, amount);
    if (!splitResult.ok) {
      setShowFormError(true);
      toast.error(splitResult.error);
      return;
    }
    if (hasManager && !managerId) {
      toast.error("Selecione um gerente para o empréstimo com gerente.");
      return;
    }
    if (hasManager && commissionExceedsLoan) {
      toast.error("A comissão não pode ser maior que o valor do empréstimo.");
      return;
    }
    setSubmitting(true);
    try {
      const totalWithInterest = calculateTotalWithInterest(amount, rate, installments);

      const firstRowVal = installmentRows.length > 0 ? parseFloat(installmentRows[0].value) || 0 : 0;
      const defaultCalc = calcMonthly;
      const hasCustomValue = firstRowVal > 0 && Math.abs(firstRowVal - defaultCalc) > 0.01;

      const dueDate = installmentRows.length > 0
        ? installmentRows[0].date.toISOString().split("T")[0]
        : firstDueDate.toISOString().split("T")[0];

      const loanId = await onAdd({
        borrowerName: selectedClient.name,
        borrowerId: selectedClient.id,
        amount,
        interestRate: rate,
        interestType: form.interestType,
        paymentType: installments >= 2 ? "Parcelado" : "Juros",
        installments,
        startDate: form.startDate,
        dueDate,
        notes: form.notes,
        remainingAmount: totalWithInterest,
        customInstallmentValue: hasCustomValue ? firstRowVal : null,
        customInterestValue: interestOverride !== "" ? parseFloat(interestOverride) || null : null,
        tags: tags.length > 0 ? tags : undefined,
        hasManager,
        managerId: hasManager && managerId ? managerId : null,
        managerCommissionRate: hasManager ? parseFloat(commissionRate) || 10 : null,
        isSale,
        createdAt: new Date().toISOString(),
        paymentMethodId: effectivePrimaryId,
        paymentSplit: splitResult.split,
      });

      if (loanId && installmentRows.length > 0) {
        await onSaveSchedule(loanId, installmentRows.map((row, idx) => ({
          installmentNumber: idx + 1,
          dueDate: row.date.toISOString().split("T")[0],
          amount: parseFloat(row.value) || 0,
        })));
      }

      setShowSuccess(true);
    } catch (err) {
      console.error("[LoanForm] submit failed", err);
      const msg = err instanceof Error ? err.message : "Falha ao registrar empréstimo.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };


  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-stretch justify-center p-0 md:items-center md:p-4">
      <SuccessAnimation show={showSuccess} onComplete={onClose} message="Empréstimo registrado!" />
      <Card className="modal-form-scrollable !bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:h-auto md:max-h-[92svh] md:w-full md:max-w-[760px] md:rounded-2xl md:border md:shadow-xl md:pt-0 md:pb-0">
        <CardHeader className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border/60 flex flex-row items-center justify-between py-3.5 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold leading-tight">Novo Empréstimo</CardTitle>
              <p className="text-xs text-muted-foreground">Preencha os dados da operação e confira a simulação</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 pb-8 md:pb-6 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* SEÇÃO 1: CLIENTE & RISCO */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cliente do Empréstimo
                  </Label>
                </div>
                {onAddClient && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs gap-1 rounded-lg border-primary/30 text-primary hover:bg-primary/5"
                    onClick={() => {
                      setQuickClient({ name: "", phone: "", cpf: "" });
                      setShowQuickClient(true);
                    }}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Novo cliente
                  </Button>
                )}
              </div>

              {activeClients.length === 0 ? (
                <p className="text-sm text-destructive mt-1">
                  Nenhum cliente ativo cadastrado.{onAddClient ? " Clique em \"Novo cliente\" para cadastrar." : " Cadastre um cliente primeiro."}
                </p>
              ) : (
                <Select value={form.borrowerName} onValueChange={(v) => update("borrowerName", v)}>
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="Selecione ou busque um cliente..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {activeClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.isManager ? " 👔 (Gerente)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Score e Limite de Crédito integrado */}
              {selectedClient && (
                <div className="pt-2 border-t border-border/50 space-y-2.5">
                  {clientRiskProfile && (
                    <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                      <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        Análise de Risco:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-bold uppercase ${clientRiskProfile.badgeClassName}`}>
                          SCORE {clientRiskProfile.score}/100
                        </Badge>
                        <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-bold uppercase ${clientRiskProfile.badgeClassName}`}>
                          RISCO {clientRiskProfile.riskLevel}
                        </Badge>
                      </div>
                    </div>
                  )}

                  <div className={cn(
                    "rounded-lg border p-2.5 space-y-2 transition-colors",
                    exceedsLimit ? "border-warning/60 bg-warning/5" : "border-border/60 bg-muted/20"
                  )}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold flex items-center gap-1.5 text-foreground">
                        <Wallet className={cn("h-3.5 w-3.5", exceedsLimit ? "text-warning" : "text-primary")} />
                        Limite de Crédito
                      </span>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {selectedClientLimit?.mode === "manual" ? "Manual" : "Automático"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md border border-border/50 bg-card p-2 text-center">
                        <span className="text-[10px] text-muted-foreground block">Limite Total</span>
                        <span className="font-semibold text-foreground">{formatBRL(selectedClientLimit?.currentLimit ?? 0)}</span>
                      </div>
                      <div className="rounded-md border border-border/50 bg-card p-2 text-center">
                        <span className="text-[10px] text-muted-foreground block">Em Uso</span>
                        <span className="font-semibold text-foreground">{formatBRL(selectedClientUsed)}</span>
                      </div>
                      <div className="rounded-md border border-border/50 bg-card p-2 text-center">
                        <span className="text-[10px] text-muted-foreground block">Disponível</span>
                        <span className={cn("font-semibold", selectedClientAvailable < 0 ? "text-destructive" : "text-success")}>
                          {formatBRL(selectedClientAvailable)}
                        </span>
                      </div>
                    </div>

                    {exceedsLimit && (
                      <div className="flex items-start gap-1.5 text-[11px] text-warning pt-1">
                        <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <p>
                          Atenção: o valor de {formatBRL(requestedAmount)} excede o disponível ({formatBRL(selectedClientAvailable)}).
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO 2: CONDIÇÕES DO EMPRÉSTIMO */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Condições e Prazos
                </Label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. Valor (R$) */}
                <div>
                  <Label htmlFor="amount" className="text-xs font-medium">Valor do Empréstimo (R$) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => update("amount", e.target.value)}
                    placeholder="1000.00"
                    required
                    className="h-10 text-sm font-semibold"
                  />
                </div>

                {/* 2. Juros (%) */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="interestRate" className="text-xs font-medium">Taxa de Juros (%) *</Label>
                    {installments > 0 && rate > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {(rate / installments).toFixed(2)}% / ciclo
                      </span>
                    )}
                  </div>
                  <Input
                    id="interestRate"
                    type="text"
                    inputMode="decimal"
                    value={form.interestRate}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                      if (v === "" || /^\d*\.?\d*$/.test(v)) update("interestRate", v);
                    }}
                    placeholder="30"
                    required
                    className="h-10 text-sm font-semibold"
                  />
                </div>

                {/* 3. Valor do Juros (R$) — Editável */}
                <div>
                  <Label htmlFor="interestValue" className="text-xs font-medium">Valor do Juros (R$)</Label>
                  <Input
                    id="interestValue"
                    type="number"
                    step="0.01"
                    value={interestOverride !== "" ? interestOverride : (calcInterest > 0 ? calcInterest.toFixed(2) : "")}
                    onChange={(e) => handleInterestChange(e.target.value)}
                    placeholder="R$ 0,00"
                    className="h-10 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                  />
                </div>

                {/* 4. Valor Total (R$) — Editável */}
                <div>
                  <Label htmlFor="totalValue" className="text-xs font-medium">Valor Total (R$)</Label>
                  <Input
                    id="totalValue"
                    type="number"
                    step="0.01"
                    value={
                      interestOverride !== ""
                        ? (amount + (parseFloat(interestOverride) || 0)).toFixed(2)
                        : (calcTotal > 0 ? calcTotal.toFixed(2) : "")
                    }
                    onChange={(e) => handleTotalChange(e.target.value)}
                    placeholder="R$ 0,00"
                    className="h-10 text-sm font-semibold text-primary"
                  />
                </div>

                {/* 5. Tipo de Contrato (Periodicidade) */}
                <div>
                  <Label className="text-xs font-medium">Periodicidade</Label>
                  <Select value={form.interestType} onValueChange={(v) => update("interestType", v)}>
                    <SelectTrigger className="h-10 text-sm">
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

                {/* 6. Parcelas */}
                <div>
                  <Label htmlFor="installments" className="text-xs font-medium">Número de Parcelas *</Label>
                  <Input
                    id="installments"
                    type="number"
                    min="1"
                    value={form.installments}
                    onChange={(e) => update("installments", e.target.value)}
                    placeholder="1"
                    required
                    className="h-10 text-sm"
                  />
                </div>

                {/* 7. Data Início */}
                <div>
                  <Label htmlFor="startDate" className="text-xs font-medium">Data de Saída (Início)</Label>
                  <DatePickerField
                    id="startDate"
                    value={form.startDate}
                    onChange={(v) => update("startDate", v)}
                  />
                </div>

                {/* 8. Data 1ª Parcela */}
                <div>
                  <Label className="text-xs font-medium">Data da 1ª Parcela</Label>
                  <NativeDatePicker
                    value={firstDueDate ? format(firstDueDate, "yyyy-MM-dd") : ""}
                    onChange={(v) => { if (v) setFirstDueDate(new Date(`${v}T00:00:00`)); }}
                    placeholder="Selecione"
                    className="h-10 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO 3: LIVE FINANCIAL SUMMARY CARD */}
            {amount > 0 && installments > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/[0.03] dark:bg-primary/[0.06] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Resumo da Operação
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-[11px] font-semibold bg-primary/10 text-primary border-transparent">
                    {installments}x {form.interestType}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-lg bg-card border border-border/60 shadow-2xs">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">
                      Capital
                    </span>
                    <span className="text-sm sm:text-base font-bold text-foreground">
                      {formatCurrency(amount)}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-card border border-border/60 shadow-2xs">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">
                      Lucro (Juros)
                    </span>
                    <span className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatCurrency(calcInterest)}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-card border border-border/60 shadow-2xs">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">
                      Total a Receber
                    </span>
                    <span className="text-sm sm:text-base font-bold text-primary">
                      {formatCurrency(calcTotal)}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-card border border-border/60 shadow-2xs">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">
                      {installments > 1 ? "Valor Parcela" : "Retorno"}
                    </span>
                    <span className="text-sm sm:text-base font-bold text-foreground">
                      {installments > 1 ? `${installments}x ` : ""}{formatCurrency(calcMonthly)}
                    </span>
                  </div>
                </div>

                {/* Cronograma de Parcelas */}
                {installments >= 2 && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowSchedule(!showSchedule)}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-card border border-border/60 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        Ver cronograma detalhado das parcelas ({installments}x)
                      </span>
                      {showSchedule ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>

                    {showSchedule && (
                      <div className="mt-2 rounded-lg border border-border/60 bg-card overflow-hidden divide-y divide-border/40 max-h-56 overflow-y-auto">
                        {installmentRows.map((row, idx) => (
                          <div key={idx} className="flex items-center gap-2 px-3 py-2 text-xs">
                            <span className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 bg-primary/10 text-primary">
                              {idx + 1}ª
                            </span>
                            <div className="flex-1">
                              <NativeDatePicker
                                value={format(row.date, "yyyy-MM-dd")}
                                onChange={(v) => {
                                  if (!v) return;
                                  const d = new Date(`${v}T00:00:00`);
                                  setInstallmentRows((prev) => {
                                    const rows = [...prev];
                                    rows[idx] = { ...rows[idx], date: d };
                                    for (let i = idx + 1; i < rows.length; i++) {
                                      rows[i] = { ...rows[i], date: getNextDate(d, form.interestType, i - idx) };
                                    }
                                    if (idx === 0) setFirstDueDate(d);
                                    return rows;
                                  });
                                }}
                                className="h-7 text-xs"
                              />
                            </div>
                            <div className="h-7 px-2.5 rounded-md bg-muted/40 flex items-center font-semibold text-foreground shrink-0">
                              {formatCurrency(calcMonthly)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SEÇÃO 4: ORIGEM DO CAPITAL (SAÍDA) */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  3
                </span>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Origem do Capital (Saída do Caixa)
                </Label>
              </div>

              <LoanPaymentSplitEditor
                total={amount}
                state={{ ...splitState, method1Id: splitState.enabled ? splitState.method1Id : paymentMethodId }}
                onChange={(next) => {
                  setShowFormError(false);
                  setPaymentMethodId(next.method1Id);
                  setSplitState(next);
                }}
                showError={showFormError}
              />
            </div>

            {/* SEÇÃO 5: VÍNCULOS & CONFIGURAÇÕES EXTRAS */}
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  4
                </span>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vínculos e Detalhes
                </Label>
              </div>

              <div className="space-y-3 divide-y divide-border/40">
                {/* Switch: Empréstimo com Gerente */}
                <div className="pt-2 first:pt-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="hasManager" className="text-sm font-medium cursor-pointer">
                        Empréstimo com gerente
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Vincula um operador/gerente para comissionamento
                      </p>
                    </div>
                    <Switch
                      id="hasManager"
                      checked={hasManager}
                      onCheckedChange={toggleHasManager}
                    />
                  </div>

                  {hasManager && (
                    <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-3 space-y-3">
                      <div>
                        <Label className="text-xs font-medium">Selecione o Gerente *</Label>
                        {managerClients.length === 0 ? (
                          <p className="text-xs text-warning mt-1">Nenhum cliente marcado como gerente.</p>
                        ) : (
                          <Select value={managerId} onValueChange={setManagerId}>
                            <SelectTrigger className="h-9 text-sm mt-1">
                              <SelectValue placeholder="Selecione o gerente responsável" />
                            </SelectTrigger>
                            <SelectContent>
                              {managerClients.map((m) => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Comissão (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={commissionRate}
                            onChange={(e) => {
                              setCommissionLastEdited("rate");
                              setCommissionRate(e.target.value);
                            }}
                            className={cn(
                              "h-9 text-sm mt-1",
                              commissionLastEdited === "rate" && "ring-2 ring-primary/40 border-primary/50",
                            )}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Valor da comissão (R$)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={commissionAmount}
                            onChange={(e) => {
                              setCommissionLastEdited("amount");
                              setCommissionAmount(e.target.value);
                            }}
                            placeholder="0,00"
                            className={cn(
                              "h-9 text-sm mt-1",
                              commissionLastEdited === "amount" && "ring-2 ring-primary/40 border-primary/50",
                            )}
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Base: valor do empréstimo {amount > 0 ? `(${formatCurrency(amount)})` : ""}. Sincronizado automaticamente.
                      </p>
                      {commissionExceedsLoan && (
                        <p className="text-[11px] text-destructive">
                          A comissão não pode ser maior que o valor do empréstimo.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Switch: Contrato de Venda */}
                <div className="pt-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isSale" className="text-sm font-medium cursor-pointer">
                      Contrato de venda
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Identificar esta operação como venda financiada de produto
                    </p>
                  </div>
                  <Switch
                    id="isSale"
                    checked={isSale}
                    onCheckedChange={setIsSale}
                  />
                </div>

                {/* Etiquetas */}
                <div className="pt-3 space-y-2">
                  <Label className="text-xs font-medium">Etiquetas (Tags)</Label>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="gap-1 text-xs px-2 py-0.5">
                          {tag}
                          <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} className="ml-0.5 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tagInput.trim()) {
                          e.preventDefault();
                          if (!tags.includes(tagInput.trim())) setTags([...tags, tagInput.trim()]);
                          setTagInput("");
                        }
                      }}
                      placeholder="Digite uma tag e pressione Enter"
                      className="h-9 text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 px-3"
                      onClick={() => {
                        if (tagInput.trim() && !tags.includes(tagInput.trim())) {
                          setTags([...tags, tagInput.trim()]);
                          setTagInput("");
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Adicionar
                    </Button>
                    {existingTags.filter(t => !tags.includes(t)).length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0">
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="end">
                          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {existingTags
                              .filter(t => !tags.includes(t))
                              .sort((a, b) => a.localeCompare(b, "pt-BR"))
                              .map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  className="text-left text-sm px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
                                  onClick={() => setTags([...tags, tag])}
                                >
                                  {tag}
                                </button>
                              ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>

                {/* Observações */}
                <div className="pt-3 space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-medium">Observações (opcional)</Label>
                  <Textarea
                    id="notes"
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    placeholder="Notas ou informações adicionais sobre o empréstimo..."
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>
              </div>
            </div>

            {/* BOTÃO DE SUBMISSÃO */}
            <div className="pt-2 sticky bottom-0 bg-card/95 backdrop-blur py-2">
              {submitting ? (
                <div className="flex items-center justify-center h-12 rounded-xl bg-primary/20 text-primary font-semibold">
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin mr-2" />
                  Registrando empréstimo...
                </div>
              ) : (
                <Button type="submit" className="w-full h-12 text-sm font-semibold rounded-xl shadow-md gap-2">
                  <Plus className="h-4 w-4" />
                  Registrar Empréstimo
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {onAddClient && (
        <Dialog open={showQuickClient} onOpenChange={setShowQuickClient}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                Cadastrar novo cliente
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome completo *</Label>
                <Input
                  autoFocus
                  value={quickClient.name}
                  onChange={(e) => setQuickClient((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex.: João da Silva"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Telefone</Label>
                  <Input
                    inputMode="tel"
                    value={quickClient.phone}
                    onChange={(e) => setQuickClient((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div>
                  <Label>CPF/CNPJ</Label>
                  <Input
                    inputMode="numeric"
                    value={quickClient.cpf}
                    onChange={(e) => setQuickClient((p) => ({ ...p, cpf: formatCpfOrCnpj(e.target.value) }))}
                    placeholder="000.000.000-00"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Outros dados podem ser preenchidos depois em Cadastro.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowQuickClient(false)}
                disabled={savingQuickClient}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={savingQuickClient || !quickClient.name.trim()}
                onClick={async () => {
                  if (!onAddClient) return;
                  const name = quickClient.name.trim();
                  if (!name) return;
                  setSavingQuickClient(true);
                  try {
                    const digits = onlyDigits(quickClient.cpf);
                    const isCnpj = digits.length > 11;
                    const newId = await onAddClient({
                      name,
                      phone: quickClient.phone.trim(),
                      email: "",
                      cpf: isCnpj ? "" : formatCPF(digits),
                      cnpj: isCnpj ? formatCpfOrCnpj(digits) : "",
                      rg: "",
                      address: "",
                      city: "",
                      state: "",
                      score: "",
                      active: true,
                    });
                    if (newId) {
                      update("borrowerName", newId);
                      toast.success("Cliente cadastrado com sucesso.");
                      setShowQuickClient(false);
                    } else {
                      toast.error("Não foi possível cadastrar o cliente.");
                    }
                  } catch (err) {
                    console.error("[LoanForm] quick add client failed", err);
                    toast.error("Falha ao cadastrar cliente.");
                  } finally {
                    setSavingQuickClient(false);
                  }
                }}
              >
                {savingQuickClient ? "Salvando..." : "Cadastrar e selecionar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
