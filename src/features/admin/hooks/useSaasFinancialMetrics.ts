import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export type PeriodFilterKey = "today" | "7d" | "30d" | "this_month" | "last_month" | "last_12_months" | "custom";

export interface SaasFinancialSummary {
  gross_revenue: number;
  refunds_amount: number;
  net_revenue: number;
  paid_orders_count: number;
  average_ticket: number;
  pending_amount: number;
  pending_orders_count: number;
  current_month_gross: number;
  previous_month_gross: number;
  month_growth_pct: number;
  mrr: number;
  arpu: number;
  active_subscribers_count: number;
  active_trials_count: number;
}

export interface DailyEvolutionItem {
  date: string;
  gross: number;
  refunds: number;
  net: number;
  count: number;
}

export interface MonthlyEvolutionItem {
  month: string;
  label: string;
  gross: number;
  refunds: number;
  net: number;
  count: number;
}

export interface PlanDistributionItem {
  plan_id: string | null;
  plan_name: string;
  product_id: string;
  gross: number;
  count: number;
  percentage: number;
}

export interface CycleDistributionItem {
  cycle: string;
  cycle_label: string;
  gross: number;
  count: number;
  average_ticket: number;
  percentage: number;
}

export interface RecentTransactionItem {
  id: string;
  payment_id: string | null;
  customer_id: string | null;
  user_id: string;
  user_name: string;
  user_email: string | null;
  plan_name: string;
  cycle: string;
  amount: number;
  status: string;
  checkout_kind: string;
  credited_at: string | null;
  revoked_at: string | null;
  due_date: string | null;
  created_at: string;
  invoice_url: string | null;
}

export interface SaasFinancialData {
  environment: string;
  timezone: string;
  period: {
    start: string;
    end: string;
  };
  summary: SaasFinancialSummary;
  daily_evolution: DailyEvolutionItem[];
  monthly_evolution: MonthlyEvolutionItem[];
  plans_distribution: PlanDistributionItem[];
  cycles_distribution: CycleDistributionItem[];
  recent_transactions: RecentTransactionItem[];
}

export function useSaasFinancialMetrics() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  const [environment, setEnvironment] = useState<"live" | "sandbox">("live");
  const [periodKey, setPeriodKey] = useState<PeriodFilterKey>("this_month");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("all");
  const [selectedCycle, setSelectedCycle] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const [data, setData] = useState<SaasFinancialData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Calcula as datas ISO de início e fim com base no filtro
  const dateRange = useMemo(() => {
    const now = new Date();
    
    if (periodKey === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString() };
    }

    if (periodKey === "7d") {
      const start = new Date(now.getTime() - 7 * 86400000);
      return { start: start.toISOString(), end: now.toISOString() };
    }

    if (periodKey === "30d") {
      const start = new Date(now.getTime() - 30 * 86400000);
      return { start: start.toISOString(), end: now.toISOString() };
    }

    if (periodKey === "last_month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString() };
    }

    if (periodKey === "last_12_months") {
      const start = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0);
      return { start: start.toISOString(), end: now.toISOString() };
    }

    if (periodKey === "custom" && customStartDate && customEndDate) {
      const start = new Date(`${customStartDate}T00:00:00`);
      const end = new Date(`${customEndDate}T23:59:59.999`);
      return { start: start.toISOString(), end: end.toISOString() };
    }

    // Default: this_month
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return { start: start.toISOString(), end: now.toISOString() };
  }, [periodKey, customStartDate, customEndDate]);

  const fetchMetrics = useCallback(async () => {
    if (!isAdmin || !user?.id) {
      setLoading(false);
      setError("Acesso restrito a administradores.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: res, error: rpcError } = await (supabase.rpc as any)(
        "billing_get_saas_financial_metrics",
        {
          _admin: user.id,
          _env: environment,
          _start_date: dateRange.start,
          _end_date: dateRange.end,
          _plan_id: selectedPlanId !== "all" ? selectedPlanId : null,
          _cycle: selectedCycle !== "all" ? selectedCycle : null,
          _status: selectedStatus !== "all" ? selectedStatus : null,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message || "Falha ao carregar métricas financeiras.");
      }

      setData(res as SaasFinancialData);
    } catch (err: any) {
      setError(err?.message || "Erro inesperado ao consultar dados financeiros.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id, environment, dateRange, selectedPlanId, selectedCycle, selectedStatus]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return {
    data,
    loading,
    error,
    refetch: fetchMetrics,
    environment,
    setEnvironment,
    periodKey,
    setPeriodKey,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    selectedPlanId,
    setSelectedPlanId,
    selectedCycle,
    setSelectedCycle,
    selectedStatus,
    setSelectedStatus,
  };
}
