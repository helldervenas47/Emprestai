import { useEffect, useMemo, useState } from "react";
import { useAdminSubscriptions, type AdminSubRow, type AuditRow } from "@/features/admin/hooks/useAdminSubscriptions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RefreshCw, History, Ban, PlayCircle, Pause, RotateCw, CalendarClock, Gift, PencilLine, ShieldAlert, CalendarDays, ChevronDown, Unlock, ShieldOff, ShieldCheck } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { confirmWithScroll } from "@/lib/confirmWithScroll";

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
  const isSuspended = st === "suspended";
  const isBlocked = Boolean(u.is_blocked);
  return [
    { label: "Liberar plano", icon: <Gift className="h-4 w-4" />, onClick: () => setDialog({ kind: "grant_plan", user: u }) },
    { label: "Iniciar teste", icon: <PlayCircle className="h-4 w-4" />, onClick: () => setDialog({ kind: "start_trial", user: u }) },
    { label: "Prorrogar teste", icon: <CalendarClock className="h-4 w-4" />, onClick: () => setDialog({ kind: "extend_trial", user: u }) },
    { label: "Gerenciar dias", icon: <CalendarDays className="h-4 w-4 text-primary" />, onClick: () => setDialog({ kind: "set_days_remaining", user: u }) },
    { label: "Renovar", icon: <RotateCw className="h-4 w-4" />, onClick: () => setDialog({ kind: "renew", user: u }) },
    isSuspended
      ? { label: "Reativar", icon: <PlayCircle className="h-4 w-4 text-green-600" />, onClick: () => runAction({ action: "reactivate", target_user_id: u.user_id }) }
      : { label: "Suspender", icon: <Pause className="h-4 w-4" />, onClick: () => runAction({ action: "suspend", target_user_id: u.user_id }) },
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

function renderActions(
  u: AdminSubRow,
  st: string,
  setDialog: (d: { kind: ActionKind; user: AdminSubRow } | null) => void,
  runAction: (payload: Record<string, unknown>) => Promise<unknown>,
  openAudit: (u: AdminSubRow) => void,
) {
  return <RowActions size="md" actions={getActions(u, st, setDialog, runAction, openAudit)} />;
}

function LiberarButton({ actions }: { actions: ReturnType<typeof getActions> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="default" size="sm" className="w-full h-11 gap-2 font-medium">
          <Unlock className="h-4 w-4" />
          Liberar
          <ChevronDown className="h-4 w-4 ml-auto opacity-80" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[calc(100vw-3rem)] max-w-xs">
        {actions.map((a, i) => {
          const prev = actions[i - 1];
          const showSep = a.destructive && prev && !prev.destructive;
          return (
            <div key={i}>
              {showSep && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className={cn("py-2.5", a.destructive && "text-destructive focus:text-destructive")}
                onSelect={(e) => { e.preventDefault(); a.onClick(); }}
              >
                <span className="mr-2 inline-flex items-center">{a.icon}</span>
                {a.label}
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SubscriptionManagement() {
  const { rows, plans, loading, search, setSearch, statusFilter, setStatusFilter, fetchRows, runAction, fetchAudit } = useAdminSubscriptions();
  const [dialog, setDialog] = useState<{ kind: ActionKind; user: AdminSubRow } | null>(null);
  const [audit, setAudit] = useState<{ user: AdminSubRow; rows: AuditRow[]; loading: boolean } | null>(null);

  const openAudit = async (u: AdminSubRow) => {
    setAudit({ user: u, rows: [], loading: true });
    const r = await fetchAudit(u.user_id);
    setAudit({ user: u, rows: r, loading: false });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-primary" /> Assinaturas (admin)
            </CardTitle>
            <CardDescription>
              Libere planos, controle testes e gerencie o ciclo de vida das assinaturas manualmente. Todas as ações são auditadas.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="ml-1.5">Atualizar</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Buscar por nome ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-sm"
          />
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
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
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground border rounded-md">
            Nenhum usuário encontrado
          </div>
        )}

        {/* Mobile + Tablet: cards */}
        {!loading && rows.length > 0 && (
          <div className="lg:hidden space-y-2">
            {rows.map((u) => {
              const { planId, end, st } = resolveSubscriberState(u);
              const meta = STATUS_LABEL[st] ?? STATUS_LABEL.none;

              return (
                <div key={u.user_id} className="rounded-lg border bg-card p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-sm text-foreground truncate max-w-full">
                          {u.display_name || "—"}
                        </span>
                        <Badge variant={planBadgeVariant(planId)} className="text-[10px] px-2 py-0.5 shrink-0 whitespace-nowrap font-semibold">
                          {planLabel(planId)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{u.email}</div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <Badge variant={meta.variant as any} className="font-semibold">{meta.label}</Badge>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{daysLeftLabel(end)}</span>
                      {u.is_blocked && (
                        <Badge variant="destructive" className="gap-1 mt-1 text-[10px]"><ShieldOff className="h-3 w-3" />Bloqueado</Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Expira em</div>
                      <div className="font-medium text-foreground tabular-nums whitespace-nowrap">{fmtDate(end)}</div>
                      {u.subscription?.cancel_at_period_end && <div className="text-[10px] text-warning mt-0.5">Cancela ao expirar</div>}
                    </div>
                    <div>
                      <div className="text-muted-foreground">Origem</div>
                      <div className="font-medium text-foreground">
                        {u.subscription?.manual_override ? "Manual" : "Automático"}
                      </div>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-border/40">
                    <LiberarButton actions={getActions(u, st, setDialog, runAction, openAudit)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Desktop: table */}
        {!loading && rows.length > 0 && (
          <div className="hidden lg:block rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Override</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => {
                  const { planId, end, st } = resolveSubscriberState(u);
                  const meta = STATUS_LABEL[st] ?? STATUS_LABEL.none;

                  return (
                    <TableRow key={u.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium text-sm">
                          {u.display_name || "—"}
                          <Badge variant={planBadgeVariant(planId)} className="text-[10px] px-1.5 py-0">
                            {planLabel(planId)}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{u.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <Badge variant={meta.variant as any}>{meta.label}</Badge>
                          <span className="text-[11px] text-muted-foreground">{daysLeftLabel(end)}</span>
                          {u.is_blocked && (
                            <Badge variant="destructive" className="gap-1 text-[10px]"><ShieldOff className="h-3 w-3" />Bloqueado</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums whitespace-nowrap">
                        {fmtDate(end)}
                        {u.subscription?.cancel_at_period_end && <div className="text-[10px] text-warning mt-0.5">Cancela ao expirar</div>}
                      </TableCell>
                      <TableCell>
                        {u.subscription?.manual_override ? <Badge variant="secondary">Manual</Badge> : <span className="text-xs text-muted-foreground">Automático</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {renderActions(u, st, setDialog, runAction, openAudit)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>


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
  const currentDaysLeft = useMemo(
    () => daysBetween(user.subscription?.current_period_end),
    [user.subscription?.current_period_end],
  );
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(() => new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10));
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
    cancel: "Cancelar",
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
        Object.assign(base, { trial_days: trialDays, product_id: productId || undefined });
      } else if (kind === "extend_trial" || kind === "renew") {
        Object.assign(base, { trial_days: trialDays });
      } else if (kind === "set_days_remaining") {
        if (!Number.isFinite(trialDays) || trialDays < 0 || trialDays > 3650) {
          return toast.error("Informe uma quantidade válida (0 a 3650 dias)");
        }
        Object.assign(base, { trial_days: Math.floor(trialDays) });
      } else if (kind === "block_user") {
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
          <DialogDescription>{user.display_name} — {user.email}</DialogDescription>
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
                <Label>Plano do teste (opcional)</Label>
                <Input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="Ex.: Profissional" />
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
                  Expira em: <span className="font-medium">{fmtDate(user.subscription?.current_period_end)}</span>
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
              {kind === "block_user" ? "Motivo do bloqueio (obrigatório)" : "Observação (opcional)"}
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
