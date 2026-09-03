/**
 * ============================================================================
 * RPC FINANCEIRA V3 — FERRAMENTA DE DIAGNÓSTICO (ETAPA 2)
 * ============================================================================
 *
 * ⚠️ MUDANÇA DE PROPÓSITO (ETAPA 2): este módulo NÃO é mais uma ferramenta de
 * correção. `public.loans.remaining_amount` e `public.loans.paid_installments`
 * são o ESTADO CONSOLIDADO OFICIAL e não podem ser reconstruídos a partir do
 * histórico legado.
 *
 * O módulo agora:
 *   1. bloqueia contratos por `loan_id` (nunca por nome do cliente);
 *   2. avalia elegibilidade de forma CONSERVADORA — divergência sozinha nunca
 *      autoriza escrita (FASE 2.11);
 *   3. gera relatórios e SQL SOMENTE LEITURA;
 *   4. recusa, com `RpcV3SafeModeError`, qualquer geração de aplicação real
 *      enquanto o modo seguro estiver ativo (padrão);
 *   5. mantém o rollout dos cards do Dashboard, que é apenas de leitura.
 *
 * NADA aqui altera pagamentos, `principal_amount`, `interest_amount`,
 * `allocation_version`, `loan_installments` ou qualquer histórico financeiro.
 */

import { roundCurrency } from "@/lib/money";
import type {
  OperationalClass,
  RealLoanValidationRow,
} from "@/features/loans/lib/realLoanValidation";
import type { DashboardLoanTotals } from "@/services/dashboardLoanTotalsCore";
import {
  assertRpcV3WriteAllowed,
  isRpcV3SafeMode,
  RPC_V3_SAFE_MODE_NOTICE,
} from "@/features/financial/lib/rpcV3SafeMode";

export { RPC_V3_SAFE_MODE_NOTICE, RpcV3SafeModeError } from "@/features/financial/lib/rpcV3SafeMode";


export const RPC_V3_MIGRATION_VERSION = "rpc_financial_v3_final";

/** Tolerância financeira única de toda a etapa final. */
export const RPC_V3_TOLERANCE = 0.01;

/* ==========================================================================
 * 1. BLOQUEIO POR loan_id
 * ========================================================================== */

export interface BlockedLoan {
  loanId: string;
  userId?: string;
  classification: Extract<OperationalClass, "REQUIRES_MANUAL_REVIEW"> | OperationalClass;
  reason: string;
}

/**
 * Contratos bloqueados manualmente pela auditoria.
 *
 * Preenchido SOMENTE com `loan_id` (o relatório possui clientes com múltiplos
 * contratos, então nome nunca é chave). Enquanto vazio, o bloqueio efetivo é
 * derivado automaticamente da classificação `REQUIRES_MANUAL_REVIEW`.
 */
export const MANUAL_REVIEW_BLOCKLIST: BlockedLoan[] = [];

export function normalizeBlocklist(entries: Array<BlockedLoan | string>): Map<string, BlockedLoan> {
  const map = new Map<string, BlockedLoan>();
  for (const entry of entries) {
    const item: BlockedLoan =
      typeof entry === "string"
        ? { loanId: entry, classification: "REQUIRES_MANUAL_REVIEW", reason: "bloqueio manual" }
        : entry;
    if (!item.loanId) continue;
    map.set(item.loanId, item);
  }
  return map;
}

/**
 * Bloqueio efetivo de um contrato: blocklist explícita OU classificações que
 * nunca podem participar do fluxo automático.
 */
export function resolveLoanBlock(
  row: RealLoanValidationRow,
  blocklist: Map<string, BlockedLoan> = normalizeBlocklist(MANUAL_REVIEW_BLOCKLIST),
): BlockedLoan | null {
  const explicit = blocklist.get(row.loanId);
  if (explicit) return explicit;

  const autoBlocked: OperationalClass[] = [
    "REQUIRES_MANUAL_REVIEW",
    "BLOCKED_FROM_MIGRATION",
    "POSSIBLE_CALCULATION_DEFECT",
  ];
  if (autoBlocked.includes(row.classification)) {
    return {
      loanId: row.loanId,
      classification: row.classification,
      reason: row.recommendedAction || `classificação ${row.classification}`,
    };
  }
  return null;
}

/* ==========================================================================
 * 2. ELEGIBILIDADE DO BACKFILL DE CACHE
 * ========================================================================== */

/**
 * Mantido apenas por compatibilidade de leitura: a classificação por si só
 * NUNCA mais autoriza backfill (FASE 2.11).
 */
