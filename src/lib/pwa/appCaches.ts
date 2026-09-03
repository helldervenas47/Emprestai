import { APP_CACHE_PREFIX } from "./buildId";

/**
 * Apaga SOMENTE os caches pertencentes ao PWA do app (prefixo oficial).
 *
 * NUNCA toca em:
 * - localStorage / sessão do Supabase;
 * - IndexedDB (dados offline);
 * - caches de outras origens ou de outros workers (ex.: push).
 */
export async function clearAppPWACaches(): Promise<number> {
  if (typeof caches === "undefined") return 0;
  try {
    const keys = await caches.keys();
    const appKeys = keys.filter((key) => key.startsWith(APP_CACHE_PREFIX));
    await Promise.all(appKeys.map((key) => caches.delete(key)));
    return appKeys.length;
  } catch {
    return 0;
  }
}

/**
 * Desregistra apenas o Service Worker principal do app (`/sw.js`) desta origem.
 * O worker de push (`/sw-push.js`) é preservado.
 */
export async function unregisterAppServiceWorker(): Promise<number> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return 0;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const targets = registrations.filter((registration) => {
      const url =
        registration.active?.scriptURL ||
        registration.waiting?.scriptURL ||
        registration.installing?.scriptURL ||
        "";
      return !url.includes("sw-push");
    });
    await Promise.all(targets.map((registration) => registration.unregister()));
    return targets.length;
  } catch {
    return 0;
  }
}
