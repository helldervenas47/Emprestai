// Preservação de scroll — política única e enxuta.
//
// Fonte oficial de scroll do app: `window`. O `<main data-app-scroll-container>`
// não possui overflow próprio; toda a rolagem acontece no documento. Por isso
// capturamos e restauramos apenas `window.scrollY/scrollX`.
//
// Regras:
//  - nenhuma varredura de DOM (`querySelectorAll("*")`);
//  - nenhuma cadeia de timers (40/100/200/320/500/750/1100ms);
//  - no máximo uma restauração após o próximo ciclo de renderização;
//  - só chamamos `window.scrollTo` se a posição realmente divergiu.
//
// A API pública (`captureScroll()` → `restore()`) permanece igual.

export const SCROLL_DRIFT_TOLERANCE = 2;

export interface ScrollSnapshot {
  top: number;
  left: number;
  /** Restaura no próximo frame, uma única vez. */
  restore: () => void;
  /** Restaura imediatamente (síncrono), se houver desvio. Pode ser repetido. */
  restoreNow: () => void;
}

function currentScroll() {
  return {
    top: window.scrollY || window.pageYOffset || 0,
    left: window.scrollX || window.pageXOffset || 0,
  };
}

/**
 * Captura a posição atual da página e devolve utilitários de restauração.
 * A captura é síncrona — deve ser feita ANTES de qualquer mudança de estado
 * que monte um overlay (Radix/Vaul aplicam scroll-lock na montagem).
 */
export function captureScrollSnapshot(): ScrollSnapshot {
  if (typeof window === "undefined") {
    return { top: 0, left: 0, restore: () => {}, restoreNow: () => {} };
  }

  const { top, left } = currentScroll();

  const restoreNow = () => {
    const now = currentScroll();
    if (
      Math.abs(now.top - top) > SCROLL_DRIFT_TOLERANCE ||
      Math.abs(now.left - left) > SCROLL_DRIFT_TOLERANCE
    ) {
      window.scrollTo({ top, left, behavior: "auto" });
    }
  };

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restoreNow);
    else restoreNow();
  };

  return { top, left, restore, restoreNow };
}

/** API legada: captura e devolve apenas a função de restauração (uma vez). */
export function captureScroll(): () => void {
  return captureScrollSnapshot().restore;
}

/**
 * Cria um snapshot para uma posição já conhecida (ex.: capturada no
 * `pointerdown`, antes de qualquer mudança de estado/scroll-lock).
 */
export function snapshotForPosition(top: number, left = 0): ScrollSnapshot {
  if (typeof window === "undefined") {
    return { top, left, restore: () => {}, restoreNow: () => {} };
  }

  const restoreNow = () => {
    const now = currentScroll();
    if (
      Math.abs(now.top - top) > SCROLL_DRIFT_TOLERANCE ||
      Math.abs(now.left - left) > SCROLL_DRIFT_TOLERANCE
    ) {
      window.scrollTo({ top, left, behavior: "auto" });
    }
  };

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restoreNow);
    else restoreNow();
  };

  return { top, left, restore, restoreNow };
}
