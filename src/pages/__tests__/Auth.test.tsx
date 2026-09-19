import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Auth from "../Auth";
import React from "react";

// Mock supabase client
vi.mock("@/integrations/supabase/userClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Mock TurnstileWidget
vi.mock("@/components/TurnstileWidget", () => ({
  TurnstileWidget: ({ onToken }: { onToken: (t: string) => void }) => (
    <div data-testid="turnstile-mock">
      <button type="button" onClick={() => onToken("mock-captcha-token")}>
        Simulate Captcha
      </button>
    </div>
  ),
}));

// Mock useAppBranding
vi.mock("@/hooks/useAppBranding", () => ({
  useAppBranding: () => ({
    branding: {
      brand_name: "EmprestAI",
      logo_url: "/logo.png",
      sizes: {
        auth: { desktop: 48, mobile: 40, tablet: 44 },
      },
    },
  }),
}));

describe("Auth Page (Split Screen Login e Recuperação de Acesso)", () => {
  it("renderiza a tela de login Split Screen com vitrine e formulário", () => {
    render(<Auth />);

    // Vitrine SaaS / Showcase
    expect(screen.getByText(/Tudo o que você precisa para gerenciar contratos/i)).toBeInTheDocument();
    expect(screen.getByText("Automação Inteligente")).toBeInTheDocument();
    expect(screen.getByText("DRE & Lucro")).toBeInTheDocument();

    // Formulário de Login (Centralizado)
    expect(screen.getByText("Bem-vindo de volta")).toBeInTheDocument();
    expect(screen.getByLabelText("Email ou Usuário")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entrar no sistema/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver planos e preços" })).toBeInTheDocument();
  });

  it("alterna visibilidade da senha ao clicar no botão de olho", () => {
    render(<Auth />);

    const passwordInput = screen.getByLabelText("Senha") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggleBtn = screen.getByLabelText("Exibir senha");
    fireEvent.click(toggleBtn);

    expect(passwordInput.type).toBe("text");
  });

  it("permite navegar para recuperação de senha e voltar para o login", () => {
    render(<Auth />);

    const forgotBtn = screen.getByRole("button", { name: /Esqueceu a senha\?/i });
    fireEvent.click(forgotBtn);

    expect(screen.getByText("Recuperar Acesso")).toBeInTheDocument();
    expect(screen.getByLabelText("Email cadastrado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar link de recuperação" })).toBeInTheDocument();

    const backBtn = screen.getByRole("button", { name: /Voltar ao login/i });
    fireEvent.click(backBtn);

    expect(screen.getByText("Bem-vindo de volta")).toBeInTheDocument();
  });
});
