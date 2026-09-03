import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export interface TelegramAccumulatedDelinquencyPrefs {
  enabled: boolean;
  send_time_1: string | null;
  send_time_2: string | null;
  send_time_3: string | null;
}

const DEFAULT_PREFS: TelegramAccumulatedDelinquencyPrefs = {
  enabled: false,
  send_time_1: "08:00",
  send_time_2: null,
  send_time_3: null,
};

export function useTelegramAccumulatedDelinquencyPrefs() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<TelegramAccumulatedDelinquencyPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("telegram_accumulated_delinquency_prefs" as any)
      .select("enabled, send_time_1, send_time_2, send_time_3")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setPrefs({
        enabled: (data as any).enabled,
        send_time_1: (data as any).send_time_1,
        send_time_2: (data as any).send_time_2,
        send_time_3: (data as any).send_time_3,
      });
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (next: Partial<TelegramAccumulatedDelinquencyPrefs>) => {
    if (!user) return;
    setSaving(true);
    const merged = { ...prefs, ...next };
    setPrefs(merged);

    try {
      await supabase
        .from("telegram_accumulated_delinquency_prefs" as any)
        .upsert({ user_id: user.id, ...merged } as any, { onConflict: "user_id" });
    } finally {
      setSaving(false);
    }
  }, [user, prefs]);

  return { prefs, loading, saving, save, reload: load };
}
