import { supabase } from "@/integrations/supabase/userClient";

export type Wallet = "account" | "cash";

async function getDataOwnerId(): Promise<string | null> {
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

export interface Balances {
  account: number;
  cash: number;
  total: number;
}

export async function getBalances(): Promise<Balances> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return { account: 0, cash: 0, total: 0 };
  const { data } = await supabase
    .from("balance")
    .select("amount, account_amount, cash_amount" as any)
    .eq("user_id", ownerId)
    .maybeSingle();
  const account = Number((data as any)?.account_amount ?? 0);
  const cash = Number((data as any)?.cash_amount ?? 0);
  // fallback retrocompat: se as carteiras estão zeradas mas amount existe, joga em conta
  if (account === 0 && cash === 0 && (data as any)?.amount) {
    const amt = Number((data as any).amount);
    return { account: amt, cash: 0, total: amt };
  }
  return { account, cash, total: account + cash };
}

/** Compat: saldo total consolidado. */
export async function getBalance(): Promise<number> {
  const b = await getBalances();
  return b.total;
}

export async function setBalances(next: { account: number; cash: number }) {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return;
  const total = Number((next.account + next.cash).toFixed(2));
  const { data: existing } = await supabase
    .from("balance")
    .select("id")
    .eq("user_id", ownerId)
    .maybeSingle();
  const payload: any = {
    amount: total,
    account_amount: Number(next.account.toFixed(2)),
    cash_amount: Number(next.cash.toFixed(2)),
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    await supabase.from("balance").update(payload).eq("user_id", ownerId);
  } else {
    await supabase.from("balance").insert({ user_id: ownerId, ...payload });
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("balance:changed", { detail: { account: payload.account_amount, cash: payload.cash_amount, total } }));
    }
  } catch { /* noop */ }
}

export async function setBalance(value: number) {
  // Compat: ajusta apenas a carteira "account"
  const cur = await getBalances();
  await setBalances({ account: value - cur.cash, cash: cur.cash });
}

export async function adjustBalance(delta: number, wallet: Wallet = "account") {
  if (!delta) return;
  const ownerId = await getDataOwnerId();
  if (!ownerId) return;
  const p_account_delta = wallet === "cash" ? 0 : delta;
  const p_cash_delta = wallet === "cash" ? delta : 0;

  // Atomic server-side adjustment (locks the row FOR UPDATE).
  // Falls back to legacy read-modify-write if the RPC is not yet deployed.
  const { data, error } = await supabase.rpc("adjust_balance_atomic" as any, {
    p_user_id: ownerId,
    p_account_delta,
    p_cash_delta,
  });

  if (error) {
    console.warn("[balance] adjust_balance_atomic indisponível, usando fallback:", error.message);
    const cur = await getBalances();
    if (wallet === "cash") {
      await setBalances({ account: cur.account, cash: cur.cash + delta });
    } else {
      await setBalances({ account: cur.account + delta, cash: cur.cash });
    }
    return;
  }

  const row: any = Array.isArray(data) ? data[0] : data;
  const account = Number(row?.account_amount ?? 0);
  const cash = Number(row?.cash_amount ?? 0);
  const total = Number(row?.amount ?? account + cash);
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("balance:changed", { detail: { account, cash, total } }));
    }
  } catch { /* noop */ }
}

/**
 * Offline-aware balance adjust. If offline (or server fails), the delta is
 * stored locally and applied once the connection is restored.
 */
export async function adjustBalanceOffline(delta: number, wallet: Wallet = "account") {
  if (!delta) return;
  const { isOnline } = await import("@/lib/offline/status");
  const { enqueueBalanceAdjust } = await import("@/lib/offline/sync");
  if (!isOnline()) {
    await enqueueBalanceAdjust(delta, wallet);
    return;
  }
  try {
    await adjustBalance(delta, wallet);
  } catch {
    await enqueueBalanceAdjust(delta, wallet);
  }
}
