import { useEffect, useRef } from "react";

type FinanceDebugKind =
  | "mount"
  | "unmount"
  | "render"
  | "fetch start"
  | "fetch success"
  | "fetch error"
  | "realtime event"
  | "invalidate/refetch"
  | "setState important";

type FinanceDebugEntry = {
  at: string;
  ms: number;
  kind: FinanceDebugKind;
  scope: string;
  table?: string;
  detail?: unknown;
};

type ComponentStats = {
  mounts: number;
  unmounts: number;
  renders: number;
};

type HookStats = {
  renders: number;
  fetches: number;
  recentFetchStarts: number[];
};

type FinanceDebugStore = {
  startedAt: string;
  entries: FinanceDebugEntry[];
  components: Record<string, ComponentStats>;
  hooks: Record<string, HookStats>;
  fetchesByTable: Record<string, number>;
  repeatedFetchWarnings: Record<string, boolean>;
  repeatedMountWarnings: Record<string, boolean>;
  summary: () => unknown;
};

declare global {
  interface Window {
    __FINANCE_DEBUG__?: FinanceDebugStore;
  }
}

function isDev() {
  return Boolean(import.meta.env.DEV);
}

function isFinanceActive() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "expenses" || sessionStorage.getItem("activeTab") === "expenses";
  } catch {
    return false;
  }
}

function enabled() {
  return isDev() && isFinanceActive();
}

function store(): FinanceDebugStore | null {
  if (typeof window === "undefined" || !isDev()) return null;
  if (!window.__FINANCE_DEBUG__) {
    window.__FINANCE_DEBUG__ = {
      startedAt: new Date().toISOString(),
      entries: [],
      components: {},
      hooks: {},
      fetchesByTable: {},
      repeatedFetchWarnings: {},
      repeatedMountWarnings: {},
      summary(this: FinanceDebugStore) {
        const firstRepeatedComponent = (Object.entries(this.components) as Array<[string, ComponentStats]>)
          .find(([, stats]) => stats.mounts > 2 || (stats.mounts > 1 && stats.unmounts > 0));
        const fetchEntries = this.entries.filter((entry) => entry.kind === "fetch start");
        let firstRepeatedHook: { scope: string; table?: string; fetchesIn10s: number; at: string } | null = null;
        for (let index = 0; index < fetchEntries.length; index += 1) {
          const current = fetchEntries[index];
          const windowEntries = fetchEntries.filter(
            (entry) => entry.scope === current.scope && entry.ms >= current.ms && entry.ms - current.ms <= 10_000,
          );
          if (windowEntries.length > 5) {
            firstRepeatedHook = {
              scope: current.scope,
              table: current.table,
              fetchesIn10s: windowEntries.length,
              at: current.at,
            };
            break;
          }
        }
        return {
          startedAt: this.startedAt,
          components: this.components,
          hooks: this.hooks,
          fetchesByTable: this.fetchesByTable,
          firstRepeatedComponent: firstRepeatedComponent
            ? {
                name: firstRepeatedComponent[0],
                mounts: firstRepeatedComponent[1].mounts,
                unmounts: firstRepeatedComponent[1].unmounts,
                renders: firstRepeatedComponent[1].renders,
              }
            : null,
          firstRepeatedHook,
          firstEntries: this.entries.slice(0, 30),
          lastEntries: this.entries.slice(-60),
          noTanStackQueryKeysFound: true,
        };
      },
    };
  }
  return window.__FINANCE_DEBUG__;
}

export function financeDebug(kind: FinanceDebugKind, scope: string, detail?: unknown, table?: string) {
  if (!enabled()) return;
  const s = store();
  if (!s) return;
  const entry: FinanceDebugEntry = {
    at: new Date().toISOString(),
    ms: Math.round(performance.now()),
    kind,
    scope,
    table,
    detail,
  };
  s.entries.push(entry);
  if (s.entries.length > 1000) s.entries.splice(0, s.entries.length - 1000);

  const prefix = `[FINANCE-DEBUG] ${kind} :: ${scope}${table ? ` :: ${table}` : ""}`;
  if (kind === "fetch error") console.warn(prefix, detail ?? "");
  else console.debug(prefix, detail ?? "");
}

