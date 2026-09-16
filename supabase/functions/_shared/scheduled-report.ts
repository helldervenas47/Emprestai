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

function normalizePhoneBR(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

async function sendWhatsappText(
  config: { provider: string; baseUrl: string; instanceId: string; apiKey: string },
  phone: string,
  message: string,
) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const formattedPhone = normalizePhoneBR(phone);

  if (config.provider === "wppconnect") {
    const response = await fetch(`${base}/api/${encodeURIComponent(config.instanceId)}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify({ phone: formattedPhone, message }),
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }
  if (config.provider === "evolution") {
    const response = await fetch(`${base}/message/sendText/${encodeURIComponent(config.instanceId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(config.apiKey ? { apikey: config.apiKey } : {}) },
      body: JSON.stringify({ number: formattedPhone, text: message }),
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }
  const response = await fetch(`${base}/message/sendText/${encodeURIComponent(config.instanceId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(config.apiKey ? { apikey: config.apiKey } : {}) },
    body: JSON.stringify({ number: formattedPhone, text: message }),
  });
  return { ok: response.ok, status: response.status, body: await response.text() };
}

async function sendReportToWhatsapp(
  admin: any,
  ownerId: string,
  text: string,
  customPhone?: string | null,
  passedConfig?: { provider?: string; base_url?: string; instance_id?: string; api_key?: string } | null,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    let phone = customPhone ? normalizePhoneBR(customPhone) : "";
    if (!phone) {
      const { data: auth } = await admin
        .from("whatsapp_assistant_authorized")
        .select("phone")
        .eq("owner_id", ownerId)
        .eq("enabled", true)
        .limit(1)
        .maybeSingle();
      if (auth?.phone) phone = normalizePhoneBR(auth.phone);
    }
    if (!phone) {
      const { data: prof } = await admin
        .from("profiles")
        .select("phone")
        .eq("user_id", ownerId)
        .maybeSingle();
      if (prof?.phone) phone = normalizePhoneBR(prof.phone);
    }
    if (!phone) {
      return { sent: false, reason: "no_phone_configured" };
    }

    let sched: any = null;
    if (passedConfig?.base_url?.trim() && passedConfig?.instance_id?.trim()) {
      sched = {
        provider: passedConfig.provider || "evolution",
        base_url: passedConfig.base_url.trim(),
        instance_id: passedConfig.instance_id.trim(),
        api_key: passedConfig.api_key || "",
      };
    }

    if (!sched) {
      const { data: directSched } = await admin
        .from("whatsapp_billing_schedule")
        .select("*")
        .eq("owner_id", ownerId)
        .maybeSingle();

      if (directSched?.base_url?.trim() && directSched?.instance_id?.trim()) {
        sched = directSched;
      }
    }

    if (!sched) {
      const { data: allSchedRows } = await admin
        .from("whatsapp_billing_schedule")
        .select("*")
        .not("base_url", "is", null)
        .neq("base_url", "")
        .limit(10);

      if (allSchedRows && allSchedRows.length > 0) {
        const found = allSchedRows.find((r: any) => Boolean(r.base_url?.trim() && r.instance_id?.trim()));
        if (found) sched = found;
      }
    }

    if (!sched?.base_url || !sched?.instance_id) {
      return { sent: false, reason: "whatsapp_not_configured" };
    }

    const globalApiKey = Deno.env.get("EVOLUTION_API_KEY") || Deno.env.get("WHATSMIAU_API_KEY") || "";
    let apiKey = sched.api_key || globalApiKey;
    if (!apiKey) {
      try {
        const { data: cfgKey } = await admin
          .from("app_internal_config")
          .select("value")
          .in("key", ["evolution_api_key", "whatsapp_api_key", "whatsmiau_api_key"])
          .limit(1)
          .maybeSingle();
        if (cfgKey?.value) apiKey = String(cfgKey.value);
      } catch (_) {}
    }

    const base = sched.base_url.replace(/\/+$/, "");
    const provider = sched.provider || "evolution";
    let isConnected = true;
    let connectionState = "unknown";

    if (provider === "evolution") {
      try {
        const stateRes = await fetch(`${base}/instance/connectionState/${encodeURIComponent(sched.instance_id.trim())}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", ...(apiKey ? { apikey: apiKey } : {}) },
        });
        if (stateRes.ok) {
          const stateData = await stateRes.json().catch(() => ({}));
          const stateVal = String(stateData?.instance?.state || stateData?.state || "").toLowerCase();
          connectionState = stateVal;
          if (stateVal && stateVal !== "open" && stateVal !== "connected") {
            isConnected = false;
          }
        }
      } catch (_) {
        // ignore connection check network failure
      }
    }

    if (!isConnected) {
      return {
        sent: false,
        reason: `A instância "${sched.instance_id}" do WhatsApp está com status "${connectionState}". Por favor, reconecte o QR Code na aba "Disparos & Automação".`,
      };
    }

    const result = await sendWhatsappText(
      {
        provider,
        baseUrl: sched.base_url,
        instanceId: sched.instance_id,
        apiKey,
      },
      phone,
      text,
    );

    let parsedBody: any = null;
    try {
      parsedBody = JSON.parse(result.body);
    } catch {
      parsedBody = result.body;
    }

    return {
      sent: result.ok,
      reason: result.ok ? undefined : `HTTP ${result.status}: ${result.body}`,
      phone,
      debug: {
        status: result.status,
        provider: sched.provider || "evolution",
        baseUrl: sched.base_url,
        instanceId: sched.instance_id,
        phone,
        response: parsedBody,
      },
    };
  } catch (err: any) {
    return { sent: false, reason: err?.message || String(err) };
  }
}

