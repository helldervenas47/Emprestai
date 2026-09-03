import { useCallback, useEffect, useRef, useState } from "react";
import {
  NAV_KEYS,
  resolvePersistedOption,
  readNavEntry,
  writeNavEntry,
  type NavStoreKey,
} from "@/lib/navigationState";

/**
 * useState persistido e validado para subabas / modos de visualização /
 * buscas e filtros simples de cada aba.
 *
 * - `kind: "session"` (padrão) → contexto de sessão (subabas, buscas, filtros).
 * - `kind: "local"` → preferências duráveis não sensíveis (Lista/Cards).
 *
 * Valores persistidos que não existem mais nas `options` caem no fallback,
 * sem erro e sem quebrar a aba.
 */
export function usePersistentOption<T extends string>(
  entry: string,
  options: readonly T[],
  fallback: T,
  opts: { key?: NavStoreKey; kind?: "session" | "local" } = {},
): [T, (value: T) => void] {
  const key = opts.key ?? NAV_KEYS.subTabs;
  const kind = opts.kind ?? "session";

  const [value, setValueState] = useState<T>(() =>
    resolvePersistedOption(readNavEntry<string>(key, entry, kind), options, fallback),
  );

  const setValue = useCallback(
    (next: T) => {
      setValueState((current) => {
        if (current === next) return current;
        writeNavEntry<string>(key, entry, next, kind);
        return next;
      });
    },
    [entry, key, kind],
  );

  return [value, setValue];
}

/** Versão livre (string arbitrária, ex.: busca) persistida na sessão. */
export function usePersistentText(
  entry: string,
  fallback = "",
  opts: { key?: NavStoreKey; maxLength?: number } = {},
): [string, (value: string) => void] {
  const key = opts.key ?? NAV_KEYS.searches;
  const maxLength = opts.maxLength ?? 120;

  const [value, setValueState] = useState<string>(() => {
    const stored = readNavEntry<string>(key, entry);
    return typeof stored === "string" ? stored.slice(0, maxLength) : fallback;
  });

  const setValue = useCallback(
    (next: string) => {
      const safe = (next ?? "").slice(0, maxLength);
      setValueState(safe);
      writeNavEntry<string>(key, entry, safe);
    },
    [entry, key, maxLength],
  );

  return [value, setValue];
}

/**
 * Sincroniza um estado local já existente com a persistência, sem exigir
 * refatorar o componente que o declara.
 */
export function usePersistSync<T extends string>(entry: string, value: T, key: NavStoreKey = NAV_KEYS.subTabs) {
  const previous = useRef<T | null>(null);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    writeNavEntry<string>(key, entry, value);
  }, [entry, key, value]);
}
