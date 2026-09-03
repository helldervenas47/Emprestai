import { useEffect, useMemo, useState } from "react";
import { formatDateBR } from "@/features/financial/lib/formatDateSafe";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, CheckCircle, AlertTriangle, Clock, Wallet, ListChecks } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Expense } from "@/types/loan";
import { todayInAppTz } from "@/lib/timezone";
import { supabase } from "@/integrations/supabase/userClient";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface ChildPayment {
  id: string;
  amount: number;
  paid_date: string | null;
  description: string;
  created_at: string;
  paid: boolean;
}

export function InstallmentSummaryDialog({ open, onOpenChange, expense }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = (v: number) => mask(fmt(v));
  const [history, setHistory] = useState<ChildPayment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !expense) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("expenses")
      .select("id, amount, paid_date, description, created_at, paid")
      .eq("parent_expense_id", expense.id)
      .order("paid_date", { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        if (cancelled) return;
        setHistory(
          ((data ?? []) as any[]).map((r) => ({
            id: r.id,
            amount: Number(r.amount),
            paid_date: r.paid_date,
            description: r.description,
            created_at: r.created_at,
            paid: !!r.paid,
          })),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, expense]);

  const summary = useMemo(() => {
    if (!expense || !expense.installments) return null;
    const total = expense.amount;
    const totalInstallments = expense.installments;
    // Source of truth: actually paid child rows. Fall back to parent counter only if no children loaded yet.
    const paidChildren = history.filter((h) => h.paid);
    const paidCount = history.length > 0
      ? paidChildren.length
      : (expense.paidInstallments ?? 0);
    const pendingCount = Math.max(totalInstallments - paidCount, 0);
    const installmentValue = total / totalInstallments;
    const paidFromHistory = paidChildren.reduce((s, h) => s + h.amount, 0);
    const paid = history.length > 0 ? paidFromHistory : installmentValue * paidCount;
    const pending = Math.max(total - paid, 0);
    const today = todayInAppTz();
    const fullyPaid = paidCount >= totalInstallments;
    const overdue = !fullyPaid && expense.dueDate < today;
    const dueToday = !fullyPaid && expense.dueDate === today;
    const status: "concluido" | "atrasado" | "vence_hoje" | "em_dia" = fullyPaid
      ? "concluido"
      : overdue
        ? "atrasado"
        : dueToday
          ? "vence_hoje"
          : "em_dia";
    const progress = totalInstallments > 0 ? (paidCount / totalInstallments) * 100 : 0;
    return {
      total,
      paid,
      pending,
      totalInstallments,
      paidCount,
      pendingCount,
      installmentValue,
      nextDueDate: fullyPaid ? null : expense.dueDate,
      status,
      progress,
      paidChildren,
    };
  }, [expense, history]);

  if (!expense || !summary) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" />
      </Dialog>
    );
  }

  const statusConfig = {
    concluido: {
      label: "Concluído",
      icon: CheckCircle,
      className: "bg-success/10 text-success border-success/20",
    },
    atrasado: {
      label: "Atrasado",
      icon: AlertTriangle,
      className: "bg-destructive/10 text-destructive border-destructive/20",
    },
    vence_hoje: {
      label: "Vence hoje",
      icon: Clock,
      className: "bg-warning/10 text-warning border-warning/30",
    },
    em_dia: {
      label: "Em dia",
      icon: CheckCircle,
      className: "bg-primary/10 text-primary border-primary/20",
    },
  } as const;

  const status = statusConfig[summary.status];
  const StatusIcon = status.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Wallet className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">{expense.description}</span>
          </DialogTitle>
          <DialogDescription>
            Resumo da despesa parcelada e histórico de pagamentos.
          </DialogDescription>
        </DialogHeader>

        {/* Status + pendente em destaque */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Valor pendente
            </span>
            <Badge variant="outline" className={`${status.className} gap-1`}>
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </Badge>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">
            {formatCurrency(summary.pending)}
          </p>
          <div className="mt-3 space-y-1">
            <Progress value={summary.progress} className="h-2" />
            <p className="text-[11px] text-muted-foreground">
              {summary.paidCount} de {summary.totalInstallments} parcelas pagas (
              {summary.progress.toFixed(0)}%)
            </p>
          </div>
        </div>

        {/* Grid de números */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Valor total
            </div>
            <div className="text-base font-semibold tabular-nums mt-0.5">
              {formatCurrency(summary.total)}
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Já pago
            </div>
            <div className="text-base font-semibold tabular-nums text-success mt-0.5">
              {formatCurrency(summary.paid)}
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Parcelas pagas
            </div>
            <div className="text-base font-semibold tabular-nums mt-0.5">
              {summary.paidCount}
              <span className="text-xs text-muted-foreground font-normal">
                {" "}
                / {summary.totalInstallments}
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Parcelas em aberto
            </div>
            <div className="text-base font-semibold tabular-nums mt-0.5">
              {summary.pendingCount}
            </div>
          </div>
        </div>

        {/* Próxima parcela */}
        {summary.nextDueDate ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Próxima parcela
              </div>
              <div className="text-sm font-semibold text-foreground">
                {formatCurrency(summary.installmentValue)}
                <span className="text-xs text-muted-foreground font-normal">
                  {" "}
                  • vence em{" "}
                  {formatDateBR(summary.nextDueDate, "dd/MM/yyyy")}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-success/30 bg-success/5 p-3 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-success shrink-0" />
            <p className="text-sm text-success font-medium">
              Todas as parcelas foram pagas. 🎉
            </p>
          </div>
        )}

        {/* Histórico */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-foreground">
              Histórico de pagamentos
            </h4>
          </div>
          {loading ? (
            <p className="text-xs text-muted-foreground py-3 text-center">Carregando…</p>
          ) : summary.paidChildren.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              Nenhum pagamento registrado ainda.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {summary.paidChildren.map((h, idx) => (
                <li key={h.id} className="flex items-center justify-between p-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      Parcela {idx + 1}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {h.paid_date
                        ? formatDateBR(h.paid_date, "dd/MM/yyyy")
                        : "—"}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-success">
                    {formatCurrency(h.amount)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
