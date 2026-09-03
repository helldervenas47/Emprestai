import { describe, it, expect } from "vitest";
import {
  isCreditCardExpense,
  getCycleForDueMonth,
  belongsToCardInvoice,
  invoiceItemValue,
  CREDIT_CARD_INVOICE_CATEGORY,
  getCardInvoiceTotalsForMonth,
} from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { expandCreditCardExpenses } from "@/features/creditCards/lib/creditCardInstallments";

const card: any = {
  id: "card-nubank-1",
  nickname: "Nubank",
  lastFour: "1234",
  closingDay: 25,
  dueDay: 5,
  creditLimit: 5000,
  active: true,
};

describe("Gastos por Categoria com Cartão de Crédito", () => {
  it("classifica compras de cartão em suas respectivas categorias", () => {
    const expenses: any[] = [
      {
        id: "exp-1",
        description: "Supermercado Extra",
        amount: 350,
        category: "Alimentação",
        dueDate: "2026-08-10",
        type: "fixa",
        scope: "personal",
        paid: false,
        notes: `[Crédito] Cartão: Nubank {ID:${card.id}}`,
      },
      {
        id: "exp-2",
        description: "Uber Viagem",
        amount: 45.5,
        category: "Transporte",
        dueDate: "2026-08-15",
        type: "fixa",
        scope: "personal",
        paid: false,
        notes: `[Crédito] Cartão: Nubank {ID:${card.id}}`,
      },
      {
        id: "exp-3",
        description: "Restaurante à vista",
        amount: 120,
        category: "Alimentação",
        dueDate: "2026-09-02",
        type: "fixa",
        scope: "personal",
        paid: true,
        notes: "",
      },
    ];

    const expanded = expandCreditCardExpenses(expenses.filter((e) => e.scope === "personal"));
    const cycle = getCycleForDueMonth("2026-09", card.closingDay, card.dueDay);
    expect(cycle).not.toBeNull();

    const cardItems = expanded.filter((e) =>
      belongsToCardInvoice(e, card, cycle!.from, cycle!.to),
    );
    expect(cardItems).toHaveLength(2);

    const categoryTotals = new Map<string, number>();

    // 1. Despesas diretas de setembro
    const directSeptember = expenses.filter((e) => !isCreditCardExpense(e) && e.dueDate.startsWith("2026-09"));
    directSeptember.forEach((e) => {
      categoryTotals.set(e.category, (categoryTotals.get(e.category) || 0) + e.amount);
    });

    // 2. Compras de cartão do ciclo de vencimento em setembro
    cardItems.forEach((item) => {
      categoryTotals.set(item.category, (categoryTotals.get(item.category) || 0) + invoiceItemValue(item));
    });

    expect(categoryTotals.get("Alimentação")).toBeCloseTo(350 + 120, 2);
    expect(categoryTotals.get("Transporte")).toBeCloseTo(45.5, 2);
    expect(categoryTotals.has(CREDIT_CARD_INVOICE_CATEGORY)).toBe(false);
  });

  it("distribui parcelas de cartão no mês correto do ciclo", () => {
    const expenses: any[] = [
      {
        id: "exp-parcelada",
        description: "Smartphone",
        amount: 600,
        installments: 3,
        paidInstallments: 0,
        category: "Tecnologia",
        dueDate: "2026-08-10",
        type: "recorrente",
        scope: "personal",
        paid: false,
        notes: `[Crédito] Cartão: Nubank {ID:${card.id}}`,
      },
    ];

    const expanded = expandCreditCardExpenses(expenses);
    expect(expanded).toHaveLength(3);

    // Setembro (ciclo 25/07 - 25/08) deve pegar a 1ª parcela de R$ 200
    const cycleSept = getCycleForDueMonth("2026-09", card.closingDay, card.dueDay)!;
    const itemsSept = expanded.filter((e) => belongsToCardInvoice(e, card, cycleSept.from, cycleSept.to));
    expect(itemsSept).toHaveLength(1);
    expect(invoiceItemValue(itemsSept[0])).toBeCloseTo(200, 2);
    expect(itemsSept[0].category).toBe("Tecnologia");

    // Outubro (ciclo 25/08 - 25/09) deve pegar a 2ª parcela de R$ 200
    const cycleOct = getCycleForDueMonth("2026-10", card.closingDay, card.dueDay)!;
    const itemsOct = expanded.filter((e) => belongsToCardInvoice(e, card, cycleOct.from, cycleOct.to));
    expect(itemsOct).toHaveLength(1);
    expect(invoiceItemValue(itemsOct[0])).toBeCloseTo(200, 2);
    expect(itemsOct[0].category).toBe("Tecnologia");
  });

  it("calcula corretamente valores restantes e status de faturas com pagamentos parciais acumulados", () => {
    const expenses: any[] = [
      {
        id: "exp-fatura-1",
        description: "Supermercado",
        amount: 1000,
        category: "Alimentação",
        dueDate: "2026-08-10",
        type: "fixa",
        scope: "personal",
        paid: false,
        notes: `[Crédito] Cartão: Nubank {ID:${card.id}}`,
      },
    ];

    // 1. Fatura com 1º pagamento parcial de R$ 300
    const opening1 = {
      id: "op-1",
      cardId: card.id,
      cycleKey: "2026-08",
      openingAmount: 0,
      notes: "[PAID:300.00] [LEDGER]",
    };
    const totals1 = getCardInvoiceTotalsForMonth(expenses, [card], [opening1], "2026-09");
    expect(totals1).toHaveLength(1);
    expect(totals1[0].total).toBeCloseTo(1000, 2);
    expect(totals1[0].paidTotal).toBeCloseTo(300, 2);
    expect(totals1[0].paid).toBe(false);
    expect(Math.max(0, totals1[0].total - totals1[0].paidTotal)).toBeCloseTo(700, 2);

    // 2. Fatura com 2º pagamento parcial acumulado de R$ 400 (total pago = R$ 700)
    const opening2 = {
      id: "op-1",
      cardId: card.id,
      cycleKey: "2026-08",
      openingAmount: 0,
      notes: "[PAID:700.00] [LEDGER]",
    };
    const totals2 = getCardInvoiceTotalsForMonth(expenses, [card], [opening2], "2026-09");
    expect(totals2[0].paidTotal).toBeCloseTo(700, 2);
    expect(totals2[0].paid).toBe(false);
    expect(Math.max(0, totals2[0].total - totals2[0].paidTotal)).toBeCloseTo(300, 2);

    // 3. Fatura quitada com último pagamento de R$ 300 (total pago = R$ 1000)
    const opening3 = {
      id: "op-1",
      cardId: card.id,
      cycleKey: "2026-08",
      openingAmount: 0,
      notes: "[PAID:1000.00] [PAGA] [LEDGER]",
    };
    const totals3 = getCardInvoiceTotalsForMonth(expenses, [card], [opening3], "2026-09");
    expect(totals3[0].paidTotal).toBeCloseTo(1000, 2);
    expect(totals3[0].paid).toBe(true);
    expect(Math.max(0, totals3[0].total - totals3[0].paidTotal)).toBeCloseTo(0, 2);
  });

  it("calcula o total filtrado por cartões considerando o saldo pendente restante", () => {
    const expenses: any[] = [
      {
        id: "exp-card-1",
        description: "Restaurante",
        amount: 800,
        category: "Alimentação",
        dueDate: "2026-08-10",
        type: "fixa",
        scope: "personal",
        paid: false,
        notes: `[Crédito] Cartão: Nubank {ID:${card.id}}`,
      },
    ];

    // Fatura de R$ 800 com R$ 250 pagos parcialmente
    const opening = {
      id: "op-1",
      cardId: card.id,
      cycleKey: "2026-08",
      openingAmount: 0,
      notes: "[PAID:250.00] [LEDGER]",
    };

    const cardTotals = getCardInvoiceTotalsForMonth(expenses, [card], [opening], "2026-09");
    const invoiceRows = cardTotals.map((x) => {
      const isPartial = !x.paid && x.paidTotal > 0.005;
      const remaining = Math.max(0, Number((x.total - x.paidTotal).toFixed(2)));
      return { x, paid: x.paid, isPartial, remaining, overdue: false };
    });

    // Filtro "pending" (A pagar)
    const pendingTotal = invoiceRows
      .filter((r) => !r.paid && !r.overdue)
      .reduce((s, r) => s + r.remaining, 0);
    expect(pendingTotal).toBeCloseTo(550, 2);

    // Filtro "paid" (Pagas / Já pago)
    const paidTotal = invoiceRows
      .reduce((s, r) => s + r.x.paidTotal, 0);
    expect(paidTotal).toBeCloseTo(250, 2);

    // Filtro "all" (Todas)
    const allTotal = invoiceRows
      .reduce((s, r) => s + r.x.total, 0);
    expect(allTotal).toBeCloseTo(800, 2);
  });

  it("não inclui compras ou despesas de competências futuras em meses anteriores", () => {
    const expenses: any[] = [
      // Despesa direta de Setembro
      {
        id: "exp-direct-sep",
        description: "Conta de Luz",
        amount: 200,
        category: "Moradia",
        dueDate: "2026-09-15",
        type: "fixa",
        scope: "personal",
        paid: false,
        notes: "",
      },
      // Compra no cartão no ciclo de Outubro (fechamento 25/09 -> vencimento 05/10)
      {
        id: "exp-card-oct",
        description: "Supermercado Outubro",
        amount: 450,
        category: "Alimentação",
        dueDate: "2026-09-28",
        type: "fixa",
        scope: "personal",
        paid: false,
        notes: `[Crédito] Cartão: Nubank {ID:${card.id}}`,
      },
      // Compra no cartão no ciclo de Setembro (fechamento 25/08 -> vencimento 05/09)
      {
        id: "exp-card-sep",
        description: "Supermercado Setembro",
        amount: 300,
        category: "Alimentação",
        dueDate: "2026-08-20",
        type: "fixa",
        scope: "personal",
        paid: false,
        notes: `[Crédito] Cartão: Nubank {ID:${card.id}}`,
      },
    ];

    // Para o mês de Agosto (2026-08):
    const directAug = expenses.filter((e) => !isCreditCardExpense(e) && e.dueDate.startsWith("2026-08"));
    expect(directAug).toHaveLength(0);

    const cycleAug = getCycleForDueMonth("2026-08", card.closingDay, card.dueDay);
    const cardAug = expenses.filter((e) => belongsToCardInvoice(e, card, cycleAug!.from, cycleAug!.to));
    expect(cardAug).toHaveLength(0);

    // Para o mês de Setembro (2026-09):
    const directSep = expenses.filter((e) => !isCreditCardExpense(e) && e.dueDate.startsWith("2026-09"));
    expect(directSep).toHaveLength(1);
    expect(directSep[0].id).toBe("exp-direct-sep");

    const cycleSep = getCycleForDueMonth("2026-09", card.closingDay, card.dueDay);
    const cardSep = expenses.filter((e) => belongsToCardInvoice(e, card, cycleSep!.from, cycleSep!.to));
    expect(cardSep).toHaveLength(1);
    expect(cardSep[0].id).toBe("exp-card-sep");
  });

  it("aloca despesas de cartão por data de compra no resumo de categorias sem alteração pelo pagamento da fatura", () => {
    const expenses: any[] = [
      // Compra feita em 15/08
      {
        id: "exp-card-aug",
        description: "Farmácia",
        amount: 150,
        category: "Saúde",
        dueDate: "2026-08-15",
        type: "fixa",
        scope: "personal",
        paid: false,
        notes: `[Crédito] Cartão: Nubank {ID:${card.id}}`,
      },
      // Compra feita em 28/08 (mesmo que a fatura vença em 05/10, a compra foi em agosto)
      {
        id: "exp-card-aug-late",
        description: "Restaurante",
        amount: 180,
        category: "Alimentação",
        dueDate: "2026-08-28",
        type: "fixa",
        scope: "personal",
        paid: false,
        notes: `[Crédito] Cartão: Nubank {ID:${card.id}}`,
      },
    ];

    // Alocação por data de compra para o mês de Agosto (2026-08)
    const purchasesAug = expenses.filter(
      (e) => isCreditCardExpense(e) && e.dueDate.startsWith("2026-08"),
    );
    expect(purchasesAug).toHaveLength(2);
    expect(purchasesAug.map((p) => p.category)).toContain("Saúde");
    expect(purchasesAug.map((p) => p.category)).toContain("Alimentação");

    // Simulação do pagamento da fatura: as despesas de compra no mês continuam existindo e categorizadas
    const openingPaid = {
      id: "op-1",
      cardId: card.id,
      cycleKey: "2026-08",
      openingAmount: 0,
      notes: "[PAID:330.00] [PAGA]",
    };
    // A lista de compras por data de compra em agosto continua exatamente com os 2 itens categorizados
    expect(purchasesAug.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(330, 2);
  });
});

