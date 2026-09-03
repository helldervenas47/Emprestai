import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubscriptionGate } from "../SubscriptionGate";
import { MemoryRouter } from "react-router-dom";

let mockSubscription = { isActive: false, planTier: 0, loading: false };
let mockPlanEntitlements = { plan: null, trial: { active: false, daysLeft: 0, endsAt: null }, loading: false };
let mockAuth = { role: "user" };

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => mockSubscription,
  PLAN_TIERS: {
    basico: 1,
    profissional: 2,
    empresarial: 3,
  },
}));

vi.mock("@/features/admin/hooks/usePlanEntitlements", () => ({
  usePlanEntitlements: () => mockPlanEntitlements,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuth,
}));

describe("SubscriptionGate", () => {
  beforeEach(() => {
    mockSubscription = { isActive: false, planTier: 0, loading: false };
    mockPlanEntitlements = { plan: null, trial: { active: false, daysLeft: 0, endsAt: null }, loading: false };
    mockAuth = { role: "user" };
  });

  it("permite acesso total quando o teste grátis está ativo (trial.active = true)", () => {
    mockPlanEntitlements = {
      plan: null,
      trial: { active: true, daysLeft: 7, endsAt: "2026-09-08" },
      loading: false,
    };

    render(
      <MemoryRouter>
        <SubscriptionGate requiredTier={2} featureName="Empréstimos">
          <div data-testid="conteudo-liberado">Conteúdo de Empréstimos</div>
        </SubscriptionGate>
      </MemoryRouter>
    );

    expect(screen.getByTestId("conteudo-liberado")).toBeInTheDocument();
    expect(screen.queryByText(/Funcionalidade Premium/i)).not.toBeInTheDocument();
  });

  it("bloqueia o acesso quando o teste grátis expirou e não há plano ativo", () => {
    mockPlanEntitlements = {
      plan: null,
      trial: { active: false, daysLeft: 0, endsAt: null },
      loading: false,
    };

    render(
      <MemoryRouter>
        <SubscriptionGate requiredTier={2} featureName="Empréstimos">
          <div data-testid="conteudo-liberado">Conteúdo de Empréstimos</div>
        </SubscriptionGate>
      </MemoryRouter>
    );

    expect(screen.queryByTestId("conteudo-liberado")).not.toBeInTheDocument();
    expect(screen.getByText(/Funcionalidade Premium/i)).toBeInTheDocument();
    expect(screen.getByText(/Ver planos/i)).toBeInTheDocument();
  });

  it("permite acesso quando o usuário tem plano pago com tier suficiente", () => {
    mockSubscription = { isActive: true, planTier: 2, loading: false };

    render(
      <MemoryRouter>
        <SubscriptionGate requiredTier={2} featureName="Empréstimos">
          <div data-testid="conteudo-liberado">Conteúdo de Empréstimos</div>
        </SubscriptionGate>
      </MemoryRouter>
    );

    expect(screen.getByTestId("conteudo-liberado")).toBeInTheDocument();
  });
});
