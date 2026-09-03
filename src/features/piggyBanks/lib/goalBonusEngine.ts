// Motor de geração de bônus por pontuação de metas.
// Gera awards para uma competência já fechada, respeitando:
//  - vigência da configuração do bônus (start_date / end_date)
//  - pontuação mínima exigida
//  - idempotência (unique constraint em (user_id, employee_id, reference_month))
import { supabase } from "@/integrations/supabase/userClient";
import type { EmployeeGoalBonus } from "@/features/piggyBanks/hooks/useEmployeeGoalBonuses";

/** Retorna 'YYYY-MM' do mês vigente (não expirado). */
export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m, 1); // m já é 1-indexado, +1 no construtor 0-indexado dá o próximo
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** referenceMonth é elegível se estiver estritamente antes do mês vigente. */
export function isClosedCompetence(referenceMonth: string): boolean {
  return referenceMonth < currentMonthKey();
}

function isConfigActiveForMonth(cfg: EmployeeGoalBonus, referenceMonth: string): boolean {
  if (!cfg.enabled) return false;
  // Comparação por mês: usar YYYY-MM. O bônus vale se referenceMonth >= startMonth e (sem end ou <= endMonth).
  const startMonth = cfg.startDate?.slice(0, 7);
  const endMonth = cfg.endDate?.slice(0, 7) ?? null;
  if (!startMonth) return false;
  if (referenceMonth < startMonth) return false;
  if (endMonth && referenceMonth > endMonth) return false;
  return true;
}

export interface GenerateBonusOptions {
  userId: string;
  referenceMonth: string; // 'YYYY-MM'
  bonuses: EmployeeGoalBonus[];
  getMonthlyScore: (monthKey: string) => number;
}

/**
 * Cria awards para todos os funcionários com bônus vigente que atingiram
 * a pontuação mínima no referenceMonth. Idempotente (ON CONFLICT DO NOTHING).
 * Retorna a quantidade de awards efetivamente criados.
 */
export async function generateBonusAwardsForMonth(opts: GenerateBonusOptions): Promise<number> {
  const { userId, referenceMonth, bonuses, getMonthlyScore } = opts;
  if (!isClosedCompetence(referenceMonth)) return 0;

  const eligibleConfigs = bonuses.filter((b) => isConfigActiveForMonth(b, referenceMonth));
  if (eligibleConfigs.length === 0) return 0;

  const score = getMonthlyScore(referenceMonth);
  const winners = eligibleConfigs.filter((b) => score >= b.minScore);
  if (winners.length === 0) return 0;

  const payrollMonth = nextMonthKey(referenceMonth);
  let created = 0;

  for (const cfg of winners) {
    // Checa duplicidade antes de inserir (unique constraint garante segurança em corrida).
    const { data: existing } = await supabase
      .from("goal_bonus_awards" as any)
      .select("id")
      .eq("employee_id", cfg.employeeId)
      .eq("reference_month", referenceMonth)
      .maybeSingle();
    if (existing) continue;

    const { error } = await supabase.from("goal_bonus_awards" as any).insert({
      user_id: userId,
      employee_id: cfg.employeeId,
      bonus_config_id: cfg.id,
      reference_month: referenceMonth,
      payroll_month: payrollMonth,
      score_obtained: score,
      min_score_required: cfg.minScore,
      bonus_amount: cfg.bonusAmount,
      status: "gerado",
    } as any);
    if (!error) created++;
  }
  return created;
}

/**
 * Roda o motor para os últimos N meses fechados (padrão 3), evitando reprocessar
 * meses já com award. Executa uma passagem única e idempotente.
 */
export async function generateBonusAwardsRecent(
  userId: string,
  bonuses: EmployeeGoalBonus[],
  getMonthlyScore: (monthKey: string) => number,
  monthsBack = 3,
): Promise<number> {
  const cur = currentMonthKey();
  const [cy, cm] = cur.split("-").map(Number);
  let total = 0;
  for (let i = 1; i <= monthsBack; i++) {
    const d = new Date(cy, cm - 1 - i, 1);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    total += await generateBonusAwardsForMonth({
      userId, referenceMonth: mk, bonuses, getMonthlyScore,
    });
  }
  return total;
}
