import { describe, it, expect } from "vitest";
import { computeClientRanking } from "../computeClientRanking";
import { Client, Loan, Payment, InstallmentSchedule } from "@/types/loan";

describe("computeClientRanking", () => {
  const mockClients: Client[] = [
    {
      id: "client-1",
      name: "João Silva",
      phone: "11999999999",
      cpf: "12345678900",
      active: true,
      createdAt: "2026-01-01",
    },
    {
      id: "client-2",
      name: "Maria Santos",
      phone: "11888888888",
      cpf: "98765432100",
      active: true,
      createdAt: "2026-01-01",
    },
  ];

  const mockLoans: Loan[] = [
    {
      id: "loan-1",
      borrowerId: "client-1",
      borrowerName: "João Silva",
      amount: 1000,
      originalAmount: 1000,
      interestRate: 20,
      interestType: "Mensal",
      paymentType: "installments",
      startDate: "2026-01-01",
      dueDate: "2026-02-01",
      installments: 4,
      paidInstallments: 4,
      status: "paid",
      createdAt: "2026-01-01",
    },
    {
      id: "loan-2",
      borrowerId: "client-2",
      borrowerName: "Maria Santos",
      amount: 5000,
      originalAmount: 5000,
      interestRate: 30,
      interestType: "Mensal",
      paymentType: "installments",
      startDate: "2026-02-01",
      dueDate: "2026-03-01",
      installments: 2,
      paidInstallments: 0,
      status: "late",
      remainingAmount: 5000,
      createdAt: "2026-02-01",
    },
  ];

  const mockPayments: Payment[] = [
    {
      id: "pay-1",
      loanId: "loan-1",
      amount: 300,
      date: "2026-02-01",
      installmentNumber: 1,
    },
    {
      id: "pay-2",
      loanId: "loan-1",
      amount: 300,
      date: "2026-03-01",
      installmentNumber: 2,
    },
    {
      id: "pay-3",
      loanId: "loan-1",
      amount: 300,
      date: "2026-04-01",
      installmentNumber: 3,
    },
    {
      id: "pay-4",
      loanId: "loan-1",
      amount: 300,
      date: "2026-05-01",
      installmentNumber: 4,
    },
  ];

  const mockSchedules: InstallmentSchedule[] = [
    { loanId: "loan-1", installmentNumber: 1, dueDate: "2026-02-01", amount: 300 },
    { loanId: "loan-1", installmentNumber: 2, dueDate: "2026-03-01", amount: 300 },
    { loanId: "loan-1", installmentNumber: 3, dueDate: "2026-04-01", amount: 300 },
    { loanId: "loan-1", installmentNumber: 4, dueDate: "2026-05-01", amount: 300 },
    { loanId: "loan-2", installmentNumber: 1, dueDate: "2026-03-01", amount: 3250 },
    { loanId: "loan-2", installmentNumber: 2, dueDate: "2026-04-01", amount: 3250 },
  ];

  it("calcula pontualidade e volume corretamente para 'best'", () => {
    const res = computeClientRanking({
      clients: mockClients,
      loans: mockLoans,
      payments: mockPayments,
      installmentSchedules: mockSchedules,
      rankingType: "best",
      period: "all",
    });

    expect(res.data).toHaveLength(2);
    expect(res.data[0].client_id).toBe("client-1");
    expect(res.data[0].position).toBe(1);
    expect(res.data[0].total_borrowed).toBe(1000);
    expect(res.data[0].total_received).toBe(1200);
    expect(res.data[0].on_time_percentage).toBe(100);
    expect(res.data[0].max_delay_days).toBe(0);
  });

  it("ordena corretamente por 'volume'", () => {
    const res = computeClientRanking({
      clients: mockClients,
      loans: mockLoans,
      payments: mockPayments,
      installmentSchedules: mockSchedules,
      rankingType: "volume",
      period: "all",
    });

    expect(res.data[0].client_id).toBe("client-2");
    expect(res.data[0].total_borrowed).toBe(5000);
    expect(res.data[1].client_id).toBe("client-1");
    expect(res.data[1].total_borrowed).toBe(1000);
  });

  it("calcula maior atraso histórico registrado mesmo para contratos já quitados", () => {
    const latePaidPayments: Payment[] = [
      {
        id: "pay-1",
        loanId: "loan-1",
        amount: 300,
        date: "2026-02-01",
        installmentNumber: 1,
      },
      {
        id: "pay-2",
        loanId: "loan-1",
        amount: 300,
        date: "2026-03-25", // Vencia 2026-03-01 -> 24 dias de atraso
        installmentNumber: 2,
      },
      {
        id: "pay-3",
        loanId: "loan-1",
        amount: 300,
        date: "2026-04-01",
        installmentNumber: 3,
      },
      {
        id: "pay-4",
        loanId: "loan-1",
        amount: 300,
        date: "2026-05-01",
        installmentNumber: 4,
      },
    ];

    const res = computeClientRanking({
      clients: mockClients,
      loans: mockLoans,
      payments: latePaidPayments,
      installmentSchedules: mockSchedules,
      rankingType: "best",
      period: "all",
    });

    const client1 = res.data.find((c) => c.client_id === "client-1");
    expect(client1).toBeDefined();
    expect(client1?.max_delay_days).toBe(24);
    expect(client1?.overdue_loans).toBe(1);
    expect(client1?.late_payments).toBe(1);
    expect(client1?.on_time_payments).toBe(3);
    expect(client1?.on_time_percentage).toBe(75);
  });

  it("preserva a posição global do ranking ao filtrar por busca", () => {
    // No ranking por volume: client-2 é #1 (R$ 5000), client-1 é #2 (R$ 1000)
    const res = computeClientRanking({
      clients: mockClients,
      loans: mockLoans,
      payments: mockPayments,
      installmentSchedules: mockSchedules,
      rankingType: "volume",
      period: "all",
      search: "João", // Filtra apenas João (client-1)
    });

    expect(res.total_count).toBe(1);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].client_id).toBe("client-1");
    // Sua posição deve ser #2 (posição global no ranking de volume), NÃO #1
    expect(res.data[0].position).toBe(2);
  });
});

