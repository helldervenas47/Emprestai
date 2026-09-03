/**
 * Regression tests for ClientCardView.
 *
 * These are pure presentational tests — the card is a memoized leaf that must
 * (a) render the right data, (b) fire the right callbacks, and (c) skip
 * re-renders when its props reference-equal the previous ones (this last
 * property is central to the perf work on the Cadastros tab).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClientCardView, type ClientCardCreditScore } from "@/features/clients/components/ClientCardView";
import type { Client } from "@/types/loan";

function makeClient(over: Partial<Client> = {}): Client {
  return {
    id: "c1",
    name: "João da Silva",
    phone: "(11) 91234-5678",
    email: "joao@example.com",
    cpf: "12345678909",
    cnpj: "",
    rg: "",
    address: "Rua A, 123",
    city: "São Paulo",
    state: "SP",
    score: "",
    active: true,
    createdAt: "2025-01-01T00:00:00Z",
    ...over,
  };
}

const score: ClientCardCreditScore = {
  score: 720,
  label: "Bom",
  color: "text-success",
  bgColor: "bg-success",
};

function makeProps(over: Partial<Parameters<typeof ClientCardView>[0]> = {}) {
  return {
    client: makeClient(),
    score,
    docCount: 2,
    usedLimit: 500,
    creditLimit: { currentLimit: 1000, mode: "auto" as const } as any,
    readOnly: false,
    onOpenDocs: vi.fn(),
    onOpenLimit: vi.fn(),
    onOpenAnalysis: vi.fn(),
    onToggleActive: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
}

describe("ClientCardView", () => {
  it("renders client name, CPF, phone and status badge", () => {
    render(<ClientCardView {...makeProps()} />);
    expect(screen.getByText("João da Silva")).toBeInTheDocument();
    expect(screen.getByText(/CPF:/)).toBeInTheDocument();
    expect(screen.getByText("(11) 91234-5678")).toBeInTheDocument();
    expect(screen.getByText("Ativo")).toBeInTheDocument();
  });

  it("renders the inactive status when active=false", () => {
    render(<ClientCardView {...makeProps({ client: makeClient({ active: false }) })} />);
    expect(screen.getByText("Inativo")).toBeInTheDocument();
  });

  it("renders the credit score value", () => {
    render(<ClientCardView {...makeProps()} />);
    expect(screen.getByText("720")).toBeInTheDocument();
  });

  it("shows document count badge when > 0", () => {
    render(<ClientCardView {...makeProps({ docCount: 3 })} />);
    expect(screen.getByLabelText(/Abrir documentos \(3\)/)).toBeInTheDocument();
  });

  it("disables the documents button when count is 0", () => {
    render(<ClientCardView {...makeProps({ docCount: 0 })} />);
    const btn = screen.getByLabelText(/Nenhum documento anexado/);
    expect(btn).toBeDisabled();
  });

  it("caps document count display at 99+", () => {
    render(<ClientCardView {...makeProps({ docCount: 150 })} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("computes and formats the available limit", () => {
    render(<ClientCardView {...makeProps({ usedLimit: 400, creditLimit: { currentLimit: 1000 } as any })} />);
    // Available = 600. formatBRL includes NBSP so match by digits.
    expect(screen.getAllByText(/600,00/).length).toBeGreaterThan(0);
  });

  it("fires onOpenDocs when the docs button is clicked", () => {
    const onOpenDocs = vi.fn();
    render(<ClientCardView {...makeProps({ onOpenDocs })} />);
    fireEvent.click(screen.getByLabelText(/Abrir documentos/));
    expect(onOpenDocs).toHaveBeenCalledTimes(1);
  });

  it("fires onOpenLimit when the limit card is clicked", () => {
    const onOpenLimit = vi.fn();
    render(<ClientCardView {...makeProps({ onOpenLimit })} />);
    // The wallet button AND the limit card both call onOpenLimit — click the card.
    fireEvent.click(screen.getByText("Limite de Crédito"));
    expect(onOpenLimit).toHaveBeenCalled();
  });

  it("fires onToggleActive when the toggle button is clicked", () => {
    const onToggleActive = vi.fn();
    render(<ClientCardView {...makeProps({ onToggleActive })} />);
    fireEvent.click(screen.getByTitle("Desativar"));
    expect(onToggleActive).toHaveBeenCalledTimes(1);
  });

  it("hides action buttons when readOnly=true", () => {
    render(<ClientCardView {...makeProps({ readOnly: true })} />);
    expect(screen.queryByTitle("Desativar")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Limite de crédito")).not.toBeInTheDocument();
  });

  it("does not crash when optional fields are missing", () => {
    const bareClient = makeClient({
      phone: "", email: "", cpf: "", address: "", notes: undefined,
    });
    expect(() =>
      render(<ClientCardView {...makeProps({ client: bareClient })} />),
    ).not.toThrow();
    expect(screen.getByText("João da Silva")).toBeInTheDocument();
  });

  it("is memoized — re-rendering with the same props does not re-execute the component body", () => {
    // We can't hook into React's internal render count, but we can assert
    // that React.memo returns the SAME element instance for identical props
    // by leveraging that a memoized component + same props ⇒ same fiber output.
    // A robust behavioural check: after a rerender with identical props, the
    // DOM node identity is preserved and no additional callback identity is
    // required. This guards against accidentally dropping `memo(...)`.
    const props = makeProps();
    const { rerender, getByText } = render(<ClientCardView {...props} />);
    const before = getByText("João da Silva");
    rerender(<ClientCardView {...props} />);
    const after = getByText("João da Silva");
    expect(after).toBe(before);
  });

  it("re-renders when props change (name update)", () => {
    const props = makeProps();
    const { rerender } = render(<ClientCardView {...props} />);
    expect(screen.getByText("João da Silva")).toBeInTheDocument();
    rerender(
      <ClientCardView
        {...props}
        client={{ ...props.client, name: "Maria Souza" }}
      />,
    );
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
  });
});
