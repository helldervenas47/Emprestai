import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, ArrowRight } from "lucide-react";
import { useSubscription, PLAN_TIERS } from "@/hooks/useSubscription";
import { usePlanEntitlements } from "@/features/admin/hooks/usePlanEntitlements";
import { useAuth } from "@/hooks/useAuth";
import { ReactNode } from "react";

interface SubscriptionGateProps {
  children: ReactNode;
  requiredTier?: number; // 1=Básico, 2=Profissional, 3=Empresarial
  featureName?: string;
}

const TIER_NAMES: Record<number, string> = {
  1: "Básico",
  2: "Profissional",
  3: "Empresarial",
};

export function SubscriptionGate({ children, requiredTier = 1, featureName }: SubscriptionGateProps) {
  const { isActive, planTier, loading: subLoading } = useSubscription();
  const { plan, trial, loading: planLoading } = usePlanEntitlements();
  const { role } = useAuth();
  const navigate = useNavigate();

  const loading = subLoading || planLoading;
  if (loading) return <>{children}</>;

  // Admins always have full access — they manage the account, not consume a seat plan.
  if (role === "admin") return <>{children}</>;

  // Se o usuário está em período de teste gratuito ativo, libera o acesso a todas as funcionalidades do sistema
  if (trial.active) return <>{children}</>;

  // Assinatura paga ativa: valida se o tier do plano é suficiente
  const effectiveTier = isActive ? planTier : 0;
  if (effectiveTier >= requiredTier) return <>{children}</>;

  const planName = TIER_NAMES[requiredTier] || "Básico";

  return (
    <div className="flex items-center justify-center py-16 px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground">
            {featureName ? `${featureName} — ` : ""}Funcionalidade Premium
          </h3>
          <p className="text-muted-foreground text-sm">
            {isActive
              ? `Esta funcionalidade requer o plano ${planName} ou superior. Faça upgrade para desbloquear.`
              : "Assine um plano para acessar todas as funcionalidades do EmprestAI."}
          </p>
          <Button onClick={() => navigate("/planos")} className="w-full">
            {isActive ? "Fazer upgrade" : "Ver planos"} <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
