import { describe, it, expect } from "vitest";
import {
  withPartialPayment,
  withoutPartialPayments,
  readPartialPayments,
  totalPartialPaid,
  incomeOutstanding,
  round2,
} from "../partialPayments";

describe("partialPayments - Incomes & Expenses", () => {
  it("adiciona e lê pagamentos parciais corretamente", () => {
    let notes = "Obs inicial";
    notes = withPartialPayment(notes, { month: "2026-09", date: "2026-09-05", amount: 150.5 });
    
    const partials = readPartialPayments(notes);
    expect(partials).toHaveLength(1);
    expect(partials[0].amount).toBe(150.5);
    expect(partials[0].date).toBe("2026-09-05");
    expect(totalPartialPaid(notes)).toBe(150.5);

    // Segundo pagamento parcial
    notes = withPartialPayment(notes, { month: "2026-09", date: "2026-09-06", amount: 50.25 });
    expect(readPartialPayments(notes)).toHaveLength(2);
    expect(totalPartialPaid(notes)).toBe(200.75);
  });

  it("calcula saldo pendente (incomeOutstanding) de receita corretamente", () => {
    const income = {
      amount: 500,
      status: "pending",
      notes: "Receita de consultoria",
    };
    expect(incomeOutstanding(income)).toBe(500);

    const notesWithPartial = withPartialPayment(income.notes, {
      month: "2026-09",
      date: "2026-09-05",
      amount: 200,
    });

    expect(incomeOutstanding({ ...income, notes: notesWithPartial })).toBe(300);

    // Se já recebida / quitada, saldo pendente é 0
    expect(incomeOutstanding({ ...income, status: "received", notes: notesWithPartial })).toBe(0);
  });

  it("limpa observações com withoutPartialPayments", () => {
    let notes = "Texto da observação\n[Partial: 2026-09|2026-09-05=100]";
    const cleaned = withoutPartialPayments(notes);
    expect(cleaned).toBe("Texto da observação");
  });
});
