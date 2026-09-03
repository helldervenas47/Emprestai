// ============================================================
// processar-resgate-cofrinho — VERSÃO FLAT PARA DEPLOY MANUAL NO SUPABASE DASHBOARD
// Gerado por scripts/bundle-piggy-functions.mjs — NÃO editar à mão.
// Todos os módulos de _shared/ foram embutidos abaixo.
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// ---------- inline: _shared/piggy-yield-core.ts ----------
/**
 * ============================================================================
 * NÚCLEO ÚNICO DE RENDIMENTO DE COFRINHOS (padrão de mercado brasileiro)
 * ============================================================================
 *
 * Arquivo PURO (sem imports) compartilhado por Edge Functions e pelo frontend
 * (via `src/features/piggyBanks/lib/piggyTax.ts`, que apenas reexporta).
 *
 * Modelo (igual a CDB DI / Nubank Caixinhas / Investidor 10):
 *
 *   1. Capitalização DIÁRIA COMPOSTA em dias úteis (BACEN SGS 11):
 *        fator_dia   = 1 + (cdi_diario × %CDI/100)
 *        saldo_bruto = principal × Π fator_dia
 *
 *   2. IOF e IR NÃO são fatos diários — são provisão calculada sobre o
 *      rendimento bruto ACUMULADO, usando o holding period (dias corridos
 *      desde o aporte até a data de referência/resgate):
 *        IOF = rend_bruto × tabela_iof(dias_corridos)     (0 se >= 30 dias)
 *        IR  = (rend_bruto − IOF) × aliquota_ir(dias_corridos)
 *
 *   3. Líquido = principal + rend_bruto − IOF − IR
 *
 * Consequência desejada: ao cruzar 180/360/720 dias, TODO o rendimento
 * acumulado passa a ser tributado pela alíquota menor (o líquido "melhora"
 * com o tempo), exatamente como nos apps de mercado.
 */

/** Tabela regressiva de IOF sobre o rendimento (dias corridos 1..29). */
const IOF_TABLE: number[] = [
  0.96, 0.93, 0.90, 0.86, 0.83, 0.80, 0.76, 0.73, 0.70, 0.66,
  0.63, 0.60, 0.56, 0.53, 0.50, 0.46, 0.43, 0.40, 0.36, 0.33,
  0.30, 0.26, 0.23, 0.20, 0.16, 0.13, 0.10, 0.06, 0.03,
];

/** Alíquota de IOF (fração 0..0.96) para o holding period em dias corridos. */
function iofRate(diasCorridos: number): number {
  const d = Math.floor(diasCorridos);
  if (d <= 0) return IOF_TABLE[0];
  if (d >= 30) return 0;
  return IOF_TABLE[d - 1] ?? 0;
}

/** IR regressivo de renda fixa (fração) para o holding period em dias corridos. */
function irRate(diasCorridos: number): number {
  const d = Math.floor(diasCorridos);
  if (d <= 180) return 0.225;
  if (d <= 360) return 0.20;
  if (d <= 720) return 0.175;
  return 0.15;
}

function round$shared(value: number, places = 8): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(places));
}

const MS_DAY = 86_400_000;

