/**
 * ============================================================================
 * ROLLOUT CONTROLADO DA ARQUITETURA UNIFICADA (FASE 4)
 * ============================================================================
 *
 * Função PURA e determinística: o mesmo usuário sempre cai no mesmo bucket,
 * então ninguém alterna entre lógica legada e unificada entre sessões.
 *
 * Precedência:
 *   1. flag desligada          → sempre legado (proteção absoluta);
 *   2. ambiente não habilitado → legado;
 *   3. allowlist               → unificado;
 *   4. percentual determinístico por hash do userId.
 */

import { UNIFIED_FINANCIAL_VERSION } from "@/features/financial/lib/financialVersion";

export interface FinancialRolloutContext {
  userId: string;
  tenantId?: string;
  environment: string;
  rolloutPercentage?: number;
  allowlistedUserIds?: string[];
  /** Ambientes onde o rollout percentual pode ocorrer. */
  enabledEnvironments?: string[];
}

export type RolloutReason =
  | "flag_disabled"
  | "environment_disabled"
  | "allowlisted"
  | "percentage_included"
  | "percentage_excluded"
  | "no_user";

export interface FinancialRolloutDecision {
  enabled: boolean;
  reason: RolloutReason;
  bucket: number;
  calculationVersion: string;
}

/** Hash estável (FNV-1a 32 bits) — determinístico e sem dependências. */
export function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Bucket determinístico 0..99 do usuário (opcionalmente por tenant). */
export function resolveRolloutBucket(context: Pick<FinancialRolloutContext, "userId" | "tenantId">): number {
  const seed = `${UNIFIED_FINANCIAL_VERSION}:${context.tenantId ?? ""}:${context.userId ?? ""}`;
  return stableHash(seed) % 100;
}

/**
 * Decide se ESTE usuário usa a lógica unificada.
 * `flagEnabled` é o valor efetivo da flag do módulo (build-time).
 */
export function resolveFinancialRollout(
  flagEnabled: boolean,
  context: FinancialRolloutContext,
): FinancialRolloutDecision {
  const bucket = resolveRolloutBucket(context);
  const base = { bucket, calculationVersion: UNIFIED_FINANCIAL_VERSION };

  if (!flagEnabled) return { ...base, enabled: false, reason: "flag_disabled" };

  const allowedEnvs = context.enabledEnvironments;
  if (allowedEnvs && allowedEnvs.length > 0 && !allowedEnvs.includes(context.environment)) {
    return { ...base, enabled: false, reason: "environment_disabled" };
  }

  if (context.userId && (context.allowlistedUserIds ?? []).includes(context.userId)) {
    return { ...base, enabled: true, reason: "allowlisted" };
  }

  if (!context.userId) return { ...base, enabled: false, reason: "no_user" };

  const pct = Math.max(0, Math.min(100, Number(context.rolloutPercentage ?? 0)));
  if (pct >= 100) return { ...base, enabled: true, reason: "percentage_included" };
  if (pct <= 0) return { ...base, enabled: false, reason: "percentage_excluded" };
  return bucket < pct
    ? { ...base, enabled: true, reason: "percentage_included" }
    : { ...base, enabled: false, reason: "percentage_excluded" };
}

export const ROLLOUT_STAGES = [
  { name: "Etapa 1 — admin/teste", percentage: 0, requiresAllowlist: true },
  { name: "Etapa 2 — usuários internos", percentage: 0, requiresAllowlist: true },
  { name: "Etapa 3 — 5%", percentage: 5, requiresAllowlist: false },
  { name: "Etapa 4 — 25%", percentage: 25, requiresAllowlist: false },
  { name: "Etapa 5 — 50%", percentage: 50, requiresAllowlist: false },
  { name: "Etapa 6 — 100%", percentage: 100, requiresAllowlist: false },
] as const;

/** Próxima etapa sugerida — nunca aplicada automaticamente. */
export function nextRolloutStage(currentPercentage: number) {
  return ROLLOUT_STAGES.find((s) => s.percentage > currentPercentage) ?? null;
}
