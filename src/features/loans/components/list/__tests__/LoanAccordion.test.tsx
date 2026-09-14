import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { useState } from "react";
import { LoanListTable } from "@/features/loans/components/list/LoanListTable";
import { LoanListMobileCards } from "@/features/loans/components/list/LoanListMobileCards";
import { Loan } from "@/types/loan";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "teste@teste.com" } }),
}));

vi.mock("@/contexts/HideValuesContext", () => ({
  useHideValues: () => ({ mask: (v: string) => v, hideValues: false }),
}));

vi.mock("@/hooks/usePaymentCelebration", () => ({
  usePaymentCelebration: () => ({ celebrate: vi.fn() }),
}));

vi.mock("@/features/loans/hooks/useLoanRenegotiations", () => ({
  useLoanRenegotiations: () => ({ renegotiations: [] }),
}));

vi.mock("@/features/payroll/hooks/useManagerCommissions", () => ({
  useManagerCommissions: () => ({ commissions: [] }),
}));

vi.mock("@/hooks/usePaymentMethods", () => ({
  usePaymentMethods: () => ({ activeMethods: [] }),
}));

const mockLoans: Loan[] = [
  {
    id: "loan-1",
    borrowerName: "João Silva",
    borrowerId: "client-1",
    amount: 1000,
    interestRate: 10,
    installments: 1,
    paidInstallments: 0,
    status: "pending",
    issueDate: "2026-09-01",
    dueDate: "2026-10-01",
    userId: "user-1",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  },
  {
    id: "loan-2",
    borrowerName: "Maria Souza",
    borrowerId: "client-2",
    amount: 2000,
    interestRate: 10,
    installments: 1,
    paidInstallments: 0,
    status: "pending",
    issueDate: "2026-09-01",
    dueDate: "2026-10-01",
    userId: "user-1",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  },
];

function HarnessTable() {
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  return (
    <LoanListTable
      categorized={mockLoans}
      loans={mockLoans}
      payments={[]}
      installmentSchedules={[]}
      category="all"
      totalToReceive={3000}
      renegotiationsByLoan={new Map()}
      commissionTotalByLoan={new Map()}
      cycleColumnSort={vi.fn()}
      sortIndicator={() => null}
      expandedLoanId={expandedLoanId}
      onToggleExpandLoan={(id) => setExpandedLoanId((prev) => (prev === id ? null : id))}
      onPayment={vi.fn()}
      onPartialPayment={vi.fn()}
      onInterestPayment={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onDeletePayment={vi.fn()}
      onSaveSchedule={vi.fn()}
    />
  );
}

function HarnessCards() {
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  return (
    <LoanListMobileCards
      loans={mockLoans}
      allLoans={mockLoans}
      payments={[]}
      installmentSchedules={[]}
      renegotiationsByLoan={new Map()}
      expandedLoanId={expandedLoanId}
      onToggleExpandLoan={(id) => setExpandedLoanId((prev) => (prev === id ? null : id))}
      onPayment={vi.fn()}
      onPartialPayment={vi.fn()}
      onInterestPayment={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onDeletePayment={vi.fn()}
      onSaveSchedule={vi.fn()}
    />
  );
}

describe("Loan Accordion Behavior", () => {
  it("na visualização em tabela (LoanListTable), expande apenas um empréstimo por vez e recolhe o anterior", () => {
    render(<HarnessTable />);

    // Nenhum expandido inicialmente
    expect(screen.queryByText(/Composição do Saldo/i)).toBeNull();

    // Clica no primeiro empréstimo (João Silva)
    fireEvent.click(screen.getByText("João Silva"));
    expect(screen.getAllByText(/Composição do Saldo/i)).toHaveLength(1);

    // Clica no segundo empréstimo (Maria Souza)
    fireEvent.click(screen.getByText("Maria Souza"));
    // Apenas 1 deve continuar expandido
    expect(screen.getAllByText(/Composição do Saldo/i)).toHaveLength(1);

    // Clica no segundo empréstimo de novo para recolher
    fireEvent.click(screen.getByText("Maria Souza"));
    expect(screen.queryByText(/Composição do Saldo/i)).toBeNull();
  });

  it("na visualização em cards (LoanListMobileCards), expande apenas um empréstimo por vez e recolhe o anterior", () => {
    render(<HarnessCards />);

    // Nenhum expandido inicialmente
    expect(screen.queryByText(/Composição do Saldo/i)).toBeNull();

    // Clica no primeiro card (João Silva)
    fireEvent.click(screen.getByLabelText(/Expandir detalhes de João Silva/i));
    expect(screen.getAllByText(/Composição do Saldo/i)).toHaveLength(1);

    // Clica no segundo card (Maria Souza)
    fireEvent.click(screen.getByLabelText(/Expandir detalhes de Maria Souza/i));
    // Apenas 1 deve continuar expandido
    expect(screen.getAllByText(/Composição do Saldo/i)).toHaveLength(1);

    // Clica no segundo card de novo para recolher
    fireEvent.click(screen.getByLabelText(/Recolher detalhes de Maria Souza/i));
    expect(screen.queryByText(/Composição do Saldo/i)).toBeNull();
  });
});
