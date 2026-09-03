// Hook consolidado que reúne todos os inputs necessários para calcular a
// Pontuação Geral Mensal das metas, e expõe uma função `getMonthlyScore(monthKey)`.
// Usa a MESMA lógica dos cards e da tabela detalhada (computePeriodScore em
// modo "month") — garante fonte única de verdade.
import { useCallback, useMemo } from "react";
import { useLoans } from "@/features/loans/hooks/useLoans";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useClients } from "@/features/clients/hooks/useClients";
import { useLoanRenegotiations } from "@/features/loans/hooks/useLoanRenegotiations";
import { useMonthlyGoals } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { useGoalSnapshots } from "@/features/piggyBanks/hooks/useGoalSnapshots";
import { useActiveCapitalSnapshots } from "@/features/piggyBanks/hooks/useActiveCapitalSnapshots";
import { useGoalScoreWeights } from "@/features/piggyBanks/hooks/useGoalScoreWeights";
import { computePeriodScore } from "@/features/piggyBanks/lib/metasScore";
import { useUnifiedGoalsCalculation } from "@/features/financial/lib/financialFlags";
import { buildAppFinancialAggregates } from "@/features/financial/lib/financialAggregates";

export function useMonthlyScoreProvider() {
  const { loans, payments, installmentSchedules } = useLoans();
  const { expenses } = useExpenses();
  const { clients } = useClients();
  const { renegotiations } = useLoanRenegotiations();
  const { goals, loading: goalsLoading } = useMonthlyGoals();
  const { getSnapshot } = useGoalSnapshots();
  const { weights, loaded: weightsLoaded } = useGoalScoreWeights();
  const unified = useUnifiedGoalsCalculation();

  // Capital ativo das Metas.
  //   flag OFF (default) → regra atual (soma de getLoanReceivable).
  //   flag ON            → total a receber da agregação unificada.
  const currentActiveCapital = useMemo(
    () => {
      if (unified) {
        return buildAppFinancialAggregates({ loans, payments, installmentSchedules }).totalReceivable;
      }
      return loans
        .filter((l: any) => l.status !== "completed" && l.status !== "paid")
        .reduce((s: number, l: any) => s + getLoanReceivable(l, payments, installmentSchedules), 0);
    },
    [loans, payments, installmentSchedules, unified],
  );

  const { currentMonth: acCurrentMonth, getSnapshotAmount } = useActiveCapitalSnapshots(currentActiveCapital);

  const inputs = useMemo(() => ({
    loans, payments, expenses, clients, installmentSchedules, renegotiations,
    goals, getSnapshot, acCurrentMonth, currentActiveCapital, getSnapshotAmount,
  }), [loans, payments, expenses, clients, installmentSchedules, renegotiations, goals, getSnapshot, acCurrentMonth, currentActiveCapital, getSnapshotAmount]);

  const getMonthlyScore = useCallback((monthKey: string): number => {
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return 0;
    const res = computePeriodScore({ mode: "month", year: y, month: m }, weights, inputs);
    return res.total;
  }, [weights, inputs]);

  // "ready" só quando os dados que compõem a pontuação realmente chegaram.
  // Antes bastava `weightsLoaded`, então o motor de bônus rodava com
  // empréstimos/pagamentos ainda vazios, calculava pontuação 0 e nunca gerava
  // o bônus na sessão.
  const ready =
    weightsLoaded && !goalsLoading && goals.length > 0 && loans.length > 0;

  return { getMonthlyScore, ready };
}
