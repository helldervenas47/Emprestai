import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, Send, Loader2, ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeDatePicker } from "@/components/ui/native-date-picker";
import { Loan, Payment, InstallmentSchedule, Sale, Expense } from "@/types/loan";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { useCreditCards } from "@/features/creditCards/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/features/creditCards/hooks/useCreditCardOpenings";
import { getCardInvoiceTotalsForMonth } from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useDailyPlanningTelegramPrefs } from "@/features/telegram/hooks/useDailyPlanningTelegramPrefs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";
import { useTelegramReportsLink } from "@/features/telegram/hooks/useTelegramReportsLink";

interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  sales: Sale[];
  expenses: Expense[];
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type RowStatus = "paid" | "pending";
type RowGroup = "Empréstimos" | "Vendas" | "Veículos";

interface Row {
  origin: string;
  description: string;
  amount: number;
  category?: string;
  status: RowStatus;
  group?: RowGroup;
}

export function DailyPlanningReport({ loans, payments, installmentSchedules, sales, expenses }: Props) {
  const [date, setDate] = useState<string>(todayISO());
  const { user } = useAuth();
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();
  const { linked } = useTelegramReportsLink();
  const { prefs, loading: prefsLoading, save } = useDailyPlanningTelegramPrefs();
  const [sending, setSending] = useState(false);

  // ---- RECEIPTS ----
  const incomeRows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    // Loan installments due on date — separa pago vs pendente
    for (const loan of loans) {
      if (loan.status === "paid") continue;
      const schedules = installmentSchedules.filter(s => s.loanId === loan.id && s.dueDate === date);
      for (const s of schedules) {
        const isPaid = s.installmentNumber <= loan.paidInstallments
          || payments.some(p => p.loanId === loan.id && p.installmentNumber === s.installmentNumber && p.date === date);
        out.push({
          origin: "Empréstimo",
          group: "Empréstimos",
          description: `${loan.borrowerName} — Parcela ${s.installmentNumber}/${loan.installments}`,
          amount: Number(s.amount || 0),
          status: isPaid ? "paid" : "pending",
        });
      }
      // Fallback for loans without explicit schedule rows: use dueDate field
      if (schedules.length === 0 && loan.dueDate === date && loan.paidInstallments < loan.installments) {
        const rawInstallments = loan.installments || 1;
        const total = calculateTotalWithInterest(loan.amount, loan.interestRate, rawInstallments);
        const perInst = total / rawInstallments;
        
        let calculatedAmount = loan.customInstallmentValue ?? perInst;
        const remainingToPay = Math.max(0, total - (loan.paidInstallments * calculatedAmount));
        calculatedAmount = Math.min(calculatedAmount, remainingToPay);

        out.push({
          origin: "Empréstimo",
          group: "Empréstimos",
          description: `${loan.borrowerName} — Parcela ${loan.paidInstallments + 1}/${rawInstallments}`,
          amount: Number(calculatedAmount || 0),
          status: "pending",
        });
      }
      // Pagamentos avulsos do dia (sem schedule correspondente) — registra como recebido
      for (const p of payments) {
        if (p.loanId !== loan.id || p.date !== date) continue;
        const matched = schedules.some(s => s.installmentNumber === p.installmentNumber);
        if (matched) continue;
        out.push({
          origin: "Empréstimo",
          group: "Empréstimos",
          description: `${loan.borrowerName} — Parcela ${p.installmentNumber}/${loan.installments}`,
          amount: Number(p.amount || 0),
          status: "paid",
        });
      }
    }

    // Sales / Veículos: parcelas com vencimento no dia
    for (const sale of sales) {
      const isVehicle = sale.businessType === "aluguel_veiculo";
      const dates = (sale.installmentDates ?? []) as string[];
      const amounts = (sale.installmentAmounts ?? []) as number[];
      const total = sale.installments || 1;
      const fallbackAmt = sale.installmentValue ?? (sale.total / Math.max(1, total));
      for (let i = 0; i < total; i++) {
        const dueDate = dates[i];
        if (!dueDate || dueDate !== date) continue;
        const installmentNum = i + 1;
        const amt = amounts[i] != null ? Number(amounts[i]) : Number(fallbackAmt);
        const isPaid = installmentNum <= sale.paidInstallments;
        out.push({
          origin: isVehicle ? "Aluguel" : "Venda",
          group: isVehicle ? "Veículos" : "Vendas",
          description: `${sale.customerName || sale.description} — Parcela ${installmentNum}/${total}`,
          amount: amt,
          status: isPaid ? "paid" : "pending",
        });
      }
    }

    return out.sort((a, b) => b.amount - a.amount);
  }, [loans, payments, installmentSchedules, sales, date]);

  // ---- EXPENSES (apenas empresariais) ----
  const expenseRows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    for (const e of expenses) {
      if (e.scope === "personal") continue; // somente despesas empresariais
      const matchesDue = e.dueDate === date && !e.paid;
      const matchesPaid = e.paid && e.paidDate === date;
      if (!matchesDue && !matchesPaid) continue;
      const totalInst = Number(e.installments || 1);
      const perInstallment = totalInst > 1 ? Number(e.amount || 0) / totalInst : Number(e.amount || 0);
      out.push({
        origin: "Empresa",
        description: e.description,
        amount: perInstallment,
        category: e.category,
        status: e.paid ? "paid" : "pending",
      });
    }

    // Credit card invoices due today (by due_day)
    const day = Number(date.slice(8, 10));
    const yyyymm = date.slice(0, 7);
    const invoiceTotals = getCardInvoiceTotalsForMonth(expenses, cards, openings, yyyymm);
    for (const card of cards) {
      if (!card.active) continue;
      if (card.dueDay !== day) continue;
      const inv = invoiceTotals.find((t) => t.card.id === card.id);
      const isPaid = !!(inv && inv.paid);
      const remaining = inv ? Math.max(0, inv.total - inv.paidTotal) : 0;
      out.push({
        origin: "Cartão",
        description: `Fatura ${card.nickname || card.bank} ${card.lastFour ? "•••• " + card.lastFour : ""}`.trim(),
        amount: isPaid ? (inv?.total ?? 0) : remaining,
        category: "Cartão de Crédito",
        status: isPaid ? "paid" : "pending",
      });
    }

    return out.sort((a, b) => b.amount - a.amount);
  }, [expenses, cards, openings, date]);

  const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
  const totalIncomePaid = incomeRows.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const totalIncomePending = incomeRows.filter(r => r.status === "pending").reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);
  const totalExpensePaid = expenseRows.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const totalExpensePending = expenseRows.filter(r => r.status === "pending").reduce((s, r) => s + r.amount, 0);
  const balance = totalIncome - totalExpense;
  const isNegative = balance < 0;

  const incomeGroups: RowGroup[] = ["Empréstimos", "Vendas", "Veículos"];
  const groupTotal = (g: RowGroup, status?: RowStatus) =>
    incomeRows.filter(r => r.group === g && (status ? r.status === status : true)).reduce((s, r) => s + r.amount, 0);


  const handleSendNow = async () => {
    if (!user) return;
    if (!linked) {
      toast.error("Conecte o Bot de Relatórios primeiro nas Configurações.");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-planning-summary", {
        body: { date },
      });
      if (error) throw error;
      if (!data?.sent) {
        const reason = data?.reason === "no_reports_link"
          ? "Conecte o Bot de Relatórios novamente nas Configurações."
          : "O backend respondeu, mas o Telegram não confirmou o envio.";
        toast.warning("Nada enviado", { description: reason });
        return;
      }
      toast.success("Relatório enviado para o Telegram!");
    } catch (e: any) {
      toast.error("Falha ao enviar", { description: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header / controls */}
      <Card no3d>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Data do relatório</Label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  aria-label="Dia anterior"
                  onClick={() => {
                    const d = new Date(date + "T00:00:00");
                    d.setDate(d.getDate() - 1);
                    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                  <NativeDatePicker
                    value={date}
                    onChange={(v) => { if (v) setDate(v); }}
                    className="h-10 justify-center font-normal"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  aria-label="Próximo dia"
                  onClick={() => {
                    const d = new Date(date + "T00:00:00");
                    d.setDate(d.getDate() + 1);
                    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          {!linked && (
            <p className="text-xs text-muted-foreground">
              💡 Conecte o Bot de Relatórios em <strong>Configurações → Notificações</strong> para receber este relatório no Telegram.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card no3d>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4 text-success" /> Receitas do dia
            </div>
            <p className="text-2xl font-bold text-success">{fmtBRL(totalIncome)}</p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
              <span className="text-success">✓ {fmtBRL(totalIncomePaid)}</span>
              <span>•</span>
              <span className="text-warning">⏳ {fmtBRL(totalIncomePending)}</span>
            </div>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingDown className="h-4 w-4 text-destructive" /> Despesas do dia
            </div>
            <p className="text-2xl font-bold text-destructive">{fmtBRL(totalExpense)}</p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
              <span className="text-success">✓ {fmtBRL(totalExpensePaid)}</span>
              <span>•</span>
              <span className="text-warning">⏳ {fmtBRL(totalExpensePending)}</span>
            </div>
          </CardContent>
        </Card>
        <Card no3d className={isNegative ? "border-destructive/40" : "border-success/40"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className={`h-4 w-4 ${isNegative ? "text-destructive" : "text-success"}`} /> Saldo previsto
            </div>
            <p className={`text-2xl font-bold ${isNegative ? "text-destructive" : "text-success"}`}>{fmtBRL(balance)}</p>
            {isNegative && (
              <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
                <AlertTriangle className="h-3 w-3" /> Saldo negativo previsto
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Income list — agrupado por origem (Empréstimos / Vendas / Veículos), separando Recebido e Pendente */}
      <Card no3d>
        <CardContent className="p-4 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-success" /> Receitas previstas
          </h3>
          {incomeRows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma receita prevista para este dia.</p>
          ) : (
            incomeGroups.map((g) => {
              const items = incomeRows.filter(r => r.group === g);
              if (items.length === 0) return null;
              const paid = items.filter(r => r.status === "paid");
              const pending = items.filter(r => r.status === "pending");
              return (
                <div key={g} className="space-y-2">
                  <div className="flex items-center justify-between border-b border-border/40 pb-1">
                    <p className="text-xs font-semibold uppercase tracking-wide">{g}</p>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-success">✓ {fmtBRL(groupTotal(g, "paid"))}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-warning">⏳ {fmtBRL(groupTotal(g, "pending"))}</span>
                    </div>
                  </div>
                  {[{ label: "PAGO", arr: paid, status: "paid" as const }, { label: "Pendente", arr: pending, status: "pending" as const }].map(({ label, arr, status }) => (
                    arr.length > 0 && (
                      <div key={label} className="space-y-1">
                        <p className="text-[10px] text-muted-foreground pl-1">{label}</p>
                        {arr.map((r, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-muted/50">
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                              <Badge variant={status === "paid" ? "default" : "outline"} className="text-[10px] shrink-0">{r.origin}</Badge>
                              <p className="text-sm truncate">{r.description}</p>
                            </div>
                            <p className={`text-sm font-semibold shrink-0 ${status === "paid" ? "text-success" : "text-warning"}`}>{fmtBRL(r.amount)}</p>
                          </div>
                        ))}
                      </div>
                    )
                  ))}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Expense list — apenas empresariais, separando Pago e Pendente */}
      <Card no3d>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" /> Despesas empresariais
          </h3>
          {expenseRows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma despesa empresarial para este dia.</p>
          ) : (
            [{ label: "Pago", status: "paid" as const }, { label: "Pendente", status: "pending" as const }].map(({ label, status }) => {
              const arr = expenseRows.filter(r => r.status === status);
              if (arr.length === 0) return null;
              return (
                <div key={label} className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  {arr.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={status === "paid" ? "default" : "outline"} className="text-[10px] shrink-0">{r.origin}</Badge>
                          {r.category && <Badge variant="secondary" className="text-[10px] shrink-0">{r.category}</Badge>}
                          <p className="text-sm truncate">{r.description}</p>
                        </div>
                      </div>
                      <p className={`text-sm font-semibold shrink-0 ${status === "paid" ? "text-success" : "text-destructive"}`}>
                        {r.amount > 0 ? fmtBRL(r.amount) : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Telegram schedule */}
      {linked && !prefsLoading && (
        <Card no3d>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Envio automático no Telegram</p>
                <p className="text-[11px] text-muted-foreground">
                  Configure até 3 horários para receber o planejamento do dia automaticamente.
                </p>
              </div>
              <Switch checked={prefs.enabled} onCheckedChange={(v) => save({ enabled: v })} />
            </div>

            {prefs.enabled && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">Referência do envio</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => save({ send_target: "today" })}
                      className={`text-xs px-3 py-2 rounded-md border transition-colors ${
                        prefs.send_target === "today"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      Dia atual
                    </button>
                    <button
                      type="button"
                      onClick={() => save({ send_target: "tomorrow" })}
                      className={`text-xs px-3 py-2 rounded-md border transition-colors ${
                        prefs.send_target === "tomorrow"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      Dia seguinte
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((slot) => {
                    const key = `send_time_${slot}` as "send_time_1" | "send_time_2" | "send_time_3";
                    return (
                      <div key={slot} className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Horário {slot}
                        </Label>
                        <Input
                          type="time"
                          value={prefs[key] || ""}
                          onChange={(e) => save({ [key]: e.target.value || null } as any)}
                          className="h-8 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Horários no fuso de Brasília. Deixe em branco para desativar um slot.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
