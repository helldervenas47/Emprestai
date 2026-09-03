import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPaymentLedgerRows, sumLedgerRows } from "@/features/loans/lib/paymentLedgerRows";

describe("buildPaymentLedgerRows", () => {
  it("cria uma única linha quando não há split", () => {
    const rows = buildPaymentLedgerRows({
      amount: 250,
      paymentMethodId: "pm-1",
      split: null,
      extraMetadata: { interest_amount: 250 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(250);
    expect(rows[0].payment_method_id).toBe("pm-1");
    expect(rows[0].metadata.interest_amount).toBe(250);
  });

  it("cria uma linha por parte do split e a soma fecha com o total", () => {
    const rows = buildPaymentLedgerRows({
      amount: 300,
      paymentMethodId: null,
      split: { parts: [{ paymentMethodId: "pm-a", amount: 200 }, { paymentMethodId: "pm-b", amount: 100 }] },
      extraMetadata: { interest_amount: 240, fees_amount: 60 },
    });
    expect(rows).toHaveLength(2);
    expect(sumLedgerRows(rows)).toBe(300);
    expect(rows[0].payment_method_id).toBe("pm-a");
    expect(rows[1].payment_method_id).toBe("pm-b");
    // distribuição proporcional de juros e multa
    expect(rows[0].metadata.interest_amount).toBe(160);
    expect(rows[1].metadata.interest_amount).toBe(80);
    expect(rows[0].metadata.fees_amount).toBe(40);
    expect(rows[1].metadata.fees_amount).toBe(20);
  });

  it("inclui a multa consolidada no total do extrato do pagamento principal", () => {
    const interest = 200;
    const lateFee = 50;
    const rows = buildPaymentLedgerRows({
      amount: interest + lateFee,
      paymentMethodId: "pm-1",
      split: null,
      extraMetadata: { interest_amount: interest, fees_amount: lateFee },
    });
    expect(sumLedgerRows(rows)).toBe(250);
  });

  it("ignora partes com valor zero ou negativo", () => {
    const rows = buildPaymentLedgerRows({
      amount: 100,
      paymentMethodId: null,
      split: { parts: [{ paymentMethodId: "pm-a", amount: 100 }, { paymentMethodId: "pm-b", amount: 0 }] },
    });
    expect(rows).toHaveLength(1);
    expect(sumLedgerRows(rows)).toBe(100);
  });
});

describe("centralização transacional dos pagamentos (guarda de regressão)", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/features/loans/hooks/useLoans.ts"),
    "utf8",
  );

  it("não faz insert direto em payments", () => {
    expect(source).not.toMatch(/from\("payments"\)[\s\S]{0,40}\.insert\(/);
  });

  it("não usa mais o fallback dual-write", () => {
    expect(source).not.toContain("usedLegacyDualWrite");
  });

  it("não cria extrato de pagamento no frontend", () => {
    expect(source).not.toContain("recordPaymentLedgerSplit");
  });

  it("exibe mensagem técnica clara quando a RPC não existe (PGRST202)", () => {
    expect(source).toContain("PGRST202");
    expect(source).toContain("a função transacional não está disponível neste ambiente");
  });

  it("usa a RPC transacional nos fluxos de juros e multa", () => {
    expect(source).toContain("register_loan_interest_payment_atomic");
    expect(source).toContain("register_loan_payment_atomic");
  });

  it("gera o par de IDs (principal + multa) uma única vez e vincula por consolidated_with", () => {
    expect(source).toContain("p_late_fee_payment_id");
    expect(source).toContain("consolidated_with");
  });
});
