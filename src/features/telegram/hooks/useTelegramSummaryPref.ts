import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export interface TelegramSummaryPref {
  enabled: boolean;
  send_time: string;
  weekly_enabled: boolean;
  weekly_send_time: string;
  weekly_send_weekday: number;
  monthly_enabled: boolean;
  monthly_send_time: string;
  monthly_send_day: number;
  monthly_format: "text" | "image";
}

export function useTelegramSummaryPref() {
  const { user } = useAuth();
  const [pref, setPref] = useState<TelegramSummaryPref>({
    enabled: false,
    send_time: "19:00",
    weekly_enabled: false,
    weekly_send_time: "09:00",
    weekly_send_weekday: 1,
    monthly_enabled: false,
    monthly_send_time: "09:00",
    monthly_send_day: 1,
    monthly_format: "text",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("telegram_summary_prefs" as any)
        .select("enabled, send_time, weekly_enabled, weekly_send_time, weekly_send_weekday, monthly_enabled, monthly_send_time, monthly_send_day, monthly_format")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setPref({
        enabled: (data as any).enabled,
        send_time: (data as any).send_time,
        weekly_enabled: (data as any).weekly_enabled ?? false,
        weekly_send_time: (data as any).weekly_send_time ?? "09:00",
        weekly_send_weekday: (data as any).weekly_send_weekday ?? 1,
        monthly_enabled: (data as any).monthly_enabled ?? false,
        monthly_send_time: (data as any).monthly_send_time ?? "09:00",
        monthly_send_day: (data as any).monthly_send_day ?? 1,
        monthly_format: ((data as any).monthly_format === "image" ? "image" : "text"),
      });
      setLoading(false);
    })();
  }, [user]);

  const update = useCallback(async (updates: Partial<TelegramSummaryPref>) => {
    if (!user) return;
    const next = { ...pref, ...updates };
    setPref(next);
    await supabase.from("telegram_summary_prefs" as any).upsert(
      {
        user_id: user.id,
        enabled: next.enabled,
        send_time: next.send_time,
        weekly_enabled: next.weekly_enabled,
        weekly_send_time: next.weekly_send_time,
        weekly_send_weekday: next.weekly_send_weekday,
        monthly_enabled: next.monthly_enabled,
        monthly_send_time: next.monthly_send_time,
        monthly_send_day: next.monthly_send_day,
        monthly_format: next.monthly_format,
      },
      { onConflict: "user_id" }
    );
  }, [user, pref]);

  return { pref, loading, update };
}
