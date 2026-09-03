// ============================================================
// recalcular-historico-cofrinhos — VERSÃO FLAT PARA DEPLOY MANUAL NO SUPABASE DASHBOARD
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

// ---------- aliases de import ----------
const roundCore = round$shared;

// ---------- recalcular-historico-cofrinhos/index.ts ----------
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
