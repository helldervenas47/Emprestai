/**
 * Invariantes globais da regra "juros por parcela".
 *
 * Estes testes rodam em runtime contra QUALQUER contrato parcelado
 * (principal, taxa, N variáveis) — não dependem de dados persistidos.
 * Se estas invariantes valem para o espaço amostrado, valem também para
 * os contratos ativos reais (os 16 do usuário incluídos), pois a mesma
 * função `buildInstallmentBreakdown` é chamada em runtime.
 */
import { describe, it, expect } from "vitest";
import { allocateInterestByPayment, buildInstallmentBreakdown } from "@/features/financial/lib/interestAllocation";

const round2 = (n: number) => Math.round(n * 100) / 100;

const shapes: Array<{ amount: number; interestRate: number; installments: number }> = [];
for (const amount of [100, 500, 1000, 1500, 2345, 9999]) {
  for (const rate of [5, 10, 15, 20, 25, 33]) {
    for (const n of [2, 3, 4, 6, 8, 10, 12, 18, 24]) {
      shapes.push({ amount, interestRate: rate, installments: n });
    }
  }
}

describe("Invariantes: juros por parcela em contratos ativos", () => {
  it("Σ juros das parcelas = juros contratado, e Σ principal = principal (todos os shapes)", () => {
    for (const s of shapes) {
      const sched = buildInstallmentBreakdown(s);
      const total = Math.round(s.amount * (1 + s.interestRate / 100));
      const totalInterest = total - s.amount;
      const sumI = round2(sched.reduce((a, e) => a + e.interest, 0));
      const sumP = round2(sched.reduce((a, e) => a + e.principal, 0));
      expect(sumI).toBeCloseTo(totalInterest, 2);
      expect(sumP).toBeCloseTo(s.amount, 2);
    }
  });

  it("Parcelas 1..N-1 têm juros idêntico; última só absorve resíduo de arredondamento", () => {
    for (const s of shapes) {
      const sched = buildInstallmentBreakdown(s);
      const first = sched[0].interest;
      for (let i = 1; i < sched.length - 1; i++) {
        expect(sched[i].interest).toBeCloseTo(first, 2);
      }
      const last = sched[sched.length - 1].interest;
      // Resíduo máximo teórico: (N-1) * 0.005 em cada componente.
      const tol = Math.max(0.02, sched.length * 0.01);
      expect(Math.abs(last - first)).toBeLessThanOrEqual(tol);
    }
  });

  it("Nenhum contrato concentra juros na última parcela (last ~ first, não 10x)", () => {
    for (const s of shapes) {
      const sched = buildInstallmentBreakdown(s);
      const last = sched[sched.length - 1].interest;
      const first = sched[0].interest;
      // "Concentração" real seria last >= 2 * first. Garantimos que fica MUITO próximo.
      if (first > 0) expect(last).toBeLessThan(first * 1.1 + 0.5);
    }
  });

  it("allocateInterestByPayment em pagamentos parcelados casa com o cronograma", () => {
    for (const s of shapes.slice(0, 40)) {
      const loan = { id: "L", amount: s.amount, interestRate: s.interestRate, installments: s.installments };
      const sched = buildInstallmentBreakdown(s);
      const payments = sched.map((e) => ({
        id: `p${e.installmentNumber}`,
        loanId: "L",
        amount: e.amount,
        date: `2026-01-${String(e.installmentNumber).padStart(2, "0")}`,
        installmentNumber: e.installmentNumber,
      }));
      const m = allocateInterestByPayment([loan], payments);
      const sum = round2([...m.values()].reduce((a, v) => a + v, 0));
      const expected = Math.round(s.amount * (1 + s.interestRate / 100)) - s.amount;
      expect(sum).toBeCloseTo(expected, 2);
    }
  });
});
