import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";
import { setAppTimezone, getAppTimezone, subscribeAppTimezone } from "@/lib/timezone";
import {
  loadSharedResource,
  invalidateSharedResource,
  readSharedResource,
  subscribeSharedResource,
  writeSharedResource,
} from "@/lib/sharedResource";

export interface AccountSettings {
  timezone: string;
  simulationInterestRate: number;
  maxCreditLimit: number | null;
}

// P1-01: staleTime alto — configurações raramente mudam.
const STALE_MS = 5 * 60_000;

async function fetchAccountSettings(dataOwnerId: string): Promise<AccountSettings> {
  const { data } = await (supabase as any)
    .from("account_settings")
    .select("timezone, simulation_interest_rate, max_credit_limit")
    .eq("owner_id", dataOwnerId)
    .maybeSingle();
  const tz = data?.timezone || "America/Sao_Paulo";
  const simulationInterestRate = Number(data?.simulation_interest_rate ?? 30);
  const rawMax = data?.max_credit_limit;
  const maxCreditLimit = rawMax === null || rawMax === undefined ? null : Number(rawMax);
  return {
    timezone: tz,
    simulationInterestRate: Number.isFinite(simulationInterestRate) ? simulationInterestRate : 30,
    maxCreditLimit: maxCreditLimit !== null && Number.isFinite(maxCreditLimit) ? maxCreditLimit : null,
  };
}

export function useAccountSettings() {
  const { user, dataOwnerId } = useAuth();
  const cacheKey = dataOwnerId ? `account_settings:${dataOwnerId}` : "";
  const [settings, setSettings] = useState<AccountSettings>(
    () => readSharedResource<AccountSettings>(cacheKey) ?? { timezone: getAppTimezone(), simulationInterestRate: 30, maxCreditLimit: null },
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Keep local state in sync with global cached timezone.
  useEffect(() => {
    const unsub = subscribeAppTimezone((tz) => setSettings((s) => ({ ...s, timezone: tz })));
    return unsub;
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!user || !dataOwnerId) return;
    setLoading(true);
    try {
      const next = await loadSharedResource(cacheKey, () => fetchAccountSettings(dataOwnerId), { staleTime: STALE_MS });
      setAppTimezone(next.timezone);
      setSettings(next);
    } finally {
      setLoading(false);
    }
  }, [user, dataOwnerId, cacheKey]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Assina o cache: qualquer atualização (upsert local ou reload) reflete aqui.
  useEffect(() => {
    if (!cacheKey) return;
    return subscribeSharedResource(cacheKey, () => {
      const next = readSharedResource<AccountSettings>(cacheKey);
      if (next) setSettings(next);
    });
  }, [cacheKey]);

  // Realtime removido (P0-02 egress): updates otimistas locais já mantêm o estado.
  // Se precisar propagar entre abas, dispatch `account-settings:changed`.
  useEffect(() => {
    const handler = () => {
      if (cacheKey) invalidateSharedResource(cacheKey);
      fetchSettings();
    };
    window.addEventListener("account-settings:changed", handler);
    return () => window.removeEventListener("account-settings:changed", handler);
  }, [fetchSettings, cacheKey]);

  const commit = useCallback((next: AccountSettings) => {
    setSettings(next);
    if (cacheKey) writeSharedResource(cacheKey, next);
  }, [cacheKey]);

  const updateTimezone = useCallback(async (timezone: string) => {
    if (!user || !dataOwnerId) return false;
    setSaving(true);
    setAppTimezone(timezone); // optimistic
    commit({ ...settings, timezone });
    const { error } = await (supabase as any)
      .from("account_settings")
      .upsert({ owner_id: dataOwnerId, timezone }, { onConflict: "owner_id" });
    setSaving(false);
    return !error;
  }, [user, dataOwnerId, settings, commit]);

  const updateSimulationInterestRate = useCallback(async (simulationInterestRate: number) => {
    if (!user || !dataOwnerId) return false;
    setSaving(true);
    commit({ ...settings, simulationInterestRate });
    const { error } = await (supabase as any)
      .from("account_settings")
      .upsert({ owner_id: dataOwnerId, simulation_interest_rate: simulationInterestRate }, { onConflict: "owner_id" });
    setSaving(false);
    return !error;
  }, [user, dataOwnerId, settings, commit]);

  /**
   * Sets (or clears) the global maximum credit limit. Pass `null` to remove the cap.
   */
  const updateMaxCreditLimit = useCallback(async (maxCreditLimit: number | null) => {
    if (!user || !dataOwnerId) return false;
    setSaving(true);
    commit({ ...settings, maxCreditLimit });
    const { error } = await (supabase as any)
      .from("account_settings")
      .upsert({ owner_id: dataOwnerId, max_credit_limit: maxCreditLimit }, { onConflict: "owner_id" });
    setSaving(false);
    return !error;
  }, [user, dataOwnerId, settings, commit]);

  return { settings, loading, saving, updateTimezone, updateSimulationInterestRate, updateMaxCreditLimit };
}
