// Edge function: gerenciamento manual de assinaturas pelo admin.
// Ações: list | audit | grant_plan | set_dates | start_trial | extend_trial |
//        renew | suspend | reactivate | cancel | update_note | clear_override
import { requireAdmin, adminCors } from "../_shared/require-admin.ts";
import { getExternalAdmin } from "../_shared/external-supabase.ts";

const jsonHeaders = { ...adminCors, "Content-Type": "application/json" };

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: jsonHeaders });
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: jsonHeaders });
}

function envName(): string {
  return Deno.env.get("ASAAS_ENVIRONMENT") === "sandbox" ? "sandbox" : "live";
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

  if (body.action === "list") {
    const { data, error } = await admin.rpc("billing_admin_list", {
      _admin: adminUserId, _env: env, _search: body.search ?? "", _status: body.status_filter ?? "",
      _limit: body.limit ?? 100, _offset: body.offset ?? 0,
    });
    if (error) return bad(error.message, 500);
    return ok(data);
  }

  // ---------------------- AUDIT ----------------------
  if (body.action === "audit") {
    if (!body.target_user_id) return bad("target_user_id required");
    const { data, error } = await admin
      .from("subscription_audit_log")
      .select("*")
      .eq("target_user_id", body.target_user_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return bad(error.message, 500);
    return ok({ rows: data ?? [] });
  }

  if (!body.target_user_id) return bad("target_user_id required");
  const { data, error } = await admin.rpc("billing_admin_action", {
    _admin: adminUserId, _env: env, _body: body,
  });
  if (error) return bad(error.message, 400);
  return ok(data);
});
