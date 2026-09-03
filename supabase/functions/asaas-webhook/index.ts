// Supabase Edge Function: asaas-webhook
//
// Passo 3 do plano de unificação:
//  - autentica pelo header `asaas-access-token` (secret ASAAS_WEBHOOK_SECRET)
//  - grava TODO evento em `asaas_webhook_events` (auditoria + idempotência)
//  - renova `current_period_end` a partir do fim do período atual (não de now())
//  - devolve 500 quando a escrita falha (para o Asaas reenviar)

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type FinancialStatus = "ACTIVE" | "PAST_DUE" | "CANCELED" | "INACTIVE";
type SubscriptionStatus = "active" | "past_due" | "canceled";
type AsaasEnvironment = "sandbox" | "live";

const EVENT_TO_STATUS: Record<string, FinancialStatus> = {
  PAYMENT_CONFIRMED: "ACTIVE",
  PAYMENT_RECEIVED: "ACTIVE",
  PAYMENT_OVERDUE: "PAST_DUE",
  PAYMENT_DELETED: "CANCELED",
  PAYMENT_REFUNDED: "CANCELED",
  PAYMENT_CHARGEBACK_REQUESTED: "PAST_DUE",
  PAYMENT_REVERSED: "CANCELED",
};

const CYCLE_DAYS: Record<string, number> = {
  monthly: 30,
  semestral: 180,
  annual: 365,
};

function getAsaasEnvironment(): AsaasEnvironment {
  return "live";
}

