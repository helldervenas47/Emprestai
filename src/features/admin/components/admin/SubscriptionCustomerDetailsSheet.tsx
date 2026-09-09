import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Gift,
  CalendarDays,
  RotateCw,
  PencilLine,
  PlayCircle,
  CalendarClock,
  Pause,
  ShieldOff,
  ShieldCheck,
  History,
  Ban,
  Mail,
  Layers,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import type { AdminSubRow } from "@/features/admin/hooks/useAdminSubscriptions";
import { confirmWithScroll } from "@/lib/confirmWithScroll";
import { cn } from "@/lib/utils";

export type ActionKind =
  | "grant_plan"
  | "set_dates"
  | "start_trial"
  | "extend_trial"
  | "renew"
  | "suspend"
  | "reactivate"
  | "cancel"
  | "update_note"
  | "clear_override"
  | "set_days_remaining"
  | "block_user"
  | "unblock_user";

interface Props {
  user: AdminSubRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (kind: ActionKind) => void;
  onQuickAction: (payload: Record<string, unknown>) => Promise<unknown>;
  onOpenAudit: () => void;
  resolvedState: {
    planId: string | undefined;
    end: string | null | undefined;
    st: string;
  };
  statusMeta: {
    label: string;
    variant: string;
    dotColor: string;
  };
  planLabel: string;
  planVariant: "default" | "secondary" | "outline" | "destructive";
  daysLeftText: string;
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function SubscriptionCustomerDetailsSheet({
  user,
  open,
  onOpenChange,
  onAction,
  onQuickAction,
  onOpenAudit,
  resolvedState,
  statusMeta,
  planLabel,
  planVariant,
  daysLeftText,
}: Props) {
  if (!user) return null;

  const isSuspended = resolvedState.st === "suspended" || Boolean(user.is_blocked);
  const isBlocked = Boolean(user.is_blocked);
  const isCanceled = resolvedState.st === "canceled";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0 flex flex-col gap-0 border-l border-border/60 bg-background">
        {/* Cabeçalho do Cliente */}
        <SheetHeader className="p-5 pb-4 border-b border-border/40 bg-card/60 backdrop-blur-sm sticky top-0 z-10 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", statusMeta.dotColor)} />
                <SheetTitle className="text-lg sm:text-xl font-bold text-foreground truncate max-w-full">
                  {user.display_name || user.email || "Cliente"}
                </SheetTitle>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                <Mail className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{user.email || "Sem e-mail cadastrado"}</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
              <Badge variant={statusMeta.variant as any} className="font-semibold text-xs px-2.5 py-0.5">
                {statusMeta.label}
              </Badge>
              {isBlocked && (
                <Badge variant="destructive" className="gap-1 text-[10px] font-semibold">
                  <ShieldOff className="h-3 w-3" /> Bloqueado
                </Badge>
              )}
            </div>
          </div>
          <SheetDescription className="sr-only">
            Detalhes e ações administrativas para a assinatura de {user.display_name || user.email}
          </SheetDescription>
        </SheetHeader>

        {/* Corpo com Informações e Ações */}
        <div className="p-5 space-y-6 flex-1">
          {/* Card de Resumo de Acesso */}
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" /> Informações do Plano
              </span>
              <Badge variant={planVariant} className="font-bold text-xs px-2.5 py-0.5">
                {planLabel}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-muted/30 p-3 rounded-xl border border-border/40 space-y-1">
                <span className="text-[11px] text-muted-foreground block font-medium">Dias Restantes</span>
                <span className="text-base sm:text-lg font-bold text-foreground block">
                  {daysLeftText || "0 dias restantes"}
                </span>
              </div>

              <div className="bg-muted/30 p-3 rounded-xl border border-border/40 space-y-1">
                <span className="text-[11px] text-muted-foreground block font-medium">Vencimento</span>
                <span className="text-base sm:text-lg font-bold text-foreground block tabular-nums">
                  {fmtDate(resolvedState.end)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40">
              <div>
                <span className="text-muted-foreground block text-[11px]">Início do período:</span>
                <span className="font-medium text-foreground">
                  {fmtDate(user.subscription?.current_period_start || user.trial_started_at)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Origem do acesso:</span>
                <span className="font-medium text-foreground">
                  {user.subscription?.manual_override ? "Override Manual" : "Asaas / Automático"}
                </span>
              </div>
            </div>

            {user.subscription?.cancel_at_period_end && (
              <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-600 dark:text-amber-400 text-xs font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Assinatura programada para cancelamento ao fim do período.</span>
              </div>
            )}
          </div>

          {/* Seção 1: Gestão Rápida de Dias & Plano */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 px-0.5">
              <CalendarDays className="h-3.5 w-3.5 text-primary" /> Gerenciamento de Acesso
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                variant="default"
                className="h-10 justify-start gap-2 text-xs font-semibold rounded-xl"
                onClick={() => onAction("set_days_remaining")}
              >
                <CalendarDays className="h-4 w-4" />
                <span>Gerenciar Dias (+/-)</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-10 justify-start gap-2 text-xs font-medium rounded-xl border-border/60 hover:bg-muted/60"
                onClick={() => onAction("grant_plan")}
              >
                <Gift className="h-4 w-4 text-primary" />
                <span>Liberar Plano</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-10 justify-start gap-2 text-xs font-medium rounded-xl border-border/60 hover:bg-muted/60"
                onClick={() => onAction("renew")}
              >
                <RotateCw className="h-4 w-4 text-primary" />
                <span>Renovar Assinatura</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-10 justify-start gap-2 text-xs font-medium rounded-xl border-border/60 hover:bg-muted/60"
                onClick={() => onAction("set_dates")}
              >
                <PencilLine className="h-4 w-4 text-primary" />
                <span>Editar Datas</span>
              </Button>
            </div>
          </div>

          {/* Seção 2: Testes Gratuitos */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 px-0.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Período de Testes
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 justify-start gap-2 text-xs font-medium rounded-xl border-border/60 hover:bg-muted/60"
                onClick={() => onAction("start_trial")}
              >
                <PlayCircle className="h-4 w-4 text-primary" />
                <span>Iniciar Teste Grátis</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-10 justify-start gap-2 text-xs font-medium rounded-xl border-border/60 hover:bg-muted/60"
                onClick={() => onAction("extend_trial")}
              >
                <CalendarClock className="h-4 w-4 text-primary" />
                <span>Prorrogar Teste</span>
              </Button>
            </div>
          </div>

          {/* Seção 3: Controle, Segurança & Auditoria */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 px-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Status & Segurança
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {isSuspended ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 justify-start gap-2 text-xs font-medium rounded-xl border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                  onClick={() => onQuickAction({ action: "reactivate", target_user_id: user.user_id })}
                >
                  <PlayCircle className="h-4 w-4 text-emerald-600" />
                  <span>Reativar Acesso</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 justify-start gap-2 text-xs font-medium rounded-xl border-border/60 hover:bg-muted/60"
                  onClick={() => onAction("suspend")}
                >
                  <Pause className="h-4 w-4 text-amber-500" />
                  <span>Suspender Assinatura</span>
                </Button>
              )}

              {isBlocked ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 justify-start gap-2 text-xs font-medium rounded-xl border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                  onClick={() => {
                    if (confirmWithScroll(`Desbloquear acesso de ${user.display_name || user.email}?`)) {
                      onQuickAction({ action: "unblock_user", target_user_id: user.user_id });
                    }
                  }}
                >
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Desbloquear Usuário</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 justify-start gap-2 text-xs font-medium rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => onAction("block_user")}
                >
                  <ShieldOff className="h-4 w-4 text-destructive" />
                  <span>Bloquear Usuário</span>
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                className="h-10 justify-start gap-2 text-xs font-medium rounded-xl border-border/60 hover:bg-muted/60 col-span-1 sm:col-span-2"
                onClick={onOpenAudit}
              >
                <History className="h-4 w-4 text-primary" />
                <span>Ver Histórico de Auditoria</span>
              </Button>
            </div>
          </div>

          {/* Seção 4: Zona de Risco */}
          {!isCanceled && (
            <div className="pt-2 border-t border-border/40 space-y-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full h-10 justify-start gap-2 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl"
                onClick={() => {
                  if (confirmWithScroll(`Tem certeza que deseja cancelar a assinatura de ${user.display_name || user.email}?`)) {
                    onQuickAction({ action: "cancel", target_user_id: user.user_id });
                  }
                }}
              >
                <Ban className="h-4 w-4" />
                <span>Cancelar Assinatura</span>
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
