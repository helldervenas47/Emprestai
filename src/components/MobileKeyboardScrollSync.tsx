import { useEffect } from "react";

/**
 * MobileKeyboardScrollSync
 * 
 * Ensures that on mobile devices (iOS Safari, Android Chrome, PWA),
 * whenever any input/textarea/select/combobox is focused:
 * 1. The virtual keyboard never covers the active input field.
 * 2. The active input is automatically scrolled smoothly into the comfortable visible viewport area (upper 25%-40%).
 * 3. Dynamic CSS custom properties (--keyboard-height, --visual-viewport-height, --visual-viewport-top)
 *    and documentElement dataset (data-keyboard-open="true|false") are maintained.
 * 4. Responsive to visualViewport resize & scroll events.
 */
export function MobileKeyboardScrollSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let resizeTimer: number | null = null;
    let focusTimer1: number | null = null;
    let focusTimer2: number | null = null;
    let focusTimer3: number | null = null;

    const updateViewportMetrics = () => {
      const vv = window.visualViewport;
      if (!vv) return;

      const windowHeight = window.innerHeight;
      const vvHeight = vv.height;
      const offsetTop = vv.offsetTop;
      const keyboardHeight = Math.max(0, windowHeight - vvHeight - offsetTop);
      const isKeyboardOpen = keyboardHeight > 60 || vvHeight < windowHeight * 0.82;

      document.documentElement.style.setProperty("--keyboard-height", `${keyboardHeight}px`);
      document.documentElement.style.setProperty("--visual-viewport-height", `${vvHeight}px`);
      document.documentElement.style.setProperty("--visual-viewport-top", `${offsetTop}px`);
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

    const findScrollParent = (node: HTMLElement | null): HTMLElement => {
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
      return (document.scrollingElement as HTMLElement) || document.documentElement;
    };

    const scrollFieldIntoSafeView = (target: HTMLElement, smooth = true) => {
      if (!target || !document.contains(target)) return;

      updateViewportMetrics();

      const vv = window.visualViewport;
      const vvHeight = vv ? vv.height : window.innerHeight;
      const vvTop = vv ? vv.offsetTop : 0;
      const rect = target.getBoundingClientRect();

      // We want the field positioned comfortably in the upper portion of the visible screen (20% to 38% from top)
      // well above any virtual keyboard covering the bottom area
      const targetIdealTop = vvTop + Math.max(60, Math.min(180, vvHeight * 0.3));
      const deltaY = rect.top - targetIdealTop;

      const scrollContainer = findScrollParent(target);

      // If already nicely within safe zone, skip large jumps
      if (rect.top >= vvTop + 40 && rect.bottom <= vvTop + vvHeight - 40) {
        if (rect.bottom > vvTop + vvHeight - 70) {
          if (scrollContainer === document.documentElement || scrollContainer === document.body) {
            window.scrollBy({ top: deltaY, behavior: smooth ? "smooth" : "auto" });
          } else {
            scrollContainer.scrollBy({ top: deltaY, behavior: smooth ? "smooth" : "auto" });
          }
        }
        return;
      }

      if (scrollContainer === document.documentElement || scrollContainer === document.body) {
        window.scrollBy({ top: deltaY, behavior: smooth ? "smooth" : "auto" });
      } else {
        scrollContainer.scrollBy({ top: deltaY, behavior: smooth ? "smooth" : "auto" });
      }

      try {
        target.scrollIntoView({
          behavior: smooth ? "smooth" : "auto",
          block: "center",
          inline: "nearest",
        });
      } catch {
        // Fallback for older browsers
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!isTextInputElement(target)) return;

      // Staged timers to coordinate with virtual keyboard slide-in animation on mobile
      if (focusTimer1) clearTimeout(focusTimer1);
      if (focusTimer2) clearTimeout(focusTimer2);
      if (focusTimer3) clearTimeout(focusTimer3);

      focusTimer1 = window.setTimeout(() => {
        if (document.activeElement === target) scrollFieldIntoSafeView(target, false);
      }, 50);

      focusTimer2 = window.setTimeout(() => {
        if (document.activeElement === target) scrollFieldIntoSafeView(target, true);
      }, 180);

      focusTimer3 = window.setTimeout(() => {
        if (document.activeElement === target) scrollFieldIntoSafeView(target, true);
      }, 360);
    };

    const handleViewportChange = () => {
      updateViewportMetrics();

      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const active = document.activeElement;
        if (isTextInputElement(active)) {
          scrollFieldIntoSafeView(active as HTMLElement, true);
        }
      }, 100);
    };

    updateViewportMetrics();

    document.addEventListener("focusin", handleFocusIn, { capture: true, passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange, { passive: true });
      window.visualViewport.addEventListener("scroll", handleViewportChange, { passive: true });
    } else {
      window.addEventListener("resize", handleViewportChange, { passive: true });
    }

    return () => {
      document.removeEventListener("focusin", handleFocusIn, { capture: true } as EventListenerOptions);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange);
        window.visualViewport.removeEventListener("scroll", handleViewportChange);
      } else {
        window.removeEventListener("resize", handleViewportChange);
      }
      if (resizeTimer) clearTimeout(resizeTimer);
      if (focusTimer1) clearTimeout(focusTimer1);
      if (focusTimer2) clearTimeout(focusTimer2);
      if (focusTimer3) clearTimeout(focusTimer3);
    };
  }, []);

  return null;
}
