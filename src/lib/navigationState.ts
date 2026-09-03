// Estado central de navegação da UI (Fase 3).
//
// Responsabilidades:
//  - modelar o estado visual das abas (subabas, modos de visualização,
//    filtros, buscas, seleção e posição de scroll);
//  - persistir com chaves padronizadas e versionadas;
//  - isolar por usuário (evita vazar contexto entre contas no mesmo browser);
//  - validar/limpar estados antigos ou inválidos (fallback seguro).
//
// Regras de armazenamento:
//  - sessionStorage → contexto de sessão (subabas, filtros, buscas, scroll,
//    seleção). Some ao fechar o navegador.
//  - localStorage   → apenas preferências duráveis e não sensíveis
//    (modo Lista/Cards, sidebar recolhida).
// Nunca persistimos objetos de domínio (clientes, contratos, pagamentos),
// tokens ou permissões.

export const NAV_STATE_VERSION = 1;

export const NAV_KEYS = {
  activeTab: "app:navigation:active-tab",
  subTabs: "app:navigation:subtabs",
  viewModes: "app:navigation:view-modes",
  filters: "app:navigation:filters",
  searches: "app:navigation:searches",
  selected: "app:navigation:selected",
  scroll: "app:navigation:scroll",
} as const;

export type NavStoreKey = (typeof NAV_KEYS)[keyof typeof NAV_KEYS];

type Envelope<T> = { version: number; state: T };

let scopeId = "anon";

/** Define o escopo (usuário) usado nas chaves persistidas. */
export function setNavigationScope(userId: string | null | undefined) {
  const next = userId ? `u:${userId}` : "anon";
  if (next !== scopeId) scopeId = next;
}

export function getNavigationScope() {
  return scopeId;
}

function scopedKey(key: NavStoreKey) {
  return `${key}:${scopeId}`;
}

function storageFor(kind: "session" | "local"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Lê um mapa persistido, validando versão e formato. Nunca lança. */
export function readNavMap<T extends Record<string, unknown>>(
  key: NavStoreKey,
  kind: "session" | "local" = "session",
): Partial<T> {
  const storage = storageFor(kind);
  if (!storage) return {};
  try {
    const raw = storage.getItem(scopedKey(key));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Envelope<T> | null;
    if (!parsed || typeof parsed !== "object") return {};
    if (parsed.version !== NAV_STATE_VERSION) {
      // Estrutura de versão antiga → descarta silenciosamente.
      storage.removeItem(scopedKey(key));
      return {};
    }
    if (!parsed.state || typeof parsed.state !== "object" || Array.isArray(parsed.state)) return {};
    return parsed.state as Partial<T>;
  } catch {
    return {};
  }
}

export function writeNavMap<T extends Record<string, unknown>>(
  key: NavStoreKey,
  state: Partial<T>,
  kind: "session" | "local" = "session",
) {
  const storage = storageFor(kind);
  if (!storage) return;
  try {
    storage.setItem(scopedKey(key), JSON.stringify({ version: NAV_STATE_VERSION, state } satisfies Envelope<Partial<T>>));
  } catch {
    /* quota / modo privado: ignora */
  }
}

export function readNavEntry<V>(
  key: NavStoreKey,
  entry: string,
  kind: "session" | "local" = "session",
): V | undefined {
  return readNavMap<Record<string, V>>(key, kind)[entry];
}

export function writeNavEntry<V>(
  key: NavStoreKey,
  entry: string,
  value: V,
  kind: "session" | "local" = "session",
) {
  const current = readNavMap<Record<string, V>>(key, kind);
  writeNavMap<Record<string, V>>(key, { ...current, [entry]: value }, kind);
}

/**
 * Resolve um valor persistido contra a lista de opções válidas hoje.
 * Subabas removidas em versões novas caem no fallback sem erro.
 */
export function resolvePersistedOption<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Limpa todo o estado de navegação do escopo atual (ex.: logout). */
export function clearNavigationState() {
  const session = storageFor("session");
  const local = storageFor("local");
  Object.values(NAV_KEYS).forEach((key) => {
    try {
      session?.removeItem(scopedKey(key));
      local?.removeItem(scopedKey(key));
    } catch {
      /* noop */
    }
  });
}

// ---------------------------------------------------------------------------
// Scroll por aba
// ---------------------------------------------------------------------------

type ScrollMap = Record<string, number>;

export function saveTabScroll(tab: string, position: number) {
  if (!Number.isFinite(position) || position < 0) return;
  writeNavEntry<number>(NAV_KEYS.scroll, tab, Math.round(position));
}

export function getTabScroll(tab: string): number | undefined {
  const value = readNavMap<ScrollMap>(NAV_KEYS.scroll)[tab];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
