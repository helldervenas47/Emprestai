import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SystemSettings } from "../SystemSettings";
import { PlanManagement } from "@/features/admin/components/admin/PlanManagement";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1" },
    role: "admin",
    loading: false,
  }),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({
    subscription: { product_id: "profissional_plan" },
    isActive: true,
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/features/admin/hooks/usePlans", () => ({
  usePlans: () => ({
    plans: [],
    loading: false,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setRecommended: vi.fn(),
  }),
}));

describe("SystemSettings e PlanManagement — Reorganização de Abas", () => {
  it("renderiza as abas principais de SystemSettings com Administração, Planos, Assinaturas e Conta", () => {
    render(<SystemSettings />);

    expect(screen.getByRole("tab", { name: /Administração/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Planos/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Assinaturas/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Conta/i })).toBeInTheDocument();

    // As antigas abas avulsas não devem mais existir como abas principais
    expect(screen.queryByRole("tab", { name: /Personalização/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Chaves APIs/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Saúde do Sistema/i })).toBeNull();
  });

  it("renderiza PlanManagement com as sub-abas Faturamento, Plano de assinatura e Cupom de desconto, padrão Faturamento", () => {
    render(<PlanManagement />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveTextContent(/Faturamento/i);
    expect(tabs[1]).toHaveTextContent(/Plano de assinatura/i);
    expect(tabs[2]).toHaveTextContent(/Cupom de desconto/i);

    // Aba padrão é Faturamento
    expect(tabs[0]).toHaveAttribute("data-state", "active");
  });

  it("renderiza lista de planos na grade responsiva quando selecionada a aba de planos", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(<PlanManagement />);

    const planTab = screen.getByRole("tab", { name: /Plano de assinatura/i });
    fireEvent.pointerDown(planTab);
    fireEvent.keyDown(planTab, { key: "Enter" });
    fireEvent.click(planTab);

    expect(screen.getByText("Planos de assinatura")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novo plano/i })).toBeInTheDocument();
  });

  it("inicia todos os cards da aba Conta recolhidos por padrão e permite expandir", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(<SystemSettings />);

    // Clica na aba Conta
    const accountTab = screen.getByRole("tab", { name: /Conta/i });
    fireEvent.pointerDown(accountTab);
    fireEvent.keyDown(accountTab, { key: "Enter" });
    fireEvent.click(accountTab);

    // Verifica que os títulos dos cards estão presentes
    expect(screen.getByText(/Plano e assinatura/i)).toBeInTheDocument();
    expect(screen.getByText(/Identidade visual, Logo da Marca & Ícone PWA/i)).toBeInTheDocument();
    expect(screen.getByText(/Fonte do aplicativo/i)).toBeInTheDocument();
    expect(screen.getByText(/Ícones do aplicativo/i)).toBeInTheDocument();
    expect(screen.getByText(/Personalização visual e Tema/i)).toBeInTheDocument();
    expect(screen.getByText(/Chaves APIs/i)).toBeInTheDocument();
    expect(screen.getByText(/Saúde do sistema/i)).toBeInTheDocument();

    // Como todos começam recolhidos, textos internos não visíveis ou indicadores "Expandir" aparecem
    const expandButtons = screen.getAllByRole("button", { name: /Expandir/i });
    expect(expandButtons.length).toBeGreaterThanOrEqual(7);

    // Clica para expandir o primeiro card (Plano e assinatura)
    fireEvent.click(expandButtons[0]);
    expect(screen.getByRole("button", { name: /Gerenciar plano/i })).toBeInTheDocument();
  });
});
