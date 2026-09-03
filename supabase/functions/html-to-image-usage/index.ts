const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const userId = Deno.env.get("HTML_TO_IMAGE_USER_ID");
    const apiKey = Deno.env.get("HTML_TO_IMAGE_API_KEY");
    if (!userId || !apiKey) {
      return new Response(
        JSON.stringify({ configured: false, error: "HTML to Image não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const auth = btoa(`${userId}:${apiKey}`);
    const r = await fetch("https://hcti.io/v1/usage", {
      headers: { Authorization: `Basic ${auth}` },
    });
    const text = await r.text();
    console.log("[html-to-image-usage] HCTI status:", r.status, "body:", text.slice(0, 500));
    let data: any = {};
    try { data = JSON.parse(text); } catch { /* keep empty */ }

    if (!r.ok) {
      return new Response(
        JSON.stringify({
          configured: true,
          status: r.status,
          error: data?.message || data?.error || `Falha ao consultar uso (${r.status})`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // HCTI /v1/usage retorna { data: { month: { "YYYY-MM-01T00:00:00Z": n } }, per_billing_period: [{ total_images, start, end }] }
    const period = Array.isArray(data?.per_billing_period) ? data.per_billing_period[0] : null;
    const monthMap = (data?.data?.month ?? {}) as Record<string, number>;
    const monthSum = Object.values(monthMap).reduce((acc: number, v: any) => acc + Number(v || 0), 0);
    const used = Number(period?.total_images ?? monthSum ?? 0);
    const envLimit = Number(Deno.env.get("HTML_TO_IMAGE_MONTHLY_LIMIT") ?? 0);
    const limit = envLimit > 0 ? envLimit : 50; // plano free padrão HCTI

    return new Response(
      JSON.stringify({
        configured: true,
        used,
        limit,
        period_start: period?.start ?? null,
        period_end: period?.end ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ configured: true, error: e.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
