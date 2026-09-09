import { useEffect, useMemo, useState } from "react";
import { useAdminSubscriptions, type AdminSubRow, type AuditRow } from "@/features/admin/hooks/useAdminSubscriptions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RefreshCw, ShieldAlert, ChevronRight, ShieldOff } from "lucide-react";
import { toast } from "sonner";

type ActionKind = "grant_plan" | "set_dates" | "start_trial" | "extend_trial" | "renew" | "suspend" | "reactivate" | "cancel" | "update_note" | "clear_override" | "set_days_remaining" | "block_user" | "unblock_user";

const STATUS_LABEL: Record<string, { label: string; variant: "success-solid" | "default" | "secondary" | "destructive-solid" | "outline" }> = {
  active: { label: "Ativa", variant: "success-solid" },
  trialing: { label: "Em teste", variant: "default" },
  suspended: { label: "Suspensa", variant: "destructive-solid" },
  canceled: { label: "Cancelada", variant: "destructive-solid" },
  past_due: { label: "Em atraso", variant: "secondary" },
  expired: { label: "Expirada", variant: "destructive-solid" },
  none: { label: "Sem plano", variant: "outline" },
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

function daysBetween(a?: string | null, b?: Date | string) {
  if (!a) return 0;
  const end = new Date(a).getTime();
  const start = b ? new Date(b).getTime() : Date.now();
  return Math.max(0, Math.ceil((end - start) / 86400_000));
}

function planBadgeVariant(planId: string | undefined): "default" | "secondary" | "outline" | "destructive" {
  if (planId === "empresarial_plan" || planId === "empresarial") return "default";
  if (planId === "profissional_plan" || planId === "profissional") return "secondary";
  if (planId === "basico_plan" || planId === "básico" || planId === "basico") return "outline";
  return "outline";
}

function planLabel(planId: string | undefined): string {
  if (planId === "teste_gratis_plan" || planId === "teste_gratis" || planId === "teste") return "Teste Grátis";
  if (planId === "empresarial_plan" || planId === "empresarial") return "Empresarial";
  if (planId === "profissional_plan" || planId === "profissional") return "Profissional";
  if (planId === "basico_plan" || planId === "básico" || planId === "basico") return "Básico";
  return "Free";
}

function resolveSubscriberState(u: AdminSubRow) {
  let planId = u.subscription?.product_id;
  let end = u.subscription?.current_period_end;
  let st = u.subscription?.status || "none";

  const now = new Date().toISOString();
  const trialDays = u.trial_days_override ?? 7;
  const trialEnd = u.trial_started_at
    ? new Date(new Date(u.trial_started_at).getTime() + trialDays * 86400000).toISOString()
    : null;
  const isTrialActive = trialEnd ? trialEnd > now : false;
  const isPaidPeriodActive = end ? end > now : false;

  // Se a conta ainda possui dias válidos (período pago ou teste grátis ativo),
  // ela NÃO deve ser considerada em atraso (past_due), mesmo com cobrança gerada e não paga.
  if (isPaidPeriodActive && st !== "canceled" && st !== "suspended") {
    st = "active";
  } else if (isTrialActive && st !== "active") {
    st = "trialing";
    if (u.trial_plan_name) planId = u.trial_plan_name.toLowerCase();
    end = trialEnd;
  } else if (st === "active" || st === "trialing") {
    if (end && end <= now) {
      st = "expired";
    }
  } else if (st === "none" && trialEnd && trialEnd <= now) {
    st = "expired";
  }

  return { planId, end, st };
}

function daysLeftLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "expirada";
  const days = Math.ceil(ms / 86400_000);
  if (days > 1) return `${days} dias restantes`;
  const hours = Math.max(1, Math.ceil(ms / 3600_000));
  return `${hours}h restantes`;
}

