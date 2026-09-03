/**
 * ============================================================================
 * BACKFILL DOS CACHES DERIVADOS — DESATIVADO NA ETAPA 2
 * ============================================================================
 *
 * ⚠️ `remaining_amount` e `paid_installments` deixaram de ser tratados como
 * cache reconstruível: eles são o ESTADO CONSOLIDADO OFICIAL do contrato.
 *
 * Este módulo permanece apenas para DIAGNÓSTICO e histórico. Toda função capaz
 * de produzir escrita recusa a execução enquanto o modo seguro estiver ativo
 * (padrão), lançando `RpcV3SafeModeError`.
 */

import { roundCurrency } from "@/lib/money";
import { UNIFIED_FINANCIAL_VERSION } from "@/features/financial/lib/financialVersion";
import type { RealLoanValidationRow } from "@/features/loans/lib/realLoanValidation";
import {
  assertRpcV3WriteAllowed,
  isRpcV3SafeMode,
} from "@/features/financial/lib/rpcV3SafeMode";


const EPS = 0.01;

export interface CacheBackfillDryRunRow {
  loanId: string;

  oldRemainingAmount?: number;
  newRemainingAmount: number;
  remainingDifference: number;

  oldPaidInstallments?: number;
  newPaidInstallments: number;
  paidInstallmentsDifference: number;

  eligible: boolean;
  reasons: string[];
  warnings: string[];
  /** Guardas de concorrência otimista lidas no dry-run. */
  expectedUpdatedAt?: string;
}

export interface CacheBackfillDryRun {
  batchId: string;
  calculationVersion: string;
  generatedAt: string;
  rows: CacheBackfillDryRunRow[];
  eligibleCount: number;
  blockedCount: number;
  totalRemainingDifference: number;
  largestRemainingDifference: number;
}

/**
 * @deprecated ETAPA 2 — o estado consolidado oficial não é mais reconstruído.
 * Mantida apenas para diagnóstico: em modo seguro nunca devolve `eligible`.
 */
export function evaluateBackfillEligibility(row: RealLoanValidationRow): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (isRpcV3SafeMode()) {
    reasons.push("modo seguro ativo: o estado consolidado oficial não pode ser alterado");
  }
  reasons.push(...(row.blockingReasons ?? []));

  const f = row.flags;

  if (row.classification !== "CACHE_ONLY_DIVERGENCE") {
    reasons.push(`classificação ${row.classification} não é CACHE_ONLY_DIVERGENCE`);
  }
  if (row.severity === "CRITICAL") reasons.push("warning CRITICAL presente");
  if (f.hasNegativeBalance) reasons.push("saldo negativo");
  if (f.settledWithBalance) reasons.push("contrato quitado com saldo");
  if (f.duplicatePayments) reasons.push("pagamentos duplicados");
  if (f.allocationMismatch) reasons.push("soma de alocações divergente do pagamento");
  if (f.incompleteSchedule) reasons.push("cronograma incompleto");
  if (f.renegotiated) reasons.push("contrato renegociado");
  if (f.principalOverpaid) reasons.push("principal pago acima do principal original");
  if (row.storedRemainingAmount == null && row.storedPaidInstallments == null) {
    reasons.push("nenhum cache persistido para comparar");
  }

  return { eligible: reasons.length === 0, reasons };
}

