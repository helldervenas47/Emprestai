import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { BillingCenter } from "../BillingCenter";

const mockUser = { id: "user-1" };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    dataOwnerId: "user-1",
  }),
}));

const mockLoans = [
  {
    id: "loan-1",
    user_id: "user-1",
    borrower_id: "client-1",
    borrower_name: "Cliente Carlos",
    due_date: "2026-09-12", // Amanhã (D+1)
    amount: 500,
    remaining_amount: 500,
    installments: 1,
    paid_installments: 0,
    status: "active",
    tags: ["Empréstimo A"],
  },
  {
    id: "loan-2",
    user_id: "user-1",
    borrower_id: "client-2",
    borrower_name: "Cliente Bruno",
    due_date: "2026-09-13", // D+2
    amount: 300,
    remaining_amount: 300,
    installments: 1,
    paid_installments: 0,
    status: "active",
    tags: ["Empréstimo B"],
  },
  {
    id: "loan-3",
    user_id: "user-1",
    borrower_id: "client-3",
    borrower_name: "Cliente Daniel",
    due_date: "2026-09-15", // D+4
    amount: 700,
    remaining_amount: 700,
    installments: 1,
    paid_installments: 0,
    status: "active",
    tags: ["Empréstimo C"],
  },
];

const mockClients = [
  {
    id: "client-1",
    user_id: "user-1",
    name: "Cliente Carlos",
    phone: "(11) 99999-1111",
    auto_billing_enabled: true,
  },
  {
    id: "client-2",
    user_id: "user-1",
    name: "Cliente Bruno",
    phone: "(11) 99999-2222",
    auto_billing_enabled: true,
  },
  {
    id: "client-3",
    user_id: "user-1",
    name: "Cliente Daniel",
    phone: "(11) 99999-3333",
    auto_billing_enabled: true,
  },
];

vi.mock("@/integrations/supabase/userClient", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          then: (resolve: any) => {
            if (table === "loans") return resolve({ data: mockLoans, error: null });
            if (table === "clients") return resolve({ data: mockClients, error: null });
            if (table === "loan_installments") return resolve({ data: [], error: null });
            if (table === "payments") return resolve({ data: [], error: null });
            if (table === "whatsapp_payment_promises") return resolve({ data: [], error: null });
            if (table === "whatsapp_billing_queue") return resolve({ data: [], error: null });
            return resolve({ data: [], error: null });
          },
        }),
      }),
    }),
  },
}));

describe("BillingCenter — Filtro de Futuras com separação por faixa de dias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza o filtro de futuras agrupado por faixas de dias (ex: Vence em 1 dia, Vence em 2 dias)", async () => {
    render(<BillingCenter />);

    // Aguardar carregamento
    await waitFor(() => {
      expect(screen.getByText("Central de Cobranças")).toBeInTheDocument();
    });

    // Clicar no filtro "Futuras"
    const futurasBtn = screen.getByRole("button", { name: "Futuras" });
    fireEvent.click(futurasBtn);

    // Deve exibir os títulos das faixas de dias
    await waitFor(() => {
      expect(screen.getByText(/Vence em 1 dia/i)).toBeInTheDocument();
      expect(screen.getByText(/Vence em 2 dias/i)).toBeInTheDocument();
      expect(screen.getByText(/Vence em 4 dias/i)).toBeInTheDocument();
    });

    // Deve exibir as pastas dos clientes nas suas respectivas faixas
    expect(screen.getByText("Cliente Carlos")).toBeInTheDocument();
    expect(screen.getByText("Cliente Bruno")).toBeInTheDocument();
    expect(screen.getByText("Cliente Daniel")).toBeInTheDocument();
  });
});
