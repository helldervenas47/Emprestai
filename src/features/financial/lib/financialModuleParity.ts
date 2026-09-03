/**
 * ============================================================================
 * PARIDADE ENTRE MÓDULOS (FASE 3) — SOMENTE LEITURA
 * ============================================================================
 *
 * Compara o que cada módulo (Dashboard, Metas, Relatórios/Telegram) mostraria
 * com o que a agregação oficial calcula. Nenhuma escrita, nenhuma correção
 * automática: serve para autorizar (ou barrar) a virada da flag.
 */

import type { InstallmentSchedule, Loan, Payment, Sale } from "@/types/loan";
import { todayInAppTz } from "@/lib/timezone";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import {
  buildAppFinancialAggregates,
  periodBoundsFromRange,
  type FinancialAggregates,
} from "@/features/financial/lib/financialAggregates";
import {
  compareModuleParity,
  roundMoney,
  type ParityResult,
} from "@/features/financial/lib/financialAggregatesCore";

const LABELS: Record<string, string> = {
  principalRemaining: "Capital ativo (na rua)",
  totalReceivable: "Total a receber",
  receivedInPeriod: "Recebido no período",
  realizedProfitInPeriod: "Lucro realizado no período",
  interestAndFeesPending: "Lucro estimado (pendente)",
};

export interface ModuleParityInput {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  sales?: Sale[];
  range: { start: Date; end: Date; label?: string };
  calculationDate?: string;
}

export interface ModuleParityReport {
  aggregates: FinancialAggregates;
  dashboard: ParityResult;
  goals: ParityResult;
  reports: ParityResult;
  ok: boolean;
}

function isActive(loan: Loan): boolean {
  return loan.status !== "paid" && (loan.status as string) !== "completed";
}

/** Reprodução das fórmulas LEGADAS por módulo (para comparação). */
function legacyDashboardNumbers(input: ModuleParityInput): Record<string, number> {
  const { loans, payments } = input;
  const schedules = input.installmentSchedules ?? [];
  const active = loans.filter(isActive);
  const capitalOnStreet = active.reduce((sum, loan) => {
    const n = loan.installments > 0 ? loan.installments : 1;
    const paid = Math.min(loan.paidInstallments ?? 0, n);
    return sum + loan.amount * Math.max(0, (n - paid) / n);
  }, 0);
  const pendingReceivable = active.reduce(
    (sum, loan) => sum + getLoanReceivable(loan, payments, schedules),
    0,
  );
  const inPeriod = payments.filter((p) => {
    const day = String(p.date ?? "").slice(0, 10);
    const bounds = periodBoundsFromRange(input.range);
    return day >= bounds.startIso && day <= bounds.endIso;
  });
  return {
    principalRemaining: roundMoney(capitalOnStreet),
    totalReceivable: roundMoney(pendingReceivable),
    receivedInPeriod: roundMoney(inPeriod.reduce((s, p) => s + p.amount, 0)),
  };
}

function legacyGoalsNumbers(input: ModuleParityInput): Record<string, number> {
  const schedules = input.installmentSchedules ?? [];
  const activeCapital = input.loans
    .filter(isActive)
    .reduce((sum, loan) => sum + getLoanReceivable(loan, input.payments, schedules), 0);
  return { totalReceivable: roundMoney(activeCapital) };
}

function legacyReportsNumbers(input: ModuleParityInput): Record<string, number> {
  const active = input.loans.filter(isActive);
  const totalToReceive = active.reduce(
    (sum, loan) => sum + calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments),
    0,
  );
  return { totalReceivable: roundMoney(totalToReceive) };
}

/**
 * Roda a comparação oficial × módulo para Dashboard, Metas e Relatórios.
 */
export function buildModuleParityReport(input: ModuleParityInput): ModuleParityReport {
  const period = periodBoundsFromRange(input.range);
  const aggregates = buildAppFinancialAggregates({
    loans: input.loans,
    payments: input.payments,
    installmentSchedules: input.installmentSchedules,
    sales: input.sales,
    includeSales: false,
    period,
    calculationDate: input.calculationDate ?? todayInAppTz(),
  });

  const reference = {
    principalRemaining: aggregates.principalRemaining,
    totalReceivable: aggregates.totalReceivable,
    receivedInPeriod: aggregates.receivedInPeriod.total,
  };

  const dashboard = compareModuleParity(reference, legacyDashboardNumbers(input), LABELS);
  const goals = compareModuleParity(
    { totalReceivable: aggregates.totalReceivable },
    legacyGoalsNumbers(input),
    LABELS,
  );
  const reports = compareModuleParity(
    { totalReceivable: aggregates.totalReceivable },
    legacyReportsNumbers(input),
    LABELS,
  );

  return {
    aggregates,
    dashboard,
    goals,
    reports,
    ok: dashboard.ok && goals.ok && reports.ok,
  };
}
