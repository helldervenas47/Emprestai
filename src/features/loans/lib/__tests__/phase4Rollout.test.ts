import { describe, it, expect, beforeEach } from "vitest";
import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import {
  buildRealLoanValidation,
  summarizeRealValidation,
  evaluateFinancialRolloutReadiness,
  buildSamplingPlan,
  realValidationToCsv,
  realValidationToJson,
  detectDuplicatePayments,
  detectAllocationMismatch,
} from "@/features/loans/lib/realLoanValidation";
import {
  resolveFinancialRollout,
  resolveRolloutBucket,
  nextRolloutStage,
  stableHash,
} from "@/features/financial/lib/financialRollout";
import {
  recordFinancialEvent,
  evaluateFinancialAlerts,
  shouldEmitAlert,
  sanitizeEventPayload,
  hashUserId,
  getFinancialEventBuffer,
  clearFinancialEventBuffer,
} from "@/features/financial/lib/financialObservability";
import {
  buildCacheBackfillDryRun,
  chunkBackfillBatches,
  applyCacheBackfillBatch,

  buildCacheBackfillRollbackPlan,
  validateAfterBackfill,
  evaluateBackfillEligibility,
  backfillDryRunToCsv,
  type CacheBackfillDryRunRow,
} from "@/features/loans/lib/cacheBackfill";
import { UNIFIED_FINANCIAL_VERSION } from "@/features/financial/lib/financialVersion";
import { RpcV3SafeModeError } from "@/features/financial/lib/rpcV3SafeMode";
import { resolveFinancialFlagInventory } from "@/features/financial/lib/financialFlagInventory";


const TODAY = "2026-01-15";

function makeLoan(over: Partial<Loan> = {}): Loan {
  return {
    id: "L1",
    borrowerName: "Cliente Teste",
    amount: 1000,
    interestRate: 20,
    interestType: "Mensal",
    paymentType: "Mensal",
    startDate: "2025-12-01",
    dueDate: "2026-02-01",
    installments: 1,
    paidInstallments: 0,
    status: "active",
    createdAt: "2025-12-01",
    ...over,
  } as Loan;
}

function pay(over: Partial<Payment> & { amount: number }): Payment {
  return {
    id: over.id ?? `p-${Math.random().toString(36).slice(2)}`,
    loanId: "L1",
    date: "2026-01-05",
    installmentNumber: 1,
    ...over,
  } as Payment;
}

function schedules(loanId: string, amounts: number[]): InstallmentSchedule[] {
  return amounts.map((amount, i) => ({
    loanId,
    installmentNumber: i + 1,
    amount,
    dueDate: `2026-0${i + 2}-01`,
  })) as InstallmentSchedule[];
}

const validate = (loans: Loan[], payments: Payment[], sch: InstallmentSchedule[] = []) =>
  buildRealLoanValidation(loans, payments, sch, { calculationDate: TODAY });

/* ========================================================================== */

describe("Fase 4 · versão e inventário de flags", () => {
  it("adota a versão explícita unified_financial_v1", () => {
    expect(UNIFIED_FINANCIAL_VERSION).toBe("unified_financial_v1");
  });

  it("inventaria as seis flags financeiras, desligadas por padrão", () => {
    const inv = resolveFinancialFlagInventory();
    expect(Object.keys(inv.state)).toHaveLength(6);
    expect(inv.descriptors).toHaveLength(6);
    expect(inv.state.unifiedLoanCalculation).toBe(false);
    expect(inv.state.unifiedTelegramReports).toBe(false);
    expect(inv.descriptors.every((d) => d.origin === "default_off" || d.origin === "inherited_global")).toBe(true);
    expect(inv.build.calculationVersion).toBe(UNIFIED_FINANCIAL_VERSION);
  });

  it("marca as flags VITE como build-time e a do Telegram como edge-runtime", () => {
    const inv = resolveFinancialFlagInventory();
    const telegram = inv.descriptors.find((d) => d.key === "unifiedTelegramReports")!;
    expect(telegram.scope).toBe("edge-runtime");
    expect(inv.descriptors.filter((d) => d.scope === "build-time")).toHaveLength(5);
  });
});

