import { supabase } from "@/integrations/supabase/userClient";

async function getOwnerId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  const { data } = await supabase
    .from("user_owner" as any)
    .select("owner_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as any)?.owner_id || user.id;
}

/**
 * Ajusta o "Saldo em Conta" da aba Veículos (tabela vehicle_balance).
 * delta positivo soma; negativo subtrai. Dispara evento global para
 * sincronizar telas que consomem o saldo.
 */
export async function adjustVehicleBalance(delta: number): Promise<void> {
  if (!delta) return;
  const ownerId = await getOwnerId();
  if (!ownerId) return;
  const { data: existing } = await supabase
    .from("vehicle_balance" as any)
    .select("amount")
    .eq("user_id", ownerId)
    .maybeSingle();
  const current = Number((existing as any)?.amount ?? 0);
  const next = Number((current + delta).toFixed(2));
  if (existing) {
    await supabase
      .from("vehicle_balance" as any)
      .update({ amount: next, updated_at: new Date().toISOString() })
      .eq("user_id", ownerId);
  } else {
    await supabase.from("vehicle_balance" as any).insert({ user_id: ownerId, amount: next });
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vehicle-balance:changed", { detail: { amount: next } }));
    }
  } catch { /* noop */ }
}
