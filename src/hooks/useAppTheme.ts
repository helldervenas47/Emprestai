import { useCallback, useEffect, useState } from "react";

export type AppThemeId =
  | "padrao"
  | "cyberpunk"
  | "glass"
  | "dark-ai"
  | "data-vision"
  | "light-future"
  | "nord"
  | "sunset"
  | "forest"
  | "neo-brutal"
  | "mocha"
  | "synthwave"
  | "rose-pine"
  | "monochrome";

export type AppMode = "auto" | "light" | "dark";

export interface AppThemeDef {
  id: AppThemeId;
  name: string;
  description: string;
  swatch: string[]; // hex previews
  /** "dark" forces dark, "light" forces light, "any" honors mode */
  appearance: "dark" | "light" | "any";
}

export const APP_THEMES: AppThemeDef[] = [
  {
    id: "padrao",
    name: "Tema Padrão",
    description: "O visual atual do aplicativo. Equilibrado e familiar.",
    swatch: ["#4f46e5", "#22d3ee", "#0f172a", "#f8fafc"],
    appearance: "any",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Neon",
    description: "Tons escuros com azul elétrico, roxo e ciano vibrantes.",
    swatch: ["#0a0a1a", "#a855f7", "#22d3ee", "#3b82f6"],
    appearance: "dark",
  },
  {
    id: "glass",
    name: "Glassmorphism",
    description: "Transparências suaves, blur e estética minimalista.",
    swatch: ["#e0e7ff", "#a5b4fc", "#f8fafc", "#64748b"],
    appearance: "any",
  },
  {
    id: "dark-ai",
    name: "Dark AI",
    description: "Interface escura premium inspirada em IA.",
    swatch: ["#0b0f19", "#1e293b", "#10b981", "#a78bfa"],
    appearance: "dark",
  },
  {
    id: "data-vision",
    name: "Data Vision",
    description: "Otimizado para dashboards, gráficos e indicadores.",
    swatch: ["#082f49", "#0ea5e9", "#f59e0b", "#10b981"],
    appearance: "dark",
  },
  {
    id: "light-future",
    name: "Light Future",
    description: "Visual clean futurista com branco suave e holográfico.",
    swatch: ["#ffffff", "#e0f2fe", "#7c3aed", "#06b6d4"],
    appearance: "light",
  },
  {
    id: "nord",
    name: "Nord Arctic",
    description: "Paleta nórdica fria e minimalista, inspirada em gelo polar.",
    swatch: ["#2e3440", "#3b4252", "#88c0d0", "#a3be8c"],
    appearance: "dark",
  },
  {
    id: "sunset",
    name: "Sunset Vibes",
    description: "Tons quentes de pôr-do-sol: laranja, rosa e magenta.",
    swatch: ["#1a0f1f", "#ff6b35", "#f72585", "#ffb627"],
    appearance: "dark",
  },
  {
    id: "forest",
    name: "Forest Zen",
    description: "Verdes naturais e terrosos, calmo e orgânico.",
    swatch: ["#1b2d2a", "#2d4a3e", "#7cb342", "#c9a96e"],
    appearance: "dark",
  },
  {
    id: "neo-brutal",
    name: "Neo Brutalism",
    description: "Alto contraste, bordas duras e cores saturadas. Tendência 2024/2025.",
    swatch: ["#fefae0", "#000000", "#ffbe0b", "#fb5607"],
    appearance: "light",
  },
  {
    id: "mocha",
    name: "Coffee Mocha",
    description: "Tons quentes de café, caramelo e creme. Aconchegante.",
    swatch: ["#1e1611", "#3c2a1e", "#c89f7d", "#e8c39e"],
    appearance: "dark",
  },
  {
    id: "synthwave",
    name: "Synthwave 84",
    description: "Retrô-futurista anos 80 com neon rosa e ciano sobre roxo profundo.",
    swatch: ["#1a0b2e", "#ff2a6d", "#05d9e8", "#d1f7ff"],
    appearance: "dark",
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    description: "Paleta suave inspirada em rosas e pinheiros. Elegante e quente.",
    swatch: ["#191724", "#26233a", "#ebbcba", "#c4a7e7"],
    appearance: "dark",
  },
  {
    id: "monochrome",
    name: "Pure Monochrome",
    description: "Preto e branco puros com tipografia em destaque. Editorial.",
    swatch: ["#ffffff", "#e5e5e5", "#171717", "#000000"],
    appearance: "light",
  },
];

