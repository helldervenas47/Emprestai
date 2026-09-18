import { describe, it, expect } from "vitest";
import {
  serializeCustomInstallments,
  deserializeCustomInstallments,
  calculateTotalFromInstallments,
  withCustomInstallments,
  withoutCustomInstallments,
  displayNotes,
  getSingleInstallmentAmount,
  IndividualInstallmentEdit,
} from "../installmentEdit";

describe("Custom Installments Serialization & Logic", () => {
  const sampleInstallments: IndividualInstallmentEdit[] = [
    { index: 0, amount: 250, dueDate: "2026-09-20", paid: false, description: "" },
    { index: 1, amount: 150.5, dueDate: "2026-10-20", paid: false, description: "" },
    { index: 2, amount: 100, dueDate: "2026-11-20", paid: false, description: "" },
  ];

  it("correctly calculates total from custom installments", () => {
    const total = calculateTotalFromInstallments(sampleInstallments);
    expect(total).toBe(500.5);
  });

  it("serializes and deserializes custom installments losslessly", () => {
    const serialized = serializeCustomInstallments(sampleInstallments);
    expect(typeof serialized).toBe("string");
    const tagged = `[CustomInstallments:${serialized}]`;
    const deserialized = deserializeCustomInstallments(tagged);
    expect(deserialized).toEqual(sampleInstallments);
  });

  it("attaches tag to existing notes without mangling text", () => {
    const notes = "Observação original do usuário";
    const tagged = withCustomInstallments(notes, sampleInstallments);
    expect(tagged).toContain("Observação original do usuário");
    expect(tagged).toContain("[CustomInstallments:");

    const parsed = deserializeCustomInstallments(tagged);
    expect(parsed).toEqual(sampleInstallments);

    const cleanDisplay = displayNotes(tagged);
    expect(cleanDisplay).toBe("Observação original do usuário");
    expect(cleanDisplay).not.toContain("[CustomInstallments:");
  });

  it("removes custom installments tag correctly", () => {
    const tagged = "Linha 1\n[CustomInstallments:abc]\nLinha 2";
    const cleaned = withoutCustomInstallments(tagged);
    expect(cleaned).toBe("Linha 1\nLinha 2");
  });

  it("handles null/undefined and empty notes gracefully", () => {
    expect(deserializeCustomInstallments(null)).toBeNull();
    expect(deserializeCustomInstallments(undefined)).toBeNull();
    expect(deserializeCustomInstallments("")).toBeNull();
    expect(displayNotes(null)).toBe("");
    expect(displayNotes(undefined)).toBe("");
    expect(displayNotes("")).toBe("");
  });

  it("getSingleInstallmentAmount calculates single unit correctly", () => {
    // Parcela de valor único proporcional
    expect(getSingleInstallmentAmount({ amount: 1200, installments: 12, type: "recorrente" } as any)).toBe(100);
    // Parcela única (sem installments > 1)
    expect(getSingleInstallmentAmount({ amount: 50, installments: 1, type: "fixa" } as any)).toBe(50);
    // Parcela customizada
    const expenseWithCustom = {
      amount: 500.5,
      type: "recorrente",
      installments: 3,
      notes: withCustomInstallments("Nota", sampleInstallments),
    };
    // Parcela index 0
    expect(getSingleInstallmentAmount(expenseWithCustom as any, 0)).toBe(250);
    // Parcela index 1
    expect(getSingleInstallmentAmount(expenseWithCustom as any, 1)).toBe(150.5);
    // Parcela index 2
    expect(getSingleInstallmentAmount(expenseWithCustom as any, 2)).toBe(100);
  });

  it("updates only target installment when editing single installment in a series (scope: 'this')", async () => {
    const { applyExpenseScopedUpdate } = await import("../seriesEdit");
    
    // Despesa parcelada em 3x de R$ 100, total R$ 300
    const parent = {
      id: "parent-1",
      description: "Despesa 3x",
      amount: 300,
      installments: 3,
      paidInstallments: 0,
      type: "recorrente" as const,
      dueDate: "2026-09-10",
      notes: "",
      category: "Infra",
      scope: "business" as const,
      paid: false,
    };

    const updatedMap = new Map<string, any>();
    const onUpdateLocal = (id: string, data: any) => {
      updatedMap.set(id, { ...parent, ...data });
    };

    // Usuário edita a parcela 2 (Outubro) alterando o valor de R$ 100 para R$ 250
    await applyExpenseScopedUpdate({
      target: parent as any,
      patch: {
        amount: 250,
        dueDate: "2026-10-10",
      },
      scope: "this",
      expenses: [parent as any],
      onUpdateLocal,
    });

    const updatedParent = updatedMap.get("parent-1");
    expect(updatedParent).toBeDefined();
    // Novo total = 100 (mês 1) + 250 (mês 2) + 100 (mês 3) = 450
    expect(updatedParent.amount).toBe(450);

    // Parcela 1 (Setembro) deve continuar R$ 100
    expect(getSingleInstallmentAmount(updatedParent, "2026-09-10")).toBe(100);
    // Parcela 2 (Outubro) deve ser R$ 250
    expect(getSingleInstallmentAmount(updatedParent, "2026-10-10")).toBe(250);
    // Parcela 3 (Novembro) deve continuar R$ 100
    expect(getSingleInstallmentAmount(updatedParent, "2026-11-10")).toBe(100);
  });

  it("calculates next unpaid installment amount correctly when custom amounts exist", () => {
    // Cenário do usuário: despesa total R$ 9.500 em 3 parcelas, mas com valores customizados (ex: R$ 2.000, R$ 3.500, R$ 4.000)
    const customSchedule: IndividualInstallmentEdit[] = [
      { index: 0, amount: 2000, dueDate: "2026-09-15", paid: false, description: "" },
      { index: 1, amount: 3500, dueDate: "2026-10-15", paid: false, description: "" },
      { index: 2, amount: 4000, dueDate: "2026-11-15", paid: false, description: "" },
    ];
    const parentExpense = {
      id: "parent-custom",
      description: "Despesa 9.5k",
      amount: 9500,
      installments: 3,
      paidInstallments: 0,
      type: "recorrente" as const,
      dueDate: "2026-09-15",
      notes: withCustomInstallments("", customSchedule),
    };

    // Nenhuma paga: próxima parcela é a 0 (R$ 2.000)
    expect(getSingleInstallmentAmount(parentExpense as any, 0)).toBe(2000);

    // 1 paga: próxima parcela é a 1 (R$ 3.500)
    expect(getSingleInstallmentAmount(parentExpense as any, 1)).toBe(3500);

    // 2 pagas: próxima parcela é a 2 (R$ 4.000)
    expect(getSingleInstallmentAmount(parentExpense as any, 2)).toBe(4000);
  });
});

