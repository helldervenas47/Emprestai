#!/usr/bin/env node
/**
 * Testes ponta a ponta (API) da integração Asaas.
 *
 * Cobre o que dá para automatizar do checklist `docs/checklist-asaas-e2e.md`:
 *  - checkout autenticado (asaas-checkout)
 *  - rejeição de checkout sem JWT / com plano inválido
 *  - webhook: token inválido (403), evento não mapeado, cliente desconhecido
 *  - webhook: PAYMENT_CONFIRMED libera acesso e estende período
 *  - webhook: idempotência (mesmo event_id e mesmo payment_id)
 *  - webhook: PAYMENT_OVERDUE marca PAST_DUE
 *  - RPC my_access_state() antes/depois
 *
 * NÃO cobre: pagar o PIX de verdade no sandbox e a UI de bloqueio (manual).
 *
 * Uso:
 *   SUPABASE_URL=... \
 *   SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   ASAAS_WEBHOOK_SECRET=... \
 *   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
 *   [TEST_PLAN_ID=...] [TEST_CYCLE=monthly] \
 *   node scripts/test-asaas-e2e.mjs
 */

const env = (k, fallback) => process.env[k] ?? fallback;

const SUPABASE_URL = (env("SUPABASE_URL") || env("VITE_SUPABASE_URL") || "").replace(/\/$/, "");
const ANON_KEY = env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const WEBHOOK_SECRET = env("ASAAS_WEBHOOK_SECRET");
const EMAIL = env("TEST_USER_EMAIL");
const PASSWORD = env("TEST_USER_PASSWORD");
const CYCLE = env("TEST_CYCLE", "monthly");
let PLAN_ID = env("TEST_PLAN_ID");

