import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { adminGuard, guardCors as corsHeaders } from "../_shared/admin-guard.ts";



const SYSTEM_VARS = new Set([
  "PATH", "HOME", "DENO_DIR", "HOSTNAME", "PORT", "TMPDIR", "USER",
  "LANG", "TERM", "_", "DENO_REGION", "DENO_DEPLOYMENT_ID",
]);

const KNOWN_FUNCTIONS = [
  "admin-create-user", "admin-manage-user", "daily-backup", "daily-planning-summary",
  "export-full-backup", "generate-income-health-report", "generate-personal-insights",
  "generate-risk-reduction-report", "get-paddle-price", "html-to-image-usage",
  "incomes-expenses-summary", "link-telegram-bot", "list-app-integrations",
  "list-backups", "login-with-username", "manage-sessions", "migrate-sql",
  "notify-approval-request", "notify-budget-overrun", "painel-migracao",
  "payments-webhook", "process-auto-debit-expenses", "recalculate-credit-limits",
  "restore-backup", "send-personal-insights-telegram", "send-push-notifications",
  "send-webhook-report", "send-whatsapp-billing", "send-whatsapp-manager-summary",
  "sync-cdi-rate", "sync-client-analysis", "telegram-accumulated-delinquency-summary",
  "telegram-billing-summary", "telegram-daily-summary", "telegram-link-code",
  "telegram-manager-weekly-summary", "telegram-monthly-summary", "telegram-poll",
  "telegram-process", "telegram-reports-link-code", "telegram-reports-poll",
  "telegram-set-commands", "telegram-weekly-summary", "validate-telegram-bot",
  "whatsapp-assistant-webhook", "wipe-all-data",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  const gate = await adminGuard(req, { action: "painel-migracao" });
  if (gate instanceof Response) return gate;

  try {
    const env = Deno.env.toObject();
    const SUPABASE_URL = env.EXTERNAL_SUPABASE_URL ?? "";
    const service_role_key = env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY ?? "";

    // Return only the NAMES of configured secrets, never the values.
    const secret_names: string[] = [];
    for (const [k] of Object.entries(env)) {
      if (SYSTEM_VARS.has(k)) continue;
      if (k.startsWith("XDG_")) continue;
      if (["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"].includes(k)) continue;
      secret_names.push(k);
    }

    // Probe edge functions
    const probes = await Promise.allSettled(
      KNOWN_FUNCTIONS.map((name) =>
        fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: "OPTIONS" })
          .then((r) => ({ name, ok: r.status < 500 }))
      )
    );
    const edge_functions = probes
      .filter((p): p is PromiseFulfilledResult<{ name: string; ok: boolean }> =>
        p.status === "fulfilled" && p.value.ok
      )
      .map((p) => p.value.name);

    // Discover tables via exec_sql
    let database_tables: unknown = [];
    if (service_role_key) {
      try {
        const supabase = createClient(SUPABASE_URL, service_role_key);
        const tablesQuery = `
          SELECT
            t.tablename,
            COALESCE((SELECT n_live_tup FROM pg_stat_user_tables s WHERE s.relname = t.tablename AND s.schemaname = 'public'), 0)::int AS row_count,
            (SELECT COUNT(*)::int FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = t.tablename) AS column_count,
            (SELECT COUNT(*)::int FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = t.tablename AND c.column_name ILIKE '%encrypted%') AS encrypted_columns,
            EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = t.tablename AND c.column_name = 'user_id') AS has_user_id
          FROM pg_tables t
          WHERE t.schemaname = 'public'
          ORDER BY t.tablename
        `;
        const { data, error } = await supabase.rpc("exec_sql", { sql_query: tablesQuery });
        if (!error) database_tables = data ?? [];
      } catch (_) { /* ignore */ }
    }

    return new Response(
      JSON.stringify({
        project_url: SUPABASE_URL,
        secret_names,
        edge_functions,
        edge_functions_count: edge_functions.length,
        database_tables,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