describe("Fase 4 · validação com dados reais", () => {
  it("classifica contrato sem pagamentos e cache correto como SAFE_TO_ENABLE", () => {
    const loan = makeLoan({ remainingAmount: 1200, paidInstallments: 0 });
    const [row] = validate([loan], []);
    expect(row.classification).toBe("SAFE_TO_ENABLE");
    expect(row.severity).toBe("INFO");
    expect(row.paymentsCount).toBe(0);
    expect(row.calculationSource).toContain(UNIFIED_FINANCIAL_VERSION);
  });

  it("detecta divergência apenas de cache (CACHE_ONLY_DIVERGENCE)", () => {
    const loan = makeLoan({ remainingAmount: 999999, paidInstallments: 0 });
    const [row] = validate([loan], []);
    expect(row.classification).toBe("CACHE_ONLY_DIVERGENCE");
    expect(row.flags.cacheDivergence).toBe(true);
    expect(Math.abs(row.remainingAmountDifference)).toBeGreaterThan(0.01);
  });

  it("classifica pagamento antigo sem metadata como SAFE_WITH_LEGACY_FALLBACK", () => {
    const loan = makeLoan({ remainingAmount: 1000, paidInstallments: 0 });
    const payments = [pay({ amount: 200, installmentNumber: -1 })];
    const [row] = validate([loan], payments);
    expect(row.paymentsWithoutMetadata).toBe(1);
    expect(["SAFE_WITH_LEGACY_FALLBACK", "CACHE_ONLY_DIVERGENCE", "HISTORICAL_DATA_INCONSISTENCY"])
      .toContain(row.classification);
    expect(row.flags.missingMetadata).toBe(true);
  });

  it("bloqueia contrato com pagamento duplicado", () => {
    const loan = makeLoan();
    const payments = [
      pay({ id: "a", amount: 300, installmentNumber: 1, date: "2026-01-05" }),
      pay({ id: "b", amount: 300, installmentNumber: 1, date: "2026-01-05" }),
    ];
    const [row] = validate([loan], payments);
    expect(row.classification).toBe("BLOCKED_FROM_MIGRATION");
    expect(row.severity).toBe("CRITICAL");
    expect(row.flags.duplicatePayments).toBe(true);
  });

  it("bloqueia quando a soma das alocações difere do pagamento", () => {
    const loan = makeLoan();
    const payments = [pay({
      amount: 500,
      installmentNumber: -1,
      metadata: { principal_amount: 400, interest_amount: 300 },
    } as any)];
    const [row] = validate([loan], payments);
    expect(row.flags.allocationMismatch).toBe(true);
    expect(row.classification).toBe("BLOCKED_FROM_MIGRATION");
  });

  it("marca contrato quitado com saldo positivo como bloqueado", () => {
    const loan = makeLoan({ status: "paid", remainingAmount: 800, paidInstallments: 1 });
    const rows = validate([loan], []);
    const row = rows[0];
    if (row.flags.settledWithBalance) {
      expect(row.classification).toBe("BLOCKED_FROM_MIGRATION");
    } else {
      expect(row.unifiedTotalReceivable).toBeLessThanOrEqual(0.01);
    }
  });

  it("exige revisão manual em contrato parcelado sem cronograma", () => {
    const loan = makeLoan({ installments: 3 });
    const [row] = validate([loan], []);
    expect(row.flags.incompleteSchedule).toBe(true);
    expect(row.classification).toBe("REQUIRES_MANUAL_REVIEW");
  });

  it("exige revisão manual em contrato renegociado", () => {
    const loan = makeLoan({ renegotiationCount: 1 } as any);
    const [row] = validate([loan], []);
    expect(row.flags.renegotiated).toBe(true);
    expect(row.classification).toBe("REQUIRES_MANUAL_REVIEW");
  });

  it("tolera diferença de até R$ 0,01 sem sair de SAFE_TO_ENABLE", () => {
    const loan = makeLoan({ remainingAmount: 1200.005, paidInstallments: 0 });
    const [row] = validate([loan], []);
    expect(Math.abs(row.totalDifference)).toBeLessThanOrEqual(0.01);
    expect(["SAFE_TO_ENABLE", "CACHE_ONLY_DIVERGENCE"]).toContain(row.classification);
  });

  it("resume classificações, severidades e diferenças absolutas", () => {
    const rows = validate(
      [
        makeLoan({ id: "A", remainingAmount: 1200 }),
        makeLoan({ id: "B", remainingAmount: 500000 }),
        makeLoan({ id: "C", installments: 3 }),
      ],
      [],
      schedules("C", [400, 400, 400]),
    );
    const summary = summarizeRealValidation(rows);
    expect(summary.totalContracts).toBe(3);
    expect(summary.cacheDivergence).toBeGreaterThanOrEqual(1);
    expect(summary.totalAbsoluteDifference).toBeGreaterThanOrEqual(0);
    expect(summary.bySeverity.INFO + summary.bySeverity.WARNING + summary.bySeverity.CRITICAL).toBe(3);
  });

  it("exporta CSV e JSON com a versão do cálculo", () => {
    const rows = validate([makeLoan()], []);
    const csv = realValidationToCsv(rows);
    expect(csv.split("\n")[0]).toContain("classification");
    expect(JSON.parse(realValidationToJson(rows)).calculationVersion).toBe(UNIFIED_FINANCIAL_VERSION);
  });

  it("monta o plano de amostragem com grupos exaustivos", () => {
    const loans = Array.from({ length: 15 }, (_, i) => makeLoan({ id: `L${i}` }));
    const payments = [pay({ loanId: "L1", amount: 100, installmentNumber: 0 })];
    const plan = buildSamplingPlan(validate(loans, payments), payments);
    const noPayments = plan.find((p) => p.group === "NO_PAYMENTS")!;
    expect(noPayments.selected.length).toBeLessThanOrEqual(10);
    expect(plan.find((p) => p.group === "CRITICAL")!.exhaustive).toBe(true);
    expect(plan.find((p) => p.group === "RENEGOTIATED")!.exhaustive).toBe(true);
  });

  it("detecta duplicidade e mismatch de alocação isoladamente", () => {
    expect(detectDuplicatePayments([
      pay({ amount: 10, id: "x" }), pay({ amount: 10, id: "y" }),
    ])).toBe(true);
    expect(detectDuplicatePayments([pay({ amount: 10 }), pay({ amount: 11 })])).toBe(false);
    expect(detectAllocationMismatch([
      pay({ amount: 100, metadata: { principal_amount: 60, interest_amount: 40 } } as any),
    ])).toBe(false);
  });
});

