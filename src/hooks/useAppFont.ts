import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fontes suportadas pelo seletor global. `family` é o valor CSS
 * exato que entra em `--app-font-sans`; `google` é o slug usado
 * para carregar a fonte via Google Fonts sob demanda.
 */
export type AppFontId =
  | "picpay-sans"
  | "dm-sans"
  | "inter"
  | "manrope"
  | "plus-jakarta"
  | "geist"
  | "ibm-plex"
  | "public-sans"
  | "source-sans"
  | "nunito-sans";

export interface AppFontDef {
  id: AppFontId;
  label: string;
  family: string; // valor completo do CSS font-family
  google: string; // "Family+Name:wght@..."
  displayFamily?: string; // opcional: fonte para títulos (default = mesma)
  sample: string; // preview curto
}

export const APP_FONTS: AppFontDef[] = [
  {
    id: "picpay-sans",
    label: "PicPay Sans",
    // A PicPay Sans é proprietária: usamos ela quando instalada no dispositivo
    // e caímos em Figtree (métrica/desenho geométrico muito próximos) via Google Fonts.
    family: '"PicPay Sans", "PicPaySans", "Figtree", system-ui, sans-serif',
    google: "Figtree:wght@400;500;600;700;800",
    sample: "Padrão do app · geométrica e limpa",
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    family: '"DM Sans", system-ui, sans-serif',
    google: "DM+Sans:wght@400;500;600;700",
    displayFamily: '"Space Grotesk", "DM Sans", sans-serif',
    sample: "Padrão do sistema",
  },
  {
    id: "inter",
    label: "Inter",
    family: '"Inter", system-ui, sans-serif',
    google: "Inter:wght@400;500;600;700",
    sample: "Clássica, neutra, ampla legibilidade",
  },
  {
    id: "manrope",
    label: "Manrope",
    family: '"Manrope", system-ui, sans-serif',
    google: "Manrope:wght@400;500;600;700",
    sample: "Moderna, geométrica, tech",
  },
  {
    id: "plus-jakarta",
    label: "Plus Jakarta Sans",
    family: '"Plus Jakarta Sans", system-ui, sans-serif',
    google: "Plus+Jakarta+Sans:wght@400;500;600;700",
    sample: "Elegante, contemporânea",
  },
  {
    id: "geist",
    label: "Geist",
    family: '"Geist", system-ui, sans-serif',
    google: "Geist:wght@400;500;600;700",
    sample: "Minimalista, técnica (Vercel)",
  },
  {
    id: "ibm-plex",
    label: "IBM Plex Sans",
    family: '"IBM Plex Sans", system-ui, sans-serif',
    google: "IBM+Plex+Sans:wght@400;500;600;700",
    sample: "Corporativa, densa, precisa",
  },
  {
    id: "public-sans",
    label: "Public Sans",
    family: '"Public Sans", system-ui, sans-serif',
    google: "Public+Sans:wght@400;500;600;700",
    sample: "Institucional, oficial",
  },
  {
    id: "source-sans",
    label: "Source Sans 3",
    family: '"Source Sans 3", system-ui, sans-serif',
    google: "Source+Sans+3:wght@400;500;600;700",
    sample: "Confortável, editorial",
  },
  {
    id: "nunito-sans",
    label: "Nunito Sans",
    family: '"Nunito Sans", system-ui, sans-serif',
    google: "Nunito+Sans:wght@400;500;600;700",
    sample: "Amigável, arredondada",
  },
];

const STORAGE_KEY = "hvcred-app-font";
const LINK_ID = "hvcred-app-font-link";
const DEFAULT_ID: AppFontId = "picpay-sans";

function safeGet(): AppFontId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && APP_FONTS.some((f) => f.id === v)) return v as AppFontId;
  } catch {}
  return DEFAULT_ID;
}

function safeSet(id: AppFontId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
}

/** Injeta o link do Google Fonts para a fonte selecionada
 *  (uma única <link>, substituída ao trocar de fonte). */
function loadFont(def: AppFontDef) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  const href = `https://fonts.googleapis.com/css2?family=${def.google}&display=swap`;
  if (existing) {
    if (existing.getAttribute("href") !== href) existing.setAttribute("href", href);
    return;
  }
  const link = document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function applyFont(id: AppFontId) {
  const def = APP_FONTS.find((f) => f.id === id) ?? APP_FONTS[0];
  loadFont(def);
  const root = document.documentElement;
  root.style.setProperty("--app-font-sans", def.family);
  root.style.setProperty("--app-font-display", def.displayFamily ?? def.family);
  root.setAttribute("data-app-font", def.id);
}

/**
 * Hook global: aplica a fonte selecionada, hidrata da localStorage e
 * do banco (profile.ui_font — coluna opcional; ignora silenciosamente
 * se ainda não existir) e persiste em ambos os lados ao trocar.
 */
export function useAppFont() {
  const [font, setFontState] = useState<AppFontId>(() => safeGet());

  // Aplica no DOM sempre que muda
  useEffect(() => {
    applyFont(font);
  }, [font]);

  // Hidrata da nuvem (silencioso — coluna pode não existir)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getUser();
        const uid = sess?.user?.id;
        if (!uid) return;
        const { data, error } = await (supabase.from("profiles") as any)
          .select("ui_font")
          .eq("user_id", uid)
          .maybeSingle();
        if (!alive || error || !data) return;
        const remote = (data as { ui_font?: string | null }).ui_font;
        if (remote && APP_FONTS.some((f) => f.id === remote)) {
          setFontState(remote as AppFontId);
          safeSet(remote as AppFontId);
        }
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setFont = useCallback(async (id: AppFontId) => {
    setFontState(id);
    safeSet(id);
    applyFont(id);
    try {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess?.user?.id;
      if (!uid) return;
      // upsert silencioso; ignora erro se coluna não existir
      await (supabase.from("profiles") as any)
        .update({ ui_font: id })
        .eq("user_id", uid);
    } catch {
      /* silencioso */
    }
  }, []);

  return { font, setFont, fonts: APP_FONTS };
}

/** Componente montado uma vez no App para aplicar a fonte no boot. */
export function AppFontSync() {
  useAppFont();
  return null;
}
