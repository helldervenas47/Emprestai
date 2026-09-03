// Shared helper to require an authenticated user with the 'admin' role
// (via the public.user_roles table). Returns a Response on failure, or
// the verified user id on success.
// ⚠️ Sempre opera no Supabase EXTERNO (banco principal do app).
import { getExternalAdmin } from "./external-supabase.ts";

export const adminCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  let admin;
  try {
    admin = getExternalAdmin();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server misconfigured", detail: (e as Error).message }), {
      status: 500, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace(/^Bearer\s+/i, "");
  // Valida o JWT contra o próprio Supabase externo usando o service role do servidor.
  // Isso evita falso 401 quando a anon key usada para validação está ausente/rotacionada
  // nos secrets da Edge Function, sem reduzir a checagem de papel admin abaixo.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  return { userId: userData.user.id };
}