export const BACKFILL_ELIGIBLE_CLASSIFICATIONS: OperationalClass[] = ["CACHE_ONLY_DIVERGENCE"];
export const BACKFILL_ELIGIBLE_CATEGORIES = ["CACHE_ONLY_DIVERGENCE", "CACHE_DIVERGENCE"];

export type BackfillDecision = "ELIGIBLE" | "BLOCKED" | "IGNORED";

export interface BackfillEvaluation {
  loanId: string;
  decision: BackfillDecision;
  reasons: string[];
}

export interface EligibilityOptions {
  /** Somente testes desligam o modo seguro; o app nunca desliga. */
  safeMode?: boolean;
}

/**
 * FASE 2.11 — camada de elegibilidade INDEPENDENTE e conservadora.
 *
 * Regras (todas obrigatórias para liberar):
 *   • o modo seguro precisa estar explicitamente desligado;
 *   • o contrato não pode estar na blocklist;
 *   • todos os componentes precisam ser determinísticos;
 *   • os valores persistidos precisam ser válidos;
 *   • não pode haver pagamento legado sem alocação;
 *   • não pode haver divergência sem explicação.
 *
 * Divergência de cache, sozinha, NUNCA torna um contrato elegível.
 */
export function evaluateRpcV3BackfillEligibility(
  row: RealLoanValidationRow,
  blocklist: Map<string, BlockedLoan> = normalizeBlocklist(MANUAL_REVIEW_BLOCKLIST),
  options: EligibilityOptions = {},
): BackfillEvaluation {
  const safeMode = options.safeMode ?? isRpcV3SafeMode();
  const blocked = resolveLoanBlock(row, blocklist);
  if (blocked) {
    return { loanId: row.loanId, decision: "BLOCKED", reasons: [blocked.reason] };
  }

  const reasons: string[] = [];
  if (safeMode) {
    reasons.push("modo seguro ativo: o estado consolidado oficial não pode ser alterado");
  }

  // Motivos estruturais/diagnósticos (histórico legado, não determinismo etc.).
  reasons.push(...(row.blockingReasons ?? []));

  const f = row.flags;
  if (f.allocationMismatch) reasons.push("alocação divergente do pagamento");
  if (row.storedRemainingAmount == null && row.storedPaidInstallments == null) {
    reasons.push("nenhum estado consolidado persistido para comparar");
  }
  const hasCacheDiff =
    Math.abs(row.remainingAmountDifference) > RPC_V3_TOLERANCE
    || row.paidInstallmentsDifference !== 0;
  if (!hasCacheDiff) reasons.push("estado consolidado já coincide com o diagnóstico");

  const unique = [...new Set(reasons)];
  if (unique.length === 0) return { loanId: row.loanId, decision: "ELIGIBLE", reasons: [] };
  return { loanId: row.loanId, decision: "BLOCKED", reasons: unique };
}


/* ==========================================================================
 * 3. SNAPSHOT OBRIGATÓRIO + ROLLBACK
 * ========================================================================== */

export interface BackfillSnapshotRow {
  loanId: string;
  userId: string;
  oldRemainingAmount: number | null;
  newRemainingAmount: number;
  oldPaidInstallments: number | null;
  newPaidInstallments: number;
  capturedAt: string;
  migrationVersion: string;
  executedBy: string;
}

export interface RpcV3BackfillPlan {
  batchId: string;
  migrationVersion: string;
  generatedAt: string;
  executedBy: string;
  evaluations: BackfillEvaluation[];
  snapshots: BackfillSnapshotRow[];
  eligibleCount: number;
  blockedCount: number;
  ignoredCount: number;
  blockedLoanIds: string[];
  /** ETAPA 2 — o plano nasce em modo seguro e sem nenhuma escrita planejada. */
  safeMode: boolean;
  refusalReason: string | null;
}

export interface BuildPlanOptions {
  executedBy: string;
  userIdByLoanId?: Map<string, string>;
  blocklist?: Array<BlockedLoan | string>;
  generatedAt?: string;
  /** Somente testes desligam o modo seguro. */
  safeMode?: boolean;
}

function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * FASE 2.13 — o "plano" virou um RELATÓRIO. Em modo seguro nenhum snapshot de
 * escrita é produzido: `snapshots` fica vazio e `refusalReason` explica por quê.
 */
