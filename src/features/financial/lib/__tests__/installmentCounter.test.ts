import { describe, it, expect } from "vitest";
import { getInstallmentNumberForMonth, withSeriesStart, withHealedSeriesStart } from "@/features/financial/lib/installmentEdit";

const parent: any = { id:"p", description:"Parcela Carro", amount:5000, type:"recorrente", category:"t", installments:5, paidInstallments:2, dueDate:"2026-10-28", paid:false, createdAt:"", notes: withSeriesStart(null,"2026-08-28") };

describe("counter", () => {
  it("segue posição cronológica", () => {
    expect(getInstallmentNumberForMonth(parent,"2026-08")).toBe(1);
    expect(getInstallmentNumberForMonth(parent,"2026-09")).toBe(2);
    expect(getInstallmentNumberForMonth(parent,"2026-12")).toBe(5);
  });
  it("cura legado via filhos", () => {
    const legacy: any = { ...parent, notes: undefined, paidInstallments: 2, dueDate: "2026-09-28" };
    const child: any = { id:"c", description:"Parcela Carro (1/5)", dueDate:"2026-08-28", installments:null, parentExpenseId:"p", type:"fixa", paid:true, amount:1000, category:"t", createdAt:"" };
    const healed = withHealedSeriesStart([legacy, child]);
    expect(getInstallmentNumberForMonth(healed[0],"2026-08")).toBe(1);
    expect(getInstallmentNumberForMonth(healed[0],"2026-09")).toBe(2);
  });
});
