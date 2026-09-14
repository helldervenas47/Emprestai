import { describe, it, expect } from "vitest";
import { allocateInterestByPayment, buildInstallmentBreakdown, computeInstallmentInterest, getInstallmentInterest } from "@/features/financial/lib/interestAllocation";

describe("buildInstallmentBreakdown", () => {
  it("distributes interest uniformly across equal installments and closes residual on last", () => {
    const s = buildInstallmentBreakdown({ amount: 1000, interestRate: 20, installments: 6 });
    expect(s).toHaveLength(6);
    const sumInterest = s.reduce((a, e) => a + e.interest, 0);
    const sumPrincipal = s.reduce((a, e) => a + e.principal, 0);
    expect(sumInterest).toBeCloseTo(200, 2);
    expect(sumPrincipal).toBeCloseTo(1000, 2);
    // Parcels 1..5 identical
    for (let i = 0; i < 5; i++) expect(s[i].interest).toBeCloseTo(s[0].interest, 2);
  });

  it("single-installment loan keeps legacy shape", () => {
    const s = buildInstallmentBreakdown({ amount: 1000, interestRate: 20, installments: 1 });
    expect(s).toHaveLength(1);
    expect(s[0].interest).toBe(200);
    expect(s[0].principal).toBe(1000);
  });

  it("O(1) lookup via getInstallmentInterest", () => {
    const got = getInstallmentInterest({ amount: 1000, interestRate: 20, installments: 4 }, 2);
    expect(got).not.toBeNull();
    expect(got!.interest + got!.principal).toBeCloseTo(got!.amount, 2);
  });
});


const makeLoan = (over: Partial<any> = {}) => ({
  id: "L1",
  amount: 1000,
  interestRate: 20,
  installments: 4,
  status: "active",
  ...over,
});

const parcel = (n: number, amt: number, id?: string) => ({
  id: id ?? `p${n}`,
  loanId: "L1",
  amount: amt,
  date: `2026-01-${String(n).padStart(2, "0")}`,
  installmentNumber: n,
});

describe("computeInstallmentInterest", () => {
  it("distributes interest pro-rata across regular installments", () => {
    const total = 1200;
    const ratio = 1 - 1000 / total; // 0.16666...
    const r1 = computeInstallmentInterest({
      principal: 1000, rate: 20, installments: 4,
      installmentAmount: 300, installmentNumber: 1, priorInterestAllocated: 0,
    });
    expect(r1.interestPart).toBeCloseTo(300 * ratio, 1);
    expect(r1.interestPart + r1.principalPart).toBeCloseTo(300, 2);
  });

  it("closes rounding residual on the last installment", () => {
    const parcels = [1, 2, 3, 4].map((n) => 300);
    let prior = 0;
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      const { interestPart } = computeInstallmentInterest({
        principal: 1000, rate: 20, installments: 4,
        installmentAmount: parcels[i], installmentNumber: i + 1,
        priorInterestAllocated: prior,
      });
      prior += interestPart;
      sum += interestPart;
    }
    expect(sum).toBeCloseTo(200, 2);
  });

  it("single-installment loan keeps legacy behavior (excess = interest)", () => {
    const { interestPart, principalPart } = computeInstallmentInterest({
      principal: 1000, rate: 20, installments: 1,
      installmentAmount: 1200, installmentNumber: 1, priorInterestAllocated: 0,
    });
    expect(interestPart).toBe(200);
    expect(principalPart).toBe(1000);
  });
});

