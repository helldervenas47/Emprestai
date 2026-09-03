import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export interface NotificationPreference {
  notification_type: string;
  enabled: boolean;
  send_time: string;
}

const DEFAULT_TYPES = [
  { type: "parcelas_hoje", label: "Parcelas vencendo hoje", description: "Lembrete diário das cobranças do dia" },
  { type: "parcelas_atrasadas", label: "Parcelas em atraso", description: "Alerta de parcelas atrasadas" },
  { type: "resumo_diario", label: "Resumo diário", description: "Relatório resumido do dia" },
] as const;

export const NOTIFICATION_TYPES = DEFAULT_TYPES;

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreference[]>(
    DEFAULT_TYPES.map(t => ({ notification_type: t.type, enabled: false, send_time: "08:00" }))
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchPreferences();
  }, [user]);

  const fetchPreferences = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notification_preferences" as any)
      .select("notification_type, enabled, send_time")
      .eq("user_id", user.id);

    const merged = DEFAULT_TYPES.map(t => {
      const saved = (data as any[])?.find((d: any) => d.notification_type === t.type);
      return saved
        ? { notification_type: t.type, enabled: saved.enabled, send_time: saved.send_time }
        : { notification_type: t.type, enabled: false, send_time: "08:00" };
    });
    setPreferences(merged);
    setLoading(false);
  };

  const upsert = useCallback(async (type: string, updates: Partial<NotificationPreference>) => {
    if (!user) return;
    const current = preferences.find(p => p.notification_type === type);
    const newPref = { ...current, ...updates, notification_type: type };

    setPreferences(prev => prev.map(p => p.notification_type === type ? { ...p, ...updates } : p));

    await supabase.from("notification_preferences" as any).upsert(
      { user_id: user.id, notification_type: type, enabled: newPref.enabled, send_time: newPref.send_time },
      { onConflict: "user_id,notification_type" }
    );
  }, [user, preferences]);

  return { preferences, loading, upsert };
}
