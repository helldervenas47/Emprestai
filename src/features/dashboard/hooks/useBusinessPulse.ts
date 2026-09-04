import { useMemo, useState, useCallback } from "react";
import type { Client, Loan, Sale, Payment, Expense, InstallmentSchedule } from "@/types/loan";
import {
  calculateBusinessPulseMetrics,
  generateBusinessPulseAnalysis,
  type BusinessPulseAnalysis,
} from "../lib/businessPulse";

interface UseBusinessPulseParams {
  loans: Loan[];
  sales?: Sale[];
  payments: Payment[];
  expenses: Expense[];
  clients?: Client[];
  installmentSchedules?: InstallmentSchedule[];
  range: { start: Date; end: Date; label: string };
  period?: "day" | "week" | "month";
}

export function useBusinessPulse({
  loans,
  sales = [],
  payments,
  expenses,
  clients = [],
  installmentSchedules = [],
  range,
  period = "month",
}: UseBusinessPulseParams) {
  const [manualRefreshKey, setManualRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setManualRefreshKey((k) => k + 1);
  }, []);

  const analysis: BusinessPulseAnalysis = useMemo(() => {
    try {
      const metrics = calculateBusinessPulseMetrics({
        loans,
        sales,
        payments,
        expenses,
        clients,
        installmentSchedules,
        range,
        period,
      });

      return generateBusinessPulseAnalysis(metrics);
    } catch (err) {
      console.error("[useBusinessPulse] Erro ao calcular análise executiva:", err);
      return {
        generatedAt: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        hasSufficientData: false,
        isInitialHistory: true,
        headline: "Não foi possível carregar a análise do negócio no momento.",
        tone: "attention",
        events: [],
        recommendation: {
          text: "Tente atualizar o Dashboard ou verifique suas movimentações recentes.",
        },
        metrics: {} as any,
        prioritaryClients: [],
      };
    }
  }, [
    loans,
    sales,
    payments,
    expenses,
    clients,
    installmentSchedules,
    range.start.getTime(),
    range.end.getTime(),
    range.label,
    period,
    manualRefreshKey,
  ]);

  return {
    analysis,
    refresh,
  };
}
