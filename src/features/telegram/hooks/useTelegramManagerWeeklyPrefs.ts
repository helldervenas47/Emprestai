import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export interface ManagerWeeklyPref {
  enabled: boolean;
  send_weekday: number; // 0=Sun..6=Sat
  send_time: string;    // "HH:MM"
  message_template: string;
  last_sent_date: string | null;
}

const DEFAULT_TEMPLATE =
  `Olá {nome_gerente}! 👋
Resumo da próxima semana:

⚠️ Atrasados: {total_emprestimos_atrasados}
📅 Vencendo na próxima semana: {total_emprestimos_semana}
💰 Valor restante total: {valor_total}

Clientes:
{lista_clientes}`;

const DEFAULT: ManagerWeeklyPref = {
  enabled: false,
  send_weekday: 1,
  send_time: "09:00",
  message_template: DEFAULT_TEMPLATE,
  last_sent_date: null,
};

export function useTelegramManagerWeeklyPrefs() {
  const { user } = useAuth();
  const [pref, setPref] = useState<ManagerWeeklyPref>(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("telegram_manager_weekly_prefs" as any)
        .select("enabled, send_weekday, send_time, message_template, last_sent_date")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setPref({
          enabled: !!(data as any).enabled,
          send_weekday: Number((data as any).send_weekday ?? 1),
          send_time: String((data as any).send_time || "09:00"),
          message_template: String((data as any).message_template || DEFAULT_TEMPLATE),
          last_sent_date: (data as any).last_sent_date ?? null,
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const save = useCallback(async (updates: Partial<ManagerWeeklyPref>) => {
    if (!user) return;
    const next = { ...pref, ...updates };
    setPref(next);
    await supabase.from("telegram_manager_weekly_prefs" as any).upsert(
      {
        user_id: user.id,
        enabled: next.enabled,
        send_weekday: next.send_weekday,
        send_time: next.send_time,
        message_template: next.message_template,
      },
      { onConflict: "user_id" },
    );
  }, [user, pref]);

  return { pref, loading, save };
}
