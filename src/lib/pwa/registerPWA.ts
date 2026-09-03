import { clearAppPWACaches, unregisterAppServiceWorker } from "./appCaches";
import { recoveryKey } from "./buildId";
import { trackPWAEvent } from "./events";

/** Contextos onde o Service Worker NUNCA deve ser registrado. */
export function isPreviewHost(hostname = window.location.hostname): boolean {
  return (
    hostname.includes("id-preview--") ||
    hostname.includes("preview--") ||
    hostname.includes("lovableproject.com") ||
    hostname.includes("lovableproject-dev.com") ||
    hostname.endsWith("beta.lovable.dev") ||
    import.meta.env.VITE_VERCEL_ENV === "preview"
  );
}

export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isStandaloneMode(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true
    );
  } catch {
    return false;
  }
}

/** Recarrega no máximo uma vez por build, evitando loop de reload. */
export function reloadOnce(scope: string): boolean {
  try {
    const key = recoveryKey(scope);
    if (sessionStorage.getItem(key)) {
      trackPWAEvent("pwa_reload_loop_prevented");
      return false;
    }
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage indisponível: segue com o reload */
  }
  window.location.reload();
  return true;
}

/**
 * Kill switch `?sw=off`: desregistra o SW do app, apaga apenas os caches do
 * app, remove o parâmetro da URL e recarrega uma única vez.
 * A sessão do Supabase (localStorage) é preservada.
 */
async function runKillSwitch(): Promise<void> {
  trackPWAEvent("pwa_recovery_started");
  await unregisterAppServiceWorker();
  await clearAppPWACaches();

  const url = new URL(window.location.href);
  url.searchParams.delete("sw");
  const clean = url.pathname + (url.search || "") + url.hash;

  try {
    const key = recoveryKey("killswitch");
    if (sessionStorage.getItem(key)) {
      trackPWAEvent("pwa_reload_loop_prevented");
      window.history.replaceState(null, "", clean);
      return;
    }
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* noop */
  }

  trackPWAEvent("pwa_recovery_completed");
  window.location.replace(clean);
}

/**
 * Ponto único de registro/limpeza do Service Worker do app.
 * Substitui a lógica antes espalhada em `main.tsx`.
 */
export function setupPWA(): void {
  if (typeof window === "undefined") return;

  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";
  const preview = isPreviewHost();
  const iframe = isInIframe();
  const standalone = isStandaloneMode();

  if (killSwitch) {
    void runKillSwitch();
    return;
  }

  // Preview / iframe: garante que nenhum SW fique ativo servindo HTML antigo.
  if ((preview || iframe) && !standalone) {
    void unregisterAppServiceWorker();
    return;
  }

  if (preview || iframe || !import.meta.env.PROD) return;

  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      let reloading = false;

      // Reload único quando o novo SW assume o controle da página.
      navigator.serviceWorker?.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        trackPWAEvent("pwa_service_worker_activated");
        reloadOnce("sw-controllerchange");
      });

      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          trackPWAEvent("pwa_service_worker_update_found");
          // Ativa a nova versão; o reload acontece no controllerchange (1x).
          void updateSW(true);
        },
        onRegisteredSW(_swUrl, registration) {
          registration?.update().catch(() => {});
          if (registration) {
            setInterval(() => {
              registration.update().catch(() => {});
            }, 60 * 60 * 1000);
          }
        },
      });
    })
    .catch(() => {
      // módulo virtual indisponível (dev) — ignora
    });
}

/** Recuperação manual usada pelas telas de erro. */
export async function recoverApp(): Promise<void> {
  trackPWAEvent("pwa_recovery_started");
  try {
    await unregisterAppServiceWorker();
    await clearAppPWACaches();
    trackPWAEvent("pwa_recovery_completed");
  } catch (error: any) {
    trackPWAEvent("pwa_recovery_failed", error);
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.replace(url.toString());
}
