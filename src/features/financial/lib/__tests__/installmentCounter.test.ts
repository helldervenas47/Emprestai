import { describe, it, expect } from "vitest";
import {
  getInstallmentNumberForMonth,
  withSeriesStart,
  withHealedSeriesStart,
  getSingleInstallmentAmount,
  withCustomInstallments,
} from "@/features/financial/lib/installmentEdit";

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
  it("mantém valor individual ao editar apenas uma parcela da série", () => {
    const edits = [
      { index: 0, dueDate: "2026-08-28", amount: 1000, paid: false, description: "Parcela Carro (1/5)" },
      { index: 1, dueDate: "2026-09-28", amount: 1500, paid: false, description: "Parcela Carro (2/5)" },
      { index: 2, dueDate: "2026-10-28", amount: 1000, paid: false, description: "Parcela Carro (3/5)" },
      { index: 3, dueDate: "2026-11-28", amount: 1000, paid: false, description: "Parcela Carro (4/5)" },
      { index: 4, dueDate: "2026-12-28", amount: 1000, paid: false, description: "Parcela Carro (5/5)" },
    ];
    const customNotes = withCustomInstallments(parent.notes, edits);
    const customizedParent = { ...parent, notes: customNotes, amount: 5500 };

    // Parcela 1 continua 1000
    expect(getSingleInstallmentAmount(customizedParent, "2026-08-28")).toBe(1000);
    // Parcela 2 alterada para 1500
    expect(getSingleInstallmentAmount(customizedParent, "2026-09-28")).toBe(1500);
    // Parcela 3 continua 1000
    expect(getSingleInstallmentAmount(customizedParent, "2026-10-28")).toBe(1000);
    // Parcela 5 continua 1000
    expect(getSingleInstallmentAmount(customizedParent, "2026-12-28")).toBe(1000);
  });
});
