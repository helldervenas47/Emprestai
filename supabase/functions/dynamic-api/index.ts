// dynamic-api — DESCONTINUADA
//
// Esta função foi bloqueada intencionalmente após auditoria de segurança
// (Prioridade 1.2). Era duplicata órfã de `asaas-create-subscription` sem
// consumidores no repositório e apresentava risco alto (IDOR via userId no
// body + service role). O stub abaixo mantém o slug ativo no Supabase para
// que integrações legadas eventuais recebam uma resposta clara em vez de
// erro genérico, mas não executa nenhuma operação.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body = JSON.stringify({
    success: false,
    error:
      "dynamic-api foi descontinuada. Use as funções específicas do sistema.",
  });

  return new Response(body, {
    status: 410,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
});
