// STANDALONE version of ensure-user-role for manual deploy via Supabase Dashboard.
// Cole este arquivo INTEIRO no editor da edge function `ensure-user-role`.
// Não depende de `_shared/*` (o deploy pelo dashboard não sobe essa pasta).
//
// Secrets necessários no projeto:
//   - EXTERNAL_SUPABASE_URL           (ex.: https://syyxnqzxqabeuqbuptkh.supabase.co)
//   - EXTERNAL_SUPABASE_SERVICE_ROLE_KEY
//
// Configuração da function: Verify JWT = OFF (validamos o token no código).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";

function getExternalSupabaseUrl(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (external) return external;
  const nativeUrl = Deno.env.get("SUPABASE_URL");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF)) return nativeUrl;
  throw new Error("[ensure-user-role] EXTERNAL_SUPABASE_URL não configurado");
}

function getExternalServiceRoleKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (external) return external;
  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;
  throw new Error("[ensure-user-role] EXTERNAL_SUPABASE_SERVICE_ROLE_KEY não configurado");
}

function getExternalAdmin(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey(), {
    auth: { persistSession: false },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const admin = getExternalAdmin();
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return new Response(JSON.stringify({ error: "missing_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: userTokenError } = await admin.auth.getUser(token);
    if (userTokenError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "invalid_token", reauth_required: true }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userRes = userData.user;

    const userId = userRes.id;
    const displayName =
      (typeof body.display_name === "string" && body.display_name.trim()) ||
      userRes.user_metadata?.display_name ||
      userRes.user_metadata?.full_name ||
      userRes.email?.split("@")[0] ||
      "Usuário";

    await admin.from("profiles").upsert(
      {
        user_id: userId,
        email: userRes.email,
        full_name: userRes.user_metadata?.full_name || displayName,
        display_name: displayName,
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

    const rawUsername = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const cpfCnpj = typeof body.cpf_cnpj === "string" ? body.cpf_cnpj : undefined;
    const phone = typeof body.phone === "string" ? body.phone : undefined;
    const trialPlanName = typeof body.trial_plan_name === "string" ? body.trial_plan_name : undefined;

    const profileUpdate: Record<string, unknown> = { display_name: displayName };
    if (cpfCnpj !== undefined) profileUpdate.cpf_cnpj = cpfCnpj;
    if (phone !== undefined) profileUpdate.phone = phone;
    if (trialPlanName) {
      profileUpdate.trial_plan_name = trialPlanName;
      profileUpdate.trial_started_at = new Date().toISOString();
    }

    let usernameStatus: "saved" | "taken" | "invalid" | "skipped" = "skipped";
    if (rawUsername) {
      if (!/^[a-z0-9_]{3,24}$/.test(rawUsername)) {
        usernameStatus = "invalid";
      } else {
        const { data: taken } = await admin
          .from("profiles")
          .select("user_id")
          .eq("username", rawUsername)
          .neq("user_id", userId)
          .maybeSingle();
        if (taken) {
          usernameStatus = "taken";
        } else {
          profileUpdate.username = rawUsername;
          usernameStatus = "saved";
        }
      }
    }

    const { error: profErr } = await admin
      .from("profiles")
      .update(profileUpdate)
      .eq("user_id", userId);
    if (profErr) console.error("[ensure-user-role] profile update", profErr);

    const { data: existingRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const validExistingRole = (existingRoles ?? []).find((r) =>
      ["admin", "gerente", "cliente", "visualizador"].includes(String(r.role)),
    );

    if (validExistingRole) {
      return new Response(JSON.stringify({ ok: true, role: validExistingRole.role ?? null, username: usernameStatus }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const insert = await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "cliente" }, { onConflict: "user_id,role", ignoreDuplicates: true });

    if (insert.error) {
      return new Response(JSON.stringify({ error: insert.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, role: "cliente", username: usernameStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[ensure-user-role] fatal", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