export function buildRpcV3BackfillPlan(
  rows: RealLoanValidationRow[],
  options: BuildPlanOptions,
): RpcV3BackfillPlan {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const blocklist = normalizeBlocklist(options.blocklist ?? MANUAL_REVIEW_BLOCKLIST);
  const safeMode = options.safeMode ?? isRpcV3SafeMode();

  const evaluations = rows.map((row) =>
    evaluateRpcV3BackfillEligibility(row, blocklist, { safeMode }),
  );
  const byLoanId = new Map(rows.map((r) => [r.loanId, r]));

  const snapshots: BackfillSnapshotRow[] = evaluations
    .filter((e) => e.decision === "ELIGIBLE")
    .map((e) => {
      const row = byLoanId.get(e.loanId)!;
      return {
        loanId: row.loanId,
        userId: options.userIdByLoanId?.get(row.loanId) ?? "",
        oldRemainingAmount: row.storedRemainingAmount ?? null,
        newRemainingAmount: roundCurrency(row.calculatedRemainingAmount),
        oldPaidInstallments: row.storedPaidInstallments ?? null,
        newPaidInstallments: row.calculatedPaidInstallments,
        capturedAt: generatedAt,
        migrationVersion: RPC_V3_MIGRATION_VERSION,
        executedBy: options.executedBy,
      };
    });

  const blocked = evaluations.filter((e) => e.decision === "BLOCKED");

  return {
    batchId: `rpcv3_${hash(`${generatedAt}:${snapshots.map((s) => s.loanId).join(",")}`)}`,
    migrationVersion: RPC_V3_MIGRATION_VERSION,
    generatedAt,
    executedBy: options.executedBy,
    evaluations,
    snapshots,
    eligibleCount: snapshots.length,
    blockedCount: blocked.length,
    ignoredCount: evaluations.filter((e) => e.decision === "IGNORED").length,
    blockedLoanIds: blocked.map((e) => e.loanId),
    safeMode,
    refusalReason: safeMode ? RPC_V3_SAFE_MODE_NOTICE : null,
  };
}


const sqlNum = (v: number | null) => (v == null ? "null" : String(roundCurrency(v)));
const sqlInt = (v: number | null) => (v == null ? "null" : String(Math.trunc(v)));
const sqlText = (v: string) => `'${String(v).replace(/'/g, "''")}'`;

const sqlJson = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

/**
 * SQL de aplicação do backfill.
 *
 * NUNCA emite `UPDATE` direto: delega para `public.rpc_v3_backfill_cache`, que
 *   1. grava o snapshot obrigatório ANTES da escrita;
 *   2. trava as linhas do lote (`for update`) contra pagamentos concorrentes;
 *   3. aplica optimistic locking via `expected_*` — se o valor atual mudou
 *      depois do diagnóstico, o contrato é marcado `STALE` e não é sobrescrito;
 *   4. ignora contratos bloqueados por `loan_id`.
 *
 * O script é gerado em modo `dry-run` primeiro; a aplicação real está
 * comentada e exige ação explícita do operador.
 */
/**
 * FASE 2.3 / 2.13 — geração de APLICAÇÃO REAL.
 * Em modo seguro (padrão) lança `RpcV3SafeModeError` e não devolve SQL algum.
 */
export function buildBackfillSql(plan: RpcV3BackfillPlan): string {
  if (plan.safeMode !== false) {
    assertRpcV3WriteAllowed("buildBackfillSql", undefined);
    throw new Error(RPC_V3_SAFE_MODE_NOTICE);
  }
  assertRpcV3WriteAllowed("buildBackfillSql");


  if (plan.snapshots.length === 0) return "-- nenhum contrato elegível\n";
  const payload = plan.snapshots.map((s) => ({
    loan_id: s.loanId,
    remaining_amount: roundCurrency(s.newRemainingAmount),
    paid_installments: Math.trunc(s.newPaidInstallments),
    // valores observados no diagnóstico = guarda otimista
    expected_remaining_amount: s.oldRemainingAmount == null ? null : roundCurrency(s.oldRemainingAmount),
    expected_paid_installments:
      s.oldPaidInstallments == null ? null : Math.trunc(s.oldPaidInstallments),
  }));
  const blocked = plan.blockedLoanIds.length
    ? `array[${plan.blockedLoanIds.map((id) => `${sqlText(id)}::uuid`).join(", ")}]`
    : "'{}'::uuid[]";
  const blockedUsers = "'{}'::uuid[]";

  return [
    `-- Backfill de CACHE (${plan.migrationVersion}) — lote ${plan.batchId}`,
    "-- Atualiza SOMENTE remaining_amount e paid_installments, sempre com snapshot",
    "-- obrigatório, trava de linha e optimistic locking (status STALE quando o",
    "-- contrato mudou depois do diagnóstico).",
    "",
    "-- 1) SIMULAÇÃO (não escreve nada — apenas grava linhas PLANNED no snapshot):",
    "select * from public.rpc_v3_backfill_cache(",
    `  ${sqlText(plan.batchId)},`,
    `  ${sqlJson(payload)},`,
    `  ${blocked},`,
    `  ${blockedUsers},`,
    "  true",
    ");",
    "",
    "-- 2) APLICAÇÃO REAL — descomente somente após revisar a simulação acima.",
    "-- begin;",
    "-- select * from public.rpc_v3_backfill_cache(",
    `--   ${sqlText(plan.batchId)},`,
    `--   ${sqlJson(payload)},`,
    `--   ${blocked},`,
    `--   ${blockedUsers},`,
    "--   false",
    "-- );",
    "-- commit;",
    "",
  ].join("\n");

}

