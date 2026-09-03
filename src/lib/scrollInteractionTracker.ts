/**
 * Rastreador da posição de scroll no instante da interação do usuário.
 *
 * Por que existe: quando um overlay é controlado por estado do próprio módulo
 * (`setSelectedLoan(x)`, `setOpenId(i)`, `view === "details"`), o wrapper global
 * só descobre a abertura no `useLayoutEffect` — que roda DEPOIS dos effects dos
 * filhos, ou seja, depois do scroll-lock. Nesse ponto a posição real já foi
 * perdida.
 *
 * A solução é registrar a posição no capture-phase do `pointerdown`/`keydown`,
 * antes de qualquer mudança de estado do React. Nenhum polling, nenhum timer.
 */

const MAX_AGE_MS = 1500;

let lastScrollTop = 0;
let lastScrollLeft = 0;
let lastAt = 0;

function record() {
  lastScrollTop = window.scrollY || window.pageYOffset || 0;
  lastScrollLeft = window.scrollX || window.pageXOffset || 0;
  lastAt = Date.now();
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", record, { capture: true, passive: true });
  window.addEventListener("touchstart", record, { capture: true, passive: true });
  window.addEventListener("mousedown", record, { capture: true, passive: true });
  // `click` no capture-phase do window roda antes dos handlers do React,
  // cobrindo ambientes/testes que não emitem pointerdown.
  window.addEventListener("click", record, { capture: true, passive: true });
  window.addEventListener("keydown", record, { capture: true });
}

/** Posição registrada na última interação, se ainda for recente. */
export function getInteractionScroll(): { top: number; left: number } | null {
  if (typeof window === "undefined") return null;
  if (!lastAt || Date.now() - lastAt > MAX_AGE_MS) return null;
  return { top: lastScrollTop, left: lastScrollLeft };
}

/** Usado apenas em testes. */
export function __recordInteractionScrollForTest() {
  record();
}
