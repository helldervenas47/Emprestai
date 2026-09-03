import { APP_BUILD_ID } from "./buildId";

export type PWAEventName =
  | "pwa_boot_started"
  | "pwa_boot_completed"
  | "pwa_boot_timeout"
  | "pwa_module_load_error"
  | "pwa_lazy_chunk_error"
  | "pwa_service_worker_update_found"
  | "pwa_service_worker_activated"
  | "pwa_recovery_started"
  | "pwa_recovery_completed"
  | "pwa_recovery_failed"
  | "pwa_reload_loop_prevented";

export interface PWARecoveryEvent {
  event: PWAEventName;
  buildId: string;
  route: string;
  standalone: boolean;
  online: boolean;
  serviceWorkerControlled: boolean;
  userAgent: string;
  errorName?: string;
  errorMessage?: string;
  timestamp: string;
}

const MAX_BUFFER = 30;
const buffer: PWARecoveryEvent[] = [];

/**
 * Remove qualquer dado sensível que possa vazar em mensagens de erro:
 * JWTs, e-mails, CPF/CNPJ, telefones e query strings com tokens.
 */
export function sanitizeMessage(input: unknown): string {
  let text = typeof input === "string" ? input : String(input ?? "");
  text = text
    // JWT / bearer
    .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[jwt]")
    .replace(/(bearer\s+)[A-Za-z0-9._-]+/gi, "$1[token]")
    // query params sensíveis
    .replace(/([?&](access_token|refresh_token|token|apikey|key)=)[^&\s]*/gi, "$1[redacted]")
    // e-mail
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    // CPF / CNPJ
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[cnpj]")
    // telefone BR
    .replace(/\b(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[phone]");
  return text.slice(0, 500);
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as any).standalone === true
    );
  } catch {
    return false;
  }
}

export function trackPWAEvent(
  event: PWAEventName,
  error?: { name?: string; message?: string } | null,
): PWARecoveryEvent {
  const payload: PWARecoveryEvent = {
    event,
    buildId: APP_BUILD_ID,
    route: typeof location !== "undefined" ? location.pathname : "",
    standalone: isStandalone(),
    online: typeof navigator !== "undefined" ? navigator.onLine !== false : true,
    serviceWorkerControlled:
      typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    timestamp: new Date().toISOString(),
  };

  if (error) {
    payload.errorName = error.name ? sanitizeMessage(error.name) : undefined;
    payload.errorMessage = error.message ? sanitizeMessage(error.message) : undefined;
  }

  buffer.push(payload);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  try {
    (window as any).__PWA_EVENTS__ = buffer;
  } catch {
    /* noop */
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[pwa]", event, payload);
  }

  return payload;
}

export function getPWAEvents(): PWARecoveryEvent[] {
  return [...buffer];
}
