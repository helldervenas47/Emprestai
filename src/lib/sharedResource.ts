// P1-01 Egress: cache compartilhado por (recurso, chave).
// Elimina fetch duplicado quando várias telas/componentes montam o mesmo
// hook simultaneamente ou em curto intervalo (troca de rota, remount).
//
// Não altera regras de negócio: cada hook fornece seu próprio `fetcher`.
// Consumidores continuam recebendo a mesma forma de retorno anterior.

type Entry<T> = {
  data: T | undefined;
  loadedAt: number;         // 0 quando nunca carregado
  inFlight: Promise<T> | null;
  subscribers: Set<() => void>;
  /** Incrementado a cada clear/invalidate destrutivo. Fetchers em voo comparam
   *  o valor capturado na chamada com o atual antes de escrever o resultado —
   *  se mudou, o resultado é descartado (evita vazar dados do usuário anterior
   *  após logout). */
  generation: number;
};

const store = new Map<string, Entry<any>>();

// -------- Persistência em localStorage (P1 perf: pinta a UI instantaneamente
// em cold reload, enquanto o fetch remoto acontece em paralelo). Só entradas
// pequenas são persistidas — payloads muito grandes são ignorados para não
// estourar o quota do localStorage.
const LS_PREFIX = "shared-res:";
// Alguns clientes têm milhares de receitas/despesas/vendas; 1.5MB descartava
// snapshots válidos e fazia a tela depender 100% do fetch remoto no cold start.
const LS_MAX_BYTES = 4_000_000; // ~4MB por chave, ainda abaixo do quota usual do browser

function lsRead<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function lsWrite(key: string, data: unknown) {
  try {
    const raw = JSON.stringify(data);
    if (raw.length > LS_MAX_BYTES) {
      localStorage.removeItem(LS_PREFIX + key);
      return;
    }
    localStorage.setItem(LS_PREFIX + key, raw);
  } catch {
    // quota exceeded / private mode: silencioso.
  }
}

function lsClearAll() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* noop */ }
}

function ensure<T>(key: string): Entry<T> {
  let e = store.get(key) as Entry<T> | undefined;
  if (!e) {
    // Hidrata do localStorage na primeira leitura (cold reload) — sem
    // marcar como fresco (loadedAt=0) para que o fetch remoto ainda rode.
    const persisted = lsRead<T>(key);
    e = {
      data: persisted,
      loadedAt: 0,
      inFlight: null,
      subscribers: new Set(),
      generation: 0,
    };
    store.set(key, e);
  }
  return e;
}

export interface SharedResourceOptions<T> {
  /** ms; abaixo disso reutiliza o cache sem refetch. Default 60_000. */
  staleTime?: number;
  /** força refetch mesmo se estiver fresco. */
  force?: boolean;
  /** substitui completamente `data` no cache (para updates otimistas). */
  seed?: T;
}

/** Lê o valor em cache (sync). Retorna `undefined` se ainda não carregado. */
export function readSharedResource<T>(key: string): T | undefined {
  return ensure<T>(key).data as T | undefined;
}

/** Escreve/substitui `data` no cache e notifica assinantes. */
export function writeSharedResource<T>(key: string, data: T) {
  const e = ensure<T>(key);
  e.data = data;
  e.loadedAt = Date.now();
  lsWrite(key, data);
  e.subscribers.forEach((cb) => cb());
}


/** Invalida (marca como stale). Próximo `loadSharedResource` refaz o fetch. */
export function invalidateSharedResource(key: string) {
  const e = store.get(key);
  if (!e) return;
  e.loadedAt = 0;
  e.subscribers.forEach((cb) => cb());
}

/** Assina alterações do cache. Retorna função de unsubscribe. */
export function subscribeSharedResource(key: string, cb: () => void): () => void {
  const e = ensure(key);
  e.subscribers.add(cb);
  return () => { e.subscribers.delete(cb); };
}

/**
 * Carrega o recurso com deduplicação: várias chamadas concorrentes
 * compartilham a mesma Promise. Se o cache estiver fresco (< staleTime),
 * retorna o valor imediatamente sem fetch.
 */
export async function loadSharedResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: SharedResourceOptions<T> = {},
): Promise<T> {
  const staleTime = opts.staleTime ?? 60_000;
  const e = ensure<T>(key);

  if (opts.seed !== undefined) {
    e.data = opts.seed;
    e.loadedAt = Date.now();
  }

  if (!opts.force && e.data !== undefined && Date.now() - e.loadedAt < staleTime) {
    return e.data;
  }
  if (e.inFlight) return e.inFlight;

  const startGen = e.generation;
  e.inFlight = (async () => {
    try {
      const data = await fetcher();
      // Se houve clearAll/invalidate destrutivo enquanto o fetch estava em voo,
      // descarta o resultado — evita repopular cache com dados do usuário anterior.
      if (e.generation !== startGen) return data;
      e.data = data;
      e.loadedAt = Date.now();
      lsWrite(key, data);
      e.subscribers.forEach((cb) => cb());
      return data;
    } finally {
      if (e.generation === startGen) e.inFlight = null;
    }
  })();
  return e.inFlight;
}

/** Limpa TODO o cache (usado no logout). Cancela efeito de fetches em voo. */
export function clearAllSharedResources() {
  store.forEach((e) => {
    e.generation += 1;
    e.data = undefined;
    e.loadedAt = 0;
    e.inFlight = null;
    e.subscribers.forEach((cb) => cb());
  });
  lsClearAll();
}
