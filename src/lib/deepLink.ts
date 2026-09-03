// Deep link determinístico (Fase 3).
//
// Antes: `setTimeout(..., 250)` + `scrollIntoView()` — quebrava sempre que a
// aba/subaba/dados demoravam mais que o timer.
// Agora: observamos o DOM até o elemento existir (MutationObserver), então
// posicionamos. Sem timers fixos encadeados; apenas um teto de segurança para
// não observar indefinidamente.

export type WaitForElementOptions = {
  /** Teto de segurança (ms) — evita observar para sempre. */
  timeoutMs?: number;
  /** Raiz observada; padrão: document. */
  root?: ParentNode;
  signal?: AbortSignal;
};

export function waitForElement(
  selectorOrId: string,
  options: WaitForElementOptions = {},
): Promise<HTMLElement | null> {
  if (typeof document === "undefined") return Promise.resolve(null);

  const { timeoutMs = 10000, root = document, signal } = options;
  const selector = selectorOrId.startsWith("#") || /[.\[\s>]/.test(selectorOrId)
    ? selectorOrId
    : `#${CSS.escape(selectorOrId)}`;

  const find = () => (root as ParentNode).querySelector<HTMLElement>(selector);

  const immediate = find();
  if (immediate) return Promise.resolve(immediate);
  if (signal?.aborted) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (el: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(el);
    };

    const onAbort = () => finish(null);

    const observer = new MutationObserver(() => {
      const el = find();
      if (el) finish(el);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    const timer = window.setTimeout(() => finish(find()), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export type RevealOptions = {
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
  /** Duração do destaque visual. `0` desativa. */
  highlightMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const HIGHLIGHT_CLASSES = ["ring-2", "ring-primary", "ring-offset-2"];

/**
 * Aguarda o elemento do deep link existir de fato (aba + subaba + dados +
 * render concluídos) e só então rola até ele, destacando-o.
 */
export async function revealDeepLinkTarget(
  selectorOrId: string,
  options: RevealOptions = {},
): Promise<boolean> {
  const { behavior = "smooth", block = "start", highlightMs = 2000, timeoutMs, signal } = options;

  const el = await waitForElement(selectorOrId, { timeoutMs, signal });
  if (!el || signal?.aborted) return false;

  el.scrollIntoView({ behavior, block });

  if (highlightMs > 0) {
    el.classList.add(...HIGHLIGHT_CLASSES);
    window.setTimeout(() => el.classList.remove(...HIGHLIGHT_CLASSES), highlightMs);
  }

  return true;
}
