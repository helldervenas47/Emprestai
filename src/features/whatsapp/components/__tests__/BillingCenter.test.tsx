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

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const mockLoans = [
  {
    id: "loan-0",
    user_id: "user-1",
    borrower_id: "client-0",
    borrower_name: "Cliente Atrasado",
    due_date: addDays(today, -2), // Vencido há 2 dias
    amount: 400,
    remaining_amount: 400,
    installments: 1,
    paid_installments: 0,
    status: "active",
    tags: ["Empréstimo Antigo"],
  },
  {
    id: "loan-1",
    user_id: "user-1",
    borrower_id: "client-1",
    borrower_name: "Cliente Carlos",
    due_date: addDays(today, 1), // Amanhã (D+1)
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
    due_date: addDays(today, 2), // D+2
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
    due_date: addDays(today, 4), // D+4
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
    id: "client-0",
    user_id: "user-1",
    name: "Cliente Atrasado",
    phone: "(11) 99999-0000",
    auto_billing_enabled: true,
  },
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
    from: (table: string) => {
      const result = () => {
        if (table === "loans") return { data: mockLoans, error: null };
        if (table === "clients") return { data: mockClients, error: null };
        return { data: [], error: null };
      };
      const query: any = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        lt: () => query,
        order: () => query,
        limit: () => Promise.resolve(result()),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: any) => resolve(result()),
      };
      return query;
    },
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

  it("renderiza os 6 cards de resumo: Total a receber, Juros a receber, Total cobranças, Cobranças realizadas, Clientes e Enviadas hoje", async () => {
    render(<BillingCenter />);

    await waitFor(() => {
      expect(screen.getByText("Total a receber")).toBeInTheDocument();
      expect(screen.getByText("Juros a receber")).toBeInTheDocument();
      expect(screen.getByText("Total cobranças")).toBeInTheDocument();
      expect(screen.getByText("Cobranças realizadas")).toBeInTheDocument();
      expect(screen.getAllByText("Clientes").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Enviadas hoje")).toBeInTheDocument();
    });
  });

  it("renderiza o seletor de dias na aba Dia e permite navegar entre os dias e resetar para hoje", async () => {
    render(<BillingCenter />);

    // Aguardar carregar e mudar para a aba "Dia"
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Dia$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Dia$/i }));

    await waitFor(() => {
      expect(screen.getAllByTitle("Dia anterior")[0]).toBeInTheDocument();
    });

    const diaAnteriorBtn = screen.getAllByTitle("Dia anterior")[0];
    const proximoDiaBtn = screen.getAllByTitle("Próximo dia")[0];

    expect(diaAnteriorBtn).toBeInTheDocument();
    expect(proximoDiaBtn).toBeInTheDocument();
    expect(screen.getAllByTitle("Dia atual")[0]).toBeInTheDocument();

    // Avançar para o próximo dia (Amanhã / D+1)
    fireEvent.click(proximoDiaBtn);

    await waitFor(() => {
      // O cliente com vencimento amanhã (Cliente Carlos) deve aparecer
      expect(screen.getByText("Cliente Carlos")).toBeInTheDocument();
      expect(screen.getAllByTitle("Clique para voltar ao dia atual")[0]).toBeInTheDocument();
    });

    // Clicar na data para voltar para hoje
    fireEvent.click(screen.getAllByTitle("Clique para voltar ao dia atual")[0]);

    await waitFor(() => {
      expect(screen.queryByText("Cliente Carlos")).not.toBeInTheDocument();
      expect(screen.getAllByTitle("Dia atual")[0]).toBeInTheDocument();
    });
  });

  it("permite ativar o flag de incluir cobranças anteriores na aba Dia e exibe cobranças vencidas até o dia selecionado", async () => {
    render(<BillingCenter />);

    // Mudar para a aba "Dia"
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Dia$/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /^Dia$/i }));

    // Por padrão (flag desativado), o cliente vencido há 2 dias não aparece na aba Dia (data = hoje)
    await waitFor(() => {
      expect(screen.getByText("Incluir anteriores")).toBeInTheDocument();
    });
    expect(screen.queryByText("Cliente Atrasado")).not.toBeInTheDocument();

    // Ativar o flag "Incluir anteriores"
    const checkbox = screen.getByLabelText("Incluir anteriores");
    fireEvent.click(checkbox);

    // Agora o cliente vencido antes de hoje deve aparecer na lista
    await waitFor(() => {
      expect(screen.getByText("Cliente Atrasado")).toBeInTheDocument();
    });
  });
});
