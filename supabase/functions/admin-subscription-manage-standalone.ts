// ============================================================================
// Edge Function: admin-subscription-manage (VERSÃO STANDALONE — arquivo único)
// Cole ESTE arquivo inteiro no editor do Supabase Dashboard.
// Nome da function: admin-subscription-manage   |   verify_jwt: OFF
//
// Requer os secrets abaixo em Edge Functions → Manage secrets:
//   EXTERNAL_SUPABASE_URL              = https://syyxnqzxqabeuqbuptkh.supabase.co
//   EXTERNAL_SUPABASE_ANON_KEY         = <sua anon key>
//   EXTERNAL_SUPABASE_SERVICE_ROLE_KEY = <sua service role key>
//   (opcional) EXTERNAL_PROJECT_REF    = syyxnqzxqabeuqbuptkh
//   (opcional) APP_ENVIRONMENT         = production  → grava environment="live"
// ============================================================================
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// ---------- CORS ----------
const adminCors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...adminCors, "Content-Type": "application/json" };

// ---------- External Supabase helpers ----------
const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`[external-supabase] secret ${name} não configurado.`);
  return v;
}
function getExternalSupabaseUrl(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (external) return external;
  const nativeUrl = Deno.env.get("SUPABASE_URL");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF)) return nativeUrl;
  return required("EXTERNAL_SUPABASE_URL");
}
function getExternalServiceRoleKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (external) return external;
  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;
  return required("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
}
function getExternalAnonKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (external) return external;
  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;
  return required("EXTERNAL_SUPABASE_ANON_KEY");
}
function getExternalAdmin(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey(), {
    auth: { persistSession: false },
  });
}
function getExternalUserClient(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalAnonKey(), {
    auth: { persistSession: false },
  });
}

// ---------- requireAdmin ----------
async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }
  let admin: SupabaseClient;
  try {
    admin = getExternalAdmin();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server misconfigured", detail: (e as Error).message }),
      { status: 500, headers: jsonHeaders });
  }
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }
  const { data: roleRow } = await admin
    .from("user_roles").select("role")
    .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: jsonHeaders });
  }
  return { userId: userData.user.id };
}

// ---------- helpers ----------
function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: jsonHeaders });
}
function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: jsonHeaders });
}
function envName(): string {
  return Deno.env.get("APP_ENVIRONMENT") === "production" ? "live" : "sandbox";
}

