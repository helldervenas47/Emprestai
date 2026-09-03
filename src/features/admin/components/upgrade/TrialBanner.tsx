import { useNavigate } from "react-router-dom";
import { Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlanEntitlements } from "@/features/admin/hooks/usePlanEntitlements";

export function TrialBanner() {
  const navigate = useNavigate();
  const { trial, isPaid } = usePlanEntitlements();

  if (isPaid) return null;

  if (trial.expired) {
    return (
      <div className="w-full bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">Seu período de teste terminou.</span>
          <span className="opacity-90 hidden sm:inline">
            Assine um plano para continuar criando novos registros.
          </span>
        </div>
        <Button size="sm" variant="secondary" onClick={() => navigate("/planos#planos")}>
          Assinar agora
        </Button>
      </div>
    );
  }

  if (!trial.active) return null;

  return (
    <div className="w-full bg-primary/10 text-foreground px-4 py-2 flex items-center justify-between gap-3 text-sm border-b border-primary/20">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" />
        <span className="font-medium">
          {trial.msLeft < 86400_000
            ? `Período de teste gratuito — restam ${trial.hoursLeft} hora${trial.hoursLeft === 1 ? "" : "s"}.`
            : `Período de teste gratuito — restam ${trial.daysLeft} dia${trial.daysLeft === 1 ? "" : "s"}.`}
        </span>
      </div>
      <Button size="sm" onClick={() => navigate("/planos#planos")}>
        Assinar agora
      </Button>
    </div>
  );
}
