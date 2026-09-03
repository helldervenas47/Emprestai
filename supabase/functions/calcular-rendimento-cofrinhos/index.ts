import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { validateCronSecret } from "../_shared/auth-guard.ts";
import {
  compoundDeposit,
  diffDays,
  round,
  settle,
  type DailyRateRow,
} from "../_shared/piggy-yield-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Cofrinhos moram no Supabase externo — usar as credenciais EXTERNAL_*
const SUPABASE_URL =
  Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function addDias(data: string, dias: number) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // Cron-only endpoint: requires X-Cron-Secret. Prevents unauthenticated
  // callers from triggering platform-wide yield recomputation.
  const okCron = await validateCronSecret(supabase, req);
  if (!okCron) {
    return new Response(
      JSON.stringify({ success: false, error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  try {
    const hoje = new Date().toISOString().slice(0, 10);

    const { data: aportes, error: aportesError } = await supabase
      .from("cofrinho_aportes")
      .select(`
        id,
        cofrinho_id,
        saldo_restante,
        rendimento_bruto,
        rendimento_liquido,
        percentual_cdi,
        data_aporte,
        ultimo_calculo,
        cofrinhos ( id, ativo, rendimento_automatico )
      `)
      .gt("saldo_restante", 0);

    if (aportesError) throw aportesError;

    let processados = 0;
    let ignorados = 0;
    let diasCriados = 0;

    for (const aporte of aportes ?? []) {
      const cofrinho = Array.isArray(aporte.cofrinhos) ? aporte.cofrinhos[0] : aporte.cofrinhos;
      if (!cofrinho?.ativo || !cofrinho?.rendimento_automatico) {
        ignorados++;
        continue;
      }

      // Data inicial do catch-up: dia seguinte ao último cálculo, ou o próprio dia do aporte
      const inicioIter = aporte.ultimo_calculo
        ? addDias(aporte.ultimo_calculo, 1)
        : aporte.data_aporte;

      if (diffDays(inicioIter, hoje) < 0) {
        ignorados++;
        continue;
      }

      // Busca todas as taxas do intervalo de uma vez
      const { data: taxas, error: taxasErr } = await supabase
        .from("taxa_referencia")
        .select("data, cdi_diario")
        .gte("data", inicioIter)
        .lte("data", hoje)
        .order("data", { ascending: true });

      if (taxasErr) throw taxasErr;
      if (!taxas || taxas.length === 0) {
        ignorados++;
        continue;
      }

      // Idempotência: descarta dias que já possuem registro para este aporte.
      const { data: existentes, error: existentesErr } = await supabase
        .from("cofrinho_rendimento_diario")
        .select("data")
        .eq("aporte_id", aporte.id)
        .gte("data", inicioIter)
        .lte("data", hoje);
      if (existentesErr) throw existentesErr;
      const jaGravados = new Set((existentes ?? []).map((r: any) => String(r.data).slice(0, 10)));

      const rates: DailyRateRow[] = (taxas as any[])
        .map((t) => ({ data: String(t.data).slice(0, 10), cdiDiario: Number(t.cdi_diario) }))
        .filter((t) => !jaGravados.has(t.data));

      if (!rates.length) {
        ignorados++;
        continue;
      }

      const principal = Number(aporte.saldo_restante ?? 0);
      const percentualCdi = Number(aporte.percentual_cdi ?? 100);
      const brutoAnterior = Number(aporte.rendimento_bruto ?? 0);

      // Capitalização composta diária continuando de onde parou (saldo bruto).
      const resultado = compoundDeposit(
        principal,
        aporte.data_aporte,
        rates,
        percentualCdi,
        principal + Math.max(0, brutoAnterior),
      );

      if (!resultado.rows.length) {
        ignorados++;
        continue;
      }

      // Provisão de imposto do dia anterior ao primeiro dia processado, para
      // gravar apenas o DELTA de IOF/IR em cada linha diária.
      const diasAntes = aporte.ultimo_calculo
        ? Math.max(0, diffDays(aporte.data_aporte, aporte.ultimo_calculo))
        : 0;
      const anterior = settle({
        principal,
        saldoBruto: principal + Math.max(0, brutoAnterior),
        diasCorridos: diasAntes,
      });

      let iofPrev = anterior.iof;
      let irPrev = anterior.ir;
      let ultimaData = aporte.ultimo_calculo ?? aporte.data_aporte;

      for (const row of resultado.rows) {
        const iofDia = round(row.iof - iofPrev, 8);
        const irDia = round(row.imposto - irPrev, 8);
        iofPrev = row.iof;
        irPrev = row.imposto;

        const { error: insErr } = await supabase.from("cofrinho_rendimento_diario").insert({
          cofrinho_id: aporte.cofrinho_id,
          aporte_id: aporte.id,
          data: row.data,
          saldo_principal: principal,
          percentual_cdi: percentualCdi,
          taxa_cdi: row.taxaCdi,
          rendimento_bruto: row.rendimentoDia,
          imposto_renda: irDia,
          iof: iofDia,
          rendimento_liquido: round(row.rendimentoDia - irDia - iofDia, 8),
          saldo_total: round(row.saldoBruto, 2),
        });
        if (insErr) throw insErr;

        ultimaData = row.data;
        diasCriados++;
      }

      const final = resultado.settlement;

      const { error: updErr } = await supabase
        .from("cofrinho_aportes")
        .update({
          rendimento_bruto: round(final.rendimentoBruto, 2),
          rendimento_liquido: round(final.rendimentoLiquido, 2),
          dias_aplicados: diffDays(aporte.data_aporte, ultimaData),
          ultimo_calculo: ultimaData,
        })
        .eq("id", aporte.id);
      if (updErr) throw updErr;

      await supabase.rpc("fn_atualizar_saldos_cofrinho", { p_cofrinho_id: aporte.cofrinho_id });
      processados++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        modelo: "composto_diario_du_iof_ir_no_resgate",
        data_calculo: hoje,
        processados,
        ignorados,
        dias_criados: diasCriados,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