function productIdFromPlanName(planName: string): string {
  const normalized = planName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized.includes("basic") || normalized.includes("basico")) return "basico_plan";
  if (normalized.includes("prof")) return "profissional_plan";
  if (normalized.includes("empres")) return "empresarial_plan";
  const slug = normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${slug || "basico"}_plan`;
}

function subscriptionStatusFromFinancial(status: FinancialStatus): SubscriptionStatus {
  if (status === "ACTIVE") return "active";
  if (status === "PAST_DUE") return "past_due";
  return "canceled";
}

async function upsertSubscriptionWithLegacyFallback(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const result = await supabase
    .from("subscriptions")
    .upsert(payload, { onConflict: "user_id,environment" })
    .select("id")
    .maybeSingle();

  if (!result.error || !/column .*asaas_/i.test(result.error.message)) {
    return result;
  }

  const legacyPayload = { ...payload };
  delete legacyPayload.asaas_customer_id;
  delete legacyPayload.asaas_payment_id;
  delete legacyPayload.asaas_subscription_id;

  return supabase
    .from("subscriptions")
    .upsert(legacyPayload, { onConflict: "user_id,environment" })
    .select("id")
    .maybeSingle();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabaseUrl(): string {
  return Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
}
function getServiceRoleKey(): string {
  return (
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    ""
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // 1) Autenticação por secret compartilhado.
  const expectedSecret = Deno.env.get("ASAAS_WEBHOOK_SECRET");
  const providedToken =
    req.headers.get("asaas-access-token") ??
    new URL(req.url).searchParams.get("token");

  if (!expectedSecret) {
    console.error("[asaas-webhook] ASAAS_WEBHOOK_SECRET não configurado");
    return json({ error: "server_misconfigured" }, 500);
  }
  if (!providedToken || providedToken !== expectedSecret) {
    return json({ error: "unauthorized" }, 403);
  }

  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[asaas-webhook] Supabase env ausente");
    return json({ error: "server_misconfigured" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 2) Payload.
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ received: true, ignored: "invalid_json" });
  }

  const eventId: string | null = body?.id ?? null;
  const eventType: string | undefined = body?.event;
  const payment = body?.payment ?? null;
  const customerId: string | null = payment?.customer ?? null;
  const paymentId: string | null = payment?.id ?? null;

  if (!eventType) {
    return json({ received: true, ignored: "missing_event" });
  }

  // 3) Idempotência atômica: o UNIQUE em event_id rejeita reenvios.
  let eventRowId: string | null = null;
  if (eventId) {
    const { data: inserted, error: insErr } = await supabase
      .from("asaas_webhook_events")
      .insert({
        event_id: eventId,
        event_type: eventType,
        payment_id: paymentId,
        customer_id: customerId,
        payload: body,
        status: "received",
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      // 23505 = duplicate key. Só ignora se já foi processado; se a tentativa
      // anterior parou em received/error/ignored, reprocessa o mesmo evento.
      if ((insErr as any).code === "23505") {
        const { data: existingEvent, error: existingErr } = await supabase
          .from("asaas_webhook_events")
          .select("id, status")
          .eq("event_id", eventId)
          .maybeSingle();
        if (existingErr) {
          console.error("[asaas-webhook] falha ao ler evento duplicado:", existingErr.message);
          return json({ error: "event_log_lookup_failed" }, 500);
        }
        if (existingEvent?.status === "processed") {
          console.log(`[asaas-webhook] evento duplicado ignorado: ${eventId}`);
          return json({ received: true, duplicated: true, event_id: eventId });
        }
        eventRowId = existingEvent?.id ?? null;
        console.log(`[asaas-webhook] reprocessando evento não concluído: ${eventId}`);
      } else {
        console.error("[asaas-webhook] falha ao registrar evento:", insErr.message);
        return json({ error: "event_log_failed" }, 500);
      }
    } else {
      eventRowId = inserted?.id ?? null;
    }
  }

  const finish = async (
    status: "processed" | "ignored" | "error",
    errorMessage?: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (eventRowId) {
      await supabase
        .from("asaas_webhook_events")
        .update({
          status,
          error: errorMessage ?? null,
          processed_at: new Date().toISOString(),
          ...extra,
        })
        .eq("id", eventRowId);
    }
  };

  const nextStatus = EVENT_TO_STATUS[eventType];
  if (!nextStatus) {
    await finish("ignored", `evento não mapeado: ${eventType}`);
    return json({ received: true, ignored: eventType });
  }
  if (!customerId) {
    await finish("ignored", "payment.customer ausente");
    return json({ received: true, ignored: "missing_customer" });
  }

  // 4) Perfil alvo com fallback.
  let targetUserId: string | null = null;
  let profile: any = null;
  const environment = getAsaasEnvironment();

  const { data: profileData, error: profErr } = await supabase
    .from("profiles")
    .select("user_id, current_period_end, last_payment_id")
    .eq("asaas_customer_id", customerId)
    .maybeSingle();

  if (profErr) {
    await finish("error", profErr.message);
    return json({ error: "profile_lookup_failed" }, 500);
  }

  if (profileData) {
    targetUserId = profileData.user_id;
    profile = profileData;
  } else {
    // Fallback: se não achar em profiles, tenta achar em subscriptions (gerado via asaas-create-subscription)
    const { data: subData } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("asaas_customer_id", customerId)
      .maybeSingle();

    if (subData) {
      targetUserId = subData.user_id;
      const { data: pData } = await supabase
        .from("profiles")
        .select("user_id, current_period_end, last_payment_id")
        .eq("user_id", targetUserId)
        .maybeSingle();
      
      profile = pData;
      if (profile) {
        // Aproveita e conserta o cadastro para o próximo webhook não precisar do fallback
        await supabase.from("profiles").update({ asaas_customer_id: customerId }).eq("user_id", targetUserId);
      }
    }
  }

  if (!profile || !targetUserId) {
    await finish("ignored", `nenhum profile com asaas_customer_id=${customerId}`);
    return json({ received: true, ignored: "unknown_customer" });
  }

  // Reenvio do mesmo pagamento já creditado → não soma período de novo.
  if (nextStatus === "ACTIVE" && paymentId && profile.last_payment_id === paymentId) {
    await finish("ignored", "payment_id já creditado");
    return json({ received: true, duplicated: true, payment_id: paymentId });
  }

  const { data: existingSub, error: subReadErr } = await supabase
    .from("subscriptions")
    .select("paddle_subscription_id, paddle_customer_id, product_id, price_id, current_period_start, current_period_end")
    .eq("user_id", targetUserId)
    .eq("environment", environment)
    .maybeSingle();

  if (subReadErr) {
    console.error("[asaas-webhook] leitura de assinatura falhou:", subReadErr.message);
    await finish("error", subReadErr.message, { user_id: targetUserId });
    return json({ error: "subscription_lookup_failed" }, 500);
  }

  const updatePayload: Record<string, unknown> = {
    financial_status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (nextStatus === "ACTIVE") {
    // Renova a partir do fim do período vigente (se ainda no futuro),
    // evitando "perder" dias quando o usuário paga antecipadamente.
    let cycle = (profile.current_plan_cycle as string);
    
    // Fallback para o ciclo se o perfil não tiver a informação (ex: boleto/cartão antigo)
    if (!cycle && existingSub?.price_id) {
      if (existingSub.price_id.includes("_annual")) cycle = "annual";
      else if (existingSub.price_id.includes("_semestral")) cycle = "semestral";
      else cycle = "monthly";
    }
    cycle = cycle || "monthly";

    const days = CYCLE_DAYS[cycle] ?? 30;
    const profileEnd = profile.current_period_end || existingSub?.current_period_end;
    const current = profileEnd
      ? new Date(profileEnd as string)
      : null;
    const base = current && current.getTime() > Date.now() ? current : new Date();
    base.setDate(base.getDate() + days);

    updatePayload.current_period_end = base.toISOString();
    updatePayload.is_blocked = false;
    if (paymentId) updatePayload.last_payment_id = paymentId;
  } else if (nextStatus === "CANCELED" || nextStatus === "PAST_DUE") {
    // Em caso de cancelamento/estorno explícito do pagamento, revogamos acesso imediatamente
    if (eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_CHARGEBACK_REQUESTED" || eventType === "PAYMENT_DELETED" || eventType === "PAYMENT_REVERSED") {
      updatePayload.current_period_end = new Date().toISOString();
    }
  }

  let planName: string | null = null;
  if (profile.current_plan_id) {
    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .select("name")
      .eq("id", profile.current_plan_id)
      .maybeSingle();
    if (planErr) {
      console.warn("[asaas-webhook] leitura de plano falhou:", planErr.message);
    }
    planName = typeof plan?.name === "string" ? plan.name : null;
  }

  const subscriptionCycle = (profile.current_plan_cycle as string) || "monthly";
  const productId = planName
    ? productIdFromPlanName(planName)
    : String(existingSub?.product_id ?? "basico_plan");
  const priceId = String(existingSub?.price_id ?? `${productId}_${subscriptionCycle}`);
  const nowIso = new Date().toISOString();
  
  const subscriptionPayload: Record<string, unknown> = {
    user_id: targetUserId,
    environment,
    paddle_subscription_id:
      existingSub?.paddle_subscription_id ??
      (paymentId ? `asaas_payment_${paymentId}` : `asaas_customer_${customerId}_${environment}`),
    paddle_customer_id: existingSub?.paddle_customer_id ?? customerId,
    product_id: productId,
    price_id: priceId,
    status: subscriptionStatusFromFinancial(nextStatus),
    cancel_at_period_end: nextStatus !== "ACTIVE",
    asaas_payment_id: paymentId,
    asaas_customer_id: customerId,
    updated_at: nowIso,
  };

  if (nextStatus === "ACTIVE") {
    subscriptionPayload.current_period_start = nowIso;
    subscriptionPayload.current_period_end = updatePayload.current_period_end;
  } else {
    subscriptionPayload.current_period_start = existingSub?.current_period_start ?? null;
    subscriptionPayload.current_period_end = updatePayload.current_period_end ?? existingSub?.current_period_end ?? null;
  }

  const { data: subscriptionRow, error: subErr } = await upsertSubscriptionWithLegacyFallback(
    supabase,
    subscriptionPayload,
  );

  if (subErr) {
    console.error("[asaas-webhook] atualização de assinatura falhou:", subErr.message);
    await finish("error", subErr.message, { user_id: targetUserId });
    return json({ error: "subscription_update_failed" }, 500);
  }

  const { error: updErr } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("user_id", targetUserId);

  if (updErr) {
    console.error("[asaas-webhook] update falhou:", updErr.message);
    await finish("error", updErr.message);
    // 500 → o Asaas reenvia o evento (a idempotência protege o reprocessamento).
    return json({ error: "profile_update_failed" }, 500);
  }

  await finish("processed", undefined, {
    user_id: targetUserId,
    error_message: null,
  });

  console.log(
    `[asaas-webhook] ${eventType} → ${nextStatus} customer=${customerId} payment=${paymentId ?? "-"}`,
  );

  return json({
    received: true,
    event: eventType,
    status: nextStatus,
    subscription_id: subscriptionRow?.id ?? null,
    payment_id: paymentId,
  });
});