describe("allocateInterestByPayment", () => {
  it("2-parcel loan: 100 + 100 = 200", () => {
    const loan = makeLoan({ installments: 2 });
    const payments = [parcel(1, 600), parcel(2, 600)];
    const m = allocateInterestByPayment([loan], payments);
    const total = payments.reduce((s, p) => s + (m.get(p.id) ?? 0), 0);
    expect(total).toBeCloseTo(200, 2);
    expect(m.get("p1")).toBeCloseTo(100, 2);
    expect(m.get("p2")).toBeCloseTo(100, 2);
  });

  it("6-parcel loan sums to 200 exactly (last absorbs residual)", () => {
    const loan = makeLoan({ installments: 6 });
    const payments = [1, 2, 3, 4, 5, 6].map((n) => parcel(n, 200));
    const m = allocateInterestByPayment([loan], payments);
    const total = payments.reduce((s, p) => s + (m.get(p.id) ?? 0), 0);
    expect(total).toBeCloseTo(200, 2);
  });

  it("12-parcel loan sums to 200 exactly", () => {
    const loan = makeLoan({ installments: 12 });
    const payments = Array.from({ length: 12 }, (_, i) => parcel(i + 1, 100));
    const m = allocateInterestByPayment([loan], payments);
    const total = payments.reduce((s, p) => s + (m.get(p.id) ?? 0), 0);
    expect(total).toBeCloseTo(200, 2);
  });

  it("single-installment contract: full interest on the sole payment", () => {
    const loan = makeLoan({ installments: 1 });
    const payments = [parcel(1, 1200)];
    const m = allocateInterestByPayment([loan], payments);
    expect(m.get("p1")).toBeCloseTo(200, 2);
  });

  it("partial payment (-1) allocates interest-first over remaining interest", () => {
    const loan = makeLoan({ installments: 4 });
    const payments = [
      { id: "pa", loanId: "L1", amount: 150, date: "2026-01-15", installmentNumber: -1 },
      parcel(1, 300, "p1"),
    ];
    const m = allocateInterestByPayment([loan], payments);
    // Partial 150 with 200 interest remaining → 150 goes to interest.
    expect(m.get("pa")).toBeCloseTo(150, 2);
    // Then parcel 1 sees only 50 remaining interest, capped by ratio (50).
    expect(m.get("p1")).toBeGreaterThan(0);
    const total = m.get("pa")! + m.get("p1")!;
    expect(total).toBeLessThanOrEqual(200 + 0.02);
  });

  it("interest-only payment (installmentNumber = 0) is 100% interest", () => {
    const loan = makeLoan({ installments: 4 });
    const payments = [{ id: "j1", loanId: "L1", amount: 200, date: "2026-01-15", installmentNumber: 0 }];
    const m = allocateInterestByPayment([loan], payments);
    expect(m.get("j1")).toBeCloseTo(200, 2);
  });

  it("amortization (-3) allocates zero interest", () => {
    const loan = makeLoan({ installments: 4 });
    const payments = [{ id: "a1", loanId: "L1", amount: 200, date: "2026-01-15", installmentNumber: -3 }];
    const m = allocateInterestByPayment([loan], payments);
    expect(m.get("a1")).toBe(0);
  });

  it("early payoff with discount does NOT inflate last-month interest", () => {
    // 4 parcels of 300; user pays parcels 1..3 = 900, then pays off with 200 (discount of 100).
    const loan = makeLoan({ installments: 4, status: "paid" });
    const payments = [
      parcel(1, 300),
      parcel(2, 300),
      parcel(3, 300),
      { id: "p4", loanId: "L1", amount: 200, date: "2026-04-01", installmentNumber: 4 },
    ];
    const m = allocateInterestByPayment([loan], payments);
    const total = payments.reduce((s, p) => s + (m.get(p.id) ?? 0), 0);
    // With discount, total received principal+interest = 1100 < 1200. Total
    // interest allocated must NOT exceed contracted 200, and typically stays
    // below (não infla o card).
    expect(total).toBeLessThanOrEqual(200 + 0.02);
  });

  it("paid loan with late fees and extra days (total paid > contracted) recognizes full excess as interest/revenue", () => {
    // Ex: Empréstimo R$ 700 a 20% (juros R$ 140, total nominal R$ 840).
    // Cliente atrasa e paga: R$ 500 (parcial) + R$ 200 (parcial) + R$ 500 (quitação) = R$ 1200 total (R$ 360 de multas).
    const loan = makeLoan({ id: "L_MATHEUS", amount: 700, interestRate: 20, installments: 1, status: "paid" });
    const payments = [
      { id: "p1", loanId: "L_MATHEUS", amount: 500, date: "2026-08-16", installmentNumber: -1, metadata: { interest_amount: 83.33, principal_amount: 416.67, allocation_version: "remaining_balance_prorata" } },
      { id: "p2", loanId: "L_MATHEUS", amount: 200, date: "2026-09-03", installmentNumber: -1, metadata: { interest_amount: 33.34, principal_amount: 166.66, allocation_version: "remaining_balance_prorata" } },
      { id: "p3", loanId: "L_MATHEUS", amount: 500, date: "2026-09-13", installmentNumber: 1, metadata: { payment_type: "payoff" } },
    ];
    const m = allocateInterestByPayment([loan], payments);
    // p1 = 83.33
    // p2 = 33.34
    // p3 = 500 - (83.33 + 33.34) = 383.33
    expect(m.get("p1")).toBeCloseTo(83.33, 2);
    expect(m.get("p2")).toBeCloseTo(33.34, 2);
    expect(m.get("p3")).toBeCloseTo(383.33, 2);

    const totalInterest = payments.reduce((s, p) => s + (m.get(p.id) ?? 0), 0);
    expect(totalInterest).toBeCloseTo(500, 2); // 1200 pago - 700 principal = 500 total de juros + multas
  });
});
