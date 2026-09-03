import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { validateUserOwner } from "../_shared/auth-guard.ts";
import { diffDays, iofRate, irRate } from "../_shared/piggy-yield-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL =
  Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Imposto do resgate usa EXATAMENTE as mesmas tabelas do núcleo de rendimento
// (`_shared/piggy-yield-core.ts`) — fonte única de IOF/IR do sistema.
const diffDias = diffDays;
const calcularAliquotaIR = irRate;
const calcularAliquotaIOF = iofRate;

function round(valor: number, casas = 2) {
  return Number(valor.toFixed(casas));
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const cofrinho_id = body.cofrinho_id;
    const valor = Number(body.valor);
    const dataResgate = body.data_resgate ?? new Date().toISOString().slice(0, 10);
    const dataEvento = `${dataResgate}T00:00:00.000Z`;

    if (!cofrinho_id) throw new Error("cofrinho_id é obrigatório.");
    if (!valor || valor <= 0) throw new Error("valor deve ser maior que zero.");

    const { data: cofrinho, error: cofrinhoError } = await supabase
      .from("cofrinhos")
      .select("id, saldo_disponivel, saldo_total, ativo, usuario_id")
      .eq("id", cofrinho_id)
      .single();

    if (cofrinhoError || !cofrinho) throw new Error("Cofrinho não encontrado.");

    // Enforce authentication + ownership BEFORE any mutation.
    const authCheck = await validateUserOwner(supabase, req, cofrinho.usuario_id);
    if (!authCheck.ok) {
      return new Response(
        JSON.stringify({ success: false, error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!cofrinho.ativo) throw new Error("Este cofrinho está inativo.");

    const { data: aportes, error: aportesError } = await supabase
      .from("cofrinho_aportes")
      .select("*")
      .eq("cofrinho_id", cofrinho_id)
      .gt("saldo_restante", 0)
      .order("data_aporte", { ascending: true })
      .order("created_at", { ascending: true });

    if (aportesError) throw aportesError;

    // ---------------------------------------------------------------------
    // Regra (padrão bancos): o `valor` informado é o VALOR LÍQUIDO A RECEBER.
    // Para cada aporte (FIFO) o pagamento possível é
    //   principal restante + rendimento líquido proporcional (bruto − IOF − IR).
    // Consumimos aportes até somar exatamente o valor solicitado.
    // ---------------------------------------------------------------------
    type AporteCalc = {
      aporte: any;
      saldoRestante: number;
      rendBrutoFull: number;
      iofFull: number;
      irFull: number;
      netFull: number;
      payoutFull: number;
    };

    const calcs: AporteCalc[] = (aportes ?? []).map((aporte) => {
      const saldoRestante = Number(aporte.saldo_restante);
      const rendBrutoFull = Number(aporte.rendimento_bruto ?? 0);
      const dias = diffDias(aporte.data_aporte, dataResgate);
      const iofFull = rendBrutoFull * calcularAliquotaIOF(dias);
      const irFull = Math.max(rendBrutoFull - iofFull, 0) * calcularAliquotaIR(dias);
      const netFull = rendBrutoFull - iofFull - irFull;
      return {
        aporte,
        saldoRestante,
        rendBrutoFull,
        iofFull,
        irFull,
        netFull,
        payoutFull: saldoRestante + netFull,
      };
    });

    const disponivelLiquido = round(
      calcs.reduce((s, c) => s + c.payoutFull, 0),
      2,
    );
    if (valor > disponivelLiquido + 0.01) {
      throw new Error(
        `Saldo disponível insuficiente. Disponível para resgate: ${disponivelLiquido.toFixed(2)}.`,
      );
    }

    let restante = valor;
    let totalPrincipal = 0;
    let totalRendimentoBruto = 0;
    let totalIR = 0;
    let totalIOF = 0;
    let totalRendimentoLiquido = 0;
    const detalhes: any[] = [];

    const { data: resgate, error: resgateError } = await supabase
      .from("cofrinho_resgates")
      .insert({
        cofrinho_id,
        valor_solicitado: valor,
        status: "PROCESSANDO",
      })
      .select()
      .single();

    if (resgateError) throw resgateError;

    for (const c of calcs) {
      if (restante <= 0.004) break;
      if (c.payoutFull <= 0) continue;

      // Fração do aporte consumida para atingir o valor líquido pedido.
      const proporcao = Math.min(1, restante / c.payoutFull);

      const principalResgatado = round(c.saldoRestante * proporcao, 8);
      const rendimentoBruto = round(c.rendBrutoFull * proporcao, 8);
      const iof = round(c.iofFull * proporcao, 8);
      const impostoRenda = round(c.irFull * proporcao, 8);
      const rendimentoLiquido = round(c.netFull * proporcao, 8);
      const pagoAporte = round(principalResgatado + rendimentoLiquido, 8);

      const novoSaldoRestante = round(c.saldoRestante - principalResgatado, 2);
      const novoRendimentoBruto = round(c.rendBrutoFull - rendimentoBruto, 2);
      const novoRendimentoLiquido = round(
        Number(c.aporte.rendimento_liquido ?? 0) - rendimentoLiquido,
        2,
      );

      const { error: resgateAporteError } = await supabase
        .from("cofrinho_resgate_aportes")
        .insert({
          resgate_id: resgate.id,
          aporte_id: c.aporte.id,
          principal_resgatado: round(principalResgatado, 2),
          rendimento_bruto: round(rendimentoBruto, 2),
          imposto_renda: round(impostoRenda, 2),
          iof: round(iof, 2),
          rendimento_liquido: round(rendimentoLiquido, 2),
        });

      if (resgateAporteError) throw resgateAporteError;

      const { error: updateAporteError } = await supabase
        .from("cofrinho_aportes")
        .update({
          saldo_restante: novoSaldoRestante,
          rendimento_bruto: novoRendimentoBruto,
          rendimento_liquido: novoRendimentoLiquido,
        })
        .eq("id", c.aporte.id);

      if (updateAporteError) throw updateAporteError;

      totalPrincipal += principalResgatado;
      totalRendimentoBruto += rendimentoBruto;
      totalIR += impostoRenda;
      totalIOF += iof;
      totalRendimentoLiquido += rendimentoLiquido;

      detalhes.push({
        aporte_id: c.aporte.id,
        principal_resgatado: round(principalResgatado, 2),
        rendimento_bruto: round(rendimentoBruto, 2),
        ir: round(impostoRenda, 2),
        iof: round(iof, 2),
        rendimento_liquido: round(rendimentoLiquido, 2),
      });

      restante = round(restante - pagoAporte, 8);
    }

    if (restante > 0.01) throw new Error("Não foi possível completar o resgate.");


    const valorPago = round(totalPrincipal + totalRendimentoLiquido, 2);

    const { error: updateResgateError } = await supabase
      .from("cofrinho_resgates")
      .update({
        valor_principal: round(totalPrincipal, 2),
        rendimento_bruto: round(totalRendimentoBruto, 2),
        imposto_renda: round(totalIR, 2),
        iof: round(totalIOF, 2),
        rendimento_liquido: round(totalRendimentoLiquido, 2),
        valor_pago: valorPago,
        status: "PROCESSADO",
      })
      .eq("id", resgate.id);

    if (updateResgateError) throw updateResgateError;

    const { error: saldoError } = await supabase.rpc("fn_atualizar_saldos_cofrinho", {
      p_cofrinho_id: cofrinho_id,
    });

    if (saldoError) throw saldoError;

    const saldoAnterior = Number(cofrinho.saldo_total);
    const saldoPosterior = round(saldoAnterior - valorPago, 2);

    const { error: eventoError } = await supabase.rpc("fn_registrar_evento_cofrinho", {
      p_cofrinho_id: cofrinho_id,
      p_aporte_id: null,
      p_tipo: "RESGATE",
      p_valor: valorPago,
      p_saldo_anterior: saldoAnterior,
      p_saldo_posterior: saldoPosterior,
      p_descricao: "Resgate realizado no cofrinho",
      p_referencia: "resgate",
      p_dados: {
        resgate_id: resgate.id,
        valor_solicitado: valor,
        valor_pago: valorPago,
        data_resgate: dataResgate,
        detalhes,
      },
      p_data_evento: dataEvento,
    });

    if (eventoError) throw eventoError;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Resgate processado com sucesso.",
        resgate_id: resgate.id,
        valor_solicitado: valor,
        valor_pago: valorPago,
        data_resgate: dataResgate,
        detalhes,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});