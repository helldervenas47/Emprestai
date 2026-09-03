import { describe, it, expect } from "vitest";
import {
  buildPaymentAllocationMetadata,
  classifyPaymentType,
  lateFeeAllocationMetadata,
  interestCycleAllocationMetadata,
  amortizationAllocationMetadata,
  fixedAllocationMetadata,
  withAllocation,
} from "../paymentAllocationMetadata";
import { ALLOCATION_VERSION_REMAINING_PRORATA } from "@/features/financial/lib/interestAllocation";

const loan = {
  id: "loan-1",
  amount: 1000,
  interestRate: 20,
  installments: 4,
  status: "active",
} as any;

const mk = (over: Partial<any>) => ({
  id: "pay-new",
  loanId: "loan-1",
  amount: 300,
  date: "2026-07-01",
  installmentNumber: 1,
  ...over,
});

describe("classifyPaymentType", () => {
  it("mapeia todos os códigos oficiais", () => {
    expect(classifyPaymentType(0)).toBe("interest_cycle");
    expect(classifyPaymentType(-1)).toBe("partial");
    expect(classifyPaymentType(-2)).toBe("late_fee");
    expect(classifyPaymentType(-3)).toBe("amortization");
    expect(classifyPaymentType(1)).toBe("installment");
    expect(classifyPaymentType(4, { isPayoff: true })).toBe("payoff");
  });
});

describe("buildPaymentAllocationMetadata", () => {
  it("installment_number >= 1 persiste versão, principal e juros somando o valor", () => {
    const meta = buildPaymentAllocationMetadata({
      loan,
      priorPayments: [],
      payment: mk({ installmentNumber: 1, amount: 300 }),
    })!;
    expect(meta.allocation_version).toBe(ALLOCATION_VERSION_REMAINING_PRORATA);
    expect(meta.payment_type).toBe("installment");
    expect(meta.interest_amount).toBeGreaterThan(0);
    expect(meta.principal_amount).toBeGreaterThan(0);
    expect(meta.interest_amount + meta.principal_amount).toBeCloseTo(300, 2);
  });

  it("installment_number = 0 é 100% juros", () => {
    const meta = buildPaymentAllocationMetadata({
      loan, priorPayments: [], payment: mk({ installmentNumber: 0, amount: 200 }),
    })!;
    expect(meta.payment_type).toBe("interest_cycle");
    expect(meta.interest_amount).toBeCloseTo(200, 2);
    expect(meta.principal_amount).toBeCloseTo(0, 2);
  });

  it("installment_number = -1 respeita o override pró-rata do fluxo", () => {
    const meta = buildPaymentAllocationMetadata({
      loan, priorPayments: [], payment: mk({ installmentNumber: -1, amount: 100 }),
      override: { interest: 16.67, principal: 83.33 },
    })!;
    expect(meta.payment_type).toBe("partial");
    expect(meta.interest_amount).toBeCloseTo(16.67, 2);
    expect(meta.principal_amount).toBeCloseTo(83.33, 2);
  });

  it("installment_number = -2 é 100% juros (multa/mora)", () => {
    const meta = buildPaymentAllocationMetadata({
      loan, priorPayments: [], payment: mk({ installmentNumber: -2, amount: 50 }),
    })!;
    expect(meta.payment_type).toBe("late_fee");
    expect(meta.interest_amount).toBeCloseTo(50, 2);
    expect(meta.principal_amount).toBeCloseTo(0, 2);
  });

  it("installment_number = -3 é 100% principal (amortização)", () => {
    const meta = buildPaymentAllocationMetadata({
      loan, priorPayments: [], payment: mk({ installmentNumber: -3, amount: 400 }),
    })!;
    expect(meta.payment_type).toBe("amortization");
    expect(meta.interest_amount).toBeCloseTo(0, 2);
    expect(meta.principal_amount).toBeCloseTo(400, 2);
  });

  it("retorna null para valor zero e bloqueia soma inconsistente", () => {
    expect(buildPaymentAllocationMetadata({ loan, priorPayments: [], payment: mk({ amount: 0 }) })).toBeNull();
    expect(() => fixedAllocationMetadata("installment", 100, { interest: 10, principal: 10 })).toThrow();
    expect(() => fixedAllocationMetadata("installment", 100, { interest: -1, principal: 101 })).toThrow();
  });

  it("tolerância de R$ 0,01 é aceita", () => {
    const meta = fixedAllocationMetadata("installment", 100, { interest: 10, principal: 89.995 })!;
    expect(meta.interest_amount + meta.principal_amount).toBeCloseTo(100, 1);
  });

  it("helpers determinísticos produzem a versão oficial", () => {
    expect(lateFeeAllocationMetadata(30)!.interest_amount).toBe(30);
    expect(interestCycleAllocationMetadata(30)!.principal_amount).toBe(0);
    expect(amortizationAllocationMetadata(30)!.principal_amount).toBe(30);
    expect(lateFeeAllocationMetadata(0)).toBeNull();
  });

  it("withAllocation nunca sobrescreve campos já definidos pelo fluxo", () => {
    const merged = withAllocation({ kind: "late_fee", interest_amount: 7 }, lateFeeAllocationMetadata(30));
    expect(merged!.kind).toBe("late_fee");
    expect(merged!.interest_amount).toBe(7);
    expect(merged!.allocation_version).toBe(ALLOCATION_VERSION_REMAINING_PRORATA);
  });

  it("pagamentos legados (sem metadata) não são alterados por esta função", () => {
    const legacy = { id: "old", loanId: "loan-1", amount: 300, installmentNumber: 1, metadata: null };
    const meta = buildPaymentAllocationMetadata({
      loan, priorPayments: [legacy] as any, payment: mk({ id: "new", installmentNumber: 2 }),
    })!;
    expect(legacy.metadata).toBeNull();
    expect(meta.allocation_version).toBe(ALLOCATION_VERSION_REMAINING_PRORATA);
  });
});
