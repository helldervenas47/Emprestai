import { useState, useMemo, useCallback, useEffect } from "react";
import type { Loan, Payment, Expense, Client, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";
import { useMonthlyGoals } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { useGoalSnapshots } from "@/features/piggyBanks/hooks/useGoalSnapshots";
import { useActiveCapitalSnapshots } from "@/features/piggyBanks/hooks/useActiveCapitalSnapshots";
import { todayInAppTz } from "@/lib/timezone";
import { toast } from "sonner";
import {
  computeMonthlyClosingData,
  getPreviousMonthKey,
  getNextMonthKey,
} from "./monthlyClosingCalculator";
import { exportMonthlyClosingPdf } from "./exportMonthlyClosingPdf";
import type { MonthlyClosingData } from "./types";

interface UseMonthlyClosingParams {
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules?: InstallmentSchedule[];
  renegotiations?: LoanRenegotiation[];
  initialMonth?: string;
}

export function getDefaultClosedMonth(): string {
  const today = todayInAppTz(); // YYYY-MM-DD
  const currentMonthKey = today.slice(0, 7);
  return getPreviousMonthKey(currentMonthKey);
}

export function useMonthlyClosing({
  loans,
  payments,
  expenses,
  clients,
  installmentSchedules = [],
  renegotiations = [],
  initialMonth,
}: UseMonthlyClosingParams) {
  // Mês selecionado inicia no mês recém-encerrado por padrão
  const [selectedMonth, setSelectedMonth] = useState<string>(() => initialMonth || getDefaultClosedMonth());
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>(() =>
    new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const { goals, loading: goalsLoading, reload: reloadGoals } = useMonthlyGoals();
  const { getSnapshot: getGoalSnapshot } = useGoalSnapshots();
  const { getSnapshotAmount: getActiveCapitalSnapshot } = useActiveCapitalSnapshots();

  const closingData: MonthlyClosingData = useMemo(() => {
    return computeMonthlyClosingData({
      monthKey: selectedMonth,
      loans,
      payments,
      expenses,
      clients,
      installmentSchedules,
      renegotiations,
      goals,
      getGoalSnapshot,
      getActiveCapitalSnapshot,
      lastUpdatedAt,
    });
  }, [
    selectedMonth,
    loans,
    payments,
    expenses,
    clients,
    installmentSchedules,
    renegotiations,
    goals,
    getGoalSnapshot,
    getActiveCapitalSnapshot,
    lastUpdatedAt,
  ]);

  const goToPrevMonth = useCallback(() => {
    setSelectedMonth((prev) => getPreviousMonthKey(prev));
  }, []);

  const goToNextMonth = useCallback(() => {
    setSelectedMonth((prev) => getNextMonthKey(prev));
  }, []);

  const recalculate = useCallback(async () => {
    const now = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    setLastUpdatedAt(now);
    await reloadGoals();
    toast.success(`Fechamento de ${closingData.monthLabel} atualizado com sucesso!`);
  }, [closingData.monthLabel, reloadGoals]);

  const exportPdf = useCallback(async () => {
    try {
      setIsExportingPdf(true);
      await exportMonthlyClosingPdf(closingData);
      toast.success("Relatório PDF exportado com sucesso!");
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      toast.error("Erro ao exportar PDF do fechamento.");
    } finally {
      setIsExportingPdf(false);
    }
  }, [closingData]);

  return {
    selectedMonth,
    setSelectedMonth,
    closingData,
    goalsLoading,
    goToPrevMonth,
    goToNextMonth,
    recalculate,
    exportPdf,
    isExportingPdf,
    lastUpdatedAt,
  };
}
