// Exporta backup completo do owner como arquivo JSON para download.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BACKUP_TABLES, BACKUP_VERSION, sha256Hex } from "../_shared/backup-tables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "content-disposition",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: ownerIdData } = await admin.rpc("get_data_owner_id", { _user_id: userRes.user.id });
  const ownerId: string = ownerIdData || userRes.user.id;

  if (ownerId !== userRes.user.id) {
    return new Response(JSON.stringify({ error: "Apenas o dono da conta pode exportar backup" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { data: linked } = await admin.from("user_owner").select("user_id").eq("owner_id", ownerId);
    const userIds = Array.from(new Set([ownerId, ...((linked || []).map((r: any) => r.user_id))]));

    const snapshot: Record<string, any> = {};
    const tableCounts: Record<string, number> = {};
    const errors: Record<string, string> = {};

    for (const t of BACKUP_TABLES) {
      const filterValues = t.ownerCol === "owner_id" ? [ownerId] : userIds;
      const { data, error } = await admin.from(t.name).select("*").in(t.ownerCol, filterValues);
      if (error) {
        errors[t.name] = error.message;
        snapshot[t.name] = [];
        tableCounts[t.name] = 0;
      } else {
        snapshot[t.name] = data || [];
        tableCounts[t.name] = (data || []).length;
      }
    }

    const meta = {
      version: BACKUP_VERSION,
      owner_id: ownerId,
      member_user_ids: userIds,
      generated_at: new Date().toISOString(),
      triggered_by: "export-full" as const,
      table_counts: tableCounts,
      errors,
      checksum: "" as string,
    };

    const withoutChecksum = JSON.stringify({ __meta: { ...meta, checksum: "" }, ...snapshot });
    meta.checksum = await sha256Hex(withoutChecksum);

    const finalPayload = JSON.stringify({ __meta: meta, ...snapshot });

    // Auditoria
    try {
      await admin.from("system_audit_logs").insert({
        user_id: userRes.user.id,
        owner_id: ownerId,
        action: "export_backup",
        details: { table_counts: tableCounts, size_bytes: finalPayload.length, errors },
        ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
        user_agent: req.headers.get("user-agent") || null,
      });
    } catch { /* não bloqueia */ }

    const today = new Date().toISOString().slice(0, 10);
    const filename = `empresta-ai-backup-${today}-${ownerId.slice(0, 8)}.json`;

    return new Response(finalPayload, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