function hashBatch(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface DryRunOptions {
  generatedAt?: string;
  /** `updated_at` lido do banco por contrato (guarda de concorrência). */
  updatedAtByLoanId?: Map<string, string>;
}

/** Dry-run: descreve o que MUDARIA, sem tocar em nenhuma linha. */
export function buildCacheBackfillDryRun(
  validationRows: RealLoanValidationRow[],
  options: DryRunOptions = {},
): CacheBackfillDryRun {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const rows: CacheBackfillDryRunRow[] = validationRows.map((row) => {
    const { eligible, reasons } = evaluateBackfillEligibility(row);
    return {
      loanId: row.loanId,
      oldRemainingAmount: row.storedRemainingAmount,
      newRemainingAmount: roundCurrency(row.calculatedRemainingAmount),
      remainingDifference: roundCurrency(row.remainingAmountDifference),
      oldPaidInstallments: row.storedPaidInstallments,
      newPaidInstallments: row.calculatedPaidInstallments,
      paidInstallmentsDifference: row.paidInstallmentsDifference,
      eligible,
      reasons,
      warnings: row.warnings,
      expectedUpdatedAt: options.updatedAtByLoanId?.get(row.loanId),
    };
  });

  const eligibleRows = rows.filter((r) => r.eligible);
  const batchId = `bf_${hashBatch(`${generatedAt}:${eligibleRows.map((r) => r.loanId).join(",")}`)}`;

  return {
    batchId,
    calculationVersion: UNIFIED_FINANCIAL_VERSION,
    generatedAt,
    rows,
    eligibleCount: eligibleRows.length,
    blockedCount: rows.length - eligibleRows.length,
    totalRemainingDifference: roundCurrency(
      eligibleRows.reduce((s, r) => s + Math.abs(r.remainingDifference), 0),
    ),
    largestRemainingDifference: roundCurrency(
      eligibleRows.reduce((m, r) => Math.max(m, Math.abs(r.remainingDifference)), 0),
    ),
  };
}

/** Lotes pequenos (default 50) para nunca travar a base inteira. */
export function chunkBackfillBatches(
  dryRun: CacheBackfillDryRun,
  batchSize = 50,
): CacheBackfillDryRunRow[][] {
  const eligible = dryRun.rows.filter((r) => r.eligible);
  const batches: CacheBackfillDryRunRow[][] = [];
  for (let i = 0; i < eligible.length; i += Math.max(1, batchSize)) {
    batches.push(eligible.slice(i, i + Math.max(1, batchSize)));
  }
  return batches;
}

export type BackfillStatus = "PLANNED" | "UPDATED" | "SKIPPED" | "CONFLICT" | "FAILED" | "ROLLED_BACK";

export interface BackfillAuditRecord {
  batchId: string;
  loanId: string;
  calculationVersion: string;
  oldValues: { remainingAmount?: number; paidInstallments?: number; updatedAt?: string };
  newValues: { remainingAmount: number; paidInstallments: number };
  status: BackfillStatus;
  executedAt: string;
  error?: string;
}

/** Estado atual lido no momento da execução, para concorrência otimista. */
export interface CurrentCacheState {
  remainingAmount?: number;
  paidInstallments?: number;
  updatedAt?: string;
}

export interface BackfillApplyResult {
  records: BackfillAuditRecord[];
  updated: number;
  skipped: number;
  conflicts: number;
  failed: number;
}

export interface ApplyOptions {
  /** Só executa quando explicitamente aprovado. */
  approved: boolean;
  /** Estado atual por contrato (lido imediatamente antes de escrever). */
  currentStateByLoanId: Map<string, CurrentCacheState>;
  /** Escrita real; ausente = simulação. */
  applier?: (row: CacheBackfillDryRunRow) => Promise<void> | void;
  executedAt?: string;
}

/**
 * Aplica um lote com concorrência otimista e idempotência:
 *   - contrato já no valor novo        → SKIPPED;
 *   - `updated_at`/valores mudaram     → CONFLICT (volta ao diagnóstico);
 *   - erro do applier                  → FAILED (não interrompe o lote).
 */
export async function applyCacheBackfillBatch(
  batchId: string,
  batch: CacheBackfillDryRunRow[],
  options: ApplyOptions,
): Promise<BackfillApplyResult> {
  // ETAPA 2 — nenhuma escrita automatizada no estado consolidado oficial.
  assertRpcV3WriteAllowed("applyCacheBackfillBatch");
  const executedAt = options.executedAt ?? new Date().toISOString();

  const records: BackfillAuditRecord[] = [];

  for (const row of batch) {
    const current = options.currentStateByLoanId.get(row.loanId);
    const audit: BackfillAuditRecord = {
      batchId,
      loanId: row.loanId,
      calculationVersion: UNIFIED_FINANCIAL_VERSION,
      oldValues: {
        remainingAmount: current?.remainingAmount ?? row.oldRemainingAmount,
        paidInstallments: current?.paidInstallments ?? row.oldPaidInstallments,
        updatedAt: current?.updatedAt,
      },
      newValues: { remainingAmount: row.newRemainingAmount, paidInstallments: row.newPaidInstallments },
      status: "PLANNED",
      executedAt,
    };

    if (!options.approved) {
      records.push(audit);
      continue;
    }

    const alreadyDone =
      current != null
      && Math.abs((current.remainingAmount ?? NaN) - row.newRemainingAmount) <= EPS
      && (current.paidInstallments ?? -1) === row.newPaidInstallments;
    if (alreadyDone) {
      records.push({ ...audit, status: "SKIPPED" });
      continue;
    }

    const guardBroken =
      current == null
      || (row.expectedUpdatedAt != null && current.updatedAt != null && current.updatedAt !== row.expectedUpdatedAt)
      || (row.oldRemainingAmount != null
        && current.remainingAmount != null
        && Math.abs(current.remainingAmount - row.oldRemainingAmount) > EPS);
    if (guardBroken) {
      records.push({ ...audit, status: "CONFLICT" });
      continue;
    }

    try {
      await options.applier?.(row);
      records.push({ ...audit, status: "UPDATED" });
    } catch (error) {
      records.push({ ...audit, status: "FAILED", error: error instanceof Error ? error.message : "erro desconhecido" });
    }
  }

  return {
    records,
    updated: records.filter((r) => r.status === "UPDATED").length,
    skipped: records.filter((r) => r.status === "SKIPPED").length,
    conflicts: records.filter((r) => r.status === "CONFLICT").length,
    failed: records.filter((r) => r.status === "FAILED").length,
  };
}

export interface RollbackPlanRow {
  loanId: string;
  restoreRemainingAmount?: number;
  restorePaidInstallments?: number;
  allowed: boolean;
  reason?: string;
}

/**
 * Rollback só é permitido quando a linha ainda está EXATAMENTE no valor que o
 * lote produziu — assim alterações legítimas posteriores não são sobrescritas.
 */
export function buildCacheBackfillRollbackPlan(
  records: BackfillAuditRecord[],
  currentStateByLoanId: Map<string, CurrentCacheState>,
): RollbackPlanRow[] {
  return records
    .filter((r) => r.status === "UPDATED")
    .map((r) => {
      const current = currentStateByLoanId.get(r.loanId);
      if (!current) {
        return { loanId: r.loanId, allowed: false, reason: "estado atual desconhecido" };
      }
      const matchesBatch =
        Math.abs((current.remainingAmount ?? NaN) - r.newValues.remainingAmount) <= EPS
        && (current.paidInstallments ?? -1) === r.newValues.paidInstallments;
      if (!matchesBatch) {
        return { loanId: r.loanId, allowed: false, reason: "valor alterado após o lote" };
      }
      return {
        loanId: r.loanId,
        restoreRemainingAmount: r.oldValues.remainingAmount,
        restorePaidInstallments: r.oldValues.paidInstallments,
        allowed: true,
      };
    });
}

export interface PostBackfillValidation {
  ok: boolean;
  cacheAligned: number;
  cacheMisaligned: string[];
  financialStateChanged: string[];
  negativeBalance: string[];
  settledWithBalance: string[];
}

/**
 * Validação pós-lote: o cache deve coincidir com o cálculo e o ESTADO
 * FINANCEIRO precisa permanecer idêntico (backfill não muda cálculo).
 */
export function validateAfterBackfill(
  before: RealLoanValidationRow[],
  after: RealLoanValidationRow[],
): PostBackfillValidation {
  const beforeById = new Map(before.map((r) => [r.loanId, r]));
  const cacheMisaligned: string[] = [];
  const financialStateChanged: string[] = [];
  const negativeBalance: string[] = [];
  const settledWithBalance: string[] = [];
  let cacheAligned = 0;

  for (const row of after) {
    if (Math.abs(row.remainingAmountDifference) > EPS || row.paidInstallmentsDifference !== 0) {
      cacheMisaligned.push(row.loanId);
    } else {
      cacheAligned += 1;
    }
    const prev = beforeById.get(row.loanId);
    if (
      prev
      && (Math.abs(prev.unifiedTotalReceivable - row.unifiedTotalReceivable) > EPS
        || Math.abs(prev.unifiedPrincipalRemaining - row.unifiedPrincipalRemaining) > EPS)
    ) {
      financialStateChanged.push(row.loanId);
    }
    if (row.flags.hasNegativeBalance) negativeBalance.push(row.loanId);
    if (row.flags.settledWithBalance) settledWithBalance.push(row.loanId);
  }

  return {
    ok: cacheMisaligned.length === 0
      && financialStateChanged.length === 0
      && negativeBalance.length === 0
      && settledWithBalance.length === 0,
    cacheAligned,
    cacheMisaligned,
    financialStateChanged,
    negativeBalance,
    settledWithBalance,
  };
}

const CSV_COLUMNS: (keyof CacheBackfillDryRunRow)[] = [
  "loanId", "oldRemainingAmount", "newRemainingAmount", "remainingDifference",
  "oldPaidInstallments", "newPaidInstallments", "paidInstallmentsDifference",
  "eligible", "reasons", "warnings",
];

export function backfillDryRunToCsv(dryRun: CacheBackfillDryRun): string {
  const escape = (v: unknown) => {
    const s = Array.isArray(v) ? v.join(" | ") : v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["batchId", ...CSV_COLUMNS].join(";");
  const lines = dryRun.rows.map((r) => [dryRun.batchId, ...CSV_COLUMNS.map((c) => escape(r[c]))].join(";"));
  return [header, ...lines].join("\n");
}

export function backfillDryRunToJson(dryRun: CacheBackfillDryRun): string {
  return JSON.stringify(dryRun, null, 2);
}