interface Body {
  action: string;
  target_user_id?: string;
  plan_id?: string;
  product_id?: string;
  start_date?: string | null;
  end_date?: string | null;
  trial_days?: number;
  note?: string;
  status_filter?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: adminCors });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;
  const adminUserId = guard.userId;

  let body: Body;
  try { body = await req.json(); } catch { return bad("Invalid JSON"); }
  if (!body?.action) return bad("action required");

  const admin = getExternalAdmin();
  const env = envName();

  // LIST
  if (body.action === "list") {
    const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);
    const offset = Math.max(body.offset ?? 0, 0);
    let profQuery = admin
      .from("profiles")
      .select("user_id, display_name, username, created_at, trial_days_override, trial_started_at, trial_plan_name", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (body.search && body.search.trim()) {
      const s = `%${body.search.trim()}%`;
      profQuery = profQuery.or(`display_name.ilike.${s},username.ilike.${s}`);
    }
    const { data: profiles, count, error: pErr } = await profQuery;
    if (pErr) return bad(pErr.message, 500);

    const ids = (profiles ?? []).map((p: any) => p.user_id);
    const [{ data: subs }, { data: plans }] = await Promise.all([
      ids.length
        ? admin.from("subscriptions")
            .select("id, user_id, product_id, price_id, status, current_period_start, current_period_end, cancel_at_period_end, environment, manual_override, manual_override_at, manual_note, updated_at")
            .in("user_id", ids)
        : Promise.resolve({ data: [] as any[] }),
      admin.from("plans").select("id, name, trial_days, active"),
    ]);

    const subByUser = new Map<string, any>();
    (subs ?? [])
      .slice()
      .sort((a: any, b: any) => {
        const aFree = !a.product_id || a.product_id === "free_plan" ? 1 : 0;
        const bFree = !b.product_id || b.product_id === "free_plan" ? 1 : 0;
        if (aFree !== bFree) return aFree - bFree;
        return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
      })
      .forEach((s: any) => { if (!subByUser.has(s.user_id)) subByUser.set(s.user_id, s); });

    const emailByUser = new Map<string, string | null>();
    await Promise.all(
      ids.map(async (uid: string) => {
        try {
          const { data } = await admin.auth.admin.getUserById(uid);
          emailByUser.set(uid, data?.user?.email ?? null);
        } catch { emailByUser.set(uid, null); }
      })
    );

    let rows = (profiles ?? []).map((p: any) => ({
      user_id: p.user_id, display_name: p.display_name,
      email: emailByUser.get(p.user_id) ?? null,
      username: p.username ?? null,
      created_at: p.created_at, trial_started_at: p.trial_started_at,
      trial_plan_name: p.trial_plan_name, trial_days_override: p.trial_days_override,
      subscription: subByUser.get(p.user_id) ?? null,
    }));

    if (body.status_filter) {
      rows = rows.filter((r) => (r.subscription?.status ?? "none") === body.status_filter);
    }
    return ok({ rows, total: count ?? rows.length, plans: plans ?? [] });
  }

  // AUDIT
  if (body.action === "audit") {
    if (!body.target_user_id) return bad("target_user_id required");
    const { data, error } = await admin
      .from("subscription_audit_log").select("*")
      .eq("target_user_id", body.target_user_id)
      .order("created_at", { ascending: false }).limit(100);
    if (error) return bad(error.message, 500);
    return ok({ rows: data ?? [] });
  }

  // Mutations
  if (!body.target_user_id) return bad("target_user_id required");
  const targetId = body.target_user_id;

  // Look up existing subscription across ALL environments (prefer non-free / most recent).
  const { data: allSubs } = await admin
    .from("subscriptions").select("*")
    .eq("user_id", targetId);
  const beforeSub = (allSubs ?? [])
    .slice()
    .sort((a: any, b: any) => {
      const aFree = !a.product_id || a.product_id === "free_plan" ? 1 : 0;
      const bFree = !b.product_id || b.product_id === "free_plan" ? 1 : 0;
      if (aFree !== bFree) return aFree - bFree;
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    })[0] ?? null;
  // Write into the environment of the existing record (if any); otherwise current env.
  const writeEnv = beforeSub?.environment ?? env;
  const { data: beforeProfile } = await admin
    .from("profiles").select("trial_started_at, trial_plan_name, trial_days_override")
    .eq("user_id", targetId).maybeSingle();

  const now = new Date().toISOString();

  const upsertSub = async (patch: Record<string, unknown>) => {
    const productId = String(patch.product_id ?? beforeSub?.product_id ?? "free_plan");
    const priceId = String(patch.price_id ?? beforeSub?.price_id ?? `${productId}_monthly`);
    const payload: Record<string, unknown> = {
      user_id: targetId, environment: writeEnv,
      paddle_subscription_id: beforeSub?.paddle_subscription_id ?? `manual_${targetId}_${writeEnv}`,
      paddle_customer_id: beforeSub?.paddle_customer_id ?? `manual_customer_${targetId}`,
      product_id: productId,
      price_id: priceId,
      status: beforeSub?.status ?? "active",
      current_period_start: beforeSub?.current_period_start ?? now,
      current_period_end: beforeSub?.current_period_end ?? new Date(Date.now() + 30 * 864e5).toISOString(),
      cancel_at_period_end: beforeSub?.cancel_at_period_end ?? false,
      manual_override: true, manual_override_by: adminUserId,
      manual_override_at: now, updated_at: now, ...patch,
    };
    if (!beforeSub) payload.created_at = now;
    const { data, error } = await admin
      .from("subscriptions").upsert(payload, { onConflict: "user_id,environment" })
      .select("*").maybeSingle();
    if (error) throw new Error(error.message);
    await bumpTarget();
    return data;
  };

  const bumpTarget = async () => {
    try {
      await admin.from("profiles")
        .update({ subscription_bump_at: new Date().toISOString() })
        .eq("user_id", targetId);
    } catch { /* coluna ausente — ignora */ }
  };

  const writeAudit = async (action: string, after: unknown, extra: Record<string, unknown> = {}) => {
    await admin.from("subscription_audit_log").insert({
      subscription_id: (after as any)?.id ?? beforeSub?.id ?? null,
      target_user_id: targetId, admin_user_id: adminUserId, action,
      before: { subscription: beforeSub, profile: beforeProfile },
      after: { subscription: after, ...extra },
      note: body.note ?? null,
    });
  };

  try {
    switch (body.action) {
      case "grant_plan": {
        const requestedProductId = typeof body.product_id === "string" && body.product_id.trim()
          ? body.product_id.trim()
          : "";
        const { data: plan } = body.plan_id
          ? await admin.from("plans").select("id, name").eq("id", body.plan_id).maybeSingle()
          : { data: null } as any;
        if (!plan && !requestedProductId) return bad("plan_id ou product_id required");
        const productId = requestedProductId || (plan.name.toLowerCase().includes("bás") ? "basico_plan"
          : plan.name.toLowerCase().includes("prof") ? "profissional_plan"
          : plan.name.toLowerCase().includes("empr") ? "empresarial_plan"
          : plan.name.toLowerCase().replace(/\s+/g, "_") + "_plan");
        const start = body.start_date ?? now;
        const end = body.end_date ?? new Date(Date.now() + 30 * 86400_000).toISOString();
        if (new Date(start) > new Date(end)) return bad("start_date > end_date");
        const after = await upsertSub({
          product_id: productId, price_id: `${productId}_monthly`,
          status: "active", current_period_start: start, current_period_end: end,
          cancel_at_period_end: false, manual_note: body.note ?? null,
        });
        await writeAudit("grant_plan", after, { plan_name: plan?.name ?? productId });
        return ok({ subscription: after });
      }
      case "set_dates": {
        if (!body.start_date || !body.end_date) return bad("start_date e end_date obrigatórios");
        if (new Date(body.start_date) > new Date(body.end_date)) return bad("start_date > end_date");
        const after = await upsertSub({
          current_period_start: body.start_date, current_period_end: body.end_date,
          product_id: beforeSub?.product_id ?? "basico_plan",
          price_id: beforeSub?.price_id ?? "basico_plan_monthly",
          status: beforeSub?.status ?? "active",
        });
        await writeAudit("set_dates", after);
        return ok({ subscription: after });
      }
      case "start_trial": {
        const days = Number(body.trial_days ?? 7);
        if (!Number.isFinite(days) || days < 0 || days > 365) return bad("trial_days inválido");
        const planName = body.product_id ?? "Profissional";
        const { error: pErr } = await admin.from("profiles").update({
          trial_started_at: now, trial_plan_name: planName,
          trial_days_override: days, subscription_manual_note: body.note ?? null,
        }).eq("user_id", targetId);
        if (pErr) return bad(pErr.message, 500);
        const after = await upsertSub({
          product_id: beforeSub?.product_id ?? "basico_plan",
          price_id: beforeSub?.price_id ?? "trial",
          status: "trialing", current_period_start: now,
          current_period_end: new Date(Date.now() + days * 86400_000).toISOString(),
          cancel_at_period_end: false,
        });
        await writeAudit("start_trial", after, { trial_days: days, plan_name: planName });
        return ok({ subscription: after });
      }
      case "extend_trial": {
        const days = Number(body.trial_days ?? 0);
        if (!Number.isFinite(days) || days === 0) return bad("trial_days inválido");
        const baseEnd = beforeSub?.current_period_end ? new Date(beforeSub.current_period_end) : new Date();
        const newEnd = new Date(baseEnd.getTime() + days * 86400_000);
        if (newEnd.getTime() < Date.now() - 86400_000) return bad("Nova data ficaria no passado");
        const currentOverride = beforeProfile?.trial_days_override ?? 0;
        await admin.from("profiles").update({
          trial_days_override: Math.max(0, currentOverride + days),
        }).eq("user_id", targetId);
        const after = await upsertSub({
          current_period_end: newEnd.toISOString(),
          status: beforeSub?.status === "trialing" ? "trialing" : (beforeSub?.status ?? "trialing"),
          product_id: beforeSub?.product_id ?? "basico_plan",
          price_id: beforeSub?.price_id ?? "trial",
        });
        await writeAudit("extend_trial", after, { delta_days: days });
        return ok({ subscription: after });
      }
      case "set_days_remaining": {
        const days = Number(body.trial_days ?? -1);
        if (!Number.isFinite(days) || days < 0 || days > 3650) return bad("Quantidade de dias inválida (0-3650)");
        const start = new Date();
        const end = new Date(start.getTime() + days * 86400_000);
        await admin.from("profiles").update({
          trial_started_at: start.toISOString(),
          trial_days_override: days,
        }).eq("user_id", targetId);
        const isTrial = (beforeSub?.status ?? "none") === "trialing" || !beforeSub;
        const nextStatus = days === 0
          ? "expired"
          : (isTrial ? "trialing" : "active");
        const after = await upsertSub({
          current_period_start: start.toISOString(),
          current_period_end: end.toISOString(),
          status: nextStatus,
          cancel_at_period_end: false,
          product_id: beforeSub?.product_id ?? "basico_plan",
          price_id: beforeSub?.price_id ?? (isTrial ? "trial" : "basico_plan_monthly"),
        });
        await writeAudit("set_days_remaining", after, { days });
        return ok({ subscription: after });
      }
      case "renew": {
        const days = Number(body.trial_days ?? 30);
        if (!Number.isFinite(days) || days <= 0 || days > 3650) return bad("dias inválido");
        const base = beforeSub?.current_period_end && new Date(beforeSub.current_period_end) > new Date()
          ? new Date(beforeSub.current_period_end) : new Date();
        const newEnd = new Date(base.getTime() + days * 86400_000);
        const after = await upsertSub({
          status: "active",
          current_period_start: beforeSub?.current_period_start ?? now,
          current_period_end: newEnd.toISOString(), cancel_at_period_end: false,
          product_id: beforeSub?.product_id ?? "basico_plan",
          price_id: beforeSub?.price_id ?? "basico_plan_monthly",
        });
        await writeAudit("renew", after, { delta_days: days });
        return ok({ subscription: after });
      }
      case "suspend": {
        if (!beforeSub) return bad("Sem assinatura para suspender");
        const after = await upsertSub({
          status: "suspended", product_id: beforeSub.product_id, price_id: beforeSub.price_id,
        });
        await writeAudit("suspend", after);
        return ok({ subscription: after });
      }
      case "reactivate": {
        if (!beforeSub) return bad("Sem assinatura para reativar");
        const end = beforeSub.current_period_end && new Date(beforeSub.current_period_end) > new Date()
          ? beforeSub.current_period_end
          : new Date(Date.now() + 30 * 86400_000).toISOString();
        const after = await upsertSub({
          status: "active", current_period_end: end, cancel_at_period_end: false,
          product_id: beforeSub.product_id, price_id: beforeSub.price_id,
        });
        await writeAudit("reactivate", after);
        return ok({ subscription: after });
      }
      case "cancel": {
        if (!beforeSub) return bad("Sem assinatura para cancelar");
        const after = await upsertSub({
          status: "canceled", cancel_at_period_end: true,
          product_id: beforeSub.product_id, price_id: beforeSub.price_id,
        });
        await writeAudit("cancel", after);
        return ok({ subscription: after });
      }
      case "update_note": {
        const after = await upsertSub({
          manual_note: body.note ?? null,
          product_id: beforeSub?.product_id ?? "basico_plan",
          price_id: beforeSub?.price_id ?? "manual",
          status: beforeSub?.status ?? "active",
        });
        await writeAudit("update_note", after);
        return ok({ subscription: after });
      }
      case "clear_override": {
        if (!beforeSub) return bad("Sem assinatura");
        const { data, error } = await admin
          .from("subscriptions")
          .update({
            manual_override: false, manual_override_by: null,
            manual_override_at: null, manual_note: null, updated_at: now,
          })
          .eq("user_id", targetId).eq("environment", writeEnv)
          .select("*").maybeSingle();
        if (error) return bad(error.message, 500);
        await admin.from("profiles").update({ trial_days_override: null }).eq("user_id", targetId);
        await writeAudit("clear_override", data);
        await bumpTarget();
        return ok({ subscription: data });
      }
      case "set_username": {
        const raw = typeof (body as any).username === "string" ? String((body as any).username) : "";
        const norm = raw.trim().toLowerCase();
        if (norm && !/^[a-z0-9._-]{3,30}$/.test(norm)) return bad("Username inválido (3-30, [a-z0-9._-])");
        const finalValue: string | null = norm.length ? norm : null;
        if (finalValue) {
          const { data: taken } = await admin.from("profiles").select("user_id")
            .eq("username", finalValue).neq("user_id", targetId).maybeSingle();
          if (taken) return bad("Username já está em uso", 409);
        }
        const { data, error } = await admin.from("profiles")
          .update({ username: finalValue }).eq("user_id", targetId)
          .select("user_id, username").maybeSingle();
        if (error) return bad(error.message, 500);
        await writeAudit("set_username", data, { username: finalValue });
        return ok({ profile: data });
      }
      default:
        return bad(`Ação desconhecida: ${body.action}`);
    }
  } catch (e) {
    return bad((e as Error).message, 500);
  }
});
