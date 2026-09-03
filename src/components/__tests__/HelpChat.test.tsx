import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HelpChat from "@/components/HelpChat";

vi.mock("@/hooks/useAppBranding", () => ({
  useAppBranding: () => ({
    branding: {
      brand_name: "Emprestaii",
      logo_url: null,
      sizes: {},
    },
  }),
  FALLBACK_LOGO: "/logo-icon.png",
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
  useIsMobileOrTablet: () => false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("HelpChat — Assistente IA Redesenhado", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renderiza o painel inicial com as 4 categorias de prompts inteligentes", () => {
    render(<HelpChat />);

    expect(screen.getByText(/Como posso ajudar você hoje no Emprestaii?/i)).toBeInTheDocument();
    expect(screen.getByText("Empréstimos & Cobranças")).toBeInTheDocument();
    expect(screen.getByText("Fluxo Financeiro & Caixa")).toBeInTheDocument();
    expect(screen.getByText("Vendas & Estoque")).toBeInTheDocument();
    expect(screen.getByText("Metas & Cofrinhos")).toBeInTheDocument();
    expect(screen.getByText("Quem vence hoje?")).toBeInTheDocument();
    expect(screen.getByText("Qual meu fluxo de caixa do mês?")).toBeInTheDocument();
  });

  it("exibe o status online e badges de capacidade", () => {
    render(<HelpChat />);

    expect(screen.getByText(/Online • Conectado à sua base de dados/i)).toBeInTheDocument();
    expect(screen.getByText("Análise em Tempo Real")).toBeInTheDocument();
    expect(screen.getByText("Privacidade Bancária")).toBeInTheDocument();
  });

  it("permite selecionar um prompt rápido e inicia o envio", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "Hoje você tem 2 parcelas vencendo no valor total de R$ 1.500,00." }),
    });

    render(<HelpChat />);

    const promptBtn = screen.getByText("Quem vence hoje?");
    fireEvent.click(promptBtn);

    // O texto da pergunta deve aparecer na tela
    expect(await screen.findByText("Quem vence hoje?")).toBeInTheDocument();

    // A resposta mockada do assistente deve ser exibida
    expect(await screen.findByText(/Hoje você tem 2 parcelas vencendo/i)).toBeInTheDocument();
  });

  it("permite alternar e pesquisar no histórico de conversas", async () => {
    render(<HelpChat />);

    const toggleHistoryBtn = screen.getByLabelText("Alternar histórico");
    fireEvent.click(toggleHistoryBtn);

    expect(screen.getByPlaceholderText(/Buscar no histórico.../i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /nova conversa/i }).length).toBeGreaterThan(0);
  });
});
