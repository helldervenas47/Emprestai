import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NAV_KEYS,
  NAV_STATE_VERSION,
  clearNavigationState,
  getTabScroll,
  readNavEntry,
  resolvePersistedOption,
  saveTabScroll,
  setNavigationScope,
  writeNavEntry,
} from "@/lib/navigationState";
import { emitAppUIEvent, onAppUIEvent } from "@/lib/appUIEvents";
import { revealDeepLinkTarget, waitForElement } from "@/lib/deepLink";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  setNavigationScope(null);
});

describe("navigationState — persistência versionada e por usuário", () => {
  it("persiste e lê subabas por escopo de usuário", () => {
    setNavigationScope("user-a");
    writeNavEntry(NAV_KEYS.subTabs, "financial", "expenses");
    expect(readNavEntry(NAV_KEYS.subTabs, "financial")).toBe("expenses");

    setNavigationScope("user-b");
    expect(readNavEntry(NAV_KEYS.subTabs, "financial")).toBeUndefined();

    setNavigationScope("user-a");
    expect(readNavEntry(NAV_KEYS.subTabs, "financial")).toBe("expenses");
  });

  it("descarta estado de versão antiga sem erro", () => {
    setNavigationScope("user-a");
    sessionStorage.setItem(
      `${NAV_KEYS.subTabs}:u:user-a`,
      JSON.stringify({ version: NAV_STATE_VERSION - 1, state: { financial: "expenses" } }),
    );
    expect(readNavEntry(NAV_KEYS.subTabs, "financial")).toBeUndefined();
  });

  it("não quebra com JSON inválido", () => {
    setNavigationScope("user-a");
    sessionStorage.setItem(`${NAV_KEYS.subTabs}:u:user-a`, "{{{não é json");
    expect(readNavEntry(NAV_KEYS.subTabs, "financial")).toBeUndefined();
  });

  it("subaba removida do app cai no fallback seguro", () => {
    expect(resolvePersistedOption("subaba-antiga", ["incomes", "expenses"] as const, "incomes")).toBe("incomes");
    expect(resolvePersistedOption("expenses", ["incomes", "expenses"] as const, "incomes")).toBe("expenses");
    expect(resolvePersistedOption(undefined, ["incomes", "expenses"] as const, "incomes")).toBe("incomes");
  });

  it("guarda posição de scroll por aba e ignora valores inválidos", () => {
    saveTabScroll("loans", 820);
    saveTabScroll("dashboard", 0);
    saveTabScroll("sales", Number.NaN);

    expect(getTabScroll("loans")).toBe(820);
    expect(getTabScroll("dashboard")).toBe(0);
    expect(getTabScroll("sales")).toBeUndefined();
    // Aba nunca aberta → sem posição salva → começa no topo.
    expect(getTabScroll("vehicles")).toBeUndefined();
  });

  it("clearNavigationState limpa o escopo atual", () => {
    setNavigationScope("user-a");
    writeNavEntry(NAV_KEYS.subTabs, "financial", "expenses");
    saveTabScroll("loans", 300);
    clearNavigationState();
    expect(readNavEntry(NAV_KEYS.subTabs, "financial")).toBeUndefined();
    expect(getTabScroll("loans")).toBeUndefined();
  });
});

describe("appUIEvents — camada central tipada", () => {
  it("emite e recebe NAVIGATE com origem tipada", () => {
    const seen: unknown[] = [];
    const off = onAppUIEvent("NAVIGATE", (e) => seen.push(e));
    emitAppUIEvent({ type: "NAVIGATE", tab: "loans", subTab: "history", source: "internal" });
    off();
    emitAppUIEvent({ type: "NAVIGATE", tab: "dashboard" });

    expect(seen).toEqual([
      { type: "NAVIGATE", tab: "loans", subTab: "history", scrollTo: undefined, source: "internal" },
    ]);
  });

  it("mantém compatibilidade com listeners legados de window", () => {
    const legacy = vi.fn();
    window.addEventListener("products-subtab-change", legacy);
    emitAppUIEvent({ type: "PRODUCTS_SUBTAB_CHANGE", subTab: "estoque" });
    window.removeEventListener("products-subtab-change", legacy);

    expect(legacy).toHaveBeenCalledTimes(1);
    expect((legacy.mock.calls[0][0] as CustomEvent).detail).toBe("estoque");
  });

  it("recebe eventos legados disparados diretamente por window.dispatchEvent", () => {
    const handler = vi.fn();
    const off = onAppUIEvent("OPEN_LEDGER", handler);
    window.dispatchEvent(new CustomEvent("open-ledger"));
    off();
    expect(handler).toHaveBeenCalledWith({ type: "OPEN_LEDGER" });
  });
});

describe("deepLink — sem timeout fixo", () => {
  it("resolve imediatamente quando o elemento já existe", async () => {
    const el = document.createElement("div");
    el.id = "loan-123";
    document.body.appendChild(el);

    await expect(waitForElement("loan-123")).resolves.toBe(el);
    el.remove();
  });

  it("aguarda o elemento aparecer depois do carregamento dos dados", async () => {
    const pending = waitForElement("loan-999", { timeoutMs: 2000 });

    // Simula a aba/subaba renderizando o registro só depois de carregar dados.
    setTimeout(() => {
      const el = document.createElement("div");
      el.id = "loan-999";
      document.body.appendChild(el);
    }, 120);

    const found = await pending;
    expect(found?.id).toBe("loan-999");
    found?.remove();
  });

  it("posiciona e destaca o registro encontrado", async () => {
    const el = document.createElement("div");
    el.id = "expense-7";
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    const ok = await revealDeepLinkTarget("expense-7", { highlightMs: 0 });
    expect(ok).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    el.remove();
  });

  it("desiste sem erro quando o elemento nunca aparece", async () => {
    await expect(revealDeepLinkTarget("nao-existe", { timeoutMs: 50 })).resolves.toBe(false);
  });
});
