import { useCallback, useEffect, useState } from "react";

const KEY_PREFIX = "lov:desc-history:";
const TEMPLATE_PREFIX = "lov:desc-template:";
const MAX = 30;

export type DescriptionTemplate = {
  description: string;
  amount?: number | string;
  category?: string;
  notes?: string;
  paymentMethodId?: string | null;
  clientName?: string;
  // free-form extras for forms with extra fields
  [key: string]: unknown;
};

/**
 * Canonical key used to compare descriptions: trim, collapse internal
 * whitespace, lowercase, strip diacritics. "  Café  da  Manhã " and
 * "cafe da manha" map to the same key.
 */
export function normalizeDescription(value: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Local-only suggestion store for "descrição" inputs.
 * Saves into localStorage scoped by `scope` (e.g. "expense", "income", "personal-expense").
 * Use with a native <datalist> for instant, zero-cost autocomplete.
 *
 * Also stores per-description templates so subsequent entries with the same
 * description can pre-fill amount, category, notes, etc.
 *
 * Matching is accent/case/whitespace-insensitive via `normalizeDescription`.
 */
export function useDescriptionHistory(scope: string) {
  const key = KEY_PREFIX + scope;
  const tKey = TEMPLATE_PREFIX + scope;
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Record<string, DescriptionTemplate>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSuggestions(parsed.filter((x) => typeof x === "string"));
      }
    } catch {
      /* ignore corrupt history */
    }
    try {
      const raw = localStorage.getItem(tKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          // Re-key legacy entries under the normalized key so old data still
          // matches the new normalization rules.
          const rekeyed: Record<string, DescriptionTemplate> = {};
          for (const [, tpl] of Object.entries(parsed as Record<string, DescriptionTemplate>)) {
            if (!tpl || typeof tpl !== "object") continue;
            const k = normalizeDescription(tpl.description ?? "");
            if (k && !rekeyed[k]) rekeyed[k] = tpl;
          }
          setTemplates(rekeyed);
        }
      }
    } catch {
      /* ignore */
    }
  }, [key, tKey]);

  const record = useCallback(
    (value: string, template?: Omit<DescriptionTemplate, "description">) => {
      const v = (value ?? "").trim();
      const k = normalizeDescription(v);
      if (!k) return;
      setSuggestions((prev) => {
        const next = [v, ...prev.filter((p) => normalizeDescription(p) !== k)].slice(0, MAX);
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* quota / disabled — ignore */
        }
        return next;
      });
      if (template) {
        setTemplates((prev) => {
          const next = { ...prev, [k]: { description: v, ...template } };
          try {
            localStorage.setItem(tKey, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
      }
    },
    [key, tKey],
  );

  const findTemplate = useCallback(
    (value: string): DescriptionTemplate | null => {
      const k = normalizeDescription(value);
      if (!k) return null;
      return templates[k] ?? null;
    },
    [templates],
  );

  /**
   * Bulk-seed templates and suggestions from existing data (e.g. historical
   * rows loaded from the database). Stored/manual entries always take
   * precedence — seeded values only fill gaps. Does not persist to storage.
   */
  const seed = useCallback(
    (entries: DescriptionTemplate[]) => {
      if (!Array.isArray(entries) || entries.length === 0) return;
      setTemplates((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const entry of entries) {
          const k = normalizeDescription(entry.description ?? "");
          if (!k) continue;
          if (!next[k]) {
            next[k] = { ...entry, description: (entry.description ?? "").trim() };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setSuggestions((prev) => {
        const have = new Set(prev.map((p) => normalizeDescription(p)));
        const additions: string[] = [];
        for (const entry of entries) {
          const d = (entry.description ?? "").trim();
          const k = normalizeDescription(d);
          if (k && !have.has(k)) {
            have.add(k);
            additions.push(d);
          }
        }
        if (additions.length === 0) return prev;
        return [...prev, ...additions].slice(0, MAX * 4);
      });
    },
    [],
  );

  return { suggestions, record, findTemplate, seed };
}
