import { describe, it, expect } from "vitest";

describe("SaaS Financial Analytics & Revenue Integrity", () => {
  // 1. Consistência Matemática: Bruto - Estornos = Líquido
  it("A. Valida que Receita Líquida é estritamente Bruto menos Estornos e Chargebacks", () => {
    const grossRevenue = 18430.00;
    const refundsAmount = 540.00;
    const netRevenue = grossRevenue - refundsAmount;

    expect(netRevenue).toBe(17890.00);
    expect(grossRevenue).toBeGreaterThanOrEqual(netRevenue);
  });

  // 2. Ticket Médio
  it("B. Calcula o ticket médio corretamente e trata divisão por zero", () => {
    const calcAvgTicket = (gross: number, count: number) => {
      if (count <= 0) return 0;
      return Math.round((gross / count) * 100) / 100;
    };

    expect(calcAvgTicket(10000, 10)).toBe(1000);
    expect(calcAvgTicket(970, 3)).toBe(323.33);
    expect(calcAvgTicket(0, 0)).toBe(0);
    expect(calcAvgTicket(500, 0)).toBe(0);
  });

  // 3. Variação Percentual Mês a Mês
  it("C. Calcula o crescimento mensal tratando mês anterior zerado", () => {
    const calcGrowthPct = (current: number, previous: number) => {
      if (previous > 0) {
        return Math.round(((current - previous) / previous) * 1000) / 10;
      }
      if (current > 0) return 100.0;
      return 0.0;
    };

    // Crescimento normal
    expect(calcGrowthPct(18430, 15570)).toBe(18.4);
    // Queda normal
    expect(calcGrowthPct(9280, 10000)).toBe(-7.2);
    // Mês anterior zerado com faturamento atual
    expect(calcGrowthPct(5000, 0)).toBe(100.0);
    // Ambos zerados
    expect(calcGrowthPct(0, 0)).toBe(0.0);
  });

  // 4. Normalização de MRR por Ciclo
  it("D. Normaliza corretamente o MRR para planos Mensal, Semestral e Anual", () => {
    const normalizeMRR = (orders: { cycle: string; amount: number }[]) => {
      return orders.reduce((sum, o) => {
        if (o.cycle === "annual") return sum + (o.amount / 12);
        if (o.cycle === "semestral") return sum + (o.amount / 6);
        return sum + o.amount;
      }, 0);
    };

    const activeOrders = [
      { cycle: "monthly", amount: 97.00 },
      { cycle: "monthly", amount: 149.00 },
      { cycle: "semestral", amount: 582.00 }, // 582 / 6 = 97.00
      { cycle: "annual", amount: 1164.00 },  // 1164 / 12 = 97.00
    ];

    const totalMRR = normalizeMRR(activeOrders);
    expect(totalMRR).toBe(440.00); // 97 + 149 + 97 + 97 = 440
  });

  // 5. ARPU (Receita Média por Assinante Ativo)
  it("E. Calcula o ARPU baseado em MRR e contagem de assinantes ativos", () => {
    const calcARPU = (mrr: number, activeCount: number) => {
      if (activeCount <= 0) return 0;
      return Math.round((mrr / activeCount) * 100) / 100;
    };

    expect(calcARPU(440, 4)).toBe(110.00);
    expect(calcARPU(1000, 0)).toBe(0);
  });

  // 6. Consistência de Agregação: Soma Diária == Faturamento do Período
  it("F. Garante que a soma do faturamento diário fecha 100% com o total do período", () => {
    const dailyEvolution = [
      { date: "2026-09-01", gross: 1200.00, refunds: 0, net: 1200.00, count: 4 },
      { date: "2026-09-02", gross: 2500.00, refunds: 150.00, net: 2350.00, count: 8 },
      { date: "2026-09-03", gross: 980.00, refunds: 0, net: 980.00, count: 3 },
    ];

    const periodGross = dailyEvolution.reduce((s, d) => s + d.gross, 0);
    const periodRefunds = dailyEvolution.reduce((s, d) => s + d.refunds, 0);
    const periodNet = dailyEvolution.reduce((s, d) => s + d.net, 0);

    expect(periodGross).toBe(4680.00);
    expect(periodRefunds).toBe(150.00);
    expect(periodNet).toBe(4530.00);
    expect(periodGross - periodRefunds).toBe(periodNet);
  });

  // 7. Consistência de Distribuição: Soma por Plano == Faturamento do Período
  it("G. Garante que a soma da receita por planos fecha com o faturamento bruto", () => {
    const totalGross = 10000.00;
    const plansDistribution = [
      { plan_name: "Básico", gross: 2900.00, count: 30, percentage: 29.0 },
      { plan_name: "Profissional", gross: 4500.00, count: 30, percentage: 45.0 },
      { plan_name: "Empresarial", gross: 2600.00, count: 10, percentage: 26.0 },
    ];

    const sumPlanGross = plansDistribution.reduce((s, p) => s + p.gross, 0);
    const sumPlanPct = plansDistribution.reduce((s, p) => s + p.percentage, 0);

    expect(sumPlanGross).toBe(totalGross);
    expect(sumPlanPct).toBe(100.0);
  });

  // 8. Isolamento de Ambiente Live vs Sandbox
  it("H. Transações sandbox não devem ser somadas no faturamento Live", () => {
    const orders = [
      { id: "1", environment: "live", status: "paid", amount: 149.00 },
      { id: "2", environment: "sandbox", status: "paid", amount: 5000.00 }, // Teste fake
      { id: "3", environment: "live", status: "paid", amount: 97.00 },
    ];

    const liveTotal = orders
      .filter(o => o.environment === "live" && o.status === "paid")
      .reduce((s, o) => s + o.amount, 0);

    expect(liveTotal).toBe(246.00);
  });

  // 9. Competência por Data de Confirmação (credited_at)
  it("I. Cobrança criada no mês anterior mas confirmada no mês atual entra no mês atual", () => {
    const orders = [
      {
        id: "1",
        created_at: "2026-08-31T23:50:00-03:00",
        credited_at: "2026-09-01T08:15:00-03:00", // Pago em Setembro
        amount: 200.00,
        status: "paid"
      }
    ];

    const filterMonth = (o: typeof orders[0], targetMonth: number, targetYear: number) => {
      const dt = new Date(o.credited_at);
      return dt.getMonth() === targetMonth && dt.getFullYear() === targetYear;
    };

    // Agosto (mês 7 no JS)
    expect(orders.filter(o => filterMonth(o, 7, 2026)).length).toBe(0);
    // Setembro (mês 8 no JS)
    expect(orders.filter(o => filterMonth(o, 8, 2026)).length).toBe(1);
  });
});
