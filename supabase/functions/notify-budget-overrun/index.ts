import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getReportsBotId } from "../_shared/reports-bot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------- Web Push (VAPID + aes128gcm) ----------
function b64UrlDecode(str: string): Uint8Array {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function derEncodePrivateKey(rawKey: Uint8Array): Uint8Array {
  const header = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04, 0x6d, 0x30,
    0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const out = new Uint8Array(header.length + rawKey.length);
  out.set(header);
  out.set(rawKey, header.length);
  return out;
}
function derToRaw(der: Uint8Array): Uint8Array {
  if (der.length === 64) return der;
  const raw = new Uint8Array(64);
  let o = 2;
  const rLen = der[o + 1]; o += 2;
  const rStart = rLen > 32 ? o + (rLen - 32) : o;
  const rDestStart = rLen < 32 ? 32 - rLen : 0;
  raw.set(der.slice(rStart, o + rLen), rDestStart);
  o += rLen;
  const sLen = der[o + 1]; o += 2;
  const sStart = sLen > 32 ? o + (sLen - 32) : o;
  const sDestStart = sLen < 32 ? 64 - sLen : 32;
  raw.set(der.slice(sStart, o + sLen), sDestStart);
  return raw;
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const saltKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm));
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoFull = new Uint8Array(info.length + 1);
  infoFull.set(info); infoFull[info.length] = 1;
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoFull));
  return okm.slice(0, length);
}
async function createVapidJwt(audience: string, subject: string, privateKeyBytes: Uint8Array) {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 86400, sub: subject };
  const h = b64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const p = b64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsigned = `${h}.${p}`;
  const key = await crypto.subtle.importKey("pkcs8", derEncodePrivateKey(privateKeyBytes),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64UrlEncode(derToRaw(new Uint8Array(sig)))}`;
}
async function encryptPayload(payload: string, p256dh: Uint8Array, auth: Uint8Array) {
  const bytes = new TextEncoder().encode(payload);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const sub = await crypto.subtle.importKey("raw", p256dh, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: sub }, local.privateKey, 256));
  const localPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const authInfo = new TextEncoder().encode("WebPush: info\0");
  const authInfoFull = new Uint8Array(authInfo.length + p256dh.length + localPub.length);
  authInfoFull.set(authInfo); authInfoFull.set(p256dh, authInfo.length); authInfoFull.set(localPub, authInfo.length + p256dh.length);
  const ikm = await hkdf(auth, shared, authInfoFull, 32);
  const cek = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const padded = new Uint8Array(bytes.length + 1);
  padded.set(bytes); padded[bytes.length] = 2;
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));
  const header = new Uint8Array(16 + 4 + 1 + localPub.length);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = localPub.length;
  header.set(localPub, 21);
  const out = new Uint8Array(header.length + enc.length);
  out.set(header); out.set(enc, header.length);
  return out;
}
async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: string, vapidPub: string, vapidPriv: string, subject: string) {
  try {
    const audience = new URL(sub.endpoint).origin;
    const jwt = await createVapidJwt(audience, subject, b64UrlDecode(vapidPriv));
    const body = await encryptPayload(payload, b64UrlDecode(sub.p256dh), b64UrlDecode(sub.auth));
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
        Authorization: `vapid t=${jwt}, k=${vapidPub}`,
        Urgency: "high",
      },
      body,
    });
    return r.ok || r.status === 201;
  } catch (e) {
    console.error("sendPush error:", e);
    return false;
  }
}

const TELEGRAM_GATEWAY = "https://api.telegram.org";

async function sendTelegram(chatId: number, text: string, lovableKey: string, telegramKey: string) {
  try {
    await fetch(`${TELEGRAM_GATEWAY}/bot${telegramKey}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch (e) {
    console.error("sendTelegram error", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPub = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPriv = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: require valid JWT
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    // Resolve data owner (multi-user access)
    const { data: ownerRow } = await supabase
      .from("user_owner")
      .select("owner_id")
      .eq("user_id", userId)
      .maybeSingle();
    const ownerId = (ownerRow as any)?.owner_id || userId;

    // Fetch brand name (singleton)
    let brandName = "EmprestAI";
    try {
      const { data: bRow } = await supabase.from("app_branding").select("brand_name").limit(1).maybeSingle();
      if ((bRow as any)?.brand_name) brandName = (bRow as any).brand_name;
    } catch { /* ignore */ }

    const month = currentMonth();
    const monthStart = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const monthEndDate = new Date(y, m, 0);
    const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;

    // Fetch budgets — aplica regra de herança: usa limites do próprio mês;
    // se não houver, usa o mês mais recente anterior; se não houver, o próximo mês.
    const { data: allBudgets } = await supabase
      .from("personal_budgets")
      .select("category, amount, month")
      .eq("user_id", ownerId);

    let budgets: { category: string; amount: number }[] = [];
    if (allBudgets && allBudgets.length > 0) {
      const monthsAvailable = Array.from(new Set((allBudgets as any[]).map((b) => b.month as string))).sort();
      let sourceMonth: string | null = null;
      if (monthsAvailable.includes(month)) {
        sourceMonth = month;
      } else {
        const previous = [...monthsAvailable].reverse().find((m) => m < month);
        sourceMonth = previous ?? monthsAvailable.find((m) => m > month) ?? null;
      }
      if (sourceMonth) {
        budgets = (allBudgets as any[])
          .filter((b) => b.month === sourceMonth)
          .map((b) => ({ category: b.category, amount: Number(b.amount) }));
      }
    }

    if (!budgets || budgets.length === 0) {
      return new Response(JSON.stringify({ message: "No budgets" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch this month's registered personal expenses (by due_date, regardless of paid status)
    const { data: expenses } = await supabase
      .from("expenses")
      .select("category, amount, type, installments, due_date, scope")
      .eq("user_id", ownerId)
      .eq("scope", "personal")
      .gte("due_date", monthStart)
      .lte("due_date", monthEnd);

    const spent = new Map<string, number>();
    for (const e of (expenses || []) as any[]) {
      const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
      const amt = isRec ? Number(e.amount) / Number(e.installments) : Number(e.amount);
      spent.set(e.category, (spent.get(e.category) || 0) + amt);
    }

    // Find newly exceeded categories
    // Classify each budget: 'exceeded' (>100%) or 'warning' (>=80% and <=100%)
    type Pending = { category: string; amount: number; spent: number; type: "exceeded" | "warning" };
    const pending: Pending[] = [];
    for (const b of budgets as any[]) {
      const amt = Number(b.amount);
      if (amt <= 0) continue;
      const s = spent.get(b.category) || 0;
      const pct = (s / amt) * 100;
      if (pct > 100) pending.push({ category: b.category, amount: amt, spent: s, type: "exceeded" });
      else if (pct >= 80) pending.push({ category: b.category, amount: amt, spent: s, type: "warning" });
    }

    if (pending.length === 0) {
      return new Response(JSON.stringify({ message: "Nothing to alert" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filter out already-alerted (per category + alert_type)
    const { data: existingAlerts } = await supabase
      .from("personal_budget_alerts")
      .select("category, alert_type")
      .eq("user_id", ownerId)
      .eq("month", month);
    const alertedSet = new Set((existingAlerts || []).map((a: any) => `${a.category}::${a.alert_type}`));
    const toAlert = pending.filter((p) => !alertedSet.has(`${p.category}::${p.type}`));

    if (toAlert.length === 0) {
      return new Response(JSON.stringify({ message: "Already alerted" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch all push tokens for the data owner
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", ownerId);

    let totalSent = 0;
    let totalFailed = 0;
    const invalid: string[] = [];

    for (const p of toAlert) {
      const pct = Math.round((p.spent / p.amount) * 100);
      const payload = p.type === "exceeded"
        ? JSON.stringify({
            title: `${brandName} — ⚠️ Orçamento estourado: ${p.category}`,
            body: `Você cadastrou ${fmt(p.spent)} de ${fmt(p.amount)} (${fmt(p.spent - p.amount)} acima).`,
            url: "/?tab=expenses",
          })
        : JSON.stringify({
            title: `${brandName} — 🟡 Atenção: ${p.category} em ${pct}%`,
            body: `Você já cadastrou ${fmt(p.spent)} de ${fmt(p.amount)}. Aproximando do limite.`,
            url: "/?tab=expenses",
          });

      for (const tok of (tokens || []) as any[]) {
        const ok = await sendPush(
          { endpoint: tok.endpoint, p256dh: tok.p256dh, auth: tok.auth },
          payload, vapidPub, vapidPriv,
          "mailto:noreply@emprestaii.lovable.app",
        );
        if (ok) totalSent++;
        else { totalFailed++; invalid.push(tok.id); }
      }

      // Send Telegram alert (only for exceeded, if user has linked Telegram)
      if (p.type === "exceeded") {
        const telegramKey = Deno.env.get("TELEGRAM_BOT_TOKEN");
        if (telegramKey) {
          const reportsBotId = await getReportsBotId(supabase);
          let tgQ = supabase
            .from("telegram_links")
            .select("chat_id")
            .eq("user_id", ownerId);
          if (reportsBotId) tgQ = tgQ.or(`bot_id.is.null,bot_id.neq.${reportsBotId}`);
          const { data: tgLink } = await tgQ.maybeSingle();
          if (tgLink?.chat_id) {
            await sendTelegram(
              Number(tgLink.chat_id),
              `🚨 *${brandName} — Orçamento estourado!*\n\n📂 ${p.category}\n💸 Gasto: ${fmt(p.spent)} / ${fmt(p.amount)} (${pct}%)\n\nVocê ultrapassou o limite mensal desta categoria.`,
              "",
              telegramKey,
            );
          }
        }
      }

      await supabase
        .from("personal_budget_alerts")
        .insert({ user_id: ownerId, category: p.category, month, alert_type: p.type });

      // Trigger AI insights telegram report on category overrun
      if (p.type === "exceeded") {
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-personal-insights-telegram`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mode: "trigger",
              user_id: ownerId,
              reason: `Categoria "${p.category}" estourou o orçamento`,
            }),
          });
        } catch (e) {
          console.error("[notify-budget-overrun] AI insight trigger failed", e);
        }
      }
    }

    if (invalid.length > 0) {
      await supabase.from("push_tokens").delete().in("id", invalid);
    }

    return new Response(JSON.stringify({
      alerted: toAlert.map((p) => `${p.category}:${p.type}`),
      sent: totalSent, failed: totalFailed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
