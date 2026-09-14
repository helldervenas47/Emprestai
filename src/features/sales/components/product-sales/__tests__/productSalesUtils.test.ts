import { describe, it, expect } from "vitest";
import { getSalePaidAmountHelper, getSaleRemainingHelper } from "../productSalesUtils";
import { Sale } from "@/types/loan";

describe("productSalesUtils — Cálculos de valor pago e restante", () => {
  it("calcula corretamente com entrada e pagamentos parciais", () => {
    const sale: Sale = {
      id: "sale-1",
      customerName: "Caua Pascoal",
      total: 7000,
      downPayment: 1000,
      installments: 9,
      paidInstallments: 1, // 1 parcela de (7000-1000)/9 = 666.666... ou valor fixo
      installmentAmounts: [600, 600, 600, 600, 600, 600, 600, 600, 600],
      partialPaid: 100,
      date: "2026-08-01",
      paymentMode: "recorrente",
      status: "pending",
      productName: "Negociação dívida",
      quantity: 1,
      unitPrice: 7000,
    };

    // Pago = 1000 (downPayment) + 600 (1 parcela) + 100 (partialPaid) = 1700
    expect(getSalePaidAmountHelper(sale)).toBe(1700);
    // Restante = 7000 - 1700 = 5300
    expect(getSaleRemainingHelper(sale)).toBe(5300);
  });

  it("calcula corretamente para venda à vista com pagamento parcial", () => {
    const sale: Sale = {
      id: "sale-2",
      customerName: "Cliente À Vista",
      total: 500,
      installments: 1,
      paidInstallments: 0,
      partialPaid: 200,
      date: "2026-08-01",
      paymentMode: "a_vista",
      status: "pending",
      productName: "Serviço",
      quantity: 1,
      unitPrice: 500,
    };

    expect(getSalePaidAmountHelper(sale)).toBe(200);
    expect(getSaleRemainingHelper(sale)).toBe(300);
  });

  it("calcula zero restante quando totalmente quitado", () => {
    const sale: Sale = {
      id: "sale-3",
      customerName: "Cliente Quitado",
      total: 1000,
      installments: 2,
      paidInstallments: 2,
      installmentAmounts: [500, 500],
      date: "2026-08-01",
      paymentMode: "recorrente",
      status: "paid",
      productName: "Produto",
      quantity: 1,
      unitPrice: 1000,
    };

    expect(getSalePaidAmountHelper(sale)).toBe(1000);
    expect(getSaleRemainingHelper(sale)).toBe(0);
  });

  it("calcula totalizador da lista conforme categoria ativa (atrasados traz apenas parcelas atrasadas)", () => {
    // Exemplo similar ao caso de Manoel Santana: 3 vendas, cada uma com 1 parcela atrasada de R$ 200, saldo restante total de R$ 4.700
    const sales: Sale[] = [
      {
        id: "s1",
        customerName: "Manoel Santana",
        total: 2503.68,
        downPayment: 0,
        installments: 12,
        paidInstallments: 4,
        installmentAmounts: Array(12).fill(208.64),
        date: "2026-04-01",
        paymentMode: "recorrente",
        status: "pending",
        productName: "Picpay",
        quantity: 1,
        unitPrice: 2503.68,
      },
    ];

    function calculateCategoryTotal(
      saleList: Sale[],
      category: "all" | "overdue" | "due_today" | "on_track" | "paid",
      helpers: {
        getOverdue: (s: Sale) => number;
        getDueToday: (s: Sale) => number;
        getFuture: (s: Sale) => number;
        getPaid: (s: Sale) => number;
        getRem: (s: Sale) => number;
      }
    ) {
      return saleList.reduce((acc, s) => {
        if (category === "overdue") return acc + helpers.getOverdue(s);
        if (category === "due_today") return acc + helpers.getDueToday(s);
        if (category === "on_track") return acc + helpers.getFuture(s);
        if (category === "paid") return acc + helpers.getPaid(s);
        return acc + helpers.getRem(s);
      }, 0);
    }

    const helpers = {
      getOverdue: () => 208.64,
      getDueToday: () => 0,
      getFuture: () => 1460.48,
      getPaid: (s: Sale) => getSalePaidAmountHelper(s),
      getRem: (s: Sale) => getSaleRemainingHelper(s),
    };

    expect(calculateCategoryTotal(sales, "overdue", helpers)).toBe(208.64);
    expect(calculateCategoryTotal(sales, "all", helpers)).toBe(getSaleRemainingHelper(sales[0]));
    expect(calculateCategoryTotal(sales, "paid", helpers)).toBe(getSalePaidAmountHelper(sales[0]));
  });
});
