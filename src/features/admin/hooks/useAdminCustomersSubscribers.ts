import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type CustomerUnifiedStatus = "trial" | "active" | "past_due" | "expired" | "canceled";

export interface AdminCustomerItem {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  username: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  
  // Assinatura e Plano
  plan_id: string | null;
  plan_name: string;
  status: CustomerUnifiedStatus;
  status_label: string;
  
  // Datas
  period_start: string | null;
  period_end: string | null;
  trial_started_at: string | null;
  trial_days: number;
  days_remaining: number;
  is_trial: boolean;
  
  // Financeiro & Asaas
  plan_price: number;
  cycle: string;
  payment_method: string;
  last_payment_date: string | null;
  last_payment_amount: number | null;
  last_payment_status: string | null;
  
  // IDs Asaas
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  asaas_status: string | null;
  
  // Histórico de ordens
  orders: AdminCustomerOrder[];
}

export interface AdminCustomerOrder {
  id: string;
  payment_id: string | null;
  customer_id: string | null;
  plan_name: string;
  cycle: string;
  amount_cents: number;
  amount: number;
  status: "pending" | "paid" | "revoked";
  checkout_kind: string;
  credited_at: string | null;
  revoked_at: string | null;
  due_date: string | null;
  created_at: string;
  invoice_url: string | null;
}

export interface CustomerSummaryMetrics {
  totalCustomers: number;
  activeCount: number;
  activePct: number;
  trialCount: number;
  trialPct: number;
  pastDueCount: number;
  pastDuePct: number;
  expiredCount: number;
  expiredPct: number;
  canceledCount: number;
  canceledPct: number;
  
  // Indicadores de Conversão
  newCustomersThisMonth: number;
  trialsStartedThisMonth: number;
  convertedTrialsThisMonth: number;
  canceledThisMonth: number;
  conversionRatePct: number;
}

