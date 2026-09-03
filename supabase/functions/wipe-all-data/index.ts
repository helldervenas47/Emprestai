// Exclusão total dos dados de um owner.
// Exige confirmação literal: { confirmation: "EXCLUIR TODOS OS DADOS" }
// Não apaga auth.users, subscriptions, user_roles, user_owner.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BACKUP_TABLES } from "../_shared/backup-tables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

const CONFIRMATION_PHRASE = "EXCLUIR TODOS OS DADOS";

// Tabelas extras a apagar além das do backup-tables (que cobrem o domínio)
const EXTRA_TABLES: Array<{ name: string; ownerCol: string }> = [
  { name: "backup_history", ownerCol: "owner_id" },
  { name: "user_telegram_bots", ownerCol: "owner_id" },
  { name: "system_audit_logs", ownerCol: "owner_id" }, // exceto o registro que vamos criar agora
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Extra hardening: exige x-admin-secret + confirm ENTENDO_OS_RISCOS
  const expectedAdminSecret =
    Deno.env.get("X_ADMIN_SECRET") || Deno.env.get("ADMIN_SECRET");
  if (!expectedAdminSecret) {
    return new Response(JSON.stringify({ error: "Server missing X_ADMIN_SECRET" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const providedAdminSecret = req.headers.get("x-admin-secret") || "";
  if (providedAdminSecret !== expectedAdminSecret) {
    return new Response(JSON.stringify({ error: "Forbidden: invalid admin secret" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userRes, error: uErr } = await userClient.auth.getUser();
  if (uErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  if (body?.confirm !== "ENTENDO_OS_RISCOS") {
    return new Response(
      JSON.stringify({ error: `Confirmação obrigatória: envie { "confirm": "ENTENDO_OS_RISCOS" } no body.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (body?.confirmation !== CONFIRMATION_PHRASE) {
    return new Response(
      JSON.stringify({ error: `Confirmação inválida. Digite exatamente: ${CONFIRMATION_PHRASE}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: ownerIdData } = await admin.rpc("get_data_owner_id", { _user_id: userRes.user.id });
  const ownerId: string = ownerIdData || userRes.user.id;

  // Só o próprio dono pode apagar tudo (sub-contas não podem)
  if (ownerId !== userRes.user.id) {
    return new Response(JSON.stringify({ error: "Apenas o dono da conta pode excluir todos os dados" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Checa role: só admin
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Apenas administradores podem excluir todos os dados" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: linked } = await admin.from("user_owner").select("user_id").eq("owner_id", ownerId);
  const userIds = Array.from(new Set([ownerId, ...((linked || []).map((r: any) => r.user_id))]));

  const deletedCounts: Record<string, number> = {};
  const errors: Record<string, string> = {};

  // Apaga na ordem inversa para respeitar FKs
  for (let i = BACKUP_TABLES.length - 1; i >= 0; i--) {
    const t = BACKUP_TABLES[i];
    const filterValues = t.ownerCol === "owner_id" ? [ownerId] : userIds;
    const { error, count } = await admin.from(t.name).delete({ count: "exact" }).in(t.ownerCol, filterValues);
    if (error) {
      errors[t.name] = error.message;
    } else {
      deletedCounts[t.name] = count || 0;
    }
  }

  for (const t of EXTRA_TABLES) {
    const { error, count } = await admin.from(t.name).delete({ count: "exact" }).eq(t.ownerCol, ownerId);
    if (error) {
      errors[t.name] = error.message;
    } else {
      deletedCounts[t.name] = count || 0;
    }
  }

  // Apaga arquivos do storage privado (boleto-attachments/<ownerId>/*)
  try {
    const { data: files } = await admin.storage.from("boleto-attachments").list(ownerId, { limit: 1000 });
    if (files && files.length > 0) {
      const paths = files.map((f: any) => `${ownerId}/${f.name}`);
      await admin.storage.from("boleto-attachments").remove(paths);
      deletedCounts["storage:boleto-attachments"] = paths.length;
    }
  } catch (e: any) {
    errors["storage:boleto-attachments"] = e?.message || String(e);
  }

  // Auditoria — registro fica em system_audit_logs após a limpeza
  const { data: auditRow } = await admin.from("system_audit_logs").insert({
    user_id: userRes.user.id,
    owner_id: ownerId,
    action: "wipe_all_data",
    details: { deleted_counts: deletedCounts, errors, source: "self_service" },
    ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
    user_agent: req.headers.get("user-agent") || null,
  }).select("id").single();

  return new Response(JSON.stringify({
    ok: true,
    deleted_counts: deletedCounts,
    errors,
    audit_log_id: auditRow?.id || null,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
