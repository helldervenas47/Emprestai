// Helpers padronizados de resposta JSON e tratamento de erro para Edge Functions.
// Sempre inclui os CORS headers compartilhados.
import { corsHeaders } from "./cors.ts";

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

export function ok(body: unknown = { ok: true }) {
  return json(body, 200);
}

export function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return json({ error, ...extra }, 400);
}

export function unauthorized(error = "unauthorized") {
  return json({ error }, 401);
}

export function forbidden(error = "forbidden") {
  return json({ error }, 403);
}

export function notFound(error = "not_found") {
  return json({ error }, 404);
}

export function methodNotAllowed(error = "method_not_allowed") {
  return json({ error }, 405);
}

/**
 * Tratamento padrão de erro para o `catch` do handler.
 * - Loga com prefixo do escopo (não expõe stack ao cliente).
 * - Preserva mensagens já mapeadas (Error com `.status` numérico).
 */
export function handleError(scope: string, e: unknown) {
  const err = e as { message?: string; status?: number };
  const status = typeof err?.status === "number" ? err.status : 500;
  const message = err?.message ?? "internal_error";
  // Log importante: mantém em produção para auditoria.
  console.error(`[${scope}]`, message);
  return json({ error: status === 500 ? "internal_error" : message }, status);
}
