import { supabase } from "@/integrations/supabase/userClient";
import { adjustBalance, getBalances, setBalances, type Wallet } from "@/features/financial/lib/balance";
import { todayInAppTz } from "@/lib/timezone";

export type LedgerDirection = "in" | "out";
export type LedgerCategory =
  | "loan"
  | "payment"
  | "expense"
  | "adjustment"
  | "aporte"
  | "sale"
  | "initial"
  | "other"
  | "transfer";

export interface LedgerEntry {
  id: string;
  user_id: string;
  direction: LedgerDirection;
  category: LedgerCategory;
  amount: number;
  occurred_on: string;
  description: string;
  loan_id: string | null;
  expense_id: string | null;
  payment_id: string | null;
  source: string;
  metadata: Record<string, any>;
  wallet: Wallet;
  payment_method_id: string | null;
  transfer_group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordLedgerInput {
  direction: LedgerDirection;
  category: LedgerCategory;
  amount: number;
  description: string;
  occurred_on?: string;
  loan_id?: string | null;
  expense_id?: string | null;
  payment_id?: string | null;
  source?: string;
  metadata?: Record<string, any>;
  syncBalance?: boolean;
  /** Carteira impactada. Default: derivado de payment_method_id; senão "account". */
  wallet?: Wallet;
  /** Forma de pagamento — usada para derivar a carteira. */
  payment_method_id?: string | null;
}

function notifyLedgerChanged() {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ledger:changed"));
    }
  } catch { /* noop */ }
}

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

async function resolveWallet(
  wallet: Wallet | undefined,
  payment_method_id: string | null | undefined,
): Promise<Wallet> {
  if (wallet) return wallet;
  if (payment_method_id) {
    const { data } = await supabase
      .from("payment_methods" as any)
      .select("kind")
      .eq("id", payment_method_id)
      .maybeSingle();
    const k = (data as any)?.kind as Wallet | undefined;
    if (k === "cash" || k === "account") return k;
  }
  return "account";
}

export async function recordLedger(input: RecordLedgerInput): Promise<void> {
  const isAudit = input.source === "loan_edit_audit";
  if (!isAudit && (!input.amount || input.amount <= 0)) return;
  if (isAudit && (input.amount ?? 0) < 0) return;
  const ownerId = await getOwnerId();
  if (!ownerId) return;

  let occurred = input.occurred_on || todayInAppTz();
  const syncBalance = input.syncBalance !== false;

  // herda payment_method_id de metadata se não foi passado explicitamente
  if (!input.payment_method_id && (input.metadata as any)?.payment_method_id) {
    input.payment_method_id = (input.metadata as any).payment_method_id;
  }

  if (input.payment_id) {
    try {
      const { data: pay } = await supabase
        .from("payments")
        .select("date, payment_method_id")
        .eq("id", input.payment_id)
        .maybeSingle();
      const realDate = (pay as any)?.date as string | undefined;
      if (realDate && realDate !== occurred) occurred = realDate;
      if (!input.payment_method_id && (pay as any)?.payment_method_id) {
        input.payment_method_id = (pay as any).payment_method_id;
      }
    } catch { /* noop */ }
  }

  const wallet = await resolveWallet(input.wallet, input.payment_method_id);

  const { error: insertErr } = await supabase.from("account_ledger").insert({
    user_id: ownerId,
    direction: input.direction,
    category: input.category,
    amount: Number(input.amount.toFixed(2)),
    occurred_on: occurred,
    description: input.description,
    loan_id: input.loan_id ?? null,
    expense_id: input.expense_id ?? null,
    payment_id: input.payment_id ?? null,
    source: input.source ?? "auto",
    metadata: input.metadata ?? {},
    wallet,
    payment_method_id: input.payment_method_id ?? null,
  } as any);
  if (insertErr) {
    // Idempotência: o lançamento já existe (criado pelo wrapper server-side
    // `create_loan_payment_ledger` ou por um reenvio/retry do mesmo pagamento).
    // Não é erro — o estado final desejado já está no banco.
    if (isDuplicateLedgerError(insertErr)) {
      notifyLedgerChanged();
      return;
    }
    console.error("[recordLedger] insert failed", { input, error: insertErr });
    throw new Error(insertErr.message || "Falha ao gravar lançamento no extrato");
  }
  notifyLedgerChanged();

  if (syncBalance) {
    const delta = input.direction === "in" ? input.amount : -input.amount;
    await adjustBalance(delta, wallet);
  }
}