const THEME_KEY = "hvcred-app-theme";
const MODE_KEY = "hvcred-app-mode";
const PRIMARY_KEY = "hvcred-app-primary";
const SECONDARY_KEY = "hvcred-app-secondary";
const LEGACY_DARK_KEY = "hvcred-theme";

function safeGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
}

function resolveDark(theme: AppThemeId, mode: AppMode): boolean {
  const def = APP_THEMES.find(t => t.id === theme) ?? APP_THEMES[0];
  if (def.appearance === "dark") return true;
  if (def.appearance === "light") return false;
  if (mode === "dark") return true;
  if (mode === "light") return false;
  // auto → tema padrão respeita o legado/sistema
  const legacy = safeGet(LEGACY_DARK_KEY);
  if (legacy === "dark") return true;
  if (legacy === "light") return false;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return true;
}

function applyToDom(theme: AppThemeId, mode: AppMode, primary: string | null, secondary: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark = resolveDark(theme, mode);
  root.classList.toggle("dark", isDark);
  if (theme === "padrao") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  if (primary) root.style.setProperty("--primary", primary);
  else root.style.removeProperty("--primary");
  if (secondary) root.style.setProperty("--accent", secondary);
  else root.style.removeProperty("--accent");
  // mantém compat com legado
  safeSet(LEGACY_DARK_KEY, isDark ? "dark" : "light");
}

export function useAppTheme() {
  const [theme, setThemeState] = useState<AppThemeId>(() => {
    const v = safeGet(THEME_KEY) as AppThemeId | null;
    return (v && APP_THEMES.some(t => t.id === v)) ? v : "padrao";
  });
  const [mode, setModeState] = useState<AppMode>(() => {
    const v = safeGet(MODE_KEY) as AppMode | null;
    return (v === "auto" || v === "light" || v === "dark") ? v : "auto";
  });
  const [primary, setPrimaryState] = useState<string | null>(() => safeGet(PRIMARY_KEY));
  const [secondary, setSecondaryState] = useState<string | null>(() => safeGet(SECONDARY_KEY));

  useEffect(() => { applyToDom(theme, mode, primary, secondary); }, [theme, mode, primary, secondary]);

  // segue mudanças do sistema quando em "auto" + tema neutro
  useEffect(() => {
    if (mode !== "auto") return;
    const def = APP_THEMES.find(t => t.id === theme);
    if (def && def.appearance !== "any") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyToDom(theme, mode, primary, secondary);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, mode, primary, secondary]);

  const setTheme = useCallback((t: AppThemeId) => {
    setThemeState(t);
    safeSet(THEME_KEY, t);
  }, []);
  const setMode = useCallback((m: AppMode) => {
    setModeState(m);
    safeSet(MODE_KEY, m);
  }, []);
  const setPrimary = useCallback((hsl: string | null) => {
    setPrimaryState(hsl);
    safeSet(PRIMARY_KEY, hsl);
  }, []);
  const setSecondary = useCallback((hsl: string | null) => {
    setSecondaryState(hsl);
    safeSet(SECONDARY_KEY, hsl);
  }, []);
  const resetCustom = useCallback(() => {
    setPrimary(null);
    setSecondary(null);
  }, [setPrimary, setSecondary]);

  const isDark = resolveDark(theme, mode);

  return { theme, mode, primary, secondary, isDark, setTheme, setMode, setPrimary, setSecondary, resetCustom };
}

/** Bootstrap inicial — chamado em main.tsx para evitar flash. */
export function bootstrapAppTheme() {
  if (typeof document === "undefined") return;
  const theme = (safeGet(THEME_KEY) as AppThemeId | null) ?? "padrao";
  const mode = (safeGet(MODE_KEY) as AppMode | null) ?? "auto";
  const primary = safeGet(PRIMARY_KEY);
  const secondary = safeGet(SECONDARY_KEY);
  const validTheme = APP_THEMES.some(t => t.id === theme) ? theme : "padrao";
  applyToDom(validTheme, mode, primary, secondary);
}
