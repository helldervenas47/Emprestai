import type { GoalType } from "@/features/piggyBanks/hooks/useMonthlyGoals";

export type GoalStatus = "reached" | "close" | "missed";

export interface MonthlyClosingOverdueItem {
  loanId: string;
  loanNumber?: number | string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientPhotoUrl?: string;
  principalAmount: number;
  totalWithInterest: number;
  totalAmount: number;
  remainingAmount: number;
  installmentAmount: number;
  overdueAmount: number;
  overdueInstallmentsCount: number;
  totalInstallments: number;
  paidInstallments: number;
  currentInstallmentNumber: number;
  firstOverdueDate: string;
  daysLate: number;
  overdueInstallmentNumbers: number[];
  tags?: string[];
  lateFees?: number;
  lateInterestTotal?: number;
  penaltyTotal?: number;
}

export interface MonthlyClosingFinancialSummary {
  revenue: number; // Volume de novos empréstimos com juros
  received: number; // Total de pagamentos recebidos no mês
  expenses: number; // Despesas pagas da empresa no mês
  result: number; // Resultado financeiro (recebimentos - despesas)
  activeCapital: number; // Capital ativo no fechamento
  defaultRate: number; // % de inadimplência no mês
  overdueAmount: number; // R$ em atraso no mês
  newLoansCount: number; // Quantidade de novos contratos
  completedLoansCount: number; // Quantidade de contratos quitados
  overdueLoansCount: number; // Quantidade de contratos em atraso
  newClientsCount: number; // Quantidade de novos clientes
  activeClientsCount: number; // Clientes com contratos ativos
  overdueLoansList?: MonthlyClosingOverdueItem[];
}

export interface MetricComparisonItem {
  current: number;
  previous: number;
  absoluteDiff: number;
  pctDiff: number; // Percentual de variação (ex: +12% ou -4%)
  ppDiff?: number; // Para taxas (pontos percentuais, ex: +1.8 p.p.)
  isPositiveEvolution: boolean; // Se a evolução foi favorável para o negócio
}

export interface MonthlyClosingComparison {
  revenue: MetricComparisonItem;
  received: MetricComparisonItem;
  expenses: MetricComparisonItem;
  result: MetricComparisonItem;
  activeCapital: MetricComparisonItem;
  defaultRate: MetricComparisonItem;
  newLoansCount: MetricComparisonItem;
  newClientsCount: MetricComparisonItem;
}

export interface MonthlyClosingGoalItem {
  id?: string;
  goalType: GoalType;
  label: string;
  unit: "%" | "R$" | "qtd";
  isInverse: boolean; // Se menor é melhor (ex: inadimplência)
  targetValue: number;
  actualValue: number;
  achievementPct: number; // % de atingimento
  status: GoalStatus;
  diffValue: number; // Diferença entre realizado e meta
  formattedTarget: string;
  formattedActual: string;
  formattedDiff: string;
  notes?: string | null;
}

export interface MonthlyClosingGoalSummary {
  totalGoals: number;
  reachedCount: number;
  closeCount: number;
  missedCount: number;
  overallAchievementPct: number;
  hasGoals: boolean;
}

export interface MonthlyClosingHighlight {
  id: string;
  type: "positive" | "attention";
  title: string;
  description: string;
  badgeText?: string;
  iconName?: string;
}

export interface MonthlyClosingDirectAction {
  label: string;
  targetTab: string;
  description?: string;
}

export interface MonthlyClosingExecutiveAnalysis {
  headline: string;
  narrative: string;
  positiveHighlights: MonthlyClosingHighlight[];
  attentionPoints: MonthlyClosingHighlight[];
  recommendation: {
    title: string;
    text: string;
    action?: MonthlyClosingDirectAction;
  };
}

export interface MonthlyClosingData {
  monthKey: string; // YYYY-MM
  monthLabel: string; // Ex: "Agosto de 2026"
  previousMonthKey: string;
  previousMonthLabel: string;
  isClosedMonth: boolean;
  isCurrentMonth: boolean;
  hasSufficientData: boolean;
  financial: MonthlyClosingFinancialSummary;
  comparison: MonthlyClosingComparison;
  goalsSummary: MonthlyClosingGoalSummary;
  goals: MonthlyClosingGoalItem[];
  executiveAnalysis: MonthlyClosingExecutiveAnalysis;
  lastUpdatedAt: string;
}
