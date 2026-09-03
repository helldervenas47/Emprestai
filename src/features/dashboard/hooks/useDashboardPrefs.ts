import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export type ExtraCardKey =
  | "composicao"
  | "projecao30"
  | "savingsRate"
  | "runway"
  | "topCategories"
  | "biggest"
  | "nextIncomes7"
  | "nextBills7"
  | "piggySummary"
  | "monthCompare";

export type MaosVisibility = {
  account: boolean;
  cash: boolean;
  incomes: boolean;
  piggy: boolean;
  vehicle: boolean;
};

const LS_EXTRA = "balanceMaos.extraCards.v1";
const LS_VIS = "balanceMaos.visibility.v1";

export const DEFAULT_EXTRA: ExtraCardKey[] = ["composicao", "projecao30"];
export const DEFAULT_VIS: MaosVisibility = {
  account: true,
  cash: true,
  incomes: true,
  piggy: true,
  vehicle: true,
};

const VALID_KEYS: ExtraCardKey[] = [
  "composicao", "projecao30", "savingsRate", "runway", "topCategories",
  "biggest", "nextIncomes7", "nextBills7", "piggySummary", "monthCompare",
];

function readLocalExtra(): ExtraCardKey[] {
  if (typeof window === "undefined") return DEFAULT_EXTRA;
  try {
    const raw = localStorage.getItem(LS_EXTRA);
    if (!raw) return DEFAULT_EXTRA;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_EXTRA;
    return (parsed as any[]).filter((k) => VALID_KEYS.includes(k)).slice(0, 2) as ExtraCardKey[];
  } catch { return DEFAULT_EXTRA; }
}

function readLocalVis(): MaosVisibility {
  if (typeof window === "undefined") return DEFAULT_VIS;
  try {
    const raw = localStorage.getItem(LS_VIS);
    if (!raw) return DEFAULT_VIS;
    return { ...DEFAULT_VIS, ...JSON.parse(raw) };
  } catch { return DEFAULT_VIS; }
}

/**
 * Preferências do dashboard "Consolidado total" (cards extras + visibilidade do "em mãos").
 * Por usuário, persistidas no Supabase para sincronizar entre dispositivos.
 * Mantém cache local em localStorage para resposta imediata enquanto carrega.
 */
export function useDashboardPrefs() {
  const { user } = useAuth();
  const instanceId = useId();
  const [extraCards, setExtraCardsState] = useState<ExtraCardKey[]>(readLocalExtra);
  const [visibility, setVisibilityState] = useState<MaosVisibility>(readLocalVis);
  const [loaded, setLoaded] = useState(false);

  // Carrega do banco quando o usuário entra
  useEffect(() => {
    if (!user) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("user_dashboard_prefs")
        .select("extra_cards, maos_visibility")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const ec = Array.isArray(data.extra_cards)
          ? (data.extra_cards as any[]).filter((k) => VALID_KEYS.includes(k)).slice(0, 2) as ExtraCardKey[]
          : DEFAULT_EXTRA;
        const vis = { ...DEFAULT_VIS, ...(data.maos_visibility || {}) };
        setExtraCardsState(ec);
        setVisibilityState(vis);
        try {
          localStorage.setItem(LS_EXTRA, JSON.stringify(ec));
          localStorage.setItem(LS_VIS, JSON.stringify(vis));
        } catch {}
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Realtime entre dispositivos
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`dashboard-prefs-${user.id}:${instanceId}`);
    ch.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "user_dashboard_prefs", filter: `user_id=eq.${user.id}` },
      (payload: any) => {
        const row = payload.new;
        if (!row) return;
        const ec = Array.isArray(row.extra_cards)
          ? (row.extra_cards as any[]).filter((k) => VALID_KEYS.includes(k)).slice(0, 2) as ExtraCardKey[]
          : DEFAULT_EXTRA;
        const vis = { ...DEFAULT_VIS, ...(row.maos_visibility || {}) };
        setExtraCardsState(ec);
        setVisibilityState(vis);
      },
    );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, instanceId]);

  const persistExtra = useCallback(async (ec: ExtraCardKey[]) => {
    try { localStorage.setItem(LS_EXTRA, JSON.stringify(ec)); } catch {}
    if (!user) return;
    await (supabase as any)
      .from("user_dashboard_prefs")
      .upsert({ user_id: user.id, extra_cards: ec, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }, [user]);

  const persistVis = useCallback(async (v: MaosVisibility) => {
    try { localStorage.setItem(LS_VIS, JSON.stringify(v)); } catch {}
    if (!user) return;
    await (supabase as any)
      .from("user_dashboard_prefs")
      .upsert({ user_id: user.id, maos_visibility: v, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }, [user]);

  const setExtraCards = useCallback((updater: ExtraCardKey[] | ((cur: ExtraCardKey[]) => ExtraCardKey[])) => {
    setExtraCardsState((cur) => {
      const next = typeof updater === "function" ? (updater as any)(cur) : updater;
      persistExtra(next);
      return next;
    });
  }, [persistExtra]);

  const setVisibility = useCallback((updater: MaosVisibility | ((cur: MaosVisibility) => MaosVisibility)) => {
    setVisibilityState((cur) => {
      const next = typeof updater === "function" ? (updater as any)(cur) : updater;
      persistVis(next);
      return next;
    });
  }, [persistVis]);

  const toggleExtra = useCallback((key: ExtraCardKey) => {
    setExtraCards((cur) => {
      if (cur.includes(key)) return cur.filter((k) => k !== key);
      if (cur.length >= 2) return [cur[1], key];
      return [...cur, key];
    });
  }, [setExtraCards]);

  const toggleVis = useCallback((key: keyof MaosVisibility) => {
    setVisibility((v) => ({ ...v, [key]: !v[key] }));
  }, [setVisibility]);

  return { extraCards, visibility, setExtraCards, setVisibility, toggleExtra, toggleVis, loaded };
}
