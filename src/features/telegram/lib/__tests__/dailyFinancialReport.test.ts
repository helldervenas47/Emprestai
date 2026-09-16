import { describe, it, expect } from "vitest";
import {
  buildDailyFinancialData,
  formatDailyFinancialReportTelegram,
  isVehicleExpense,
  fmtBRL,
  fmtDateBR,
} from "../dailyFinancialReport";

describe("Relatório Financeiro Diário — Telegram", () => {
  const TEST_DATE = "2026-09-15";

  // Cenário 1: Movimentações em todos os 6 módulos simultaneamente
  it("Cenário 1: consolida movimentações em todos os 6 módulos simultaneamente", () => {
    const incomes = [
      {
        id: "inc-1",
        description: "Consultoria Financeira",
        amount: 500,
        status: "received",
        received_date: TEST_DATE,
      },
    ];

    const sales = [
      // Vendas
      {
        id: "sale-1",
        customer_name: "João Silva",
        description: "Smartphone Pro",
        business_type: "venda",
        payment_history: [{ date: TEST_DATE, amount: 1200 }],
      },
      // Veículos (Receitas)
      {
        id: "sale-2",
        customer_name: "Carlos Locações",
        description: "Locação Onix Sedan",
        business_type: "aluguel_veiculo",
        payment_history: [{ date: TEST_DATE, amount: 650 }],
      },
    ];

    const expenses = [
      // Despesa Pessoal
      {
        id: "exp-1",
        description: "Supermercado Mensal",
        amount: 350,
        scope: "personal",
        category: "Alimentação",
        paid: true,
        paid_date: TEST_DATE,
      },
      // Despesa Empresarial
      {
        id: "exp-2",
        description: "Internet Fibra",
        amount: 150,
        scope: "business",
        category: "Serviços",
        paid: true,
        paid_date: TEST_DATE,
      },
      // Despesa de Veículo
      {
        id: "exp-3",
        description: "Troca de Óleo e Filtro",
        amount: 220,
        scope: "business",
        category: "Manutenção",
        paid: true,
        paid_date: TEST_DATE,
      },
    ];

    const data = buildDailyFinancialData({
      date: TEST_DATE,
      incomes,
      sales,
      expenses,
    });

    expect(data.hasMovements).toBe(true);
    expect(data.incomes.financial.subtotal).toBe(500);
    expect(data.incomes.sales.subtotal).toBe(1200);
    expect(data.incomes.vehicles.subtotal).toBe(650);
    expect(data.incomes.total).toBe(2350);

    expect(data.expenses.personal.subtotal).toBe(350);
    expect(data.expenses.business.subtotal).toBe(150);
    expect(data.expenses.vehicles.subtotal).toBe(220);
    expect(data.expenses.total).toBe(720);

    expect(data.balance).toBe(1630); // 2350 - 720

    const formatted = formatDailyFinancialReportTelegram(data);
    expect(formatted).toContain("📊 *RELATÓRIO FINANCEIRO DO DIA — 15/09/2026*");
    expect(formatted).toContain("💰 *RECEITAS*");
    expect(formatted).toContain("*Financeiro*");
    expect(formatted).toContain("• Consultoria Financeira — R$ 500,00");
    expect(formatted).toContain("*Vendas*");
    expect(formatted).toContain("• João Silva — Smartphone Pro — R$ 1.200,00");
    expect(formatted).toContain("*Veículos*");
    expect(formatted).toContain("• Carlos Locações — Locação Onix Sedan — R$ 650,00");
    expect(formatted).toContain("💸 *DESPESAS*");
    expect(formatted).toContain("*Pessoais*");
    expect(formatted).toContain("• Supermercado Mensal — R$ 350,00");
    expect(formatted).toContain("*Empresariais*");
    expect(formatted).toContain("• Internet Fibra — R$ 150,00");
    expect(formatted).toContain("📌 *RESUMO DO DIA*");
    expect(formatted).toContain("Receitas: *R$ 2.350,00*");
    expect(formatted).toContain("Despesas: *R$ 720,00*");
    expect(formatted).toContain("Saldo: *R$ 1.630,00*");
  });

  // Cenário 2: Movimentações em apenas alguns módulos (exemplo do prompt do usuário)
  it("Cenário 2: omite módulos sem movimentação no dia", () => {
    const incomes = [
      { description: "Pagamento João", amount: 500, status: "received", received_date: TEST_DATE },
      { description: "Pagamento Carlos", amount: 300, status: "received", received_date: TEST_DATE },
    ];

    const sales = [
      // Apenas Veículos, sem vendas normais
      {
        customer_name: "",
        description: "Parcela veículo",
        business_type: "aluguel_veiculo",
        payment_history: [{ date: TEST_DATE, amount: 650 }],
      },
    ];

    const expenses = [
      // Apenas Empresariais
      { description: "Internet", amount: 120, scope: "business", category: "TI", paid: true, paid_date: TEST_DATE },
      { description: "Material de escritório", amount: 80, scope: "business", category: "Geral", paid: true, paid_date: TEST_DATE },
    ];

    const data = buildDailyFinancialData({ date: TEST_DATE, incomes, sales, expenses });
    const formatted = formatDailyFinancialReportTelegram(data);

    // Módulos ativos devem aparecer
    expect(formatted).toContain("*Financeiro*");
    expect(formatted).toContain("Subtotal: *R$ 800,00*");
    expect(formatted).toContain("*Veículos*");
    expect(formatted).toContain("Subtotal: *R$ 650,00*");
    expect(formatted).toContain("*Empresariais*");
    expect(formatted).toContain("Subtotal: *R$ 200,00*");

    // Módulos inativos NÃO devem aparecer
    expect(data.incomes.sales.items.length).toBe(0);
    expect(data.expenses.personal.items.length).toBe(0);
    expect(data.expenses.vehicles.items.length).toBe(0);
    expect(formatted).not.toContain("*Vendas*");
    expect(formatted).not.toContain("*Pessoais*");
    expect(formatted).not.toContain("R$ 0,00");

    // Resumo
    expect(data.incomes.total).toBe(1450);
    expect(data.expenses.total).toBe(200);
    expect(data.balance).toBe(1250);
  });

  // Cenário 3: Apenas receitas registradas no dia (seção Despesas não aparece)
  it("Cenário 3: apenas receitas (seção Despesas omitida)", () => {
    const incomes = [
      { description: "Aporte Financeiro", amount: 1000, status: "received", received_date: TEST_DATE },
    ];

    const data = buildDailyFinancialData({ date: TEST_DATE, incomes, sales: [], expenses: [] });
    const formatted = formatDailyFinancialReportTelegram(data);

    expect(formatted).toContain("💰 *RECEITAS*");
    expect(formatted).toContain("*Financeiro*");
    expect(formatted).not.toContain("💸 *DESPESAS*");
    expect(formatted).toContain("Receitas: *R$ 1.000,00*");
    expect(formatted).toContain("Despesas: *R$ 0,00*");
    expect(formatted).toContain("Saldo: *R$ 1.000,00*");
  });

  // Cenário 4: Apenas despesas registradas no dia (seção Receitas não aparece)
  it("Cenário 4: apenas despesas (seção Receitas omitida)", () => {
    const expenses = [
      { description: "Aluguel Sala", amount: 1200, scope: "business", category: "Instalações", paid: true, paid_date: TEST_DATE },
    ];

    const data = buildDailyFinancialData({ date: TEST_DATE, incomes: [], sales: [], expenses });
    const formatted = formatDailyFinancialReportTelegram(data);

    expect(formatted).not.toContain("💰 *RECEITAS*");
    expect(formatted).toContain("💸 *DESPESAS*");
    expect(formatted).toContain("*Empresariais*");
    expect(formatted).toContain("Receitas: *R$ 0,00*");
    expect(formatted).toContain("Despesas: *R$ 1.200,00*");
    expect(formatted).toContain("Saldo: *-R$ 1.200,00*");
  });

  // Cenário 5: Nenhuma movimentação no dia
  it("Cenário 5: nenhuma movimentação no dia", () => {
    const data = buildDailyFinancialData({ date: TEST_DATE, incomes: [], sales: [], expenses: [] });
    expect(data.hasMovements).toBe(false);
    expect(data.incomes.total).toBe(0);
    expect(data.expenses.total).toBe(0);
    expect(data.balance).toBe(0);

    const formatted = formatDailyFinancialReportTelegram(data);
    expect(formatted).toContain("_Nenhuma movimentação registrada no dia de hoje._");
    expect(formatted).not.toContain("💰 *RECEITAS*");
    expect(formatted).not.toContain("💸 *DESPESAS*");
  });

  // Cenário 6: Múltiplos registros dentro do mesmo módulo
  it("Cenário 6: múltiplos registros dentro do mesmo módulo com cálculo correto de subtotais", () => {
    const incomes = [
      { description: "Pix 1", amount: 100.5, status: "received", received_date: TEST_DATE },
      { description: "Pix 2", amount: 250.75, status: "received", received_date: TEST_DATE },
      { description: "Boleto 1", amount: 300.25, status: "received", received_date: TEST_DATE },
    ];

    const data = buildDailyFinancialData({ date: TEST_DATE, incomes, sales: [], expenses: [] });
    expect(data.incomes.financial.items.length).toBe(3);
    expect(data.incomes.financial.subtotal).toBe(651.5);
    expect(data.incomes.total).toBe(651.5);

    const formatted = formatDailyFinancialReportTelegram(data);
    expect(formatted).toContain("• Pix 1 — R$ 100,50");
    expect(formatted).toContain("• Pix 2 — R$ 250,75");
    expect(formatted).toContain("• Boleto 1 — R$ 300,25");
    expect(formatted).toContain("Subtotal: *R$ 651,50*");
  });

  // Cenário 7: Registros em outras datas são devidamente ignorados
  it("Cenário 7: ignora registros com datas diferentes da data de referência", () => {
    const incomes = [
      { description: "Receita de Ontem", amount: 500, status: "received", received_date: "2026-09-14" },
      { description: "Receita de Hoje", amount: 200, status: "received", received_date: "2026-09-15" },
      { description: "Receita de Amanhã", amount: 700, status: "received", received_date: "2026-09-16" },
    ];

    const expenses = [
      { description: "Despesa Passada", amount: 150, paid: true, paid_date: "2026-09-14" },
      { description: "Despesa Hoje", amount: 80, paid: true, paid_date: "2026-09-15" },
    ];

    const data = buildDailyFinancialData({ date: TEST_DATE, incomes, sales: [], expenses });
    expect(data.incomes.financial.items.length).toBe(1);
    expect(data.incomes.financial.items[0].description).toBe("Receita de Hoje");
    expect(data.incomes.total).toBe(200);

    expect(data.expenses.business.items.length).toBe(1);
    expect(data.expenses.business.items[0].description).toBe("Despesa Hoje");
    expect(data.expenses.total).toBe(80);
    expect(data.balance).toBe(120);
  });

  // Cenário 8: Inclui lançamentos pendentes (a vencer ou previstos para o dia)
  it("Cenário 8: inclui lançamentos pendentes do dia (não apenas pagos)", () => {
    const incomes = [
      { description: "Receita Prevista Hoje", amount: 400, status: "pending", received_date: TEST_DATE },
    ];

    const expenses = [
      { description: "Boleto a Vencer Hoje", amount: 250, scope: "business", category: "Geral", paid: false, due_date: TEST_DATE },
    ];

    const data = buildDailyFinancialData({ date: TEST_DATE, incomes, sales: [], expenses });
    expect(data.incomes.financial.items.length).toBe(1);
    expect(data.incomes.financial.items[0].description).toBe("Receita Prevista Hoje");
    expect(data.incomes.total).toBe(400);

    expect(data.expenses.business.items.length).toBe(1);
    expect(data.expenses.business.items[0].description).toBe("Boleto a Vencer Hoje");
    expect(data.expenses.total).toBe(250);
    expect(data.balance).toBe(150);
  });

  // Cenário 9: Despesas parceladas e fixas recorrentes trazem o valor mensal/parcela e não o montante total
  it("Cenário 9: despesas parceladas trazem o valor mensal da parcela (amount / installments)", () => {
    const expenses = [
      // Despesa parcelada em 10x de R$ 100 (amount total gravado = 1000)
      {
        description: "Compra Equipamento (10x)",
        amount: 1000,
        installments: 10,
        type: "recorrente",
        scope: "business",
        category: "Equipamentos",
        paid: false,
        due_date: TEST_DATE,
      },
      // Despesa fixa mensal contínua (amount gravado = 50 * 999 = 49950)
      {
        description: "Assinatura Software",
        amount: 49950,
        installments: 999,
        type: "recorrente",
        scope: "personal",
        category: "Assinaturas",
        paid: false,
        due_date: TEST_DATE,
      },
      // Despesa filha (já paga) onde amount já é o valor unitário
      {
        description: "Parcela Paga de Consultoria",
        amount: 120,
        installments: 5,
        parent_expense_id: "parent-123",
        scope: "business",
        category: "Serviços",
        paid: true,
        paid_date: TEST_DATE,
      },
    ];

    const data = buildDailyFinancialData({ date: TEST_DATE, incomes: [], sales: [], expenses });
    expect(data.expenses.business.items.length).toBe(2);
    expect(data.expenses.business.items.find((i) => i.description === "Compra Equipamento (10x)")?.amount).toBe(100);
    expect(data.expenses.business.items.find((i) => i.description === "Parcela Paga de Consultoria")?.amount).toBe(120);

    expect(data.expenses.personal.items.length).toBe(1);
    expect(data.expenses.personal.items[0].amount).toBe(50);

    expect(data.expenses.total).toBe(270);
  });

  // Cenário 10: Vendas parceladas trazem o valor da parcela quando sem histórico específico do dia
  it("Cenário 10: vendas parceladas trazem o valor da parcela mensal", () => {
    const sales = [
      {
        customer_name: "Cliente Teste",
        description: "Venda Celular (10x)",
        total: 2000,
        installments: 10,
        sale_date: TEST_DATE,
        business_type: "venda",
      },
    ];

    const data = buildDailyFinancialData({ date: TEST_DATE, incomes: [], sales, expenses: [] });
    expect(data.incomes.sales.items.length).toBe(1);
    expect(data.incomes.sales.items[0].amount).toBe(200);
    expect(data.incomes.total).toBe(200);
  });

  // Cenário 11: Faturas de cartão de crédito aparecem nas despesas pessoais
  it("Cenário 11: faturas de cartão de crédito aparecem nas despesas pessoais", () => {
    const ledgerRows = [
      {
        description: "Pagamento fatura Nubank",
        amount: 850.50,
        direction: "out",
        category: "expense",
        occurred_on: TEST_DATE,
        metadata: { kind: "credit_card_invoice_payment", credit_card_id: "card-1" },
      },
    ];

    const openings = [
      {
        card_id: "card-2",
        cycle_key: "2026-09",
        opening_amount: 420.00,
        notes: `[PAGA] [PAID_DATE:${TEST_DATE}] [PAID:420.00]`,
      },
    ];

    const creditCards = [
      { id: "card-1", nickname: "Nubank", bank: "Nubank" },
      { id: "card-2", nickname: "Itaú Black", bank: "Itaú" },
    ];

    const data = buildDailyFinancialData({
      date: TEST_DATE,
      incomes: [],
      sales: [],
      expenses: [],
      ledgerRows,
      openings,
      creditCards,
    } as any);

    expect(data.expenses.personal.items.length).toBe(2);
    expect(data.expenses.personal.items.find((i) => i.description === "Pagamento fatura Nubank")?.amount).toBe(850.5);
    expect(data.expenses.personal.items.find((i) => i.description === "Fatura Itaú Black")?.amount).toBe(420);
    expect(data.expenses.personal.subtotal).toBe(1270.5);
    expect(data.expenses.total).toBe(1270.5);
  });
});