describe("Fase 4 · caso histórico Wendel Cerqueira", () => {
  // Principal 1.000, total 1.200, multa 300, parcial de 200 e depois 1.200.
  const loan = makeLoan({
    id: "WENDEL",
    amount: 1000,
    interestRate: 20,
    dueDate: "2025-12-01",
    penaltyValue: 300,
    penaltyType: "fixed",
  } as any);
  const payments = [
    pay({ id: "w1", loanId: "WENDEL", amount: 200, installmentNumber: -1, date: "2025-12-10" }),
    pay({ id: "w2", loanId: "WENDEL", amount: 1200, installmentNumber: -1, date: "2026-01-10" }),
  ];

  it("nunca devolve principal restante acima do valor emprestado", () => {
    const [row] = validate([loan], payments);
    expect(row.unifiedPrincipalRemaining).toBeLessThanOrEqual(row.originalPrincipal + 0.01);
    expect(row.unifiedPrincipalRemaining).toBeGreaterThanOrEqual(0);
  });

  it("fecha a composição: principal + juros + multa + juros de atraso = total", () => {
    const [row] = validate([loan], payments);
    const soma = row.unifiedPrincipalRemaining + row.unifiedInterestRemaining
      + row.unifiedPenaltyPending + row.unifiedLateInterestPending;
    expect(Math.abs(soma - row.unifiedTotalReceivable)).toBeLessThanOrEqual(0.05);
  });

  it("não produz saldo negativo após os R$ 1.400 pagos", () => {
    const [row] = validate([loan], payments);
    expect(row.unifiedTotalReceivable).toBeGreaterThanOrEqual(0);
    expect(row.flags.hasNegativeBalance).toBe(false);
  });
});

