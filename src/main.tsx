import "./lib/polyfills";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { bootstrapAppTheme } from "./hooks/useAppTheme";
import {
  IS_SUPABASE_CONFIGURED,
  MISSING_SUPABASE_ENV,
  USER_SUPABASE_STORAGE_KEY,
  USER_SUPABASE_URL,
} from "./integrations/supabase/userClient";
import { ConfigErrorScreen } from "./components/ConfigErrorScreen";
import { setupPWA, isStandaloneMode } from "./lib/pwa/registerPWA";
import { trackPWAEvent } from "./lib/pwa/events";

bootstrapAppTheme();





// Preserva a posição de scroll do usuário em qualquer interação/mutação.
// Sem isso, alguns navegadores (especialmente Chrome/WebView Android em PWA)
// realizam um "scroll restoration" automático a cada alteração da entrada
// atual do history — mesmo sem navegação real —, fazendo a página "pular"
// para o topo após qualquer ação (abrir menu, expandir card, pagar, editar).
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  try {
    window.history.scrollRestoration = "manual";
  } catch {
    /* noop */
  }
}

// Migração única: copia a sessão da storageKey padrão (derivada da URL do
// projeto externo) para a nova chave dedicada, preservando logins existentes
// após a unificação dos clients. Idempotente: roda no máximo uma vez por device.
(() => {
  try {
    const MIGRATED_FLAG = "sb-user-storagekey-migrated-v1";
    if (localStorage.getItem(MIGRATED_FLAG)) return;
    if (localStorage.getItem(USER_SUPABASE_STORAGE_KEY)) {
      localStorage.setItem(MIGRATED_FLAG, "1");
      return;
    }
    // Chave default do supabase-js: `sb-<project-ref>-auth-token`
    const ref = new URL(USER_SUPABASE_URL).host.split(".")[0];
    const legacyKey = `sb-${ref}-auth-token`;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) {
      localStorage.setItem(USER_SUPABASE_STORAGE_KEY, legacy);
    }
    localStorage.setItem(MIGRATED_FLAG, "1");
  } catch {
    /* noop */
  }
})();

// Cleanup único: remove API keys que ficaram em localStorage em versões
// anteriores. Os valores agora ficam exclusivamente no backend.
(() => {
  try {
    const CLEANED = "api-keys-localstorage-purged-v1";
    if (localStorage.getItem(CLEANED)) return;
    localStorage.removeItem("app_api_keys_v1");
    localStorage.removeItem("gdrive_api_key_override");
    localStorage.setItem(CLEANED, "1");
  } catch { /* noop */ }
})();

// Registro/limpeza do Service Worker centralizados em src/lib/pwa/registerPWA.ts
// (preview/iframe nunca registram; kill switch `?sw=off`; reload único).
trackPWAEvent("pwa_boot_started");
setupPWA();

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isInStandaloneMode = isStandaloneMode();

// Imersivo: tenta entrar em fullscreen no Android quando rodando como PWA instalado
if (isInStandaloneMode && !isInIframe) {
  const requestImmersive = async () => {
    try {
      const el: any = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req && !document.fullscreenElement) {
        await req.call(el, { navigationUI: "hide" }).catch(() => req.call(el));
      }
      // Trava orientação se suportado
      if (screen.orientation && (screen.orientation as any).lock) {
        (screen.orientation as any).lock("portrait").catch(() => {});
      }
    } catch {
      // ignore
    }
  };
  // Precisa de gesto do usuário em muitos browsers
  const onFirstInteraction = () => {
    requestImmersive();
    window.removeEventListener("pointerdown", onFirstInteraction);
    window.removeEventListener("touchstart", onFirstInteraction);
    window.removeEventListener("keydown", onFirstInteraction);
  };
  window.addEventListener("pointerdown", onFirstInteraction, { once: true });
  window.addEventListener("touchstart", onFirstInteraction, { once: true });
  window.addEventListener("keydown", onFirstInteraction, { once: true });
}

const rootEl = document.getElementById("root")!;
if (!IS_SUPABASE_CONFIGURED) {
  createRoot(rootEl).render(<ConfigErrorScreen missing={MISSING_SUPABASE_ENV} />);
} else {
  createRoot(rootEl).render(<App />);
}

// Marca de montagem consumida pelo bootstrap de recuperação do index.html:
// enquanto ela não existir, o loader inline permanece e o watchdog pode
// exibir a tela de recuperação.
try {
  (window as any).__APP_MOUNTED__ = true;
  document.documentElement.dataset.appMounted = "true";
  (window as any).__APP_BOOT_OK__?.();
} catch {
  /* noop */
}
trackPWAEvent("pwa_boot_completed");