function getActions(
  u: AdminSubRow,
  st: string,
  setDialog: (d: { kind: ActionKind; user: AdminSubRow } | null) => void,
  runAction: (payload: Record<string, unknown>) => Promise<unknown>,
  openAudit: (u: AdminSubRow) => void,
) {
  const isSuspended = st === "suspended" || Boolean(u.is_blocked);
  const isBlocked = Boolean(u.is_blocked);
  return [
    { label: "Liberar plano", icon: <Gift className="h-4 w-4" />, onClick: () => setDialog({ kind: "grant_plan", user: u }) },
    { label: "Iniciar teste", icon: <PlayCircle className="h-4 w-4" />, onClick: () => setDialog({ kind: "start_trial", user: u }) },
    { label: "Prorrogar teste", icon: <CalendarClock className="h-4 w-4" />, onClick: () => setDialog({ kind: "extend_trial", user: u }) },
    { label: "Gerenciar dias", icon: <CalendarDays className="h-4 w-4 text-primary" />, onClick: () => setDialog({ kind: "set_days_remaining", user: u }) },
    { label: "Renovar", icon: <RotateCw className="h-4 w-4" />, onClick: () => setDialog({ kind: "renew", user: u }) },
    isSuspended
      ? { label: "Reativar", icon: <PlayCircle className="h-4 w-4 text-green-600" />, onClick: () => runAction({ action: "reactivate", target_user_id: u.user_id }) }
      : { label: "Suspender", icon: <Pause className="h-4 w-4" />, onClick: () => setDialog({ kind: "suspend", user: u }) },
    { label: "Editar datas", icon: <PencilLine className="h-4 w-4" />, onClick: () => setDialog({ kind: "set_dates", user: u }) },
    isBlocked
      ? {
          label: "Desbloquear usuário",
          icon: <ShieldCheck className="h-4 w-4 text-green-600" />,
          onClick: () => {
            if (confirmWithScroll(`Desbloquear acesso de ${u.display_name || u.email}?`)) {
              runAction({ action: "unblock_user", target_user_id: u.user_id });
            }
          },
        }
      : {
          label: "Bloquear usuário",
          icon: <ShieldOff className="h-4 w-4 text-destructive" />,
          destructive: true,
          onClick: () => setDialog({ kind: "block_user", user: u }),
        },
    {
      label: "Cancelar",
      icon: <Ban className="h-4 w-4" />,
      destructive: true,
      onClick: () => {
        if (confirmWithScroll(`Cancelar assinatura de ${u.display_name}?`)) runAction({ action: "cancel", target_user_id: u.user_id });
      },
    },
    { label: "Histórico", icon: <History className="h-4 w-4" />, onClick: () => openAudit(u) },
  ];
}

import { BillingHealthCard } from "./BillingHealthCard";
import {
  SubscriptionCustomerDetailsSheet,
  type ActionKind,
} from "./SubscriptionCustomerDetailsSheet";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; dot: string; dotColor: string }
> = {
  active: { label: "Ativa", variant: "default", dot: "🟢", dotColor: "bg-emerald-500" },
  trialing: { label: "Em teste", variant: "secondary", dot: "🟡", dotColor: "bg-amber-500" },
  suspended: { label: "Suspensa", variant: "destructive", dot: "🔴", dotColor: "bg-rose-500" },
  canceled: { label: "Cancelada", variant: "destructive", dot: "🔴", dotColor: "bg-rose-500" },
  past_due: { label: "Em atraso", variant: "secondary", dot: "🟠", dotColor: "bg-orange-500" },
  expired: { label: "Expirada", variant: "destructive", dot: "🔴", dotColor: "bg-rose-500" },
  none: { label: "Sem plano", variant: "outline", dot: "⚪", dotColor: "bg-muted-foreground" },
};

function getDaysRemainingText(iso: string | null | undefined, status: string): string {
  if (status === "expired" || status === "canceled" || status === "suspended") {
    return "0 dias restantes";
  }
  if (!iso) return "0 dias restantes";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "0 dias restantes";
  const days = Math.ceil(ms / 86400_000);
  if (days > 1) return `${days} dias restantes`;
  if (days === 1) return "1 dia restante";
  const hours = Math.max(1, Math.ceil(ms / 3600_000));
  return `${hours}h restantes`;
}

