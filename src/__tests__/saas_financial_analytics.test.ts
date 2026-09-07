import { describe, it, expect } from "vitest";

// Simulação da lógica de cálculo financeiro do SaaS do EmprestAI
interface MockOrder {
  id: string;
  user_id: string;
  plan_id: string;
  environment: "live" | "sandbox";
  amount_cents: number;
  cycle: "monthly" | "semestral" | "annual";
  status: "paid" | "pending" | "refunded" | "revoked";
  credited_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface MockPlan {
  id: string;
  name: string;
  price: number;
}

function calculateSaasMetrics(
  orders: MockOrder[],
  plans: MockPlan[],
  env: "live" | "sandbox" = "live",
  startDate?: string,
  endDate?: string
) {
  const start = startDate ? new Date(startDate) : new Date("2026-01-01T00:00:00Z");
  const end = endDate ? new Date(endDate) : new Date("2026-12-31T23:59:59Z");

  const filteredOrders = orders.filter((o) => {
    if (o.environment !== env) return false;
    const dateToCheck = o.status === "paid" && o.credited_at
      ? new Date(o.credited_at)
      : o.revoked_at
        ? new Date(o.revoked_at)
        : new Date(o.created_at);
    return dateToCheck >= start && dateToCheck <= end;
  });

  let grossRevenue = 0;
  let appDiscounts = 0;
  let refundsAmount = 0;
  let paidCount = 0;

  filteredOrders.forEach((o) => {
    const paidVal = Number(o.amount_cents || 0) / 100;

    if (o.status === "paid") {
      grossRevenue += paidVal;
      paidCount += 1;
    } else if (o.status === "refunded" || o.status === "revoked") {
      refundsAmount += paidVal;
    }
  });

  // RECEITA LÍQUIDA = RECEITA BRUTA - DESCONTOS DO APP - ESTORNOS
  const netRevenue = grossRevenue - appDiscounts - refundsAmount;
  const avgTicket = paidCount > 0 ? Math.round((grossRevenue / paidCount) * 100) / 100 : 0;

  const pendingOrders = orders.filter((o) => o.environment === env && o.status === "pending");
  const pendingAmount = pendingOrders.reduce((sum, o) => sum + Number(o.amount_cents || 0) / 100, 0);

  return {
    grossRevenue: Math.round(grossRevenue * 100) / 100,
    appDiscounts: Math.round(appDiscounts * 100) / 100,
    refundsAmount: Math.round(refundsAmount * 100) / 100,
    netRevenue: Math.round(netRevenue * 100) / 100,
    paidCount,
    avgTicket,
    pendingAmount: Math.round(pendingAmount * 100) / 100,
  };
}

describe("SaaS Financial Analytics - Faturamento Bruto Histórico e Receita Líquida", () => {
  const samplePlans: MockPlan[] = [
    { id: "plan_basic", name: "Básico", price: 100 },
    { id: "plan_pro", name: "Profissional", price: 200 },
  ];

  it("Preserva estritamente o valor nominal da compra histórica (ex: 4 pedidos de R$ 5,00 = R$ 20,00)", () => {
    const orders: MockOrder[] = [
      { id: "o1", user_id: "u1", plan_id: "plan_pro", environment: "live", amount_cents: 500, cycle: "monthly", status: "paid", credited_at: "2026-09-01T10:00:00Z", revoked_at: null, created_at: "2026-09-01T09:00:00Z" },
      { id: "o2", user_id: "u2", plan_id: "plan_pro", environment: "live", amount_cents: 500, cycle: "monthly", status: "paid", credited_at: "2026-09-02T10:00:00Z", revoked_at: null, created_at: "2026-09-02T09:00:00Z" },
      { id: "o3", user_id: "u3", plan_id: "plan_pro", environment: "live", amount_cents: 500, cycle: "monthly", status: "paid", credited_at: "2026-09-03T10:00:00Z", revoked_at: null, created_at: "2026-09-03T09:00:00Z" },
      { id: "o4", user_id: "u4", plan_id: "plan_pro", environment: "live", amount_cents: 500, cycle: "monthly", status: "paid", credited_at: "2026-09-04T10:00:00Z", revoked_at: null, created_at: "2026-09-04T09:00:00Z" },
    ];

    // Preço do plano pro hoje é R$ 200, mas o histórico real transacionado na época foi R$ 5 cada
    const res = calculateSaasMetrics(orders, samplePlans, "live");
    expect(res.grossRevenue).toBe(20.00); // 4 * 5 = 20 (NÃO 4 * 200 = 800)
    expect(res.appDiscounts).toBe(0.00);
    expect(res.refundsAmount).toBe(0.00);
    expect(res.netRevenue).toBe(20.00);
    expect(res.avgTicket).toBe(5.00);
    expect(res.grossRevenue - res.appDiscounts - res.refundsAmount).toBe(res.netRevenue);
  });

  it("Trata estornos deduzindo da receita líquida sem afetar faturamento bruto", () => {
    const orders: MockOrder[] = [
      { id: "o1", user_id: "u1", plan_id: "plan_pro", environment: "live", amount_cents: 5000, cycle: "monthly", status: "paid", credited_at: "2026-09-01T10:00:00Z", revoked_at: null, created_at: "2026-09-01T09:00:00Z" },
      { id: "o2", user_id: "u2", plan_id: "plan_pro", environment: "live", amount_cents: 2000, cycle: "monthly", status: "refunded", credited_at: null, revoked_at: "2026-09-02T10:00:00Z", created_at: "2026-09-02T09:00:00Z" },
    ];

    const res = calculateSaasMetrics(orders, samplePlans, "live");
    expect(res.grossRevenue).toBe(50.00);
    expect(res.refundsAmount).toBe(20.00);
    expect(res.netRevenue).toBe(30.00);
  });
});
