import { useCallback, useMemo, useState } from "react";

/**
 * Fase 4 — estado tipado e exclusivo dos overlays globais.
 * Evita dezenas de booleanos independentes e impede que overlays
 * incompatíveis fiquem abertos ao mesmo tempo.
 */
export type ActiveOverlay =
  | { type: "none" }
  | { type: "income-form"; payload?: unknown }
  | { type: "ledger" }
  | { type: "stock-adjust" }
  | { type: "vehicle-history" }
  | { type: "vehicle-expense" };

export type OverlayType = ActiveOverlay["type"];

export interface OverlayController {
  overlay: ActiveOverlay;
  isOpen: (type: OverlayType) => boolean;
  openOverlay: (next: ActiveOverlay) => void;
  closeOverlay: () => void;
}

export function useOverlayController(initial: ActiveOverlay = { type: "none" }): OverlayController {
  const [overlay, setOverlay] = useState<ActiveOverlay>(initial);

  const openOverlay = useCallback((next: ActiveOverlay) => setOverlay(next), []);
  const closeOverlay = useCallback(() => setOverlay({ type: "none" }), []);
  const isOpen = useCallback((type: OverlayType) => overlay.type === type, [overlay]);

  return useMemo(
    () => ({ overlay, isOpen, openOverlay, closeOverlay }),
    [overlay, isOpen, openOverlay, closeOverlay],
  );
}
