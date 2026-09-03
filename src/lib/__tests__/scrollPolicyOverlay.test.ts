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

  it("memoriza e restaura a posição por aba quando o conteúdo já comporta", () => {
    Object.defineProperty(window, "scrollY", { value: 420, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 4000,
      configurable: true,
    });
    rememberScrollFor("loans");
    expect(getTabScroll("loans")).toBe(420);

    restoreScrollFor("loans");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 420, left: 0, behavior: "auto" });
  });

  it("adia a restauração enquanto a aba ainda não renderizou altura suficiente", () => {
    Object.defineProperty(window, "scrollY", { value: 1800, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 4000,
      configurable: true,
    });
    rememberScrollFor("finance");

    // Conteúdo ainda curto na aba de destino.
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 1000,
      configurable: true,
    });
    (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mockClear();
    restoreScrollFor("finance");
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("vai ao topo quando a aba nunca foi aberta", () => {
    restoreScrollFor("aba-nunca-aberta");
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

});
