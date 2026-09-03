import React, { cloneElement, isValidElement, ReactElement, ReactNode } from "react";
import { useReadOnlyMode } from "@/hooks/useReadOnlyMode";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface WriteGuardProps {
  children: ReactNode;
  /** "disable" injeta disabled+tooltip; "hide" remove o filho do DOM. */
  mode?: "disable" | "hide";
  /** Mensagem do tooltip quando bloqueado. */
  message?: string;
  /** Força o bloqueio independente do estado (composição). */
  forceBlocked?: boolean;
}

const DEFAULT_MESSAGE =
  "Plano de teste expirado. Faça upgrade para continuar usando esta ação.";

/**
 * Bloqueia botões/ações de escrita quando o trial está expirado e o usuário
 * não tem assinatura paga. Mantém leitura habilitada.
 *
 * Uso:
 *   <WriteGuard><Button onClick={save}>Salvar</Button></WriteGuard>
 *   <WriteGuard mode="hide"><Button>Excluir</Button></WriteGuard>
 */
export function WriteGuard({
  children,
  mode = "disable",
  message = DEFAULT_MESSAGE,
  forceBlocked,
}: WriteGuardProps) {
  const { readOnly } = useReadOnlyMode();
  const blocked = forceBlocked ?? readOnly;

  if (!blocked) return <>{children}</>;

  if (mode === "hide") return null;

  if (!isValidElement(children)) {
    return <>{children}</>;
  }

  const child = children as ReactElement<any>;
  const disabledChild = cloneElement(child, {
    disabled: true,
    "aria-disabled": true,
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    style: { ...(child.props.style || {}), pointerEvents: "auto", cursor: "not-allowed", opacity: 0.6 },
  });

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{disabledChild}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          {message}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
