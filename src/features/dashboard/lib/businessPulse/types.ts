import type { Client, Loan, Payment, Expense, InstallmentSchedule } from "@/types/loan";
import type { RiskProfile } from "@/features/loans/lib/clientRisk";

export type PulseEventType = "positive" | "attention" | "critical" | "opportunity";

export interface PulsePrioritaryClient {
  clientId: string;
  clientName: string;
  overdueAmount: number;
  maxOverdueDays: number;
  overdueInstallmentsCount: number;
  score: number;
  riskLevel: string;
  badgeClassName: string;
  shareOfTotalOverduePct: number; // Ex: 34.5 (%)
}

export interface PulseConcentrationAnalysis {
  overdueClientsCount: number;
  prevOverdueClientsCount: number;
  totalOverdueAmount: number;
  prevTotalOverdueAmount: number;
  topClients: PulsePrioritaryClient[];
  topClientsCount: number;
  topClientsOverdueTotal: number;
  topClientsSharePct: number; // Ex: 64 (%)
  hasRelevantConcentration: boolean;
}

export interface PulsePeriodMetrics {
  revenue: number;              // Novos empréstimos e vendas
  received: number;             // Pagamentos recebidos
  expenses: number;             // Despesas pagas
  netResult: number;            // Recebimentos - Despesas
  overdueAmount: number;        // Total vencido no período
  defaultRatePct: number;       // Inadimplência (%)
  activeLoansCount: number;
  activeCapital: number;
}

export interface PulseComparisonMetrics {
  current: PulsePeriodMetrics;
  previous: PulsePeriodMetrics;
  differences: {
    revenueAbsolute: number;
    revenuePct: number;
    receivedAbsolute: number;
    receivedPct: number;
    expensesAbsolute: number;
    expensesPct: number;
    netResultAbsolute: number;
    netResultPct: number;
    defaultRatePp: number;      // Variação em pontos percentuais (p.p.)
    overdueAmountAbsolute: number;
    overdueAmountPct: number;
  };
  concentration: PulseConcentrationAnalysis;
  periodLabel: string;
  isSamePeriodComparison: boolean;
  hasSufficientData: boolean;
  isInitialHistory: boolean;
}

export interface PulseEventItem {
  id: string;
  type: PulseEventType;
  title: string;
  metric: string;
  description: string;
  badgeText?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

export interface PulseRecommendation {
  text: string;
  actionLabel?: string;
  actionType?: "view_overdue_clients" | "view_financial" | "view_ranking";
  targetClientNames?: string[];
  totalTargetAmount?: number;
}

export interface BusinessPulseAnalysis {
  generatedAt: string;
  hasSufficientData: boolean;
  isInitialHistory: boolean;
  headline: string;
  tone: PulseEventType;
  events: PulseEventItem[];
  recommendation: PulseRecommendation;
  metrics: PulseComparisonMetrics;
  prioritaryClients: PulsePrioritaryClient[];
}
