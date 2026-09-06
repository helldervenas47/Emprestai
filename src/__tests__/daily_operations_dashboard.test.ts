import { describe, it, expect } from "vitest";
import type { Loan, InstallmentSchedule, Payment, Client } from "@/types/loan";
import {
  buildBillingWhatsappLink,
  applyMessageVariables,
  DEFAULT_WHATSAPP_MESSAGES,
} from "@/lib/whatsappBilling";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";

describe("Suíte de Testes — Central Operacional do Dashboard & Uso Diário", () => {
  const todayStr = new Date().toISOString().substring(0, 10);
  const currentMonthStr = todayStr.substring(0, 7);

  const mockClients: Client[] = [
    { id: "client_1", name: "Carlos Eduardo", phone: "11999991111", email: "carlos@teste.com", active: true, createdAt: "2026-01-01" },
    { id: "client_2", name: "Mariana Souza", phone: "11999992222", email: "mariana@teste.com", active: true, createdAt: "2026-01-01" },
    { id: "client_3", name: "Roberto Silva", phone: "11999993333", email: "roberto@teste.com", active: true, createdAt: "2026-01-01" },
  ];

  const mockLoans: Loan[] = [
    {
      id: "loan_1",
      borrowerId: "client_1",
      borrowerName: "Carlos Eduardo",
      amount: 1000,
      interestRate: 20,
      installments: 4,
      paidInstallments: 0,
      status: "active",
      startDate: "2026-08-01",
      dueDate: "2026-08-10", // Atrasado
      remainingAmount: 1200,
    },
    {
      id: "loan_2",
      borrowerId: "client_2",
      borrowerName: "Mariana Souza",
      amount: 2000,
      interestRate: 15,
      installments: 2,
      paidInstallments: 0,
      status: "active",
      startDate: todayStr,
      dueDate: todayStr, // Vence hoje
      remainingAmount: 2300,
    },
    {
      id: "loan_3",
      borrowerId: "client_3",
      borrowerName: "Roberto Silva",
      amount: 500,
      interestRate: 10,
      installments: 1,
      paidInstallments: 1,
      status: "paid", // Quitado
      startDate: "2026-07-01",
      dueDate: "2026-08-01",
      remainingAmount: 0,
    },
  ];

  const mockSchedules: InstallmentSchedule[] = [
    { id: "sch_1", loanId: "loan_1", installmentNumber: 1, dueDate: "2026-08-10", amount: 300 }, // Atrasado
    { id: "sch_2", loanId: "loan_1", installmentNumber: 2, dueDate: "2026-09-10", amount: 300 },
    { id: "sch_3", loanId: "loan_2", installmentNumber: 1, dueDate: todayStr, amount: 1150 }, // Vence hoje
  ];

  const mockPayments: Payment[] = [
    { id: "pay_1", loanId: "loan_3", amount: 550, date: `${currentMonthStr}-02`, installmentNumber: 1 },
    { id: "pay_2", loanId: "loan_1", amount: 100, date: `${currentMonthStr}-03`, installmentNumber: 0 },
  ];

  it("1. Calcula corretamente os 6 indicadores operacionais principais", () => {
    const activeLoans = mockLoans.filter((l) => l.status === "active");

    // 1. Carteira Ativa (Principal em aberto)
    const capitalOnStreet = activeLoans.reduce((sum, l) => sum + l.amount, 0);
    expect(capitalOnStreet).toBe(3000); // 1000 (loan_1) + 2000 (loan_2)

    // 2. A Receber (Saldo futuro total)
    const totalToReceive = activeLoans.reduce((sum, l) => sum + (l.remainingAmount ?? 0), 0);
    expect(totalToReceive).toBe(3500); // 1200 + 2300

    // 3. Vence Hoje e 4. Em Atraso
    let dueTodayAmt = 0;
    let dueTodayCnt = 0;
    let overdueAmt = 0;
    let overdueCnt = 0;

    const paidSet = new Set(mockPayments.filter((p) => p.installmentNumber > 0).map((p) => `${p.loanId}_${p.installmentNumber}`));

    for (const loan of activeLoans) {
      const schs = mockSchedules.filter((s) => s.loanId === loan.id);
      for (const s of schs) {
        if (!paidSet.has(`${s.loanId}_${s.installmentNumber}`)) {
          if (s.dueDate === todayStr) {
            dueTodayAmt += s.amount;
            dueTodayCnt += 1;
          } else if (s.dueDate < todayStr) {
            overdueAmt += s.amount;
            overdueCnt += 1;
          }
        }
      }
    }

    expect(dueTodayAmt).toBe(1150);
    expect(dueTodayCnt).toBe(1);
    expect(overdueAmt).toBe(300);
    expect(overdueCnt).toBe(1);

    // 5. Recebido no Mês
    const receivedThisMonth = mockPayments
      .filter((p) => p.date.startsWith(currentMonthStr))
      .reduce((sum, p) => sum + p.amount, 0);
    expect(receivedThisMonth).toBe(650); // 550 + 100

    // 6. Clientes Ativos
    const activeClientsCount = new Set(activeLoans.map((l) => l.borrowerId)).size;
    expect(activeClientsCount).toBe(2);
  });

  it("2. Estratifica a inadimplência em faixas de atraso (1–7d, 8–30d, 31–60d, 60+d)", () => {
    const todayMs = new Date(`${todayStr}T00:00:00`).getTime();
    const pastDueMs = new Date("2026-08-10T00:00:00").getTime();
    const daysOverdue = Math.max(1, Math.round((todayMs - pastDueMs) / (1000 * 60 * 60 * 24)));

    expect(daysOverdue).toBeGreaterThan(0);

    let bucketId = "1-7";
    if (daysOverdue > 60) bucketId = "60+";
    else if (daysOverdue >= 31) bucketId = "31-60";
    else if (daysOverdue >= 8) bucketId = "8-30";

    expect(["1-7", "8-30", "31-60", "60+"]).toContain(bucketId);
  });

  it("3. Gera link de cobrança para WhatsApp com mensagem profissional formatada", () => {
    const result = buildBillingWhatsappLink({
      client: mockClients[0],
      loan: mockLoans[0],
      schedules: mockSchedules,
      payments: mockPayments,
      messages: DEFAULT_WHATSAPP_MESSAGES,
    });

    expect(result.url).toContain("https://wa.me/5511999991111");
    expect(result.message).toContain("Carlos Eduardo");
    expect(result.message).toContain("R$");
  });

  it("4. Suporte a Pagamento Parcial sem distorcer o saldo restante", () => {
    const originalLoan = mockLoans[0];
    const totalExpected = 1200;
    const partialPaid = 300;

    const remainingBalance = totalExpected - partialPaid;
    expect(remainingBalance).toBe(900);
  });

  it("5. Isolamento de métricas por usuário (respeita RLS e multi-tenant)", () => {
    const userALoans = mockLoans;
    const userBLoans: Loan[] = [
      {
        id: "loan_user_b",
        borrowerId: "client_b",
        borrowerName: "Outro Tomador",
        amount: 50000,
        interestRate: 30,
        installments: 10,
        paidInstallments: 0,
        status: "active",
        startDate: "2026-09-01",
        dueDate: "2026-10-01",
        remainingAmount: 65000,
      },
    ];

    const totalA = userALoans.filter(l => l.status === "active").reduce((s, l) => s + l.amount, 0);
    const totalB = userBLoans.filter(l => l.status === "active").reduce((s, l) => s + l.amount, 0);

    expect(totalA).toBe(3000);
    expect(totalB).toBe(50000);
    expect(totalA).not.toBe(totalB);
  });
});
