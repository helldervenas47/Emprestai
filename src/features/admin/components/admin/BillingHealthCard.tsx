import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Activity, AlertTriangle, CheckCircle2, XCircle, Clock, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface BillingHealthData {
  overall_health: "OK" | "DEGRADED" | "ERROR";
  environment: string;
  database: string;
  asaas_config: string;
  reconciliation: {
    status: string;
    is_stale: boolean;
    last_run_at: string | null;
    last_duration_ms: number | null;
    last_orders_checked: number;
    last_failed_count: number;
  };
  metrics: {
    pending_orders: number;
    review_orders: number;
    stuck_pending_orders_48h: number;
    webhooks_processed_24h: number;
    webhooks_errors_24h: number;
    reconciliation_failures_24h: number;
  };
  inconsistencies: Array<{
    code: string;
    severity: "CRITICAL" | "WARNING" | "INFO";
    details: string;
    order_id?: string;
    user_id?: string;
    payment_id?: string;
  }>;
  inconsistencies_count: number;
  checked_at: string;
}

export function BillingHealthCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BillingHealthData | null>(null);

  const fetchHealth = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc("billing_health_check", {
        _admin: user.id,
      });
      if (error) throw error;
      setData(res as BillingHealthData);
    } catch (err: any) {
      toast.error("Erro ao carregar saúde financeira: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, [user]);

  const getMobileHealthDot = (health?: string) => {
    let colorClass = "bg-muted-foreground";
    let glowClass = "bg-muted-foreground/30";
    let title = "Consultando...";

    if (health === "OK") {
      colorClass = "bg-emerald-500 shadow-emerald-500/50";
      glowClass = "bg-emerald-500/30";
      title = "Operacional";
    } else if (health === "DEGRADED") {
      colorClass = "bg-amber-500 shadow-amber-500/50";
      glowClass = "bg-amber-500/30";
      title = "Atenção";
    } else if (health === "ERROR") {
      colorClass = "bg-rose-500 shadow-rose-500/50";
      glowClass = "bg-rose-500/30";
      title = "Problema Crítico";
    }

    return (
      <div
        className="sm:hidden absolute top-4 right-4 z-10 flex items-center justify-center p-1"
        title={title}
      >
        <span className="relative flex h-3.5 w-3.5">
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 duration-1000",
              glowClass
            )}
          />
          <span
            className={cn(
              "relative inline-flex rounded-full h-3.5 w-3.5 shadow-md transition-all animate-pulse",
              colorClass
            )}
          />
        </span>
      </div>
    );
  };

  const getDesktopHealthBadge = (health?: string) => {
    switch (health) {
      case "OK":
        return (
          <Badge className="hidden sm:inline-flex bg-emerald-600 hover:bg-emerald-700 text-white items-center gap-1 font-semibold text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" /> 🟢 Operacional
          </Badge>
        );
      case "DEGRADED":
        return (
          <Badge className="hidden sm:inline-flex bg-amber-600 hover:bg-amber-700 text-white items-center gap-1 font-semibold text-xs">
            <AlertTriangle className="h-3.5 w-3.5" /> 🟡 Atenção
          </Badge>
        );
      case "ERROR":
        return (
          <Badge className="hidden sm:inline-flex bg-rose-600 hover:bg-rose-700 text-white items-center gap-1 font-semibold text-xs">
            <XCircle className="h-3.5 w-3.5" /> 🔴 Problema Crítico
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="hidden sm:inline-flex text-xs">
            Consultando...
          </Badge>
        );
    }
  };

  return (
    <Card className="border-border/60 shadow-sm relative overflow-hidden">
      {/* Sinal de Status Mobile no Canto Superior Direito (piscando lentamente) */}
      {getMobileHealthDot(data?.overall_health)}

      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
        <div className="space-y-1 min-w-0 pr-6 sm:pr-0">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary shrink-0" />
            <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
              Monitoramento & Saúde do Billing
            </CardTitle>
            {getDesktopHealthBadge(data?.overall_health)}
          </div>
          <CardDescription className="text-xs">
            Diagnóstico em tempo real da integração Asaas, conciliação e integridade de assinaturas.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchHealth}
          disabled={loading}
          className="hidden sm:inline-flex gap-1.5 shrink-0 rounded-xl text-xs h-8"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Atualizar Diagnóstico</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-muted/40 rounded-lg border border-border/40">
                <p className="text-xs text-muted-foreground font-medium">Reconciliação Automática</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {data.reconciliation.is_stale ? (
                    <span className="text-amber-500 font-medium text-sm flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Atrasada (&gt;20min)
                    </span>
                  ) : (
                    <span className="text-emerald-500 font-medium text-sm flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> Ativa (5 min)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Última: {data.reconciliation.last_run_at ? new Date(data.reconciliation.last_run_at).toLocaleTimeString("pt-BR") : "Aguardando"}
                </p>
              </div>

              <div className="p-3 bg-muted/40 rounded-lg border border-border/40">
                <p className="text-xs text-muted-foreground font-medium">Ordens Pendentes</p>
                <p className="text-xl font-bold mt-1 text-foreground">{data.metrics.pending_orders}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {data.metrics.stuck_pending_orders_48h > 0 ? (
                    <span className="text-amber-500">{data.metrics.stuck_pending_orders_48h} paradas (&gt;48h)</span>
                  ) : "0 paradas (&gt;48h)"}
                </p>
              </div>

              <div className="p-3 bg-muted/40 rounded-lg border border-border/40">
                <p className="text-xs text-muted-foreground font-medium">Webhooks (24h)</p>
                <p className="text-xl font-bold mt-1 text-foreground">{data.metrics.webhooks_processed_24h}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {data.metrics.webhooks_errors_24h > 0 ? (
                    <span className="text-rose-500">{data.metrics.webhooks_errors_24h} com erro/revisão</span>
                  ) : "0 erros registrados"}
                </p>
              </div>

              <div className="p-3 bg-muted/40 rounded-lg border border-border/40">
                <p className="text-xs text-muted-foreground font-medium">Inconsistências</p>
                <p className={`text-xl font-bold mt-1 ${data.inconsistencies_count > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                  {data.inconsistencies_count}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {data.metrics.review_orders > 0 ? `${data.metrics.review_orders} ordens para revisão` : "Nenhum conflito"}
                </p>
              </div>
            </div>

            {data.inconsistencies_count > 0 && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5 text-rose-600 font-semibold text-xs">
                  <AlertTriangle className="h-4 w-4" />
                  Inconsistências Detectadas pelo Monitoramento:
                </div>
                <div className="space-y-1.5 text-xs">
                  {data.inconsistencies.map((inc, i) => (
                    <div key={i} className="flex items-start justify-between bg-background/80 p-2 rounded border border-border/40">
                      <div>
                        <span className="font-semibold text-foreground">{inc.code}:</span> {inc.details}
                        {inc.payment_id && <span className="ml-1 text-muted-foreground">(Payment: {inc.payment_id})</span>}
                      </div>
                      <Badge variant="destructive" className="text-[10px] uppercase">
                        {inc.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botão de Atualização Mobile (abaixo dos cards, ocupando 100% da largura) */}
            <div className="pt-1 sm:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchHealth}
                disabled={loading}
                className="w-full gap-1.5 rounded-xl text-xs h-9 justify-center font-medium"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>Atualizar Diagnóstico</span>
              </Button>
            </div>
          </>
        ) : (
          <div className="sm:hidden pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHealth}
              disabled={loading}
              className="w-full gap-1.5 rounded-xl text-xs h-9 justify-center font-medium"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Atualizar Diagnóstico</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
