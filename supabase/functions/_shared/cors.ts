// CORS headers padronizados para todas as Edge Functions do app.
// Uso:
//   import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
//   const pre = handleCorsPreflight(req); if (pre) return pre;
//   return new Response(..., { headers: { ...corsHeaders, "Content-Type": "application/json" } });
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

/** Retorna a resposta 200 de preflight se `req` for OPTIONS; caso contrário, null. */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