function parseYmd(s: string): Date {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Dias corridos entre duas datas YYYY-MM-DD (pode ser negativo). */
function diffDays(inicio: string, fim: string): number {
  return Math.floor((parseYmd(fim).getTime() - parseYmd(inicio).getTime()) / MS_DAY);
}

/** Fator diário de um dia útil, já ajustado pelo %CDI do cofrinho. */
function dailyFactor(cdiDiario: number, percentualCdi = 100): number {
  const taxa = Number(cdiDiario) || 0;
  const pct = Number(percentualCdi ?? 100) || 0;
  if (taxa <= 0 || pct <= 0) return 1;
  return 1 + taxa * (pct / 100);
}

/** Converte taxa anual (% a.a.) em taxa diária em dias úteis (252). */
function annualToDaily(annualPercent: number): number {
  const a = Number(annualPercent) || 0;
  if (a <= 0) return 0;
  return Math.pow(1 + a / 100, 1 / 252) - 1;
}

/** Converte taxa diária (fração) em taxa anual (% a.a., base 252). */
function dailyToAnnual(daily: number): number {
  const d = Number(daily) || 0;
  if (d <= 0) return 0;
  return (Math.pow(1 + d, 252) - 1) * 100;
}

interface DailyRateRow {
  /** YYYY-MM-DD */
  data: string;
  /** taxa diária em fração (ex.: 0.000445 = 0,0445% a.d.) */
  cdiDiario: number;
}

interface SettlementInput {
  principal: number;
  saldoBruto: number;
  /** dias corridos entre o aporte e a data de referência/resgate */
  diasCorridos: number;
}

interface Settlement {
  principal: number;
  saldoBruto: number;
  rendimentoBruto: number;
  iof: number;
  ir: number;
  aliquotaIof: number;
  aliquotaIr: number;
  rendimentoLiquido: number;
  saldoLiquido: number;
}

/**
 * Aplica IOF + IR sobre o rendimento bruto ACUMULADO (nunca dia a dia).
 * Esta é a única função que deve calcular imposto no sistema.
 */
function settle({ principal, saldoBruto, diasCorridos }: SettlementInput): Settlement {
  const p = Number(principal) || 0;
  const bruto = Math.max(0, (Number(saldoBruto) || 0) - p);
  const aliquotaIof = iofRate(diasCorridos);
  const aliquotaIr = irRate(diasCorridos);
  const iof = round$shared(bruto * aliquotaIof, 8);
  const ir = round$shared(Math.max(0, bruto - iof) * aliquotaIr, 8);
  const liquido = round$shared(bruto - iof - ir, 8);
  return {
    principal: p,
    saldoBruto: round$shared(p + bruto, 8),
    rendimentoBruto: round$shared(bruto, 8),
    iof,
    ir,
    aliquotaIof,
    aliquotaIr,
    rendimentoLiquido: liquido,
    saldoLiquido: round$shared(p + liquido, 8),
  };
}

interface DailyYieldRow {
  data: string;
  /** principal do aporte (nunca muda) */
  saldoPrincipal: number;
  percentualCdi: number;
  taxaCdi: number;
  /** rendimento bruto DO DIA (sobre o saldo bruto do dia anterior) */
  rendimentoDia: number;
  /** rendimento bruto acumulado até o dia */
  rendimentoBrutoAcumulado: number;
  /** saldo bruto acumulado (principal + bruto) */
  saldoBruto: number;
  /** provisão de IOF sobre o acumulado, na data */
  iof: number;
  /** provisão de IR sobre o acumulado, na data */
  imposto: number;
  /** rendimento líquido estimado acumulado na data */
  rendimentoLiquidoAcumulado: number;
  /** saldo líquido estimado na data */
  saldoLiquido: number;
  diasCorridos: number;
}

interface CompoundResult {
  principal: number;
  percentualCdi: number;
  rows: DailyYieldRow[];
  saldoBruto: number;
  rendimentoBruto: number;
  settlement: Settlement;
  ultimaData: string | null;
}

/**
 * Capitalização diária composta de um aporte.
 *
 * @param principal      valor do aporte (saldo restante)
 * @param dataAporte     YYYY-MM-DD
 * @param rates          taxas diárias (apenas dias úteis publicados pelo BACEN),
 *                       ordenadas asc e já filtradas pelo intervalo desejado
 * @param percentualCdi  % do CDI do cofrinho (100, 110, ...)
 * @param saldoBrutoInicial saldo bruto já acumulado antes do primeiro dia de
 *                       `rates` (para cálculo incremental). Default: principal.
 */
function compoundDeposit(
  principal: number,
  dataAporte: string,
  rates: DailyRateRow[],
  percentualCdi = 100,
  saldoBrutoInicial?: number,
): CompoundResult {
  const p = Number(principal) || 0;
  const pct = Number(percentualCdi ?? 100) || 100;
  let saldoBruto = Number.isFinite(saldoBrutoInicial as number)
    ? Number(saldoBrutoInicial)
    : p;
  if (saldoBruto < p) saldoBruto = p;

  const rows: DailyYieldRow[] = [];
  let ultimaData: string | null = null;

  if (p > 0) {
    for (const r of rates) {
      const taxa = Number(r.cdiDiario) || 0;
      if (taxa <= 0) continue;
      const diasCorridos = diffDays(dataAporte, r.data);
      if (diasCorridos < 0) continue;

      const anterior = saldoBruto;
      saldoBruto = round$shared(anterior * dailyFactor(taxa, pct), 8);
      const rendimentoDia = round$shared(saldoBruto - anterior, 8);
      const s = settle({ principal: p, saldoBruto, diasCorridos });

      rows.push({
        data: r.data,
        saldoPrincipal: p,
        percentualCdi: pct,
        taxaCdi: taxa,
        rendimentoDia,
        rendimentoBrutoAcumulado: s.rendimentoBruto,
        saldoBruto: round$shared(saldoBruto, 8),
        iof: s.iof,
        imposto: s.ir,
        rendimentoLiquidoAcumulado: s.rendimentoLiquido,
        saldoLiquido: s.saldoLiquido,
        diasCorridos,
      });
      ultimaData = r.data;
    }
  }

  const diasFinais = ultimaData ? diffDays(dataAporte, ultimaData) : 0;
  const settlement = settle({ principal: p, saldoBruto, diasCorridos: diasFinais });

  return {
    principal: p,
    percentualCdi: pct,
    rows,
    saldoBruto: round$shared(saldoBruto, 8),
    rendimentoBruto: settlement.rendimentoBruto,
    settlement,
    ultimaData,
  };
}

/**
 * Projeção sintética quando não há série de CDI disponível para o período
 * (ex.: projeção de fim de mês). Usa a taxa anual vigente convertida para
 * base 252 e conta apenas dias úteis (seg–sex) entre as datas.
 */
function businessDaysBetween(inicio: Date, fim: Date): number {
  if (fim <= inicio) return 0;
  let count = 0;
  const cur = new Date(inicio.getTime());
  while (cur < fim) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function projectGross(
  principal: number,
  annualPercent: number,
  businessDays: number,
): number {
  const p = Number(principal) || 0;
  if (p <= 0 || businessDays <= 0) return p;
  const daily = annualToDaily(annualPercent);
  if (daily <= 0) return p;
  return round$shared(p * Math.pow(1 + daily, businessDays), 8);
}

// ---------- inline: _shared/external-supabase.ts ----------
// Helper para acessar EXCLUSIVAMENTE o banco externo do usuário
// (syyxnqzxqabeuqbuptkh). Quando a function roda no projeto Lovable Cloud,
// usa EXTERNAL_*; quando roda diretamente no projeto externo, usa SUPABASE_*.


// Permite sobrescrever via secret EXTERNAL_PROJECT_REF; mantém o valor
// histórico como fallback para não quebrar deploys existentes.
const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(
      `[external-supabase] secret ${name} não configurado. Configure-o em Settings → Secrets para apontar ao projeto externo (syyxnqzxqabeuqbuptkh).`,
    );
  }
  return v;
}

