import { describe, it, expect } from "vitest";
import { computePeriodProfitExpected } from "@/features/piggyBanks/lib/periodProfitExpected";

describe("computePeriodProfitExpected — juros-only não reduz Previsto restante", () => {
  // Empréstimo: R$1000, 10% a.m., 1 parcela com vencimento em 15/04
  // Juros total = 1000 * 0.10 * 1 = 100
  const loan = {
    id: "loan-1",
    amount: 1000,
    interestRate: 10,
    installments: 1,
    status: "active",
    paidInstallments: 0,
    dueDate: "2025-04-15",
  };

  const aprilRange = {
    start: new Date(2025, 3, 1, 0, 0, 0),
    end: new Date(2025, 3, 30, 23, 59, 59),
  };

  it("inclui os juros previstos quando não há pagamento de juros-only", () => {
    const result = computePeriodProfitExpected([loan], [], [], aprilRange);
    expect(result).toBeCloseTo(100, 2);
  });

  it("mantém o Previsto restante mesmo após pagamento de juros-only no período (parcela empurrada para maio)", () => {
    // Após o pagamento de juros, o vencimento foi empurrado para 15/05.
    // O loan agora reflete esse novo dueDate, tirando a parcela de abril.
    const loanAfterInterestPayment = { ...loan, dueDate: "2025-05-15" };

    const interestOnlyPayment = {
      loanId: "loan-1",
      amount: 100,
      date: "2025-04-10",
      installmentNumber: 0,
    };

    const result = computePeriodProfitExpected(
      [loanAfterInterestPayment],
      [interestOnlyPayment],
      [],
      aprilRange
    );

    // Sem o ajuste, o resultado seria 0 (parcela saiu do período).
    // Com o ajuste, o pagamento de juros-only é re-adicionado ao Previsto de abril.
    expect(result).toBeCloseTo(100, 2);
  });

  it("não soma juros-only feitos fora do período consultado", () => {
    const loanAfterInterestPayment = { ...loan, dueDate: "2025-05-15" };

    const interestOnlyPaymentInMarch = {
      loanId: "loan-1",
      amount: 100,
      date: "2025-03-10",
      installmentNumber: 0,
    };

    const result = computePeriodProfitExpected(
      [loanAfterInterestPayment],
      [interestOnlyPaymentInMarch],
      [],
      aprilRange
    );

    // A parcela está em maio e o pagamento foi em março → abril fica zerado.
    expect(result).toBeCloseTo(0, 2);
  });

  it("ignora pagamentos regulares (installmentNumber !== 0) na soma de ajuste", () => {
    const loanAfterInterestPayment = { ...loan, dueDate: "2025-05-15" };

    const regularPayment = {
      loanId: "loan-1",
      amount: 100,
      date: "2025-04-10",
      installmentNumber: 1,
    };

    const result = computePeriodProfitExpected(
      [loanAfterInterestPayment],
      [regularPayment],
      [],
      aprilRange
    );

    expect(result).toBeCloseTo(0, 2);
  });
});
