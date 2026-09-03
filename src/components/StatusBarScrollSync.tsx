import { useEffect } from "react";

/**
 * Toggles `data-scrolled` on <body> when the user scrolls past a small
 * threshold — either on the window or inside any open Radix dialog/sheet
 * (elements with role="dialog"). This lets the iOS status-bar overlay
 * (body::before) deepen its tint for a more native feel, even when scrolling
 * inside modals.
 */
export function StatusBarScrollSync() {
  useEffect(() => {
    const THRESHOLD = 12;

    const setScrolled = (scrolled: boolean) => {
      const value = String(scrolled);
      if (document.body.dataset.scrolled === value) return;
      document.body.dataset.scrolled = value;
    };

    const compute = () => {
      if (window.scrollY > THRESHOLD) {
        setScrolled(true);
        return;
      }
      // Check any open dialog/sheet for internal scroll
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      for (const dlg of dialogs) {
        if (dlg.scrollTop > THRESHOLD) {
          setScrolled(true);
          return;
        }
        // Also inspect direct scrollable descendants
        const scrollables = dlg.querySelectorAll<HTMLElement>("*");
        for (const el of scrollables) {
          if (el.scrollTop > THRESHOLD) {
            setScrolled(true);
            return;
          }
        }
      }
      setScrolled(false);
    };

    compute();
    window.addEventListener("scroll", compute, { passive: true });
    // Use capture phase because scroll events don't bubble
    document.addEventListener("scroll", compute, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", compute);
      document.removeEventListener("scroll", compute, { capture: true } as EventListenerOptions);
    };
  }, []);
  return null;
}
