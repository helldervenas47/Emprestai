/**
 * Política única de scroll do app (troca de abas).
 *
 * Regras:
 *  - A fonte oficial de scroll é `window` (o <main> não tem overflow próprio).
 *  - Só a navegação de aba iniciada pelo usuário pode alterar o scroll.
 *  - Primeira abertura de uma aba → topo.
 *  - Retorno a uma aba já visitada → posição exata anterior, restaurada
 *    somente depois que o conteúdo da aba tiver altura suficiente.
 *  - Overlays/modais NUNCA alteram o scroll (ver preserveScrollOnOpen).
 *
 * Nenhum componente deve chamar `window.scrollTo` diretamente — use este módulo.
 */
import { getTabScroll, saveTabScroll } from "@/lib/navigationState";

export type ScrollContainer = Window | HTMLElement;

function isScrollableElement(element: HTMLElement | null | undefined): element is HTMLElement {
  if (!element || typeof window === "undefined") return false;
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  return (
    (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
    element.scrollHeight > element.clientHeight
  );
}

/**
 * Resolve o container real de scroll do app no runtime.
 *
 * Hoje o preview/PWA rola pelo documento (`window`/`document.scrollingElement`),
 * mas este detector cobre futuras telas com container dedicado sem compartilhar
 * snapshots entre contextos diferentes.
 */
export function getAppScrollContainer(): ScrollContainer {
  if (typeof window === "undefined" || typeof document === "undefined") return null as unknown as Window;

  const explicit = document.querySelector<HTMLElement>("[data-scroll-container]");
  if (isScrollableElement(explicit) && explicit.scrollTop > 0) return explicit;

  const appMain = document.querySelector<HTMLElement>("[data-app-scroll-container]");
  if (isScrollableElement(appMain) && appMain.scrollTop > 0) return appMain;

  const overflowed = Array.from(
    document.querySelectorAll<HTMLElement>(".overflow-y-auto, .overflow-auto, [data-scroll-container]"),
  ).find((el) => isScrollableElement(el) && el.scrollTop > 0);
  if (overflowed) return overflowed;

  return window;
}

export function getScrollTop(container: ScrollContainer = getAppScrollContainer()): number {
  if (typeof window === "undefined") return 0;
  if (container === window) {
    return (
      window.scrollY ||
      document.documentElement?.scrollTop ||
      document.body?.scrollTop ||
      0
    );
  }
  return Math.max(0, (container as HTMLElement).scrollTop || 0);
}

export function getMaxScrollTop(container: ScrollContainer = getAppScrollContainer()): number {
  if (typeof window === "undefined") return 0;
  if (container === window) {
    const scrollingElement = document.scrollingElement || document.documentElement;
    return Math.max(0, (scrollingElement?.scrollHeight ?? 0) - window.innerHeight);
  }
  const el = container as HTMLElement;
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

export function setScrollTop(container: ScrollContainer = getAppScrollContainer(), top: number) {
  if (typeof window === "undefined") return;
  const safeTop = Math.max(0, Math.round(top));
  if (container === window) {
    window.scrollTo({ top: safeTop, left: 0, behavior: "auto" });
    return;
  }
  (container as HTMLElement).scrollTo({ top: safeTop, left: 0, behavior: "auto" });
}

export interface RestoreScrollWhenReadyOptions {
  container?: ScrollContainer;
  maxAttempts?: number;
  tolerance?: number;
  isCurrent?: () => boolean;
}

/**
 * Restaura scroll somente quando o layout já comporta a posição alvo.
 * Retorna uma função de cancelamento para impedir callbacks atrasados de uma
 * visualização anterior (ex.: lista → histórico → lista).
 */
export function restoreScrollWhenReady(
  targetPosition: number,
  options: RestoreScrollWhenReadyOptions = {},
): () => void {
  if (typeof window === "undefined") return () => {};

  const container = options.container ?? getAppScrollContainer();
  const maxAttempts = options.maxAttempts ?? 10;
  const tolerance = options.tolerance ?? 2;
  const isCurrent = options.isCurrent ?? (() => true);
  const target = Math.max(0, Math.round(targetPosition));

  let cancelled = false;
  let attempt = 0;
  let frame = 0;

  const cancel = () => {
    cancelled = true;
    if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    frame = 0;
  };

  const schedule = () => {
    if (cancelled) return;
    if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(run);
    else setTimeout(run, 0);
  };

  const run = () => {
    if (cancelled || !isCurrent()) return;
    attempt += 1;

    const max = getMaxScrollTop(container);
    const canReachTarget = max >= target - tolerance;
    const isLastAttempt = attempt >= maxAttempts;

    if (canReachTarget || isLastAttempt || target === 0) {
      setScrollTop(container, Math.min(target, max));
      const applied = getScrollTop(container);
      if (Math.abs(applied - Math.min(target, max)) <= tolerance || isLastAttempt || target === 0) {
        cancel();
        return;
      }
    }

    schedule();
  };

  schedule();
  return cancel;
}

export function scrollAppToTop() {
  if (typeof window === "undefined") return;
  setScrollTop(getAppScrollContainer(), 0);
}

/**
 * Rolagem suave até o topo (~320ms, ease-in-out).
 *
 * Usada exclusivamente quando o usuário toca na aba JÁ ativa (padrão
 * Instagram/X). Nenhuma outra interação deve chamar esta função.
 * Não faz nada se já estiver no topo.
 */
export function smoothScrollAppToTop(durationMs = 320) {
  if (typeof window === "undefined") return;
  const start = window.scrollY || 0;
  if (start <= 1) return;

  cancelPendingScrollRestore();

  const prefersReduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced || typeof requestAnimationFrame !== "function") {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return;
  }

  const startTime =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const easeInOut = (t: number) =>
    t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

  const step = () => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const progress = Math.min(1, (now - startTime) / durationMs);
    const top = start * (1 - easeInOut(progress));
    window.scrollTo({ top, left: 0, behavior: "auto" });
    if (progress < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}


export function getCurrentScroll(): number {
  if (typeof window === "undefined") return 0;
  return getScrollTop(getAppScrollContainer());
}

/** Memoriza a posição da aba que está sendo abandonada. */
export function rememberScrollFor(tabId: string) {
  saveTabScroll(tabId, getCurrentScroll());
}

/** Cancelador da restauração pendente (troca de aba rápida). */
let pendingRestore: (() => void) | null = null;

/**
 * Cancela qualquer restauração de aba pendente.
 *
 * Deve ser chamada em toda interação que NÃO seja troca de aba: abertura de
 * overlay/subtela, troca de subaba, filtro, scroll manual, wheel, touch e
 * pointerdown. Assim uma restauração agendada nunca "rouba" a posição depois
 * que o usuário já começou a interagir.
 */
export function cancelPendingScrollRestore() {
  pendingRestore?.();
  pendingRestore = null;
}

/** Container da aba ativa — escopo do MutationObserver da restauração. */
function activeTabContainer(): HTMLElement {
  if (typeof document === "undefined") return null as unknown as HTMLElement;
  return (
    document.querySelector<HTMLElement>("[data-app-scroll-container]") ??
    document.getElementById("root") ??
    document.body
  );
}

/**
 * Restaura a posição salva da aba de destino, ou vai ao topo se nunca aberta.
 *
 * Para posições salvas, aguardamos o conteúdo da aba renderizar: só aplicamos
 * o `scrollTo` quando o documento já comporta a posição alvo (ou quando o
 * conteúdo parou de crescer). Isso evita o clamp do navegador em listas que
 * montam de forma assíncrona. A restauração acontece uma única vez.
 */
export function restoreScrollFor(tabId: string) {
  if (typeof window === "undefined") return;

  cancelPendingScrollRestore();

  const saved = getTabScroll(tabId);

  if (typeof saved !== "number" || saved <= 0) {
    // Primeira visita (ou topo salvo): abre no topo.
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(scrollAppToTop);
    else scrollAppToTop();
    return;
  }

  let cancelled = false;
  let frame = 0;
  let observer: MutationObserver | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    cancelled = true;
    observer?.disconnect();
    observer = null;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
    if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    frame = 0;
    if (pendingRestore === cleanup) pendingRestore = null;
  };

  const apply = () => {
    if (cancelled) return;
    setScrollTop(window, saved);
    cleanup();
  };

  const tryApply = () => {
    if (cancelled) return;
    if (getMaxScrollTop(window) >= saved - 2) apply();
  };

  pendingRestore = cleanup;

  if (typeof requestAnimationFrame === "function") {
    frame = requestAnimationFrame(tryApply);
  } else {
    tryApply();
  }

  // Escopo mínimo: apenas o conteúdo da aba ativa (nunca todo o document.body,
  // que dispararia com toasts, portais, tooltips e dropdowns).
  if (!cancelled && typeof MutationObserver === "function") {
    const target = activeTabContainer();
    if (target) {
      observer = new MutationObserver(tryApply);
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  // Limite de segurança: se o conteúdo nunca alcançar a altura salva,
  // aplicamos mesmo assim (o navegador ajusta ao máximo disponível).
  if (!cancelled) {
    timeoutId = setTimeout(apply, 600);
  }
}

export interface ScrollPolicy {
  scrollToTop: () => void;
  smoothScrollToTop: (durationMs?: number) => void;
  rememberScrollFor: (tabId: string) => void;
  restoreScrollFor: (tabId: string) => void;
  cancelPendingRestore: () => void;
  getCurrentScroll: () => number;
}

/** Hook fino — expõe apenas os comportamentos aprovados. */
export function useScrollPolicy(): ScrollPolicy {
  return SCROLL_POLICY;
}

const SCROLL_POLICY: ScrollPolicy = {
  scrollToTop: scrollAppToTop,
  smoothScrollToTop: smoothScrollAppToTop,
  rememberScrollFor,
  restoreScrollFor,
  cancelPendingRestore: cancelPendingScrollRestore,
  getCurrentScroll,
};


// Qualquer interação real do usuário cancela uma restauração pendente.
if (typeof window !== "undefined") {
  const cancel = () => cancelPendingScrollRestore();
  window.addEventListener("pointerdown", cancel, { passive: true, capture: true });
  window.addEventListener("touchstart", cancel, { passive: true, capture: true });
  window.addEventListener("wheel", cancel, { passive: true, capture: true });
  window.addEventListener("keydown", cancel, { capture: true });
}
