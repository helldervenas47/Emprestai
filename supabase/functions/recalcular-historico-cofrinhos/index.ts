import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { validateUserOwner, validateCronSecret } from "../_shared/auth-guard.ts";
import {
  compoundDeposit,
  diffDays,
  round as roundCore,
  type DailyRateRow,
} from "../_shared/piggy-yield-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL =
  Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Variáveis SUPABASE_URL/EXTERNAL_SUPABASE_URL ausentes.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function round(value: number, places = 8) {
  return Number(value.toFixed(places));
}

function brDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

async function syncTaxas(dataInicio: string, dataFim: string) {
  const url =
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados?formato=json&dataInicial=${brDate(dataInicio)}&dataFinal=${brDate(dataFim)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Erro ao buscar taxas no BACEN: ${response.status}`);
  }

  const dados = await response.json();

  if (!Array.isArray(dados)) {
    throw new Error("Resposta inválida do BACEN.");
  }

  const taxaRefRows: any[] = [];
  const cdiRows: any[] = [];

  for (const item of dados) {
    const [d, m, y] = item.data.split("/");
    const data = `${y}-${m}-${d}`;

    const taxaDiariaPercentual = Number(String(item.valor).replace(",", "."));
    const taxaDiaria = taxaDiariaPercentual / 100;
    const taxaAnual = (Math.pow(1 + taxaDiaria, 252) - 1) * 100;

    taxaRefRows.push({
      data,
      cdi_anual: round(taxaAnual, 4),
      cdi_diario: round(taxaDiaria, 12),
      selic_anual: round(taxaAnual, 4),
      selic_diaria: round(taxaDiaria, 12),
      fonte: "BACEN_SGS_11_HISTORICO",
    });

    cdiRows.push({
      data,
      taxa_anual: round(taxaAnual, 4),
      taxa_diaria: round(taxaDiaria, 12),
      fator: round(1 + taxaDiaria, 12),
    });
  }

  // Bulk upsert em lotes para caber no limite de 150s da Edge Function.
  const CHUNK = 500;

  for (let i = 0; i < taxaRefRows.length; i += CHUNK) {
    const taxaRef = await supabase
      .from("taxa_referencia")
      .upsert(taxaRefRows.slice(i, i + CHUNK), { onConflict: "data" });
    if (taxaRef.error) throw taxaRef.error;
  }

  for (let i = 0; i < cdiRows.length; i += CHUNK) {
    const cdi = await supabase
      .from("cdi_diario")
      .upsert(cdiRows.slice(i, i + CHUNK), { onConflict: "data" });
    if (cdi.error) throw cdi.error;
  }

  return taxaRefRows.length;
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));

    const cofrinhoId = body.cofrinho_id ?? null;
    const dataFim = body.data_fim ?? new Date().toISOString().slice(0, 10);

    // AuthZ: cron-secret for global reset (no cofrinho_id) or when caller
    // is running as scheduler; otherwise require authenticated owner of
    // the specific cofrinho_id.
    const isCron = await validateCronSecret(supabase, req);
    if (!isCron) {
      if (!cofrinhoId) {
        return new Response(
          JSON.stringify({ success: false, error: "unauthorized_global_reset" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: cof, error: cofErr } = await supabase
        .from("cofrinhos")
        .select("usuario_id")
        .eq("id", cofrinhoId)
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

    let aportesQuery = supabase
      .from("cofrinho_aportes")
      .select("id, cofrinho_id, data_aporte, saldo_restante, percentual_cdi")
      .gt("saldo_restante", 0)
      .order("data_aporte", { ascending: true });

    if (cofrinhoId) {
      aportesQuery = aportesQuery.eq("cofrinho_id", cofrinhoId);
    }

    const aportesResult = await aportesQuery;

    if (!aportesResult) {
      throw new Error("Erro ao buscar aportes: resposta indefinida.");
    }

    if (aportesResult.error) {
      throw new Error(`Erro ao buscar aportes: ${aportesResult.error.message}`);
    }

    const aportes = aportesResult.data ?? [];

    if (!aportes.length) {
      throw new Error("Nenhum aporte ativo encontrado.");
    }

    const dataInicio = aportes[0].data_aporte;

    const taxasSincronizadas = await syncTaxas(dataInicio, dataFim);

    const cofrinhosUnicos = [...new Set(aportes.map((a) => a.cofrinho_id))];

    for (const id of cofrinhosUnicos) {
      const delRend = await supabase
        .from("cofrinho_rendimento_diario")
        .delete()
        .eq("cofrinho_id", id);

      if (delRend.error) throw delRend.error;

      const delEventos = await supabase
        .from("cofrinho_eventos")
        .delete()
        .eq("cofrinho_id", id)
        .eq("tipo", "RENDIMENTO");

      if (delEventos.error) throw delEventos.error;

      const resetAportes = await supabase
        .from("cofrinho_aportes")
        .update({
          rendimento_bruto: 0,
          rendimento_liquido: 0,
          ultimo_calculo: null,
        })
        .eq("cofrinho_id", id);

      if (resetAportes.error) throw resetAportes.error;
    }

    let registrosCriados = 0;
    let aportesProcessados = 0;

    // Busca as taxas UMA única vez (antes era 1 query por aporte).
    const todasTaxasResult = await supabase
      .from("taxa_referencia")
      .select("data, cdi_diario")
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .order("data", { ascending: true })
      .limit(50000);

    if (todasTaxasResult.error) throw todasTaxasResult.error;

    const todasTaxas: DailyRateRow[] = (todasTaxasResult.data ?? []).map(
      (t: any) => ({
        data: String(t.data).slice(0, 10),
        cdiDiario: Number(t.cdi_diario),
      }),
    );

    const pendingRows: any[] = [];
    const INSERT_CHUNK = 1000;

    async function flushRows(force = false) {
      while (pendingRows.length >= INSERT_CHUNK || (force && pendingRows.length)) {
        const batch = pendingRows.splice(0, INSERT_CHUNK);
        const insertRend = await supabase
          .from("cofrinho_rendimento_diario")
          .insert(batch);
        if (insertRend.error) throw insertRend.error;
        registrosCriados += batch.length;
      }
    }

    for (const aporte of aportes) {
      const rates = todasTaxas.filter((t) => t.data >= aporte.data_aporte);

      const principal = Number(aporte.saldo_restante);
      const percentual = Number(aporte.percentual_cdi ?? 100);

      const resultado = compoundDeposit(
        principal,
        aporte.data_aporte,
        rates,
        percentual,
      );

      let iofPrev = 0;
      let irPrev = 0;

      for (const row of resultado.rows) {
        const iofDia = roundCore(row.iof - iofPrev, 8);
        const irDia = roundCore(row.imposto - irPrev, 8);
        iofPrev = row.iof;
        irPrev = row.imposto;

        pendingRows.push({
          cofrinho_id: aporte.cofrinho_id,
          aporte_id: aporte.id,
          data: row.data,
          saldo_principal: principal,
          percentual_cdi: percentual,
          taxa_cdi: row.taxaCdi,
          rendimento_bruto: row.rendimentoDia,
          imposto_renda: irDia,
          iof: iofDia,
          rendimento_liquido: roundCore(row.rendimentoDia - irDia - iofDia, 8),
          saldo_total: roundCore(row.saldoBruto, 2),
        });
      }

      await flushRows();

      const updateAporte = await supabase
        .from("cofrinho_aportes")
        .update({
          rendimento_bruto: roundCore(resultado.settlement.rendimentoBruto, 2),
          rendimento_liquido: roundCore(resultado.settlement.rendimentoLiquido, 2),
          dias_aplicados: diffDays(aporte.data_aporte, resultado.ultimaData ?? dataFim),
          ultimo_calculo: resultado.ultimaData ?? dataFim,
        })
        .eq("id", aporte.id);

      if (updateAporte.error) throw updateAporte.error;

      aportesProcessados++;
    }

    await flushRows(true);


    for (const id of cofrinhosUnicos) {
      const saldo = await supabase.rpc("fn_atualizar_saldos_cofrinho", {
        p_cofrinho_id: id,
      });

      if (saldo.error) throw saldo.error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        modelo: "composto_diario_du_iof_ir_no_resgate",
        data_inicio: dataInicio,
        data_fim: dataFim,
        taxas_sincronizadas: taxasSincronizadas,
        aportes_processados: aportesProcessados,
        registros_criados: registrosCriados,
        cofrinhos_recalculados: cofrinhosUnicos.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message ?? String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});