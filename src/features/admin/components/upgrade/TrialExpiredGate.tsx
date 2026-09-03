import { useNavigate } from "react-router-dom";
import { AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlanEntitlements } from "@/features/admin/hooks/usePlanEntitlements";
import { supabase } from "@/integrations/supabase/userClient";

/**
 * Aplica a regra configurada no plano quando o período de teste expira:
 *   - block_all: tela cheia bloqueando todo acesso.
 *   - readonly / force_upgrade: libera navegação na aba principal;
 *     as funcionalidades ficam bloqueadas via SubscriptionGate/Banner.
 *
 * Os dados do usuário permanecem no banco — nada é apagado.
 * (Não há mais redirecionamento automático para /planos quando o plano expira.)
 */
export function TrialExpiredGate({ children }: { children: React.ReactNode }) {
  const { trial, isPaid, loading } = usePlanEntitlements();
  const navigate = useNavigate();

  if (loading || isPaid || !trial.expired) return <>{children}</>;

  if (trial.expirationAction === "block_all") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center space-y-5 border border-destructive/40 bg-destructive/5 rounded-2xl p-8">
          <div className="mx-auto h-14 w-14 rounded-full bg-destructive/15 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Período de teste encerrado</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Seu acesso foi bloqueado. Assine um plano para voltar a usar o sistema.
              Seus dados permanecem salvos e serão liberados após a contratação.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button className="w-full" onClick={() => navigate("/planos")}>Ver planos</Button>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/auth", { replace: true });
              }}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // readonly e force_upgrade: mantém o usuário na aba principal.
  // O bloqueio das funcionalidades é feito pelo SubscriptionGate e o
  // SubscriptionBanner exibe o CTA para renovação.
  return <>{children}</>;
}