/**
 * SQL de rollback a partir do snapshot persistido.
 *
 * Usa `public.rpc_v3_rollback_batch`, que é idempotente (só reverte onde o valor
 * atual ainda é o aplicado pelo lote) e registra a trilha `ROLLED_BACK`.
 * O bloco literal abaixo permanece apenas como plano de contingência caso a
 * função não esteja instalada — e também registra `ROLLED_BACK`.
 */
export function buildRollbackSql(plan: RpcV3BackfillPlan): string {
  // Rollback também escreve em `public.loans`: bloqueado no modo seguro.
  if (plan.safeMode !== false) {
    assertRpcV3WriteAllowed("buildRollbackSql", undefined);
    throw new Error(RPC_V3_SAFE_MODE_NOTICE);
  }
  assertRpcV3WriteAllowed("buildRollbackSql");
  if (plan.snapshots.length === 0) return "-- nada a reverter\n";

  const values = plan.snapshots
    .map(
      (s) =>
        `  (${sqlText(s.loanId)}::uuid, ${sqlNum(s.oldRemainingAmount)}::numeric, ${sqlInt(
          s.oldPaidInstallments,
        )}::int, ${sqlNum(s.newRemainingAmount)}::numeric, ${sqlInt(s.newPaidInstallments)}::int, ${sqlText(
          s.userId,
        )}::uuid)`,
    )
    .join(",\n");
  return [
    `-- ROLLBACK do lote ${plan.batchId} (${plan.migrationVersion})`,
    "-- Caminho preferencial (idempotente + trilha de auditoria ROLLED_BACK):",
    `select * from public.rpc_v3_rollback_batch(${sqlText(plan.batchId)});`,
    "",
    "-- Contingência (função ausente): restaura o snapshot APENAS onde o valor",
    "-- atual ainda é o valor aplicado pelo lote e registra a trilha.",
    "-- begin;",
    "-- with snap(loan_id, old_remaining, old_paid, new_remaining, new_paid, user_id) as (values",
    ...values.split("\n").map((line) => `-- ${line}`),
    "-- ),",
    "-- revertido as (",
    "--   update public.loans l",
    "--   set remaining_amount = s.old_remaining,",
    "--       paid_installments = s.old_paid",
    "--   from snap s",
    "--   where l.id = s.loan_id",
    "--     and coalesce(l.remaining_amount, -1) = coalesce(s.new_remaining, -1)",
    "--     and coalesce(l.paid_installments, -1) = coalesce(s.new_paid, -1)",
    "--   returning l.id",
    "-- )",
    "-- insert into public.rpc_v3_migration_snapshots (",
    "--   batch_id, loan_id, user_id, old_remaining_amount, new_remaining_amount,",
    "--   old_paid_installments, new_paid_installments, status, executed_by",
    "-- )",
    `-- select ${sqlText(plan.batchId)}, s.loan_id, s.user_id, s.new_remaining, coalesce(s.old_remaining, 0),`,
    "--        s.new_paid, coalesce(s.old_paid, 0), 'ROLLED_BACK', auth.uid()",
    "-- from snap s where s.loan_id in (select id from revertido);",
    "-- commit;",
    "",
  ].join("\n");
}

/* ==========================================================================
 * 4. ROLLOUT EM 4 FASES COM PARADA AUTOMÁTICA
 * ========================================================================== */

