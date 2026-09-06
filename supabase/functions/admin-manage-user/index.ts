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
const FUNCTION_VERSION = "2026-09-02.1";

const ACTION_ALIASES: Record<string, string> = {
  list_users: "list",
  users: "list",
  set_role: "update_role",
  update_profile: "update_user",
  edit_user: "update_user",
  update: "update_user",
  delete_user: "delete",
  remove: "delete",
  remove_user: "delete",
  set_permissions: "update_permissions",
  update_tabs: "update_permissions",
  set_client_links: "update_client_links",
  link_clients: "update_client_links",
  unlink_owner: "set_independent",
  make_independent: "set_independent",
  link_team: "link_owner",
  set_owner: "link_owner",
  toggle_status: "toggle_active",
  set_active: "toggle_active",
  activate: "toggle_active",
  deactivate: "toggle_active",
  ban: "toggle_active",
  unban: "toggle_active",
};

function normalizeAction(body: Record<string, unknown>): { rawAction: string; action: string } {
  const candidate = body.action ?? body.acao ?? body.operation ?? body.type;
  const rawAction = typeof candidate === "string" ? candidate.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  return { rawAction, action: ACTION_ALIASES[rawAction] ?? rawAction };
}

function pickUrl(): string {
  const ext = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (ext?.includes(EXTERNAL_PROJECT_REF)) return ext;
  const nat = Deno.env.get("SUPABASE_URL");
  if (nat?.includes(EXTERNAL_PROJECT_REF)) return nat;
  // Nunca falha por secret stale: a URL pública é derivável do project ref.
  return `https://${EXTERNAL_PROJECT_REF}.supabase.co`;
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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    // Client Supabase EXTERNO padronizado (Passo 5).
    // Toda autenticação e escrita passa pelo mesmo projeto externo.
    const adminClient = getExternalAdmin();

    let callerId: string | null = null;
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (!userError && userData?.user?.id) {
      callerId = userData.user.id;
    }

    if (!callerId) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas administradores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedBody: unknown = await req.json();
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return new Response(JSON.stringify({ error: "Corpo da requisição inválido", version: FUNCTION_VERSION }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = parsedBody as Record<string, unknown>;
    const { user_id, role, display_name, username, email, password } = body;
    // Normaliza apelidos de ações usados por telas antigas/novas do painel para
    // evitar 400 "Ação inválida" por divergência de nomenclatura.
    const { rawAction, action } = normalizeAction(body);
    if (rawAction === "activate" || rawAction === "unban") body.active = true;
    if (rawAction === "deactivate" || rawAction === "ban") body.active = false;


    if (action === "list") {
      // Paginate through ALL auth users (default perPage is 50).
      // Without this loop, admins only see the first page of users and
      // cannot manage tab permissions for users beyond that page.
      const allUsers: any[] = [];
      let page = 1;
      const perPage = 1000;
      // Safety cap to avoid runaway loops
      for (let i = 0; i < 50; i++) {
        const { data: pageData, error: pageErr } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (pageErr) break;
        const batch = pageData?.users ?? [];
        allUsers.push(...batch);
        if (batch.length < perPage) break;
        page += 1;
      }

      // P1-02 egress: seleciona apenas as colunas usadas na composição do payload.
      const { data: roles } = await adminClient.from("user_roles").select("user_id, role");
      const { data: profiles } = await adminClient.from("profiles").select("user_id, display_name, username, trial_plan_name, trial_started_at, trial_days_override");
      const { data: tabPerms } = await adminClient.from("user_tab_permissions").select("user_id, allowed_tabs");
      const { data: clientPerms } = await adminClient.from("user_client_permissions").select("user_id, client_id");
      const { data: owners } = await adminClient.from("user_owner").select("user_id, owner_id");

      const normalizeName = (value: string | null | undefined) =>
        (value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();

      const ownerByUserId = new Map((owners || []).map((o) => [o.user_id, o.owner_id]));
      const legacyCreatedByMe = allUsers.filter((u) => {
        const profile = profiles?.find((p) => p.user_id === u.id);
        const name = normalizeName(profile?.display_name || u.user_metadata?.display_name || u.email);
        return (
          (name.includes("renan") && name.includes("mota")) ||
          (name.includes("thiago") && name.includes("ferraz")) ||
          (name.includes("helder") && name.includes("venas"))
        );
      });

      if (legacyCreatedByMe.length > 0) {
        await adminClient.from("user_owner").upsert(
          legacyCreatedByMe.map((u) => ({ user_id: u.id, owner_id: callerId })),
          { onConflict: "user_id" },
        );
        legacyCreatedByMe.forEach((u) => ownerByUserId.set(u.id, callerId));
      }

      const enriched = allUsers.map((u) => {
        const profile = profiles?.find((p) => p.user_id === u.id);
        const metadataUsername =
          typeof u.user_metadata?.username === "string" && u.user_metadata.username.trim()
            ? u.user_metadata.username.trim().toLowerCase()
            : null;
        const placeholderUsername =
          typeof u.email === "string" && u.email.endsWith("@placeholder.local")
            ? u.email.split("@")[0]?.trim().toLowerCase() || null
            : null;
        return ({
        id: u.id,
        email: u.email,
        display_name: profile?.display_name || u.user_metadata?.display_name || u.email,
        username: profile?.username || metadataUsername || placeholderUsername,
        trial_plan_name: profile?.trial_plan_name || null,
        trial_started_at: profile?.trial_started_at || null,
        trial_days_override: profile?.trial_days_override ?? null,
        role: roles?.find((r) => r.user_id === u.id)?.role || null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        is_active: !u.banned_until || new Date(u.banned_until) <= new Date(),
        allowed_tabs: tabPerms?.find((t) => t.user_id === u.id)?.allowed_tabs || null,
        linked_client_ids: clientPerms?.filter((c) => c.user_id === u.id).map((c) => c.client_id) || [],
        owner_id: ownerByUserId.get(u.id) || null,
      });
      });

      return new Response(JSON.stringify({ users: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_role") {
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "user_id e role são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Upsert role
      const { data: existing } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", user_id)
        .maybeSingle();

      if (existing) {
        await adminClient.from("user_roles").update({ role }).eq("user_id", user_id);
      } else {
        await adminClient.from("user_roles").insert({ user_id, role });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_user") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update auth user (email/password)
      const updateData: Record<string, unknown> = {};
      if (email) updateData.email = email;
      if (password) updateData.password = password;
      if (Object.keys(updateData).length > 0) {
        const { error: authErr } = await adminClient.auth.admin.updateUserById(user_id, updateData);
        if (authErr) {
          return new Response(JSON.stringify({ error: authErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Update profile — use upsert so it works even when the profile row doesn't
      // exist yet (older users signed up before the profile trigger ran). A plain
      // .update().eq() would silently affect 0 rows and return success.
      const profileUpdate: Record<string, unknown> = { user_id };
      if (display_name !== undefined) profileUpdate.display_name = display_name;
      if (username !== undefined) {
        const normalized = username ? String(username).trim().toLowerCase().replace(/\s+/g, "") : null;
        if (normalized && !/^[a-z0-9._-]{4,30}$/.test(normalized)) {
          return new Response(JSON.stringify({ error: "Nome de usuário inválido. Use 4–30 caracteres: letras, números, . _ -" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        profileUpdate.username = normalized;
      }
      if (Object.keys(profileUpdate).length > 1) {
        // If setting a username, ensure it isn't already taken by another user.
        if (typeof profileUpdate.username === "string" && profileUpdate.username) {
          const { data: taken } = await adminClient
            .from("profiles")
            .select("user_id")
            .eq("username", profileUpdate.username)
            .neq("user_id", user_id)
            .maybeSingle();
          if (taken) {
            return new Response(JSON.stringify({ error: "Nome de usuário já está em uso" }), {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        const { error: profErr } = await adminClient
          .from("profiles")
          .upsert(profileUpdate, { onConflict: "user_id" });
        if (profErr) {
          return new Response(JSON.stringify({ error: profErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Keep auth metadata in sync as a fallback for list/login flows where a
        // historical profile row was missing or stale.
        const metaUpdate: Record<string, unknown> = {};
        if (typeof profileUpdate.username === "string" || profileUpdate.username === null) metaUpdate.username = profileUpdate.username;
        if (typeof profileUpdate.display_name === "string") metaUpdate.display_name = profileUpdate.display_name;
        if (Object.keys(metaUpdate).length > 0) {
          await adminClient.auth.admin.updateUserById(user_id, { user_metadata: metaUpdate });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_permissions") {
      if (!user_id || !body.allowed_tabs) {
        return new Response(JSON.stringify({ error: "user_id e allowed_tabs são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: existing } = await adminClient
        .from("user_tab_permissions")
        .select("id")
        .eq("user_id", user_id)
        .maybeSingle();

      if (existing) {
        await adminClient.from("user_tab_permissions").update({ allowed_tabs: body.allowed_tabs }).eq("user_id", user_id);
      } else {
        await adminClient.from("user_tab_permissions").insert({ user_id, allowed_tabs: body.allowed_tabs });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_client_links") {
      if (!user_id || !body.client_ids) {
        return new Response(JSON.stringify({ error: "user_id e client_ids são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Remove all existing links then insert new ones
      await adminClient.from("user_client_permissions").delete().eq("user_id", user_id);
      const clientIds = body.client_ids as string[];
      if (clientIds.length > 0) {
        await adminClient.from("user_client_permissions").insert(
          clientIds.map((cid: string) => ({ user_id, client_id: cid }))
        );
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (user_id === callerId) {
        return new Response(JSON.stringify({ error: "Não é possível excluir seu próprio usuário" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await adminClient.from("user_client_permissions").delete().eq("user_id", user_id);
      await adminClient.from("user_tab_permissions").delete().eq("user_id", user_id);
      await adminClient.from("user_owner").delete().eq("user_id", user_id);
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.auth.admin.deleteUser(user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set_independent") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await adminClient.from("user_owner").delete().eq("user_id", user_id);
      return new Response(JSON.stringify({ success: true, message: "Conta desvinculada e tornada independente com sucesso." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "link_owner") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await adminClient.from("user_owner").upsert(
        { user_id, owner_id: callerId },
        { onConflict: "user_id" },
      );
      return new Response(JSON.stringify({ success: true, message: "Conta vinculada como membro da equipe." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle_active") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (user_id === callerId) {
        return new Response(JSON.stringify({ error: "Não é possível alterar o status do seu próprio usuário" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const active = body.active !== false;
      const { error: banError } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: active ? "none" : "876000h",
      });
      if (banError) {
        return new Response(JSON.stringify({ error: banError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      error: `Ação inválida: "${rawAction || "(vazia)"}"`,
      received_fields: Object.keys(body).sort(),
      version: FUNCTION_VERSION,
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