function getExternalSupabaseUrl(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (external?.includes(EXTERNAL_PROJECT_REF)) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF)) return nativeUrl;

  // Evita registrar webhooks no projeto antigo quando EXTERNAL_SUPABASE_URL
  // ficou stale em Secrets. A URL pública do projeto é derivável pelo ref.
  return `https://${EXTERNAL_PROJECT_REF}.supabase.co`;
}

function getExternalServiceRoleKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return required("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
}

function getExternalAnonKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return required("EXTERNAL_SUPABASE_ANON_KEY");
}

/** Admin client (service role) apontando ao Supabase EXTERNO. */
function getExternalAdmin(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey(), {
    auth: {
      persistSession: false,
    },
  });
}

/** Anon client usado para validar JWTs emitidos pelo Supabase EXTERNO. */
function getExternalUserClient(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalAnonKey(), {
    auth: {
      persistSession: false,
    },
  });
}

// ---------- inline: _shared/auth-guard.ts ----------
// Shared auth helpers for edge functions that mix cron + manual runs.
// - validateCronSecret: checks an X-Cron-Secret header against app_internal_config.cron_secret
// - validateUserOwner: validates a JWT and confirms get_data_owner_id(auth.uid()) === requestedOwnerId


async function validateCronSecret(
  admin: any,
  req: Request,
): Promise<boolean> {
  const headerToken =
    req.headers.get("X-Cron-Secret") ||
    req.headers.get("x-cron-secret") ||
    "";
  if (!headerToken) return false;
  const { data } = await admin
    .from("app_internal_config")
    .select("value")
    .eq("key", "cron_secret")
    .maybeSingle();
  return !!data?.value && data.value === headerToken;
}

