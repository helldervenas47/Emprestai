import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { validateUserOwner } from "../_shared/auth-guard.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const authClient = createClient(url, Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: auth } = await authClient.auth.getUser();
  if (!auth.user) return reply({ error: "unauthorized" }, 401);
  const admin = createClient(url, Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!);
  const requestBody = await req.json().catch(() => ({}));
  const ownerId = String(requestBody.owner_id || auth.user.id);
  const ownership = await validateUserOwner(admin, req, ownerId);
  if (!ownership.ok) return reply({ error: ownership.reason }, 403);
  const { data: config } = await admin.from("whatsapp_billing_schedule").select("provider, base_url, instance_id").eq("owner_id", ownerId).single();
  if (config?.provider !== "wppconnect" || !config.base_url || !config.instance_id) return reply({ error: "wppconnect_not_configured" }, 400);
  const token = Deno.env.get("WPPCONNECT_TOKEN") || "";
  if (!token) return reply({ error: "missing_server_token" }, 503);
  const action = requestBody.action || "status";
  const base = config.base_url.replace(/\/+$/, "");
  const session = encodeURIComponent(config.instance_id);
  const endpoint = action === "connect" ? `/api/${session}/start-session` : action === "disconnect" ? `/api/${session}/logout-session` : `/api/${session}/status-session`;
  const response = await fetch(`${base}${endpoint}`, { method: action === "status" ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const text = await response.text();
  let upstreamBody: any; try { upstreamBody = JSON.parse(text); } catch { upstreamBody = { message: text }; }
  if (!response.ok) {
    const upstreamMessage = typeof upstreamBody?.message === "string"
      ? upstreamBody.message
      : typeof upstreamBody?.error === "string"
        ? upstreamBody.error
        : `WPPConnect respondeu HTTP ${response.status}`;
    console.error("[whatsapp-session] upstream error", {
      action,
      ownerId,
      upstreamStatus: response.status,
      upstreamMessage: upstreamMessage.slice(0, 300),
    });
    return reply({
      error: "wppconnect_upstream_error",
      upstream_status: response.status,
      message: upstreamMessage.slice(0, 300),
    });
  }
  const statusParts = [upstreamBody.status, upstreamBody.message, upstreamBody.response?.status, upstreamBody.response?.message]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value));
  const statusText = statusParts.join(" ").toLowerCase();
  const disconnected = ["disconnect", "notlogged", "not logged", "closed", "browserclose", "autoclose", "deleteToken"]
    .some((value) => statusText.includes(value.toLowerCase()));
  const connected = !disconnected && ["connected", "islogged", "inchat", "qrreadsuccess"]
    .some((value) => statusText.includes(value));
  const connecting = !connected && !disconnected && ["starting", "initial", "qrcode", "qr code", "opening"]
    .some((value) => statusText.includes(value));
  const state = connected ? "connected" : connecting || action === "connect" ? "connecting" : "disconnected";
  // QR é devolvido diretamente e nunca persistido.
  return reply({
    ok: response.ok,
    action,
    state,
    status: upstreamBody.status ?? upstreamBody.message ?? null,
    message: upstreamBody.message ?? null,
    qrcode: upstreamBody.qrcode || upstreamBody.qrCode || upstreamBody.response?.qrcode || null,
  });
});
