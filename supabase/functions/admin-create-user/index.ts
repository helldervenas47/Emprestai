import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
function handleCorsPreflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}
const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";
function pickUrl(): string {
  const ext = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (ext) return ext;
  const nat = Deno.env.get("SUPABASE_URL");
  if (nat?.includes(EXTERNAL_PROJECT_REF)) return nat;
  throw new Error("EXTERNAL_SUPABASE_URL não configurado");
}
function pickServiceKey(): string {
  const ext = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (ext) return ext;
  const nat = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (nat?.includes(EXTERNAL_PROJECT_REF) && key) return key;
  throw new Error("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY não configurado");
}
function getExternalAdmin() {
  return createClient(pickUrl(), pickServiceKey(), { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = getExternalAdmin();



    // Get caller from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await adminClient.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller is admin
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, username: rawUsername, display_name, role, account_type = "independent" } = await req.json();

    if (!password || !role) {
      return new Response(JSON.stringify({ error: "Senha e papel são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const username = (rawUsername || "").toString().toLowerCase().replace(/\s+/g, "").trim();
    if (!username || !/^[a-z0-9._-]{4,30}$/.test(username)) {
      return new Response(JSON.stringify({ error: "Nome de usuário inválido. Use 4–30 caracteres: letras, números, . _ -" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check uniqueness
    const { data: existing } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("username", username)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "Nome de usuário já está em uso." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build user creation params
    const userParams: any = {
      password,
      email_confirm: true,
      user_metadata: { display_name: display_name || username || email || "Usuário", username },
    };

    if (email) {
      userParams.email = email;
    } else {
      userParams.email = `${username}@placeholder.local`;
    }

    // Create user with service role (auto-confirms)
    const { data: userData, error: createErr } = await adminClient.auth.admin.createUser(userParams);
    if (createErr || !userData.user) {
      return new Response(JSON.stringify({ error: createErr?.message || "Erro ao criar usuário" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = userData.user.id;
    let inheritedProductId = "free_plan";

    // Upsert profile with username
    await adminClient.from("profiles").upsert(
      {
        user_id: newUserId,
        display_name: display_name || username || email,
        username,
        full_name: display_name || username || email,
        trial_started_at: new Date().toISOString(),
        trial_plan_name: "profissional",
        trial_days_override: 7,
      },
      { onConflict: "user_id" },
    );

    // Assign role (delete existing rows first to avoid any unique conflict)
    const desiredRole = role || "cliente";
    await adminClient.from("user_roles").delete().eq("user_id", newUserId);
    const { error: roleErr } = await adminClient
      .from("user_roles")
      .insert({ user_id: newUserId, role: desiredRole });
    if (roleErr) {
      console.error("[admin-create-user] role insert failed", roleErr);
      return new Response(
        JSON.stringify({ error: `Usuário criado, mas falhou ao atribuir papel: ${roleErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Link sub-user to the admin who created them APENAS se for membro da equipe
    if (account_type === "team_member") {
      await adminClient.from("user_owner").insert({
        user_id: newUserId,
        owner_id: caller.id,
      });

      // Sincroniza somente o plano live do titular para o membro da equipe.
      const { data: adminSubLive } = await adminClient
        .from("subscriptions")
        .select("product_id, price_id")
        .eq("user_id", caller.id)
        .eq("environment", "live")
        .maybeSingle();

      const adminProductId = adminSubLive?.product_id || "free_plan";
      const adminPriceId = adminSubLive?.price_id || "free";
      inheritedProductId = adminProductId;

      await adminClient
        .from("subscriptions")
        .update({ product_id: adminProductId, price_id: adminPriceId })
        .eq("user_id", newUserId)
        .eq("environment", "live");
    }

    // Sync tab permissions based on admin's plan
    const planNameMap: Record<string, string> = {
      free_plan: "Free",
      basico_plan: "Básico",
      profissional_plan: "Profissional",
      empresarial_plan: "Empresarial",
    };
    const planName = planNameMap[inheritedProductId];
    if (planName) {
      const { data: plan } = await adminClient
        .from("plans")
        .select("allowed_tabs")
        .eq("name", planName)
        .eq("active", true)
        .maybeSingle();

      if (plan?.allowed_tabs) {
        // Update the default tab permissions created above
        await adminClient
          .from("user_tab_permissions")
          .update({ allowed_tabs: plan.allowed_tabs, updated_at: new Date().toISOString() })
          .eq("user_id", newUserId);
      }
    }

    return new Response(JSON.stringify({ user: userData.user }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