export function SubscriptionManagement() {
  const {
    page,
    setPage,
    total,
    rows,
    plans,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    fetchRows,
    runAction,
    fetchAudit,
  } = useAdminSubscriptions();

  const [dialog, setDialog] = useState<{ kind: ActionKind; user: AdminSubRow } | null>(null);
  const [audit, setAudit] = useState<{ user: AdminSubRow; rows: AuditRow[]; loading: boolean } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Mantém o usuário selecionado sincronizado com a lista atual
  const selectedUser = useMemo(
    () => rows.find((r) => r.user_id === selectedUserId) ?? null,
    [rows, selectedUserId],
  );

  const selectedResolved = useMemo(
    () => (selectedUser ? resolveSubscriberState(selectedUser) : null),
    [selectedUser],
  );

  const openAudit = async (u: AdminSubRow) => {
    setAudit({ user: u, rows: [], loading: true });
    const r = await fetchAudit(u.user_id);
    setAudit({ user: u, rows: r, loading: false });
  };

  const handleAction = (kind: ActionKind) => {
    if (!selectedUser) return;
    setDialog({ kind, user: selectedUser });
  };

  const handleQuickAction = async (payload: Record<string, unknown>) => {
    await runAction(payload);
    await fetchRows();
  };

  return (
    <div className="space-y-4">
      <BillingHealthCard />
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" /> Assinaturas e Acesso (Admin)
              </CardTitle>
              <CardDescription className="text-xs">
                Clique no cliente para abrir a ficha completa e gerenciar plano, testes, datas e ações manuais.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRows}
              disabled={loading}
              className="rounded-xl h-8 text-xs gap-1.5 self-start sm:self-auto shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
              <span>Atualizar</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Buscar cliente por nome ou e-mail"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-sm h-9 text-xs rounded-xl"
            />
            <Select
              value={statusFilter || "all"}
              onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-full sm:w-[180px] h-9 text-xs rounded-xl">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="trialing">Em teste</SelectItem>
                <SelectItem value="suspended">Suspensa</SelectItem>
                <SelectItem value="canceled">Cancelada</SelectItem>
                <SelectItem value="past_due">Em atraso</SelectItem>
                <SelectItem value="none">Sem plano</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> Carregando assinaturas…
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="text-center py-10 text-xs text-muted-foreground border border-dashed rounded-2xl bg-muted/20">
              Nenhum cliente encontrado com os filtros aplicados.
            </div>
          )}

          {/* Lista Simplificada e Escaneável de Clientes (Todas as Resoluções) */}
          {!loading && rows.length > 0 && (
            <div className="space-y-2">
              {rows.map((u) => {
                const { planId, end, st } = resolveSubscriberState(u);
                const meta = STATUS_CONFIG[st] ?? STATUS_CONFIG.none;
                const daysRemaining = getDaysRemainingText(end, st);

                return (
                  <div
                    key={u.user_id}
                    onClick={() => setSelectedUserId(u.user_id)}
                    className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-border/50 bg-card hover:bg-muted/40 hover:border-border transition-all cursor-pointer group shadow-sm active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-bold text-sm sm:text-base text-foreground truncate group-hover:text-primary transition-colors">
                        {u.display_name || u.email || "Cliente sem nome"}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                        <span className="text-xs">{meta.dot}</span>
                        <span className="font-medium text-foreground/80">{meta.label}</span>
                        <span className="text-muted-foreground/60">·</span>
                        <span className="tabular-nums text-muted-foreground font-medium">{daysRemaining}</span>
                        {u.is_blocked && (
                          <>
                            <span className="text-muted-foreground/60">·</span>
                            <Badge variant="destructive" className="h-4 px-1.5 text-[9px] gap-0.5 font-bold">
                              <ShieldOff className="h-2.5 w-2.5" /> Bloqueado
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pl-3 shrink-0 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all">
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>

        <div className="flex items-center justify-between gap-3 p-4 border-t border-border/40">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl h-8 text-xs"
            disabled={loading || page === 0}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums font-medium" aria-live="polite">
            Página {page + 1} · {total} clientes
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl h-8 text-xs"
            disabled={loading || (page + 1) * 100 >= total}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </div>

        {/* Sheet Lateral / Gaveta de Detalhes do Cliente */}
        {selectedUser && selectedResolved && (
          <SubscriptionCustomerDetailsSheet
            user={selectedUser}
            open={Boolean(selectedUserId)}
            onOpenChange={(open) => {
              if (!open) setSelectedUserId(null);
            }}
            onAction={handleAction}
            onQuickAction={handleQuickAction}
            onOpenAudit={() => openAudit(selectedUser)}
            resolvedState={selectedResolved}
            statusMeta={STATUS_CONFIG[selectedResolved.st] ?? STATUS_CONFIG.none}
            planLabel={planLabel(selectedResolved.planId)}
            planVariant={planBadgeVariant(selectedResolved.planId)}
            daysLeftText={getDaysRemainingText(selectedResolved.end, selectedResolved.st)}
          />
        )}
      {dialog && (
        <ActionDialog
          key={dialog.kind + dialog.user.user_id}
          kind={dialog.kind}
          user={dialog.user}
          plans={plans}
          fetchAudit={fetchAudit}
          onClose={() => setDialog(null)}
          onSubmit={async (payload) => { await runAction(payload); setDialog(null); }}
        />
      )}

      {audit && (
        <Dialog open onOpenChange={(o) => { if (!o) setAudit(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Histórico de alterações</DialogTitle>
              <DialogDescription>{audit.user.display_name} — {audit.user.email}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto space-y-2">
              {audit.loading && <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin inline" /></div>}
              {!audit.loading && audit.rows.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">Sem histórico ainda.</div>
              )}
              {audit.rows.map((r) => (
                <div key={r.id} className="rounded border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.action}</span>
                    <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  {r.note && <div className="mt-1 text-muted-foreground">Nota: {r.note}</div>}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-muted-foreground">ver diff</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-all bg-muted/50 rounded p-1">{JSON.stringify({ before: r.before, after: r.after }, null, 2)}</pre>
                  </details>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
      </Card>
    </div>
  );
}

function ActionDialog({ kind, user, plans, fetchAudit, onClose, onSubmit }: {
  kind: ActionKind;
  user: AdminSubRow;
  plans: { id: string; name: string; trial_days: number }[];
  fetchAudit: (userId: string) => Promise<AuditRow[]>;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const resolved = useMemo(() => resolveSubscriberState(user), [user]);
  const currentDaysLeft = useMemo(
    () => daysBetween(resolved.end),
    [resolved.end],
  );
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [startDate, setStartDate] = useState<string>(() => (kind === "set_dates" && user.subscription?.current_period_start ? user.subscription.current_period_start : new Date().toISOString()).slice(0, 10));
  const [endDate, setEndDate] = useState<string>(() => (kind === "set_dates" && resolved.end ? resolved.end : new Date(Math.max(Date.now() + 30 * 86400_000, Date.parse(resolved.end ?? "") || 0)).toISOString()).slice(0, 10));
  const [trialDays, setTrialDays] = useState<number>(kind === "set_days_remaining" ? currentDaysLeft : 7);
  const [productId, setProductId] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [lastChange, setLastChange] = useState<AuditRow | null>(null);

  useEffect(() => {
    if (kind !== "set_days_remaining") return;
    let alive = true;
    fetchAudit(user.user_id).then((rows) => {
      if (!alive) return;
      const last = rows.find((r) => r.action === "set_days_remaining"
        || r.action === "extend_trial" || r.action === "start_trial"
        || r.action === "renew" || r.action === "grant_plan" || r.action === "set_dates");
      setLastChange(last ?? null);
    });
    return () => { alive = false; };
  }, [kind, user.user_id, fetchAudit]);

  const title = useMemo(() => ({
    grant_plan: "Liberar plano",
    set_dates: "Editar datas da assinatura",
    start_trial: "Iniciar período de teste",
    extend_trial: "Prorrogar teste (+/- dias)",
    renew: "Renovar assinatura",
    suspend: "Suspender",
    reactivate: "Reativar",
    cancel: "Encerrar acesso ao fim do período",
    update_note: "Atualizar observação",
    clear_override: "Remover override manual",
    set_days_remaining: "Gerenciamento de dias de acesso",
    block_user: "Bloquear usuário",
    unblock_user: "Desbloquear usuário",
  } as Record<ActionKind, string>)[kind], [kind]);

  const handle = async () => {
    setSubmitting(true);
    try {
      const base: Record<string, unknown> = { action: kind, target_user_id: user.user_id, note: note || undefined };
      if (kind === "grant_plan") {
        if (!planId) return toast.error("Selecione um plano");
        Object.assign(base, {
          plan_id: planId,
          start_date: new Date(startDate).toISOString(),
          end_date: new Date(endDate).toISOString(),
        });
      } else if (kind === "set_dates") {
        Object.assign(base, {
          start_date: new Date(startDate).toISOString(),
          end_date: new Date(endDate).toISOString(),
        });
      } else if (kind === "start_trial") {
        if (trialDays < 0) return toast.error("Dias inválidos");
        Object.assign(base, { trial_days: trialDays, plan_id: planId });
      } else if (kind === "extend_trial" || kind === "renew") {
        Object.assign(base, { trial_days: trialDays });
      } else if (kind === "set_days_remaining") {
        if (!Number.isFinite(trialDays) || trialDays < 0 || trialDays > 3650) {
          return toast.error("Informe uma quantidade válida (0 a 3650 dias)");
        }
        Object.assign(base, { trial_days: Math.floor(trialDays) });
      } else if (kind === "block_user" || kind === "suspend") {
        if (!note.trim()) return toast.error("Informe o motivo do bloqueio");
      }
      await onSubmit(base);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{user.display_name} — {user.email}. Esta alteração controla o acesso ao app. Cobranças e estornos no Asaas são gerenciados separadamente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {kind === "grant_plan" && (
            <>
              <div>
                <Label>Plano</Label>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Início</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
                <div><Label>Fim</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
              </div>
            </>
          )}
          {kind === "set_dates" && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Início</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              <div><Label>Fim</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            </div>
          )}
          {kind === "start_trial" && (
            <>
              <div>
                <Label>Plano do teste</Label>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Dias de teste</Label><Input type="number" min={0} max={365} value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} /></div>
            </>
          )}
          {kind === "extend_trial" && (
            <div><Label>Adicionar/subtrair dias (use negativo para reduzir)</Label>
              <Input type="number" value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} />
            </div>
          )}
          {kind === "renew" && (
            <div><Label>Renovar por (dias)</Label>
              <Input type="number" min={1} max={3650} value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} />
            </div>
          )}
          {kind === "set_days_remaining" && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                <div className="text-xs text-muted-foreground">Dias restantes atuais</div>
                <div className="text-2xl font-semibold tabular-nums">{currentDaysLeft} <span className="text-sm font-normal text-muted-foreground">dias</span></div>
                <div className="text-xs text-muted-foreground">
                  Expira em: <span className="font-medium">{fmtDate(resolved.end)}</span>
                </div>
              </div>
              <div>
                <Label>Nova quantidade total de dias restantes</Label>
                <Input
                  type="number"
                  min={0}
                  max={3650}
                  value={trialDays}
                  onChange={(e) => setTrialDays(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  A validade será definida como <span className="font-medium">hoje + {Number.isFinite(trialDays) ? trialDays : 0} dias</span>. Use 0 para expirar imediatamente.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setTrialDays(Math.max(0, (Number(trialDays) || 0) - 1))}>-1 dia</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setTrialDays(Math.max(0, (Number(trialDays) || 0) - 7))}>-7 dias</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setTrialDays((Number(trialDays) || 0) + 7)}>+7 dias</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setTrialDays((Number(trialDays) || 0) + 30)}>+30 dias</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setTrialDays(currentDaysLeft)}>Restaurar atual</Button>
              </div>
              {lastChange && (
                <div className="text-xs text-muted-foreground border-t pt-2">
                  Última alteração: <span className="font-medium">{lastChange.action}</span> em {new Date(lastChange.created_at).toLocaleString("pt-BR")}
                  {lastChange.note ? ` — "${lastChange.note}"` : ""}
                </div>
              )}
            </div>
          )}
          {kind === "block_user" && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <ShieldOff className="h-4 w-4" /> Bloqueio total de acesso
              </div>
              <p className="text-xs text-muted-foreground">
                O usuário perde acesso a todas as abas, exceto a aba Sistema. Todas as escritas (criar, editar, excluir, importar/exportar) ficam bloqueadas em toda a API. Os dados permanecem preservados e o acesso é restaurado ao desbloquear.
              </p>
            </div>
          )}
          <div>
            <Label>
              {(kind === "block_user" || kind === "suspend") ? "Motivo do bloqueio (obrigatório)" : "Observação (opcional)"}
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={kind === "block_user" ? 3 : 2}
              placeholder={kind === "block_user" ? "Ex.: Inadimplência, violação de termos, solicitação do titular…" : ""}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handle} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
