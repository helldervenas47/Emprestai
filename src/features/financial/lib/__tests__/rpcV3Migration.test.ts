import { describe, it, expect } from "vitest";
import type { RealLoanValidationRow } from "@/features/loans/lib/realLoanValidation";
import {
  buildRpcV3AuditReport,
  buildRpcV3BackfillPlan,
  buildBackfillSql,
  buildRollbackSql,
  buildRpcV3DiagnosticSql,
  evaluateRpcV3BackfillEligibility,
  normalizeBlocklist,
  nextRpcV3Phase,
  resolveRpcV3Rollout,
  validateDashboardRpcCards,
  RpcV3SafeModeError,
} from "@/features/financial/lib/rpcV3Migration";

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

/**
 * ETAPA 2 — o módulo virou ferramenta de DIAGNÓSTICO.
 * Divergência sozinha NUNCA autoriza escrita.
 */
describe("elegibilidade conservadora (ETAPA 2)", () => {
  it("bloqueia divergência de cache: divergir não é autorização", () => {
    const e = evaluateRpcV3BackfillEligibility(row({ loanId: "a" }));
    expect(e.decision).toBe("BLOCKED");
    expect(e.reasons.join(" ")).toContain("modo seguro");
  });

  it("bloqueia contratos em revisão manual", () => {
    const r = row({
      loanId: "b",
      classification: "REQUIRES_MANUAL_REVIEW",
      blockingReasons: ["revisão manual"],
    });
    expect(evaluateRpcV3BackfillEligibility(r).decision).toBe("BLOCKED");
  });

  it("bloqueia por loan_id da blocklist explícita", () => {
    const list = normalizeBlocklist(["c"]);
    expect(evaluateRpcV3BackfillEligibility(row({ loanId: "c" }), list).decision).toBe("BLOCKED");
  });

  it("bloqueia quando há pagamento legado sem alocação, mesmo fora do modo seguro", () => {
    const r = row({
      loanId: "d",
      legacyAllocationMissing: true,
      deterministicReconstruction: false,
      blockingReasons: ["pagamentos legados sem alocação persistida (allocation_version ausente)"],
    });
    const e = evaluateRpcV3BackfillEligibility(r, undefined, { safeMode: false });
    expect(e.decision).toBe("BLOCKED");
    expect(e.reasons.join(" ")).toContain("legados");
  });

  it("bloqueia quando o estado consolidado já coincide", () => {
    const ok = row({
      loanId: "f",
      storedRemainingAmount: 800,
      remainingAmountDifference: 0,
      paidInstallmentsDifference: 0,
    });
    expect(evaluateRpcV3BackfillEligibility(ok, undefined, { safeMode: false }).decision).toBe("BLOCKED");
  });
});

describe("plano em modo seguro", () => {
  const rows = [
    row({ loanId: "11111111-1111-1111-1111-111111111111" }),
    row({ loanId: "22222222-2222-2222-2222-222222222222", classification: "REQUIRES_MANUAL_REVIEW" }),
    row({ loanId: "33333333-3333-3333-3333-333333333333", classification: "SAFE_TO_ENABLE", categories: ["NONE"] }),
  ];
  const plan = buildRpcV3BackfillPlan(rows, {
    executedBy: "admin-1",
    userIdByLoanId: new Map([["11111111-1111-1111-1111-111111111111", "user-1"]]),
    generatedAt: "2026-07-27T00:00:00.000Z",
  });

  it("não produz nenhum contrato elegível nem snapshot de escrita", () => {
    expect(plan.eligibleCount).toBe(0);
    expect(plan.snapshots).toHaveLength(0);
    expect(plan.blockedCount).toBe(3);
    expect(plan.safeMode).toBe(true);
    expect(plan.refusalReason).toContain("Modo seguro");
  });

  it("recusa a geração de SQL de aplicação e de rollback", () => {
    expect(() => buildBackfillSql(plan)).toThrow(RpcV3SafeModeError);
    expect(() => buildRollbackSql(plan)).toThrow(RpcV3SafeModeError);
  });

  it("gera apenas SQL de leitura para conferência", () => {
    const sql = buildRpcV3DiagnosticSql(rows);
    expect(sql).toContain("select");
    expect(sql).not.toMatch(/\bupdate\b|\binsert\b|\bdelete\b/i);
  });
});

describe("rollout em fases com parada automática", () => {
  it("fase 1 libera apenas administradores", () => {
    expect(resolveRpcV3Rollout({ phase: "phase1_admin", role: "admin", userId: "u" }).enabled).toBe(true);
    expect(resolveRpcV3Rollout({ phase: "phase1_admin", role: "user", userId: "u" }).enabled).toBe(false);
  });

  it("interrompe quando a divergência passa de R$ 0,01", () => {
    const d = resolveRpcV3Rollout({ phase: "phase4_100", role: "admin", userId: "u", largestDifference: 0.05 });
    expect(d.enabled).toBe(false);
    expect(d.halted).toBe(true);
  });

  it("fase 4 inclui todos os usuários", () => {
    expect(resolveRpcV3Rollout({ phase: "phase4_100", role: "user", userId: "abc" }).enabled).toBe(true);
  });

  it("não avança de fase com divergência", () => {
    expect(nextRpcV3Phase("phase2_10", 1).allowed).toBe(false);
    expect(nextRpcV3Phase("phase2_10", 0).next).toBe("phase3_50");
  });
});

describe("validação dos cards e relatório final", () => {
  const legacy = { capitalAtivo: 100, receber: 200, jurosRecebidos: 50 };

  it("aprova quando tudo está dentro de R$ 0,01", () => {
    const v = validateDashboardRpcCards(legacy, { capitalAtivo: 100, receber: 200.005, jurosRecebidos: 50 });
    expect(v.allWithinTolerance).toBe(true);
  });

  it("reprova divergência material", () => {
    const v = validateDashboardRpcCards(legacy, { capitalAtivo: 90, receber: 200, jurosRecebidos: 50 });
    expect(v.allWithinTolerance).toBe(false);
    expect(v.divergent[0].label).toBe("Capital Ativo");
  });

  it("nunca aprova o relatório em modo seguro", () => {
    const plan = buildRpcV3BackfillPlan([row({ loanId: "x" })], { executedBy: "a" });
    const report = buildRpcV3AuditReport(
      [row({ loanId: "x" })],
      plan,
      validateDashboardRpcCards(legacy, { capitalAtivo: 90, receber: 200, jurosRecebidos: 50 }),
    );
    expect(report.approved).toBe(false);
    expect(report.safeMode).toBe(true);
    expect(report.summary.analyzed).toBe(1);
  });
});