async function validateUserOwner(
  admin: any,
  req: Request,
  requestedOwnerId: string,
): Promise<{ ok: boolean; userId?: string; reason?: string }> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, reason: "missing_token" };

  const userClient = getExternalUserClient();
  const { data: userRes, error } = await userClient.auth.getUser(token);
  if (error || !userRes?.user) return { ok: false, reason: "invalid_token" };

  const userId = userRes.user.id;

  const { data: ownerRow } = await admin.rpc("get_data_owner_id", { _user_id: userId });
  const resolvedOwner = (ownerRow as string | null) || userId;
  if (resolvedOwner !== requestedOwnerId) {
    return { ok: false, userId, reason: "owner_mismatch" };
  }
  return { ok: true, userId };
}

function unauthorized(corsHeaders: Record<string, string>, reason = "Unauthorized") {
  return new Response(JSON.stringify({ error: reason }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


// ---------- processar-resgate-cofrinho/index.ts ----------
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
    if (Number(cofrinho.saldo_disponivel) < valor) throw new Error("Saldo disponível insuficiente.");

    const { data: aportes, error: aportesError } = await supabase
      .from("cofrinho_aportes")
      .select("*")
      .eq("cofrinho_id", cofrinho_id)
      .gt("saldo_restante", 0)
      .order("data_aporte", { ascending: true })
      .order("created_at", { ascending: true });

    if (aportesError) throw aportesError;

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

    for (const aporte of aportes ?? []) {
      if (restante <= 0) break;

      const saldoRestante = Number(aporte.saldo_restante);
      const principalResgatado = Math.min(restante, saldoRestante);
      const proporcao = principalResgatado / saldoRestante;

      const rendimentoBruto = round(Number(aporte.rendimento_bruto ?? 0) * proporcao, 8);
      const dias = diffDias(aporte.data_aporte, dataResgate);

      const iof = round(rendimentoBruto * calcularAliquotaIOF(dias), 8);
      const irBase = Math.max(rendimentoBruto - iof, 0);
      const impostoRenda = round(irBase * calcularAliquotaIR(dias), 8);
      const rendimentoLiquido = round(rendimentoBruto - iof - impostoRenda, 8);

      const novoSaldoRestante = round(saldoRestante - principalResgatado, 2);
      const novoRendimentoBruto = round(Number(aporte.rendimento_bruto ?? 0) - rendimentoBruto, 2);
      const novoRendimentoLiquido = round(Number(aporte.rendimento_liquido ?? 0) - rendimentoLiquido, 2);

      const { error: resgateAporteError } = await supabase
        .from("cofrinho_resgate_aportes")
        .insert({
          resgate_id: resgate.id,
          aporte_id: aporte.id,
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
        .eq("id", aporte.id);

      if (updateAporteError) throw updateAporteError;

      totalPrincipal += principalResgatado;
      totalRendimentoBruto += rendimentoBruto;
      totalIR += impostoRenda;
      totalIOF += iof;
      totalRendimentoLiquido += rendimentoLiquido;

      detalhes.push({
        aporte_id: aporte.id,
        principal_resgatado: round(principalResgatado, 2),
        rendimento_bruto: round(rendimentoBruto, 2),
        ir: round(impostoRenda, 2),
        iof: round(iof, 2),
        rendimento_liquido: round(rendimentoLiquido, 2),
      });

      restante = round(restante - principalResgatado, 2);
    }

    if (restante > 0) throw new Error("Não foi possível completar o resgate.");

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