/**
 * Generic handler for "scheduled report bot" functions.
 * Reads prefs from the external Supabase, fires the given report command,
 * and sends the resulting text via Telegram and/or WhatsApp.
 */
export function buildScheduledReportHandler(opts: {
  prefsTable: string;
  command: string; // e.g. "relatorio_financeiro" | "emprestimos_atrasados"
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
          const text = body?.custom_text || body?.text || await runReportCommand(admin, resolvedOwnerId, opts.command, body?.date);

          if (body?.return_text) {
            return new Response(JSON.stringify({ ok: true, sent: false, text }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const isWhatsapp = body?.channel === "whatsapp" || body?.send_whatsapp === true;
          if (isWhatsapp) {
            const wppRes = await sendReportToWhatsapp(
              admin,
              resolvedOwnerId,
              text,
              body?.phone,
              body?.whatsapp_config,
            );
            return new Response(JSON.stringify({ ok: true, sent: wppRes.sent, reason: wppRes.reason, phone: wppRes.phone, debug: wppRes.debug, text }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Default: Telegram Bot
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
        .select("*");

      if (error) {
        console.warn(`[${opts.command}] prefs table read failed or not created yet:`, error.message);
        return new Response(JSON.stringify({ ok: true, sent: 0, checked: 0, warning: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const activePrefs = (prefs ?? []).filter((p: any) => Boolean(p.enabled) || Boolean(p.send_whatsapp));
      let sent = 0;

      for (const pref of activePrefs) {
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

          let anySent = false;
          const text = await runReportCommand(admin, resolvedOwnerId, opts.command);

          // Disparo Telegram
          if ((pref as any).enabled === true) {
            const link = await getReportsLinkForUser(admin, (pref as any).user_id);
            if (link) {
              const sendTg = await sendReportsMessage(admin, (pref as any).user_id, Number(link.chat_id), text);
              if (sendTg.sent) anySent = true;
            }
          }

          // Disparo WhatsApp
          if ((pref as any).send_whatsapp === true) {
            const sendWpp = await sendReportToWhatsapp(
              admin,
              resolvedOwnerId,
              text,
              (pref as any).whatsapp_phone,
            );
            if (sendWpp.sent) anySent = true;
          }

          if (!anySent) continue;

          const merged = { ...lastSent };
          for (const slot of firedWithMarkers) merged[slot.key] = slot.marker;
          await admin.from(opts.prefsTable).update({ last_sent: merged }).eq("user_id", (pref as any).user_id);
          sent += 1;
        } catch (e) {
          console.error(`[${opts.command}] error for`, (pref as any).user_id, e);
        }
      }

      return new Response(JSON.stringify({ ok: true, sent, checked: activePrefs.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  };
}

