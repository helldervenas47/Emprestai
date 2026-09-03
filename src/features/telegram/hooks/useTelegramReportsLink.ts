import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { invokeUserFunction } from "@/features/telegram/lib/telegramLinkCode";

// Reports links prefer telegram_reports_links so they never compete with expenses.
async function fetchReportsBotId(): Promise<string | null> {
  const { data } = await supabase
    .from("system_telegram_bots" as any)
    .select("id")
    .eq("purpose", "reports")
    .eq("active", true)
    .order("bot_id", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

export function useTelegramReportsLink() {
  const { user } = useAuth();
  const [linked, setLinked] = useState<{ chat_id: number; bot_id?: string | null; source?: "dedicated" | "legacy" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportsBotId, setReportsBotId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) { setLinked(null); setLoading(false); return; }

    try {
      // The Telegram bot writes the link server-side. Confirm through the same
      // authenticated function first so the UI does not depend on a stale RLS/
      // realtime cache after Telegram already replied “conectado”.
      // Race against a timeout so a hung Edge Function can never block the UI.
      const statusPromise = invokeUserFunction("telegram-reports-link-code", { action: "status" }).catch(() => null);
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 6000));
      const status = await Promise.race([statusPromise, timeoutPromise]);
      const statusLink = (status as any)?.linked;
      if (statusLink) {
        setLinked({ chat_id: Number(statusLink.chat_id), bot_id: statusLink.bot_id ?? null, source: "dedicated" });
        return;
      }

      // If Telegram confirmed the reports bot link, trust any dedicated reports
      // link for this user. Filtering by the currently chosen active bot can show
      // a false “disconnected” state when multiple reports bots exist.
      const { data: dedicated, error: dedicatedError } = await supabase
        .from("telegram_reports_links" as any)
        .select("chat_id, bot_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dedicated) {
        setLinked({ chat_id: (dedicated as any).chat_id, bot_id: (dedicated as any).bot_id ?? null, source: "dedicated" });
        return;
      }

      if (dedicatedError && dedicatedError.code !== "42P01" && dedicatedError.code !== "PGRST205") {
        console.error("[useTelegramReportsLink] dedicated link query failed:", dedicatedError);
      }

      const botId = reportsBotId ?? await fetchReportsBotId();
      if (botId !== reportsBotId) setReportsBotId(botId);
      if (!botId) { setLinked(null); return; }

      const { data: legacy } = await supabase
        .from("telegram_links" as any)
        .select("chat_id, bot_id")
        .eq("user_id", user.id)
        .eq("bot_id", botId)
        .maybeSingle();

      setLinked(legacy ? { chat_id: (legacy as any).chat_id, bot_id: (legacy as any).bot_id ?? botId, source: "legacy" } : null);
    } catch (e) {
      console.error("[useTelegramReportsLink] refresh failed:", e);
    } finally {
      // Guarantee the loading state is always released so the Reports tab
      // never stays stuck in an infinite loading state.
      setLoading(false);
    }
  }, [user, reportsBotId]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`telegram_reports_links_self:${user?.id ?? "anonymous"}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "telegram_reports_links",
          filter: user ? `user_id=eq.${user.id}` : undefined,
        },
        () => refresh(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refresh, user]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    const botId = reportsBotId ?? await fetchReportsBotId();
    let dedicatedDelete = supabase.from("telegram_reports_links" as any).delete().eq("user_id", user.id);
    if (linked?.bot_id) dedicatedDelete = dedicatedDelete.eq("bot_id", linked.bot_id);
    else if (linked?.chat_id) dedicatedDelete = dedicatedDelete.eq("chat_id", linked.chat_id);
    else if (botId) dedicatedDelete = dedicatedDelete.eq("bot_id", botId);
    const { error } = await dedicatedDelete;
    if (error && error.code !== "42P01" && error.code !== "PGRST205") throw error;
    if (botId || linked?.bot_id || linked?.chat_id) {
      let legacyDelete = supabase.from("telegram_links" as any).delete().eq("user_id", user.id);
      if (linked?.bot_id || botId) legacyDelete = legacyDelete.eq("bot_id", linked?.bot_id ?? botId);
      else if (linked?.chat_id) legacyDelete = legacyDelete.eq("chat_id", linked.chat_id);
      const { error: legacyError } = await legacyDelete;
      if (legacyError) throw legacyError;
    }
    setLinked(null);
  }, [user, reportsBotId, linked]);

  return { linked, loading, refresh, disconnect };
}
