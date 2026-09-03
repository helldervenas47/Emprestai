// Cálculo de "realizado por mês" para cada tipo de meta.
// Extraído para ser reutilizado pelo card do gráfico e pelo motor de pontuação.
import { computeActual } from "@/features/piggyBanks/components/GoalsCard";
import type { GoalType, MonthlyGoal } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import type { Loan, Payment, Expense, Client, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";

export interface RealizedInputs {
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
  renegotiations: LoanRenegotiation[];
  goals: MonthlyGoal[];
  getSnapshot: (type: GoalType, monthKey: string) => any;
  acCurrentMonth: string;
  currentActiveCapital: number;
  getSnapshotAmount: (monthKey: string) => number | null;
}

export interface MonthResult {
  monthKey: string;
  target: number;
  realized: number;
  hasGoal: boolean;
  isFuture: boolean;
}

export function computeMonthResult(
  goalType: GoalType,
  monthKey: string,
  inputs: RealizedInputs,
): MonthResult {
  const today = new Date();
  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const isClosed = monthKey < currentMonthKey;
  const isFuture = monthKey > currentMonthKey;

  let realized = 0;
  if (!isFuture) {
    if (goalType === "active_capital") {
      if (monthKey === inputs.acCurrentMonth) {
        realized = inputs.currentActiveCapital;
      } else {
        realized = inputs.getSnapshotAmount(monthKey) ?? 0;
      }
    } else {
      const snap = inputs.getSnapshot(goalType, monthKey);
      if (isClosed && snap?.finalized) {
        realized = Number(snap.realizedValue) || 0;
      } else {
        const v = computeActual(
          goalType, monthKey,
          inputs.loans, inputs.payments, inputs.expenses, inputs.clients,
          inputs.installmentSchedules, inputs.renegotiations,
        );
        realized = isFinite(v) ? v : 0;
      }
    }
  }

  const snapFinalized = isClosed && !!inputs.getSnapshot(goalType, monthKey)?.finalized;
  if (goalType === "daily_received_avg" && !isFuture && !snapFinalized) {
    const [yy, mm] = monthKey.split("-").map(Number);
    const daysInMonth = new Date(yy, mm, 0).getDate();
    const isCurrent = monthKey === currentMonthKey;
    const days = isCurrent ? today.getDate() : daysInMonth;
    realized = days > 0 ? realized / days : 0;
  }

  const exact = inputs.goals.find((g) => g.goalType === goalType && g.month === monthKey);
  return {
    monthKey,
    target: exact ? Number(exact.targetValue) || 0 : 0,
    realized,
    hasGoal: !!exact,
    isFuture,
  };
}
