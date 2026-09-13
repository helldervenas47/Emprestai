import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { WhatsappReportCard } from "@/components/WhatsappReportCard";

const mockUser = { id: "user-1" };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    dataOwnerId: "user-1",
  }),
}));

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());

const mockLoans = [
  {
    id: "loan-sent",
    user_id: "user-1",
    borrower_id: "client-1",
    borrower_name: "Cliente Enviado",
    due_date: today,
    amount: 500,
    interest_rate: 10,
    remaining_amount: 500,
    installments: 1,
    paid_installments: 0,
    status: "active",
    tags: ["Contrato A"],
  },
  {
    id: "loan-pending",
    user_id: "user-1",
    borrower_id: "client-2",
    borrower_name: "Cliente Pendente",
    due_date: today,
    amount: 300,
    interest_rate: 20,
    remaining_amount: 300,
    installments: 1,
    paid_installments: 0,
    status: "active",
    tags: ["Contrato B"],
  },
];

const mockClients = [
  {
    id: "client-1",
    user_id: "user-1",
    name: "Cliente Enviado",
    phone: "(11) 99999-1111",
  },
  {
    id: "client-2",
    user_id: "user-1",
    name: "Cliente Pendente",
    phone: "(11) 99999-2222",
  },
];

const mockSentQueue = [
  {
    id: "queue-1",
    client_id: "client-1",
    loan_id: "loan-sent",
    loan_ids: ["loan-sent"],
    status: "sent",
    sent_at: new Date().toISOString(),
  },
];

vi.mock("@/integrations/supabase/userClient", () => ({
  supabase: {
    from: (table: string) => {
      const result = () => {
        if (table === "loans") return { data: mockLoans, error: null };
        if (table === "clients") return { data: mockClients, error: null };
        if (table === "whatsapp_billing_queue") return { data: mockSentQueue, error: null };
        return { data: [], error: null };
      };
      const query: any = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        lt: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: any) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  },
}));

describe("WhatsappReportCard — Relatório exclusivo da Central de Cobranças", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza o resumo dividindo cobranças enviadas e não enviadas", async () => {
    render(<WhatsappReportCard />);

    await waitFor(() => {
      expect(screen.getByText("Resumo de Cobranças pelo WhatsApp")).toBeInTheDocument();
    });

    // Top metrics
    expect(screen.getByText("Total a Cobrar")).toBeInTheDocument();
    expect(screen.getByText("Enviadas")).toBeInTheDocument();
    expect(screen.getByText("Não Enviadas")).toBeInTheDocument();

    // Seção de Enviadas
    expect(screen.getByText("Cobranças enviadas pelo WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Cliente Enviado")).toBeInTheDocument();

    // Seção de Não Enviadas
    expect(screen.getByText("Cobranças não enviadas pelo WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Cliente Pendente")).toBeInTheDocument();
  });

  it("exibe totais por seção e total geral", async () => {
    render(<WhatsappReportCard />);

    await waitFor(() => {
      expect(screen.getByText("Total de cobranças enviadas:")).toBeInTheDocument();
      expect(screen.getByText("Total de cobranças não enviadas:")).toBeInTheDocument();
    });
  });
});
