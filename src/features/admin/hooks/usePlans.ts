import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useToast } from "@/hooks/use-toast";

export interface PlanRecord {
  id: string;
  name: string;
  description: string | null;
  price: number;
  price_semestral: number | null;
  price_anual: number | null;
  discount_semestral: number | null;
  discount_anual: number | null;
  badge: string | null;
  promo_text: string | null;
  highlight_color: string | null;
  highlight: boolean | null;
  recommended: boolean | null;
  active: boolean | null;
  sort_order: number | null;
  features: string[] | null;
  show_monthly: boolean | null;
  show_semestral: boolean | null;
  show_anual: boolean | null;
  trial_days: number | null;
  limits: Record<string, number | null> | null;
  permissions: Record<string, boolean> | null;
  allowed_tabs?: string[] | null;
  expiration_action?: "block_all" | "readonly" | "force_upgrade" | null;
}

export type PlanInput = Omit<PlanRecord, "id">;

const PLAN_COLUMNS =
  "id, name, description, price, price_semestral, price_anual, discount_semestral, discount_anual, badge, promo_text, highlight_color, highlight, recommended, active, sort_order, features, show_monthly, show_semestral, show_anual, trial_days, limits, permissions, allowed_tabs, expiration_action";

export function usePlans() {
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("plans")
      .select(PLAN_COLUMNS)
      .order("sort_order", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar planos", description: error.message, variant: "destructive" });
    } else {
      setPlans((data || []) as PlanRecord[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (input: Partial<PlanInput>) => {
    const { error } = await (supabase as any).from("plans").insert(input);
    if (error) {
      toast({ title: "Erro ao criar plano", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Plano criado" });
    await load();
    return true;
  };

  const update = async (id: string, patch: Partial<PlanInput>) => {
    const { error } = await (supabase as any).from("plans").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar plano", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Plano atualizado" });
    await load();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("plans").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir plano", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Plano excluído" });
    await load();
    return true;
  };

  const setRecommended = async (id: string) => {
    // Desmarca todos e marca apenas o escolhido
    const { error: e1 } = await (supabase as any).from("plans").update({ recommended: false }).neq("id", id);
    if (e1) {
      toast({ title: "Erro", description: e1.message, variant: "destructive" });
      return false;
    }
    const { error: e2 } = await (supabase as any).from("plans").update({ recommended: true }).eq("id", id);
    if (e2) {
      toast({ title: "Erro", description: e2.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Plano recomendado definido" });
    await load();
    return true;
  };

  return { plans, loading, reload: load, create, update, remove, setRecommended };
}
