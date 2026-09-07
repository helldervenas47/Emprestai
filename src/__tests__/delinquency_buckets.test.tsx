import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  differenceInCalendarDaysYmd,
  getDaysOverdueFromYmd,
  getDelinquencyBucketId,
  type DelinquencyBucketId,
} from "@/lib/timezone";
import { DashboardDelinquencyBuckets } from "@/features/dashboard/components/dashboard/DashboardDelinquencyBuckets";
import type { Loan, InstallmentSchedule, Payment, Client } from "@/types/loan";

describe("Suíte de Testes — Inadimplência por Faixas de Atraso", () => {
  const TODAY = "2026-09-06";

  describe("1. Testes de Limites de Dias e Faixas (Boundaries)", () => {
    it("0 dias (vence hoje): não está atrasado e bucketId é null", () => {
      const days = getDaysOverdueFromYmd("2026-09-06", TODAY);
      expect(days).toBe(0);
      expect(getDelinquencyBucketId(days)).toBeNull();
    });

    it("Futuro (vence amanhã): não está atrasado e bucketId é null", () => {
      const days = getDaysOverdueFromYmd("2026-09-07", TODAY);
      expect(days).toBe(0);
      expect(getDelinquencyBucketId(days)).toBeNull();
    });

    it("1 dia de atraso (venceu ontem): classifica em 1-7", () => {
      const days = getDaysOverdueFromYmd("2026-09-05", TODAY);
      expect(days).toBe(1);
      expect(getDelinquencyBucketId(days)).toBe("1-7");
    });

    it("7 dias de atraso (limite superior da 1ª faixa): classifica em 1-7", () => {
      const days = getDaysOverdueFromYmd("2026-08-30", TODAY);
      expect(days).toBe(7);
      expect(getDelinquencyBucketId(days)).toBe("1-7");
    });

    it("8 dias de atraso (limite inferior da 2ª faixa): classifica em 8-30", () => {
      const days = getDaysOverdueFromYmd("2026-08-29", TODAY);
      expect(days).toBe(8);
      expect(getDelinquencyBucketId(days)).toBe("8-30");
    });

    it("30 dias de atraso (limite superior da 2ª faixa): classifica em 8-30", () => {
      const days = getDaysOverdueFromYmd("2026-08-07", TODAY);
      expect(days).toBe(30);
      expect(getDelinquencyBucketId(days)).toBe("8-30");
    });

    it("31 dias de atraso (limite inferior da 3ª faixa): classifica em 31-60", () => {
      const days = getDaysOverdueFromYmd("2026-08-06", TODAY);
      expect(days).toBe(31);
      expect(getDelinquencyBucketId(days)).toBe("31-60");
    });

    it("60 dias de atraso (limite superior da 3ª faixa): classifica em 31-60", () => {
      const days = getDaysOverdueFromYmd("2026-07-08", TODAY);
      expect(days).toBe(60);
      expect(getDelinquencyBucketId(days)).toBe("31-60");
    });

    it("61 dias de atraso (limite inferior da 4ª faixa): classifica em 60+", () => {
      const days = getDaysOverdueFromYmd("2026-07-07", TODAY);
      expect(days).toBe(61);
      expect(getDelinquencyBucketId(days)).toBe("60+");
    });

    it("100 e 365 dias de atraso: classifica em 60+", () => {
      expect(getDelinquencyBucketId(100)).toBe("60+");
      expect(getDelinquencyBucketId(365)).toBe("60+");
    });
  });

  describe("2. Múltiplas Parcelas do Mesmo Contrato em Faixas Diferentes", () => {
    const loanMulti: Loan = {
      id: "loan_multi_1",
      borrowerName: "Carlos Silva",
      borrowerId: "client_1",
      amount: 2000,
      interestRate: 20,
      installments: 4,
      paidInstallments: 0,
      startDate: "2026-07-01",
      dueDate: "2026-08-01",
      remainingAmount: 2400,
      status: "active",
      notes: "",
    };

    const schedulesMulti: InstallmentSchedule[] = [
      {
        id: "s1",
        loanId: "loan_multi_1",
        installmentNumber: 1,
        dueDate: "2026-08-01", // 36 dias de atraso (31-60)
        amount: 600,
      },
      {
        id: "s2",
        loanId: "loan_multi_1",
        installmentNumber: 2,
        dueDate: "2026-09-01", // 5 dias de atraso (1-7)
        amount: 600,
      },
      {
        id: "s3",
        loanId: "loan_multi_1",
        installmentNumber: 3,
        dueDate: "2026-10-01", // Futuro (não atrasado)
        amount: 600,
      },
      {
        id: "s4",
        loanId: "loan_multi_1",
        installmentNumber: 4,
        dueDate: "2026-11-01", // Futuro (não atrasado)
        amount: 600,
      },
    ];

    it("Distribui cada parcela na sua respectiva faixa sem inflacionar nem omitir valores", () => {
      const formatCurrency = (v: number) => `R$ ${v.toFixed(2)}`;

      render(
        <DashboardDelinquencyBuckets
          loans={[loanMulti]}
          installmentSchedules={schedulesMulti}
          payments={[]}
          clients={[{ id: "client_1", name: "Carlos Silva", phone: "11999999999", active: true }]}
          formatCurrency={formatCurrency}
          onOpenPayment={vi.fn()}
        />
      );

      // Total acumulado em atraso: 600 (parc 1) + 600 (parc 2) = R$ 1200.00
      expect(screen.getByText("Total: R$ 1200.00")).toBeDefined();

      // Card 1 a 7 dias deve ter R$ 600.00 e 1 parcela
      const bucket17 = screen.getByText("1 a 7 dias").closest("button");
      expect(bucket17?.textContent).toContain("R$ 600.00");
      expect(bucket17?.textContent).toContain("1 parcela");

      // Card 31 a 60 dias deve ter R$ 600.00 e 1 parcela
      const bucket3160 = screen.getByText("31 a 60 dias").closest("button");
      expect(bucket3160?.textContent).toContain("R$ 600.00");
      expect(bucket3160?.textContent).toContain("1 parcela");

      // Card 8 a 30 dias deve ter R$ 0.00 e 0 parcelas
      const bucket830 = screen.getByText("8 a 30 dias").closest("button");
      expect(bucket830?.textContent).toContain("R$ 0.00");
      expect(bucket830?.textContent).toContain("0 parcelas");
    });
  });

  describe("3. Status do Empréstimo e Exclusões Corretas", () => {
    it("Contrato com status 'overdue' no banco é incluído corretamente nas faixas", () => {
      const loanOverdueStatus: Loan = {
        id: "loan_overdue_db",
        borrowerName: "Mariana Souza",
        amount: 1000,
        interestRate: 10,
        installments: 1,
        paidInstallments: 0,
        startDate: "2026-08-01",
        dueDate: "2026-08-25", // 12 dias de atraso (8-30)
        remainingAmount: 1100,
        status: "overdue" as any, // Status registrado como 'overdue' no banco
      };

      const formatCurrency = (v: number) => `R$ ${v.toFixed(2)}`;

      render(
        <DashboardDelinquencyBuckets
          loans={[loanOverdueStatus]}
          installmentSchedules={[]}
          payments={[]}
          clients={[]}
          formatCurrency={formatCurrency}
          onOpenPayment={vi.fn()}
        />
      );

      const bucket830 = screen.getByText("8 a 30 dias").closest("button");
      expect(bucket830?.textContent).toContain("R$ 1100.00");
      expect(bucket830?.textContent).toContain("1 parcela");
    });

    it("Contratos com status 'paid' ou 'cancelled' são devidamente ignorados", () => {
      const loanPaid: Loan = {
        id: "loan_paid",
        borrowerName: "Cliente Quitado",
        amount: 1000,
        interestRate: 10,
        installments: 1,
        paidInstallments: 1,
        startDate: "2026-07-01",
        dueDate: "2026-08-01",
        remainingAmount: 0,
        status: "paid",
      };

      const formatCurrency = (v: number) => `R$ ${v.toFixed(2)}`;

      render(
        <DashboardDelinquencyBuckets
          loans={[loanPaid]}
          installmentSchedules={[]}
          payments={[]}
          clients={[]}
          formatCurrency={formatCurrency}
          onOpenPayment={vi.fn()}
        />
      );

      // Deve renderizar o estado de Zero Inadimplência
      expect(screen.getByText("Zero Inadimplência")).toBeDefined();
    });
  });

  describe("4. Modal e Consistência dos Dados", () => {
    it("Ao clicar em um card com cobranças, o modal abre mostrando exatamente as parcelas e o valor correspondente", () => {
      const loan: Loan = {
        id: "loan_test_dialog",
        borrowerName: "Fernando Dias",
        amount: 3000,
        interestRate: 10,
        installments: 3,
        paidInstallments: 0,
        startDate: "2026-06-01",
        dueDate: "2026-07-01",
        remainingAmount: 3300,
        status: "active",
      };

      const schedules: InstallmentSchedule[] = [
        {
          id: "s1",
          loanId: "loan_test_dialog",
          installmentNumber: 1,
          dueDate: "2026-07-01", // 67 dias de atraso (60+)
          amount: 1100,
        },
      ];

      const formatCurrency = (v: number) => `R$ ${v.toFixed(2)}`;

      render(
        <DashboardDelinquencyBuckets
          loans={[loan]}
          installmentSchedules={schedules}
          payments={[]}
          clients={[]}
          formatCurrency={formatCurrency}
          onOpenPayment={vi.fn()}
        />
      );

      // Clica no card 60+ dias
      const bucket60 = screen.getByText("60+ dias").closest("button");
      fireEvent.click(bucket60!);

      // Modal aberto
      expect(screen.getByText("Cobranças da Faixa (1)")).toBeDefined();
      expect(screen.getByText(/Total acumulado nesta faixa/)).toBeDefined();
      expect(screen.getByText("Fernando Dias")).toBeDefined();
      expect(screen.getByText(/Parcela 1\/3/)).toBeDefined();
      expect(screen.getByText("67 dias de atraso")).toBeDefined();
      expect(screen.getAllByText("R$ 1100.00").length).toBeGreaterThanOrEqual(1);
    });
  });
});
