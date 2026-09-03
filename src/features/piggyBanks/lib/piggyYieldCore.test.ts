import { describe, it, expect } from "vitest";
import {
  compoundDeposit,
  iofRate,
  irRate,
  settle,
} from "./piggyTax";

const rates = (n: number, taxa = 0.0004) =>
  Array.from({ length: n }, (_, i) => ({
    data: new Date(Date.UTC(2025, 0, 2 + i)).toISOString().slice(0, 10),
    cdiDiario: taxa,
  }));

describe("piggy-yield-core", () => {
  it("capitaliza de forma composta (juros sobre juros)", () => {
    const r = compoundDeposit(1000, "2025-01-01", rates(10), 100);
    const simples = 1000 * 0.0004 * 10;
    expect(r.rendimentoBruto).toBeGreaterThan(simples);
    expect(r.saldoBruto).toBeCloseTo(1000 * Math.pow(1.0004, 10), 6);
  });

  it("respeita o percentual do CDI", () => {
    const a = compoundDeposit(1000, "2025-01-01", rates(20), 100);
    const b = compoundDeposit(1000, "2025-01-01", rates(20), 110);
    expect(b.rendimentoBruto).toBeGreaterThan(a.rendimentoBruto);
  });

  it("IOF zera a partir de 30 dias corridos", () => {
    expect(iofRate(1)).toBeCloseTo(0.96);
    expect(iofRate(29)).toBeCloseTo(0.03);
    expect(iofRate(30)).toBe(0);
  });

  it("IR regressivo é aplicado sobre TODO o rendimento acumulado", () => {
    const antes = settle({ principal: 1000, saldoBruto: 1100, diasCorridos: 180 });
    const depois = settle({ principal: 1000, saldoBruto: 1100, diasCorridos: 181 });
    expect(antes.aliquotaIr).toBe(0.225);
    expect(depois.aliquotaIr).toBe(0.2);
    // o líquido MELHORA ao cruzar a faixa (não fica congelado)
    expect(depois.rendimentoLiquido).toBeGreaterThan(antes.rendimentoLiquido);
    expect(irRate(721)).toBe(0.15);
  });

  it("IOF entra na base antes do IR em resgates curtos", () => {
    const s = settle({ principal: 1000, saldoBruto: 1100, diasCorridos: 10 });
    expect(s.iof).toBeCloseTo(100 * 0.66, 6);
    expect(s.ir).toBeCloseTo((100 - 100 * 0.66) * 0.225, 6);
    expect(s.saldoLiquido).toBeCloseTo(1000 + s.rendimentoLiquido, 6);
  });
});
