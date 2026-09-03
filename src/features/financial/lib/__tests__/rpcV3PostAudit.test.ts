/**
 * ETAPA 2 — o gerador de backfill virou ferramenta de diagnóstico.
 *
 * Cobre:
 *   1. recusa de qualquer SQL de aplicação real (`RpcV3SafeModeError`);
 *   2. recusa do SQL de rollback (também é escrita);
 *   3. cobertura de paridade dos campos que substituem cards (Dashboard);
 *   4. persistência da parada automática do rollout.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { RealLoanValidationRow } from "@/features/loans/lib/realLoanValidation";
import {
  buildBackfillSql,
  buildRollbackSql,
  buildRpcV3AuditReport,
  buildRpcV3BackfillPlan,
  buildRpcV3DiagnosticSql,
  validateDashboardRpcCards,
  DASHBOARD_RPC_OVERRIDDEN_KEYS,
  RpcV3SafeModeError,
} from "@/features/financial/lib/rpcV3Migration";
import {
  isHaltRecordValid,
  parseHaltRecord,
  readRpcV3Halt,
  writeRpcV3Halt,
  clearRpcV3Halt,
  RPC_V3_HALT_TTL_MS,
} from "@/features/financial/lib/rpcV3HaltStore";


function row(partial: Partial<RealLoanValidationRow> & { loanId: string }): RealLoanValidationRow {
  return {
    originalPrincipal: 1000,
    contractualTotal: 1200,
    paymentsCount: 3,
    paymentsWithMetadata: 3,
    paymentsWithoutMetadata: 0,
    storedRemainingAmount: 900,
    calculatedRemainingAmount: 800,
    remainingAmountDifference: 100,
    storedPaidInstallments: 1,
    calculatedPaidInstallments: 2,
    paidInstallmentsDifference: 1,
    legacyTotalReceivable: 800,
    unifiedTotalReceivable: 800,
    totalDifference: 0,
    unifiedPrincipalRemaining: 700,
    unifiedInterestRemaining: 100,
    unifiedPenaltyPending: 0,
    unifiedLateInterestPending: 0,
    calculationSource: "unified",
    categories: ["CACHE_DIVERGENCE"],
    classification: "CACHE_ONLY_DIVERGENCE",
    severity: "WARNING",
    warnings: [],
    recommendedAction: "",
    officialRemainingAmount: 900,
    officialPaidInstallments: 1,
    contractualRemainingAmount: 800,
    deterministicReconstruction: true,
    legacyAllocationMissing: false,
    blockingReasons: [],
    flags: {
      hasNegativeBalance: false,
      settledWithBalance: false,
      duplicatePayments: false,
      allocationMismatch: false,
      incompleteSchedule: false,
      renegotiated: false,
      principalOverpaid: false,
      cacheDivergence: true,
      missingMetadata: false,
    },
    ...partial,
  } as RealLoanValidationRow;
}

const plan = () =>
  buildRpcV3BackfillPlan([row({ loanId: "11111111-1111-1111-1111-111111111111" })], {
    executedBy: "admin-1",
    userIdByLoanId: new Map([["11111111-1111-1111-1111-111111111111", "user-1"]]),
    generatedAt: "2026-01-01T00:00:00.000Z",
  });

describe("buildBackfillSql — recusa total de aplicação real", () => {
  it("lança RpcV3SafeModeError em vez de gerar SQL de escrita", () => {
    expect(() => buildBackfillSql(plan())).toThrow(RpcV3SafeModeError);
  });

  it("continua recusando mesmo quando o plano é forjado como não seguro", () => {
    // O modo seguro global prevalece sobre qualquer flag vinda do plano.
    expect(() => buildBackfillSql({ ...plan(), safeMode: false })).toThrow(RpcV3SafeModeError);
  });

  it("o plano nunca carrega snapshots de escrita", () => {
    expect(plan().snapshots).toHaveLength(0);
    expect(plan().eligibleCount).toBe(0);
  });
});

describe("buildRollbackSql — também é escrita e fica bloqueado", () => {
  it("lança RpcV3SafeModeError", () => {
    expect(() => buildRollbackSql(plan())).toThrow(RpcV3SafeModeError);
  });
});

describe("SQL alternativo somente leitura", () => {
  it("não contém nenhum comando de escrita", () => {
    const sql = buildRpcV3DiagnosticSql([row({ loanId: "11111111-1111-1111-1111-111111111111" })]);
    expect(sql).not.toMatch(/\bupdate\b|\binsert\b|\bdelete\b|\bbackfill_cache\b/i);
    expect(sql).toContain("official_remaining_amount");
  });
});


describe("cobertura de paridade dos cards (Dashboard híbrido)", () => {
  it("acusa campos servidos pela RPC que não foram comparados", () => {
    const result = validateDashboardRpcCards({ emprestado: 100 }, { emprestado: 100 });
    expect(result.allWithinTolerance).toBe(true);
    expect(result.overrideCoverageComplete).toBe(false);
    expect(result.unvalidatedOverriddenKeys).toContain("capitalAtivo");
  });

  it("considera coberto quando todos os campos usados nos cards são comparados", () => {
    const legacy = Object.fromEntries(DASHBOARD_RPC_OVERRIDDEN_KEYS.map((k) => [k, 10]));
    const result = validateDashboardRpcCards(legacy as never, legacy as never);
    expect(result.overrideCoverageComplete).toBe(true);
    expect(result.unvalidatedOverriddenKeys).toHaveLength(0);
  });

  it("bloqueia a aprovação do relatório quando a cobertura está incompleta", () => {
    const p = plan();
    const validation = validateDashboardRpcCards({ emprestado: 100 }, { emprestado: 100 });
    const report = buildRpcV3AuditReport([row({ loanId: "11111111-1111-1111-1111-111111111111" })], p, validation);
    expect(report.approved).toBe(false);
    expect(report.approvalBlockers.join(" ")).toContain("sem comparação");
  });
});

describe("persistência da parada automática do rollout", () => {
  beforeEach(() => clearRpcV3Halt("user-1"));

  it("mantém a parada após remontagem/refresh", () => {
    writeRpcV3Halt("user-1", "divergência de R$ 5,00");
    expect(readRpcV3Halt("user-1")).toBe("divergência de R$ 5,00");
  });

  it("isola a parada por usuário", () => {
    writeRpcV3Halt("user-1", "parada");
    expect(readRpcV3Halt("user-2")).toBeNull();
  });

  it("expira a parada após o TTL", () => {
    const now = Date.now();
    writeRpcV3Halt("user-1", "parada", now);
    expect(readRpcV3Halt("user-1", now + RPC_V3_HALT_TTL_MS + 1)).toBeNull();
  });

  it("ignora conteúdo corrompido no storage", () => {
    expect(parseHaltRecord("{não é json")).toBeNull();
    expect(isHaltRecordValid(null)).toBe(false);
  });

  it("descarta parada de outra versão da migração", () => {
    expect(
      isHaltRecordValid({ reason: "x", haltedAt: Date.now(), migrationVersion: "versao_antiga" }),
    ).toBe(false);
  });
});
