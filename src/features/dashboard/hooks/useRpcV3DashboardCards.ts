/**
 * FASE 7 — Cards do Dashboard servidos pela RPC Financeira V3.
 *
 * Regras:
 *   • a fase de rollout vem de `VITE_RPC_V3_PHASE`
 *     (phase1_admin | phase2_10 | phase3_50 | phase4_100);
 *   • qualquer divergência acima de R$ 0,01 entre legado e RPC interrompe
 *     automaticamente o rollout desta sessão e mantém o legado;
 *   • sem RPC publicada ou sem dados, o legado continua sendo usado.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardLoanTotalsRpc } from "@/features/dashboard/hooks/useDashboardLoanTotalsRpc";
import type { DashboardLoanTotals } from "@/services/dashboardLoanTotalsCore";
import {
  resolveRpcV3Rollout,
  validateDashboardRpcCards,
  type RpcV3Phase,
  type DashboardValidationResult,
} from "@/features/financial/lib/rpcV3Migration";
import { readRpcV3Halt, writeRpcV3Halt } from "@/features/financial/lib/rpcV3HaltStore";

const PHASES: RpcV3Phase[] = ["phase1_admin", "phase2_10", "phase3_50", "phase4_100"];

export function resolveRpcV3PhaseFromEnv(): RpcV3Phase {
  const raw = String((import.meta as any)?.env?.VITE_RPC_V3_PHASE ?? "").trim();
  return (PHASES.find((p) => p === raw) ?? "phase1_admin") as RpcV3Phase;
}

export interface UseRpcV3DashboardCardsInput {
  range: { start: Date; end: Date };
  role?: string | null;
  userId?: string | null;
  /** Totais calculados pelo caminho legado, usados como fallback e comparação. */
  legacy: Partial<DashboardLoanTotals>;
}

export interface RpcV3DashboardCardsResult {
  /** `rpc` somente quando o rollout está ativo e a paridade está dentro de R$ 0,01. */
  source: "rpc" | "legacy";
  totals: Partial<DashboardLoanTotals>;
  validation: DashboardValidationResult | null;
  halted: boolean;
  reason: string;
  phase: RpcV3Phase;
  missing: boolean;
  loading: boolean;
}

export function useRpcV3DashboardCards({
  range,
  role,
  userId,
  legacy,
}: UseRpcV3DashboardCardsInput): RpcV3DashboardCardsResult {
  const phase = resolveRpcV3PhaseFromEnv();
  // A parada é lida do storage já no primeiro render: uma divergência detectada
  // antes NÃO pode ser esquecida por remontagem, troca de aba ou refresh.
  const [haltedReason, setHaltedReason] = useState<string | null>(() => readRpcV3Halt(userId));

  useEffect(() => {
    const persisted = readRpcV3Halt(userId);
    if (persisted && persisted !== haltedReason) setHaltedReason(persisted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const preflight = resolveRpcV3Rollout({ phase, userId, role, haltedReason });

  const { totals, missing, loading } = useDashboardLoanTotalsRpc({
    range,
    role,
    legacy,
    forceEnabled: preflight.enabled,
    enabled: preflight.enabled,
  });

  const validation = useMemo(
    () => (totals ? validateDashboardRpcCards(legacy, totals) : null),
    [totals, legacy],
  );

  const largest = validation?.largestDifference ?? 0;
  const logged = useRef(false);
  useEffect(() => {
    if (!validation || haltedReason) return;
    const problems: string[] = [];
    if (!validation.allWithinTolerance) {
      problems.push(
        ...validation.divergent.map((c) => `${c.label} Δ R$ ${c.diff.toFixed(2)}`),
      );
    }
    // Dashboard híbrido: campo servido pela RPC sem comparação contra o legado.
    if (!validation.overrideCoverageComplete) {
      problems.push(
        `campos sem paridade verificada: ${validation.unvalidatedOverriddenKeys.join(", ")}`,
      );
    }
    if (problems.length === 0) return;
    const reason = `rollout interrompido: ${problems.join(", ")}`;
    setHaltedReason(reason);
    writeRpcV3Halt(userId, reason);
    if (!logged.current) {
      logged.current = true;
      // eslint-disable-next-line no-console
      console.warn(`[rpc_v3] ${reason}`);
    }
  }, [validation, haltedReason, userId]);

  const decision = resolveRpcV3Rollout({
    phase,
    userId,
    role,
    largestDifference: largest,
    haltedReason,
  });

  const useRpc =
    decision.enabled
    && !!totals
    && !missing
    && (validation?.allWithinTolerance ?? false)
    // nunca servir card pela RPC cujo valor não foi comparado com o legado
    && (validation?.overrideCoverageComplete ?? false);

  return {
    source: useRpc ? "rpc" : "legacy",
    totals: useRpc ? totals! : legacy,
    validation,
    halted: decision.halted,
    reason: decision.reason,
    phase,
    missing,
    loading,
  };
}
