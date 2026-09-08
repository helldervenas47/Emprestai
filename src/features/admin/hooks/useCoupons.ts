import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";

export interface CouponRecord {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  is_active: boolean;
  applies_to_all_plans: boolean;
  max_uses: number | null;
  used_count: number;
  created_at: string;
  updated_at: string;
  plan_ids: string[];
}

export interface CouponUsageRecord {
  id: string;
  coupon_id: string;
  user_id: string;
  plan_id: string;
  cycle: string;
  original_amount_cents: number;
  discount_amount_cents: number;
  final_amount_cents: number;
  created_at: string;
}

export interface CouponMetrics {
  totalCoupons: number;
  activeCoupons: number;
  totalUsages: number;
  totalDiscountGivenCents: number;
}

export interface CreateCouponInput {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  is_active?: boolean;
  applies_to_all_plans?: boolean;
  plan_ids?: string[];
  max_uses?: number | null;
}

export interface UpdateCouponInput {
  code?: string;
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  is_active?: boolean;
  applies_to_all_plans?: boolean;
  plan_ids?: string[];
  max_uses?: number | null;
}

export function useCoupons() {
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [usages, setUsages] = useState<CouponUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Buscar todos os cupons
      const { data: couponsData, error: couponsError } = await supabase
        .from("coupons" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (couponsError) {
        if (couponsError.code !== "42P01") {
          console.error("[useCoupons] Erro ao carregar cupons:", couponsError);
        }
        setCoupons([]);
        setLoading(false);
        return;
      }

      // 2. Buscar vínculos com planos
      const { data: plansRelData } = await supabase
        .from("coupon_plans" as any)
        .select("coupon_id, plan_id");

      const planMap = new Map<string, string[]>();
      (plansRelData || []).forEach((rel: any) => {
        const list = planMap.get(rel.coupon_id) || [];
        list.push(rel.plan_id);
        planMap.set(rel.coupon_id, list);
      });

      const enrichedCoupons: CouponRecord[] = (couponsData || []).map((c: any) => ({
        ...c,
        discount_value: Number(c.discount_value),
        used_count: Number(c.used_count || 0),
        plan_ids: planMap.get(c.id) || [],
      }));

      // 3. Buscar histórico de usos
      const { data: usagesData } = await supabase
        .from("coupon_usages" as any)
        .select("*")
        .order("created_at", { ascending: false });

      setCoupons(enrichedCoupons);
      setUsages((usagesData as unknown as CouponUsageRecord[]) || []);
    } catch (err) {
      console.warn("[useCoupons] Exceção ao buscar cupons:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const createCoupon = async (input: CreateCouponInput): Promise<boolean> => {
    const cleanCode = input.code.trim().toUpperCase().replace(/\s+/g, "");
    if (!cleanCode) {
      toast.error("O código do cupom não pode estar vazio.");
      return false;
    }

    if (input.discount_value <= 0) {
      toast.error("O valor do desconto deve ser maior que zero.");
      return false;
    }

    if (input.discount_type === "percentage" && input.discount_value > 100) {
      toast.error("O desconto percentual não pode ser maior que 100%.");
      return false;
    }

    try {
      const { data, error } = await supabase
        .from("coupons" as any)
        .insert({
          code: cleanCode,
          discount_type: input.discount_type,
          discount_value: input.discount_value,
          is_active: input.is_active ?? true,
          applies_to_all_plans: input.applies_to_all_plans ?? false,
          max_uses: input.max_uses ?? null,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        if (error.code === "23505") {
          toast.error(`O cupom "${cleanCode}" já existe.`);
        } else {
          toast.error("Erro ao criar cupom", { description: error.message });
        }
        return false;
      }

      // Se não for para todos os planos, insere os vínculos
      if (!input.applies_to_all_plans && input.plan_ids && input.plan_ids.length > 0 && data?.id) {
        const rels = input.plan_ids.map((planId) => ({
          coupon_id: data.id,
          plan_id: planId,
        }));
        await supabase.from("coupon_plans" as any).insert(rels);
      }

      toast.success(`Cupom ${cleanCode} criado com sucesso!`);
      await fetchCoupons();
      return true;
    } catch (e: any) {
      toast.error("Erro ao criar cupom", { description: e?.message || "Tente novamente." });
      return false;
    }
  };

  const updateCoupon = async (id: string, input: UpdateCouponInput): Promise<boolean> => {
    try {
      const updatePayload: any = { updated_at: new Date().toISOString() };
      if (input.code !== undefined) {
        const cleanCode = input.code.trim().toUpperCase().replace(/\s+/g, "");
        if (!cleanCode) {
          toast.error("O código do cupom não pode estar vazio.");
          return false;
        }
        updatePayload.code = cleanCode;
      }
      if (input.discount_type !== undefined) updatePayload.discount_type = input.discount_type;
      if (input.discount_value !== undefined) {
        if (input.discount_value <= 0) {
          toast.error("O valor do desconto deve ser maior que zero.");
          return false;
        }
        if (input.discount_type === "percentage" && input.discount_value > 100) {
          toast.error("O desconto percentual não pode ser maior que 100%.");
          return false;
        }
        updatePayload.discount_value = input.discount_value;
      }
      if (input.is_active !== undefined) updatePayload.is_active = input.is_active;
      if (input.applies_to_all_plans !== undefined) updatePayload.applies_to_all_plans = input.applies_to_all_plans;
      if (input.max_uses !== undefined) updatePayload.max_uses = input.max_uses;

      const { error } = await supabase
        .from("coupons" as any)
        .update(updatePayload)
        .eq("id", id);

      if (error) {
        if (error.code === "23505") {
          toast.error(`Já existe outro cupom com este código.`);
        } else {
          toast.error("Erro ao atualizar cupom", { description: error.message });
        }
        return false;
      }

      // Atualiza vínculos de planos se fornecido
      if (input.plan_ids !== undefined) {
        await supabase.from("coupon_plans" as any).delete().eq("coupon_id", id);
        if (!input.applies_to_all_plans && input.plan_ids.length > 0) {
          const rels = input.plan_ids.map((planId) => ({
            coupon_id: id,
            plan_id: planId,
          }));
          await supabase.from("coupon_plans" as any).insert(rels);
        }
      }

      toast.success("Cupom atualizado com sucesso!");
      await fetchCoupons();
      return true;
    } catch (e: any) {
      toast.error("Erro ao atualizar cupom", { description: e?.message || "Tente novamente." });
      return false;
    }
  };

  const toggleStatus = async (coupon: CouponRecord): Promise<boolean> => {
    const nextStatus = !coupon.is_active;
    return updateCoupon(coupon.id, { is_active: nextStatus });
  };

  const metrics: CouponMetrics = {
    totalCoupons: coupons.length,
    activeCoupons: coupons.filter((c) => c.is_active).length,
    totalUsages: usages.length,
    totalDiscountGivenCents: usages.reduce((acc, u) => acc + (u.discount_amount_cents || 0), 0),
  };

  return {
    coupons,
    usages,
    metrics,
    loading,
    refetch: fetchCoupons,
    createCoupon,
    updateCoupon,
    toggleStatus,
  };
}
