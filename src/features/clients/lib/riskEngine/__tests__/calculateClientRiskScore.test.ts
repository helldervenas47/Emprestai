import { describe, it, expect } from "vitest";
import { calculateClientRiskScore } from "../calculateClientRiskScore";
import { Client, Loan, Payment, InstallmentSchedule } from "@/types/loan";

const mockClient: Client = {
  id: "client-1",
  name: "João Silva",
  cpf: "12345678900",
  phone: "11999999999",
  email: "joao@example.com",
  createdAt: "2024-01-01T00:00:00Z",
  active: true,
};

describe("calculateClientRiskScore - Motor de Risco Comportamental (0 a 100)", () => {
  const refDate = new Date("2026-09-01T00:00:00");

  it("1. Usuário novo sem histórico inicia com score neutro 60 (Regular)", () => {
    const result = calculateClientRiskScore(mockClient, [], [], [], refDate);
    expect(result.score).toBe(60);
    expect(result.label).toBe("Regular");
    expect(result.isNewClient).toBe(true);
    expect(result.reasons[0]).toContain("Sem histórico financeiro");
  });

  it("2. Cliente com histórico consistente de pagamentos em dia atinge faixa Excelente (>= 85)", () => {
    const loan: Loan = {
      id: "loan-1",
      borrowerId: "client-1",
      borrowerName: "João Silva",
      amount: 5000,
      totalAmount: 6000,
      interestRate: 20,
      startDate: "2025-01-01",
      dueDate: "2025-02-01",
      status: "paid",
      installments: 3,
      paidInstallments: 3,
      paymentFrequency: "Mensal",
      createdAt: "2025-01-01T00:00:00Z",
    };

    const payments: Payment[] = [
      { id: "p-1", loanId: "loan-1", amount: 2000, date: "2025-02-01", installmentNumber: 1 },
      { id: "p-2", loanId: "loan-1", amount: 2000, date: "2025-03-01", installmentNumber: 2 },
      { id: "p-3", loanId: "loan-1", amount: 2000, date: "2025-04-01", installmentNumber: 3 },
    ];

    const activeLoan: Loan = {
      id: "loan-2",
      borrowerId: "client-1",
      borrowerName: "João Silva",
      amount: 3000,
      totalAmount: 3600,
      interestRate: 20,
      startDate: "2026-07-01",
      dueDate: "2026-09-15",
      status: "active",
      installments: 3,
      paidInstallments: 1,
      paymentFrequency: "Mensal",
      createdAt: "2026-07-01T00:00:00Z",
    };

    const activePayments: Payment[] = [
      { id: "p-4", loanId: "loan-2", amount: 1200, date: "2026-08-01", installmentNumber: 1 },
    ];

    const result = calculateClientRiskScore(
      mockClient,
      [loan, activeLoan],
      [...payments, ...activePayments],
      [],
      refDate
    );

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.label).toBe("Excelente");
    expect(result.positiveFactors.length).toBeGreaterThan(0);
  });

  it("3. Atraso ativo de 61 a 90 dias impõe teto máximo de 54 (Risco elevado)", () => {
    const overdueLoan: Loan = {
      id: "loan-overdue-1",
      borrowerId: "client-1",
      borrowerName: "João Silva",
      amount: 4000,
      totalAmount: 4800,
      interestRate: 20,
      startDate: "2026-05-01",
      dueDate: "2026-06-25", // ~68 dias de atraso em relação a 2026-09-01
      status: "active",
      installments: 1,
      paidInstallments: 0,
      paymentFrequency: "Mensal",
      createdAt: "2026-05-01T00:00:00Z",
    };

    const result = calculateClientRiskScore(mockClient, [overdueLoan], [], [], refDate);
    expect(result.score).toBeLessThanOrEqual(54);
    expect(result.breakdown.appliedCap).toBe(54);
    expect(["Risco elevado", "Alto risco"]).toContain(result.label);
    expect(result.negativeFactors.some((f) => f.includes("atraso ativo"))).toBe(true);
  });

  it("4. Atraso ativo de 91 a 120 dias impõe teto máximo de 44", () => {
    const overdueLoan: Loan = {
      id: "loan-overdue-2",
      borrowerId: "client-1",
      borrowerName: "João Silva",
      amount: 4000,
      totalAmount: 4800,
      interestRate: 20,
      startDate: "2026-04-01",
      dueDate: "2026-05-20", // ~104 dias de atraso em relação a 2026-09-01
      status: "active",
      installments: 1,
      paidInstallments: 0,
      paymentFrequency: "Mensal",
      createdAt: "2026-04-01T00:00:00Z",
    };

    const result = calculateClientRiskScore(mockClient, [overdueLoan], [], [], refDate);
    expect(result.score).toBeLessThanOrEqual(44);
    expect(result.breakdown.appliedCap).toBe(44);
  });

  it("5. Atraso ativo superior a 120 dias impõe teto máximo de 34 (Alto risco)", () => {
    const overdueLoan: Loan = {
      id: "loan-overdue-3",
      borrowerId: "client-1",
      borrowerName: "João Silva",
      amount: 4000,
      totalAmount: 4800,
      interestRate: 20,
      startDate: "2026-01-01",
      dueDate: "2026-03-01", // ~184 dias de atraso em relação a 2026-09-01
      status: "active",
      installments: 1,
      paidInstallments: 0,
      paymentFrequency: "Mensal",
      createdAt: "2026-01-01T00:00:00Z",
    };

    const result = calculateClientRiskScore(mockClient, [overdueLoan], [], [], refDate);
    expect(result.score).toBeLessThanOrEqual(34);
    expect(result.label).toBe("Alto risco");
  });

  it("6. Recorrência: múltiplos atrasos em 6 meses têm penalização significativamente maior que um atraso isolado", () => {
    const loan: Loan = {
      id: "loan-recurrent",
      borrowerId: "client-1",
      borrowerName: "João Silva",
      amount: 5000,
      totalAmount: 6000,
      interestRate: 20,
      startDate: "2026-02-01",
      dueDate: "2026-03-01",
      status: "paid",
      installments: 5,
      paidInstallments: 5,
      paymentFrequency: "Mensal",
      createdAt: "2026-02-01T00:00:00Z",
    };

    const singleLatePayments: Payment[] = [
      { id: "p-1", loanId: "loan-recurrent", amount: 1200, date: "2026-03-11", installmentNumber: 1 }, // 10 dias de atraso
      { id: "p-2", loanId: "loan-recurrent", amount: 1200, date: "2026-04-01", installmentNumber: 2 }, // em dia
      { id: "p-3", loanId: "loan-recurrent", amount: 1200, date: "2026-05-01", installmentNumber: 3 }, // em dia
      { id: "p-4", loanId: "loan-recurrent", amount: 1200, date: "2026-06-01", installmentNumber: 4 }, // em dia
      { id: "p-5", loanId: "loan-recurrent", amount: 1200, date: "2026-07-01", installmentNumber: 5 }, // em dia
    ];

    const multipleLatePayments: Payment[] = [
      { id: "p-1", loanId: "loan-recurrent", amount: 1200, date: "2026-03-11", installmentNumber: 1 }, // atraso 10d
      { id: "p-2", loanId: "loan-recurrent", amount: 1200, date: "2026-04-11", installmentNumber: 2 }, // atraso 10d
      { id: "p-3", loanId: "loan-recurrent", amount: 1200, date: "2026-05-11", installmentNumber: 3 }, // atraso 10d
      { id: "p-4", loanId: "loan-recurrent", amount: 1200, date: "2026-06-11", installmentNumber: 4 }, // atraso 10d
      { id: "p-5", loanId: "loan-recurrent", amount: 1200, date: "2026-07-11", installmentNumber: 5 }, // atraso 10d
    ];

    const singleResult = calculateClientRiskScore(mockClient, [loan], singleLatePayments, [], refDate);
    const multipleResult = calculateClientRiskScore(mockClient, [loan], multipleLatePayments, [], refDate);

    expect(singleResult.score).toBeGreaterThan(multipleResult.score);
    expect(singleResult.score - multipleResult.score).toBeGreaterThanOrEqual(15);
  });

  it("7. Recuperação pós-quitação: quitação de atraso grave (>60d) não devolve score máximo imediatamente", () => {
    const settledLoan: Loan = {
      id: "loan-settled-late",
      borrowerId: "client-1",
      borrowerName: "João Silva",
      amount: 5000,
      totalAmount: 6000,
      interestRate: 20,
      startDate: "2026-04-01",
      dueDate: "2026-05-01",
      status: "paid",
      installments: 1,
      paidInstallments: 1,
      paymentFrequency: "Mensal",
      createdAt: "2026-04-01T00:00:00Z",
    };

    // Pagou com 75 dias de atraso recentemente (15/07/2026)
    const lateSettlementPayment: Payment[] = [
      { id: "p-late-pay", loanId: "loan-settled-late", amount: 6000, date: "2026-07-15", installmentNumber: 1 },
    ];

    const result = calculateClientRiskScore(mockClient, [settledLoan], lateSettlementPayment, [], refDate);

    // Score não pode ser Excelente (>= 85) ou Bom alto sem novos pagamentos pontuais
    expect(result.score).toBeLessThanOrEqual(65);
  });

  describe("8. Impacto de Renegociações no Score (-10 pts por ocorrência)", () => {
    const loanBase: Loan = {
      id: "loan-reneg-base",
      borrowerId: "client-1",
      borrowerName: "João Silva",
      amount: 5000,
      totalAmount: 6000,
      interestRate: 20,
      startDate: "2025-01-01",
      dueDate: "2025-02-01",
      status: "paid",
      installments: 3,
      paidInstallments: 3,
      paymentFrequency: "Mensal",
      createdAt: "2025-01-01T00:00:00Z",
    };

    const paymentsBase: Payment[] = [
      { id: "p-r1", loanId: "loan-reneg-base", amount: 2000, date: "2025-02-01", installmentNumber: 1 },
      { id: "p-r2", loanId: "loan-reneg-base", amount: 2000, date: "2025-03-01", installmentNumber: 2 },
      { id: "p-r3", loanId: "loan-reneg-base", amount: 2000, date: "2025-04-01", installmentNumber: 3 },
    ];

    it("8.1. 1 renegociação desconta exatamente 10 pontos", () => {
      const baseResult = calculateClientRiskScore(mockClient, [loanBase], paymentsBase, [], refDate, []);
      const renegResult = calculateClientRiskScore(mockClient, [loanBase], paymentsBase, [], refDate, [
        {
          id: "reneg-1",
          loanId: "loan-reneg-base",
          userId: "user-1",
          renegotiatedAt: "2025-02-15",
          type: "with_penalty",
          previousAmount: 5000,
          newAmount: 5500,
          penaltyAmount: 500,
          createdAt: "2025-02-15T00:00:00Z",
        },
      ]);

      expect(renegResult.breakdown.renegotiationsCount).toBe(1);
      expect(renegResult.breakdown.renegotiationPenalty).toBe(10);
      expect(renegResult.score).toBe(baseResult.score - 10);
      expect(renegResult.negativeFactors.some((f) => f.includes("1 renegociação"))).toBe(true);
    });

    it("8.2. 2 renegociações descontam 20 pontos, 3 descontam 30 e 4 descontam 40", () => {
      const baseResult = calculateClientRiskScore(mockClient, [loanBase], paymentsBase, [], refDate, []);

      const reneg2 = calculateClientRiskScore(mockClient, [loanBase], paymentsBase, [], refDate, [
        { id: "r1", loanId: "loan-reneg-base", userId: "u1", renegotiatedAt: "2025-02-15", type: "with_penalty", previousAmount: 5000, newAmount: 5500, penaltyAmount: 500, createdAt: "2025-02-15" },
        { id: "r2", loanId: "loan-reneg-base", userId: "u1", renegotiatedAt: "2025-03-15", type: "with_penalty", previousAmount: 5500, newAmount: 6000, penaltyAmount: 500, createdAt: "2025-03-15" },
      ]);
      expect(reneg2.breakdown.renegotiationsCount).toBe(2);
      expect(reneg2.breakdown.renegotiationPenalty).toBe(20);
      expect(reneg2.score).toBe(baseResult.score - 20);

      const reneg3 = calculateClientRiskScore(mockClient, [loanBase], paymentsBase, [], refDate, [
        { id: "r1", loanId: "loan-reneg-base", userId: "u1", renegotiatedAt: "2025-02-15", type: "with_penalty", previousAmount: 5000, newAmount: 5500, penaltyAmount: 500, createdAt: "2025-02-15" },
        { id: "r2", loanId: "loan-reneg-base", userId: "u1", renegotiatedAt: "2025-03-15", type: "with_penalty", previousAmount: 5500, newAmount: 6000, penaltyAmount: 500, createdAt: "2025-03-15" },
        { id: "r3", loanId: "loan-reneg-base", userId: "u1", renegotiatedAt: "2025-04-15", type: "with_penalty", previousAmount: 6000, newAmount: 6500, penaltyAmount: 500, createdAt: "2025-04-15" },
      ]);
      expect(reneg3.breakdown.renegotiationsCount).toBe(3);
      expect(reneg3.breakdown.renegotiationPenalty).toBe(30);
      expect(reneg3.score).toBe(baseResult.score - 30);

      const reneg4 = calculateClientRiskScore(mockClient, [loanBase], paymentsBase, [], refDate, [
        { id: "r1", loanId: "loan-reneg-base", userId: "u1", renegotiatedAt: "2025-02-15", type: "with_penalty", previousAmount: 5000, newAmount: 5500, penaltyAmount: 500, createdAt: "2025-02-15" },
        { id: "r2", loanId: "loan-reneg-base", userId: "u1", renegotiatedAt: "2025-03-15", type: "with_penalty", previousAmount: 5500, newAmount: 6000, penaltyAmount: 500, createdAt: "2025-03-15" },
        { id: "r3", loanId: "loan-reneg-base", userId: "u1", renegotiatedAt: "2025-04-15", type: "with_penalty", previousAmount: 6000, newAmount: 6500, penaltyAmount: 500, createdAt: "2025-04-15" },
        { id: "r4", loanId: "loan-reneg-base", userId: "u1", renegotiatedAt: "2025-05-15", type: "with_penalty", previousAmount: 6500, newAmount: 7000, penaltyAmount: 500, createdAt: "2025-05-15" },
      ]);
      expect(reneg4.breakdown.renegotiationsCount).toBe(4);
      expect(reneg4.breakdown.renegotiationPenalty).toBe(40);
      expect(reneg4.score).toBe(baseResult.score - 40);
    });

    it("8.3. Score nunca fica abaixo de 0 (piso mínimo)", () => {
      // Cliente com atraso severo ativo (teto 34) + 4 renegociações (-40 pts) -> 34 - 40 = 0 (nunca negativo)
      const overdueLoan: Loan = {
        id: "loan-overdue-zero",
        borrowerId: "client-1",
        borrowerName: "João Silva",
        amount: 4000,
        totalAmount: 4800,
        interestRate: 20,
        startDate: "2026-01-01",
        dueDate: "2026-03-01",
        status: "active",
        installments: 1,
        paidInstallments: 0,
        paymentFrequency: "Mensal",
        createdAt: "2026-01-01T00:00:00Z",
      };

      const result = calculateClientRiskScore(mockClient, [overdueLoan], [], [], refDate, [
        { id: "r1", loanId: "loan-overdue-zero", userId: "u1", renegotiatedAt: "2026-02-01", type: "with_penalty", previousAmount: 4000, newAmount: 4500, penaltyAmount: 500, createdAt: "2026-02-01" },
        { id: "r2", loanId: "loan-overdue-zero", userId: "u1", renegotiatedAt: "2026-03-01", type: "with_penalty", previousAmount: 4500, newAmount: 5000, penaltyAmount: 500, createdAt: "2026-03-01" },
        { id: "r3", loanId: "loan-overdue-zero", userId: "u1", renegotiatedAt: "2026-04-01", type: "with_penalty", previousAmount: 5000, newAmount: 5500, penaltyAmount: 500, createdAt: "2026-04-01" },
        { id: "r4", loanId: "loan-overdue-zero", userId: "u1", renegotiatedAt: "2026-05-01", type: "with_penalty", previousAmount: 5500, newAmount: 6000, penaltyAmount: 500, createdAt: "2026-05-01" },
      ]);

      expect(result.score).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.label).toBe("Alto risco");
    });

    it("8.4. Prevenção de dupla penalização para o mesmo registro de renegociação", () => {
      // Passando o mesmo registro de renegociação duplicado no array
      const duplicateRenegs = [
        { id: "dup-1", loanId: "loan-reneg-base", userId: "u1", renegotiatedAt: "2025-02-15", type: "with_penalty" as const, previousAmount: 5000, newAmount: 5500, penaltyAmount: 500, createdAt: "2025-02-15" },
        { id: "dup-1", loanId: "loan-reneg-base", userId: "u1", renegotiatedAt: "2025-02-15", type: "with_penalty" as const, previousAmount: 5000, newAmount: 5500, penaltyAmount: 500, createdAt: "2025-02-15" },
      ];

      const result = calculateClientRiskScore(mockClient, [loanBase], paymentsBase, [], refDate, duplicateRenegs);
      expect(result.breakdown.renegotiationsCount).toBe(1);
      expect(result.breakdown.renegotiationPenalty).toBe(10);
    });
  });
});