export type RpcV3Phase = "phase1_admin" | "phase2_10" | "phase3_50" | "phase4_100";

export interface RpcV3PhaseDefinition {
  phase: RpcV3Phase;
  order: number;
  label: string;
  percentage: number;
  adminOnly: boolean;
}

export const RPC_V3_PHASES: RpcV3PhaseDefinition[] = [
  { phase: "phase1_admin", order: 1, label: "Fase 1 — administradores", percentage: 0, adminOnly: true },
  { phase: "phase2_10", order: 2, label: "Fase 2 — 10%", percentage: 10, adminOnly: false },
  { phase: "phase3_50", order: 3, label: "Fase 3 — 50%", percentage: 50, adminOnly: false },
  { phase: "phase4_100", order: 4, label: "Fase 4 — 100%", percentage: 100, adminOnly: false },
];

const ADMIN_ROLES = new Set(["admin", "owner", "super_admin", "superadmin"]);

export function isAdminRole(role?: string | null): boolean {
  return !!role && ADMIN_ROLES.has(String(role).toLowerCase());
}

export interface RpcV3RolloutInput {
  phase: RpcV3Phase;
  userId?: string | null;
  role?: string | null;
  /** Maior divergência observada (R$) entre legado e RPC nesta sessão. */
  largestDifference?: number;
  /** Parada manual/persistida de uma execução anterior. */
  haltedReason?: string | null;
}

export interface RpcV3RolloutDecision {
  enabled: boolean;
  halted: boolean;
  reason: string;
  phase: RpcV3Phase;
  percentage: number;
  bucket: number;
}

/** Bucket determinístico 0..99 — o mesmo usuário nunca alterna entre fontes. */
export function bucketOf(userId: string): number {
  return parseInt(hash(`${RPC_V3_MIGRATION_VERSION}:${userId}`), 16) % 100;
}

/**
 * Decide se ESTE usuário lê os cards pela RPC V3.
 * Qualquer divergência acima de R$ 0,01 interrompe o rollout imediatamente.
 */
export function resolveRpcV3Rollout(input: RpcV3RolloutInput): RpcV3RolloutDecision {
  const def = RPC_V3_PHASES.find((p) => p.phase === input.phase) ?? RPC_V3_PHASES[0];
  const bucket = input.userId ? bucketOf(input.userId) : 0;
  const base = { phase: def.phase, percentage: def.percentage, bucket };

  if (input.haltedReason) {
    return { ...base, enabled: false, halted: true, reason: input.haltedReason };
  }
  const diff = Number(input.largestDifference ?? 0);
  if (Number.isFinite(diff) && diff > RPC_V3_TOLERANCE) {
    return {
      ...base,
      enabled: false,
      halted: true,
      reason: `divergência de R$ ${roundCurrency(diff).toFixed(2)} acima da tolerância de R$ 0,01`,
    };
  }

  if (def.adminOnly) {
    return isAdminRole(input.role)
      ? { ...base, enabled: true, halted: false, reason: "fase 1 — administrador" }
      : { ...base, enabled: false, halted: false, reason: "fase 1 restrita a administradores" };
  }
  if (isAdminRole(input.role)) {
    return { ...base, enabled: true, halted: false, reason: "administrador sempre incluído" };
  }
  if (!input.userId) {
    return { ...base, enabled: false, halted: false, reason: "usuário não identificado" };
  }
  return bucket < def.percentage
    ? { ...base, enabled: true, halted: false, reason: `bucket ${bucket} < ${def.percentage}%` }
    : { ...base, enabled: false, halted: false, reason: `bucket ${bucket} fora de ${def.percentage}%` };
}

/** Só avança de fase quando a fase atual está sem divergência. */
export function nextRpcV3Phase(
  current: RpcV3Phase,
  largestDifference: number,
): { allowed: boolean; next: RpcV3Phase | null; reason: string } {
  const idx = RPC_V3_PHASES.findIndex((p) => p.phase === current);
  const next = idx >= 0 && idx < RPC_V3_PHASES.length - 1 ? RPC_V3_PHASES[idx + 1].phase : null;
  if (largestDifference > RPC_V3_TOLERANCE) {
    return { allowed: false, next, reason: "divergência acima de R$ 0,01" };
  }
  if (!next) return { allowed: false, next: null, reason: "rollout já em 100%" };
  return { allowed: true, next, reason: "paridade dentro da tolerância" };
}

/* ==========================================================================
 * 5. VALIDAÇÃO DOS CARDS DO DASHBOARD
 * ========================================================================== */

