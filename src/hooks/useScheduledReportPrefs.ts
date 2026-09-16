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

export function useScheduledReportPrefs(table: string, defaultTime?: string) {
  const { user, dataOwnerId } = useAuth();
  const ownerId = dataOwnerId || user?.id;
  const [prefs, setPrefs] = useState<SchedulePrefs>({
    enabled: false,
    send_time_1: null,
    send_time_2: null,
    send_time_3: null,
    send_whatsapp: false,
    whatsapp_phone: null,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ownerId) {
      setLoading(false);
      return;
    }
    try {
      // 1. Tenta carregar com colunas de WhatsApp
      const { data, error } = await supabase
        .from(table as any)
        .select("enabled, send_time_1, send_time_2, send_time_3, send_whatsapp, whatsapp_phone")
        .eq("user_id", ownerId)
        .maybeSingle();

      if (!error && data) {
        setPrefs({
          enabled: Boolean((data as any).enabled),
          send_time_1: (data as any).send_time_1 ?? null,
          send_time_2: (data as any).send_time_2 ?? null,
          send_time_3: (data as any).send_time_3 ?? null,
          send_whatsapp: Boolean((data as any).send_whatsapp),
          whatsapp_phone: (data as any).whatsapp_phone ?? null,
        });
        return;
      }

      // 2. Se a tabela não possuir as colunas extras, consulta a estrutura base
      const { data: baseData } = await supabase
        .from(table as any)
        .select("enabled, send_time_1, send_time_2, send_time_3")
        .eq("user_id", ownerId)
        .maybeSingle();

      if (baseData) {
        setPrefs((prev) => ({
          ...prev,
          enabled: Boolean((baseData as any).enabled),
          send_time_1: (baseData as any).send_time_1 ?? null,
          send_time_2: (baseData as any).send_time_2 ?? null,
          send_time_3: (baseData as any).send_time_3 ?? null,
        }));
      }
    } catch (e) {
      console.error(`[useScheduledReportPrefs] Erro ao carregar ${table}:`, e);
    } finally {
      setLoading(false);
    }
  }, [ownerId, table]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (next: Partial<SchedulePrefs>) => {
      if (!ownerId) return;
      const merged = { ...prefs, ...next };

      const scheduleChanged = ["send_time_1", "send_time_2", "send_time_3"].some(
        (key) => key in next && next[key as keyof SchedulePrefs] !== prefs[key as keyof SchedulePrefs],
      );
      setPrefs(merged);

      const payload: Record<string, any> = {
        user_id: ownerId,
        enabled: merged.enabled,
        send_time_1: merged.send_time_1,
        send_time_2: merged.send_time_2,
        send_time_3: merged.send_time_3,
        send_whatsapp: merged.send_whatsapp ?? false,
        whatsapp_phone: merged.whatsapp_phone ?? null,
        ...(scheduleChanged ? { last_sent: {} } : {}),
      };

      const { error } = await supabase
        .from(table as any)
        .upsert(payload as any, { onConflict: "user_id" });

      if (error) {
        // Se o erro for de coluna inexistente, tenta fallback com as colunas base
        if (error.code === "42703" || String(error.message).includes("column")) {
          const basePayload = {
            user_id: ownerId,
            enabled: merged.enabled,
            send_time_1: merged.send_time_1,
            send_time_2: merged.send_time_2,
            send_time_3: merged.send_time_3,
            ...(scheduleChanged ? { last_sent: {} } : {}),
          };
          const { error: fallbackErr } = await supabase
            .from(table as any)
            .upsert(basePayload as any, { onConflict: "user_id" });

          if (fallbackErr) throw fallbackErr;
          return;
        }
        throw error;
      }
    },
    [ownerId, prefs, table],
  );

  return { prefs, loading, save };
}
