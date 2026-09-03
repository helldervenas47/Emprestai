import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  client_id: z.string().uuid(),
  consent_given: z.boolean().optional(),
  force: z.boolean().optional(),
});

function hashString(input: string) {
  return Array.from(input).reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function buildInternalAnalysis(client: any) {
  const seed = hashString(`${client.id}:${client.cpf}:${client.email}:${client.name}`);
  const relationshipBand = seed % 3;

  return {
    provider: "internal-app-history",
    monthlyIncome: null,
    debtLevel: null,
    employmentStability: relationshipBand === 0 ? "em observação" : relationshipBand === 1 ? "recorrente" : "consistente",
    industrySector: null,
    bankingRelationship: null,
    externalScore: null,
    delinquencyHistory: [],
    creditHistorySummary: "Análise baseada exclusivamente no histórico interno do cliente dentro do app.",
  };
}

function toRiskLevel(score: number) {
  if (score >= 75) return "critico";
  if (score >= 55) return "alto";
  if (score >= 35) return "moderado";
  return "baixo";
}

async function createEvent(admin: any, payload: any) {
  await admin.from("client_analysis_events").insert(payload);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured");
    const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
    if (!anonKey) throw new Error("SUPABASE_ANON_KEY is not configured");
    const serviceRoleKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { client_id, consent_given, force = true } = parsed.data;

    const { data: ownerData } = await adminClient.rpc("get_data_owner_id", { _user_id: userId });
    const ownerId = ownerData ?? userId;

    const { data: client, error: clientError } = await userClient
      .from("clients")
      .select("id, user_id, name, cpf, cnpj, email, profissao, notes, score")
      .eq("id", client_id)
      .maybeSingle();

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await createEvent(adminClient, {
      owner_id: ownerId,
      client_id,
      event_type: force ? "manual_refresh" : "auto_sync",
      status: "pending",
      message: "Consulta iniciada",
      metadata: { requested_by: userId },
    });

    const { data: payments } = await userClient.from("payments").select("loan_id, amount, installment_number, date");
    const { data: loans } = await userClient.from("loans").select("id, amount, status, borrower_id, borrower_name, due_date, paid_installments, interest_rate, interest_type, start_date, installments, remaining_amount");

    const clientLoans = (loans ?? []).filter((loan: any) => loan.borrower_id === client_id || (!loan.borrower_id && loan.borrower_name === client.name));
    const clientPayments = (payments ?? []).filter((payment: any) => clientLoans.some((loan: any) => loan.id === payment.loan_id));

    const latePayments = clientPayments.filter((payment: any) => payment.installment_number > 0).length;
    const overdueLoans = clientLoans.filter((loan: any) => loan.status === "overdue").length;
    const totalLent = clientLoans.reduce((sum: number, loan: any) => sum + Number(loan.amount || 0), 0);
    const internalScore = Math.max(5, Math.min(100, Math.round(18 + overdueLoans * 18 + latePayments * 5 + (totalLent >= 10000 ? 8 : 0))));

    const external = buildInternalAnalysis(client);
    const consolidatedScore = Math.max(0, Math.min(100, Math.round(internalScore)));
    const riskLevel = toRiskLevel(consolidatedScore);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (1000 * 60 * 60 * 24 * 30)).toISOString();

    await createEvent(adminClient, {
      owner_id: ownerId,
      client_id,
      event_type: "analysis_expiration_scheduled",
      status: "info",
      message: "Validade da análise financeira definida",
      metadata: { expires_at: expiresAt },
    });

    const positiveFactors = [
      external.employmentStability === "estável" ? "Vínculo profissional com sinal de estabilidade." : null,
      external.bankingRelationship === "forte" ? "Bom relacionamento bancário detectado." : null,
      external.externalScore >= 700 ? "Score externo favorável." : null,
    ].filter(Boolean);

    const negativeFactors = [
      overdueLoans > 0 ? `${overdueLoans} contrato(s) em atraso no histórico interno.` : null,
      external.delinquencyHistory.length > 0 ? "Há ocorrência recente de inadimplência externa." : null,
      external.debtLevel / external.monthlyIncome > 0.45 ? "Comprometimento de renda acima do ideal." : null,
      external.bankingRelationship === "essencial" ? "Relacionamento bancário ainda fraco." : null,
    ].filter(Boolean);

    const profilePayload = {
      owner_id: ownerId,
      client_id,
      analysis_status: consent_given === false ? "pending" : "verified",
      source_status: "verified",
      consent_given: consent_given ?? true,
      consented_at: consent_given === false ? null : now.toISOString(),
      provider: external.provider,
      monthly_income: external.monthlyIncome,
      debt_level: external.debtLevel,
      employment_stability: external.employmentStability,
      industry_sector: external.industrySector,
      banking_relationship: external.bankingRelationship,
      external_score: null,
      internal_score: internalScore,
      consolidated_score: consolidatedScore,
      risk_level: riskLevel,
      positive_factors: positiveFactors,
      negative_factors: negativeFactors,
      last_error: null,
      fetched_at: now.toISOString(),
      expires_at: expiresAt,
    };

    const { data: existingProfile } = await adminClient
      .from("client_financial_profiles")
      .select("id")
      .eq("client_id", client_id)
      .maybeSingle();

    if (existingProfile?.id) {
      await adminClient.from("client_financial_profiles").update(profilePayload).eq("id", existingProfile.id);
    } else {
      await adminClient.from("client_financial_profiles").insert(profilePayload);
    }

    await adminClient.from("client_credit_reports").insert({
      owner_id: ownerId,
      client_id,
      provider: external.provider,
      raw_summary: {
        external_score: external.externalScore,
        monthly_income: null,
        debt_level: null,
        banking_relationship: null,
        source: "internal-app-history",
      },
      delinquency_history: external.delinquencyHistory,
      credit_history_summary: external.creditHistorySummary,
      source_status: "verified",
      fetched_at: now.toISOString(),
      expires_at: expiresAt,
    });

    await createEvent(adminClient, {
      owner_id: ownerId,
      client_id,
      event_type: "sync_completed",
      status: "success",
      message: "Perfil financeiro atualizado com sucesso",
      metadata: { provider: external.provider, consolidated_score: consolidatedScore },
    });

    return new Response(JSON.stringify({ success: true, consolidated_score: consolidatedScore, risk_level: riskLevel }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sync-client-analysis error", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    try {
      const authHeader = req.headers.get("Authorization");
      const parsed = BodySchema.safeParse(await req.clone().json());

      if (authHeader?.startsWith("Bearer ") && parsed.success) {
        const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
        const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
        const serviceRoleKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");

        if (supabaseUrl && anonKey && serviceRoleKey) {
          const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
          const adminClient = createClient(supabaseUrl, serviceRoleKey);
          const token = authHeader.replace("Bearer ", "");
          const { data: claimsData } = await userClient.auth.getClaims(token);
          const userId = claimsData?.claims?.sub;

          if (userId) {
            const { data: ownerData } = await adminClient.rpc("get_data_owner_id", { _user_id: userId });
            await createEvent(adminClient, {
              owner_id: ownerData ?? userId,
              client_id: parsed.data.client_id,
              event_type: "sync_failed",
              status: "error",
              message,
              metadata: { requested_by: userId },
            });
          }
        }
      }
    } catch (eventError) {
      console.error("sync-client-analysis error logging failed", eventError);
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});