/**
 * Hook memoizado dos agregados financeiros unificados (Fase 3).
 *
 * Não substitui nada por conta própria: devolve os agregados oficiais e o
 * estado da flag, para que cada módulo decida (Dashboard, Metas, Relatórios).
 */
import { useMemo } from "react";
import type { InstallmentSchedule, Loan, Payment, Sale } from "@/types/loan";
import { todayInAppTz } from "@/lib/timezone";
import {
  buildAppFinancialAggregates,
  periodBoundsFromRange,
  type FinancialAggregates,
} from "@/features/financial/lib/financialAggregates";

export interface UseUnifiedFinancialAggregatesInput {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  sales?: Sale[];
  includeSales?: boolean;
  range?: { start: Date; end: Date; label?: string };
  /** Quando false, o cálculo nem é executado (evita custo com flag desligada). */
  enabled?: boolean;
}

export function useUnifiedFinancialAggregates(
  input: UseUnifiedFinancialAggregatesInput,
): FinancialAggregates | null {
  const {
    loans, payments, installmentSchedules, sales, includeSales, range, enabled = true,
  } = input;

  const startTime = range?.start.getTime() ?? 0;
  const endTime = range?.end.getTime() ?? 0;

  return useMemo(() => {
    if (!enabled) return null;
    return buildAppFinancialAggregates({
      loans,
      payments,
      installmentSchedules,
      sales,
      includeSales,
      period: range ? periodBoundsFromRange(range) : null,
      calculationDate: todayInAppTz(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loans, payments, installmentSchedules, sales, includeSales, startTime, endTime]);
}
