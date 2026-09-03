import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, AlertTriangle, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { usePlanEntitlements } from "@/features/admin/hooks/usePlanEntitlements";

const PLAN_LABEL: Record<string, string> = {
  basico_plan: "Básico",
  profissional_plan: "Profissional",
  empresarial_plan: "Empresarial",
};

function formatDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function PlanStatusCard() {
  const navigate = useNavigate();
  const { subscription, isActive } = useSubscription();
  const { trial } = usePlanEntitlements();

  // 1) Assinatura paga ativa
  if (isActive && subscription) {
    const endsAt = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
    const msLeft = endsAt ? endsAt.getTime() - Date.now() : null;
    const daysLeft = msLeft != null ? Math.max(0, Math.ceil(msLeft / 86_400_000)) : null;
    const critical = daysLeft != null && daysLeft <= 2;
    const planLabel = PLAN_LABEL[subscription.product_id] ?? "Plano ativo";

    return (
      <Card className={critical ? "border-destructive/60" : undefined}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5 text-primary" />
            Plano atual
          </CardTitle>
          <Badge variant={critical ? "destructive" : "secondary"}>{planLabel}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {daysLeft != null ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Dias restantes</p>
                <p className={`text-2xl font-bold ${critical ? "text-destructive" : "text-foreground"}`}>
                  {daysLeft} {daysLeft === 1 ? "dia" : "dias"}
                </p>
                {endsAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Renova em {formatDate(endsAt)}
                  </p>
                )}
              </div>
              {critical && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Vence em breve
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Plano ativo sem data de expiração.</p>
          )}
          <Button 
            size="sm" 
            className="w-full mt-4" 
            variant={critical ? "default" : "outline"} 
            onClick={() => navigate("/planos#planos")}
          >
            {critical ? "Renovar plano" : "Estender ou Mudar Plano"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 2) Em período de teste (sem assinatura paga)
  if (trial.active) {
    const critical = trial.daysLeft <= 2;
    return (
      <Card className={critical ? "border-destructive/60" : undefined}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            Período de teste
          </CardTitle>
          <Badge variant={critical ? "destructive" : "secondary"}>Teste gratuito</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Dias restantes</p>
              <p className={`text-2xl font-bold ${critical ? "text-destructive" : "text-foreground"}`}>
                {trial.daysLeft} {trial.daysLeft === 1 ? "dia" : "dias"}
              </p>
              {trial.endsAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Termina em {formatDate(trial.endsAt)}
                </p>
              )}
            </div>
            {critical && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs font-medium">
                <AlertTriangle className="h-4 w-4" />
                Vence em breve
              </div>
            )}
          </div>
          <Button size="sm" className="w-full" onClick={() => navigate("/planos#planos")}>
            Assinar agora
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 3) Sem plano ativo
  return (
    <Card className="border-destructive/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Sem plano ativo
        </CardTitle>
        <Badge variant="destructive">Inativo</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          Você está sem plano ativo. Assine para liberar todas as funcionalidades.
        </p>
        <Button size="sm" className="w-full" onClick={() => navigate("/planos#planos")}>
          Ver planos
        </Button>
      </CardContent>
    </Card>
  );
}
