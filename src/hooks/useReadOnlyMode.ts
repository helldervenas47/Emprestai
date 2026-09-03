import { useEffect } from "react";
import { usePlanEntitlements } from "@/features/admin/hooks/usePlanEntitlements";
import { setReadOnly } from "@/lib/readOnlyState";

/**
 * Modo somente leitura: trial expirado e sem assinatura paga.
 * Independente de expiration_action ("readonly" | "force_upgrade" | "block_all")
 * — qualquer expiração sem upgrade trava ações de escrita.
 *
 * Para "block_all", o TrialExpiredGate continua mostrando a tela cheia.
 */
export function useReadOnlyMode() {
  const { trial, isPaid, loading } = usePlanEntitlements();
  const readOnly = !loading && trial.expired && !isPaid;

  useEffect(() => {
    setReadOnly(readOnly);
  }, [readOnly]);

  return {
    readOnly,
    loading,
    reason: readOnly ? ("trial_expired" as const) : null,
  };
}
