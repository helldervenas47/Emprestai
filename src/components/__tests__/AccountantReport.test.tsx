import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountantReport } from "../AccountantReport";

// Mock do hook useHideValues
vi.mock("@/contexts/HideValuesContext", () => ({
  useHideValues: () => ({ hidden: false, setHidden: vi.fn() }),
}));

// Mock do hook usePaymentMethods
vi.mock("@/hooks/usePaymentMethods", () => ({
  usePaymentMethods: () => ({ methods: [], loading: false }),
}));

describe("AccountantReport — Livro Caixa e Normalização de Datas", () => {
  it("agrupa pagamentos e despesas do mesmo dia mesmo quando gravados em formatos de data diferentes (ISO vs YYYY-MM-DD)", () => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const day = "11";
    const dateStr = `${ym}-${day}`;
    const dateStrIso = `${ym}-${day}T00:00:00`;
    const expectedDisplay = `${day}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

    const loans = [
      {
        id: "l1",
        borrowerName: "Cliente Teste",
        amount: 1000,
        startDate: `${ym}-01`,
        status: "active",
      },
    ];

    const payments = [
      {
        id: "p1",
        loanId: "l1",
        amount: 1260,
        date: dateStr, // Data formato simples
      },
    ];

    const expenses = [
      {
        id: "e1",
        description: "Despesa 1",
        amount: 300,
        paid: true,
        scope: "business",
        paidDate: dateStr, // Data formato simples
      },
      {
        id: "e2",
        description: "Despesa 2",
        amount: 750,
        paid: true,
        scope: "business",
        paidDate: dateStrIso, // Data formato ISO
      },
    ];

    render(
      <AccountantReport
        loans={loans}
        payments={payments}
        sales={[]}
        expenses={expenses}
        initialTab="cashflow"
      />
    );

    // Deve existir apenas uma linha para a data correspondente
    const dateCells = screen.getAllByText(expectedDisplay);
    expect(dateCells.length).toBe(1);

    // Total de saídas no dia deve ser 300 + 750 = 1050 (card de resumo e tabela)
    expect(screen.getAllByText("R$ 1.050,00").length).toBeGreaterThanOrEqual(1);

    // Entradas do dia = 1260
    expect(screen.getAllByText("R$ 1.260,00").length).toBeGreaterThanOrEqual(1);

    // Saldo do dia = 1260 - 1050 = 210
    expect(screen.getAllByText("R$ 210,00").length).toBeGreaterThanOrEqual(1);

    // Não deve conter a string ISO crua
    expect(screen.queryByText(dateStrIso)).toBeNull();
  });

  it("renderiza a aba Simulação de Impostos com os 3 cenários simplificados, selo MENOR ESTIMATIVA e aviso de planejamento", () => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const loans = [
      {
        id: "l1",
        borrowerName: "Cliente A",
        amount: 10000,
        startDate: `${ym}-01`,
        status: "active",
      },
    ];

    // Pagamento de 11.000: 10.000 principal + 1.000 juros
    const payments = [
      {
        id: "p1",
        loanId: "l1",
        amount: 11000,
        date: `${ym}-10`,
      },
    ];

    render(
      <AccountantReport
        loans={loans}
        payments={payments}
        sales={[]}
        expenses={[]}
        initialTab="simulation"
      />
    );

    // Título e Subtítulo
    expect(screen.getAllByText("Simulação de Impostos").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("Veja uma estimativa de quanto você poderia pagar de impostos sobre os juros recebidos neste período.")
    ).toBeInTheDocument();

    // 3 Cenários
    expect(screen.getByText("Simples Nacional")).toBeInTheDocument();
    expect(screen.getByText("Lucro Presumido")).toBeInTheDocument();
    expect(screen.getByText("Pessoa Física")).toBeInTheDocument();

    // Selo MENOR ESTIMATIVA
    expect(screen.getByText("MENOR ESTIMATIVA")).toBeInTheDocument();

    // Não deve conter "Mais Econômico" nem "Comparador de Regimes Tributários"
    expect(screen.queryByText("Mais Econômico")).toBeNull();
    expect(screen.queryByText("Comparador de Regimes Tributários")).toBeNull();

    // Aviso de planejamento no rodapé
    expect(
      screen.getByText(
        "Esta é uma simulação para planejamento financeiro. Os valores reais podem variar conforme atividade, faturamento, município, tipo de operação e enquadramento tributário. Consulte um contador para confirmar a tributação aplicável ao seu caso."
      )
    ).toBeInTheDocument();

    // Ação Ver cálculo
    const verCalculoButtons = screen.getAllByText("Ver cálculo");
    expect(verCalculoButtons.length).toBe(3);

    // Clicar em Ver cálculo do primeiro card
    fireEvent.click(verCalculoButtons[0]);
    expect(screen.getByText("Ocultar cálculo")).toBeInTheDocument();
  });
});