export const DASHBOARD_RPC_CARDS: Array<{ key: keyof DashboardLoanTotals; label: string; money: boolean }> = [
  { key: "capitalAtivo", label: "Capital Ativo", money: true },
  { key: "receber", label: "Valor a Receber", money: true },
  { key: "principalRecebido", label: "Principal Recebido", money: true },
  { key: "jurosRecebidos", label: "Juros Recebidos", money: true },
  { key: "multasPendentes", label: "Multas / Juros de Mora", money: true },
  { key: "totalRecebidoPeriodo", label: "Total Recebido", money: true },
  { key: "emprestado", label: "Emprestado (ativo)", money: true },
  { key: "jurosReceber", label: "Juros a Receber", money: true },
  { key: "quantidadeContratos", label: "Quantidade de Contratos", money: false },
  { key: "contratosAtivos", label: "Contratos Ativos", money: false },
  { key: "contratosQuitados", label: "Contratos Quitados", money: false },
  { key: "contratosAtrasados", label: "Contratos em Atraso", money: false },
  { key: "taxaJurosMedia", label: "Taxa Média", money: false },
];

export interface DashboardCardValidation {
  key: string;
  label: string;
  legacy: number;
  rpc: number;
  diff: number;
  withinTolerance: boolean;
}

/**
 * Campos da RPC que EFETIVAMENTE substituem os cards do Dashboard.
 * Qualquer campo aqui precisa estar validado contra o legado antes de o
 * rollout ser considerado seguro (evita Dashboard híbrido não verificado).
 */
export const DASHBOARD_RPC_OVERRIDDEN_KEYS: Array<keyof DashboardLoanTotals> = [
  "emprestado",
  "totalRecebidoPeriodo",
  "capitalAtivo",
  "receber",
];

export interface DashboardValidationResult {
  cards: DashboardCardValidation[];
  divergent: DashboardCardValidation[];
  largestDifference: number;
  allWithinTolerance: boolean;
  /** Cards declarados que não puderam ser comparados (legado não fornece o valor). */
  unvalidatedKeys: string[];
  /** Campos que substituem cards e ficaram sem comparação — bloqueiam o rollout. */
  unvalidatedOverriddenKeys: string[];
  /** true quando todos os campos usados nos cards foram comparados. */
  overrideCoverageComplete: boolean;
}

export function validateDashboardRpcCards(
  legacy: Partial<DashboardLoanTotals>,
  rpc: Partial<DashboardLoanTotals>,
  tolerance = RPC_V3_TOLERANCE,
): DashboardValidationResult {
  const comparable = DASHBOARD_RPC_CARDS.filter(({ key }) => legacy[key] !== undefined);
  const cards = comparable.map(({ key, label }) => {
    const a = Number(legacy[key] ?? 0);
    const b = Number(rpc[key] ?? 0);
    const diff = roundCurrency(Math.abs(a - b));
    return { key: String(key), label, legacy: a, rpc: b, diff, withinTolerance: diff <= tolerance };
  });
  const divergent = cards.filter((c) => !c.withinTolerance);
  const comparedKeys = new Set(cards.map((c) => c.key));
  const unvalidatedKeys = DASHBOARD_RPC_CARDS.map(({ key }) => String(key)).filter(
    (key) => !comparedKeys.has(key),
  );
  const unvalidatedOverriddenKeys = DASHBOARD_RPC_OVERRIDDEN_KEYS.map(String).filter(
    (key) => !comparedKeys.has(key),
  );
  return {
    cards,
    divergent,
    largestDifference: cards.reduce((m, c) => Math.max(m, c.diff), 0),
    allWithinTolerance: divergent.length === 0,
    unvalidatedKeys,
    unvalidatedOverriddenKeys,
    overrideCoverageComplete: unvalidatedOverriddenKeys.length === 0,
  };
}

/* ==========================================================================
 * 6. RELATÓRIO FINAL DE AUDITORIA
 * ========================================================================== */

export interface RpcV3AuditReport {
  migrationVersion: string;
  generatedAt: string;
  batchId: string;
  summary: {
    analyzed: number;
    migrated: number;
    ignored: number;
    blocked: number;
    safeToEnable: number;
    safeWithLegacyFallback: number;
    cacheOnlyDivergence: number;
    requiresManualReview: number;
    missingMetadata: number;
    /** ETAPA 2 — contratos cujo histórico permite reconstrução determinística. */
    deterministic: number;
    legacyAllocationMissing: number;
    invalidAllocation: number;
    highRisk: number;
  };
  financial: DashboardCardValidation[];
  financialWithinTolerance: boolean;
  blockedLoanIds: string[];
  approved: boolean;
  approvalBlockers: string[];
  safeMode: boolean;
  safeModeNotice: string | null;
}


