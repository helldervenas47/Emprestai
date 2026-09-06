import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { emitAppUIEvent } from "@/lib/appUIEvents";

export interface OnboardingState {
  started: boolean;
  setupDone: boolean;
  firstClientDone: boolean;
  firstLoanDone: boolean;
  completed: boolean;
  skipped: boolean;
  dismissedChecklist: boolean;
  businessName?: string;
  createdClientId?: string;
  createdClientName?: string;
}

const STORAGE_PREFIX = "emprestai_onboarding_state_v2_";

const defaultState: OnboardingState = {
  started: false,
  setupDone: false,
  firstClientDone: false,
  firstLoanDone: false,
  completed: false,
  skipped: false,
  dismissedChecklist: false,
};

export function useOnboardingProgress() {
  const { user } = useAuth();
  const userId = user?.id;
  const storageKey = userId ? `${STORAGE_PREFIX}${userId}` : null;

  const [state, setState] = useState<OnboardingState>(() => {
    if (!storageKey || typeof window === "undefined") return defaultState;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return { ...defaultState, ...JSON.parse(saved) };
    } catch (e) {
      console.error("[useOnboardingProgress] Error parsing state", e);
    }
    return defaultState;
  });

  // Salvar no localStorage sempre que o estado mudar
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {
      console.error("[useOnboardingProgress] Error saving state", e);
    }
  }, [state, storageKey]);

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

  const skipOnboarding = useCallback(() => {
    setState((prev) => {
      emitAppUIEvent({ type: "ONBOARDING_SKIPPED" });
      return {
        ...prev,
        started: true,
        skipped: true,
        dismissedChecklist: true,
      };
    });
  }, []);

  const dismissChecklist = useCallback(() => {
    setState((prev) => ({
      ...prev,
      dismissedChecklist: true,
    }));
  }, []);

  return {
    state,
    startOnboarding,
    completeSetup,
    completeFirstClient,
    completeFirstLoan,
    skipOnboarding,
    dismissChecklist,
  };
}