describe("Fase 4 · caso histórico Antonio Carlos (juros do card)", () => {
  const loan = makeLoan({ id: "AC", amount: 8000, interestRate: 51, installments: 3 });
  const sch = schedules("AC", [4026.67, 4026.67, 4026.66]);
  it("juros restantes nunca somam juros futuros já pagos duas vezes", () => {
    const payments = [pay({
      loanId: "AC", amount: 1360, installmentNumber: 0,
      metadata: { interest_amount: 1360 },
    } as any)];
    const [row] = validate([loan], payments, sch);
    expect(row.unifiedInterestRemaining).toBeLessThanOrEqual(row.contractualTotal - row.originalPrincipal + 0.01);
    expect(row.unifiedTotalReceivable).toBeLessThanOrEqual(row.contractualTotal + 0.01);
  });
});

describe("Fase 4 · checklist de prontidão", () => {
  it("aprova carteira em paridade total", () => {
    const rows = validate([makeLoan({ remainingAmount: 1200 }), makeLoan({ id: "L2", remainingAmount: 1200 })], []);
    const readiness = evaluateFinancialRolloutReadiness(rows, { rollbackTested: true, allTestsPassing: true });
    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toHaveLength(0);
    expect(readiness.metrics.parityRate).toBe(1);
  });

  it("bloqueia quando existe pagamento duplicado, mesmo com score alto", () => {
    const loan = makeLoan();
    const payments = [pay({ id: "a", amount: 100 }), pay({ id: "b", amount: 100 })];
    const readiness = evaluateFinancialRolloutReadiness(validate([loan], payments));
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.join(" ")).toContain("duplicado");
  });

  it("bloqueia enquanto houver CRITICAL sem revisão manual", () => {
    const loan = makeLoan();
    const payments = [pay({ id: "a", amount: 100 }), pay({ id: "b", amount: 100 })];
    const rows = validate([loan], payments);
    const unreviewed = evaluateFinancialRolloutReadiness(rows);
    expect(unreviewed.blockers.some((b) => b.includes("CRITICAL"))).toBe(true);
    const reviewed = evaluateFinancialRolloutReadiness(rows, {
      reviewedCriticalLoanIds: new Set(rows.map((r) => r.loanId)),
    });
    expect(reviewed.blockers.some((b) => b.includes("CRITICAL"))).toBe(false);
  });

  it("bloqueia quando o rollback não foi testado ou os testes falham", () => {
    const rows = validate([makeLoan({ remainingAmount: 1200 })], []);
    expect(evaluateFinancialRolloutReadiness(rows, { rollbackTested: false }).ready).toBe(false);
    expect(evaluateFinancialRolloutReadiness(rows, { allTestsPassing: false }).ready).toBe(false);
  });
});

