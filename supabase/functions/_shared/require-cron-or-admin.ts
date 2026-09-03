// Shared guard for cron-triggered edge functions. Accepts either:
//   - Header `x-cron-secret` matching env CRON_SECRET (constant-time compare); or
//   - An authenticated admin (via requireAdmin).
// On failure returns a Response (401/403). On success returns { via }.
import { requireAdmin, adminCors } from "./require-admin.ts";
import { getExternalServiceRoleKey } from "./external-supabase.ts";

export const cronCors = {
  ...adminCors,
  "Access-Control-Allow-Headers":
    adminCors["Access-Control-Allow-Headers"] + ", x-cron-secret",
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function requireCronOrAdmin(
  req: Request,
): Promise<{ via: "cron" | "admin"; userId?: string } | Response> {
  const provided = req.headers.get("x-cron-secret") ?? "";
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  if (expected && provided && safeEqual(provided, expected)) {
    return { via: "cron" };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (token) {
    const serviceKeys = [
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ];

    try {
      const externalServiceKey = getExternalServiceRoleKey();
      if (!serviceKeys.includes(externalServiceKey)) serviceKeys.push(externalServiceKey);
    } catch {
      // Se o projeto externo ainda não estiver configurado, seguimos para a validação admin normal.
    }

    if (serviceKeys.some((key) => key && safeEqual(token, key))) {
      return { via: "cron" };
    }
  }

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const res = await requireAdmin(req);
    if (!(res instanceof Response)) return { via: "admin", userId: res.userId };
    return res;
  }

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...cronCors, "Content-Type": "application/json" },
  });
}
