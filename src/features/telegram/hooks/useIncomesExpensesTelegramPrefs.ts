import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export interface IncomesExpensesTgPrefs {
  enabled: boolean;
  send_time_1: string | null;
  send_time_2: string | null;
  send_time_3: string | null;
  send_target: "today" | "tomorrow";
  last_sent?: Record<string, string>;
}

const DEFAULT_PREFS: IncomesExpensesTgPrefs = {
  enabled: false,
  send_time_1: "08:00",
  send_time_2: null,
  send_time_3: null,
  send_target: "tomorrow",
  last_sent: {},
};

const TIME_KEYS = ["send_time_1", "send_time_2", "send_time_3"] as const;

export function useIncomesExpensesTelegramPrefs() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<IncomesExpensesTgPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("incomes_expenses_telegram_prefs" as any)
      .select("enabled, send_time_1, send_time_2, send_time_3, send_target, last_sent")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setPrefs({
        enabled: (data as any).enabled,
        send_time_1: (data as any).send_time_1,
        send_time_2: (data as any).send_time_2,
        send_time_3: (data as any).send_time_3,
        send_target: ((data as any).send_target ?? "tomorrow") as "today" | "tomorrow",
        last_sent: ((data as any).last_sent ?? {}) as Record<string, string>,
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (next: Partial<IncomesExpensesTgPrefs>) => {
    if (!user) return;
    setSaving(true);
    const merged = { ...prefs, ...next };
    const lastSent = { ...(prefs.last_sent ?? {}) };

    for (const key of TIME_KEYS) {
      if (key in next && next[key] !== prefs[key]) {
        delete lastSent[key];
      }
    }

    if ("enabled" in next && next.enabled === true && prefs.enabled !== true) {
      for (const key of TIME_KEYS) delete lastSent[key];
    }

    if ("send_target" in next && next.send_target !== prefs.send_target) {
      for (const key of TIME_KEYS) delete lastSent[key];
    }

    merged.last_sent = lastSent;
    setPrefs(merged);
    try {
      await supabase
        .from("incomes_expenses_telegram_prefs" as any)
        .upsert({ user_id: user.id, ...merged, last_sent: lastSent } as any, { onConflict: "user_id" });
    } finally {
      setSaving(false);
    }
  }, [user, prefs]);

  return { prefs, loading, saving, save, reload: load };
}
