import * as React from "react";
import {
  captureScrollSnapshot,
  snapshotForPosition,
  SCROLL_DRIFT_TOLERANCE,
  type ScrollSnapshot,
} from "@/features/loans/lib/preserveScroll";
import { focusWithoutScroll } from "@/lib/focusWithoutScroll";
import { cancelPendingScrollRestore } from "@/lib/scrollPolicy";
import { getInteractionScroll } from "@/lib/scrollInteractionTracker";

/**
 * Snapshot mais confiável disponível no momento da abertura.
 *
 * Preferimos a posição registrada no `pointerdown` da interação (antes de
 * qualquer `setState`/scroll-lock). Só usamos a posição atual quando ela ainda
 * coincide com a registrada ou quando não houve interação recente.
 */
function bestSnapshotOnOpen(): ScrollSnapshot {
  const intent = getInteractionScroll();
  const current = captureScrollSnapshot();
  if (!intent) return current;
  if (Math.abs(intent.top - current.top) <= SCROLL_DRIFT_TOLERANCE) return current;
  return snapshotForPosition(intent.top, intent.left);
}



/**
 * Política de scroll dos overlays (Dialog / AlertDialog / Sheet / Drawer).
 *
 * Fluxo oficial:
 *   clique → captura do scroll (síncrona, ANTES de `setOpen(true)`)
 *          → montagem do overlay (Radix/Vaul aplicam scroll-lock)
 *          → 1 validação em `requestAnimationFrame`: se desviou, restaura
 *          → uso do módulo
 *          → fechamento: devolve o foco (preventScroll) e valida o scroll
 *            apenas se ele tiver desviado.
 *
 * Nunca usamos timers encadeados, polling ou múltiplos rAF.
 * Dialog/Sheet/Drawer não mexem em scroll — só foco/portal/animação.
 */

/**
 * Hook de fallback para overlays cujo `open` é totalmente externo: captura no
 * flush de layout (antes dos effects do react-remove-scroll) e valida uma vez.
 */
export function useScrollPreserveOnOpen(open: boolean) {
  const snapshotRef = React.useRef<ScrollSnapshot | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const prevRef = React.useRef(open);

  React.useLayoutEffect(() => {
    if (open && !prevRef.current) {
      // Uma restauração de aba pendente nunca pode disputar com a abertura.
      cancelPendingScrollRestore();
      if (!snapshotRef.current) snapshotRef.current = bestSnapshotOnOpen();
      const active = typeof document !== "undefined" ? document.activeElement : null;
      triggerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;

      const snapshot = snapshotRef.current;
      // Validação imediata + uma no próximo frame: o scroll-lock do
      // react-remove-scroll/Vaul é aplicado em effects posteriores, então
      // um único ponto de checagem não cobre o ciclo real de abertura.
      snapshot.restoreNow();
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          snapshot.restoreNow();
          requestAnimationFrame(snapshot.restoreNow);
        });
      }
    } else if (!open && prevRef.current) {
      const snapshot = snapshotRef.current;
      snapshotRef.current = null;
      // No fechamento só corrigimos se o scroll realmente saiu do lugar.
      if (snapshot && typeof requestAnimationFrame === "function") {
        requestAnimationFrame(snapshot.restoreNow);
      } else {
        snapshot?.restoreNow();
      }

      const trigger = triggerRef.current;
      triggerRef.current = null;
      if (trigger) {
        // rAF cobre o caso comum; o timeout garante a devolução do foco após o
        // Radix/Vaul terminar de desmontar o conteúdo (que move o foco ao body).
        requestAnimationFrame(() => focusWithoutScroll(trigger));
        setTimeout(() => focusWithoutScroll(trigger), 0);
      }
    }
    prevRef.current = open;
  }, [open]);

  return snapshotRef;
}


/**
 * Factory que envolve o Root de um overlay (Radix Dialog/AlertDialog/Sheet
 * ou Vaul Drawer) preservando o scroll a cada abertura+fechamento.
 *
 * A captura acontece no próprio `onOpenChange` (ou seja, ainda durante o
 * clique do usuário) — antes de qualquer render/montagem.
 */
export function withScrollPreserve<P extends {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}>(Root: React.ComponentType<P>) {
  const Wrapped: React.FC<P> = (props) => {
    const { open, defaultOpen, onOpenChange } = props;
    const [internal, setInternal] = React.useState<boolean>(!!defaultOpen);
    const isControlled = open !== undefined;
    const isOpen = isControlled ? !!open : internal;

    const snapshotRef = useScrollPreserveOnOpen(isOpen);

    const handleOpenChange = React.useCallback(
      (o: boolean) => {
        // Captura ANTES da mudança de estado: neste ponto o scroll ainda é o
        // real da página (nenhum scroll-lock foi aplicado).
        if (o && !isOpen) {
          cancelPendingScrollRestore();
          snapshotRef.current = bestSnapshotOnOpen();
        }
        if (!isControlled) setInternal(o);
        onOpenChange?.(o);
      },
      [isControlled, isOpen, onOpenChange, snapshotRef],
    );

    return <Root {...props} onOpenChange={handleOpenChange} />;
  };
  Wrapped.displayName = `withScrollPreserve(${Root.displayName || Root.name || "Root"})`;
  return Wrapped;
}
