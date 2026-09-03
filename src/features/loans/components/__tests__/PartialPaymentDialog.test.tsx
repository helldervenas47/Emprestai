/**
 * PartialPaymentDialog — testes do modal de pagamento parcial.
 *
 * Componente puro de UI: recebe `loan`, valores computados e handlers via props.
 * Não precisa mockar Supabase — os dados chegam prontos do card pai.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { Loan } from "@/types/loan";
import { PartialPaymentDialog } from "@/features/loans/components/PartialPaymentDialog";

// Polyfill jsdom para Radix (usa ResizeObserver e pointer capture).
beforeEach(() => {
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // Radix Select usa hasPointerCapture — polyfill mínimo.
  if (!(HTMLElement.prototype as any).hasPointerCapture) {
    (HTMLElement.prototype as any).hasPointerCapture = () => false;
    (HTMLElement.prototype as any).releasePointerCapture = () => {};
    (HTMLElement.prototype as any).setPointerCapture = () => {};
    (HTMLElement.prototype as any).scrollIntoView = () => {};
  }
});

const fakeLoan: Loan = {
  id: "loan-1",
  borrowerName: "João Silva",
  amount: 1000,
  interestRate: 5,
  interestType: "simple",
  paymentType: "monthly",
  startDate: "2025-01-01",
  dueDate: "2025-06-01",
  installments: 5,
  paidInstallments: 2,
  status: "active",
  createdAt: "2025-01-01T00:00:00Z",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function renderDialog(overrides: Partial<React.ComponentProps<typeof PartialPaymentDialog>> = {}) {
  const onAmountChange = vi.fn();
  const onDateChange = vi.fn();
  const onSelectedMethodChange = vi.fn();
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();

  const props: React.ComponentProps<typeof PartialPaymentDialog> = {
    open: true,
    onOpenChange,
    loan: fakeLoan,
    amount: "",
    onAmountChange,
    date: new Date("2025-06-10"),
    onDateChange,
    methods: [],
    selectedMethodId: "",
    onSelectedMethodChange,
    onConfirm,
    formatCurrency: fmt,
    totalContract: 1050,
    totalPaid: 400,
    baseRemaining: 650,
    remainingWithFees: 650,
    paidInstallments: 2,
    totalInstallments: 5,
    nextDueDateLabel: "10/07/2025",
    interestRate: 5,
    interestPendingCycle: 50,
    lateInterestTotal: 0,
    penaltyTotal: 0,
    daysOverdue: 0,
    ...overrides,
  };

  const utils = render(<PartialPaymentDialog {...props} />);
  return { ...utils, onAmountChange, onConfirm, onOpenChange };
}

describe("PartialPaymentDialog", () => {
  it("renderiza título e resumo do contrato ao abrir", () => {
    renderDialog();
    expect(screen.getByText(/pagamento parcial/i)).toBeInTheDocument();
    expect(screen.getByText(/resumo do contrato/i)).toBeInTheDocument();
    // Valor emprestado — regex tolerante ao NBSP do Intl pt-BR.
    expect(screen.getAllByText(/R\$\s?1\.000,00/).length).toBeGreaterThan(0);
    // Parcelas pagas / total.
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    // Parcelas pendentes: 5 - 2 = 3 — pode aparecer em outros locais também.
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("emite onAmountChange quando o usuário digita no campo Valor recebido", () => {
    const { onAmountChange } = renderDialog();
    const input = screen.getByLabelText("Valor recebido (R$)");
    fireEvent.change(input, { target: { value: "150" } });
    expect(onAmountChange).toHaveBeenCalledWith("150");
  });

  it("desabilita 'Confirmar pagamento' quando o valor é 0 (inválido)", () => {
    renderDialog({ amount: "0" });
    const btn = screen.getByRole("button", { name: /confirmar pagamento/i });
    expect(btn).toBeDisabled();
  });

  it("simula a distribuição: com valor 100 sem encargos, tudo vai para juros/principal", () => {
    // interestPendingCycle=50, sem encargos → 50 para juros, 50 para principal.
    renderDialog({ amount: "100" });
    expect(screen.getByText(/resultado da operação/i)).toBeInTheDocument();
    // Saldo após operação = 650 - 100 = 550. Regex por causa do NBSP do Intl.
    expect(screen.getAllByText(/R\$\s?550,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/em andamento/i)).toBeInTheDocument();
  });

  it("sinaliza 'Contrato será quitado' quando o valor cobre todo o saldo restante", () => {
    renderDialog({ amount: "650" });
    expect(screen.getByText(/contrato será quitado/i)).toBeInTheDocument();
  });

  it("desabilita confirmar quando há métodos disponíveis mas nenhum selecionado", () => {
    renderDialog({
      amount: "100",
      methods: [{ id: "m1", name: "PIX" }],
      selectedMethodId: "",
    });
    expect(screen.getByRole("button", { name: /confirmar pagamento/i })).toBeDisabled();
  });

  it("habilita e chama onConfirm quando valor > 0 e método selecionado", () => {
    const { onConfirm } = renderDialog({
      amount: "100",
      methods: [{ id: "m1", name: "PIX" }],
      selectedMethodId: "m1",
    });
    const btn = screen.getByRole("button", { name: /confirmar pagamento/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("mostra o bloco 'Em atraso' quando daysOverdue > 0", () => {
    renderDialog({
      daysOverdue: 15,
      lateInterestTotal: 25,
      penaltyTotal: 20,
      remainingWithFees: 695,
    });
    // Pode aparecer em mais de um lugar (título + linhas de detalhe).
    expect(screen.getAllByText(/em atraso/i).length).toBeGreaterThan(0);
    expect(screen.getByText("15d")).toBeInTheDocument();
    expect(screen.getByText(/multa acumulada/i)).toBeInTheDocument();
    expect(screen.getByText(/juros de atraso/i)).toBeInTheDocument();
  });
});
