/**
 * LoanPaymentHistoryDialog — testes de renderização do histórico.
 *
 * O componente é pequeno mas depende de `usePaymentMethods` e
 * `useHideValues`. Mockamos ambos para evitar Supabase e Context Providers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Loan, Payment } from "@/types/loan";

vi.mock("@/hooks/usePaymentMethods", () => ({
  usePaymentMethods: () => ({
    methods: [
      { id: "pix-1", name: "PIX", kind: "account" as const },
    ],
    loading: false,
  }),
}));

vi.mock("@/contexts/HideValuesContext", () => ({
  useHideValues: () => ({ hidden: false, mask: (v: string) => v, toggle: vi.fn() }),
}));

beforeEach(() => {
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

import { LoanPaymentHistoryDialog } from "@/features/loans/components/LoanPaymentHistoryDialog";

const fakeLoan: Loan = {
  id: "loan-1",
  borrowerName: "Maria Souza",
  amount: 1000,
  interestRate: 10, // simples: total 1100 (calculateTotalWithInterest com juros simples)
  interestType: "simple",
  paymentType: "monthly",
  startDate: "2025-01-01",
  dueDate: "2025-05-01",
  installments: 4,
  paidInstallments: 2,
  status: "active",
  remainingAmount: 550,
  createdAt: "2025-01-01T00:00:00Z",
};

const fakePayments: Payment[] = [
  { id: "p1", loanId: "loan-1", amount: 275, date: "2025-02-01", installmentNumber: 1, paymentMethodId: "pix-1" },
  { id: "p2", loanId: "loan-1", amount: 275, date: "2025-03-01", installmentNumber: 2, paymentMethodId: "pix-1" },
  // Pagamento de juros isolado (installmentNumber <= 0) → status "Juros".
  { id: "p3", loanId: "loan-1", amount: 50, date: "2025-03-15", installmentNumber: 0, paymentMethodId: "pix-1" },
];

describe("LoanPaymentHistoryDialog", () => {
  it("não renderiza nada quando loan é null", () => {
    const { container } = render(
      <LoanPaymentHistoryDialog loan={null} payments={[]} open onOpenChange={() => {}} />,
    );
    // Sem loan, componente retorna null.
    expect(container.firstChild).toBeNull();
  });

  it("renderiza o cabeçalho com o nome do tomador", () => {
    render(
      <LoanPaymentHistoryDialog loan={fakeLoan} payments={fakePayments} open onOpenChange={() => {}} />,
    );
    expect(screen.getByText(/histórico de pagamentos/i)).toBeInTheDocument();
    expect(screen.getByText(/maria souza/i)).toBeInTheDocument();
  });

  it("renderiza os cards de resumo (Valor Original, Já Pago, Saldo Devedor, Parcelas)", () => {
    render(
      <LoanPaymentHistoryDialog loan={fakeLoan} payments={fakePayments} open onOpenChange={() => {}} />,
    );
    expect(screen.getByText(/valor original/i)).toBeInTheDocument();
    expect(screen.getByText(/já pago/i)).toBeInTheDocument();
    expect(screen.getByText(/saldo devedor/i)).toBeInTheDocument();
    expect(screen.getByText(/juros recebidos/i)).toBeInTheDocument();
    // Parcelas pagas: 2 / 4.
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
    // Parcelas pendentes: 4 - 2 = 2.
    const pendCard = screen.getByText(/parcelas pendentes/i).closest("div")?.parentElement;
    expect(pendCard).toBeTruthy();
    expect(within(pendCard as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("renderiza as linhas de pagamento com data em pt-BR e valores formatados", () => {
    render(
      <LoanPaymentHistoryDialog loan={fakeLoan} payments={fakePayments} open onOpenChange={() => {}} />,
    );
    // Datas convertidas de ISO para dd/mm/yyyy — aparecem em desktop e mobile.
    expect(screen.getAllByText("01/02/2025").length).toBeGreaterThan(0);
    expect(screen.getAllByText("01/03/2025").length).toBeGreaterThan(0);
    expect(screen.getAllByText("15/03/2025").length).toBeGreaterThan(0);
    // Valor pago R$ 275,00 aparece na tabela (várias ocorrências: linhas + mobile).
    expect(screen.getAllByText(/R\$\s?275,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s?50,00/).length).toBeGreaterThan(0);
  });

  it("mostra badge 'Juros' para pagamentos com installmentNumber <= 0", () => {
    render(
      <LoanPaymentHistoryDialog loan={fakeLoan} payments={fakePayments} open onOpenChange={() => {}} />,
    );
    // p3 tem installmentNumber=0 → badge "Juros".
    expect(screen.getAllByText(/^juros$/i).length).toBeGreaterThan(0);
    // p1 e p2 são parcelas normais → badge "Pago".
    expect(screen.getAllByText(/^pago$/i).length).toBeGreaterThan(0);
  });
});