/** Detecta violação de unicidade dos índices idempotentes do extrato. */
export function isDuplicateLedgerError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "");
  return code === "23505" || /duplicate key value|uq_account_ledger_/i.test(msg);
}

/**
 * Retorna true se já existe lançamento de `category = 'payment'` para o
 * pagamento informado — usado como pré-checagem idempotente antes de tentar
 * criar o extrato no client.
 */
export async function paymentLedgerExists(paymentId: string): Promise<boolean> {
  if (!paymentId) return false;
  const ownerId = await getOwnerId();
  if (!ownerId) return false;
  const { data, error } = await supabase
    .from("account_ledger")
    .select("id")
    .eq("user_id", ownerId)
    .eq("payment_id", paymentId)
    .eq("category", "payment")
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}


export async function removeLedgerByRef(
  ref: { loan_id?: string; expense_id?: string; payment_id?: string; category?: LedgerCategory },
  options: { syncBalance?: boolean } = {},
): Promise<void> {
  const ownerId = await getOwnerId();
  if (!ownerId) return;

  let query = supabase.from("account_ledger").select("id, direction, amount, wallet" as any).eq("user_id", ownerId);
  if (ref.payment_id) query = query.eq("payment_id", ref.payment_id);
  else if (ref.expense_id) query = query.eq("expense_id", ref.expense_id);
  else if (ref.loan_id) query = query.eq("loan_id", ref.loan_id);
  if (ref.category) query = query.eq("category", ref.category);

  const { data } = await query;
  if (!data || data.length === 0) return;

  const ids = data.map((r: any) => r.id);
  await supabase.from("account_ledger").delete().in("id", ids);

  if (options.syncBalance !== false) {
    for (const r of data as any[]) {
      const w = (r.wallet as Wallet) || "account";
      const delta = r.direction === "in" ? -Number(r.amount) : Number(r.amount);
      if (delta !== 0) await adjustBalance(delta, w);
    }
  }
}

/** Recalcula os saldos a partir do ledger e grava em `balance` (por carteira). */
export async function recomputeBalanceFromLedger(): Promise<number> {
  const ownerId = await getOwnerId();
  if (!ownerId) return 0;

  const { data } = await supabase
    .from("account_ledger")
    .select("direction, amount, wallet" as any)
    .eq("user_id", ownerId);

  let account = 0;
  let cash = 0;
  for (const r of (data || []) as any[]) {
    const w = (r.wallet as Wallet) || "account";
    const v = (r.direction === "in" ? 1 : -1) * Number(r.amount);
    if (w === "cash") cash += v; else account += v;
  }
  await setBalances({ account: Number(account.toFixed(2)), cash: Number(cash.toFixed(2)) });
  return account + cash;
}

const LEDGER_ENTRY_COLUMNS =
  "id, user_id, direction, category, amount, occurred_on, description, loan_id, expense_id, payment_id, source, metadata, wallet, payment_method_id, transfer_group_id, created_at, updated_at";

export async function listLedger(): Promise<LedgerEntry[]> {
  const ownerId = await getOwnerId();
  if (!ownerId) return [];
  const { data } = await supabase
    .from("account_ledger")
    .select(LEDGER_ENTRY_COLUMNS)
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .order("occurred_on", { ascending: false })
    .limit(1000);
  return (data || []) as LedgerEntry[];
}

export interface UpdateLedgerInput {
  direction?: LedgerDirection;
  category?: LedgerCategory;
  amount?: number;
  description?: string;
  occurred_on?: string;
  wallet?: Wallet;
  payment_method_id?: string | null;
}

