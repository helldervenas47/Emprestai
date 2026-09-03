import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Known integrations used by the app. Only secret NAMES are exposed (never values).
const KNOWN_INTEGRATIONS: { name: string; envVar: string; description: string }[] = [
  { name: "WhatsMiau (WhatsApp)", envVar: "WHATSMIAU_API_KEY", description: "Envio automático de cobranças por WhatsApp" },
  { name: "HTML to Image (User ID)", envVar: "HTML_TO_IMAGE_USER_ID", description: "Geração de imagens dos relatórios" },
  { name: "HTML to Image (API Key)", envVar: "HTML_TO_IMAGE_API_KEY", description: "Geração de imagens dos relatórios" },
  { name: "HTML to Image (User ID)", envVar: "HTML_TO_IMAGE_USER_ID", description: "Geração de imagens dos relatórios" },
  { name: "HTML to Image (API Key)", envVar: "HTML_TO_IMAGE_API_KEY", description: "Geração de imagens dos relatórios" },
  { name: "Push Notifications (VAPID Public)", envVar: "VAPID_PUBLIC_KEY", description: "Chave pública para notificações push" },
  { name: "Push Notifications (VAPID Private)", envVar: "VAPID_PRIVATE_KEY", description: "Chave privada para notificações push" },
  { name: "Backup Automático (Cron)", envVar: "BACKUP_CRON_SECRET", description: "Token interno do agendador de backups" },
];

function maskName(envVar: string): string {
  // Generate a stable masked identifier based on the env var name.
  if (envVar.length <= 8) return "•".repeat(envVar.length);
  return `${envVar.slice(0, 4)}${"•".repeat(8)}${envVar.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Restrict to admins
    const serviceClient = createClient(supabaseUrl, Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roleRow } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const integrations = KNOWN_INTEGRATIONS.map((it) => ({
      name: it.name,
      envVar: it.envVar,
      description: it.description,
      maskedKey: maskName(it.envVar),
      configured: Boolean(Deno.env.get(it.envVar)),
    }));

    return new Response(JSON.stringify({ integrations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
