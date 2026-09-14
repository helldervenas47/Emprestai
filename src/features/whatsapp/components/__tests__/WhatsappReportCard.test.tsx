import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { WhatsappReportCard, formatBillingReportForWhatsapp } from "@/components/WhatsappReportCard";
import type { BillingCandidate } from "@/features/whatsapp/lib/billingCenter";

const mockUser = { id: "user-1" };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    dataOwnerId: "user-1",
  }),
}));

vi.mock("@/hooks/useScheduledReportPrefs", () => ({
  useScheduledReportPrefs: (table: string) => {
    if (table === "telegram_operational_summary_prefs") {
      return {
        prefs: {
          enabled: false,
          send_time_1: "19:00",
          send_time_2: null,
          send_time_3: null,
          send_whatsapp: true,
          whatsapp_phone: "(11) 99999-8888",
        },
        loading: false,
        save: vi.fn(),
      };
    }
    return {
      prefs: {
        enabled: false,
        send_time_1: "09:00",
        send_time_2: null,
        send_time_3: null,
        send_whatsapp: false,
        whatsapp_phone: null,
      },
      loading: false,
      save: vi.fn(),
    };
  },
}));

vi.mock("@/integrations/supabase/userClient", () => ({
  supabase: {
    from: (table: string) => {
      const result = () => {
        if (table === "whatsapp_billing_schedule") {
          return { data: { provider: "evolution", base_url: "https://api.wpp.com", instance_id: "inst-1" }, error: null };
        }
        if (table === "profiles") {
          return { data: { phone: "(11) 99999-8888" }, error: null };
        }
        return { data: [], error: null };
      };
      const query: any = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        lt: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => Promise.resolve(result()),
        then: (resolve: any) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { sent: true }, error: null }),
    },
  },
}));