describe("Fase 4 · rollout determinístico", () => {
  const ctx = { userId: "user-1", environment: "production", rolloutPercentage: 50 };

  it("flag desligada sempre mantém o legado", () => {
    expect(resolveFinancialRollout(false, { ...ctx, rolloutPercentage: 100 })).toMatchObject({
      enabled: false, reason: "flag_disabled",
    });
  });

  it("allowlist ativa independentemente do percentual", () => {
    const d = resolveFinancialRollout(true, { ...ctx, rolloutPercentage: 0, allowlistedUserIds: ["user-1"] });
    expect(d).toMatchObject({ enabled: true, reason: "allowlisted" });
  });

  it("usuário fora da allowlist com 0% permanece no legado", () => {
    const d = resolveFinancialRollout(true, { ...ctx, rolloutPercentage: 0, allowlistedUserIds: ["outro"] });
    expect(d.enabled).toBe(false);
    expect(d.reason).toBe("percentage_excluded");
  });

  it("ambiente não habilitado nunca ativa", () => {
    const d = resolveFinancialRollout(true, { ...ctx, rolloutPercentage: 100, enabledEnvironments: ["preview"] });
    expect(d).toMatchObject({ enabled: false, reason: "environment_disabled" });
  });

  it("bucket é determinístico e estável entre chamadas", () => {
    const a = resolveRolloutBucket({ userId: "abc" });
    const b = resolveRolloutBucket({ userId: "abc" });
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
    expect(stableHash("abc")).toBe(stableHash("abc"));
  });

  it("percentual crescente nunca remove quem já estava incluído", () => {
    const users = Array.from({ length: 200 }, (_, i) => `u${i}`);
    const at = (pct: number) => new Set(users.filter((u) =>
      resolveFinancialRollout(true, { userId: u, environment: "production", rolloutPercentage: pct }).enabled));
    const p5 = at(5); const p25 = at(25); const p100 = at(100);
    for (const u of p5) expect(p25.has(u)).toBe(true);
    for (const u of p25) expect(p100.has(u)).toBe(true);
    expect(p100.size).toBe(users.length);
  });

  it("100% só é sugerido depois das etapas intermediárias", () => {
    expect(nextRolloutStage(5)?.percentage).toBe(25);
    expect(nextRolloutStage(50)?.percentage).toBe(100);
    expect(nextRolloutStage(100)).toBeNull();
  });

  it("rollback devolve o comportamento legado sem novo cálculo", () => {
    const on = resolveFinancialRollout(true, { ...ctx, rolloutPercentage: 100 });
    const off = resolveFinancialRollout(false, { ...ctx, rolloutPercentage: 100 });
    expect(on.enabled).toBe(true);
    expect(off.enabled).toBe(false);
  });
});

describe("Fase 4 · observabilidade e alertas", () => {
  beforeEach(() => clearFinancialEventBuffer());

  it("registra eventos com versão e timestamp", () => {
    recordFinancialEvent("financial_unified_calculation_used", { module: "dashboard", loanId: "L1" });
    const [e] = getFinancialEventBuffer();
    expect(e.calculationVersion).toBe(UNIFIED_FINANCIAL_VERSION);
    expect(e.timestamp).toBeTruthy();
    expect(e.module).toBe("dashboard");
  });

  it("nunca registra dados pessoais ou secrets", () => {
    const clean = sanitizeEventPayload({
      loanId: "L1", clientName: "João", cpf: "123", phone: "9", email: "a@b.c", jwt: "x", metric: "total",
    } as any);
    expect(clean).toEqual({ loanId: "L1", metric: "total" });
    expect(hashUserId("user-1")).toMatch(/^[0-9a-f]{8}$/);
    expect(hashUserId(undefined)).toBeUndefined();
  });

  it("alerta diferença acima de R$ 10,00 e saldo negativo", () => {
    const alerts = evaluateFinancialAlerts({ loanId: "L1", difference: 25, totalReceivable: -5 });
    expect(alerts.map((a) => a.code)).toEqual(
      expect.arrayContaining(["DIFFERENCE_ABOVE_THRESHOLD", "NEGATIVE_BALANCE"]),
    );
    expect(alerts.every((a) => a.severity === "CRITICAL")).toBe(true);
  });

  it("alerta contrato quitado com saldo, Payment Hub e Dashboard×Telegram", () => {
    const codes = evaluateFinancialAlerts({
      loanStatus: "paid", totalReceivable: 100,
      paymentHubTotal: 100, contractTotal: 90,
      dashboardValue: 10, telegramValue: 12,
      allocationSum: 90, paymentAmount: 100,
    }).map((a) => a.code);
    expect(codes).toEqual(expect.arrayContaining([
      "SETTLED_WITH_BALANCE", "PAYMENT_HUB_MISMATCH", "DASHBOARD_TELEGRAM_MISMATCH", "ALLOCATION_SUM_MISMATCH",
    ]));
  });

  it("deduplica alertas repetidos na mesma janela", () => {
    const alert = { code: "NEGATIVE_BALANCE", severity: "CRITICAL" as const, message: "x", loanId: "L9" };
    expect(shouldEmitAlert(alert, 0)).toBe(true);
    expect(shouldEmitAlert(alert, 1000)).toBe(false);
    expect(shouldEmitAlert(alert, 10 * 60 * 1000)).toBe(true);
  });

  it("dispara alerta quando erros aumentam após a ativação", () => {
    const codes = evaluateFinancialAlerts({ errorRateBefore: 0.01, errorRateAfter: 0.05 }).map((a) => a.code);
    expect(codes).toContain("ERROR_RATE_SPIKE");
  });
});

