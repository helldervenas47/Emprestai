import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClientRankingDetailDialog } from "../ClientRankingDetailDialog";
import { ClientRankingItem } from "../../../types/clientRanking";
import { Client, Loan, Payment } from "@/types/loan";

describe("ClientRankingDetailDialog", () => {
  const mockItem: ClientRankingItem = {
    position: 1,
    client_id: "client-1",
    client_name: "Lucas Souza",
    client_phone: "75982903119",
    client_cpf: "12345678900",
    client_cnpj: null,
    score: 63,
    total_loans: 2,
    total_borrowed: 21500,
    open_amount: 6720,
    total_payments: 5,
    total_received: 21345,
    profit_generated: 5245,
    on_time_payments: 4,
    late_payments: 1,
    on_time_percentage: 80,
    max_delay_days: 27,
    overdue_loans: 1,
  };

  const mockClients: Client[] = [
    {
      id: "client-1",
      name: "Lucas Souza",
      phone: "75982903119",
      cpf: "12345678900",
      active: true,
      address: "",
      city: "",
      state: "",
      rg: "",
      score: "63",
    },
    {
      id: "client-2",
      name: "Thiago Rodrigues",
      phone: "75981309939",
      cpf: "98765432100",
      active: true,
      address: "",
      city: "",
      state: "",
      rg: "",
      score: "85",
    },
  ];

  const mockLoans: Loan[] = [
    {
      id: "loan-1",
      borrowerId: "client-1",
      borrowerName: "Lucas Souza",
      amount: 10000,
      totalAmount: 12000,
      interestRate: 20,
      installments: 4,
      paidInstallments: 3,
      status: "overdue",
      startDate: "2026-01-01",
      dueDate: "2026-02-01",
      remainingAmount: 3000,
      interestType: "simple",
      paymentFrequency: "monthly",
      notes: "Contrato Principal",
      tags: ["VIP", "Sergio"],
    },
    {
      id: "loan-2",
      borrowerId: "client-1",
      borrowerName: "Lucas Souza",
      amount: 11500,
      totalAmount: 11500,
      interestRate: 10,
      installments: 1,
      paidInstallments: 1,
      status: "paid",
      startDate: "2025-10-01",
      dueDate: "2025-11-01",
      remainingAmount: 0,
      interestType: "simple",
      paymentFrequency: "monthly",
      tags: ["Garantia Veicular"],
    },
    // Empréstimo com borrowerId antigo mas cujo nome foi alterado para outro cliente
    {
      id: "loan-3",
      borrowerId: "client-1",
      borrowerName: "Outro Cliente",
      amount: 500,
      totalAmount: 500,
      interestRate: 0,
      installments: 1,
      paidInstallments: 0,
      status: "active",
      startDate: "2026-01-01",
      dueDate: "2026-02-01",
      remainingAmount: 500,
      interestType: "simple",
      paymentFrequency: "monthly",
    },
  ];

  const mockPayments: Payment[] = [
    {
      id: "pay-1",
      loanId: "loan-2",
      amount: 11500,
      date: "2025-11-28T12:00:00Z", // Vencimento 2025-11-01 -> atraso de 27 dias
      installmentNumber: 1,
      method: "pix",
    },
  ];

  it("renders client details and summary metrics correctly", () => {
    render(
      <ClientRankingDetailDialog
        item={mockItem}
        onClose={vi.fn()}
        clients={mockClients}
        loans={mockLoans}
        payments={mockPayments}
      />
    );

    expect(screen.getByText("Lucas Souza")).toBeInTheDocument();
    expect(screen.getByText(/#1/)).toBeInTheDocument();
    expect(screen.getByText(/Score: 63\/100/)).toBeInTheDocument();
    expect(screen.getAllByText(/27 dias/i).length).toBeGreaterThan(0);
  });

  it("navigates to Maior Atraso tab when clicking the tab or card", () => {
    render(
      <ClientRankingDetailDialog
        item={mockItem}
        onClose={vi.fn()}
        clients={mockClients}
        loans={mockLoans}
        payments={mockPayments}
      />
    );

    // Click Maior Atraso tab button
    const delayButtons = screen.getAllByRole("button", { name: /Maior Atraso/i });
    fireEvent.click(delayButtons[0]);

    // Details visible in the dedicated tab
    expect(screen.getByText("Registros Considerados no Maior Atraso")).toBeInTheDocument();
    expect(screen.getByText(/27 dias de atraso/i)).toBeInTheDocument();
    expect(screen.getByText("Garantia Veicular")).toBeInTheDocument();

    // Click Visão Geral tab button
    const overviewBtn = screen.getByRole("button", { name: /Visão Geral/i });
    fireEvent.click(overviewBtn);

    // Back to overview
    expect(screen.getByText("Resumo Financeiro")).toBeInTheDocument();
  });

  it("navigates to Saldo em Aberto tab and displays tags correctly", () => {
    render(
      <ClientRankingDetailDialog
        item={mockItem}
        onClose={vi.fn()}
        clients={mockClients}
        loans={mockLoans}
        payments={mockPayments}
      />
    );

    // Click Saldo em Aberto tab button
    const openAmountButtons = screen.getAllByRole("button", { name: /Saldo em Aberto/i });
    fireEvent.click(openAmountButtons[0]);

    // Details visible in the dedicated tab
    expect(screen.getByText("Contratos Considerados no Saldo em Aberto")).toBeInTheDocument();
    expect(screen.getByText(/Contrato Principal/i)).toBeInTheDocument();
    expect(screen.getByText("VIP")).toBeInTheDocument();
    expect(screen.getByText("Sergio")).toBeInTheDocument();

    // Does NOT include loan-3 whose name was altered to "Outro Cliente"
    expect(screen.queryByText(/Outro Cliente/i)).not.toBeInTheDocument();
  });
});