export function buildRpcV3AuditReport(
  rows: RealLoanValidationRow[],
  plan: RpcV3BackfillPlan,
  dashboard: DashboardValidationResult,
  generatedAt = new Date().toISOString(),
): RpcV3AuditReport {
  const count = (cls: OperationalClass) => rows.filter((r) => r.classification === cls).length;
  const summary = {
    analyzed: rows.length,
    migrated: plan.eligibleCount,
    ignored: plan.ignoredCount,
    blocked: plan.blockedCount,
    safeToEnable: count("SAFE_TO_ENABLE"),
    safeWithLegacyFallback: count("SAFE_WITH_LEGACY_FALLBACK"),
    cacheOnlyDivergence: count("CACHE_ONLY_DIVERGENCE"),
    requiresManualReview: count("REQUIRES_MANUAL_REVIEW"),
    missingMetadata: rows.filter((r) => r.categories.includes("MISSING_METADATA")).length,
    deterministic: rows.filter((r) => r.deterministicReconstruction).length,
    legacyAllocationMissing: rows.filter((r) => r.legacyAllocationMissing).length,
    invalidAllocation: rows.filter((r) => r.diagnostics?.hasInvalidAllocation).length,
    highRisk: rows.filter((r) => r.diagnostics?.riskClass === "HIGH").length,
  };

  const approvalBlockers: string[] = [];
  if (plan.safeMode !== false) {
    approvalBlockers.push(RPC_V3_SAFE_MODE_NOTICE);
  }
  if (!dashboard.allWithinTolerance) {
    approvalBlockers.push(
      `cards divergentes: ${dashboard.divergent.map((c) => `${c.label} (Δ R$ ${c.diff.toFixed(2)})`).join(", ")}`,
    );
  }
  if (!dashboard.overrideCoverageComplete) {
    approvalBlockers.push(
      `cards servidos pela RPC sem comparação com o legado: ${dashboard.unvalidatedOverriddenKeys.join(", ")}`,
    );
  }
  const migratedBlocked = plan.snapshots.filter((s) => plan.blockedLoanIds.includes(s.loanId));
  if (migratedBlocked.length > 0) {
    approvalBlockers.push(`contratos bloqueados dentro do lote: ${migratedBlocked.length}`);
  }
  const safeWithDiff = rows.filter(
    (r) => r.classification === "SAFE_TO_ENABLE" && Math.abs(r.totalDifference) > RPC_V3_TOLERANCE,
  );
  if (safeWithDiff.length > 0) {
    approvalBlockers.push(`contratos SAFE_TO_ENABLE com diferença: ${safeWithDiff.length}`);
  }

  return {
    migrationVersion: RPC_V3_MIGRATION_VERSION,
    generatedAt,
    batchId: plan.batchId,
    summary,
    financial: dashboard.cards,
    financialWithinTolerance: dashboard.allWithinTolerance,
    blockedLoanIds: plan.blockedLoanIds,
    approved: approvalBlockers.length === 0,
    approvalBlockers,
    safeMode: plan.safeMode !== false,
    safeModeNotice: plan.safeMode !== false ? RPC_V3_SAFE_MODE_NOTICE : null,
  };
}


