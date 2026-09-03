// asaas-checkout
//
// Gera uma cobrança PIX no Asaas para o usuário autenticado.
// - Autentica via JWT (Authorization: Bearer <token>).
// - Busca/atualiza asaas_customer_id em `profiles`.
// - Cria cobrança PIX via API Asaas (sandbox por padrão).
// - Retorna { paymentId, invoiceUrl, pix } para o frontend.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
function getAnonKey(): string {
  return (
    Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    ""
  );
}

const ASAAS_BASE_URL =
  Deno.env.get("ASAAS_BASE_URL") ??
  (getAsaasEnvironment() === "sandbox"
    ? "https://sandbox.asaas.com/api/v3"
    : "https://api.asaas.com/v3");
const DEFAULT_PLAN_VALUE = Number(Deno.env.get("ASAAS_DEFAULT_PLAN_VALUE") ?? "49.90");

type AsaasEnvironment = "sandbox" | "live";

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

function isActiveSubscription(row: { status?: string | null; current_period_end?: string | null } | null): boolean {
  if (!row) return false;
  const status = String(row.status ?? "").toLowerCase();
  const statusOk = ["active", "trialing", "paid"].includes(status);
  const periodOk = !row.current_period_end || new Date(row.current_period_end).getTime() > Date.now();
  return statusOk && periodOk;
}

async function upsertSubscriptionWithLegacyFallback(
  admin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const result = await admin
    .from("subscriptions")
    .upsert(payload, { onConflict: "user_id,environment" });

  if (!result.error || !/column .*asaas_/i.test(result.error.message)) {
    return result;
  }

  const legacyPayload = { ...payload };
  delete legacyPayload.asaas_customer_id;
  delete legacyPayload.asaas_payment_id;
  delete legacyPayload.asaas_subscription_id;

  return admin
    .from("subscriptions")
    .upsert(legacyPayload, { onConflict: "user_id,environment" });
}

function tomorrowISODate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