export function useFinanceComponentDebug(name: string) {
  const renderCount = useRef(0);
  renderCount.current += 1;

  if (enabled()) {
    const s = store();
    if (s) {
      const stats = (s.components[name] ??= { mounts: 0, unmounts: 0, renders: 0 });
      stats.renders += 1;
    }
    financeDebug("render", name, { renderCount: renderCount.current });
  }

  useEffect(() => {
    if (!enabled()) return;
    const s = store();
    const stats = s ? (s.components[name] ??= { mounts: 0, unmounts: 0, renders: 0 }) : null;
    if (stats) {
      stats.mounts += 1;
      if (stats.mounts > 2 && s && !s.repeatedMountWarnings[name]) {
        s.repeatedMountWarnings[name] = true;
        console.warn(`[FINANCE-DEBUG] repeated mount detected :: ${name}`, { mounts: stats.mounts, unmounts: stats.unmounts });
      }
    }
    financeDebug("mount", name, { mounts: stats?.mounts ?? 1 });
    return () => {
      if (!enabled()) return;
      const s2 = store();
      const stats2 = s2 ? (s2.components[name] ??= { mounts: 0, unmounts: 0, renders: 0 }) : null;
      if (stats2) stats2.unmounts += 1;
      financeDebug("unmount", name, { unmounts: stats2?.unmounts ?? 1, renders: renderCount.current });
    };
  }, [name]);
}

export function useFinanceHookDebug(name: string) {
  const renderCount = useRef(0);
  renderCount.current += 1;
  if (enabled()) {
    const s = store();
    if (s) {
      const stats = (s.hooks[name] ??= { renders: 0, fetches: 0, recentFetchStarts: [] });
      stats.renders += 1;
    }
    financeDebug("render", name, { renderCount: renderCount.current });
  }
}

export function financeFetchStart(scope: string, table: string, detail?: unknown) {
  if (!enabled()) return;
  const s = store();
  if (s) {
    const hook = (s.hooks[scope] ??= { renders: 0, fetches: 0, recentFetchStarts: [] });
    const now = Date.now();
    hook.fetches += 1;
    hook.recentFetchStarts = [...hook.recentFetchStarts.filter((t) => now - t < 10_000), now];
    s.fetchesByTable[table] = (s.fetchesByTable[table] ?? 0) + 1;
    const warningKey = `${scope}:${table}`;
    if (hook.recentFetchStarts.length > 5 && !s.repeatedFetchWarnings[warningKey]) {
      s.repeatedFetchWarnings[warningKey] = true;
      console.warn(`[FINANCE-DEBUG] >5 fetches in 10s :: ${scope} :: ${table}`, {
        fetchesIn10s: hook.recentFetchStarts.length,
        totalFetches: hook.fetches,
        queryKey: null,
        table,
      });
    }
  }
  const safeDetail = detail && typeof detail === "object" ? detail : {};
  financeDebug("fetch start", scope, { queryKey: null, ...safeDetail }, table);
}

export function financeFetchSuccess(scope: string, table: string, detail?: unknown) {
  financeDebug("fetch success", scope, detail, table);
}

export function financeFetchError(scope: string, table: string, detail?: unknown) {
  financeDebug("fetch error", scope, detail, table);
}

export function financeRealtimeEvent(scope: string, table: string, detail?: unknown) {
  financeDebug("realtime event", scope, detail, table);
}

export function financeInvalidate(scope: string, table: string, detail?: unknown) {
  financeDebug("invalidate/refetch", scope, detail, table);
}

export function financeSetState(scope: string, label: string, detail?: unknown) {
  const safeDetail = detail && typeof detail === "object" ? detail : {};
  financeDebug("setState important", scope, { label, ...safeDetail });
}
