import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { BillingCalendar } from "../BillingCalendar";

vi.mock("@/hooks/usePaymentMethods", () => ({
  usePaymentMethods: () => ({
    methods: [],
    activeMethods: [],
    loading: false,
  }),
}));

vi.mock("@/contexts/HideValuesContext", () => ({
  useHideValues: () => ({
    hidden: false,
    mask: (v: string) => v,
  }),
}));

describe("BillingCalendar — Exibição de Valores na Grade vs Painel", () => {
  it("não exibe o total recebido com checkmark na célula do dia quando liquidado, mas mantém no card de detalhes", () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const dayDate = `${year}-${month}-09`;

    const sampleLoan: any = {
      id: "loan-1",
      borrower_name: "Cliente Teste",
      principal: 1000,
      total_amount: 1425,
      interest_rate: 42.5,
      issue_date: dayDate,
      due_date: dayDate,
      status: "paid",
      payment_frequency: "monthly",
      installment_count: 1,
      paid_amount: 1425,
    };

    const samplePayment: any = {
      id: "pay-1",
      loan_id: "loan-1",
      amount: 1425,
      created_at: `${dayDate}T10:00:00Z`,
      payment_date: dayDate,
    };

    render(
      <BillingCalendar
        loans={[sampleLoan]}
        payments={[samplePayment]}
        installmentSchedules={[]}
        sales={[]}
        clients={[]}
      />
    );

    // O texto com ✓ ("R$ 1.425,00 ✓") NÃO deve existir na grade do calendário
    expect(screen.queryByText(/✓/)).toBeNull();

    // No card de resumo do dia selecionado, o mini-card "Recebido" deve existir
    const receivedLabels = screen.getAllByText("Recebido");
    expect(receivedLabels.length).toBeGreaterThanOrEqual(1);
  });
});
