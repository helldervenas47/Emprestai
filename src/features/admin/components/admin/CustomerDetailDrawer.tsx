import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  User,
  Mail,
  Calendar,
  CreditCard,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Receipt,
  FileText,
  DollarSign,
  Shield,
  Layers,
  ArrowRight,
  TrendingUp,
  RotateCcw,
} from "lucide-react";
import { AdminCustomerItem } from "@/features/admin/hooks/useAdminCustomersSubscribers";
import { toast } from "sonner";

interface Props {
  customer: AdminCustomerItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtBRL(val?: number | null): string {
  if (val == null || isNaN(val)) return "R$ 0,00";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateBR(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDateShort(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function CustomerDetailDrawer({ customer, open, onOpenChange }: Props) {
  if (!customer) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">ATIVO</Badge>;
      case "trial":
        return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">EM TESTE</Badge>;
      case "past_due":
        return <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30">INADIMPLENTE</Badge>;
      case "canceled":
        return <Badge className="bg-destructive/15 text-destructive border-destructive/30">CANCELADO</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">EXPIRADO</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 bg-card text-card-foreground border-border">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                {customer.display_name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <span>{customer.display_name}</span>
                  {getStatusBadge(customer.status)}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {customer.email || customer.username || `ID: ${customer.user_id}`}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* 1. DADOS CADASTRAIS & CONTA */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-primary" />
              Dados do Usuário
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-muted/40 p-3 rounded-xl border border-border/60">
              <div>
                <span className="text-muted-foreground">Nome Completo:</span>
                <p className="font-semibold text-foreground mt-0.5">{customer.display_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">E-mail de Login:</span>
                <p className="font-semibold text-foreground mt-0.5 break-all">{customer.email || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Data de Cadastro:</span>
                <p className="font-semibold text-foreground mt-0.5">{fmtDateBR(customer.created_at)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">User ID (Sistema):</span>
                <div className="flex items-center gap-1 mt-0.5 font-mono text-[11px] text-foreground">
                  <span className="truncate">{customer.user_id}</span>
                  <button
                    onClick={() => handleCopy(customer.user_id, "User ID")}
                    className="p-1 hover:text-primary transition-colors"
                    title="Copiar ID"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 2. ASSINATURA & VIGÊNCIA */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Assinatura e Plano
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-muted/40 p-3 rounded-xl border border-border/60">
              <div>
                <span className="text-muted-foreground">Plano Atual:</span>
                <p className="font-bold text-foreground mt-0.5 text-sm">{customer.plan_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status da Conta:</span>
                <div className="mt-0.5">{getStatusBadge(customer.status)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Valor do Plano:</span>
                <p className="font-bold text-foreground mt-0.5 text-sm">{fmtBRL(customer.plan_price)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{customer.is_trial ? "Início do Teste:" : "Início da Vigência:"}</span>
                <p className="font-semibold text-foreground mt-0.5">{fmtDateShort(customer.period_start)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{customer.is_trial ? "Fim do Teste:" : "Próximo Vencimento:"}</span>
                <p className="font-semibold text-foreground mt-0.5">{fmtDateShort(customer.period_end)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Dias Restantes:</span>
                <p className={`font-black mt-0.5 text-sm ${customer.days_remaining > 5 ? "text-emerald-500" : customer.days_remaining > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                  {customer.days_remaining > 0 ? `${customer.days_remaining} dias` : "Expirado"}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-3 pt-1 border-t border-border/40 flex items-center justify-between">
                <span className="text-muted-foreground">Forma de Pagamento:</span>
                <span className="font-semibold text-foreground">{customer.payment_method}</span>
              </div>
            </div>
          </div>

          {/* 3. IDENTIFICADORES ASAAS */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
              Integração Asaas
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs bg-muted/40 p-3 rounded-xl border border-border/60">
              <div>
                <span className="text-muted-foreground">Customer ID:</span>
                <div className="flex items-center gap-1 mt-0.5 font-mono text-foreground">
                  <span>{customer.asaas_customer_id || "Não criado"}</span>
                  {customer.asaas_customer_id && (
                    <button
                      onClick={() => handleCopy(customer.asaas_customer_id!, "Customer ID")}
                      className="p-1 hover:text-primary transition-colors"
                      title="Copiar ID"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Subscription ID:</span>
                <div className="flex items-center gap-1 mt-0.5 font-mono text-foreground">
                  <span>{customer.asaas_subscription_id || "—"}</span>
                  {customer.asaas_subscription_id && (
                    <button
                      onClick={() => handleCopy(customer.asaas_subscription_id!, "Subscription ID")}
                      className="p-1 hover:text-primary transition-colors"
                      title="Copiar ID"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Status Asaas:</span>
                <p className="font-semibold text-foreground mt-0.5">
                  {customer.asaas_status ? (
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {customer.asaas_status}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* 4. HISTÓRICO FINANCEIRO CRONOLÓGICO */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5 text-primary" />
              Histórico Financeiro e Cobranças ({customer.orders.length})
            </h4>

            {customer.orders.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground bg-muted/20 rounded-xl border border-border/40">
                Nenhuma transação financeira registrada até o momento.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {customer.orders.map((ord) => {
                  const isPaid = ord.status === "paid";
                  const isRevoked = ord.status === "revoked";
                  const isPending = ord.status === "pending";

                  return (
                    <div
                      key={ord.id}
                      className="p-3 bg-muted/40 rounded-xl border border-border/60 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{ord.plan_name}</span>
                          <span className="text-muted-foreground">({ord.cycle})</span>
                          {isPaid ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                              PAGO
                            </Badge>
                          ) : isRevoked ? (
                            <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">
                              ESTORNADO
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                              PENDENTE
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Criado em: {fmtDateBR(ord.created_at)}
                          {ord.credited_at && ` • Pago em: ${fmtDateBR(ord.credited_at)}`}
                        </div>
                      </div>

                      <div className="text-right space-y-1">
                        <div className="font-black text-sm text-foreground">{fmtBRL(ord.amount)}</div>
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[10px] text-muted-foreground uppercase">{ord.checkout_kind}</span>
                          {ord.invoice_url && (
                            <a
                              href={ord.invoice_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline flex items-center gap-0.5 text-[11px]"
                            >
                              Fatura <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
