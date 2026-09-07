import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/userClient";
import { emitAppUIEvent } from "@/lib/appUIEvents";

export interface OnboardingState {
  started: boolean;
  setupDone: boolean;
  firstClientDone: boolean;
  firstLoanDone: boolean;
  completed: boolean;
  skipped: boolean;
  dismissedPermanent: boolean;
  postponedSession: boolean;
  dismissedChecklist: boolean;
  businessName?: string;
  createdClientId?: string;
  createdClientName?: string;
}

const STORAGE_PREFIX_V3 = "emprestai_onboarding_state_v3_";
const STORAGE_PREFIX_V2 = "emprestai_onboarding_state_v2_";
const SESSION_PREFIX = "emprestai_onboarding_postponed_";

const defaultState: OnboardingState = {
  started: false,
  setupDone: false,
  firstClientDone: false,
  firstLoanDone: false,
  completed: false,
  skipped: false,
  dismissedPermanent: false,
  postponedSession: false,
  dismissedChecklist: false,
};

function readInitialState(userId: string | undefined, serverDismissed: boolean): { state: OnboardingState; isPostponed: boolean } {
  if (!userId || typeof window === "undefined") {
    return { state: defaultState, isPostponed: false };
  }

  let baseState = { ...defaultState };

  try {
    // Tenta ler do v3
    const savedV3 = localStorage.getItem(`${STORAGE_PREFIX_V3}${userId}`);
    if (savedV3) {
      baseState = { ...defaultState, ...JSON.parse(savedV3) };
    } else {
      // Fallback para migrar v2 se existir
      const savedV2 = localStorage.getItem(`${STORAGE_PREFIX_V2}${userId}`);
      if (savedV2) {
        baseState = { ...defaultState, ...JSON.parse(savedV2) };
      }
    }
  } catch (e) {
    console.error("[useOnboardingProgress] Error reading localStorage", e);
  }

  // Verifica se o servidor marcou como dispensado permanentemente
  if (serverDismissed) {
    baseState.dismissedPermanent = true;
  }

  // Verifica se a sessão atual adiou o checklist
  let isPostponed = false;
  try {
    const sessionVal = sessionStorage.getItem(`${SESSION_PREFIX}${userId}`);
    isPostponed = sessionVal === "true";
  } catch (e) {
    console.error("[useOnboardingProgress] Error reading sessionStorage", e);
  }

  baseState.postponedSession = isPostponed;
  baseState.dismissedChecklist = baseState.dismissedPermanent || isPostponed;

  return { state: baseState, isPostponed };
}

