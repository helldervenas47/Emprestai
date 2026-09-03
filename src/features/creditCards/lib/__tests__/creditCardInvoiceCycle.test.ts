import { describe, it, expect } from "vitest";
import { getCardInvoiceTotalsForMonth } from "@/features/creditCards/lib/creditCardInvoiceTotals";

const card: any = { id: "11111111-1111-1111-1111-111111111111", nickname: "Itaú", lastFour: "3811", closingDay: 3, dueDay: 10, creditLimit: 1500, active: true };
const mk = (id: string, due: string, amount: number, extra: any = {}) => ({
  id, description: "x", amount, category: "Alimentação", type: "fixa", dueDate: due, paid: false,
  notes: `[Crédito] Cartão: Itaú {ID:${card.id}}`, scope: "personal", createdAt: due, ...extra,
});

describe("fatura por ciclo", () => {
  const expenses: any[] = [
    mk("a", "2026-07-19", 88),   // ciclo anterior (fatura 08)
    mk("b", "2026-08-16", 48.35),// ciclo atual (03/08 -> 03/09) => vence 10/09
    mk("c", "2026-08-21", 20),   // ciclo atual
    mk("d", "2026-09-04", 30),   // após fechamento => próximo ciclo (10/10)
    mk("e", "2026-08-30", 100, { notes: "[Crédito] Cartão: Nubank {ID:22222222-2222-2222-2222-222222222222}" }),
    // parcelada 3x de 90 iniciando 10/08
    mk("f", "2026-08-10", 270, { type: "recorrente", installments: 3, paidInstallments: 0 }),
  ];
  const totals = (m: string) => getCardInvoiceTotalsForMonth(expenses, [card], [], m);

  it("setembro = itens do ciclo 03/08–03/09 + 1ª parcela", () => {
    expect(totals("2026-09")[0].total).toBeCloseTo(48.35 + 20 + 90, 2);
  });
  it("agosto = apenas o item de 19/07", () => {
    expect(totals("2026-08")[0].total).toBeCloseTo(88, 2);
  });
  it("outubro = item pós-fechamento + 2ª parcela", () => {
    expect(totals("2026-10")[0].total).toBeCloseTo(30 + 90, 2);
  });
  it("nenhuma despesa em duas faturas", () => {
    const soma = ["2026-08","2026-09","2026-10","2026-11","2026-12"].reduce((s,m)=>s+(totals(m)[0]?.total??0),0);
    expect(soma).toBeCloseTo(88+48.35+20+30+270, 2);
  });
});
