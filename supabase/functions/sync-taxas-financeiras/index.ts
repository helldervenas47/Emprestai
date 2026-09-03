import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function formatDateBR(date: Date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function toISODateFromBR(data: string) {
  const [d, m, y] = data.split("/");
  return `${y}-${m}-${d}`;
}

function calcularTaxaDiaria(taxaAnualPercentual: number) {
  return Math.pow(1 + taxaAnualPercentual / 100, 1 / 252) - 1;
}

serve(async () => {
  try {
    const hoje = new Date();
    const inicio = new Date();
    inicio.setDate(hoje.getDate() - 10);

    const dataInicial = formatDateBR(inicio);
    const dataFinal = formatDateBR(hoje);

    // SGS Banco Central:
    // Série 11 = Taxa Selic diária.
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Erro ao buscar dados do BACEN: ${response.status}`);
    }

    const dados = await response.json();

    if (!Array.isArray(dados) || dados.length === 0) {
      throw new Error("BACEN não retornou dados.");
    }

    const ultimo = dados[dados.length - 1];

    const data = toISODateFromBR(ultimo.data);
    const selicDiariaPercentual = Number(String(ultimo.valor).replace(",", "."));

    // Aproximação anualizada base 252.
    const selicAnual = (Math.pow(1 + selicDiariaPercentual / 100, 252) - 1) * 100;

    // Para cofrinhos 100% CDI, usamos SELIC como referência aproximada.
    const cdiAnual = selicAnual;
    const cdiDiario = calcularTaxaDiaria(cdiAnual);
    const fator = 1 + cdiDiario;

    const { error: taxaError } = await supabase
      .from("taxa_referencia")
      .upsert(
        {
          data,
          cdi_anual: Number(cdiAnual.toFixed(4)),
          cdi_diario: Number(cdiDiario.toFixed(12)),
          selic_anual: Number(selicAnual.toFixed(4)),
          selic_diaria: Number((selicDiariaPercentual / 100).toFixed(12)),
          fonte: "BACEN_SGS_11",
        },
        { onConflict: "data" },
      );

    if (taxaError) throw taxaError;

    const { error: cdiError } = await supabase
      .from("cdi_diario")
      .upsert(
        {
          data,
          taxa_anual: Number(cdiAnual.toFixed(4)),
          taxa_diaria: Number(cdiDiario.toFixed(12)),
          fator: Number(fator.toFixed(12)),
        },
        { onConflict: "data" },
      );

    if (cdiError) throw cdiError;

    return new Response(
      JSON.stringify({
        success: true,
        data,
        cdi_anual: Number(cdiAnual.toFixed(4)),
        cdi_diario: Number(cdiDiario.toFixed(12)),
        fonte: "BACEN_SGS_11",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});