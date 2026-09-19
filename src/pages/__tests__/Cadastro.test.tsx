import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Cadastro from "../Cadastro";
import React from "react";
import { BrowserRouter } from "react-router-dom";

// Mock supabase
const mockSignUp = vi.fn().mockResolvedValue({
  data: {
    user: { id: "user-test-123", email: "teste@email.com" },
    session: null,
  },
  error: null,
});

vi.mock("@/integrations/supabase/userClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signUp: (...args: any[]) => mockSignUp(...args),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
      resend: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
  USER_SUPABASE_URL: "https://test.supabase.co",
  USER_SUPABASE_PUBLISHABLE_KEY: "test-key",
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

// Mock useInviteCodes
vi.mock("@/features/admin/hooks/useInviteCodes", () => ({
  validateInviteCode: vi.fn().mockResolvedValue({ valid: false }),
}));

// Mock username helpers
vi.mock("@/lib/username", () => ({
  normalizeUsername: (u: string) => u.trim().toLowerCase(),
  validateUsernameFormat: () => null,
  isUsernameAvailable: vi.fn().mockResolvedValue(true),
}));

// Mock global fetch for ensureDefaultClienteRole
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ role: "cliente" }),
}) as any;

describe("Cadastro Page (Criação de Conta e Aviso de Validação de Email)", () => {
  it("renderiza o formulário de cadastro com todos os campos e elementos de segurança", () => {
    render(
      <BrowserRouter>
        <Cadastro />
      </BrowserRouter>
    );

    expect(screen.getByText("Crie sua conta")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome Completo")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome de Usuário (login)")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("CPF ou CNPJ")).toBeInTheDocument();
    expect(screen.getByLabelText("Telefone (com DDD)")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha de Acesso")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuar/i })).toBeInTheDocument();
  });

  it("alterna visibilidade da senha no cadastro", () => {
    render(
      <BrowserRouter>
        <Cadastro />
      </BrowserRouter>
    );

    const passwordInput = screen.getByLabelText("Senha de Acesso") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggleBtn = screen.getByLabelText("Exibir senha");
    fireEvent.click(toggleBtn);

    expect(passwordInput.type).toBe("text");
  });

  it("avança para o passo 2 e exibe o aviso de validação de email no passo 3 após cadastro", async () => {
    render(
      <BrowserRouter>
        <Cadastro />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText("Nome Completo"), { target: { value: "Helder V." } });
    fireEvent.change(screen.getByLabelText("Nome de Usuário (login)"), { target: { value: "helder_v" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "helder@email.com" } });
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), { target: { value: "00000000191" } });
    fireEvent.change(screen.getByLabelText("Telefone (com DDD)"), { target: { value: "11999998888" } });
    fireEvent.change(screen.getByLabelText("Senha de Acesso"), { target: { value: "123456" } });
    fireEvent.click(screen.getByLabelText(/Li e aceito os/i));

    // Clica em continuar (Passo 1 -> Passo 2)
    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));

    // Verifica que está no Passo 2
    expect(await screen.findByText("Escolha como começar")).toBeInTheDocument();
    expect(screen.getByText("Teste Grátis (7 dias)")).toBeInTheDocument();

    // Seleciona teste grátis (Passo 2 -> Passo 3)
    fireEvent.click(screen.getByText("Teste Grátis (7 dias)"));

    // Verifica que o Aviso de Validação de Email (Passo 3) é exibido
    await waitFor(() => {
      expect(screen.getByText("Quase lá! Confirme seu email")).toBeInTheDocument();
      expect(screen.getByText("helder@email.com")).toBeInTheDocument();
      expect(screen.getByText("Como ativar sua conta:")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Ir para o Login/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Não recebeu o email\? Reenviar link/i })).toBeInTheDocument();
    });
  });
});
