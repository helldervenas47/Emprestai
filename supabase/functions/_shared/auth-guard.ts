// Shared auth helpers for edge functions that mix cron + manual runs.
// - validateCronSecret: checks an X-Cron-Secret header against app_internal_config.cron_secret
// - validateUserOwner: validates a JWT and confirms get_data_owner_id(auth.uid()) === requestedOwnerId
import { getExternalUserClient } from "./external-supabase.ts";

export async function validateCronSecret(
  admin: any,
  req: Request,
): Promise<boolean> {
  const headerToken =
    req.headers.get("X-Cron-Secret") ||
    req.headers.get("x-cron-secret") ||
    "";
  if (!headerToken) return false;
  const { data } = await admin
    .from("app_internal_config")
    .select("value")
    .eq("key", "cron_secret")
    .maybeSingle();
  return !!data?.value && data.value === headerToken;
}

export async function validateUserOwner(
  admin: any,
  req: Request,
  requestedOwnerId: string,
): Promise<{ ok: boolean; userId?: string; reason?: string }> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, reason: "missing_token" };

  const userClient = getExternalUserClient();
  const { data: userRes, error } = await userClient.auth.getUser(token);
  if (error || !userRes?.user) return { ok: false, reason: "invalid_token" };

  const userId = userRes.user.id;

  const { data: ownerRow } = await admin.rpc("get_data_owner_id", { _user_id: userId });
  const resolvedOwner = (ownerRow as string | null) || userId;
  if (resolvedOwner !== requestedOwnerId) {
    return { ok: false, userId, reason: "owner_mismatch" };
  }
  return { ok: true, userId };
}

export function unauthorized(corsHeaders: Record<string, string>, reason = "Unauthorized") {
  return new Response(JSON.stringify({ error: reason }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
