import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { requireAdmin, adminCors as corsHeaders } from "../_shared/require-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const client = new Client(dbUrl);
  try {
    await client.connect();

    const jobsRes = await client.queryObject<{
      jobid: bigint; jobname: string; schedule: string; active: boolean; command: string;
    }>("select jobid, jobname, schedule, active, command from cron.job order by jobname");

    const runsRes = await client.queryObject<{
      jobid: bigint; status: string; return_message: string | null; start_time: Date; end_time: Date | null;
    }>(`select jobid, status, return_message, start_time, end_time
        from cron.job_run_details
        where start_time > now() - interval '24 hours'
        order by start_time desc
        limit 500`);

    const perJob: Record<string, any> = {};
    for (const r of runsRes.rows) {
      const k = String(r.jobid);
      if (!perJob[k]) perJob[k] = { total: 0, succeeded: 0, failed: 0, last_status: null, last_message: null, last_start: null };
      perJob[k].total++;
      if (r.status === "succeeded") perJob[k].succeeded++; else perJob[k].failed++;
      if (!perJob[k].last_start) {
        perJob[k].last_status = r.status;
        perJob[k].last_message = (r.return_message ?? "").slice(0, 300);
        perJob[k].last_start = r.start_time;
      }
    }

    const summary = jobsRes.rows.map((j) => ({
      jobid: Number(j.jobid),
      jobname: j.jobname,
      schedule: j.schedule,
      active: j.active,
      command_preview: j.command.slice(0, 200),
      last_24h: perJob[String(j.jobid)] ?? { total: 0 },
    }));

    return new Response(JSON.stringify({ jobs_count: jobsRes.rows.length, summary }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
});
