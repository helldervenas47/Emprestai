import { useEffect, useRef, useState } from "react";

// Site Key público (Cloudflare Turnstile)
// Chave real -> usada em PRODUÇÃO (Vercel Production, publicado .lovable.app,
// domínio custom e apps nativos). Preview/dev usa a chave de teste oficial do
// Cloudflare (sempre passa) porque hostnames dinâmicos de preview e iframes
// quebram a validação do widget real.
const REAL_SITE_KEY = "0x4AAAAAAD3jWIOpch-wMcdy";
const TEST_SITE_KEY = "1x00000000000000000000AA";

// Overrides explícitos (opcionais, definidos no dashboard da Vercel):
// - VITE_TURNSTILE_MODE = "test" | "production" (tem prioridade absoluta)
// - VITE_TURNSTILE_SITE_KEY = chave customizada (usada como REAL)
// - VITE_VERCEL_ENV = "preview" | "production" | "development"
const ENV = import.meta.env as Record<string, string | undefined>;
const MODE_OVERRIDE = ENV.VITE_TURNSTILE_MODE?.toLowerCase();
const CUSTOM_REAL_KEY = ENV.VITE_TURNSTILE_SITE_KEY;
const VERCEL_ENV = ENV.VITE_VERCEL_ENV?.toLowerCase();

const isPreviewEnv = (() => {
  if (MODE_OVERRIDE === "test") return true;
  if (MODE_OVERRIDE === "production" || MODE_OVERRIDE === "prod") return false;
  if (import.meta.env.DEV) return true;
  if (VERCEL_ENV) return VERCEL_ENV !== "production";
  if (typeof window === "undefined") return false;

  const isNative =
    !!(window as any).Capacitor?.isNativePlatform?.() ||
    window.location.protocol === "capacitor:" ||
    window.location.protocol === "ionic:";
  if (isNative) return false;

  const host = window.location.hostname;
  return (
    host.includes("id-preview--") ||
    host.includes("preview--") ||
    host.includes("lovableproject.com") ||
    host.endsWith(".vercel.app") ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    host.endsWith(".internal")
  );
})();

export const TURNSTILE_SITE_KEY = isPreviewEnv
  ? TEST_SITE_KEY
  : (CUSTOM_REAL_KEY || REAL_SITE_KEY);

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
}

// Carrega o script do Cloudflare de forma resiliente (evita depender só da tag
// em index.html, que pode ser bloqueada por extensões/proxies e não retornar).
const ensureTurnstileScript = (): Promise<void> => {
  if (typeof window === "undefined") return Promise.reject(new Error("no-window"));
  if (window.turnstile) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile"]'
    );
    const onReady = () => {
      // Pequeno poll: o script existe mas `window.turnstile` pode aparecer no próximo tick
      let tries = 0;
      const t = setInterval(() => {
        if (window.turnstile) { clearInterval(t); resolve(); }
        else if (++tries > 50) { clearInterval(t); reject(new Error("turnstile-not-ready")); }
      }, 100);
    };
    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("script-load-failed")), { once: true });
      // Se já carregou antes desta chamada, dispara o check
      onReady();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.onload = onReady;
    s.onerror = () => reject(new Error("script-load-failed"));
    document.head.appendChild(s);
  });
};

export const TurnstileWidget = ({ onToken, onExpire, theme = "auto" }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorCode(null);

    // Timeout de segurança: se em 15s o widget não estiver pronto, mostra erro
    // com botão de retry (evita "tela travada" silenciosa em produção).
    const timeoutId = window.setTimeout(() => {
      if (!cancelled && !widgetId.current) {
        setStatus("error");
        setErrorCode("timeout");
      }
    }, 15000);

    ensureTurnstileScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        try {
          widgetId.current = window.turnstile.render(ref.current, {
            sitekey: TURNSTILE_SITE_KEY,
            action: "turnstile-spin-v2",
            theme,
            retry: "auto",
            "refresh-expired": "auto",
            callback: (token: string) => {
              setStatus("ready");
              setErrorCode(null);
              onToken(token);
            },
            "expired-callback": () => {
              onExpire?.();
              if (window.turnstile && widgetId.current) {
                try { window.turnstile.reset(widgetId.current); } catch { /* noop */ }
              }
            },
            "error-callback": (code?: string) => {
              setStatus("error");
              setErrorCode(code || "unknown");
              onExpire?.();
              // Log detalhado para depuração em produção
              // eslint-disable-next-line no-console
              console.warn("[Turnstile] error-callback:", code, {
                host: window.location.hostname,
                sitekey: TURNSTILE_SITE_KEY,
              });
            },
          });
          setStatus("ready");
        } catch (e: any) {
          setStatus("error");
          setErrorCode(e?.message || "render-failed");
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setStatus("error");
        setErrorCode(err.message);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* noop */ }
      }
      widgetId.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={ref} className="flex justify-center min-h-[65px]" />
      {status === "error" && (
        <div className="text-center text-xs text-destructive">
          <p>Falha ao carregar a verificação de segurança{errorCode ? ` (${errorCode})` : ""}.</p>
          <button
            type="button"
            onClick={() => {
              onExpire?.();
              setAttempt((n) => n + 1);
            }}
            className="mt-1 underline text-primary hover:opacity-80"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
};
