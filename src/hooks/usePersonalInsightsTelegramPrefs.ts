import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";

export type InsightTone = "balanced" | "strict" | "motivational" | "technical" | "friendly";

export interface PersonalInsightsTgPrefs {
  enabled: boolean;
  send_time_1: string | null;
  send_time_2: string | null;
  send_time_3: string | null;
  alert_on_exceed: boolean;
  alert_on_trend: boolean;
  tone: InsightTone;
}

const DEFAULT_PREFS: PersonalInsightsTgPrefs = {
  enabled: false,
  send_time_1: null,
  send_time_2: null,
  send_time_3: null,
  alert_on_exceed: true,
  alert_on_trend: true,
  tone: "balanced",
};

export function usePersonalInsightsTelegramPrefs() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<PersonalInsightsTgPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("personal_insights_telegram_prefs" as any)
      .select("enabled, send_time_1, send_time_2, send_time_3, alert_on_exceed, alert_on_trend, tone")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setPrefs({
        enabled: (data as any).enabled,
        send_time_1: (data as any).send_time_1,
        send_time_2: (data as any).send_time_2,
        send_time_3: (data as any).send_time_3,
        alert_on_exceed: (data as any).alert_on_exceed,
        alert_on_trend: (data as any).alert_on_trend,
        tone: ((data as any).tone as InsightTone) ?? "balanced",
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (next: Partial<PersonalInsightsTgPrefs>) => {
    if (!user) return;
    setSaving(true);
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    try {
      await supabase
        .from("personal_insights_telegram_prefs" as any)
        .upsert({
          user_id: user.id,
          ...merged,
        } as any, { onConflict: "user_id" });
    } finally {
      setSaving(false);
    }
  }, [user, prefs]);

  return { prefs, loading, saving, save, reload: load };
}
