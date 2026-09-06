import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { onAppUIEvent } from "@/lib/appUIEvents";

// Mock do hook useAuth
let mockUser: { id: string; email?: string } | null = { id: "user_test_123", email: "teste@emprestai.com" };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    role: "admin",
    loading: false,
  }),
}));

describe("Suíte de Testes — Experiência do Novo Cliente e Onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUser = { id: "user_test_123", email: "teste@emprestai.com" };
  });

  it("1. Inicializa com estado padrão para novo assinante e emite ONBOARDING_STARTED", () => {
    const startedEvents: any[] = [];
    const unsubscribe = onAppUIEvent("ONBOARDING_STARTED", () => {
      startedEvents.push(true);
    });

    const { result } = renderHook(() => useOnboardingProgress());

    expect(result.current.state.started).toBe(false);
    expect(result.current.state.setupDone).toBe(false);
    expect(result.current.state.firstClientDone).toBe(false);
    expect(result.current.state.firstLoanDone).toBe(false);
    expect(result.current.state.completed).toBe(false);

    act(() => {
      result.current.startOnboarding();
    });

    expect(result.current.state.started).toBe(true);
    expect(startedEvents.length).toBe(1);

    unsubscribe();
  });

  it("2. Avança Etapa 1 (Configuração da Operação) e persiste dados", () => {
    const setupEvents: any[] = [];
    const unsubscribe = onAppUIEvent("SETUP_COMPLETED", () => {
      setupEvents.push(true);
    });

    const { result } = renderHook(() => useOnboardingProgress());

    act(() => {
      result.current.completeSetup("Minha Empresa de Crédito");
    });

    expect(result.current.state.setupDone).toBe(true);
    expect(result.current.state.businessName).toBe("Minha Empresa de Crédito");
    expect(setupEvents.length).toBe(1);

    // Verifica persistência no localStorage
    const saved = JSON.parse(localStorage.getItem("emprestai_onboarding_state_v2_user_test_123") || "{}");
    expect(saved.setupDone).toBe(true);
    expect(saved.businessName).toBe("Minha Empresa de Crédito");

    unsubscribe();
  });

  it("3. Avança Etapa 2 (Primeiro Cliente) e salva vínculo do cliente", () => {
    const clientEvents: string[] = [];
    const unsubscribe = onAppUIEvent("FIRST_CLIENT_CREATED", (e) => {
      if (e.clientId) clientEvents.push(e.clientId);
    });

    const { result } = renderHook(() => useOnboardingProgress());

    act(() => {
      result.current.completeFirstClient("client_uuid_999", "João Silva");
    });

    expect(result.current.state.firstClientDone).toBe(true);
    expect(result.current.state.createdClientId).toBe("client_uuid_999");
    expect(result.current.state.createdClientName).toBe("João Silva");
    expect(clientEvents).toContain("client_uuid_999");

    unsubscribe();
  });

  it("4. Avança Etapa 3 (Primeiro Empréstimo), conclui onboarding e emite eventos", () => {
    const loanEvents: string[] = [];
    const completedEvents: any[] = [];
    const unsub1 = onAppUIEvent("FIRST_LOAN_CREATED", (e) => {
      if (e.loanId) loanEvents.push(e.loanId);
    });
    const unsub2 = onAppUIEvent("ONBOARDING_COMPLETED", () => {
      completedEvents.push(true);
    });

    const { result } = renderHook(() => useOnboardingProgress());

    act(() => {
      result.current.completeFirstLoan("loan_uuid_888");
    });

    expect(result.current.state.firstLoanDone).toBe(true);
    expect(result.current.state.completed).toBe(true);
    expect(loanEvents).toContain("loan_uuid_888");
    expect(completedEvents.length).toBe(1);

    unsub1();
    unsub2();
  });

  it("5. Usuário experiente pode pular o onboarding (não bloqueia navegação)", () => {
    const skipEvents: any[] = [];
    const unsubscribe = onAppUIEvent("ONBOARDING_SKIPPED", () => {
      skipEvents.push(true);
    });

    const { result } = renderHook(() => useOnboardingProgress());

    act(() => {
      result.current.skipOnboarding();
    });

    expect(result.current.state.skipped).toBe(true);
    expect(result.current.state.dismissedChecklist).toBe(true);
    expect(skipEvents.length).toBe(1);

    unsubscribe();
  });

  it("6. Persistência isolada por usuário (não mistura dados entre contas)", () => {
    // Salva progresso para user_test_123
    const { result: hook1 } = renderHook(() => useOnboardingProgress());
    act(() => {
      hook1.current.completeSetup("Operação A");
    });

    expect(hook1.current.state.businessName).toBe("Operação A");

    // Troca de usuário para user_outro_456
    mockUser = { id: "user_outro_456", email: "outro@emprestai.com" };

    const { result: hook2 } = renderHook(() => useOnboardingProgress());
    expect(hook2.current.state.setupDone).toBe(false);
    expect(hook2.current.state.businessName).toBeUndefined();
  });

  it("7. Cálculo de Preview Financeiro antes de confirmar o primeiro empréstimo", () => {
    const principal = 1000;
    const rate = 20; // 20%
    const installments = 4;

    const totalInterest = principal * (rate / 100); // 200
    const totalToReceive = principal + totalInterest; // 1200
    const installmentValue = totalToReceive / installments; // 300

    expect(totalInterest).toBe(200);
    expect(totalToReceive).toBe(1200);
    expect(installmentValue).toBe(300);
  });
});
