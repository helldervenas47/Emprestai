/**
 * Identificador único do build atual.
 *
 * Injetado em build time (ver `vite.config.ts` → define). Usado para:
 * - chaves anti-loop de recuperação (`pwa-recovery-<buildId>`);
 * - logs/diagnóstico da tela de recuperação;
 * - eventos de observabilidade.
 *
 * Nunca contém secrets — é apenas um hash de commit ou timestamp de build.
 */
export const APP_BUILD_ID: string =
  (import.meta.env.VITE_APP_BUILD_ID as string | undefined) || "dev";

/** Prefixo oficial dos caches do app (Workbox `cacheId`). */
export const APP_CACHE_PREFIX = "emprestai-pwa-";

/** Chave de recuperação versionada por build (evita loop entre deploys). */
export function recoveryKey(scope: string): string {
  return `pwa-recovery-${scope}-${APP_BUILD_ID}`;
}
