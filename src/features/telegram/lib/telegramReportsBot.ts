import { supabase } from "@/integrations/supabase/userClient";

let _cached: { id: string | null; ts: number } | null = null;
let _cachedExpenses: { id: string | null; ts: number } | null = null;

async function fetchBotIdByPurpose(purpose: "expenses" | "reports"): Promise<string | null> {
  const cache = purpose === "reports" ? _cached : _cachedExpenses;
  if (cache && Date.now() - cache.ts < 5 * 60 * 1000) return cache.id;
  const { data } = await supabase
    .from("system_telegram_bots" as any)
    .select("id")
    .eq("purpose", purpose)
    .eq("active", true)
    .order("bot_id", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const id = (data as any)?.id ?? null;
  if (purpose === "reports") _cached = { id, ts: Date.now() };
  else _cachedExpenses = { id, ts: Date.now() };
  return id;
}

/**
 * Returns the ID of the active system Telegram bot whose purpose is "reports".
 * Cached for 5 minutes within the page session.
 */
export async function fetchReportsBotId(): Promise<string | null> {
  return fetchBotIdByPurpose("reports");
}

export async function fetchExpensesBotId(): Promise<string | null> {
  return fetchBotIdByPurpose("expenses");
}