const missing = Object.entries({
  SUPABASE_URL,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  ASAAS_WEBHOOK_SECRET: WEBHOOK_SECRET,
  TEST_USER_EMAIL: EMAIL,
  TEST_USER_PASSWORD: PASSWORD,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`Variáveis obrigatórias ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

// ---------------------------------------------------------------- helpers

const results = [];
let failures = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function step(name, fn) {
  try {
    return await fn();
  } catch (e) {
    check(name, false, e?.message ?? String(e));
    return null;
  }
}

async function api(path, { method = "GET", headers = {}, body, key = SERVICE_KEY } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

const rest = (p, opts) => api(`/rest/v1${p}`, opts);
const fn = (name, opts) => api(`/functions/v1/${name}`, opts);

const rid = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- login

console.log("\n=== 0. Autenticação do usuário de teste ===");

const login = await api("/auth/v1/token?grant_type=password", {
  method: "POST",
  key: ANON_KEY,
  body: { email: EMAIL, password: PASSWORD },
});

if (!login.ok || !login.json?.access_token) {
  check("login do usuário de teste", false, JSON.stringify(login.json));
  process.exit(1);
}
const USER_JWT = login.json.access_token;
const USER_ID = login.json.user?.id;
check("login do usuário de teste", true, `user_id=${USER_ID}`);

// ---------------------------------------------------------------- plano

if (!PLAN_ID) {
  const plans = await rest("/plans?select=id,name,price&active=eq.true&order=sort_order.asc&limit=1");
  PLAN_ID = plans.json?.[0]?.id;
  check("plano ativo encontrado", Boolean(PLAN_ID), PLAN_ID ? `${plans.json[0].name}` : "nenhum plano ativo");
  if (!PLAN_ID) process.exit(1);
}

// ---------------------------------------------------------------- checkout

console.log("\n=== 1. Checkout (asaas-checkout) ===");

await step("checkout sem JWT", async () => {
  const r = await fn("asaas-checkout", {
    method: "POST",
    key: ANON_KEY,
    headers: { Authorization: "" },
    body: { planId: PLAN_ID, cycle: CYCLE },
  });
  check("checkout sem JWT é rejeitado (401)", r.status === 401, `status=${r.status}`);
});

await step("checkout sem planId", async () => {
  const r = await fn("asaas-checkout", {
    method: "POST",
    key: ANON_KEY,
    headers: { Authorization: `Bearer ${USER_JWT}` },
    body: { cycle: CYCLE },
  });
  check("checkout sem planId retorna 400", r.status === 400, `status=${r.status}`);
});

await step("checkout com plano inexistente", async () => {
  const r = await fn("asaas-checkout", {
    method: "POST",
    key: ANON_KEY,
    headers: { Authorization: `Bearer ${USER_JWT}` },
    body: { planId: "00000000-0000-0000-0000-000000000000", cycle: CYCLE },
  });
  check("plano inexistente retorna 404", r.status === 404, `status=${r.status}`);
});

let checkout = null;
await step("checkout válido", async () => {
  const r = await fn("asaas-checkout", {
    method: "POST",
    key: ANON_KEY,
    headers: { Authorization: `Bearer ${USER_JWT}` },
    body: { planId: PLAN_ID, cycle: CYCLE },
  });
  checkout = r.json;
  check("checkout válido retorna 200 com paymentId", r.ok && Boolean(r.json?.paymentId), `status=${r.status} ${r.ok ? `payment=${r.json?.paymentId} valor=${r.json?.value}` : JSON.stringify(r.json)}`);
  check("checkout devolve QR Code PIX", Boolean(r.json?.pix?.payload || r.json?.invoiceUrl), r.json?.pix?.payload ? "payload presente" : "somente invoiceUrl");
});

// preço não vem do cliente
await step("preço ignorado do cliente", async () => {
  const r = await fn("asaas-checkout", {
    method: "POST",
    key: ANON_KEY,
    headers: { Authorization: `Bearer ${USER_JWT}` },
    body: { planId: PLAN_ID, cycle: CYCLE, value: 0.01, price: 0.01 },
  });
  const same = r.ok && checkout && Number(r.json?.value) === Number(checkout.value);
  check("valor enviado pelo cliente é ignorado", Boolean(same), `esperado=${checkout?.value} recebido=${r.json?.value}`);
});

// ---------------------------------------------------------------- perfil

const readProfile = async () => {
  const r = await rest(
    `/profiles?select=user_id,asaas_customer_id,financial_status,current_period_end,current_plan_cycle,last_payment_id,is_blocked&user_id=eq.${USER_ID}`,
  );
  return r.json?.[0] ?? null;
};

let profile = await readProfile();
check("profile do usuário existe", Boolean(profile), profile ? `customer=${profile.asaas_customer_id}` : "não encontrado");
const CUSTOMER_ID = profile?.asaas_customer_id;
if (!CUSTOMER_ID) {
  console.error("Sem asaas_customer_id no profile — rode o checkout válido antes.");
  process.exit(1);
}

// ---------------------------------------------------------------- webhook

console.log("\n=== 2. Webhook (asaas-webhook) ===");

const postWebhook = (payload, token = WEBHOOK_SECRET) =>
  fn("asaas-webhook", {
    method: "POST",
    key: ANON_KEY,
    headers: { "asaas-access-token": token ?? "" },
    body: payload,
  });

const paymentEvent = (event, { eventId = `evt_${rid()}`, paymentId = `pay_${rid()}`, customer = CUSTOMER_ID } = {}) => ({
  id: eventId,
  event,
  payment: { id: paymentId, customer, value: 49.9, status: "CONFIRMED" },
});

await step("webhook token inválido", async () => {
  const r = await postWebhook(paymentEvent("PAYMENT_CONFIRMED"), "token-errado");
  check("webhook com token inválido retorna 403", r.status === 403, `status=${r.status}`);
});

await step("webhook sem token", async () => {
  const r = await postWebhook(paymentEvent("PAYMENT_CONFIRMED"), "");
  check("webhook sem token retorna 403", r.status === 403, `status=${r.status}`);
});

await step("evento não mapeado", async () => {
  const r = await postWebhook(paymentEvent("PAYMENT_CREATED"));
  check("evento não mapeado é ignorado", r.ok && r.json?.ignored === "PAYMENT_CREATED", JSON.stringify(r.json));
});

await step("cliente desconhecido", async () => {
  const r = await postWebhook(paymentEvent("PAYMENT_CONFIRMED", { customer: `cus_inexistente_${rid()}` }));
  check("cliente desconhecido é ignorado", r.ok && r.json?.ignored === "unknown_customer", JSON.stringify(r.json));
});

// -- confirmação de pagamento
const beforeConfirm = await readProfile();
const confirmEventId = `evt_${rid()}`;
const confirmPaymentId = `pay_${rid()}`;

await step("PAYMENT_CONFIRMED", async () => {
  const r = await postWebhook(paymentEvent("PAYMENT_CONFIRMED", { eventId: confirmEventId, paymentId: confirmPaymentId }));
  check("PAYMENT_CONFIRMED processado", r.ok && r.json?.status === "ACTIVE", JSON.stringify(r.json));
});

const afterConfirm = await readProfile();
check("financial_status = ACTIVE", afterConfirm?.financial_status === "ACTIVE", `status=${afterConfirm?.financial_status}`);
check("is_blocked = false", afterConfirm?.is_blocked === false, `is_blocked=${afterConfirm?.is_blocked}`);
check("last_payment_id gravado", afterConfirm?.last_payment_id === confirmPaymentId, `last_payment_id=${afterConfirm?.last_payment_id}`);

const periodAfter = afterConfirm?.current_period_end ? new Date(afterConfirm.current_period_end) : null;
const periodBefore = beforeConfirm?.current_period_end ? new Date(beforeConfirm.current_period_end) : null;
check(
  "current_period_end estendido para o futuro",
  Boolean(periodAfter && periodAfter.getTime() > Date.now() && (!periodBefore || periodAfter > periodBefore)),
  `antes=${beforeConfirm?.current_period_end ?? "-"} depois=${afterConfirm?.current_period_end ?? "-"}`,
);

// -- idempotência por event_id
await step("idempotência por event_id", async () => {
  const r = await postWebhook(paymentEvent("PAYMENT_CONFIRMED", { eventId: confirmEventId, paymentId: confirmPaymentId }));
  check("reenvio do mesmo event_id é duplicado", r.ok && r.json?.duplicated === true, JSON.stringify(r.json));
  const p = await readProfile();
  check("período não somou de novo (event_id)", p?.current_period_end === afterConfirm?.current_period_end, `period=${p?.current_period_end}`);
});

// -- idempotência por payment_id (event_id novo, mesmo pagamento)
await step("idempotência por payment_id", async () => {
  const r = await postWebhook(paymentEvent("PAYMENT_RECEIVED", { eventId: `evt_${rid()}`, paymentId: confirmPaymentId }));
  check("mesmo payment_id não credita de novo", r.ok && r.json?.duplicated === true, JSON.stringify(r.json));
  const p = await readProfile();
  check("período não somou de novo (payment_id)", p?.current_period_end === afterConfirm?.current_period_end, `period=${p?.current_period_end}`);
});

// -- auditoria
await step("auditoria de eventos", async () => {
  const r = await rest(`/asaas_webhook_events?select=event_id,event_type,status&event_id=eq.${confirmEventId}`);
  const row = r.json?.[0];
  check("evento registrado em asaas_webhook_events", row?.status === "processed", JSON.stringify(row ?? r.json));
});

// ---------------------------------------------------------------- acesso

console.log("\n=== 3. Estado de acesso (my_access_state) ===");

const accessState = async () => {
  const r = await api("/rest/v1/rpc/my_access_state", {
    method: "POST",
    key: ANON_KEY,
    headers: { Authorization: `Bearer ${USER_JWT}` },
    body: {},
  });
  return r;
};

await step("acesso liberado após pagamento", async () => {
  const r = await accessState();
  const state = Array.isArray(r.json) ? r.json[0] : r.json;
  check("my_access_state responde", r.ok, `status=${r.status}`);
  check("usuário NÃO está bloqueado após confirmação", state?.locked === false || state?.blocked === false, JSON.stringify(state));
});

// ---------------------------------------------------------------- inadimplência

console.log("\n=== 4. Inadimplência ===");

await step("PAYMENT_OVERDUE", async () => {
  const r = await postWebhook(paymentEvent("PAYMENT_OVERDUE", { paymentId: `pay_${rid()}` }));
  check("PAYMENT_OVERDUE processado", r.ok && r.json?.status === "PAST_DUE", JSON.stringify(r.json));
  const p = await readProfile();
  check("financial_status = PAST_DUE", p?.financial_status === "PAST_DUE", `status=${p?.financial_status}`);
});

console.log(
  "\nℹ️  Bloqueio de tela por expiração exige current_period_end no passado. " +
    "Para simular:\n   UPDATE public.profiles SET current_period_end = now() - interval '1 day' " +
    `WHERE user_id = '${USER_ID}';\n   e então rechecar my_access_state() / a UI.`,
);

// ---------------------------------------------------------------- restauração

if (process.env.RESTORE_AFTER === "1" && beforeConfirm) {
  console.log("\n=== 5. Restaurando estado original do profile ===");
  await rest(`/profiles?user_id=eq.${USER_ID}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: {
      financial_status: beforeConfirm.financial_status,
      current_period_end: beforeConfirm.current_period_end,
      last_payment_id: beforeConfirm.last_payment_id,
      is_blocked: beforeConfirm.is_blocked,
    },
  });
  console.log("Profile restaurado.");
}

// ---------------------------------------------------------------- resumo

console.log("\n===================== RESUMO =====================");
console.log(`Total: ${results.length} | Passaram: ${results.length - failures} | Falharam: ${failures}`);
if (failures) {
  console.log("\nFalhas:");
  results.filter((r) => !r.ok).forEach((r) => console.log(` - ${r.name}${r.detail ? `: ${r.detail}` : ""}`));
}
process.exit(failures ? 1 : 0);
