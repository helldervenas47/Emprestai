import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Pricing from "../Pricing";
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock supabase
vi.mock("@/integrations/supabase/userClient", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({
              data: [
                {
                  id: "plan-1",
                  name: "Plano Básico",
                  description: "Ideal para autônomos",
                  price: 49.9,
                  price_semestral: null,
                  price_anual: null,
                  discount_semestral: 15,
                  discount_anual: 25,
                  badge: null,
                  promo_text: null,
                  highlight_color: null,
                  highlight: false,
                  recommended: false,
                  features: ["Até 50 contratos", "Suporte via email"],
                  sort_order: 1,
                  show_monthly: true,
                  show_semestral: true,
                  show_anual: true,
                  is_addon: false,
                  addon_key: null,
                },
                {
                  id: "plan-2",
                  name: "Plano Pro",
                  description: "Para quem quer escalar",
                  price: 99.9,
                  price_semestral: null,
                  price_anual: null,
                  discount_semestral: 15,
                  discount_anual: 25,
                  badge: "Mais Popular",
                  promo_text: null,
                  highlight_color: null,
                  highlight: true,
                  recommended: true,
                  features: ["Contratos Ilimitados", "Relatórios DRE", "Multi-usuários"],
                  sort_order: 2,
                  show_monthly: true,
                  show_semestral: true,
                  show_anual: true,
                  is_addon: false,
                  addon_key: null,
                },
              ],
            }),
        }),
      }),
    }),
  },
}));

// Mock useAuth
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

// Mock useAppBranding
vi.mock("@/hooks/useAppBranding", () => ({
  useAppBranding: () => ({
    branding: {
      brand_name: "EmprestAI",
      logo_url: "/logo.png",
      sizes: {
        header: { desktop: 32, mobile: 28, tablet: 30 },
      },
    },
  }),
}));

// Mock useAccountProfile
vi.mock("@/hooks/useAccountProfile", () => ({
  useAccountProfile: () => ({ profile: null }),
}));

// Mock useAsaasCheckout
vi.mock("@/hooks/useAsaasCheckout", () => ({
  useAsaasCheckout: () => ({
    mutate: vi.fn(),
    isPending: false,
    data: null,
    reset: vi.fn(),
  }),
}));

describe("Pricing Page (Página de Planos e Preços)", () => {
  const queryClient = new QueryClient();

  it("renderiza os elementos principais, hero, seletor de ciclos e FAQ", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Pricing />
        </BrowserRouter>
      </QueryClientProvider>
    );

    // Hero
    expect(screen.getByText(/Controle seus empréstimos/i)).toBeInTheDocument();
    expect(screen.getByText(/com máxima precisão/i)).toBeInTheDocument();

    // Seletor de Ciclos
    expect(screen.getByText("Mensal")).toBeInTheDocument();
    expect(screen.getByText("Semestral")).toBeInTheDocument();
    expect(screen.getByText("Anual")).toBeInTheDocument();

    // Planos carregados
    expect(await screen.findByText("Plano Básico")).toBeInTheDocument();
    expect(await screen.findByText("Plano Pro")).toBeInTheDocument();
    expect(await screen.findByText("Mais Popular")).toBeInTheDocument();

    // FAQ
    expect(screen.getByText("Perguntas Frequentes")).toBeInTheDocument();
    expect(screen.getByText("Quais são as formas de pagamento aceitas?")).toBeInTheDocument();
    expect(screen.getByText("Como funciona o cancelamento?")).toBeInTheDocument();
  });
});
