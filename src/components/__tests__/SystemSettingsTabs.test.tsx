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
});
