import { useNavigate } from "react-router-dom";
import { AlertTriangle, ShieldOff, ArrowRight, LogOut, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/userClient";
import type { AccessLockReason } from "@/hooks/useAccessLock";

interface AccessLockScreenProps {
  reason: AccessLockReason;
  blockedReason?: string | null;
  planExpiresAt?: Date | null;
  /** Ao acionar, o Index volta para a aba Sistema em vez de fazer navigate. */
  onGoToSystem?: () => void;
}

/**
 * Tela exibida sempre que o usuário tenta acessar qualquer módulo fora da aba
 * Sistema enquanto o acesso estiver bloqueado (plano expirado OU bloqueio
 * administrativo). Mantém o padrão visual do app.
 */
export function AccessLockScreen({
  reason,
  blockedReason,
  planExpiresAt,
  onGoToSystem,
}: AccessLockScreenProps) {
  const navigate = useNavigate();
  const isAdminBlock = reason === "admin_blocked";

  const title = isAdminBlock ? "Usuário bloqueado" : "Plano expirado";
  const Icon = isAdminBlock ? ShieldOff : AlertTriangle;

  const description = isAdminBlock
    ? "Seu acesso foi bloqueado pelo administrador. Entre em contato com o suporte ou com o responsável pela administração da conta para regularizar sua situação."
    : "Seu período de assinatura expirou. Renove seu plano para voltar a utilizar todas as funcionalidades do aplicativo. Seus dados permanecem salvos e serão liberados automaticamente após a contratação.";

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <Card className="max-w-lg w-full border-destructive/40 bg-destructive/[0.03]">
        <CardContent className="p-8 space-y-6 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <Icon className="h-8 w-8 text-destructive" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          </div>

          {isAdminBlock && blockedReason && (
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-left">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Motivo informado
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{blockedReason}</p>
            </div>
          )}

          {!isAdminBlock && planExpiresAt && (
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Assinatura expirou em</div>
              <div className="text-sm font-semibold text-foreground tabular-nums">
                {planExpiresAt.toLocaleDateString("pt-BR")}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {!isAdminBlock && (
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={() => navigate("/planos")}
                data-allow-readonly
              >
                Regularizar assinatura
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}

            {onGoToSystem && (
              <Button
                variant="outline"
                size="lg"
                className="w-full gap-2"
                onClick={onGoToSystem}
                data-allow-readonly
              >
                <LifeBuoy className="h-4 w-4" />
                Ir para aba Sistema
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2 text-muted-foreground"
              data-allow-readonly
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/auth", { replace: true });
              }}
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </Button>
          </div>

          <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">
            Apenas a aba <span className="font-semibold text-foreground">Sistema</span> permanece
            acessível para que você consulte o status da conta e regularize o acesso.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
