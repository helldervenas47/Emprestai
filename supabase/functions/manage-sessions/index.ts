import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;

    // Use the user's token so SECURITY DEFINER funcs see auth.uid()
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsErr } =
      await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const currentSessionId = (claimsData.claims as any).session_id as
      | string
      | undefined;

    const body = await req.json().catch(() => ({}));
    const action = body?.action as "list" | "revoke" | undefined;

    if (action === "list") {
      const { data: sessions, error } = await userClient.rpc(
        "list_my_sessions" as any,
      );

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Geolocate IPs in parallel via ip-api.com (free, no key, pt-BR)
      const lookupGeo = async (ip: string | null) => {
        if (!ip) return null;
        if (
          /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i.test(ip)
        ) return null;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 2500);
          const res = await fetch(
            `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city,regionName,lat,lon&lang=pt-BR`,
            { signal: ctrl.signal },
          );
          clearTimeout(t);
          if (!res.ok) return null;
          const j = await res.json();
          if (j?.status !== "success") return null;
          return {
            city: j.city ?? null,
            region: j.regionName ?? null,
            country: j.country ?? null,
            lat: typeof j.lat === "number" ? j.lat : null,
            lon: typeof j.lon === "number" ? j.lon : null,
          };
        } catch {
          return null;
        }
      };

      const enriched = await Promise.all(
        ((sessions as any[]) ?? []).map(async (s: any) => ({
          ...s,
          geo: await lookupGeo(s.ip),
        })),
      );

      return new Response(
        JSON.stringify({
          sessions: enriched,
          current_session_id: currentSessionId ?? null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "revoke") {
      const sessionId = body?.session_id as string | undefined;
      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: "session_id is required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: ok, error: rpcErr } = await userClient.rpc(
        "revoke_my_session" as any,
        { _session_id: sessionId },
      );

      if (rpcErr) {
        return new Response(JSON.stringify({ error: rpcErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!ok) {
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
