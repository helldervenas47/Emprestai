import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { adminGuard, guardCors as corsHeaders } from "../_shared/admin-guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  const gate = await adminGuard(req, { action: "migrate-sql", requireConfirmation: true });
  if (gate instanceof Response) return gate;

  try {
    const { sql_query } = (gate.body ?? {}) as { sql_query?: string };
    if (!sql_query || typeof sql_query !== "string") {
      return new Response(JSON.stringify({ error: "Missing sql_query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supabase.rpc("exec_sql", { sql_query });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
