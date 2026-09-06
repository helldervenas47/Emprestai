export type BillingEnvironment = "live" | "sandbox";
export const BILLING_ENVIRONMENT: BillingEnvironment = import.meta.env.VITE_ASAAS_ENVIRONMENT === "sandbox" ? "sandbox" : "live";

export function productIdFromPlanName(name: string): string {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("basic") || normalized.includes("basico")) return "basico_plan";
  if (normalized.includes("prof")) return "profissional_plan";
  if (normalized.includes("empres")) return "empresarial_plan";
  if (["free", "gratis", "trial", "teste"].includes(normalized)) return "free_plan";
  return `${normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_plan`;
}

export function hasSubscriptionAccess(row: {
  product_id?: string | null; status?: string | null;
  current_period_start?: string | null; current_period_end?: string | null;
  cancel_at_period_end?: boolean; manual_override?: boolean;
} | null, now = Date.now()): boolean {
  if (!row || !row.product_id || ["free_plan", "free", "trial", "teste"].includes(row.product_id)) return false;
  const end = row.current_period_end ? Date.parse(row.current_period_end) : NaN;
  const start = row.current_period_start ? Date.parse(row.current_period_start) : -Infinity;
  const status = (row.status ?? "").toLowerCase();
  const eligible = row.manual_override === true
    || ["active", "trialing", "paid"].includes(status)
    || (status === "canceled" && row.cancel_at_period_end === true);
  return eligible && start <= now && end > now;
}
