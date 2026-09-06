// CORS headers padronizados com controle de origens confiáveis para as Edge Functions do app.
// Suporta PWA, Web, Mobile (Capacitor/Cordova) e chamadas server-to-server (Asaas/Telegram/Cron).

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/(.*\.)?emprestaii\.com$/i,
  /^https:\/\/(.*\.)?emprestai\.com$/i,
  /^https:\/\/(.*\.)?lovable\.app$/i,
  /^https:\/\/(.*\.)?lovableproject\.com$/i,
  /^https:\/\/(.*\.)?vercel\.app$/i,
  /^http:\/\/localhost(:[0-9]+)?$/i,
  /^http:\/\/127\.0\.0\.1(:[0-9]+)?$/i,
  /^capacitor:\/\/localhost$/i,
  /^ionic:\/\/localhost$/i,
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  let allowOrigin = "*";

  if (req) {
    const origin = req.headers.get("Origin");
    if (origin) {
      const isAllowed = ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
      if (isAllowed) {
        allowOrigin = origin;
      }
    }
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-admin-secret, x-cron-secret, asaas-access-token",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

export const corsHeaders: Record<string, string> = getCorsHeaders();

/** Retorna a resposta 200 de preflight se `req` for OPTIONS; caso contrário, null. */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  return null;
}
