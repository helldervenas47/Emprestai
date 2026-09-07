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
  price: number; // Mensal base
  price_semestral?: number | null;
  price_anual?: number | null;
  discount_semestral?: number;
  discount_anual?: number;
}

function calculateSaasMetrics(
  orders: MockOrder[],
  plans: MockPlan[],
  env: "live" | "sandbox" = "live",
  startDate?: string,
  endDate?: string
) {
  const planMap = new Map(plans.map((p) => [p.id, p]));
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

  const planStats = new Map<string, { gross: number; discounts: number; refunds: number; net: number; count: number }>();

  filteredOrders.forEach((o) => {
    const plan = planMap.get(o.plan_id);
    const cycleMonths = o.cycle === "annual" ? 12 : o.cycle === "semestral" ? 6 : 1;
    const baseMonthly = Number(plan?.price || 0);
    const paidVal = Number(o.amount_cents || 0) / 100;

    let orderGross = paidVal;
    if (baseMonthly > 0) {
      orderGross = Math.max(baseMonthly * cycleMonths, paidVal);
    }
    const orderDiscount = Math.max(orderGross - paidVal, 0);

    const planKey = o.plan_id;
    if (!planStats.has(planKey)) {
      planStats.set(planKey, { gross: 0, discounts: 0, refunds: 0, net: 0, count: 0 });
    }
    const pStat = planStats.get(planKey)!;

    if (o.status === "paid") {
      grossRevenue += orderGross;
      appDiscounts += orderDiscount;
      paidCount += 1;

      pStat.gross += orderGross;
      pStat.discounts += orderDiscount;
      pStat.net += (orderGross - orderDiscount);
      pStat.count += 1;
    } else if (o.status === "refunded" || o.status === "revoked") {
      refundsAmount += paidVal;

      pStat.refunds += paidVal;
      pStat.net -= paidVal;
    }
  });

  // RECEITA LÍQUIDA = RECEITA BRUTA - DESCONTOS DO APP - ESTORNOS
  const netRevenue = grossRevenue - appDiscounts - refundsAmount;
  const avgTicket = paidCount > 0 ? Math.round((grossRevenue / paidCount) * 100) / 100 : 0;

  // Ordens pendentes
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
    planStats: Array.from(planStats.entries()).map(([id, s]) => ({
      id,
      gross: Math.round(s.gross * 100) / 100,
      discounts: Math.round(s.discounts * 100) / 100,
      refunds: Math.round(s.refunds * 100) / 100,
      net: Math.round(s.net * 100) / 100,
      count: s.count,
    })),
  };
}

