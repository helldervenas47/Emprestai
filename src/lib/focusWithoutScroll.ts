import { useCallback, useRef } from "react";
import type { MutableRefObject, Ref, RefCallback } from "react";

export function focusWithoutScroll(element: HTMLElement | null) {
  if (!element || !element.isConnected) return;

  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

export function focusWithoutScrollOnNextFrame(element: HTMLElement | null) {
  requestAnimationFrame(() => focusWithoutScroll(element));
}

export function composeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (node) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") {
        ref(node);
        return;
      }
      (ref as MutableRefObject<T | null>).current = node;
    });
  };
}

export function useModalFocusWithoutScroll<T extends HTMLElement = HTMLDivElement>() {
  const focusTargetRef = useRef<T>(null);

  const handleOpenAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    focusWithoutScrollOnNextFrame(focusTargetRef.current);
  }, []);

  return {
    focusTargetRef,
    handleOpenAutoFocus,
  };
}