export function useAdminCustomersSubscribers() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  const [customers, setCustomers] = useState<AdminCustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [environment, setEnvironment] = useState<"live" | "sandbox">("live");

  const fetchData = useCallback(async () => {
    if (!isAdmin || !user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Consulta paralela das tabelas de auditoria
      const [
        ordersRes,
        subsRes,
        plansRes,
        profilesRes,
        contractsRes,
        asaasCustRes,
        userOwnersRes,
      ] = await Promise.all([
        supabase
          .from("billing_orders")
          .select("id, user_id, plan_id, product_id, cycle, amount_cents, checkout_kind, customer_id, payment_id, status, credited_at, revoked_at, due_date, created_at, invoice_url, environment")
          .eq("environment", environment)
          .order("created_at", { ascending: false }),
        supabase
          .from("subscriptions")
          .select("id, user_id, product_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, manual_override, asaas_subscription_id, environment")
          .eq("environment", environment),
        supabase
          .from("plans")
          .select("id, name, price, price_semestral, price_anual, discount_semestral, discount_anual, trial_days, active"),
        supabase
          .from("profiles")
          .select("user_id, display_name, username, trial_plan_name, trial_started_at, trial_days_override, created_at"),
        supabase
          .from("billing_contracts")
          .select("order_id, subscription_id, environment")
          .eq("environment", environment),
        supabase
          .from("asaas_customers" as any)
          .select("user_id, customer_id"),
        supabase
          .from("user_owner")
          .select("user_id, owner_id"),
      ]);

      const allOrders = (ordersRes.data || []) as any[];
      const allSubs = (subsRes.data || []) as any[];
      const allPlans = (plansRes.data || []) as any[];
      const allProfiles = (profilesRes.data || []) as any[];
      const allContracts = (contractsRes.data || []) as any[];
      const allAsaasCust = (asaasCustRes.data || []) as any[];
      const ownedUserIds = new Set((userOwnersRes.data || []).map((o: any) => o.user_id));

      // Mapeamentos rápidos
      const planMap = new Map(allPlans.map((p) => [p.id, p]));
      const asaasCustMap = new Map(allAsaasCust.map((c) => [c.user_id, c.customer_id]));
      const contractSubIdByOrder = new Map(allContracts.map((c) => [c.order_id, c.subscription_id]));

      const planNameResolver = (planId?: string, productId?: string, trialPlanName?: string | null): string => {
        if (planId && planMap.has(planId)) return planMap.get(planId)?.name;
        if (trialPlanName) return trialPlanName;
        if (productId === "basico_plan" || productId === "basico") return "Básico";
        if (productId === "profissional_plan" || productId === "profissional") return "Profissional";
        if (productId === "empresarial_plan" || productId === "empresarial") return "Empresarial";
        if (productId === "teste_gratis_plan" || productId === "teste" || productId === "free_plan") return "Teste Grátis";
        return "Plano Personalizado";
      };

      // Mapeia ordens por usuário
      const ordersByUserId = new Map<string, AdminCustomerOrder[]>();
      allOrders.forEach((o) => {
        const list = ordersByUserId.get(o.user_id) || [];
        const planName = planNameResolver(o.plan_id, o.product_id);
        list.push({
          id: o.id,
          payment_id: o.payment_id || null,
          customer_id: o.customer_id || null,
          plan_name: planName,
          cycle: o.cycle || "monthly",
          amount_cents: Number(o.amount_cents || 0),
          amount: Number(o.amount_cents || 0) / 100,
          status: o.status,
          checkout_kind: o.checkout_kind || "pix",
          credited_at: o.credited_at,
          revoked_at: o.revoked_at,
          due_date: o.due_date,
          created_at: o.created_at,
          invoice_url: o.invoice_url || null,
        });
        ordersByUserId.set(o.user_id, list);
      });

      // Mapeia assinaturas por usuário
      const subByUserId = new Map<string, any>();
      allSubs.forEach((s) => {
        subByUserId.set(s.user_id, s);
      });

      // Lista única de usuários clientes (excluindo sub-usuários de equipes)
      const userIdsSet = new Set<string>();
      allProfiles.forEach((p) => {
        if (!ownedUserIds.has(p.user_id)) {
          userIdsSet.add(p.user_id);
        }
      });
      allOrders.forEach((o) => {
        if (!ownedUserIds.has(o.user_id)) {
          userIdsSet.add(o.user_id);
        }
      });
      allSubs.forEach((s) => {
        if (!ownedUserIds.has(s.user_id)) {
          userIdsSet.add(s.user_id);
        }
      });

      const nowTime = Date.now();
      const list: AdminCustomerItem[] = [];

      userIdsSet.forEach((uid) => {
        const profile = allProfiles.find((p) => p.user_id === uid);
        const sub = subByUserId.get(uid);
        const userOrders = ordersByUserId.get(uid) || [];
        const latestOrder = userOrders[0];
        const latestPaidOrder = userOrders.find((o) => o.status === "paid");
        const pendingOrder = userOrders.find((o) => o.status === "pending");

        const asaasCustId = asaasCustMap.get(uid) || latestOrder?.customer_id || null;
        let asaasSubId = sub?.asaas_subscription_id || null;
        if (!asaasSubId && latestOrder) {
          asaasSubId = contractSubIdByOrder.get(latestOrder.id) || null;
        }

        // Determinação do Plano
        const planId = sub?.plan_id || latestPaidOrder ? allOrders.find((o) => o.id === latestPaidOrder?.id)?.plan_id : null;
        const planObj = planId ? planMap.get(planId) : null;
        const planName = planNameResolver(planId, sub?.product_id, profile?.trial_plan_name);

        // Preço do Plano
        const planPrice = planObj
          ? Number(planObj.price || 0)
          : latestPaidOrder
            ? latestPaidOrder.amount
            : 0;

        // Datas de Vigência / Trial
        const trialStart = profile?.trial_started_at || null;
        const trialDays = profile?.trial_days_override ?? planObj?.trial_days ?? 7;
        const trialEndTime = trialStart ? new Date(trialStart).getTime() + trialDays * 86400000 : null;
        const trialEndISO = trialEndTime ? new Date(trialEndTime).toISOString() : null;

        const subEndISO = sub?.current_period_end || latestPaidOrder?.due_date || null;
        const subEndTime = subEndISO ? new Date(subEndISO).getTime() : null;

        // Determinação Unificada do Status
        let unifiedStatus: CustomerUnifiedStatus = "expired";
        let statusLabel = "Expirado";
        let daysRemaining = 0;
        let isTrial = false;
        let periodStart: string | null = sub?.current_period_start || latestPaidOrder?.credited_at || null;
        let periodEnd: string | null = subEndISO;

        const hasActivePaidSub = sub && (sub.status === "active" || sub.manual_override === true) && (subEndTime === null || subEndTime > nowTime);
        const hasRecentPaidOrder = latestPaidOrder && (!latestPaidOrder.due_date || new Date(latestPaidOrder.due_date).getTime() > nowTime);

        if (hasActivePaidSub || hasRecentPaidOrder) {
          unifiedStatus = "active";
          statusLabel = "Ativo";
          if (subEndTime) {
            daysRemaining = Math.max(0, Math.ceil((subEndTime - nowTime) / 86400000));
          } else {
            daysRemaining = 30;
          }
        } else if (sub?.status === "canceled" || latestOrder?.status === "revoked") {
          unifiedStatus = "canceled";
          statusLabel = "Cancelado";
          daysRemaining = 0;
        } else if (sub?.status === "past_due" || sub?.status === "unpaid" || (pendingOrder && pendingOrder.due_date && new Date(pendingOrder.due_date).getTime() < nowTime)) {
          unifiedStatus = "past_due";
          statusLabel = "Inadimplente";
          daysRemaining = 0;
        } else if (trialStart && trialEndTime && trialEndTime > nowTime && !latestPaidOrder) {
          unifiedStatus = "trial";
          statusLabel = "Em teste";
          isTrial = true;
          periodStart = trialStart;
          periodEnd = trialEndISO;
          daysRemaining = Math.max(0, Math.ceil((trialEndTime - nowTime) / 86400000));
        } else {
          unifiedStatus = "expired";
          statusLabel = "Expirado";
          daysRemaining = 0;
          if (!periodEnd && trialEndISO) {
            periodEnd = trialEndISO;
          }
        }

        // Forma de Pagamento
        let paymentMethod = "—";
        if (latestPaidOrder) {
          paymentMethod = latestPaidOrder.checkout_kind === "credit_card" ? "Cartão de Crédito" : "Pix";
        } else if (isTrial) {
          paymentMethod = "Gratuito (Trial)";
        }

        list.push({
          id: uid,
          user_id: uid,
          display_name: profile?.display_name || profile?.username || `Usuário ${uid.slice(0, 6)}`,
          email: profile?.username?.includes("@") ? profile.username : (latestOrder?.customer_id ? `Cliente ${latestOrder.customer_id}` : ""),
          username: profile?.username || null,
          created_at: profile?.created_at || latestOrder?.created_at || new Date().toISOString(),
          last_sign_in_at: null,
          
          plan_id: planId || null,
          plan_name: isTrial ? `Teste (${planName})` : planName,
          status: unifiedStatus,
          status_label: statusLabel,
          
          period_start: periodStart,
          period_end: periodEnd,
          trial_started_at: trialStart,
          trial_days: trialDays,
          days_remaining: daysRemaining,
          is_trial: isTrial,
          
          plan_price: planPrice,
          cycle: latestOrder?.cycle || "monthly",
          payment_method: paymentMethod,
          last_payment_date: latestPaidOrder?.credited_at || latestPaidOrder?.created_at || null,
          last_payment_amount: latestPaidOrder?.amount || null,
          last_payment_status: latestOrder?.status || null,
          
          asaas_customer_id: asaasCustId,
          asaas_subscription_id: asaasSubId,
          asaas_status: sub?.status || (hasActivePaidSub ? "ACTIVE" : null),
          
          orders: userOrders,
        });
      });

      // Ordenar por data de cadastro decrescente
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setCustomers(list);
    } catch (err: any) {
      console.error("[useAdminCustomersSubscribers] Erro ao carregar dados:", err);
      setError(err?.message || "Erro ao carregar clientes e assinaturas.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id, environment]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sincronização / Conciliação Segura com Asaas
  const syncWithAsaas = async () => {
    setReconciling(true);
    toast.info("Iniciando sincronização e conciliação com o Asaas...");
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke("asaas-reconcile", {
        method: "POST",
      });
      if (fnError) {
        throw new Error(fnError.message || "Erro ao executar rotina de reconciliação.");
      }
      toast.success("Sincronização com o Asaas concluída com sucesso!");
      await fetchData();
    } catch (e: any) {
      console.error("[syncWithAsaas] Erro:", e);
      toast.error("Erro na conciliação", { description: e?.message || "Tente novamente." });
    } finally {
      setReconciling(false);
    }
  };

  // Métricas do Topo e Conversão
  const metrics = useMemo<CustomerSummaryMetrics>(() => {
    const total = customers.length;
    let active = 0;
    let trial = 0;
    let pastDue = 0;
    let expired = 0;
    let canceled = 0;

    const now = new Date();
    const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let newCustMonth = 0;
    let trialsMonth = 0;
    let convertedMonth = 0;
    let canceledMonth = 0;

    customers.forEach((c) => {
      if (c.status === "active") active++;
      else if (c.status === "trial") trial++;
      else if (c.status === "past_due") pastDue++;
      else if (c.status === "expired") expired++;
      else if (c.status === "canceled") canceled++;

      const createdAtTime = new Date(c.created_at).getTime();
      if (createdAtTime >= curMonthStart) {
        newCustMonth++;
      }

      if (c.trial_started_at && new Date(c.trial_started_at).getTime() >= curMonthStart) {
        trialsMonth++;
      }

      // Conversão Trial -> Pago no mês
      if (c.trial_started_at && c.last_payment_date && new Date(c.last_payment_date).getTime() >= curMonthStart) {
        convertedMonth++;
      }

      if (c.status === "canceled" && c.orders.some((o) => o.revoked_at && new Date(o.revoked_at).getTime() >= curMonthStart)) {
        canceledMonth++;
      }
    });

    const calcPct = (count: number) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);

    // Taxa de conversão: convertidos no mês ÷ trials iniciados no mês (ou base histórica proporcional)
    const baseTrials = trialsMonth > 0 ? trialsMonth : trial + convertedMonth;
    const conversionRatePct = baseTrials > 0 ? Math.min(100, Math.round((convertedMonth / baseTrials) * 1000) / 10) : 0;

    return {
      totalCustomers: total,
      activeCount: active,
      activePct: calcPct(active),
      trialCount: trial,
      trialPct: calcPct(trial),
      pastDueCount: pastDue,
      pastDuePct: calcPct(pastDue),
      expiredCount: expired,
      expiredPct: calcPct(expired),
      canceledCount: canceled,
      canceledPct: calcPct(canceled),

      newCustomersThisMonth: newCustMonth,
      trialsStartedThisMonth: trialsMonth,
      convertedTrialsThisMonth: convertedMonth,
      canceledThisMonth: canceledMonth,
      conversionRatePct,
    };
  }, [customers]);

  // Lista Filtrada
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // 1. Busca textual
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = c.display_name.toLowerCase().includes(term);
        const matchEmail = c.email.toLowerCase().includes(term);
        const matchId = c.user_id.toLowerCase().includes(term) || (c.asaas_customer_id && c.asaas_customer_id.toLowerCase().includes(term));
        const matchPlan = c.plan_name.toLowerCase().includes(term);
        if (!matchName && !matchEmail && !matchId && !matchPlan) return false;
      }

      // 2. Filtro de Status
      if (statusFilter !== "all") {
        if (statusFilter === "active" && c.status !== "active") return false;
        if (statusFilter === "trial" && c.status !== "trial") return false;
        if (statusFilter === "past_due" && c.status !== "past_due") return false;
        if (statusFilter === "expired" && c.status !== "expired") return false;
        if (statusFilter === "canceled" && c.status !== "canceled") return false;
      }

      // 3. Filtro de Plano
      if (planFilter !== "all") {
        if (c.plan_id !== planFilter && !c.plan_name.toLowerCase().includes(planFilter.toLowerCase())) {
          return false;
        }
      }

      // 4. Filtro de Forma de Pagamento
      if (paymentMethodFilter !== "all") {
        if (paymentMethodFilter === "pix" && !c.payment_method.toLowerCase().includes("pix")) return false;
        if (paymentMethodFilter === "credit_card" && !c.payment_method.toLowerCase().includes("cartão")) return false;
        if (paymentMethodFilter === "trial" && !c.is_trial) return false;
      }

      return true;
    });
  }, [customers, searchTerm, statusFilter, planFilter, paymentMethodFilter]);

  // Planos disponíveis na base
  const availablePlans = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.plan_name) set.add(c.plan_name);
    });
    return Array.from(set);
  }, [customers]);

  return {
    customers: filteredCustomers,
    rawCustomers: customers,
    summaryMetrics: metrics,
    metrics,
    availablePlans,
    loading,
    reconciling,
    error,
    refetch: fetchData,
    syncWithAsaas,
    environment,
    setEnvironment,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    planFilter,
    setPlanFilter,
    paymentMethodFilter,
    setPaymentMethodFilter,
  };
}
