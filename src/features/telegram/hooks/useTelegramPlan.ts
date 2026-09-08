import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";

export interface TelegramPlan {
  id: string;
  name: string;
  price: number;
  description: string | null;
  active: boolean;
}

export const DEFAULT_TELEGRAM_PLAN_ID = "b4e60000-0000-0000-0000-000000000001";

const DEFAULT_TELEGRAM_PLAN: TelegramPlan = {
  id: DEFAULT_TELEGRAM_PLAN_ID,
  name: "EmprestAI Telegram",
  price: 14.90,
  description: null,
  active: true,
};

export function useTelegramPlan() {
  const [plan, setPlan] = useState<TelegramPlan>(DEFAULT_TELEGRAM_PLAN);
  const [loading, setLoading] = useState(true);

  const fetchTelegramPlan = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, price, description, active, is_addon, addon_key")
        .or("addon_key.eq.telegram,is_addon.eq.true,id.eq.b4e60000-0000-0000-0000-000000000001,name.ilike.%telegram%")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setPlan({
          id: data.id,
          name: data.name,
          price: Number(data.price) > 0 ? Number(data.price) : 14.90,
          description: data.description,
          active: data.active ?? true,
        });
      }
    } catch (e) {
      console.warn("[useTelegramPlan] Erro ao buscar plano do telegram:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTelegramPlan();

    // Escuta atualizações no plano em tempo real
    let channel: any = null;
    try {
      channel = supabase
        .channel("telegram-plan-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "plans",
          },
          () => {
            fetchTelegramPlan();
          }
        )
        .subscribe();
    } catch {
      /* noop */
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* noop */
        }
      }
    };
  }, [fetchTelegramPlan]);

  const formattedPrice = plan.price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return { plan, formattedPrice, loading, refetch: fetchTelegramPlan };
}
