import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { getBalances } from "@/features/financial/lib/balance";
import { usePiggyBanks } from "@/features/piggyBanks/hooks/usePiggyBanks";

/**
 * Saldos externos que devem ser somados ao "Saldo em Conta" oficial:
 *  - Saldo do Dashboard (conta + dinheiro) — tabela `balance`
 *  - Saldo total dos Cofrinhos — derivado de `usePiggyBanks`
 *  - Saldo total de Veículos — tabela `vehicle_balance`
 *
 * Atualiza em tempo real via:
 *  - evento global "balance:changed" (disparado por setBalances)
 *  - canal Supabase Realtime nas tabelas balance / vehicle_balance
 *  - reatividade natural do hook de cofrinhos
 */
export function useExternalAccountSources() {
  const instanceId = useId();
  const { piggyBanks, balances: piggyBalances } = usePiggyBanks();

  const [dashboard, setDashboard] = useState(0);
  const [vehicle, setVehicle] = useState(0);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [b, sessionRes] = await Promise.all([
      getBalances(),
      supabase.auth.getSession(),
    ]);
    setDashboard(b.total);
    const user = sessionRes.data.session?.user;
    if (!user) {
      setVehicle(0);
      setOwnerId(null);
      return;
    }
    const { data: ownerRow } = await supabase
      .from("user_owner" as any)
      .select("owner_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const oid = (ownerRow as any)?.owner_id || user.id;
    setOwnerId(oid);
    const { data } = await supabase
      .from("vehicle_balance" as any)
      .select("amount")
      .eq("user_id", oid)
      .maybeSingle();
    setVehicle(Number((data as any)?.amount ?? 0));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const onChange = () => { reload(); };
    window.addEventListener("balance:changed", onChange);
    window.addEventListener("vehicle-balance:changed", onChange);
    return () => {
      window.removeEventListener("balance:changed", onChange);
      window.removeEventListener("vehicle-balance:changed", onChange);
    };
  }, [reload]);

  useEffect(() => {
    if (!ownerId) return;
    const channel = supabase
      .channel(`external-balances:${ownerId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "balance", filter: `user_id=eq.${ownerId}` },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_balance", filter: `user_id=eq.${ownerId}` },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ownerId, reload, instanceId]);

  const piggy = useMemo(() => {
    let sum = 0;
    piggyBanks.forEach((pb) => {
      const b = piggyBalances.get(pb.id);
      if (b) sum += b.balance;
    });
    return sum;
  }, [piggyBanks, piggyBalances]);

  const total = dashboard + piggy + vehicle;
  return { dashboard, piggy, vehicle, total };
}