describe("SaaS Financial Analytics - Testes de Regra de Receita Líquida (A até O)", () => {
  const samplePlans: MockPlan[] = [
    { id: "plan_basic", name: "Básico", price: 100, discount_semestral: 5, discount_anual: 10 },
    { id: "plan_pro", name: "Profissional", price: 200, discount_semestral: 5, discount_anual: 10 },
    { id: "plan_fixed", name: "Custom Override", price: 100, price_anual: 1000 }, // Override fixo R$ 1.000 (de 1.200)
  ];

  it("Cenário A: Venda sem desconto e sem estorno -> R$ 100 gera Líquido R$ 100", () => {
    const orders: MockOrder[] = [
      {
        id: "ord_1",
        user_id: "u1",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 10000, // R$ 100
        cycle: "monthly",
        status: "paid",
        credited_at: "2026-09-01T10:00:00Z",
        revoked_at: null,
        created_at: "2026-09-01T09:00:00Z",
      },
    ];

    const res = calculateSaasMetrics(orders, samplePlans, "live");
    expect(res.grossRevenue).toBe(100);
    expect(res.appDiscounts).toBe(0);
    expect(res.refundsAmount).toBe(0);
    expect(res.netRevenue).toBe(100);
    expect(res.grossRevenue - res.appDiscounts - res.refundsAmount).toBe(res.netRevenue);
  });

  it("Cenário B: Venda com desconto -> Bruto R$ 100, Desconto R$ 20, Pago R$ 80, Líquido R$ 80", () => {
    const orders: MockOrder[] = [
      {
        id: "ord_2",
        user_id: "u2",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 8000, // Pago R$ 80 (após R$ 20 de desconto no plano base de R$ 100)
        cycle: "monthly",
        status: "paid",
        credited_at: "2026-09-02T10:00:00Z",
        revoked_at: null,
        created_at: "2026-09-02T09:00:00Z",
      },
    ];

    const res = calculateSaasMetrics(orders, samplePlans, "live");
    expect(res.grossRevenue).toBe(100);
    expect(res.appDiscounts).toBe(20);
    expect(res.refundsAmount).toBe(0);
    expect(res.netRevenue).toBe(80);
    expect(res.grossRevenue - res.appDiscounts - res.refundsAmount).toBe(80);
  });

  it("Cenário C: Venda com desconto + estorno parcial -> Bruto R$ 100, Desconto R$ 20, Pago R$ 80, Estorno R$ 30, Líquido R$ 50", () => {
    const orders: MockOrder[] = [
      {
        id: "ord_3_paid",
        user_id: "u3",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 8000,
        cycle: "monthly",
        status: "paid",
        credited_at: "2026-09-03T10:00:00Z",
        revoked_at: null,
        created_at: "2026-09-03T09:00:00Z",
      },
      {
        id: "ord_3_partial_refund",
        user_id: "u3",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 3000, // Estorno parcial de R$ 30
        cycle: "monthly",
        status: "refunded",
        credited_at: null,
        revoked_at: "2026-09-04T12:00:00Z",
        created_at: "2026-09-04T12:00:00Z",
      },
    ];

    const res = calculateSaasMetrics(orders, samplePlans, "live");
    expect(res.grossRevenue).toBe(100);
    expect(res.appDiscounts).toBe(20);
    expect(res.refundsAmount).toBe(30);
    expect(res.netRevenue).toBe(50);
    expect(res.grossRevenue - res.appDiscounts - res.refundsAmount).toBe(50);
  });

  it("Cenário D: Venda integralmente estornada -> Bruto R$ 100, Desconto R$ 20, Pago R$ 80, Estorno R$ 80, Líquido R$ 0", () => {
    const orders: MockOrder[] = [
      {
        id: "ord_4_paid",
        user_id: "u4",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 8000,
        cycle: "monthly",
        status: "paid",
        credited_at: "2026-09-04T10:00:00Z",
        revoked_at: null,
        created_at: "2026-09-04T09:00:00Z",
      },
      {
        id: "ord_4_full_refund",
        user_id: "u4",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 8000, // Estorno total de R$ 80
        cycle: "monthly",
        status: "refunded",
        credited_at: null,
        revoked_at: "2026-09-05T12:00:00Z",
        created_at: "2026-09-05T12:00:00Z",
      },
    ];

    const res = calculateSaasMetrics(orders, samplePlans, "live");
    expect(res.grossRevenue).toBe(100);
    expect(res.appDiscounts).toBe(20);
    expect(res.refundsAmount).toBe(80);
    expect(res.netRevenue).toBe(0);
    expect(res.grossRevenue - res.appDiscounts - res.refundsAmount).toBe(0);
  });

  it("Cenários E & F: Múltiplas vendas com cupom percentual de ciclo anual (10%)", () => {
    // Plano Pro: R$ 200/mês. Ciclo anual base: R$ 2.400. Com 10% desconto = R$ 2.160 pago (R$ 240 desconto).
    const orders: MockOrder[] = [
      {
        id: "ord_pro_annual",
        user_id: "u5",
        plan_id: "plan_pro",
        environment: "live",
        amount_cents: 216000, // R$ 2.160
        cycle: "annual",
        status: "paid",
        credited_at: "2026-09-05T10:00:00Z",
        revoked_at: null,
        created_at: "2026-09-05T09:00:00Z",
      },
      {
        id: "ord_basic_monthly",
        user_id: "u6",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 10000, // R$ 100
        cycle: "monthly",
        status: "paid",
        credited_at: "2026-09-05T11:00:00Z",
        revoked_at: null,
        created_at: "2026-09-05T09:00:00Z",
      },
    ];

    const res = calculateSaasMetrics(orders, samplePlans, "live");
    expect(res.grossRevenue).toBe(2500); // 2400 + 100
    expect(res.appDiscounts).toBe(240); // 2400 - 2160
    expect(res.refundsAmount).toBe(0);
    expect(res.netRevenue).toBe(2260); // 2160 + 100
    expect(res.grossRevenue - res.appDiscounts - res.refundsAmount).toBe(res.netRevenue);
  });

  it("Cenário G: Desconto fixo / override em plano anual", () => {
    // Plano Custom: R$ 100/mês. Base anual R$ 1.200. Preço anual fixado em R$ 1.000 (R$ 200 de desconto)
    const orders: MockOrder[] = [
      {
        id: "ord_override",
        user_id: "u7",
        plan_id: "plan_fixed",
        environment: "live",
        amount_cents: 100000, // R$ 1.000
        cycle: "annual",
        status: "paid",
        credited_at: "2026-09-06T10:00:00Z",
        revoked_at: null,
        created_at: "2026-09-06T09:00:00Z",
      },
    ];

    const res = calculateSaasMetrics(orders, samplePlans, "live");
    expect(res.grossRevenue).toBe(1200);
    expect(res.appDiscounts).toBe(200);
    expect(res.netRevenue).toBe(1000);
  });

  it("Cenários H, I & J: Chargeback com status revoked", () => {
    const orders: MockOrder[] = [
      {
        id: "ord_chargeback",
        user_id: "u8",
        plan_id: "plan_pro",
        environment: "live",
        amount_cents: 20000, // R$ 200
        cycle: "monthly",
        status: "revoked",
        credited_at: null,
        revoked_at: "2026-09-06T15:00:00Z",
        created_at: "2026-09-01T10:00:00Z",
      },
    ];

    const res = calculateSaasMetrics(orders, samplePlans, "live");
    expect(res.grossRevenue).toBe(0);
    expect(res.refundsAmount).toBe(200);
    expect(res.netRevenue).toBe(-200);
  });

  it("Cenário K: Transação pendente não entra no faturamento realizado", () => {
    const orders: MockOrder[] = [
      {
        id: "ord_paid",
        user_id: "u9",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 10000,
        cycle: "monthly",
        status: "paid",
        credited_at: "2026-09-06T10:00:00Z",
        revoked_at: null,
        created_at: "2026-09-06T09:00:00Z",
      },
      {
        id: "ord_pending",
        user_id: "u10",
        plan_id: "plan_pro",
        environment: "live",
        amount_cents: 20000,
        cycle: "monthly",
        status: "pending",
        credited_at: null,
        revoked_at: null,
        created_at: "2026-09-06T12:00:00Z",
      },
    ];

    const res = calculateSaasMetrics(orders, samplePlans, "live");
    expect(res.grossRevenue).toBe(100);
    expect(res.netRevenue).toBe(100);
    expect(res.pendingAmount).toBe(200);
  });

  it("Cenário L: Sandbox não entra no ambiente Live", () => {
    const orders: MockOrder[] = [
      {
        id: "ord_live",
        user_id: "u11",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 10000,
        cycle: "monthly",
        status: "paid",
        credited_at: "2026-09-06T10:00:00Z",
        revoked_at: null,
        created_at: "2026-09-06T09:00:00Z",
      },
      {
        id: "ord_sandbox",
        user_id: "u12",
        plan_id: "plan_pro",
        environment: "sandbox",
        amount_cents: 999000, // R$ 9.990 em teste
        cycle: "monthly",
        status: "paid",
        credited_at: "2026-09-06T10:00:00Z",
        revoked_at: null,
        created_at: "2026-09-06T09:00:00Z",
      },
    ];

    const resLive = calculateSaasMetrics(orders, samplePlans, "live");
    expect(resLive.grossRevenue).toBe(100);
    expect(resLive.netRevenue).toBe(100);

    const resSandbox = calculateSaasMetrics(orders, samplePlans, "sandbox");
    expect(resSandbox.grossRevenue).toBe(9990);
  });

  it("Cenários M & N: Filtros de período e mês anterior", () => {
    const orders: MockOrder[] = [
      {
        id: "ord_august",
        user_id: "u13",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 10000,
        cycle: "monthly",
        status: "paid",
        credited_at: "2026-08-15T10:00:00Z",
        revoked_at: null,
        created_at: "2026-08-15T09:00:00Z",
      },
      {
        id: "ord_september",
        user_id: "u14",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 10000,
        cycle: "monthly",
        status: "paid",
        credited_at: "2026-09-05T10:00:00Z",
        revoked_at: null,
        created_at: "2026-09-05T09:00:00Z",
      },
    ];

    const resSeptember = calculateSaasMetrics(orders, samplePlans, "live", "2026-09-01T00:00:00Z", "2026-09-30T23:59:59Z");
    expect(resSeptember.grossRevenue).toBe(100);
    expect(resSeptember.paidCount).toBe(1);

    const resAugust = calculateSaasMetrics(orders, samplePlans, "live", "2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z");
    expect(resAugust.grossRevenue).toBe(100);
    expect(resAugust.paidCount).toBe(1);
  });

  it("Cenário O: Valor já líquido do desconto não sofre desconto duplicado", () => {
    // Ordem armazenada com amount_cents = 8000 (R$ 80). Preço base = R$ 100.
    // Bruto = 100. Desconto = 20. Líquido = 100 - 20 = 80.
    // NUNCA deve calcular 80 - 20 = 60!
    const orders: MockOrder[] = [
      {
        id: "ord_no_double_sub",
        user_id: "u15",
        plan_id: "plan_basic",
        environment: "live",
        amount_cents: 8000,
        cycle: "monthly",
        status: "paid",
        credited_at: "2026-09-06T10:00:00Z",
        revoked_at: null,
        created_at: "2026-09-06T09:00:00Z",
      },
    ];

    const res = calculateSaasMetrics(orders, samplePlans, "live");
    expect(res.grossRevenue).toBe(100);
    expect(res.appDiscounts).toBe(20);
    expect(res.netRevenue).toBe(80);
    expect(res.netRevenue).not.toBe(60); // Garantia absoluta de não duplicação
  });

  it("Reconciliação Geral Obrigatória: Bruto - Descontos - Estornos = Líquido (Diferença: R$ 0,00)", () => {
    const complexOrders: MockOrder[] = [
      { id: "o1", user_id: "u1", plan_id: "plan_pro", environment: "live", amount_cents: 216000, cycle: "annual", status: "paid", credited_at: "2026-09-01T10:00:00Z", revoked_at: null, created_at: "2026-09-01T09:00:00Z" },
      { id: "o2", user_id: "u2", plan_id: "plan_basic", environment: "live", amount_cents: 57000, cycle: "semestral", status: "paid", credited_at: "2026-09-02T10:00:00Z", revoked_at: null, created_at: "2026-09-02T09:00:00Z" },
      { id: "o3", user_id: "u3", plan_id: "plan_basic", environment: "live", amount_cents: 10000, cycle: "monthly", status: "paid", credited_at: "2026-09-03T10:00:00Z", revoked_at: null, created_at: "2026-09-03T09:00:00Z" },
      { id: "o4", user_id: "u4", plan_id: "plan_pro", environment: "live", amount_cents: 20000, cycle: "monthly", status: "refunded", credited_at: null, revoked_at: "2026-09-04T10:00:00Z", created_at: "2026-09-04T09:00:00Z" },
    ];

    const res = calculateSaasMetrics(complexOrders, samplePlans, "live");
    const expectedGross = 2400 + 600 + 100; // 3100
    const expectedDiscounts = 240 + 30 + 0; // 270
    const expectedRefunds = 200;
    const expectedNet = expectedGross - expectedDiscounts - expectedRefunds; // 3100 - 270 - 200 = 2630

    expect(res.grossRevenue).toBe(expectedGross);
    expect(res.appDiscounts).toBe(expectedDiscounts);
    expect(res.refundsAmount).toBe(expectedRefunds);
    expect(res.netRevenue).toBe(expectedNet);

    const diff = res.grossRevenue - res.appDiscounts - res.refundsAmount - res.netRevenue;
    expect(Math.abs(diff)).toBe(0);
  });
});
