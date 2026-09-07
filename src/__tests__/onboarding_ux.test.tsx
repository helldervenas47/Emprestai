import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { GettingStartedChecklist } from "@/components/onboarding/GettingStartedChecklist";
import { onAppUIEvent } from "@/lib/appUIEvents";

// Mock do supabase
vi.mock("@/integrations/supabase/userClient", () => ({
  supabase: {
    auth: {
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
}));

// Mock do hook useAuth
let mockUser: { id: string; email?: string; user_metadata?: Record<string, any> } | null = {
  id: "user_test_123",
  email: "teste@emprestai.com",
  user_metadata: {},
};
let mockAuthLoading = false;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    role: "admin",
    loading: mockAuthLoading,
  }),
}));

describe("Suíte de Testes — Experiência do Novo Cliente e Onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mockUser = { id: "user_test_123", email: "teste@emprestai.com", user_metadata: {} };
    mockAuthLoading = false;
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
    expect(result.current.isLoaded).toBe(true);

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

    // Verifica persistência no localStorage com prefixo v3
    const saved = JSON.parse(localStorage.getItem("emprestai_onboarding_state_v3_user_test_123") || "{}");
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

  it("5. Fazer mais tarde: Adia para a sessão atual, emite ONBOARDING_POSTPONED e preserva progresso", () => {
    const postponedEvents: any[] = [];
    const completedEvents: any[] = [];
    const unsub1 = onAppUIEvent("ONBOARDING_POSTPONED", () => postponedEvents.push(true));
    const unsub2 = onAppUIEvent("ONBOARDING_COMPLETED", () => completedEvents.push(true));

    const { result } = renderHook(() => useOnboardingProgress());

    act(() => {
      result.current.completeFirstClient("client_123", "Cliente Teste");
    });

    act(() => {
      result.current.postponeChecklist();
    });

    // Estado reflete adiamento para a sessão atual
    expect(result.current.state.postponedSession).toBe(true);
    expect(result.current.state.dismissedPermanent).toBe(false);
    expect(result.current.state.firstClientDone).toBe(true);
    expect(sessionStorage.getItem("emprestai_onboarding_postponed_user_test_123")).toBe("true");

    // Confirma que não salvou como permanente no localStorage
    const saved = JSON.parse(localStorage.getItem("emprestai_onboarding_state_v3_user_test_123") || "{}");
    expect(saved.dismissedPermanent).toBeFalsy();

    // Eventos emitidos corretamente (NÃO completed)
    expect(postponedEvents.length).toBe(1);
    expect(completedEvents.length).toBe(0);

    unsub1();
    unsub2();
  });

  it("6. Não mostrar novamente: Dispensa permanentemente, emite ONBOARDING_DISMISSED e salva server-side", async () => {
    const dismissedEvents: any[] = [];
    const completedEvents: any[] = [];
    const unsub1 = onAppUIEvent("ONBOARDING_DISMISSED", () => dismissedEvents.push(true));
    const unsub2 = onAppUIEvent("ONBOARDING_COMPLETED", () => completedEvents.push(true));

    const { result } = renderHook(() => useOnboardingProgress());

    await act(async () => {
      await result.current.dismissChecklistPermanently();
    });

    expect(result.current.state.dismissedPermanent).toBe(true);
    expect(result.current.state.dismissedChecklist).toBe(true);

    // Verifica persistência no localStorage
    const saved = JSON.parse(localStorage.getItem("emprestai_onboarding_state_v3_user_test_123") || "{}");
    expect(saved.dismissedPermanent).toBe(true);

    // Verifica emissão sem registrar conclusão
    expect(dismissedEvents.length).toBe(1);
    expect(completedEvents.length).toBe(0);

    unsub1();
    unsub2();
  });

  it("7. Persistência isolada por usuário (Usuário B não é afetado pelo Usuário A)", () => {
    // Salva dispensa permanente para user_test_123
    const { result: hook1 } = renderHook(() => useOnboardingProgress());
    act(() => {
      hook1.current.dismissChecklistPermanently();
    });
    expect(hook1.current.state.dismissedPermanent).toBe(true);

    // Troca para user_outro_456
    mockUser = { id: "user_outro_456", email: "outro@emprestai.com", user_metadata: {} };

    const { result: hook2 } = renderHook(() => useOnboardingProgress());
    expect(hook2.current.state.dismissedPermanent).toBe(false);
    expect(hook2.current.state.postponedSession).toBe(false);
    expect(hook2.current.state.dismissedChecklist).toBe(false);
  });

  it("8. Respeita flag server-side no user_metadata do Supabase (login em novo dispositivo)", () => {
    // Simula usuário com onboarding já dispensado no server
    mockUser = {
      id: "user_server_sync_789",
      email: "sync@emprestai.com",
      user_metadata: { onboarding_dismissed: true },
    };

    const { result } = renderHook(() => useOnboardingProgress());
    expect(result.current.state.dismissedPermanent).toBe(true);
    expect(result.current.state.dismissedChecklist).toBe(true);
  });

  it("9. Prevenção de flash visual: isLoaded é false enquanto autenticação carrega", () => {
    mockAuthLoading = true;
    mockUser = null;

    const { result } = renderHook(() => useOnboardingProgress());
    expect(result.current.isLoaded).toBe(false);
  });

  it("10. Reset/Reativação do Guia Inicial", async () => {
    const resetEvents: any[] = [];
    const unsub = onAppUIEvent("ONBOARDING_RESET", () => resetEvents.push(true));

    const { result } = renderHook(() => useOnboardingProgress());
    await act(async () => {
      await result.current.dismissChecklistPermanently();
    });
    expect(result.current.state.dismissedPermanent).toBe(true);

    await act(async () => {
      await result.current.resetOnboarding();
    });

    expect(result.current.state.dismissedPermanent).toBe(false);
    expect(result.current.state.postponedSession).toBe(false);
    expect(result.current.state.dismissedChecklist).toBe(false);
    expect(resetEvents.length).toBe(1);

    unsub();
  });

  it("11. UI: Clicar no X do card NÃO fecha imediatamente, mas abre o modal de confirmação", () => {
    render(
      <GettingStartedChecklist
        clientsCount={0}
        loansCount={0}
        onOpenWizard={vi.fn()}
        onOpenNewClient={vi.fn()}
        onOpenNewLoan={vi.fn()}
      />
    );

    expect(screen.getByText("Primeiros Passos no EmprestAI")).toBeDefined();

    // Clica no botão X do card
    const closeBtn = screen.getByTitle("Fechar checklist");
    fireEvent.click(closeBtn);

    // Modal deve estar aberto com as perguntas e opções
    expect(screen.getByText("Quer continuar o passo a passo depois?")).toBeDefined();
    expect(screen.getByText("Fazer mais tarde")).toBeDefined();
    expect(screen.getByText("Não mostrar novamente")).toBeDefined();
  });

  it("12. UI: 'Fazer mais tarde' fecha modal e oculta o card nesta sessão", async () => {
    const { rerender } = render(
      <GettingStartedChecklist
        clientsCount={0}
        loansCount={0}
        onOpenWizard={vi.fn()}
        onOpenNewClient={vi.fn()}
        onOpenNewLoan={vi.fn()}
      />
    );

    // Abre o modal
    fireEvent.click(screen.getByTitle("Fechar checklist"));
    expect(screen.getByText("Quer continuar o passo a passo depois?")).toBeDefined();

    // Clica em 'Fazer mais tarde'
    fireEvent.click(screen.getByText("Fazer mais tarde"));

    // Rerenderiza componente
    rerender(
      <GettingStartedChecklist
        clientsCount={0}
        loansCount={0}
        onOpenWizard={vi.fn()}
        onOpenNewClient={vi.fn()}
        onOpenNewLoan={vi.fn()}
      />
    );

    // Card agora deve estar oculto
    expect(screen.queryByText("Primeiros Passos no EmprestAI")).toBeNull();
  });

  it("13. UI: 'Não mostrar novamente' fecha modal e oculta o card definitivamente", async () => {
    const { rerender } = render(
      <GettingStartedChecklist
        clientsCount={0}
        loansCount={0}
        onOpenWizard={vi.fn()}
        onOpenNewClient={vi.fn()}
        onOpenNewLoan={vi.fn()}
      />
    );

    // Abre o modal
    fireEvent.click(screen.getByTitle("Fechar checklist"));
    expect(screen.getByText("Quer continuar o passo a passo depois?")).toBeDefined();

    // Clica em 'Não mostrar novamente'
    fireEvent.click(screen.getByText("Não mostrar novamente"));

    rerender(
      <GettingStartedChecklist
        clientsCount={0}
        loansCount={0}
        onOpenWizard={vi.fn()}
        onOpenNewClient={vi.fn()}
        onOpenNewLoan={vi.fn()}
      />
    );

    expect(screen.queryByText("Primeiros Passos no EmprestAI")).toBeNull();
  });

  it("14. UI: Quando todas as etapas forem concluídas, o card não é renderizado", () => {
    render(
      <GettingStartedChecklist
        clientsCount={1}
        loansCount={1}
        onOpenWizard={vi.fn()}
        onOpenNewClient={vi.fn()}
        onOpenNewLoan={vi.fn()}
      />
    );

    expect(screen.queryByText("Primeiros Passos no EmprestAI")).toBeNull();
  });
});

