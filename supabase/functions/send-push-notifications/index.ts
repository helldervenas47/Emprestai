import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Web Push crypto helpers for Deno
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
): Promise<boolean> {
  try {
    // Use the web-push compatible approach with fetch
    // For Deno edge functions, we use a simpler JWT-based VAPID approach

    // Import the key
    const privateKeyBytes = base64UrlDecode(vapidPrivateKey);
    const publicKeyBytes = base64UrlDecode(vapidPublicKey);

    // Create JWT for VAPID
    const audience = new URL(subscription.endpoint).origin;
    const jwt = await createVapidJwt(audience, vapidSubject, privateKeyBytes);

    // Encrypt the payload
    const encrypted = await encryptPayload(
      payload,
      base64UrlDecode(subscription.p256dh),
      base64UrlDecode(subscription.auth),
    );

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
        Urgency: "normal",
      },
      body: encrypted,
    });

    return response.ok || response.status === 201;
  } catch (err) {
    console.error("sendWebPush error:", err);
    return false;
  }
}

function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createVapidJwt(
  audience: string,
  subject: string,
  privateKeyBytes: Uint8Array,
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 86400, sub: subject };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key for signing
  const key = await crypto.subtle.importKey(
    "pkcs8",
    derEncodePrivateKey(privateKeyBytes),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken),
  );

  // Convert DER signature to raw r||s format
  const rawSig = derToRaw(new Uint8Array(signature));
  return `${unsignedToken}.${base64UrlEncode(rawSig)}`;
}

function derEncodePrivateKey(rawKey: Uint8Array): Uint8Array {
  // Wrap raw 32-byte private key in PKCS8 DER for P-256
  const pkcs8Header = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04, 0x6d, 0x30,
    0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const pkcs8Footer = new Uint8Array([
    0xa1, 0x44, 0x03, 0x42, 0x00,
  ]);
  // We don't include the public key part to keep it simple — crypto.subtle can derive it
  const result = new Uint8Array(pkcs8Header.length + rawKey.length);
  result.set(pkcs8Header);
  result.set(rawKey, pkcs8Header.length);
  return result;
}

function derToRaw(der: Uint8Array): Uint8Array {
  // If already 64 bytes, it's raw
  if (der.length === 64) return der;

  // Parse DER SEQUENCE
  const raw = new Uint8Array(64);
  let offset = 2; // skip SEQUENCE tag + length

  // r
  const rLen = der[offset + 1];
  offset += 2;
  const rStart = rLen > 32 ? offset + (rLen - 32) : offset;
  const rDestStart = rLen < 32 ? 32 - rLen : 0;
  raw.set(der.slice(rStart, offset + rLen), rDestStart);
  offset += rLen;

  // s
  const sLen = der[offset + 1];
  offset += 2;
  const sStart = sLen > 32 ? offset + (sLen - 32) : offset;
  const sDestStart = sLen < 32 ? 64 - sLen : 32;
  raw.set(der.slice(sStart, offset + sLen), sDestStart);

  return raw;
}

