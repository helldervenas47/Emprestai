// Edge Function migrate-sql desativada por motivos de segurança (eliminação de superfície de SQL arbitrário).
// Todas as migrações de banco devem ser versionadas em supabase/migrations/.
import { guardCors as corsHeaders } from "../_shared/admin-guard.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: "Endpoint desativado por diretrizes de segurança. Utilize migrações SQL versionadas.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
