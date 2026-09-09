import { describe, expect, it } from "vitest";
import { getPendingScheduleRow } from "../pendingSchedule";

describe("vencimento ao salvar cronograma", () => {
  const rows = [
    { installmentNumber: 1, dueDate: "2026-08-10" },
    { installmentNumber: 2, dueDate: "2026-09-20" },
  ];

  it("usa a próxima parcela, preservando o histórico pago", () => {
    expect(getPendingScheduleRow(rows, 1)?.dueDate).toBe("2026-09-20");
  });

  it("não restaura a primeira data quando todas as parcelas estão pagas", () => {
    expect(getPendingScheduleRow(rows, 2)).toBeUndefined();
  });

  it("não restaura uma data antiga quando a parcela ativa está ausente", () => {
    expect(getPendingScheduleRow([rows[0]], 1)).toBeUndefined();
  });
});