async function encryptPayload(
  payload: string,
  p256dhKey: Uint8Array,
  authSecret: __PULSE_REDACTED_CREDENTIAL_ASSIGNMENT__,
): Promise<Uint8Array> {
  const payloadBytes = new TextEncoder().encode(payload);

  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  // Import subscriber's public key
  const subscriberKey = await crypto.subtle.importKey(
    "raw",
    p256dhKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberKey },
      localKeyPair.privateKey,
      256,
    ),
  );

  // Export local public key
  const localPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey),
  );

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF to derive IKM
  const authInfo = new TextEncoder().encode("WebPush: info\0");
  const authInfoFull = new Uint8Array(authInfo.length + p256dhKey.length + localPublicKey.length);
  authInfoFull.set(authInfo);
  authInfoFull.set(p256dhKey, authInfo.length);
  authInfoFull.set(localPublicKey, authInfo.length + p256dhKey.length);

  const ikm = await hkdf(authSecret, sharedSecret, authInfoFull, 32);

  // Derive content encryption key and nonce
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");

  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Add padding delimiter
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // padding delimiter

  // Encrypt
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, paddedPayload),
  );

  // Build aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + encrypted
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + localPublicKey.length);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = localPublicKey.length;
  header.set(localPublicKey, 21);

  const result = new Uint8Array(header.length + encrypted.length);
  result.set(header);
  result.set(encrypted, header.length);

  return result;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);

  // Extract
  const saltKey = await crypto.subtle.importKey(
    "raw",
    salt,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm));

  // Expand
  const prkKey = await crypto.subtle.importKey(
    "raw",
    prk,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const infoFull = new Uint8Array(info.length + 1);
  infoFull.set(info);
  infoFull[info.length] = 1;

  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoFull));
  return okm.slice(0, length);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const todayStr = getTodayStr();

    // Current hour in BRT (UTC-3)
    const nowUtc = new Date();
    const brtHour = (nowUtc.getUTCHours() - 3 + 24) % 24;
    const currentHourStr = String(brtHour).padStart(2, "0") + ":00";

    // Get tokens matching the current hour
    const { data: tokens, error: tokErr } = await supabase
      .from("push_tokens")
      .select("id, user_id, endpoint, p256dh, auth, send_time")
      .eq("send_time", currentHourStr);

    if (tokErr) throw new Error(`Error fetching tokens: ${tokErr.message}`);
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: `No tokens for ${currentHourStr}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group tokens by user_id
    const userTokens = new Map<string, typeof tokens>();
    for (const t of tokens) {
      const arr = userTokens.get(t.user_id) || [];
      arr.push(t);
      userTokens.set(t.user_id, arr);
    }

    const results: { userId: string; sent: number; failed: number }[] = [];

    for (const [userId, userToks] of userTokens) {
      try {
        // Fetch user's notification preferences
        const { data: prefs } = await supabase
          .from("notification_preferences")
          .select("notification_type, enabled")
          .eq("user_id", userId);

        const enabledTypes = new Set(
          (prefs || []).filter((p: any) => p.enabled).map((p: any) => p.notification_type)
        );

        // If user has preferences but none enabled, skip
        if (prefs && prefs.length > 0 && enabledTypes.size === 0) {
          results.push({ userId, sent: 0, failed: 0 });
          continue;
        }

        // Fetch the configured brand name (singleton)
        let brandName = "Notificações";
        try {
          const { data: brandRow } = await supabase
            .from("app_branding")
            .select("brand_name")
            .limit(1)
            .maybeSingle();
          if (brandRow?.brand_name) brandName = brandRow.brand_name;
        } catch (_) { /* ignore */ }

        // Fetch active loans for this user
        const { data: loans } = await supabase
          .from("loans")
          .select("due_date, remaining_amount, status")
          .eq("user_id", userId)
          .neq("status", "paid");

        const overdue = (loans || []).filter((l: any) => l.due_date < todayStr);
        const dueToday = (loans || []).filter((l: any) => l.due_date === todayStr);

        // Skip if nothing to report
        if (overdue.length === 0 && dueToday.length === 0) {
          results.push({ userId, sent: 0, failed: 0 });
          continue;
        }

        const totalOverdue = overdue.reduce((s: number, l: any) => s + Number(l.remaining_amount || 0), 0);

        const payloads: string[] = [];

        // Only send if user has no prefs (default=send all) or type is enabled
        const shouldSend = (type: string) => !prefs || prefs.length === 0 || enabledTypes.has(type);

        if (overdue.length > 0 && shouldSend("parcelas_atrasadas")) {
          payloads.push(JSON.stringify({
            title: `📊 ${brandName} — Parcelas Atrasadas`,
            body: `🔴 ${overdue.length} parcela(s) atrasada(s) — ${formatCurrency(totalOverdue)}`,
            url: "/?tab=dashboard&filter=overdue&view=rows",
          }));
        }
        if (dueToday.length > 0 && shouldSend("parcelas_hoje")) {
          const totalToday = dueToday.reduce((s: number, l: any) => s + Number(l.remaining_amount || 0), 0);
          payloads.push(JSON.stringify({
            title: `📊 ${brandName} — Parcelas de Hoje`,
            body: `🟡 ${dueToday.length} parcela(s) vence(m) hoje — ${formatCurrency(totalToday)}`,
            url: "/?tab=dashboard&filter=due_today&view=rows",
          }));
        }
        if (shouldSend("resumo_diario") && (overdue.length > 0 || dueToday.length > 0)) {
          let body = "";
          if (overdue.length > 0) body += `🔴 ${overdue.length} atrasada(s) — ${formatCurrency(totalOverdue)}`;
          if (dueToday.length > 0) {
            if (body) body += " | ";
            const totalToday = dueToday.reduce((s: number, l: any) => s + Number(l.remaining_amount || 0), 0);
            body += `🟡 ${dueToday.length} vence(m) hoje — ${formatCurrency(totalToday)}`;
          }
          payloads.push(JSON.stringify({
            title: `📊 ${brandName} — Resumo Diário`,
            body,
            url: "/?tab=overdue",
          }));
        }

        if (payloads.length === 0) {
          results.push({ userId, sent: 0, failed: 0 });
          continue;
        }

        let sent = 0;
        let failed = 0;
        const tokensToRemove: string[] = [];

        for (const tok of userToks) {
          for (const payload of payloads) {
            const ok = await sendWebPush(
              { endpoint: tok.endpoint, p256dh: tok.p256dh, auth: tok.auth },
              payload,
              vapidPublicKey,
              vapidPrivateKey,
              "mailto:noreply@emprestaii.lovable.app",
            );

            if (ok) {
              sent++;
            } else {
              failed++;
              tokensToRemove.push(tok.id);
              break; // token is invalid, skip remaining payloads for this token
            }
          }
        }

        // Remove invalid tokens
        if (tokensToRemove.length > 0) {
          await supabase.from("push_tokens").delete().in("id", tokensToRemove);
        }

        results.push({ userId, sent, failed });
      } catch (err: any) {
        console.error(`Error for user ${userId}:`, err);
        results.push({ userId, sent: 0, failed: userToks.length });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
