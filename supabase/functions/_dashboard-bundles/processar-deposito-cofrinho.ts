// ============================================================
// processar-deposito-cofrinho — VERSÃO FLAT PARA DEPLOY MANUAL NO SUPABASE DASHBOARD
// Gerado por scripts/bundle-piggy-functions.mjs — NÃO editar à mão.
// Todos os módulos de _shared/ foram embutidos abaixo.
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

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


// ---------- processar-deposito-cofrinho/index.ts ----------
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const cofrinho_id = body.cofrinho_id;
    const valor = Number(body.valor);
    const data_aporte = body.data_aporte ?? new Date().toISOString().slice(0, 10);
    const percentual_cdi = Number(body.percentual_cdi ?? 100);

    if (!cofrinho_id) throw new Error("cofrinho_id é obrigatório.");
    if (!valor || valor <= 0) throw new Error("valor deve ser maior que zero.");

    // Fetch cofrinho with owner column to enforce authorization.
    const { data: cofrinho, error: cofrinhoError } = await supabase
      .from("cofrinhos")
      .select("id, ativo, percentual_cdi, usuario_id")
      .eq("id", cofrinho_id)
      .single();

    if (cofrinhoError || !cofrinho) {
      throw new Error("Cofrinho não encontrado.");
    }

    // Verify caller is authenticated AND owns this cofrinho (or shares owner_id).
    const authCheck = await validateUserOwner(supabase, req, cofrinho.usuario_id);
    if (!authCheck.ok) {
      return new Response(
        JSON.stringify({ success: false, error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!cofrinho.ativo) {
      throw new Error("Este cofrinho está inativo.");
    }

    const percentualFinal = percentual_cdi || Number(cofrinho.percentual_cdi ?? 100);

    const { data: aporte, error: aporteError } = await supabase
      .from("cofrinho_aportes")
      .insert({
        cofrinho_id,
        valor_original: valor,
        saldo_restante: valor,
        rendimento_bruto: 0,
        rendimento_liquido: 0,
        dias_aplicados: 0,
        percentual_cdi: percentualFinal,
        data_aporte,
      })
      .select()
      .single();

    if (aporteError) throw aporteError;

    const { error: saldoError } = await supabase.rpc("fn_atualizar_saldos_cofrinho", {
      p_cofrinho_id: cofrinho_id,
    });

    if (saldoError) throw saldoError;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Depósito processado com sucesso.",
        aporte,
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
