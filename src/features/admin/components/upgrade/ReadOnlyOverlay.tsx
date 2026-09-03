import { ReactNode } from "react";
import { useReadOnlyMode } from "@/hooks/useReadOnlyMode";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface ReadOnlyOverlayProps {
  children: ReactNode;
  /** Mensagem exibida no banner acima dos itens bloqueados. */
  message?: string;
  /** Mostra CTA "Ver planos". Default true. */
  showUpgradeCta?: boolean;
}

/**
 * Envelopa um bloco interativo: quando o usuário está em modo somente leitura
 * (trial expirado e sem assinatura), exibe um banner no topo e desabilita
 * toda interação dos filhos via pointer-events + opacity. Mantém a leitura
 * dos dados visualmente acessível.
 */
export function ReadOnlyOverlay({
  children,
  message = "Seu plano de teste expirou. Você ainda pode visualizar seus dados, mas precisa de um plano ativo para realizar novas ações.",
  showUpgradeCta = true,
}: ReadOnlyOverlayProps) {
  const { readOnly } = useReadOnlyMode();
  const navigate = useNavigate();

  if (!readOnly) return <>{children}</>;

  return (
    <div className="space-y-3">
      <Card no3d className="border-amber-400/40 bg-amber-50/60 dark:bg-amber-900/10">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Lock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground">{message}</p>
              {showUpgradeCta && (
                <Button
                  size="sm"
                  variant="link"
                  className="h-auto p-0 mt-1 text-xs"
                  onClick={() => navigate("/planos")}
                >
                  Ver planos
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <div
        aria-disabled
        className="pointer-events-none select-none opacity-60"
        // Defesa em profundidade: também bloqueia capturas de teclado.
        onKeyDownCapture={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </div>
  );
}