export async function updateLedgerEntry(id: string, input: UpdateLedgerInput): Promise<void> {
  const ownerId = await getOwnerId();
  if (!ownerId) return;

  const { data: prev } = await supabase
    .from("account_ledger")
    .select("direction, amount, wallet" as any)
    .eq("id", id)
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!prev) return;

  const patch: Record<string, any> = {};
  if (input.direction !== undefined) patch.direction = input.direction;
  if (input.category !== undefined) patch.category = input.category;
  if (input.amount !== undefined) patch.amount = Number(input.amount.toFixed(2));
  if (input.description !== undefined) patch.description = input.description;
  if (input.occurred_on !== undefined) patch.occurred_on = input.occurred_on;
  if (input.payment_method_id !== undefined) patch.payment_method_id = input.payment_method_id;

  let newWallet = input.wallet;
  if (!newWallet && input.payment_method_id !== undefined) {
    newWallet = await resolveWallet(undefined, input.payment_method_id);
  }
  if (newWallet) patch.wallet = newWallet;

  await supabase.from("account_ledger").update(patch as any).eq("id", id).eq("user_id", ownerId);

  const prevDir = (prev as any).direction as LedgerDirection;
  const prevAmt = Number((prev as any).amount);
  const prevWallet = ((prev as any).wallet as Wallet) || "account";
  const finalWallet = (newWallet ?? prevWallet) as Wallet;
  const finalDir = (input.direction ?? prevDir) as LedgerDirection;
  const finalAmt = input.amount !== undefined ? Number(input.amount) : prevAmt;

  // reverte efeito antigo
  await adjustBalance(prevDir === "in" ? -prevAmt : prevAmt, prevWallet);
  // aplica novo
  await adjustBalance(finalDir === "in" ? finalAmt : -finalAmt, finalWallet);
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  const ownerId = await getOwnerId();
  if (!ownerId) return;
  const { data } = await supabase
    .from("account_ledger")
    .select("direction, amount, wallet, transfer_group_id" as any)
    .eq("id", id)
    .maybeSingle();
  if (!data) return;
  const groupId = (data as any).transfer_group_id;

  if (groupId) {
    // Excluir o par de transferência inteiro
    const { data: pair } = await supabase
      .from("account_ledger")
      .select("id, direction, amount, wallet" as any)
      .eq("user_id", ownerId)
      .eq("transfer_group_id", groupId);
    const ids = (pair || []).map((r: any) => r.id);
    if (ids.length) await supabase.from("account_ledger").delete().in("id", ids);
    for (const r of (pair || []) as any[]) {
      const delta = r.direction === "in" ? -Number(r.amount) : Number(r.amount);
      await adjustBalance(delta, (r.wallet as Wallet) || "account");
    }
    return;
  }

  await supabase.from("account_ledger").delete().eq("id", id).eq("user_id", ownerId);
  const w = ((data as any).wallet as Wallet) || "account";
  const delta = (data as any).direction === "in" ? -Number((data as any).amount) : Number((data as any).amount);
  if (delta !== 0) await adjustBalance(delta, w);
}

/** Cria uma transferência interna entre as duas carteiras. */
export async function recordTransfer(input: {
  from: Wallet;
  to: Wallet;
  amount: number;
  occurred_on?: string;
  description?: string;
}): Promise<void> {
  if (input.from === input.to) throw new Error("Origem e destino devem ser diferentes");
  if (!input.amount || input.amount <= 0) throw new Error("Valor inválido");
  const ownerId = await getOwnerId();
  if (!ownerId) return;
  const occurred = input.occurred_on || todayInAppTz();
  const groupId = (globalThis as any).crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const amount = Number(input.amount.toFixed(2));
  const labelFrom = input.from === "cash" ? "Dinheiro" : "Conta";
  const labelTo = input.to === "cash" ? "Dinheiro" : "Conta";
  const desc = input.description?.trim() || `Transferência ${labelFrom} → ${labelTo}`;

  await supabase.from("account_ledger").insert([
    {
      user_id: ownerId,
      direction: "out",
      category: "transfer",
      amount,
      occurred_on: occurred,
      description: desc,
      source: "transfer",
      wallet: input.from,
      transfer_group_id: groupId,
      metadata: { transfer_to: input.to },
    },
    {
      user_id: ownerId,
      direction: "in",
      category: "transfer",
      amount,
      occurred_on: occurred,
      description: desc,
      source: "transfer",
      wallet: input.to,
      transfer_group_id: groupId,
      metadata: { transfer_from: input.from },
    },
  ] as any);

  const current = await getBalances();
  await setBalances({
    account: current.account + (input.to === "account" ? amount : 0) - (input.from === "account" ? amount : 0),
    cash: current.cash + (input.to === "cash" ? amount : 0) - (input.from === "cash" ? amount : 0),
  });
}
