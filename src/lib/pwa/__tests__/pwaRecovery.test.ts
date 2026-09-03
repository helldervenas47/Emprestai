import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { isModuleLoadError, extractChunkUrl } from "@/lib/pwa/moduleErrors";
import { sanitizeMessage, trackPWAEvent, getPWAEvents } from "@/lib/pwa/events";
import { clearAppPWACaches, unregisterAppServiceWorker } from "@/lib/pwa/appCaches";
import { isPreviewHost, reloadOnce } from "@/lib/pwa/registerPWA";
import { recoveryKey, APP_CACHE_PREFIX } from "@/lib/pwa/buildId";

describe("detecção de falhas de módulo/chunk", () => {
  const cases = [
    "Failed to fetch dynamically imported module: https://app.com/assets/Loans-abc.js",
    "Importing a module script failed.", // Safari/iOS
    "Loading chunk 42 failed",
    "Loading CSS chunk 7 failed",
    "Load failed", // iOS WebView
    "Script error.",
    "Expected a JavaScript module script but the server responded with a MIME type of text/html",
  ];

  it.each(cases)("reconhece: %s", (message) => {
    expect(isModuleLoadError(new Error(message))).toBe(true);
  });

  it("reconhece ChunkLoadError pelo name, sem URL na mensagem", () => {
    const err = new Error("failed");
    err.name = "ChunkLoadError";
    expect(isModuleLoadError(err)).toBe(true);
  });

  it("não classifica erros comuns de aplicação como falha de chunk", () => {
    expect(isModuleLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isModuleLoadError(null)).toBe(false);
  });

  it("extrai a URL do chunk quando disponível", () => {
    const err = new Error("Failed to fetch dynamically imported module: https://a.com/assets/X-1.js");
    expect(extractChunkUrl(err)).toBe("https://a.com/assets/X-1.js");
    expect(extractChunkUrl(new Error("Load failed"))).toBeNull();
  });
});

describe("sanitização de diagnóstico", () => {
  it("remove JWT, e-mail, CPF, CNPJ e telefone", () => {
    const raw =
      "user joao@teste.com cpf 123.456.789-01 fone (11) 98888-7777 token eyJhbGciOiJIUzI1.abcdefg.hijklmn";
    const out = sanitizeMessage(raw);
    expect(out).not.toContain("joao@teste.com");
    expect(out).not.toContain("123.456.789-01");
    expect(out).not.toContain("98888-7777");
    expect(out).not.toContain("eyJhbGciOiJIUzI1");
    expect(out).toContain("[email]");
    expect(out).toContain("[jwt]");
  });

  it("remove tokens em query string", () => {
    expect(sanitizeMessage("https://x.com/a?access_token=abc123&b=1")).toContain(
      "access_token=[redacted]",
    );
  });
});

describe("eventos de observabilidade", () => {
  it("registra evento com buildId e sem dados sensíveis", () => {
    trackPWAEvent("pwa_lazy_chunk_error", {
      name: "ChunkLoadError",
      message: "falha para joao@teste.com",
    });
    const last = getPWAEvents().at(-1)!;
    expect(last.event).toBe("pwa_lazy_chunk_error");
    expect(last.buildId).toBeTruthy();
    expect(last.errorMessage).not.toContain("joao@teste.com");
  });
});

describe("clearAppPWACaches", () => {
  const deleted: string[] = [];

  beforeEach(() => {
    deleted.length = 0;
    (globalThis as any).caches = {
      keys: async () => [
        `${APP_CACHE_PREFIX}html`,
        `${APP_CACHE_PREFIX}assets`,
        "outro-app-cache",
        "firebase-messaging-sw",
      ],
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
    };
  });

  afterEach(() => {
    delete (globalThis as any).caches;
  });

  it("apaga apenas caches com o prefixo oficial do app", async () => {
    const count = await clearAppPWACaches();
    expect(count).toBe(2);
    expect(deleted).toEqual([`${APP_CACHE_PREFIX}html`, `${APP_CACHE_PREFIX}assets`]);
    expect(deleted).not.toContain("outro-app-cache");
    expect(deleted).not.toContain("firebase-messaging-sw");
  });

  it("preserva a sessão do Supabase no localStorage", async () => {
    localStorage.setItem("sb-user-external-auth", "sessao");
    await clearAppPWACaches();
    expect(localStorage.getItem("sb-user-external-auth")).toBe("sessao");
  });
});

describe("unregisterAppServiceWorker", () => {
  it("desregistra o SW do app e preserva o worker de push", async () => {
    const appUnregister = vi.fn(async () => true);
    const pushUnregister = vi.fn(async () => true);
    (navigator as any).serviceWorker = {
      getRegistrations: async () => [
        { active: { scriptURL: "https://app.com/sw.js" }, unregister: appUnregister },
        { active: { scriptURL: "https://app.com/sw-push.js" }, unregister: pushUnregister },
      ],
    };
    const count = await unregisterAppServiceWorker();
    expect(count).toBe(1);
    expect(appUnregister).toHaveBeenCalled();
    expect(pushUnregister).not.toHaveBeenCalled();
    delete (navigator as any).serviceWorker;
  });
});

describe("detecção de preview (sem service worker)", () => {
  it.each([
    "id-preview--abc.lovable.app",
    "preview--abc.lovable.app",
    "x.lovableproject.com",
  ])("%s é preview", (host) => {
    expect(isPreviewHost(host)).toBe(true);
  });

  it("domínio de produção não é preview", () => {
    expect(isPreviewHost("app.emprestai.com.br")).toBe(false);
  });
});

describe("anti-loop de reload", () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: vi.fn() },
    });
  });

  it("recarrega apenas uma vez por build", () => {
    expect(reloadOnce("teste")).toBe(true);
    expect(reloadOnce("teste")).toBe(false);
    expect(sessionStorage.getItem(recoveryKey("teste"))).toBeTruthy();
  });

  it("usa chaves distintas por escopo", () => {
    expect(recoveryKey("lazy-chunk")).not.toBe(recoveryKey("killswitch"));
  });
});