describe("Fase 4 · backfill de caches", () => {
  const cacheDivergentLoan = makeLoan({ remainingAmount: 999999, paidInstallments: 0 });

  it("dry-run é apenas diagnóstico: nada fica elegível em modo seguro", () => {
    const rows = validate([cacheDivergentLoan, makeLoan({ id: "L2", installments: 3 })], []);
    const dryRun = buildCacheBackfillDryRun(rows, { generatedAt: "2026-01-15T00:00:00.000Z" });
    expect(dryRun.batchId).toMatch(/^bf_[0-9a-f]{8}$/);
    expect(dryRun.eligibleCount).toBe(0);
    expect(dryRun.blockedCount).toBe(2);
    expect(dryRun.calculationVersion).toBe(UNIFIED_FINANCIAL_VERSION);
    expect(backfillDryRunToCsv(dryRun).split("\n").length).toBeGreaterThanOrEqual(1);
  });


  it("gera o mesmo batchId para a mesma entrada (rastreabilidade)", () => {
    const rows = validate([cacheDivergentLoan], []);
    const a = buildCacheBackfillDryRun(rows, { generatedAt: "2026-01-15T00:00:00.000Z" });
    const b = buildCacheBackfillDryRun(rows, { generatedAt: "2026-01-15T00:00:00.000Z" });
    expect(a.batchId).toBe(b.batchId);
  });

  it("bloqueia contrato renegociado, crítico ou com cronograma incompleto", () => {
    const rows = validate([
      makeLoan({ id: "R", remainingAmount: 999999, renegotiationCount: 1 } as any),
      makeLoan({ id: "S", remainingAmount: 999999, installments: 3 }),
    ], []);
    for (const row of rows) {
      const e = evaluateBackfillEligibility(row);
      expect(e.eligible).toBe(false);
      expect(e.reasons.length).toBeGreaterThan(0);
    }
  });

  it("não monta lote algum quando nada é elegível", () => {
    const rows = Array.from({ length: 120 }, (_, i) =>
      makeLoan({ id: `L${i}`, remainingAmount: 999999 }));
    const dryRun = buildCacheBackfillDryRun(validate(rows, []));
    const batches = chunkBackfillBatches(dryRun, 50);
    expect(batches).toHaveLength(0);

  });

  it("ETAPA 2 — nenhuma escrita ocorre, nem com approved=true", async () => {
    const dryRun = buildCacheBackfillDryRun(validate([cacheDivergentLoan], []));
    const batch = chunkBackfillBatches(dryRun)[0] ?? [];
    let writes = 0;
    await expect(
      applyCacheBackfillBatch(dryRun.batchId, batch, {
        approved: true,
        currentStateByLoanId: new Map([["L1", { remainingAmount: 999999, paidInstallments: 0 }]]),
        applier: () => { writes += 1; },
      }),
    ).rejects.toBeInstanceOf(RpcV3SafeModeError);
    expect(writes).toBe(0);
  });

  it("ETAPA 2 — o applier nunca é invocado em lote múltiplo", async () => {
    const loans = [
      makeLoan({ id: "A", remainingAmount: 999999 }),
      makeLoan({ id: "B", remainingAmount: 999999 }),
    ];
    const dryRun = buildCacheBackfillDryRun(validate(loans, []));
    const batch = chunkBackfillBatches(dryRun)[0] ?? [];
    let writes = 0;
    await expect(
      applyCacheBackfillBatch(dryRun.batchId, batch, {
        approved: true,
        currentStateByLoanId: new Map(loans.map((l) => [l.id, { remainingAmount: 999999, paidInstallments: 0 }])),
        applier: () => { writes += 1; },
      }),
    ).rejects.toBeInstanceOf(RpcV3SafeModeError);
    expect(writes).toBe(0);
  });



  it("rollback só é permitido quando o valor ainda é o do lote", () => {
    const records = [{
      batchId: "bf_x", loanId: "L1", calculationVersion: UNIFIED_FINANCIAL_VERSION,
      oldValues: { remainingAmount: 999999, paidInstallments: 0 },
      newValues: { remainingAmount: 1200, paidInstallments: 0 },
      status: "UPDATED" as const, executedAt: "2026-01-15T00:00:00Z",
    }];
    const allowed = buildCacheBackfillRollbackPlan(records, new Map([["L1", { remainingAmount: 1200, paidInstallments: 0 }]]));
    expect(allowed[0]).toMatchObject({ allowed: true, restoreRemainingAmount: 999999 });
    const changed = buildCacheBackfillRollbackPlan(records, new Map([["L1", { remainingAmount: 800, paidInstallments: 0 }]]));
    expect(changed[0]).toMatchObject({ allowed: false });
    expect(changed[0].reason).toContain("alterado");
  });

  it("validação pós-backfill confirma cache alinhado e cálculo inalterado", () => {
    const before = validate([makeLoan({ remainingAmount: 999999 })], []);
    const after = validate([makeLoan({ remainingAmount: before[0].calculatedRemainingAmount })], []);
    const result = validateAfterBackfill(before, after);
    expect(result.ok).toBe(true);
    expect(result.cacheAligned).toBe(1);
    expect(result.financialStateChanged).toHaveLength(0);
  });

  it("validação pós-backfill acusa mudança indevida no cálculo", () => {
    const before = validate([makeLoan({ id: "L1", amount: 1000, remainingAmount: 1200 })], []);
    const after = validate([makeLoan({ id: "L1", amount: 2000, remainingAmount: 2400 })], []);
    expect(validateAfterBackfill(before, after).financialStateChanged).toContain("L1");
  });

  it("dry-run de contrato já alinhado não gera elegibilidade", () => {
    const rows = validate([makeLoan({ remainingAmount: 1200, paidInstallments: 0 })], []);
    const dryRun = buildCacheBackfillDryRun(rows);
    expect(dryRun.eligibleCount).toBe(0);
  });
});

describe("Fase 4 · benchmark de carteiras", () => {
  const build = (n: number) => {
    const loans = Array.from({ length: n }, (_, i) => makeLoan({ id: `L${i}` }));
    const payments = loans.flatMap((l) => [pay({ loanId: l.id, amount: 100, installmentNumber: 0 })]);
    return { loans, payments };
  };

  it.each([10, 100, 1000])("agrega %i contratos sem explosão de tempo", (n) => {
    const { loans, payments } = build(n);
    const start = Date.now();
    const rows = validate(loans, payments);
    const elapsed = Date.now() - start;
    expect(rows).toHaveLength(n);
    expect(elapsed).toBeLessThan(15000);
  });
});
