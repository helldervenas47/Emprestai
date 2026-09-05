import { useEffect } from "react";

/**
 * MobileKeyboardScrollSync
 * 
 * Ensures that on mobile devices (iOS Safari, Android Chrome, PWA):
 * 1. Tracks visualViewport height and detects when virtual keyboard opens/closes.
 * 2. Sets `--keyboard-height` and `data-keyboard-open="true|false"` on documentElement.
 * 3. When any input/textarea/select is focused or viewport resizes, dynamically adjusts
 *    the inner scroll container so the field is smoothly scrolled into clear view above the keyboard.
 * 4. Ensures the background window document stays anchored at top, preventing background leaks.
 */
export function MobileKeyboardScrollSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let resizeTimer: number | null = null;
    let focusTimer1: number | null = null;
    let focusTimer2: number | null = null;

    const updateMetrics = () => {
      const vv = window.visualViewport;
      if (!vv) return;

      const windowHeight = window.innerHeight;
      const vvHeight = vv.height;
      const offsetTop = vv.offsetTop;
      const keyboardHeight = Math.max(0, windowHeight - vvHeight - offsetTop);
      const isKeyboardOpen = keyboardHeight > 60 || vvHeight < windowHeight * 0.82;

      document.documentElement.style.setProperty(
        "--keyboard-height",
        `${isKeyboardOpen ? keyboardHeight : 0}px`
      );
      document.documentElement.dataset.keyboardOpen = isKeyboardOpen ? "true" : "false";
    };

    const isTextInputElement = (el: Element | null): el is HTMLElement => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "textarea" || tag === "select") return true;
      if (el.isContentEditable || el.getAttribute("contenteditable") === "true") return true;
      if (el.getAttribute("role") === "combobox") return true;
      if (el.hasAttribute("data-radix-select-trigger")) return true;
      if (tag === "input") {
        const type = (el as HTMLInputElement).type?.toLowerCase();
        return !["checkbox", "radio", "submit", "button", "reset", "file", "hidden", "range", "color"].includes(type);
      }
      return false;
    };

    const findScrollParent = (node: HTMLElement | null): HTMLElement | null => {
      let current: HTMLElement | null = node?.parentElement ?? null;
      while (current && current !== document.body && current !== document.documentElement) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        const isScrollable =
          (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
          current.scrollHeight > current.clientHeight;
        if (isScrollable) return current;
        current = current.parentElement;
      }
      return null;
    };

    const isInsideFixedOverlay = (node: HTMLElement | null): boolean => {
      let current: HTMLElement | null = node;
      while (current && current !== document.body && current !== document.documentElement) {
        const style = window.getComputedStyle(current);
        if (style.position === "fixed") return true;
        current = current.parentElement;
      }
      return false;
    };

    const adjustScrollForInput = (target: HTMLElement, smooth = true) => {
      if (!target || !document.contains(target)) return;

      updateMetrics();

      const vv = window.visualViewport;
      if (!vv) return;

      if (isInsideFixedOverlay(target) && window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }

      const visibleTop = vv.offsetTop;
      const visibleBottom = vv.offsetTop + vv.height;
      const rect = target.getBoundingClientRect();

      const scrollContainer = findScrollParent(target);
      if (!scrollContainer) return;

      const safeBottomMargin = 28; // px above keyboard
      const safeTopMargin = 24; // px below header

      if (rect.bottom > visibleBottom - safeBottomMargin) {
        const diff = rect.bottom - (visibleBottom - safeBottomMargin);
        scrollContainer.scrollBy({
          top: diff,
          behavior: smooth ? "smooth" : "auto",
        });
      } else if (rect.top < visibleTop + safeTopMargin) {
        const diff = rect.top - (visibleTop + safeTopMargin);
        scrollContainer.scrollBy({
          top: diff,
          behavior: smooth ? "smooth" : "auto",
        });
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!isTextInputElement(target)) return;

      if (focusTimer1) clearTimeout(focusTimer1);
      if (focusTimer2) clearTimeout(focusTimer2);

      focusTimer1 = window.setTimeout(() => {
        if (document.activeElement === target) adjustScrollForInput(target, false);
      }, 60);

      focusTimer2 = window.setTimeout(() => {
        if (document.activeElement === target) adjustScrollForInput(target, true);
      }, 240);
    };

    const handleViewportChange = () => {
      updateMetrics();

      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const active = document.activeElement;
        if (isTextInputElement(active)) {
          adjustScrollForInput(active as HTMLElement, true);
        }
      }, 60);
    };

    updateMetrics();

    document.addEventListener("focusin", handleFocusIn, { capture: true, passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange, { passive: true });
      window.visualViewport.addEventListener("scroll", handleViewportChange, { passive: true });
    }

    return () => {
      document.removeEventListener("focusin", handleFocusIn, { capture: true } as EventListenerOptions);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange);
        window.visualViewport.removeEventListener("scroll", handleViewportChange);
      }
      if (resizeTimer) clearTimeout(resizeTimer);
      if (focusTimer1) clearTimeout(focusTimer1);
      if (focusTimer2) clearTimeout(focusTimer2);
    };
  }, []);

  return null;
}
