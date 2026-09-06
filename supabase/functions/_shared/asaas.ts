export type BillingEnvironment = "live" | "sandbox";
export function billingConfig() {
  const configured = Deno.env.get("ASAAS_ENVIRONMENT") ?? Deno.env.get("APP_ENVIRONMENT") ?? "live";
  const explicit = configured === "production" ? "live" : configured;
  if (!["live", "sandbox"].includes(explicit)) throw new Error("invalid_billing_environment");
  const environment = explicit as BillingEnvironment;
  const baseUrl = (Deno.env.get("ASAAS_BASE_URL") ?? (environment === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3")).replace(/\/$/, "");
  const url = new URL(baseUrl);
  const hosts = environment === "sandbox" ? ["api-sandbox.asaas.com", "sandbox.asaas.com"] : ["api.asaas.com"];
  if (url.protocol !== "https:" || !hosts.includes(url.hostname)) throw new Error("billing_environment_url_mismatch");
  const apiKey = Deno.env.get("ASAAS_API_KEY");
  if (!apiKey) throw new Error("missing_asaas_api_key");
  return { environment, baseUrl, apiKey };
}
export async function asaasFetch(path: string, init: RequestInit = {}) {
  const { baseUrl, apiKey } = billingConfig();
  const observedAt = new Date().toISOString();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init, signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", access_token: apiKey, ...init.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`asaas_http_${response.status}`);
  if (data?.object === "payment" || (data?.id?.startsWith("pay_") && data?.customer)) data._observed_at = observedAt;
  return data;
}
export const billingCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function billingJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...billingCors, "Content-Type": "application/json" } });
}
export function productIdFromPlanName(name: string) {
  const n = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (n.includes("basic") || n.includes("basico")) return "basico_plan";
  if (n.includes("prof")) return "profissional_plan";
  if (n.includes("empres")) return "empresarial_plan";
  return `${n.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_plan`;
}
export function planPriceCents(plan: Record<string, unknown>, cycle: string) {
  if (!["monthly", "semestral", "annual"].includes(cycle)) throw new Error("invalid_cycle");
  const months = cycle === "annual" ? 12 : cycle === "semestral" ? 6 : 1;
  const override = cycle === "annual" ? plan.price_anual : cycle === "semestral" ? plan.price_semestral : null;
  const discount = Number(cycle === "annual" ? plan.discount_anual ?? 0 : cycle === "semestral" ? plan.discount_semestral ?? 0 : 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) throw new Error("invalid_plan_price");
  const cents = override != null ? Math.round(Number(override) * 100) : Math.round(Math.round(Number(plan.price) * 100) * months * (1 - discount / 100));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("invalid_plan_price");
  return cents;
}
export async function authenticatedOwner(admin: any, req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("unauthorized");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("unauthorized");
  const owner = await admin.rpc("get_data_owner_id", { _user_id: data.user.id });
  if (owner.error) throw new Error("owner_lookup_failed");
  if (owner.data && owner.data !== data.user.id) throw new Error("only_account_owner_can_purchase");
  return data.user;
}