describe("WhatsappReportCard — Envio de Relatórios e Resumo Operacional pelo WhatsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza todos os cards: Telefone, Resumo Operacional e Relatório de Cobranças", async () => {
    render(<WhatsappReportCard />);

    await waitFor(() => {
      expect(screen.getByText("Telefone e Destino no WhatsApp")).toBeInTheDocument();
      expect(screen.getByText("Resumo Operacional Diário")).toBeInTheDocument();
      expect(screen.getByText("Relatório de Cobranças pelo WhatsApp")).toBeInTheDocument();
    });

    // Toggle e campos de telefone
    expect(screen.getByText("Ativar envio automático no WhatsApp")).toBeInTheDocument();

    // Seletor de data de referência para relatórios anteriores
    expect(screen.getByText("Data de Referência dos Relatórios")).toBeInTheDocument();
    expect(screen.getAllByText("Hoje").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Ontem")).toBeInTheDocument();
    expect(screen.getByText("Anteontem")).toBeInTheDocument();

    // Botões de pré-visualização
    const previewButtons = screen.getAllByText("Pré-visualizar");
    expect(previewButtons.length).toBeGreaterThanOrEqual(2);

    // Botões de disparo imediato
    expect(screen.getByText("Enviar Resumo Operacional Agora")).toBeInTheDocument();
    expect(screen.getByText("Enviar Relatório Agora no WhatsApp")).toBeInTheDocument();
  });

  it("formata corretamente a mensagem do Relatório de Cobranças com base na aba 'A cobrar'", () => {
    const candidates: BillingCandidate[] = [
      {
        key: "loan-1:1",
        loanId: "loan-1",
        clientId: "client-1",
        clientName: "João da Silva",
        phone: "5511999991111",
        validPhone: true,
        installmentNumber: 1,
        contractLabel: "João da Silva",
        amount: 500,
        baseAmount: 450,
        lateFees: 0,
        interestAmount: 50,
        overdueInstallmentCount: 0,
        dueDate: "2026-09-13",
        billingDate: "2026-09-13",
        daysOverdue: 0,
        priority: "today",
        message: "",
      },
      {
        key: "loan-2:1",
        loanId: "loan-2",
        clientId: "client-2",
        clientName: "Maria Santos",
        phone: "5511999992222",
        validPhone: true,
        installmentNumber: 1,
        contractLabel: "Maria Santos",
        amount: 330,
        baseAmount: 300,
        lateFees: 0,
        interestAmount: 30,
        overdueInstallmentCount: 0,
        dueDate: "2026-09-13",
        billingDate: "2026-09-13",
        daysOverdue: 0,
        priority: "today",
        message: "",
      },
      {
        key: "loan-3:1",
        loanId: "loan-3",
        clientId: "client-3",
        clientName: "Pedro Santos",
        phone: "5511999993333",
        validPhone: true,
        installmentNumber: 1,
        contractLabel: "Pedro Santos",
        amount: 390,
        baseAmount: 350,
        lateFees: 0,
        interestAmount: 40,
        overdueInstallmentCount: 0,
        dueDate: "2026-09-13",
        billingDate: "2026-09-13",
        daysOverdue: 0,
        priority: "today",
        message: "",
      },
    ];

    const sentIds = new Set(["loan-1", "loan-2"]);
    const message = formatBillingReportForWhatsapp(candidates, sentIds, undefined, "2026-09-13");

    expect(message).toContain("📊 *RESUMO DAS COBRANÇAS — HOJE*");
    expect(message).toContain("📌 *RESUMO DO DIA — 13/09/2026*");
    expect(message).toContain("Total de cobranças: *3*");
    expect(message).toContain("✅ Enviadas: *2*");
    expect(message).toContain("⚠️ Não enviadas: *1*");
    expect(message).toContain("💰 Juros: *R$ 120,00*");
    expect(message).toContain("💵 Total a cobrar: *R$ 1.220,00*");
    expect(message).toContain("✅ *COBRANÇAS ENVIADAS*");
    expect(message).toContain("João da Silva / Contratos: 1 / Juros: R$ 50,00 / Total: R$ 500,00");
    expect(message).toContain("Maria Santos / Contratos: 1 / Juros: R$ 30,00 / Total: R$ 330,00");
    expect(message).toContain("*Total enviado: 2 / R$ 80,00 / R$ 830,00*");
    expect(message).toContain("⚠️ *COBRANÇAS NÃO ENVIADAS*");
    expect(message).toContain("Pedro Santos / Contratos: 1 / Juros: R$ 40,00 / Total: R$ 390,00");
    expect(message).toContain("*Total não enviado: 1 / R$ 40,00 / R$ 390,00*");
    expect(message).not.toContain("📊 *FECHAMENTO*");
    expect(message).toContain("*Resumo gerado automaticamente pelo EmprestAI.*");
  });

  it("consolida múltiplos empréstimos do mesmo cliente em apenas uma linha com juros e valor total somados", () => {
    const candidates: BillingCandidate[] = [
      {
        key: "loan-1:1",
        loanId: "loan-1",
        clientId: "client-1",
        clientName: "João da Silva",
        phone: "5511999991111",
        validPhone: true,
        installmentNumber: 1,
        contractLabel: "Empréstimo A",
        amount: 300,
        baseAmount: 270,
        lateFees: 0,
        interestAmount: 30,
        overdueInstallmentCount: 0,
        dueDate: "2026-09-13",
        billingDate: "2026-09-13",
        daysOverdue: 0,
        priority: "today",
        message: "",
      },
      {
        key: "loan-2:1",
        loanId: "loan-2",
        clientId: "client-1",
        clientName: "João da Silva",
        phone: "5511999991111",
        validPhone: true,
        installmentNumber: 1,
        contractLabel: "Empréstimo B",
        amount: 200,
        baseAmount: 180,
        lateFees: 0,
        interestAmount: 20,
        overdueInstallmentCount: 0,
        dueDate: "2026-09-13",
        billingDate: "2026-09-13",
        daysOverdue: 0,
        priority: "today",
        message: "",
      },
    ];

    const sentIds = new Set(["loan-1", "loan-2"]);
    const message = formatBillingReportForWhatsapp(candidates, sentIds);

    // Deve ter apenas UMA ocorrência de João da Silva com Contratos: 2 e a soma dos valores
    expect(message).toContain("João da Silva / Contratos: 2 / Juros: R$ 50,00 / Total: R$ 500,00");
    const count = (message.match(/João da Silva/g) || []).length;
    expect(count).toBe(1);
    expect(message).toContain("Total de cobranças: *2*");
    expect(message).toContain("*Total enviado: 2 / R$ 50,00 / R$ 500,00*");
  });
});
