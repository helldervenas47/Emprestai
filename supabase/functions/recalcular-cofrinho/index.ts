import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { validateUserOwner, validateCronSecret } from "../_shared/auth-guard.ts";
import {
  compoundDeposit,
  diffDays,
  round,
  type DailyRateRow,
} from "../_shared/piggy-yield-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json();

    const cofrinho_id = body.cofrinho_id;
    const data_inicio = body.data_inicio;
    const data_fim = body.data_fim ?? new Date().toISOString().slice(0, 10);

    if (!cofrinho_id) throw new Error("cofrinho_id é obrigatório.");

    // AuthZ: cron secret (server-side jobs) OR authenticated owner of the cofrinho.
    const isCron = await validateCronSecret(supabase, req);
    if (!isCron) {
      const { data: cof, error: cofErr } = await supabase
        .from("cofrinhos")
        .select("usuario_id")
        .eq("id", cofrinho_id)
        .single();
      if (cofErr || !cof) {
        return new Response(
          JSON.stringify({ success: false, error: "cofrinho_not_found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const authCheck = await validateUserOwner(supabase, req, cof.usuario_id);
      if (!authCheck.ok) {
        return new Response(
          JSON.stringify({ success: false, error: "unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const { data: aportes, error: aportesError } = await supabase
      .from("cofrinho_aportes")
      .select("id, data_aporte, saldo_restante, percentual_cdi")
      .eq("cofrinho_id", cofrinho_id)
      .gt("saldo_restante", 0)
      .order("data_aporte", { ascending: true });

    if (aportesError) throw aportesError;

    await supabase
      .from("cofrinho_rendimento_diario")
      .delete()
      .eq("cofrinho_id", cofrinho_id)
      .gte("data", data_inicio ?? "1900-01-01")
      .lte("data", data_fim);

    let processados = 0;

    for (const aporte of aportes ?? []) {
      // O recálculo SEMPRE parte do dia do aporte: a capitalização é composta,
      // então não é possível reconstruir uma janela isolada sem o saldo bruto
      // acumulado anterior.
      const { data: taxas, error: taxasError } = await supabase
        .from("taxa_referencia")
        .select("data, cdi_diario")
        .gte("data", aporte.data_aporte)
        .lte("data", data_fim)
        .order("data", { ascending: true });

      if (taxasError) throw taxasError;

      const rates: DailyRateRow[] = (taxas ?? []).map((t: any) => ({
        data: String(t.data).slice(0, 10),
        cdiDiario: Number(t.cdi_diario),
      }));

      const principal = Number(aporte.saldo_restante);
      const percentual = Number(aporte.percentual_cdi ?? 100);
      const resultado = compoundDeposit(
        principal,
        aporte.data_aporte,
        rates,
        percentual,
      );

      const janelaInicio = data_inicio && data_inicio > aporte.data_aporte
        ? data_inicio
        : aporte.data_aporte;

      let iofPrev = 0;
      let irPrev = 0;

      for (const row of resultado.rows) {
        const iofDia = round(row.iof - iofPrev, 8);
        const irDia = round(row.imposto - irPrev, 8);
        iofPrev = row.iof;
        irPrev = row.imposto;

        // Só regrava as linhas da janela solicitada (as demais permanecem).
        if (row.data < janelaInicio) continue;

        await supabase.from("cofrinho_rendimento_diario").upsert(
          {
            cofrinho_id,
            aporte_id: aporte.id,
            data: row.data,
            saldo_principal: principal,
            percentual_cdi: percentual,
            taxa_cdi: row.taxaCdi,
            rendimento_bruto: row.rendimentoDia,
            imposto_renda: irDia,
            iof: iofDia,
            rendimento_liquido: round(row.rendimentoDia - irDia - iofDia, 8),
            saldo_total: round(row.saldoBruto, 2),
          },
          { onConflict: "aporte_id,data" },
        );

        processados++;
      }

      await supabase
        .from("cofrinho_aportes")
        .update({
          rendimento_bruto: round(resultado.settlement.rendimentoBruto, 2),
          rendimento_liquido: round(resultado.settlement.rendimentoLiquido, 2),
          dias_aplicados: diffDays(aporte.data_aporte, resultado.ultimaData ?? data_fim),
          ultimo_calculo: resultado.ultimaData ?? data_fim,
        })
        .eq("id", aporte.id);
    }

    await supabase.rpc("fn_atualizar_saldos_cofrinho", {
      p_cofrinho_id: cofrinho_id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        modelo: "composto_diario_du_iof_ir_no_resgate",
        cofrinho_id,
        data_inicio: data_inicio ?? "desde o primeiro aporte",
        data_fim,
        registros_recalculados: processados,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
