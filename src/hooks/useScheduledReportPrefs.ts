import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";

export interface SchedulePrefs {
  enabled: boolean;
  send_time_1: string | null;
  send_time_2: string | null;
  send_time_3: string | null;
  send_whatsapp?: boolean;
  whatsapp_phone?: string | null;
}

export function useScheduledReportPrefs(table: string, defaultTime: string) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<SchedulePrefs>({
    enabled: false, send_time_1: defaultTime, send_time_2: null, send_time_3: null,
    send_whatsapp: false, whatsapp_phone: null,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from(table as any)
      .select("enabled, send_time_1, send_time_2, send_time_3, send_whatsapp, whatsapp_phone")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setPrefs({
        enabled: Boolean((data as any).enabled),
        send_time_1: (data as any).send_time_1,
        send_time_2: (data as any).send_time_2,
        send_time_3: (data as any).send_time_3,
        send_whatsapp: Boolean((data as any).send_whatsapp),
        whatsapp_phone: (data as any).whatsapp_phone ?? null,
      });
    }
    setLoading(false);
  }, [user, table]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (next: Partial<SchedulePrefs>) => {
    if (!user) return;
    const merged = { ...prefs, ...next };
    const scheduleChanged = ["send_time_1", "send_time_2", "send_time_3"].some(
      (key) => key in next && next[key as keyof SchedulePrefs] !== prefs[key as keyof SchedulePrefs],
    );
    setPrefs(merged);
    await supabase
      .from(table as any)
      .upsert({ user_id: user.id, ...merged, ...(scheduleChanged ? { last_sent: {} } : {}) } as any, { onConflict: "user_id" });
  }, [user, prefs, table]);

  return { prefs, loading, save };
}
