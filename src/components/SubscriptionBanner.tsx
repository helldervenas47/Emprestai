import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { usePlanEntitlements } from "@/features/admin/hooks/usePlanEntitlements";

export function SubscriptionBanner() {
  const { isActive, loading: subLoading, daysRemaining } = useSubscription();
  const { trial, loading: planLoading } = usePlanEntitlements();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (subLoading || planLoading) return null;

  // Se não estiver ativo E não tiver um trial ativo, mostra o banner padrão de bloqueio
  if (!isActive && !trial.active) {
    return (
      <div className="w-full bg-destructive/10 border-b border-destructive/20 px-4 py-2.5 flex items-center justify-center gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <span className="text-foreground text-center">
          Você não possui um plano ativo. Algumas funcionalidades estão bloqueadas.
        </span>
        <Button variant="outline" size="sm" onClick={() => navigate("/planos#planos")} className="shrink-0 h-7 text-xs">
          Ver planos <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
    );
  }

  // Se estiver ativo mas com 3 dias ou menos para o vencimento, mostra o alerta amarelo
  if (daysRemaining !== null && daysRemaining <= 3 && daysRemaining >= 0 && !dismissed) {
    return (
      <div className="relative w-full bg-amber-500/10 border-b border-amber-500/20 px-10 py-2.5 flex items-center justify-center gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-foreground text-center">
          Seu plano vence em {daysRemaining === 0 ? "hoje" : `${daysRemaining} ${daysRemaining === 1 ? "dia" : "dias"}`}.
          Renove agora para evitar a suspensão.
        </span>
        <Button variant="outline" size="sm" onClick={() => navigate("/planos#planos")} className="shrink-0 h-7 text-xs border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-600">
          Renovar plano <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
        <button 
          onClick={() => setDismissed(true)}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-black/5 dark:hover:bg-white/10"
          title="Fechar aviso"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Caso contrário, não mostra nada
  return null;
}
