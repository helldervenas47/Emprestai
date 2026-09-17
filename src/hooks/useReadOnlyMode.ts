import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePlanEntitlements } from "@/features/admin/hooks/usePlanEntitlements";
import { setReadOnly } from "@/lib/readOnlyState";

/**
 * Modo somente leitura: trial expirado e sem assinatura paga.
 * Independente de expiration_action ("readonly" | "force_upgrade" | "block_all")
 * — qualquer expiração sem upgrade trava ações de escrita.
 *
 * Administradores (`role === 'admin'`) nunca entram em modo somente leitura.
 * Para "block_all", o TrialExpiredGate continua mostrando a tela cheia.
 */
export function useReadOnlyMode() {
  const { role } = useAuth();
  const { trial, isPaid, loading } = usePlanEntitlements();
  const isAdmin = role === "admin";
  const readOnly = !isAdmin && !loading && trial.expired && !isPaid;

  useEffect(() => {
    setReadOnly(readOnly);
  }, [readOnly]);

  return {
    readOnly,
    loading: isAdmin ? false : loading,
    reason: readOnly ? ("trial_expired" as const) : null,
  };
}
