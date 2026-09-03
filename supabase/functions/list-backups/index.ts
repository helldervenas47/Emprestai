// Lista o histórico de backups do usuário autenticado
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const ANON = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

  const client = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userRes, error } = await client.auth.getUser();
  if (error || !userRes?.user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data, error: qErr } = await client
    .from("backup_history")
    .select("id, created_at, drive_url, filename, size_bytes, status, error, triggered_by")
    .order("created_at", { ascending: false })
    .limit(50);
  if (qErr) {
    return new Response(JSON.stringify({ error: qErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ items: data || [] }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
