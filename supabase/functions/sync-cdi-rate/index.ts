import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SGS_PRIMARY = 4389; // CDI anualizada base 252
const SGS_FALLBACK = 1178; // Selic anualizada base 252

interface BcbRow { data: string; valor: string }

function parseBrDate(s: string): string {
  // "13/05/2026" -> "2026-05-13"
  const [d, m, y] = s.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

async function fetchSeries(code: number): Promise<{ rate: number; date: string } | null> {
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as BcbRow[];
    if (!Array.isArray(json) || json.length === 0) return null;
    const last = json[json.length - 1];
    const rate = Number(String(last.valor).replace(",", "."));
    if (!isFinite(rate) || rate <= 0) return null;
    return { rate, date: parseBrDate(last.data) };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // HARDCODED FALLBACK RATE (e.g. 10.65% if everything else fails)
  const HARDCODED_RATE = 10.65;
  const HARDCODED_DATE = new Date().toISOString().slice(0, 10);

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let result = await fetchSeries(SGS_PRIMARY);
    let source = `BCB SGS ${SGS_PRIMARY}`;
    if (!result) {
      result = await fetchSeries(SGS_FALLBACK);
      source = `BCB SGS ${SGS_FALLBACK} (fallback)`;
    }

    if (!result) {
      console.warn("BCB API unavailable, attempting to use cache");
      
      try {
        const { data: cached, error: cacheErr } = await supabase
          .from("market_rates")
          .select("annual_rate, reference_date, source")
          .eq("indicator", "cdi")
          .maybeSingle();

        if (cacheErr || !cached) {
          console.warn("No cache found or error fetching cache:", cacheErr);
          result = { rate: HARDCODED_RATE, date: HARDCODED_DATE };
          source = "Hardcoded Fallback (API & Cache unavailable)";
        } else {
          result = { 
            rate: Number(cached.annual_rate), 
            date: cached.reference_date 
          };
          source = `${cached.source} (stale/cached)`;
        }
      } catch (err) {
        console.warn("Critical failure fetching cache (likely missing table):", err.message);
        result = { rate: HARDCODED_RATE, date: HARDCODED_DATE };
        source = "Hardcoded Fallback (Cache exception)";
      }
    }

    const newRate = Number(result.rate.toFixed(4));
    const today = new Date().toISOString().slice(0, 10);

    // Only try to update cache if we have a fresh fetch
    if (!source.includes("Fallback") && !source.includes("stale/cached")) {
      try {
        await supabase
          .from("market_rates")
          .upsert({
            indicator: "cdi",
            annual_rate: newRate,
            source,
            reference_date: result.date,
            fetched_at: new Date().toISOString(),
          }, { onConflict: "indicator" });
      } catch (e) {
        console.warn("Cache update failed (table might be missing):", e.message);
      }
    }

    // Nova arquitetura: a taxa por cofrinho é controlada pela função
    // `sync-taxas-financeiras` (CDI/Selic gravado em `taxa_referencia`).
    // As tabelas legadas `piggy_banks` e `piggy_bank_rate_history` não são
    // mais utilizadas. Esta função permanece apenas como fonte do cache
    // `market_rates`. Nenhuma escrita em piggy_banks ocorre mais aqui.
    const updated = 0;


    return new Response(
      JSON.stringify({
        ok: true,
        indicator: "cdi",
        annual_rate: newRate,
        source,
        reference_date: result.date,
        cofrinhos_atualizados: updated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sync-cdi-rate unexpected error", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