export function auditReportToMarkdown(report: RpcV3AuditReport): string {
  const s = report.summary;
  const money = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return [
    `# Diagnóstico de paridade — RPC Financeira V3 (${report.migrationVersion})`,
    `Gerado em ${report.generatedAt} · lote ${report.batchId}`,
    "",
    ...(report.safeMode
      ? [
        "> ⚠️ **MODO SEGURO ATIVO** — este relatório é DIAGNÓSTICO.",
        `> ${report.safeModeNotice}`,
        "> `public.loans.remaining_amount` e `public.loans.paid_installments` são o estado consolidado oficial.",
        "",
      ]
      : []),
    "## Resumo",
    `- Contratos analisados: ${s.analyzed}`,
    `- Contratos elegíveis a escrita: ${s.migrated}`,
    `- Contratos ignorados: ${s.ignored}`,
    `- Contratos bloqueados: ${s.blocked}`,
    `- Reconstrução determinística: ${s.deterministic}`,
    `- Sem alocação persistida (legado): ${s.legacyAllocationMissing}`,
    `- Alocação persistida inválida: ${s.invalidAllocation}`,
    `- Risco alto: ${s.highRisk}`,
    `- SAFE_TO_ENABLE: ${s.safeToEnable}`,
    `- SAFE_WITH_LEGACY_FALLBACK: ${s.safeWithLegacyFallback}`,
    `- CACHE_ONLY_DIVERGENCE: ${s.cacheOnlyDivergence}`,
    `- REQUIRES_MANUAL_REVIEW: ${s.requiresManualReview}`,
    `- MISSING_METADATA: ${s.missingMetadata}`,
    "",

    "## Financeiro (legado × RPC V3, tolerância R$ 0,01)",
    "| Métrica | Antes (legado) | Depois (RPC V3) | Δ |",
    "| --- | ---: | ---: | ---: |",
    ...report.financial.map(
      (c) => `| ${c.label} | ${money(c.legacy)} | ${money(c.rpc)} | ${money(c.diff)} |`,
    ),
    "",
    `## Resultado: ${report.approved ? "APROVADO" : "BLOQUEADO"}`,
    ...(report.approvalBlockers.length ? report.approvalBlockers.map((b) => `- ${b}`) : ["- sem bloqueios"]),
    "",
    "## Contratos bloqueados (loan_id)",
    ...(report.blockedLoanIds.length ? report.blockedLoanIds.map((id) => `- ${id}`) : ["- nenhum"]),
    "",
  ].join("\n");
}

/* ==========================================================================
 * FASE 2.13 — SQL SOMENTE LEITURA (substitui a geração de payload de escrita)
 * ========================================================================== */

/**
 * Gera um SQL exclusivamente de LEITURA para conferência manual do estado
 * consolidado oficial. Não contém `update`, `insert` nem chamada de RPC de
 * escrita — pode ser executado com segurança em produção.
 */
export function buildRpcV3DiagnosticSql(rows: RealLoanValidationRow[]): string {
  const ids = rows.map((r) => r.loanId).filter(Boolean);
  const list = ids.length
    ? `array[${ids.map((id) => `${sqlText(id)}::uuid`).join(", ")}]`
    : "'{}'::uuid[]";
  return [
    `-- Diagnóstico SOMENTE LEITURA (${RPC_V3_MIGRATION_VERSION})`,
    `-- ${RPC_V3_SAFE_MODE_NOTICE}`,
    "-- Nenhum comando de escrita é emitido por este script.",
    "",
    "select l.id as loan_id,",
    "       l.remaining_amount   as official_remaining_amount,",
    "       l.paid_installments  as official_paid_installments,",
    "       l.status,",
    "       count(p.id)                                     as payments_count,",
    "       count(p.id) filter (where p.metadata ? 'allocation_version') as payments_with_allocation",
    "from public.loans l",
    "left join public.payments p on p.loan_id = l.id",
    `where l.id = any (${list})`,
    "group by l.id, l.remaining_amount, l.paid_installments, l.status",
    "order by l.id;",
    "",
  ].join("\n");
}

/** Linha do relatório diagnóstico por contrato (exportação CSV/JSON). */
export interface RpcV3DiagnosticRow {
  loanId: string;
  officialRemainingAmount: number | null;
  officialPaidInstallments: number | null;
  contractualRemainingAmount: number;
  remainingDifference: number;
  paidInstallmentsDifference: number;
  deterministicReconstruction: boolean;
  legacyAllocationMissing: boolean;
  riskClass: string;
  blockingReasons: string[];
  explanation: string;
}

export function buildRpcV3DiagnosticRows(rows: RealLoanValidationRow[]): RpcV3DiagnosticRow[] {
  return rows.map((r) => ({
    loanId: r.loanId,
    officialRemainingAmount: r.officialRemainingAmount,
    officialPaidInstallments: r.officialPaidInstallments,
    contractualRemainingAmount: r.contractualRemainingAmount,
    remainingDifference: r.remainingAmountDifference,
    paidInstallmentsDifference: r.paidInstallmentsDifference,
    deterministicReconstruction: r.deterministicReconstruction,
    legacyAllocationMissing: r.legacyAllocationMissing,
    riskClass: r.diagnostics?.riskClass ?? "LOW",
    blockingReasons: r.blockingReasons ?? [],
    explanation:
      r.diagnostics?.comparisons.find((c) => c.metric === "remaining_amount")?.explanation ?? "",
  }));
}
