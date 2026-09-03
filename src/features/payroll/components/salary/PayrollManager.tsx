import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Wallet, FileText, Lock, Unlock, RefreshCw, Trash2, CheckCircle2, Undo2, History, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/userClient";
import { useEmployees } from "@/features/payroll/hooks/useEmployees";
import { usePayrolls } from "@/features/payroll/hooks/usePayrolls";
import { useAppBranding } from "@/hooks/useAppBranding";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeGoalBonuses } from "@/features/piggyBanks/hooks/useEmployeeGoalBonuses";
import { useGoalBonusAwards } from "@/features/piggyBanks/hooks/useGoalBonusAwards";
import { useMonthlyScoreProvider } from "@/features/piggyBanks/hooks/useMonthlyScoreProvider";
import { generateBonusAwardsRecent, currentMonthKey } from "@/features/piggyBanks/lib/goalBonusEngine";
import { generatePayslipPdf } from "@/features/payroll/lib/payslipPdf";
import type { Payroll, SalaryItem } from "@/types/salary";
import { todayInAppTz } from "@/lib/timezone";
import { ExtraEarningDialog } from "./ExtraEarningDialog";
import { confirmWithScroll } from "@/lib/confirmWithScroll";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props { readOnly?: boolean }

export function PayrollManager({ readOnly }: Props) {
  const { employees } = useEmployees();
  const { payrolls, generateMonthlyBatch, payPayroll, reversePayrollPayment, reopenPayroll, closePayroll, deletePayroll, updatePayroll, splitLegacyExtraEarnings, reconcilePayrollExpenses } = usePayrolls();
  const { branding } = useAppBranding();
  const { dataOwnerId } = useAuth();
  const { bonuses } = useEmployeeGoalBonuses();
  const { awards, refresh: refreshAwards, markPaidByPayroll } = useGoalBonusAwards();
  const { getMonthlyScore, ready: scoreReady } = useMonthlyScoreProvider();
  const [monthOffset, setMonthOffset] = useState(0);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const competence = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return format(d, "yyyy-MM");
  }, [monthOffset]);

  const monthRows = useMemo(() => {
    return payrolls
      .filter((p) => p.competence === competence)
      .slice()
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  }, [payrolls, competence]);

  const totals = useMemo(() => {
    const gross = monthRows.reduce((s, p) => s + p.grossSalary + p.totalBenefits, 0);
    const net = monthRows.reduce((s, p) => s + p.netSalary, 0);
    const paid = monthRows.reduce((s, p) => s + p.paidAmount, 0);
    const pending = net - paid;
    return { gross, net, paid, pending };
  }, [monthRows]);

  // Auto-advance to next month after the current competence is fully paid.
  const autoAdvancedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (readOnly) return;
    if (monthRows.length === 0) return;
    if (totals.net <= 0) return;
    if (totals.pending > 0.01) return;
    if (autoAdvancedRef.current.has(competence)) return;
    autoAdvancedRef.current.add(competence);

    const d = parseISO(competence + "-01");
    d.setMonth(d.getMonth() + 1);
    const nextCompetence = format(d, "yyyy-MM");
    const nextExists = payrolls.some((p) => p.competence === nextCompetence);

    (async () => {
      if (!nextExists) {
        try {
          const created = await generateMonthlyBatch(employees, nextCompetence);
          if (created.length > 0) {
            toast.success(`Folha de ${format(d, "MMMM 'de' yyyy", { locale: ptBR })} gerada`);
          }
        } catch (e: any) {
          toast.error("Falha ao gerar próxima folha", { description: e?.message });
          return;
        }
      }
      setMonthOffset((m) => m + 1);
    })();
  }, [competence, monthRows.length, totals.net, totals.pending, payrolls, employees, generateMonthlyBatch, readOnly]);

  // Migração única: reorganiza folhas antigas que tinham proventos extras
  // (13º, férias, etc.) misturados, separando-os em contracheques próprios.
  const splitRanRef = useRef(false);
  useEffect(() => {
    if (readOnly) return;
    if (splitRanRef.current) return;
    if (payrolls.length === 0) return;
    const KEY = "payrolls.splitLegacyExtras.v2";
    if (localStorage.getItem(KEY)) { splitRanRef.current = true; return; }
    splitRanRef.current = true;
    (async () => {
      try {
        const res = await splitLegacyExtraEarnings();
        localStorage.setItem(KEY, new Date().toISOString());
        if (res.created > 0) {
          toast.success(`${res.created} provento(s) extra(s) reorganizado(s) em contracheques separados`);
        }
      } catch (e: any) {
        toast.error("Falha ao reorganizar folhas antigas", { description: e?.message });
      }
    })();
  }, [payrolls, readOnly, splitLegacyExtraEarnings]);

  // Reconciliação única por sessão: elimina duplicidades históricas de bônus
  // por metas (contracheque avulso + bônus já composto no salário) e
  // ressincroniza o valor das despesas vinculadas com o net_salary da folha.
  const reconcileRanRef = useRef(false);
  useEffect(() => {
    if (readOnly) return;
    if (reconcileRanRef.current) return;
    if (payrolls.length === 0) return;
    reconcileRanRef.current = true;
    (async () => {
      try {
        const res = await reconcilePayrollExpenses();
        if (res.removed > 0) {
          toast.success(`${res.removed} lançamento(s) duplicado(s) de bônus removido(s)`);
        }
      } catch (e: any) {
        console.warn("[payroll reconcile]", e?.message ?? e);
      }
    })();
  }, [payrolls, readOnly, reconcilePayrollExpenses]);

  // Roda o motor de bônus por metas para os últimos meses fechados assim
  // que todos os dados de metas estiverem carregados. Idempotente.
  // Reexecuta quando a pontuação dos meses fechados muda (dados chegando aos
  // poucos), evitando travar numa leitura de pontuação 0.
  const bonusEngineSigRef = useRef<string>("");
  useEffect(() => {
    if (readOnly) return;
    if (!dataOwnerId || !scoreReady) return;
    if (bonuses.length === 0) return;

    const cur = currentMonthKey();
    const [cy, cm] = cur.split("-").map(Number);
    const months = [1, 2, 3].map((i) => {
      const d = new Date(cy, cm - 1 - i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    const sig = months.map((m) => `${m}:${getMonthlyScore(m).toFixed(2)}`).join("|");
    if (sig === bonusEngineSigRef.current) return;
    bonusEngineSigRef.current = sig;

    (async () => {
      try {
        const created = await generateBonusAwardsRecent(dataOwnerId, bonuses, getMonthlyScore, 3);
        if (created > 0) {
          await refreshAwards();
          toast.success(`${created} bônus por metas gerado(s)`);
        }
      } catch (e: any) {
        console.warn("[goal bonus engine]", e?.message ?? e);
      }
    })();
  }, [readOnly, dataOwnerId, scoreReady, bonuses, getMonthlyScore, refreshAwards]);

  // Injeta o item "Bônus por Atingimento das Metas" nas folhas geradas
  // cujo payroll_month bate com a competência da folha. Idempotente.
  const injectedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (readOnly || awards.length === 0 || payrolls.length === 0) return;
    (async () => {
      for (const a of awards) {
        if (a.status !== "gerado") continue;
        if (a.payrollId) continue;
        if (injectedRef.current.has(a.id)) continue;

        const target = payrolls.find(
          (p) => p.employeeId === a.employeeId && p.competence === a.payrollMonth && (p.items?.earnings ?? []).length > 1,
        ) ?? payrolls.find(
          (p) => p.employeeId === a.employeeId && p.competence === a.payrollMonth,
        );
        if (!target) continue;
        if (target.closed || target.paidAmount > 0.01) continue;

        // Se já existe um contracheque avulso desse mesmo bônus (valor idêntico)
        // na competência, não injeta nada: o valor já está contabilizado uma vez.
        const standaloneExists = payrolls.some(
          (p) =>
            p.id !== target.id &&
            p.employeeId === a.employeeId &&
            p.competence === a.payrollMonth &&
            (p.items?.earnings ?? []).length === 1 &&
            Math.abs(Number((p.items?.earnings ?? [])[0]?.amount ?? 0) - a.bonusAmount) < 0.01,
        );


        // Regra de Composição: O bônus deve ser injetado APENAS se não houver
        // um item que já o represente (confere por kind, metadata ou label+valor)
        // e nenhum contracheque avulso equivalente na competência.
        const already = (target.items?.earnings ?? []).some(
          (it: SalaryItem) => 
            (it.kind === "goal_bonus" && it.meta?.awardId === a.id) ||
            (it.label === "Bônus por Atingimento das Metas" && Math.abs(Number(it.amount) - a.bonusAmount) < 0.01)
        );

        if (!already && !standaloneExists) {
          const newEarnings: SalaryItem[] = [
            ...(target.items?.earnings ?? []),
            {
              label: "Bônus por Atingimento das Metas",
              amount: a.bonusAmount,
              kind: "goal_bonus",
              meta: {
                awardId: a.id,
                referenceMonth: a.referenceMonth,
                scoreObtained: a.scoreObtained,
                minScore: a.minScoreRequired,
              },
            },
          ];

          // Recalcula o netSalary para a folha (gross + benefits - deductions)
          // O total de benefícios aumenta com o bônus injetado.
          const newTotalBenefits = newEarnings.reduce((s, i) => s + (Number(i.amount) || 0), 0) - Number(target.grossSalary);
          const newNet = Number(target.grossSalary) + newTotalBenefits - Number(target.totalDeductions);

          await updatePayroll(target.id, {
            items: { earnings: newEarnings, deductions: target.items?.deductions ?? [] },
            netSalary: newNet,
          });
        }

        await supabase
          .from("goal_bonus_awards" as any)
          .update({ payroll_id: target.id })
          .eq("id", a.id);
        
        injectedRef.current.add(a.id);
      }
    })();
  }, [awards, payrolls, readOnly, updatePayroll]);

  // Atualiza status do award para "pago" quando a folha correspondente é quitada.
  useEffect(() => {
    if (awards.length === 0) return;
    for (const a of awards) {
      if (a.status !== "gerado" || !a.payrollId) continue;
      const p = payrolls.find((pp) => pp.id === a.payrollId);
      if (p && p.status === "pago") {
        markPaidByPayroll(a.payrollId);
      }
    }
  }, [awards, payrolls, markPaidByPayroll]);

  const handleGenerate = async () => {
    const created = await generateMonthlyBatch(employees, competence);
    if (created.length === 0) toast.info("Folha já existe para todos os funcionários ativos.");
    else toast.success(`${created.length} folha(s) gerada(s)`);
  };

  const targetPayroll = monthRows.find((p) => p.id === payingId) ?? null;
  const targetEmployee = targetPayroll ? employees.find((e) => e.id === targetPayroll.employeeId) : null;


  return (
    <div className="space-y-4">
      <div className="relative flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMonthOffset((m) => m - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <button
            type="button"
            onClick={() => setMonthOffset(0)}
            title="Voltar para o mês atual"
            className="font-semibold text-lg capitalize min-w-[180px] text-center hover:text-primary transition-colors cursor-pointer"
          >
            {format(parseISO(competence + "-01"), "MMMM 'de' yyyy", { locale: ptBR })}
          </button>

          <Button variant="outline" size="icon" onClick={() => setMonthOffset((m) => m + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {!readOnly && (
          <>
            {/* Desktop inline button */}
            <div className="hidden sm:flex items-center gap-2 sm:absolute sm:right-0">
              <Button onClick={handleGenerate} variant="outline">
                <RefreshCw className="h-4 w-4" /> Gerar folha do mês
              </Button>
            </div>
            {/* Mobile FAB, stacked above the "+" button */}
            {createPortal(
              <button
                type="button"
                onClick={handleGenerate}
                aria-label="Gerar folha do mês"
                title="Gerar folha do mês"
                className="sm:hidden group fixed z-50 h-11 w-11 rounded-full flex items-center justify-center animate-fade-in touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200 hover:scale-105 active:scale-95 bg-background border border-border shadow-[0_8px_24px_-8px_hsl(var(--foreground)/0.3)] right-[calc(env(safe-area-inset-right)+16px)] bottom-[calc(env(safe-area-inset-bottom)+132px)]"
              >
                <RefreshCw className="h-5 w-5" strokeWidth={2.5} />
              </button>,
              document.body
            )}
            <ExtraEarningDialog />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total bruto" value={BRL(totals.gross)} />
        <StatCard label="Total líquido" value={BRL(totals.net)} />
        <StatCard label="Pago" value={BRL(totals.paid)} tone="success" />
        <StatCard label="Pendente" value={BRL(totals.pending)} tone={totals.pending > 0 ? "warn" : "muted"} />
      </div>

      <div className="space-y-2">
        {monthRows.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            Nenhuma folha gerada para esta competência.
          </CardContent></Card>
        )}
        {monthRows.map((p) => {
          const emp = employees.find((e) => e.id === p.employeeId);
          const remaining = Math.max(0, p.netSalary - p.paidAmount);
          return (
            <Card key={p.id}>
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{emp?.name ?? "Funcionário"}</p>
                    <StatusBadge status={p.status} />
                    {p.closed && <Badge variant="outline" className="text-[10px]"><Lock className="h-3 w-3" /> Fechada</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {emp?.role ?? ""}
                    {p.dueDate && (
                      <span className="ml-1">· Vencimento {format(parseISO(p.dueDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-right text-sm">
                  <div><div className="text-[10px] text-muted-foreground uppercase">Bruto</div><div>{BRL(p.grossSalary + p.totalBenefits)}</div></div>
                  <div><div className="text-[10px] text-muted-foreground uppercase">Desc.</div><div className="text-destructive">{BRL(p.totalDeductions)}</div></div>
                  <div><div className="text-[10px] text-muted-foreground uppercase">Líquido</div><div className="font-semibold">{BRL(p.netSalary)}</div></div>
                </div>
                <div className="flex flex-nowrap gap-1 md:gap-1.5 md:ml-2 justify-end w-full md:w-auto [&>button]:flex-1 md:[&>button]:flex-none">
                  {!readOnly && remaining > 0 && (
                    <Button data-mutation size="sm" onClick={() => setPayingId(p.id)}><Wallet className="h-3 w-3" /> <span className="hidden md:inline">Pagar</span></Button>
                  )}
                  {!readOnly && !p.closed && p.paidAmount <= 0.01 && (
                    <Button data-mutation size="sm" variant="outline" onClick={() => setEditingId(p.id)}>
                      <Pencil className="h-3 w-3" /> <span className="hidden md:inline">Editar</span>
                    </Button>
                  )}
                  {p.paidAmount > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setHistoryId(p.id)}>
                      <History className="h-3 w-3" /> <span className="hidden md:inline">Pagamentos</span>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => emp && generatePayslipPdf(p, emp, { brandName: branding.brand_name })}>
                    <FileText className="h-3 w-3" /> <span className="hidden md:inline">Contracheque</span>
                  </Button>
                  {!readOnly && (p.closed
                    ? <Button size="sm" variant="ghost" onClick={() => reopenPayroll(p)}><Unlock className="h-3 w-3" /></Button>
                    : <Button size="sm" variant="ghost" onClick={() => closePayroll(p)}><Lock className="h-3 w-3" /></Button>)}
                  {!readOnly && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      if (confirmWithScroll("Excluir esta folha?")) { await deletePayroll(p.id); toast.success("Folha excluída"); }
                    }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PayDialog
        open={!!targetPayroll}
        onOpenChange={(o) => !o && setPayingId(null)}
        payroll={targetPayroll}
        onConfirm={async (amount, date) => {
          if (!targetPayroll) return;
          await payPayroll(targetPayroll, targetEmployee ?? undefined, amount, { paidDate: date });
          toast.success("Pagamento registrado", { description: "Despesa criada na categoria Salários." });
          setPayingId(null);
        }}
      />

      <PaymentsHistoryDialog
        open={!!historyId}
        onOpenChange={(o) => !o && setHistoryId(null)}
        payrollId={historyId}
        readOnly={readOnly}
        onReverse={async (paymentId) => {
          await reversePayrollPayment(paymentId);
          toast.success("Pagamento estornado");
        }}
      />

      <EditPayrollDialog
        open={!!editingId}
        onOpenChange={(o) => !o && setEditingId(null)}
        payroll={monthRows.find((p) => p.id === editingId) ?? null}
        onSave={async (id, patch) => {
          await updatePayroll(id, patch);
          toast.success("Folha atualizada");
          setEditingId(null);
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: Payroll["status"] }) {
  const map = {
    pago: { label: "Pago", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
    parcial: { label: "Parcial", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    pendente: { label: "Pendente", className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
    atrasado: { label: "Atrasado", className: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
  } as const;
  const it = map[status];
  return <Badge variant="outline" className={`text-[10px] ${it.className}`}>{it.label}</Badge>;
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "warn" | "muted" }) {
  const color = tone === "success" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <Card><CardContent className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </CardContent></Card>
  );
}

function PayDialog({ open, onOpenChange, payroll, onConfirm }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payroll: Payroll | null;
  onConfirm: (amount: number, date: string) => void | Promise<void>;
}) {
  const remaining = payroll ? Math.max(0, payroll.netSalary - payroll.paidAmount) : 0;
  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState(todayInAppTz());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setAmount(String(remaining)); setSubmitting(false); }, [remaining, open]);

  const handleConfirm = async () => {
    if (submitting) return;
    const v = Number(amount) || 0;
    if (v <= 0) return;
    if (payroll && v > remaining + 0.01) {
      toast.error("Valor excede o restante a pagar");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(v, date);
    } catch (e: any) {
      toast.error("Falha ao registrar pagamento", { description: e?.message });
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Pagar salário</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">Restante: <span className="font-semibold">{BRL(remaining)}</span></div>
          <div><Label>Valor</Label><MoneyInput value={amount} onChange={setAmount} /></div>
          <div><Label>Data</Label><DatePickerField value={date} onChange={setDate} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button data-mutation onClick={handleConfirm} disabled={submitting || !Number(amount)}>
            <CheckCircle2 className="h-4 w-4" /> {submitting ? "Processando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PaymentRow {
  id: string;
  amount: number;
  paid_date: string;
  notes: string | null;
  created_at: string;
}

function PaymentsHistoryDialog({ open, onOpenChange, payrollId, readOnly, onReverse }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payrollId: string | null;
  readOnly?: boolean;
  onReverse: (paymentId: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!payrollId) return;
    setLoading(true);
    const { data } = await supabase
      .from("payroll_payments" as any)
      .select("id, amount, paid_date, notes, created_at")
      .eq("payroll_id", payrollId)
      .order("paid_date", { ascending: false });
    setRows(((data as any[]) ?? []) as PaymentRow[]);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, payrollId]);

  const handleReverse = async (id: string) => {
    if (busyId) return;
    if (!confirmWithScroll("Estornar este pagamento? A despesa e o lançamento no extrato vinculados serão removidos.")) return;
    setBusyId(id);
    try {
      await onReverse(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pagamentos registrados</DialogTitle>
          <DialogDescription>Estorne um pagamento para reverter a despesa e o lançamento no extrato.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {loading && <div className="text-sm text-muted-foreground">Carregando...</div>}
          {!loading && rows.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6">Nenhum pagamento.</div>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border rounded-md p-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{BRL(Number(r.amount))}</div>
                <div className="text-xs text-muted-foreground">
                  {format(parseISO(r.paid_date), "dd/MM/yyyy", { locale: ptBR })}
                </div>
                {r.notes && <div className="text-xs text-muted-foreground truncate">{r.notes}</div>}
              </div>
              {!readOnly && (
                <Button data-mutation size="sm" variant="outline" onClick={() => handleReverse(r.id)} disabled={busyId === r.id}>
                  <Undo2 className="h-3 w-3" /> {busyId === r.id ? "Estornando..." : "Estornar"}
                </Button>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPayrollDialog({ open, onOpenChange, payroll, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payroll: Payroll | null;
  onSave: (id: string, patch: Partial<Payroll>) => Promise<void>;
}) {
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<Payroll["items"]>({ earnings: [], deductions: [] });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payroll) {
      setDueDate(payroll.dueDate ?? "");
      setItems(payroll.items ?? { earnings: [], deductions: [] });
      setNotes(payroll.notes ?? "");
      setSaving(false);
    }
  }, [payroll]);

  if (!payroll) return null;

  const updateItem = (kind: "earnings" | "deductions", idx: number, patch: { label?: string; amount?: number }) => {
    setItems((prev) => ({
      ...prev,
      [kind]: prev[kind].map((it, i) => i === idx ? { ...it, ...patch } : it),
    }));
  };

  const handleSave = async () => {
    if (saving) return;
    if (!dueDate) { toast.error("Informe a data"); return; }
    setSaving(true);
    try {
      await onSave(payroll.id, { dueDate, items, notes });
    } catch (e: any) {
      toast.error("Falha ao salvar", { description: e?.message });
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Editar folha</DialogTitle>
          <DialogDescription>Altere a data de vencimento, valores e observações.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <Label>Data de vencimento</Label>
            <DatePickerField value={dueDate} onChange={setDueDate} />
          </div>
          {items.earnings.length > 0 && (
            <div className="space-y-2">
              <Label>Proventos</Label>
              {items.earnings.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px] gap-2">
                  <Input value={it.label} onChange={(e) => updateItem("earnings", i, { label: e.target.value })} />
                  <MoneyInput value={String(it.amount)} onChange={(v) => updateItem("earnings", i, { amount: Number(v) || 0 })} />
                </div>
              ))}
            </div>
          )}
          {items.deductions.length > 0 && (
            <div className="space-y-2">
              <Label>Descontos</Label>
              {items.deductions.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px] gap-2">
                  <Input value={it.label} onChange={(e) => updateItem("deductions", i, { label: e.target.value })} />
                  <MoneyInput value={String(it.amount)} onChange={(v) => updateItem("deductions", i, { amount: Number(v) || 0 })} />
                </div>
              ))}
            </div>
          )}
          <div>
            <Label>Observações</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button data-mutation onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
