import { describe, it, expect } from "vitest";
import {
  validateIncomeDate,
  validateExpenseDate,
  validateSalePayment,
  effectiveIncomeDate,
  effectiveExpenseDate,
  type IncomeLike,
  type ExpenseLike,
  type SalePaymentLike,
} from "./paymentValidation";

describe("effectiveIncomeDate", () => {
  it("usa actualReceivedDate quando recebida", () => {
    const i: IncomeLike = { id: "1", receivedDate: "2026-05-16", actualReceivedDate: "2026-05-17", status: "received" };
    expect(effectiveIncomeDate(i)).toBe("2026-05-17");
  });
  it("cai para receivedDate quando pendente", () => {
    const i: IncomeLike = { id: "1", receivedDate: "2026-05-16", status: "pending" };
    expect(effectiveIncomeDate(i)).toBe("2026-05-16");
  });
  it("cai para receivedDate quando recebida sem data real", () => {
    const i: IncomeLike = { id: "1", receivedDate: "2026-05-16", status: "received" };
    expect(effectiveIncomeDate(i)).toBe("2026-05-16");
  });
});

describe("effectiveExpenseDate", () => {
  it("usa paidDate quando paga", () => {
    const e: ExpenseLike = { id: "1", dueDate: "2026-05-16", paidDate: "2026-05-17", paid: true };
    expect(effectiveExpenseDate(e)).toBe("2026-05-17");
  });
  it("usa dueDate quando não paga", () => {
    const e: ExpenseLike = { id: "1", dueDate: "2026-05-16", paid: false };
    expect(effectiveExpenseDate(e)).toBe("2026-05-16");
  });
});

describe("validateIncomeDate — pagamento manual e rápido", () => {
  const parent = "p-1";
  const list: IncomeLike[] = [
    { id: "a", parentId: parent, receivedDate: "2026-05-09", actualReceivedDate: "2026-05-10", status: "received" },
    { id: "b", parentId: parent, receivedDate: "2026-05-16", status: "pending" },
    { id: "c", parentId: parent, receivedDate: "2026-05-23", status: "pending" },
    { id: "z", parentId: "outro-pai", receivedDate: "2026-05-17", status: "pending" },
  ];

  it("permite pagamento na mesma data do vencimento (sem conflito)", () => {
    const target = list[1];
    expect(validateIncomeDate(target, list, "2026-05-16")).toEqual({ ok: true });
  });

  it("permite antecipar pagamento para data livre", () => {
    const target = list[1];
    expect(validateIncomeDate(target, list, "2026-05-14")).toEqual({ ok: true });
  });

  it("rejeita pagamento na data efetiva de outra ocorrência da mesma série", () => {
    const target = list[1];
    const res = validateIncomeDate(target, list, "2026-05-10");
    expect(res.ok).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.conflictingId).toBe("a");
  });

  it("rejeita pagamento na data de vencimento de outra ocorrência pendente", () => {
    const target = list[1];
    const res = validateIncomeDate(target, list, "2026-05-23");
    expect(res.ok).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.conflictingId).toBe("c");
  });

  it("ignora colisão com séries diferentes", () => {
    const target = list[1];
    expect(validateIncomeDate(target, list, "2026-05-17")).toEqual({ ok: true });
  });

  it("rejeita data vazia", () => {
    const target = list[1];
    const res = validateIncomeDate(target, list, "");
    expect(res.ok).toBe(false);
  });

  it("ignora o próprio alvo ao comparar (re-pagamento idempotente)", () => {
    const list2: IncomeLike[] = [
      { id: "x", parentId: null, receivedDate: "2026-05-16", actualReceivedDate: "2026-05-17", status: "received" },
    ];
    expect(validateIncomeDate(list2[0], list2, "2026-05-17")).toEqual({ ok: true });
  });
});

describe("validateExpenseDate", () => {
  const list: ExpenseLike[] = [
    { id: "a", parentId: "p", dueDate: "2026-05-10", paidDate: "2026-05-11", paid: true },
    { id: "b", parentId: "p", dueDate: "2026-05-20", paid: false },
  ];
  it("rejeita pagamento que colide com despesa já paga", () => {
    const res = validateExpenseDate(list[1], list, "2026-05-11");
    expect(res.ok).toBe(false);
  });
  it("permite data livre", () => {
    expect(validateExpenseDate(list[1], list, "2026-05-19")).toEqual({ ok: true });
  });
});

describe("validateSalePayment — pagamentos vinculados à venda", () => {
  const history: SalePaymentLike[] = [
    { date: "2026-05-10", amount: 100, type: "installment" },
    { date: "2026-05-20", amount: 50, type: "partial" },
  ];

  it("aceita novo pagamento em data livre", () => {
    expect(
      validateSalePayment(history, { date: "2026-05-15", amount: 80, type: "installment" })
    ).toEqual({ ok: true });
  });

  it("rejeita pagamento duplicado na mesma data e tipo", () => {
    const res = validateSalePayment(history, { date: "2026-05-10", amount: 100, type: "installment" });
    expect(res.ok).toBe(false);
  });

  it("permite mesma data com tipo diferente (parcial vs parcela)", () => {
    expect(
      validateSalePayment(history, { date: "2026-05-10", amount: 30, type: "partial" })
    ).toEqual({ ok: true });
  });

  it("rejeita valor não positivo", () => {
    expect(validateSalePayment(history, { date: "2026-05-30", amount: 0 }).ok).toBe(false);
    expect(validateSalePayment(history, { date: "2026-05-30", amount: -10 }).ok).toBe(false);
  });

  it("rejeita data vazia", () => {
    expect(validateSalePayment(history, { date: "", amount: 50 }).ok).toBe(false);
  });

  it("ignora o próprio índice ao editar", () => {
    const res = validateSalePayment(
      history,
      { date: "2026-05-10", amount: 120, type: "installment" },
      0,
    );
    expect(res.ok).toBe(true);
  });
});