export function useOnboardingProgress() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const storageKey = userId ? `${STORAGE_PREFIX_V3}${userId}` : null;
  const serverDismissed = !!(user?.user_metadata?.onboarding_dismissed);

  const [isLoaded, setIsLoaded] = useState<boolean>(() => !authLoading && !!userId);
  const [state, setState] = useState<OnboardingState>(() => {
    const { state: init } = readInitialState(userId, serverDismissed);
    return init;
  });

  // Atualiza estado quando o usuário é carregado / alterado
  useEffect(() => {
    if (authLoading) return;
    if (userId) {
      const { state: newState } = readInitialState(userId, serverDismissed);
      setState(newState);
      setIsLoaded(true);
    } else {
      setState(defaultState);
      setIsLoaded(true);
    }
  }, [userId, authLoading, serverDismissed]);

  // Salvar no localStorage sempre que o estado relevante mudar
  useEffect(() => {
    if (!storageKey || typeof window === "undefined" || !isLoaded) return;
    try {
      const toSave = {
        started: state.started,
        setupDone: state.setupDone,
        firstClientDone: state.firstClientDone,
        firstLoanDone: state.firstLoanDone,
        completed: state.completed,
        skipped: state.skipped,
        dismissedPermanent: state.dismissedPermanent,
        businessName: state.businessName,
        createdClientId: state.createdClientId,
        createdClientName: state.createdClientName,
      };
      localStorage.setItem(storageKey, JSON.stringify(toSave));
    } catch (e) {
      console.error("[useOnboardingProgress] Error saving state to localStorage", e);
    }
  }, [state, storageKey, isLoaded]);

  const startOnboarding = useCallback(() => {
    setState((prev) => {
      if (prev.started) return prev;
      emitAppUIEvent({ type: "ONBOARDING_STARTED" });
      return { ...prev, started: true };
    });
  }, []);

  const completeSetup = useCallback((businessName?: string) => {
    setState((prev) => {
      emitAppUIEvent({ type: "SETUP_COMPLETED" });
      return {
        ...prev,
        started: true,
        setupDone: true,
        businessName: businessName || prev.businessName,
      };
    });
  }, []);

  const completeFirstClient = useCallback((clientId: string, clientName: string) => {
    setState((prev) => {
      emitAppUIEvent({ type: "FIRST_CLIENT_CREATED", clientId });
      return {
        ...prev,
        started: true,
        firstClientDone: true,
        createdClientId: clientId,
        createdClientName: clientName,
      };
    });
  }, []);

  const completeFirstLoan = useCallback((loanId?: string) => {
    setState((prev) => {
      emitAppUIEvent({ type: "FIRST_LOAN_CREATED", loanId });
      emitAppUIEvent({ type: "ONBOARDING_COMPLETED" });
      return {
        ...prev,
        started: true,
        firstLoanDone: true,
        completed: true,
      };
    });
  }, []);

  // Adiar para depois (apenas nesta sessão)
  const postponeChecklist = useCallback(() => {
    if (userId && typeof window !== "undefined") {
      try {
        sessionStorage.setItem(`${SESSION_PREFIX}${userId}`, "true");
      } catch (e) {
        console.error("[useOnboardingProgress] Error saving to sessionStorage", e);
      }
    }
    emitAppUIEvent({ type: "ONBOARDING_POSTPONED" });
    setState((prev) => ({
      ...prev,
      postponedSession: true,
      dismissedChecklist: true,
    }));
  }, [userId]);

  // Dispensar permanentemente ("Não mostrar novamente")
  const dismissChecklistPermanently = useCallback(async () => {
    emitAppUIEvent({ type: "ONBOARDING_DISMISSED" });
    setState((prev) => ({
      ...prev,
      dismissedPermanent: true,
      dismissedChecklist: true,
    }));

    // Sincronizar server-side no user_metadata do Supabase Auth
    try {
      if (user?.id) {
        await supabase.auth.updateUser({
          data: { onboarding_dismissed: true },
        });
      }
    } catch (e) {
      console.error("[useOnboardingProgress] Error updating server user_metadata", e);
    }
  }, [user?.id]);

  // Reativar / Reiniciar o Guia Inicial
  const resetOnboarding = useCallback(async () => {
    if (userId && typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(`${SESSION_PREFIX}${userId}`);
      } catch (e) {}
    }
    emitAppUIEvent({ type: "ONBOARDING_RESET" });
    setState((prev) => ({
      ...prev,
      dismissedPermanent: false,
      postponedSession: false,
      dismissedChecklist: false,
    }));

    // Limpar no Supabase Auth
    try {
      if (user?.id) {
        await supabase.auth.updateUser({
          data: { onboarding_dismissed: false },
        });
      }
    } catch (e) {
      console.error("[useOnboardingProgress] Error resetting server user_metadata", e);
    }
  }, [user?.id, userId]);

  const skipOnboarding = useCallback(() => {
    emitAppUIEvent({ type: "ONBOARDING_SKIPPED" });
    setState((prev) => ({
      ...prev,
      started: true,
      skipped: true,
      dismissedChecklist: true,
      postponedSession: true,
    }));
  }, []);

  // Mantido para compatibilidade retroativa, mas agora alias para postponeChecklist
  const dismissChecklist = useCallback(() => {
    postponeChecklist();
  }, [postponeChecklist]);

  return {
    state,
    isLoaded,
    startOnboarding,
    completeSetup,
    completeFirstClient,
    completeFirstLoan,
    skipOnboarding,
    postponeChecklist,
    dismissChecklistPermanently,
    resetOnboarding,
    dismissChecklist,
  };
}
