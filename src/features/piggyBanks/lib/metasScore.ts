import type { GoalType } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { computePeriodAverage, getPeriodMonths, isGoalReached, PeriodSelection } from "@/features/piggyBanks/lib/metasPeriod";
import { computeMonthResult, RealizedInputs } from "@/features/piggyBanks/lib/metasMonthResult";

// Metas com regra inversa (quanto menor, melhor).
export const INVERSE_GOAL_TYPES: Set<GoalType> = new Set(["max_default_rate", "renegotiation_rate"]);

export interface ScoreBreakdownEntry {
  goalType: GoalType;
  weight: number;
  reached: boolean;
  targetAvg: number;
  realizedAvg: number;
  validMonths: number;
}

export interface ScoreResult {
  total: number;
  maxTotal: number;
  breakdown: ScoreBreakdownEntry[];
}

export function computePeriodScore(
  period: PeriodSelection,
  weights: Record<GoalType, number>,
  inputs: RealizedInputs,
): ScoreResult {
  const months = getPeriodMonths(period);
  const breakdown: ScoreBreakdownEntry[] = [];
  let total = 0;
  let maxTotal = 0;

  (Object.keys(weights) as GoalType[]).forEach((gt) => {
    const w = Number(weights[gt] || 0);
    if (w <= 0) return;
    maxTotal += w;

    const inverse = INVERSE_GOAL_TYPES.has(gt);
    const rows = months.map((mk) => computeMonthResult(gt, mk, inputs));
    const { targetAvg, realizedAvg, validCount } = computePeriodAverage(
      rows.map((r) => ({
        monthKey: r.monthKey,
        hasGoal: r.hasGoal,
        isFuture: r.isFuture,
        target: r.target,
        realized: r.realized,
      })),
    );

    const reached = validCount > 0 && isGoalReached(inverse, targetAvg, realizedAvg);
    if (reached) total += w;

    breakdown.push({
      goalType: gt,
      weight: w,
      reached,
      targetAvg,
      realizedAvg,
      validMonths: validCount,
    });
  });

  return { total, maxTotal, breakdown };
}
