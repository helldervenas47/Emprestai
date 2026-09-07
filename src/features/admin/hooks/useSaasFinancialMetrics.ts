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

    // 1. Tenta chamar a RPC nativa do banco
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

      if (!rpcError && res && res.summary) {
        setData(res as SaasFinancialData);
        setLoading(false);
        return;
      }
    } catch {
      // Falha silenciosa na RPC para cair no fallback seguro
    }

    // 2. Fallback Seguro: Agregação direta no client com queries autorizadas
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      // Início e fim do mês atual e anterior
      const curMonthStart = new Date(currentYear, currentMonth, 1, 0, 0, 0);
      const curMonthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
      const prevMonthStart = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0);
      const prevMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

      const filterStart = new Date(dateRange.start);
      const filterEnd = new Date(dateRange.end);

      // Consulta paralela das tabelas de billing e perfis
      const [ordersRes, subsRes, plansRes, profilesRes] = await Promise.all([
        supabase
          .from("billing_orders")
          .select("id, user_id, plan_id, product_id, cycle, amount_cents, checkout_kind, customer_id, payment_id, status, credited_at, revoked_at, due_date, created_at, invoice_url, environment")
          .eq("environment", environment)
          .order("created_at", { ascending: false }),
        supabase
          .from("subscriptions")
          .select("id, user_id, product_id, plan_id, status, current_period_end, environment")
          .eq("environment", environment)
          .eq("status", "active"),
        supabase
          .from("plans")
          .select("id, name, price"),
        supabase
          .from("profiles")
          .select("user_id, display_name, trial_started_at"),
      ]);

      const allOrders = ordersRes.data || [];
      const activeSubs = subsRes.data || [];
      const plansList = plansRes.data || [];
      const profilesList = profilesRes.data || [];

      // Mapeamento de perfis e planos por ID
      const profileMap = new Map(profilesList.map((p: any) => [p.user_id, p]));
      const planMap = new Map(plansList.map((p: any) => [p.id, p]));

      const planNameResolver = (planId?: string, productId?: string) => {
        if (planId && planMap.has(planId)) return planMap.get(planId)?.name;
        if (productId === "basico_plan" || productId === "basico") return "Básico";
        if (productId === "profissional_plan" || productId === "profissional") return "Profissional";
        if (productId === "empresarial_plan" || productId === "empresarial") return "Empresarial";
        if (productId === "teste_gratis_plan" || productId === "teste") return "Teste Grátis";
        return productId || "Plano";
      };

      // Faturamento Mês Atual (Bruto)
      const currentMonthGross = allOrders
        .filter((o) => {
          if (o.status !== "paid" || !o.credited_at) return false;
          const cred = new Date(o.credited_at);
          return cred >= curMonthStart && cred <= curMonthEnd;
        })
        .reduce((sum, o) => sum + Number(o.amount_cents || 0) / 100, 0);

      // Faturamento Mês Anterior (Bruto)
      const previousMonthGross = allOrders
        .filter((o) => {
          if (o.status !== "paid" || !o.credited_at) return false;
          const cred = new Date(o.credited_at);
          return cred >= prevMonthStart && cred <= prevMonthEnd;
        })
        .reduce((sum, o) => sum + Number(o.amount_cents || 0) / 100, 0);

      const monthGrowthPct = previousMonthGross > 0
        ? Math.round(((currentMonthGross - previousMonthGross) / previousMonthGross) * 1000) / 10
        : currentMonthGross > 0 ? 100 : 0;

      // Filtragem das ordens do período selecionado
      const periodOrders = allOrders.filter((o) => {
        if (selectedPlanId !== "all" && o.plan_id !== selectedPlanId) return false;
        if (selectedCycle !== "all" && o.cycle !== selectedCycle) return false;
        if (selectedStatus !== "all" && o.status !== selectedStatus) return false;

        const dateToCheck = o.status === "paid" && o.credited_at
          ? new Date(o.credited_at)
          : o.revoked_at
            ? new Date(o.revoked_at)
            : new Date(o.created_at);

        return dateToCheck >= filterStart && dateToCheck <= filterEnd;
      });

      // Cálculos do período
      let grossPeriod = 0;
      let refundsPeriod = 0;
      let paidCount = 0;

      periodOrders.forEach((o) => {
        const val = Number(o.amount_cents || 0) / 100;
        if (o.status === "paid") {
          grossPeriod += val;
          paidCount += 1;
        } else if (o.status === "revoked" || o.status === "refunded") {
          refundsPeriod += val;
        }
      });

      const netPeriod = grossPeriod - refundsPeriod;
      const averageTicket = paidCount > 0 ? Math.round((grossPeriod / paidCount) * 100) / 100 : 0;

      // Pendentes
      const pendingOrders = allOrders.filter((o) => {
        if (o.status !== "pending") return false;
        if (selectedPlanId !== "all" && o.plan_id !== selectedPlanId) return false;
        if (selectedCycle !== "all" && o.cycle !== selectedCycle) return false;
        return true;
      });
      const pendingAmount = pendingOrders.reduce((s, o) => s + Number(o.amount_cents || 0) / 100, 0);
      const pendingCount = pendingOrders.length;

      // MRR Normalizado
      const activeSubsCount = activeSubs.length;
      let mrrTotal = 0;

      activeSubs.forEach((sub: any) => {
        const userOrder = allOrders.find((o) => o.user_id === sub.user_id && o.status === "paid");
        if (userOrder) {
          const val = Number(userOrder.amount_cents || 0) / 100;
          if (userOrder.cycle === "annual") mrrTotal += val / 12;
          else if (userOrder.cycle === "semestral") mrrTotal += val / 6;
          else mrrTotal += val;
        }
      });

      const arpu = activeSubsCount > 0 ? Math.round((mrrTotal / activeSubsCount) * 100) / 100 : 0;

      // Trials Ativos
      const activeTrialsCount = profilesList.filter((p: any) => {
        if (!p.trial_started_at) return false;
        const start = new Date(p.trial_started_at).getTime();
        const hasSub = activeSubs.some((s: any) => s.user_id === p.user_id);
        return Date.now() - start < 7 * 86400000 && !hasSub;
      }).length;

      // 3. Evolução Diária
      const dailyMap = new Map<string, { date: string; gross: number; refunds: number; net: number; count: number }>();
      periodOrders.forEach((o) => {
        if (!o.credited_at && !o.created_at) return;
        const d = new Date(o.credited_at || o.created_at);
        const key = d.toISOString().split("T")[0];
        const val = Number(o.amount_cents || 0) / 100;

        if (!dailyMap.has(key)) {
          dailyMap.set(key, { date: key, gross: 0, refunds: 0, net: 0, count: 0 });
        }
        const item = dailyMap.get(key)!;
        if (o.status === "paid") {
          item.gross += val;
          item.net += val;
          item.count += 1;
        } else if (o.status === "revoked" || o.status === "refunded") {
          item.refunds += val;
          item.net -= val;
        }
      });

      const dailyEvolution = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

      // 4. Evolução Mensal (Últimos 12 meses)
      const monthlyMap = new Map<string, { month: string; label: string; gross: number; refunds: number; net: number; count: number }>();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        monthlyMap.set(key, { month: key, label, gross: 0, refunds: 0, net: 0, count: 0 });
      }

      allOrders.forEach((o) => {
        if (o.status !== "paid" || !o.credited_at) return;
        const d = new Date(o.credited_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (monthlyMap.has(key)) {
          const item = monthlyMap.get(key)!;
          const val = Number(o.amount_cents || 0) / 100;
          item.gross += val;
          item.net += val;
          item.count += 1;
        }
      });

      const monthlyEvolution = Array.from(monthlyMap.values());

      // 5. Distribuição por Plano
      const planDistMap = new Map<string, { plan_id: string | null; plan_name: string; product_id: string; gross: number; count: number; percentage: number }>();
      periodOrders.forEach((o) => {
        if (o.status !== "paid") return;
        const key = o.product_id || o.plan_id || "outros";
        const val = Number(o.amount_cents || 0) / 100;
        const name = planNameResolver(o.plan_id, o.product_id);

        if (!planDistMap.has(key)) {
          planDistMap.set(key, { plan_id: o.plan_id || null, plan_name: name, product_id: o.product_id || key, gross: 0, count: 0, percentage: 0 });
        }
        const item = planDistMap.get(key)!;
        item.gross += val;
        item.count += 1;
      });

      const plansDistribution = Array.from(planDistMap.values()).map((p) => ({
        ...p,
        gross: Math.round(p.gross * 100) / 100,
        percentage: grossPeriod > 0 ? Math.round((p.gross / grossPeriod) * 1000) / 10 : 0,
      })).sort((a, b) => b.gross - a.gross);

      // 6. Distribuição por Ciclo
      const cycleDistMap = new Map<string, { cycle: string; cycle_label: string; gross: number; count: number; average_ticket: number; percentage: number }>();
      periodOrders.forEach((o) => {
        if (o.status !== "paid") return;
        const key = o.cycle || "monthly";
        const val = Number(o.amount_cents || 0) / 100;
        const label = key === "annual" ? "Anual" : key === "semestral" ? "Semestral" : "Mensal";

        if (!cycleDistMap.has(key)) {
          cycleDistMap.set(key, { cycle: key, cycle_label: label, gross: 0, count: 0, average_ticket: 0, percentage: 0 });
        }
        const item = cycleDistMap.get(key)!;
        item.gross += val;
        item.count += 1;
      });

      const cyclesDistribution = Array.from(cycleDistMap.values()).map((c) => ({
        ...c,
        gross: Math.round(c.gross * 100) / 100,
        average_ticket: c.count > 0 ? Math.round((c.gross / c.count) * 100) / 100 : 0,
        percentage: grossPeriod > 0 ? Math.round((c.gross / grossPeriod) * 1000) / 10 : 0,
      })).sort((a, b) => b.gross - a.gross);

      // 7. Transações Recentes
      const recentTransactions: RecentTransactionItem[] = periodOrders.map((o) => {
        const prof = profileMap.get(o.user_id);
        const planName = planNameResolver(o.plan_id, o.product_id);
        return {
          id: o.id,
          payment_id: o.payment_id,
          customer_id: o.customer_id,
          user_id: o.user_id,
          user_name: prof?.display_name || `Usuário ${String(o.user_id).slice(0, 8)}`,
          user_email: null,
          plan_name: planName,
          cycle: o.cycle || "monthly",
          amount: Number(o.amount_cents || 0) / 100,
          status: o.status,
          checkout_kind: o.checkout_kind || "pix",
          credited_at: o.credited_at,
          revoked_at: o.revoked_at,
          due_date: o.due_date,
          created_at: o.created_at,
          invoice_url: o.invoice_url,
        };
      });

      setData({
        environment,
        timezone: "America/Sao_Paulo",
        period: { start: dateRange.start, end: dateRange.end },
        summary: {
          gross_revenue: Math.round(grossPeriod * 100) / 100,
          refunds_amount: Math.round(refundsPeriod * 100) / 100,
          net_revenue: Math.round(netPeriod * 100) / 100,
          paid_orders_count: paidCount,
          average_ticket: averageTicket,
          pending_amount: Math.round(pendingAmount * 100) / 100,
          pending_orders_count: pendingCount,
          current_month_gross: Math.round(currentMonthGross * 100) / 100,
          previous_month_gross: Math.round(previousMonthGross * 100) / 100,
          month_growth_pct: monthGrowthPct,
          mrr: Math.round(mrrTotal * 100) / 100,
          arpu: arpu,
          active_subscribers_count: activeSubsCount,
          active_trials_count: activeTrialsCount,
        },
        daily_evolution: dailyEvolution,
        monthly_evolution: monthlyEvolution,
        plans_distribution: plansDistribution,
        cycles_distribution: cyclesDistribution,
        recent_transactions: recentTransactions,
      });
    } catch (err: any) {
      setError(err?.message || "Erro ao consultar dados financeiros do SaaS.");
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
