import { useEffect } from "react";

/**
 * MobileKeyboardScrollSync
 * 
 * Ensures that on mobile devices (iOS Safari, Android Chrome, PWA),
 * whenever any input/textarea/select/combobox is focused:
 * 1. The virtual keyboard never covers the active input field.
 * 2. Only scrolls the internal modal/form container if the field is actually obstructed by the keyboard.
 * 3. Never moves or over-scrolls the background window, preventing huge blank spaces.
 */
export function MobileKeyboardScrollSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let resizeTimer: number | null = null;
    let focusTimer1: number | null = null;
    let focusTimer2: number | null = null;

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

      const vv = window.visualViewport;
      if (!vv) return;

      // On iOS Safari, keep the background document anchored at top if inside a modal
      if (isInsideFixedOverlay(target) && window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }

      const visibleTop = vv.offsetTop;
      const visibleBottom = vv.offsetTop + vv.height;
      const rect = target.getBoundingClientRect();

      const scrollContainer = findScrollParent(target);
      if (!scrollContainer) return;

      const safeBottomMargin = 20; // px above keyboard
      const safeTopMargin = 20; // px below top bar

      // If the field is covered by keyboard at the bottom
      if (rect.bottom > visibleBottom - safeBottomMargin) {
        const diff = rect.bottom - (visibleBottom - safeBottomMargin);
        scrollContainer.scrollBy({
          top: diff,
          behavior: smooth ? "smooth" : "auto",
        });
      } else if (rect.top < visibleTop + safeTopMargin) {
        // If the field is pushed above visible top
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
      }, 80);

      focusTimer2 = window.setTimeout(() => {
        if (document.activeElement === target) adjustScrollForInput(target, true);
      }, 280);
    };

    const handleViewportChange = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const active = document.activeElement;
        if (isTextInputElement(active)) {
          adjustScrollForInput(active as HTMLElement, true);
        }
      }, 80);
    };

    document.addEventListener("focusin", handleFocusIn, { capture: true, passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange, { passive: true });
    }

    return () => {
      document.removeEventListener("focusin", handleFocusIn, { capture: true } as EventListenerOptions);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange);
      }
      if (resizeTimer) clearTimeout(resizeTimer);
      if (focusTimer1) clearTimeout(focusTimer1);
      if (focusTimer2) clearTimeout(focusTimer2);
    };
  }, []);

  return null;
}