async function asaasFetch(path: string, apiKey: string, init: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "access_token": apiKey,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `Asaas ${path} falhou (${res.status}): ${JSON.stringify(data)}`,
    );
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Passo 4 — o preço NUNCA vem do cliente. Só aceitamos planId + cycle e
  // resolvemos o valor no servidor a partir da tabela `plans`.
  const planId = typeof body.planId === "string" ? body.planId.trim() : "";
  const rawCycle = typeof body.cycle === "string" ? body.cycle : "monthly";
  const cycle = ["monthly", "semestral", "annual"].includes(rawCycle)
    ? rawCycle
    : "monthly";

  if (!planId) {
    return json({ error: "missing_plan" }, 400);
  }


  try {
    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    if (!asaasKey) {
      console.error("[asaas-checkout] ASAAS_API_KEY ausente");
      return json({ error: "server_misconfigured" }, 500);
    }

    const supabaseUrl = getSupabaseUrl();
    const serviceRoleKey = getServiceRoleKey();
    const anonKey = getAnonKey();
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error("[asaas-checkout] Supabase env ausente");
      return json({ error: "server_misconfigured" }, 500);
    }

    // 1) Autenticação via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return json({ error: "unauthorized" }, 401);
    }
    const user = userData.user;

    // 2) Buscar perfil (service role para bypass de RLS interno)
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("user_id, display_name, cpf_cnpj, asaas_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.error("[asaas-checkout] profile fetch:", profileErr.message);
      return json({ error: "profile_fetch_failed" }, 500);
    }

    // 2.1) Preço autoritativo do plano (servidor)
    const { data: plan, error: planErr } = await admin
      .from("plans")
      .select(
        "id, name, price, price_semestral, price_anual, discount_semestral, discount_anual, active",
      )
      .eq("id", planId)
      .maybeSingle();

    if (planErr) {
      console.error("[asaas-checkout] plan fetch:", planErr.message);
      return json({ error: "plan_fetch_failed" }, 500);
    }
    if (!plan || plan.active === false) {
      return json({ error: "plan_not_found" }, 404);
    }

    const monthly = Number(plan.price) || 0;
    const months = cycle === "semestral" ? 6 : cycle === "annual" ? 12 : 1;
    const override =
      cycle === "semestral"
        ? plan.price_semestral
        : cycle === "annual"
        ? plan.price_anual
        : null;
    const discount =
      cycle === "semestral"
        ? Number(plan.discount_semestral) || 0
        : cycle === "annual"
        ? Number(plan.discount_anual) || 0
        : 0;

    const computed =
      override != null
        ? Number(override)
        : monthly * months * (1 - discount / 100);

    const dynamicValue = Math.round((computed || DEFAULT_PLAN_VALUE) * 100) / 100;
    if (!(dynamicValue > 0)) {
      return json({ error: "invalid_plan_price" }, 400);
    }

    const cycleLabel =
      cycle === "semestral" ? "Semestral" : cycle === "annual" ? "Anual" : "Mensal";
    const dynamicDescription = `Assinatura ${plan.name} (${cycleLabel})`;
    const productId = productIdFromPlanName(String(plan.name ?? ""));
    const priceId = `${productId}_${cycle}`;


    const email = user.email || "";
    const name = profile?.display_name || email || user.id;
    const cpf: string | undefined = profile?.cpf_cnpj?.replace(/\D/g, "") || undefined;

    if (!email) {
      return json({ error: "missing_email" }, 400);
    }

    // 3) Garantir asaas_customer_id
    let asaasCustomerId = profile?.asaas_customer_id as string | null;

    if (!asaasCustomerId) {
      const created = await asaasFetch("/customers", asaasKey, {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          ...(cpf ? { cpfCnpj: cpf } : {}),
          externalReference: user.id,
          notificationDisabled: true,
        }),
      });
      asaasCustomerId = created?.id ?? null;
      if (!asaasCustomerId) {
        throw new Error(`Cliente Asaas sem id: ${JSON.stringify(created)}`);
      }

      const { error: updErr } = await admin
        .from("profiles")
        .update({
          asaas_customer_id: asaasCustomerId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      if (updErr) {
        console.error(
          "[asaas-checkout] falha ao salvar asaas_customer_id:",
          updErr.message,
        );
      }
    }

    // 4) Criar cobrança PIX
    const payment = await asaasFetch("/payments", asaasKey, {
      method: "POST",
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: "PIX",
        value: dynamicValue,
        dueDate: tomorrowISODate(),
        description: dynamicDescription,
        externalReference: user.id,
        notificationDisabled: true,
        postalService: false,
      }),
    });

    if (!payment?.id) {
      throw new Error(`Cobrança sem id: ${JSON.stringify(payment)}`);
    }

    // 4.1) Atualiza a data de modificacao do perfil. (Plano/ciclo ficam apenas na tabela subscriptions).
    const { error: cycleErr } = await admin
      .from("profiles")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
    if (cycleErr) {
      console.error("[asaas-checkout] falha ao salvar perfil:", cycleErr.message);
    }

    // 4.2) Cria um registro pendente somente quando não há assinatura ativa.
    // Renovação/upgrade em andamento não deve revogar acesso antes do pagamento.
    const environment = getAsaasEnvironment();
    const { data: existingSub, error: subReadErr } = await admin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .eq("environment", environment)
      .maybeSingle();
    if (subReadErr) {
      console.error("[asaas-checkout] falha ao ler assinatura:", subReadErr.message);
    }

    if (!isActiveSubscription(existingSub as { status?: string | null; current_period_end?: string | null } | null)) {
      const nowIso = new Date().toISOString();
      const { error: subErr } = await upsertSubscriptionWithLegacyFallback(admin, {
        user_id: user.id,
        environment,
        paddle_subscription_id: `asaas_payment_${payment.id}`,
        paddle_customer_id: asaasCustomerId,
        product_id: productId,
        price_id: priceId,
        status: "pending",
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        asaas_payment_id: payment.id,
        asaas_customer_id: asaasCustomerId,
        updated_at: nowIso,
      });
      if (subErr) {
        console.error("[asaas-checkout] falha ao registrar assinatura pendente:", subErr.message);
      }
    }


    // 5) Buscar QR Code PIX (endpoint dedicado do Asaas)
    let pix: { payload?: string; encodedImage?: string; expirationDate?: string } | null =
      null;
    try {
      const qr = await asaasFetch(`/payments/${payment.id}/pixQrCode`, asaasKey, {
        method: "GET",
      });
      pix = {
        payload: qr?.payload,
        encodedImage: qr?.encodedImage,
        expirationDate: qr?.expirationDate,
      };
    } catch (e) {
      console.warn(
        "[asaas-checkout] pixQrCode indisponível:",
        (e as Error)?.message,
      );
    }

    console.log(
      `[asaas-checkout] ok user=${user.id} payment=${payment.id} value=${dynamicValue}`,
    );

    return json({
      paymentId: payment.id,
      invoiceUrl: payment.invoiceUrl ?? null,
      status: payment.status ?? null,
      dueDate: payment.dueDate ?? null,
      value: payment.value ?? DEFAULT_PLAN_VALUE,
      pix,
    });
  } catch (e) {
    console.error("[asaas-checkout] erro:", (e as Error)?.message ?? e);
    return json({ error: "internal_error" }, 500);
  }
});
