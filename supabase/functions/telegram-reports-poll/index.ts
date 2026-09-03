// O bot de relatórios agora usa webhook exclusivo (compartilhado com o bot de
// despesas no endpoint /functions/v1/telegram-webhook). Manter polling ativo
// causava conflito 409 no Telegram e removia o webhook ativo, fazendo as
// mensagens pararem de chegar. Esta função permanece apenas como resposta
// compatível para crons/chamadas antigas.
//
// Versão auto-contida (sem imports de ../_shared) para deploy manual no Dashboard.
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(JSON.stringify({
    ok: true,
    processed: 0,
    bots: 0,
    skipped: true,
    note: "reports bot uses webhook; polling disabled to avoid Telegram 409/deleteWebhook",
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
