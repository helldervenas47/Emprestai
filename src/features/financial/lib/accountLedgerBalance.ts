/**
 * Fonte OFICIAL de saldo em conta — P0-01.
 *
 * Regra:
 *   saldo_oficial = Σ(amount) para direction='in'  −  Σ(amount) para direction='out'
 *   sobre `account_ledger` do owner, excluindo lançamentos com
 *   metadata->>scope = 'vehicle' (veículos possuem saldo próprio, por regra).
 *
 * Esta etapa é NÃO destrutiva: o service é exposto para consumo futuro e
 * para "shadow check" contra os hooks derivados atuais (useAccountBalance,
 * useUnifiedAccountBalance, dashboard/useAccountBalance). Ainda NÃO troca a
 * leitura na UI porque o ledger é incompleto (ver .lovable/plan.md — P0-01b).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useDataOwner } from "@/hooks/useDataOwner";
import { financeFetchStart, financeFetchSuccess, financeSetState } from "@/lib/financeDebug";

export interface OfficialBalanceRow {
  amount: number | string | null;
  direction: string | null;
  metadata: Record<string, any> | null;
}

export function sumOfficialBalance(rows: OfficialBalanceRow[]): number {
  let total = 0;
  for (const r of rows) {
    const scope = (r.metadata as any)?.scope;
    if (scope === "vehicle") continue; // veículos ficam de fora do saldo oficial
    const amt = Number(r.amount) || 0;
    total += r.direction === "in" ? amt : -amt;
  }
  return Number(total.toFixed(2));
}

export async function getOfficialBalance(ownerId: string): Promise<number> {
  if (!ownerId) return 0;
  const { data, error } = await supabase
    .from("account_ledger" as any)
    .select("amount, direction, metadata")
    .eq("user_id", ownerId);
  if (error) throw error;
  return sumOfficialBalance(((data ?? []) as unknown) as OfficialBalanceRow[]);
}

/**
 * Hook oficial de leitura do saldo em conta.
 * Consumidores devem migrar para cá nas próximas fases (P0-01c).
 */
export function useOfficialAccountBalance(): number {
  const ownerId = useDataOwner();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;

    const load = async () => {
      financeFetchStart("useOfficialAccountBalance", "account_ledger", { ownerId: "present" });
      try {
        const total = await getOfficialBalance(ownerId);
        if (cancelled) return;
        setBalance(total);
        financeSetState("useOfficialAccountBalance", "balance", { total });
        financeFetchSuccess("useOfficialAccountBalance", "account_ledger", { total });
      } catch (err) {
        console.warn("[useOfficialAccountBalance] falha ao carregar", err);
      }
    };

    load();
    const handler = () => load();
    window.addEventListener("ledger:changed", handler);
    window.addEventListener("balance:changed", handler);

    const channel = supabase
      .channel(`official-balance:${ownerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "account_ledger", filter: `user_id=eq.${ownerId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener("ledger:changed", handler);
      window.removeEventListener("balance:changed", handler);
      supabase.removeChannel(channel);
    };
  }, [ownerId]);

  return balance;
}
