import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getExternalAdmin, getExternalSupabaseUrl, getExternalAnonKey } from "./external-supabase.ts";
import { dueSlotKeys, isTimeDueToday } from "./schedule.ts";
import { runReportCommand } from "./reports-commands.ts";
import { sendReportsMessage, getReportsLinkForUser } from "./reports-bot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function nowParts(tz = "America/Sao_Paulo") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    today: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
  };
}

/**
 * Generic handler for "scheduled report bot" functions.
 * Reads prefs from the external Supabase, fires the given report command,
 * and sends the resulting text via the reports bot.
 */
export function buildScheduledReportHandler(opts: {
  prefsTable: string;
  command: string; // e.g. "emprestimos_atrasados" | "vencimentos_hoje"
  trackSendTimeInLastSent?: boolean;
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const SUPABASE_URL = getExternalSupabaseUrl();
    const SUPABASE_ANON_KEY = getExternalAnonKey();
    const admin = getExternalAdmin();

    try {
      let body: any = {};
      try {
        if (req.method === "POST") {
          body = await req.json();
        }
      } catch {
        // ignore
      }

      // Manual call (with auth or return_text) → run for that user only and send/return text.
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "");

      if (req.method === "POST") {
        let targetUserId: string | null = body?.owner_id || null;
        if (token) {
          const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          const { data: { user } } = await userClient.auth.getUser();
          if (user) targetUserId = user.id;
        }

        if (targetUserId) {
          const { data: ownerId } = await admin.rpc("get_data_owner_id", { _user_id: targetUserId });
          const resolvedOwnerId = (ownerId as string) ?? targetUserId;
          const text = await runReportCommand(admin, resolvedOwnerId, opts.command);

          if (body?.return_text) {
            return new Response(JSON.stringify({ ok: true, sent: false, text }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const link = await getReportsLinkForUser(admin, targetUserId);
          if (!link) {
            return new Response(JSON.stringify({ ok: true, sent: false, reason: "no_reports_link", text }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const send = await sendReportsMessage(admin, targetUserId, Number(link.chat_id), text);
          return new Response(JSON.stringify({ ok: true, sent: send.sent, reason: send.reason, text }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Cron mode — iterate enabled prefs.
      const { data: prefs, error } = await admin
        .from(opts.prefsTable)
        .select("user_id, enabled, send_time_1, send_time_2, send_time_3, last_sent")
        .eq("enabled", true);
      if (error) {
        console.warn(`[${opts.command}] prefs table read failed or not created yet:`, error.message);
        return new Response(JSON.stringify({ ok: true, sent: 0, checked: 0, warning: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let sent = 0;
      for (const pref of (prefs ?? [])) {
        try {
          const { data: ownerId } = await admin.rpc("get_data_owner_id", { _user_id: (pref as any).user_id });
          const resolvedOwnerId = (ownerId as string) ?? (pref as any).user_id;
          const { data: settings } = await admin
            .from("account_settings").select("timezone").eq("owner_id", resolvedOwnerId).maybeSingle();
          const tz = (settings as any)?.timezone || "America/Sao_Paulo";
          const { today, hhmm } = nowParts(tz);
          const [hh, mm] = hhmm.split(":").map(Number);
          const nowMin = hh * 60 + mm;
          const slots = [
            { key: "send_time_1", time: (pref as any).send_time_1 },
            { key: "send_time_2", time: (pref as any).send_time_2 },
            { key: "send_time_3", time: (pref as any).send_time_3 },
          ] as const;
          const lastSent = ((pref as any).last_sent ?? {}) as Record<string, string>;
          const fired = opts.trackSendTimeInLastSent
            ? slots.filter((slot) => isTimeDueToday(slot.time, nowMin)).map((slot) => slot.key)
            : dueSlotKeys(slots, nowMin, today, lastSent);
          const firedWithMarkers = opts.trackSendTimeInLastSent
            ? slots
                .filter((slot) => fired.includes(slot.key))
                .map((slot) => ({ key: slot.key, marker: `${today}@${String(slot.time).slice(0, 5)}` }))
                .filter((slot) => lastSent[slot.key] !== slot.marker)
            : fired.map((key) => ({ key, marker: today }));
          if (firedWithMarkers.length === 0) continue;

          const link = await getReportsLinkForUser(admin, (pref as any).user_id);
          if (!link) continue;
          const text = await runReportCommand(admin, resolvedOwnerId, opts.command);
          const send = await sendReportsMessage(admin, (pref as any).user_id, Number(link.chat_id), text);
          if (!send.sent) continue;

          const merged = { ...lastSent };
          for (const slot of firedWithMarkers) merged[slot.key] = slot.marker;
          await admin.from(opts.prefsTable).update({ last_sent: merged }).eq("user_id", (pref as any).user_id);
          sent += 1;
        } catch (e) {
          console.error(`[${opts.command}] error for`, (pref as any).user_id, e);
        }
      }

      return new Response(JSON.stringify({ ok: true, sent, checked: prefs?.length ?? 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  };
}
