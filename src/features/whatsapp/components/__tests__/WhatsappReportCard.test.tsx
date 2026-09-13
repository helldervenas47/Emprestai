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

    // Botões de disparo imediato
    expect(screen.getByText("Enviar Resumo Operacional Agora")).toBeInTheDocument();
    expect(screen.getByText("Enviar Relatório Agora no WhatsApp")).toBeInTheDocument();
  });
});
