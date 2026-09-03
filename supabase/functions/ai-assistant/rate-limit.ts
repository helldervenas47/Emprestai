// Helper compartilhado de rate limit (usa public.check_rate_limit no banco externo).
import { getExternalAdmin } from "./external-supabase.ts";

export interface RateLimitOptions {
  bucket: string;        // identificador do endpoint
  key: string;           // user_id / phone / ip
  max: number;           // máximo de requisições na janela
  windowSecs: number;    // tamanho da janela em segundos
}

/**
 * Retorna true se a requisição está dentro do limite.
 * Em caso de erro (banco indisponível), faz fail-open para não derrubar o app —
 * apenas loga. Mude para fail-closed se preferir bloquear sob falha.
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<boolean> {
  try {
    const admin = getExternalAdmin();
    const { data, error } = await admin.rpc("check_rate_limit", {
      _bucket: opts.bucket,
      _key: opts.key,
      _max: opts.max,
      _window_secs: opts.windowSecs,
    });
    if (error) {
      console.error("[rate-limit] rpc error", error);
      return true; // fail-open
    }
    return data === true;
  } catch (e) {
    console.error("[rate-limit] exception", e);
    return true; // fail-open
  }
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

export function rateLimitResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: "Muitas requisições. Aguarde alguns segundos e tente novamente." }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
