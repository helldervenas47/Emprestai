// Guard compartilhado para Edge Functions destrutivas / privilegiadas.
// Exige: JWT válido + role admin + header x-admin-secret + confirmação no body.
// Registra auditoria em system_audit_logs (best-effort).
import { getExternalAdmin, getExternalUserClient } from "./external-supabase.ts";

export const guardCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

export const CONFIRMATION_PHRASE = "ENTENDO_OS_RISCOS";

function forbid(reason: string, status = 403) {
  return new Response(JSON.stringify({ error: reason }), {
    status,
    headers: { ...guardCors, "Content-Type": "application/json" },
  });
}

async function logAttempt(
  admin: ReturnType<typeof getExternalAdmin>,
  req: Request,
  action: string,
  userId: string | null,
  ownerId: string | null,
  ok: boolean,
  reason: string,
) {
  try {
    await admin.from("system_audit_logs").insert({
      user_id: userId,
      owner_id: ownerId,
      action: `guard:${action}`,
      details: { ok, reason, path: new URL(req.url).pathname },
      ip:
        req.headers.get("x-forwarded-for") ||
        req.headers.get("cf-connecting-ip") ||
        null,
      user_agent: req.headers.get("user-agent") || null,
    });
  } catch {
    /* auditoria não deve bloquear */
  }
}

export interface AdminGuardOptions {
  action: string;
  requireConfirmation?: boolean;
  /** Marca a função como deprecated e bloqueia execução. */
  deprecated?: boolean;
}

export interface AdminGuardSuccess {
  ok: true;
  userId: string;
  ownerId: string;
  admin: ReturnType<typeof getExternalAdmin>;
  body: Record<string, unknown>;
}

/**
 * Retorna Response em caso de falha ou objeto { ok:true, ... } em caso de sucesso.
 */
export async function adminGuard(
  req: Request,
  opts: AdminGuardOptions,
): Promise<Response | AdminGuardSuccess> {
  let admin;
  try {
    admin = getExternalAdmin();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured", detail: (e as Error).message }),
      { status: 500, headers: { ...guardCors, "Content-Type": "application/json" } },
    );
  }

  if (opts.deprecated) {
    await logAttempt(admin, req, opts.action, null, null, false, "deprecated");
    return new Response(
      JSON.stringify({ error: "Function deprecated and disabled." }),
      { status: 410, headers: { ...guardCors, "Content-Type": "application/json" } },
    );
  }

  // 1) admin secret
  const expected = Deno.env.get("X_ADMIN_SECRET") || Deno.env.get("ADMIN_SECRET");
  if (!expected) {
    await logAttempt(admin, req, opts.action, null, null, false, "missing_x_admin_secret_env");
    return forbid("Server missing X_ADMIN_SECRET", 500);
  }
  const provided = req.headers.get("x-admin-secret") || req.headers.get("X-Admin-Secret") || "";
  if (provided !== expected) {
    await logAttempt(admin, req, opts.action, null, null, false, "bad_admin_secret");
    return forbid("Forbidden: invalid admin secret");
  }

  // 2) JWT
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) {
    await logAttempt(admin, req, opts.action, null, null, false, "missing_token");
    return forbid("Forbidden: missing bearer token");
  }
  const userClient = getExternalUserClient();
  const { data: userRes, error: uErr } = await userClient.auth.getUser(token);
  if (uErr || !userRes?.user) {
    await logAttempt(admin, req, opts.action, null, null, false, "invalid_token");
    return forbid("Forbidden: invalid token");
  }
  const userId = userRes.user.id;

  // 3) role admin
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    await logAttempt(admin, req, opts.action, userId, null, false, "not_admin");
    return forbid("Forbidden: admin role required");
  }

  const { data: ownerIdData } = await admin.rpc("get_data_owner_id", { _user_id: userId });
  const ownerId: string = (ownerIdData as string) || userId;

  // 4) body + confirmação
  let body: Record<string, unknown> = {};
  if (req.method !== "GET" && req.method !== "OPTIONS") {
    try {
      body = await req.clone().json();
    } catch {
      body = {};
    }
  }
  if (opts.requireConfirmation && body?.confirm !== CONFIRMATION_PHRASE) {
    await logAttempt(admin, req, opts.action, userId, ownerId, false, "missing_confirmation");
    return forbid(
      `Confirmation required: send { "confirm": "${CONFIRMATION_PHRASE}" } in body`,
      400,
    );
  }

  await logAttempt(admin, req, opts.action, userId, ownerId, true, "granted");
  return { ok: true, userId, ownerId, admin, body };
}
