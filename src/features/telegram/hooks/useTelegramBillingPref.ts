import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export interface TelegramBillingPref {
  enabled: boolean;
  send_time_1: string | null;
  send_time_2: string | null;
  send_time_3: string | null;
}

const DEFAULT: TelegramBillingPref = {
  enabled: false,
  send_time_1: "08:00",
  send_time_2: null,
  send_time_3: null,
};

export function useTelegramBillingPref() {
  const { user } = useAuth();
  const [pref, setPref] = useState<TelegramBillingPref>(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("telegram_billing_prefs" as any)
        .select("enabled, send_time_1, send_time_2, send_time_3")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setPref({
        enabled: (data as any).enabled,
        send_time_1: (data as any).send_time_1,
        send_time_2: (data as any).send_time_2,
        send_time_3: (data as any).send_time_3,
      });
      setLoading(false);
    })();
  }, [user]);

  const update = useCallback(async (updates: Partial<TelegramBillingPref>) => {
    if (!user) return;
    const next = { ...pref, ...updates };
    setPref(next);
    await supabase.from("telegram_billing_prefs" as any).upsert(
      {
        user_id: user.id,
        enabled: next.enabled,
        send_time_1: next.send_time_1,
        send_time_2: next.send_time_2,
        send_time_3: next.send_time_3,
      },
      { onConflict: "user_id" }
    );
  }, [user, pref]);

  return { pref, loading, update };
}
