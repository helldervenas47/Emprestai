import { describe, it, expect, vi } from "vitest";
import { resolveTabTransition } from "@/lib/tabNavigation";

describe("resolveTabTransition", () => {
  it("clique do usuário na aba atual: no-op absoluto (não navega, não rola)", () => {
    const r = resolveTabTransition("dashboard", "dashboard", { source: "user" });
    expect(r).toEqual({
      nextTab: "dashboard",
      changed: false,
      shouldNavigate: false,
      shouldScroll: false,
    });
  });

  it("selecionar a aba atual (internal) é no-op e não rola", () => {
    const r = resolveTabTransition("dashboard", "dashboard", { source: "internal" });
    expect(r.shouldNavigate).toBe(false);
    expect(r.shouldScroll).toBe(false);
  });

  it("sincronização interna navega mas nunca rola", () => {
    const r = resolveTabTransition("dashboard", "financial", { source: "internal" });
    expect(r.shouldNavigate).toBe(true);
    expect(r.shouldScroll).toBe(false);
  });

  it("clique manual em outra aba navega e rola", () => {
    const r = resolveTabTransition("dashboard", "financial", { source: "user" });
    expect(r.shouldNavigate).toBe(true);
    expect(r.shouldScroll).toBe(true);
  });

  it("user pode optar por não rolar via scrollToTop:false", () => {
    const r = resolveTabTransition("dashboard", "financial", { source: "user", scrollToTop: false });
    expect(r.shouldScroll).toBe(false);
  });

  it("app:navigate na mesma aba não chama scrollAppToTop", () => {
    const scrollAppToTop = vi.fn();
    const r = resolveTabTransition("loans", "loans", { source: "user" });
    if (r.shouldScroll) scrollAppToTop();
    expect(scrollAppToTop).not.toHaveBeenCalled();
  });

  it("visibleTabs redirect (source internal) não chama scrollAppToTop", () => {
    const scrollAppToTop = vi.fn();
    const r = resolveTabTransition("dashboard", "overview", { source: "internal" });
    if (r.shouldScroll) scrollAppToTop();
    expect(scrollAppToTop).not.toHaveBeenCalled();
    expect(r.changed).toBe(true);
  });
});

describe("captureScroll (política de preservação)", () => {
  it("restaura a posição do window uma única vez no próximo frame", async () => {
    const { captureScroll } = await import("@/features/loans/lib/preserveScroll");
    const scrollTo = vi.fn();
    const rafs: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafs.push(cb);
      return rafs.length;
    });
    Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
    Object.defineProperty(window, "scrollX", { value: 0, configurable: true });
    window.scrollTo = scrollTo as any;

    const restore = captureScroll();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    restore();
    restore(); // chamadas extras são ignoradas

    expect(rafs).toHaveLength(1);
    rafs.forEach((cb) => cb(0));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 500, left: 0, behavior: "auto" });
    vi.unstubAllGlobals();
  });
});
