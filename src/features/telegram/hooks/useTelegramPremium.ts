import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { BILLING_ENVIRONMENT } from "@/lib/billing/subscriptionState";
import { toast } from "sonner";

export interface UserAddon {
  id: string;
  user_id: string;
  environment: string;
  addon_key: string;
  status: "active" | "pending" | "past_due" | "canceled" | "expired" | "trialing";
  price_cents: number;
  cycle: string;
  asaas_customer_id?: string | null;
  asaas_subscription_id?: string | null;
  asaas_payment_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export function useTelegramPremium() {
  const { user, dataOwnerId, loading: authLoading, isMaster } = useAuth();
  const environment = BILLING_ENVIRONMENT;
  const effectiveUserId = dataOwnerId ?? user?.id ?? null;

  const [addon, setAddon] = useState<UserAddon | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAddon = useCallback(async () => {
    if (!effectiveUserId) {
      setAddon(null);
      setLoading(false);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from("user_addons")
        .select("*")
        .eq("user_id", effectiveUserId)
        .eq("environment", environment)
        .eq("addon_key", "telegram")
        .maybeSingle();

      if (error && error.code !== "PGRST116" && error.code !== "42P01") {
        console.warn("[useTelegramPremium] Erro ao buscar add-on:", error);
      }

      setAddon((data as unknown as UserAddon) || null);
      setLoading(false);
      return data;
    } catch (err) {
      console.warn("[useTelegramPremium] Exceção ao buscar add-on:", err);
      setLoading(false);
      return null;
    }
  }, [effectiveUserId, environment]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    fetchAddon();

    if (!effectiveUserId) return;

    // Escuta alterações em tempo real na tabela user_addons
    const channel = supabase
      .channel(`user-addons-telegram-${effectiveUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_addons",
          filter: `user_id=eq.${effectiveUserId}`,
        },
        () => {
          fetchAddon();
        }
      )
      .subscribe();

    const onFocus = () => fetchAddon();
    window.addEventListener("focus", onFocus);
    window.addEventListener("subscription:changed", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("subscription:changed", onFocus);
      try {
        supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
    };
  }, [authLoading, effectiveUserId, fetchAddon]);

  const isActive = Boolean(
    isMaster ||
    (addon &&
      (addon.status === "active" || addon.status === "trialing") &&
      (!addon.current_period_end || new Date(addon.current_period_end).getTime() > Date.now()))
  );

  const cancelAddon = async () => {
    if (!addon?.id) return false;
    try {
      const { error } = await supabase
        .from("user_addons")
        .update({
          status: "canceled",
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", addon.id);

      if (error) throw error;
      toast.success("Assinatura do EmprestAI Telegram cancelada com sucesso.");
      await fetchAddon();
      return true;
    } catch (e: any) {
      toast.error("Erro ao cancelar o EmprestAI Telegram", {
        description: e?.message || "Tente novamente mais tarde.",
      });
      return false;
    }
  };

  return {
    hasPremium: isActive,
    addon,
    loading,
    refetch: fetchAddon,
    cancelAddon,
  };
}
