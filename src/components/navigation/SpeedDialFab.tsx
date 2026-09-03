import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SpeedDialAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

interface SpeedDialFabProps {
  /** Ação principal (executada quando não há ações secundárias). */
  primary: SpeedDialAction;
  actions?: SpeedDialAction[];
  isMobile?: boolean;
  onPrefetch?: () => void;
  className?: string;
}

/**
 * FAB expansível (Fase 4) — substitui pilhas de botões flutuantes.
 * - Um único botão principal; ao clicar, revela as ações (ícone + texto).
 * - Fecha ao selecionar, ao clicar fora e ao pressionar Escape.
 * - Nunca altera a posição de scroll (não usa scroll/focus com scroll).
 */
export function SpeedDialFab({ primary, actions = [], isMobile, onPrefetch, className }: SpeedDialFabProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasActions = actions.length > 0;

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, close]);

  const handleTrigger = () => {
    if (!hasActions) {
      primary.onSelect();
      return;
    }
    setOpen((v) => !v);
  };

  const bottom = isMobile
    ? `calc(env(safe-area-inset-bottom) + 76px)`
    : `calc(env(safe-area-inset-bottom) + 20px)`;

  return (
    <div
      ref={containerRef}
      className={cn("fixed z-50 flex flex-col items-end gap-2", className)}
      style={{ right: `calc(env(safe-area-inset-right) + 16px)`, bottom }}
      data-testid="speed-dial"
    >
      {open && hasActions && (
        <div className="flex flex-col items-end gap-2" role="menu" aria-label={`Ações de ${primary.label}`}>
          {[primary, ...actions].map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-md animate-scale-in touch-manipulation transition-[transform,opacity,box-shadow] duration-150 ease-out hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <action.icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
              <span className="whitespace-nowrap">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={handleTrigger}
        onPointerEnter={onPrefetch}
        onFocus={onPrefetch}
        aria-label={hasActions ? (open ? "Fechar ações" : "Abrir ações") : primary.label}
        title={hasActions ? "Ações" : primary.label}
        aria-expanded={hasActions ? open : undefined}
        aria-haspopup={hasActions ? "menu" : undefined}
        className="group h-11 w-11 md:h-12 md:w-12 rounded-full flex items-center justify-center animate-fade-in touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-[transform,box-shadow,opacity] duration-150 ease-out hover:scale-105 active:scale-95 gradient-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)] hover:shadow-[0_12px_32px_-8px_hsl(var(--primary)/0.8)]"
      >
        {open && hasActions ? (
          <X className="h-5 w-5" strokeWidth={2.75} />
        ) : (
          <Plus className="h-5 w-5 drop-shadow-[0_1px_2px_hsl(var(--primary)/0.5)]" strokeWidth={2.75} />
        )}
      </button>
    </div>
  );
}

export default SpeedDialFab;
