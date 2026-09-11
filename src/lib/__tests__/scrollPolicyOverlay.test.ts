import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOverlayController } from "@/hooks/useOverlayController";
import { scrollAppToTop, rememberScrollFor, restoreScrollFor } from "@/lib/scrollPolicy";
import { getTabScroll } from "@/lib/navigationState";

describe("useOverlayController", () => {
  it("mantém apenas um overlay ativo por vez", () => {
    const { result } = renderHook(() => useOverlayController());
    expect(result.current.overlay.type).toBe("none");

    act(() => result.current.openOverlay({ type: "ledger" }));
    expect(result.current.isOpen("ledger")).toBe(true);

    act(() => result.current.openOverlay({ type: "income-form" }));
    expect(result.current.isOpen("ledger")).toBe(false);
    expect(result.current.isOpen("income-form")).toBe(true);

    act(() => result.current.closeOverlay());
    expect(result.current.overlay.type).toBe("none");
  });
});

describe("scrollPolicy", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });

  it("scrollToTop usa window como fonte única", () => {
    scrollAppToTop();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("sempre vai ao topo ao restaurar/entrar em qualquer aba", () => {
    restoreScrollFor("system");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });

    restoreScrollFor("dashboard");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

});
