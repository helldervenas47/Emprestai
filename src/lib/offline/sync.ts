import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";
import {
  offlineDB,
  OfflineTable,
  MutationOp,
  PendingMutation,
  OFFLINE_TABLES,
} from "./db";
import { isOnline } from "./status";

// ---------- Cache helpers ----------

export async function cacheRows(table: OfflineTable, rows: any[]) {
  const now = Date.now();
  const entries = (rows ?? []).map((r) => ({
    id: r.id as string,
    user_id: r.user_id,
    data: r,
    cachedAt: now,
  }));
  // Replace strategy: clear & put (keeps cache fresh for the user)
  await offlineDB.transaction("rw", offlineDB[table], async () => {
    await offlineDB[table].clear();
    await offlineDB[table].bulkPut(entries);
  });
}

export async function getCachedRows(table: OfflineTable, userId?: string | null): Promise<any[]> {
  const all = await offlineDB[table].toArray();
  return all
    .filter((r) => !userId || r.user_id === userId)
    .map((r) => r.data);
}

export async function upsertCachedRow(table: OfflineTable, row: any) {
  await offlineDB[table].put({
    id: row.id,
    user_id: row.user_id,
    data: row,
    cachedAt: Date.now(),
  });
}

export async function removeCachedRow(table: OfflineTable, id: string) {
  await offlineDB[table].delete(id);
}

// ---------- Queue helpers ----------

export async function enqueueMutation(args: {
  table: OfflineTable;
  op: MutationOp;
  recordId: string;
  payload?: any;
}) {
  await offlineDB.pending_mutations.add({
    table: args.table,
    op: args.op,
    recordId: args.recordId,
    payload: args.payload,
    createdAt: Date.now(),
    retries: 0,
  });
  notifyPendingChanged();
}

export async function getPendingCount(): Promise<number> {
  return offlineDB.pending_mutations.count();
}

export async function getPendingByTable(): Promise<Record<string, number>> {
  const all = await offlineDB.pending_mutations.toArray();
  const out: Record<string, number> = {};
  for (const m of all) out[m.table] = (out[m.table] || 0) + 1;
  return out;
}

// ---------- Reactive listeners ----------

const pendingListeners = new Set<() => void>();
function notifyPendingChanged() {
  pendingListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* noop */
    }
  });
}

export function usePendingCount() {
  const [count, setCount] = useState(0);
  const [byTable, setByTable] = useState<Record<string, number>>({});
  const [balanceDelta, setBalanceDelta] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const [c, bt, bd] = await Promise.all([
        getPendingCount(),
        getPendingByTable(),
        getPendingBalanceDelta(),
      ]);
      if (alive) {
        setCount(c + (bd !== 0 ? 1 : 0));
        setByTable(bt);
        setBalanceDelta(bd);
      }
    };
    refresh();
    pendingListeners.add(refresh);
    // Poll local (IndexedDB) — pausa quando aba oculta e sobe para 15s.
    const interval = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) refresh();
    }, 15000);
    return () => {
      alive = false;
      pendingListeners.delete(refresh);
      clearInterval(interval);
    };
  }, []);

  return { count, byTable, balanceDelta };
}

// ---------- Pending balance delta ----------
// Accumulates balance changes that happened offline (loan/expense payments).
// Applied once on flush to avoid losing money when reconnecting.

const BALANCE_KEY = "pending_balance_delta";

type PendingBalanceDelta = { account: number; cash: number };

function normalizePendingBalanceDelta(value: unknown): PendingBalanceDelta {
  if (typeof value === "number") return { account: value, cash: 0 };
  if (value && typeof value === "object") {
    const entry = value as Partial<PendingBalanceDelta>;
    return { account: Number(entry.account ?? 0), cash: Number(entry.cash ?? 0) };
  }
  return { account: 0, cash: 0 };
}

export async function enqueueBalanceAdjust(delta: number, wallet: "account" | "cash" = "account") {
  if (!delta) return;
  const entry = await offlineDB.meta.get(BALANCE_KEY);
  const current = normalizePendingBalanceDelta(entry?.value);
  const next = { ...current, [wallet]: Number((current[wallet] + delta).toFixed(2)) };
  await offlineDB.meta.put({ key: BALANCE_KEY, value: next });
  notifyPendingChanged();
}

export async function getPendingBalanceDelta(): Promise<number> {
  const entry = await offlineDB.meta.get(BALANCE_KEY);
  const delta = normalizePendingBalanceDelta(entry?.value);
  return delta.account + delta.cash;
}

let flushingBalance = false;
async function flushPendingBalance() {
  if (flushingBalance) return;
  flushingBalance = true;
  try {
    const entry = await offlineDB.meta.get(BALANCE_KEY);
    const delta = normalizePendingBalanceDelta(entry?.value);
    if (!delta.account && !delta.cash) return;
    // CRITICAL: clear the key BEFORE applying to prevent double-application
    // if adjustBalance succeeds but delete fails on the next tick.
    await offlineDB.meta.delete(BALANCE_KEY);
    notifyPendingChanged();
    const { adjustBalance } = await import("@/features/financial/lib/balance");
    try {
      if (delta.account) await adjustBalance(delta.account, "account");
      if (delta.cash) await adjustBalance(delta.cash, "cash");
    } catch (err) {
      // Re-enqueue on failure so we don't lose the delta
      if (delta.account) await enqueueBalanceAdjust(delta.account, "account");
      if (delta.cash) await enqueueBalanceAdjust(delta.cash, "cash");
      throw err;
    }
  } finally {
    flushingBalance = false;
  }
}

// ---------- Flush queue ----------

let flushing = false;

async function applyMutationToSupabase(m: PendingMutation): Promise<{ ok: boolean; logical?: boolean; error?: string }> {
  try {
    if (m.op === "insert") {
      const { error } = await supabase.from(m.table as any).insert(m.payload);
      if (error) return { ok: false, logical: isLogicalError(error), error: error.message };
      return { ok: true };
    }
    if (m.op === "update") {
      const { error } = await supabase.from(m.table as any).update(m.payload).eq("id", m.recordId);
      if (error) return { ok: false, logical: isLogicalError(error), error: error.message };
      return { ok: true };
    }
    if (m.op === "delete") {
      const { error } = await supabase.from(m.table as any).delete().eq("id", m.recordId);
      if (error) return { ok: false, logical: isLogicalError(error), error: error.message };
      return { ok: true };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "network" };
  }
  return { ok: false, error: "unknown op" };
}

function isLogicalError(error: any): boolean {
  const msg = String(error?.message || "").toLowerCase();
  // RLS, validation, FK violations, duplicate keys → discard rather than retry forever
  return (
    msg.includes("row-level security") ||
    msg.includes("schema cache") ||
    String(error?.code || "") === "PGRST204" ||
    msg.includes("violates") ||
    msg.includes("duplicate key") ||
    msg.includes("permission denied") ||
    msg.includes("invalid input")
  );
}

export async function flushQueue(opts: { silent?: boolean } = {}): Promise<{ flushed: number; failed: number }> {
  if (flushing || !isOnline()) return { flushed: 0, failed: 0 };
  flushing = true;
  let flushed = 0;
  let failed = 0;
  const affectedTables = new Set<OfflineTable>();
  try {
    // Process FIFO
    while (true) {
      const next = await offlineDB.pending_mutations.orderBy("createdAt").first();
      if (!next) break;

      const result = await applyMutationToSupabase(next);
      if (result.ok) {
        await offlineDB.pending_mutations.delete(next.id!);
        flushed++;
        affectedTables.add(next.table);
        notifyPendingChanged();
      } else if (result.logical) {
        // discard + log
        console.warn("[offline-sync] discarding logical-error mutation", next, result.error);
        await offlineDB.pending_mutations.delete(next.id!);
        if (!opts.silent) {
          toast.warning("Uma alteração offline foi descartada", {
            description: `${next.table} • ${result.error}`,
          });
        }
        failed++;
        notifyPendingChanged();
      } else {
        // Network error — bump retries and stop draining (will retry later)
        await offlineDB.pending_mutations.update(next.id!, {
          retries: (next.retries || 0) + 1,
          lastError: result.error,
        });
        failed++;
        break;
      }
    }
    // After mutations drain, apply any pending balance delta
    try {
      await flushPendingBalance();
    } catch (e) {
      console.warn("[offline-sync] balance flush failed", e);
    }
  } finally {
    flushing = false;
  }

  if (flushed > 0 && !opts.silent) {
    toast.success(`${flushed} ${flushed === 1 ? "alteração sincronizada" : "alterações sincronizadas"}`);
    // Trigger refetch by emitting a generic event
    window.dispatchEvent(new CustomEvent("offline-sync:flushed", { detail: { tables: [...affectedTables] } }));
  }

  return { flushed, failed };
}

// ---------- Auto-flush wiring ----------

let wired = false;
export function wireAutoSync() {
  if (wired) return;
  wired = true;

  const tryFlush = () => {
    if (isOnline()) flushQueue().catch(() => { /* noop */ });
  };

  window.addEventListener("online", tryFlush);
  window.addEventListener("focus", tryFlush);
  // Retry periódico leve — pausa quando aba oculta e sobe para 60s.
  setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (isOnline()) {
      Promise.all([
        offlineDB.pending_mutations.count(),
        getPendingBalanceDelta(),
      ]).then(([c, bd]) => {
        if (c > 0 || bd !== 0) flushQueue().catch(() => { /* noop */ });
      });
    }
  }, 60000);

  // Initial attempt at app boot
  setTimeout(tryFlush, 2000);
}

// ---------- Helpers used by hooks ----------

/**
 * After a successful insert against Supabase, if there are queued mutations
 * referencing the temp id, rewrite them to use the real id.
 */
export async function rewritePendingRecordId(table: OfflineTable, oldId: string, newId: string) {
  const mutations = await offlineDB.pending_mutations
    .where({ table, recordId: oldId })
    .toArray();
  for (const m of mutations) {
    const updated: Partial<PendingMutation> = { recordId: newId };
    if (m.payload && typeof m.payload === "object" && "id" in m.payload) {
      updated.payload = { ...m.payload, id: newId };
    }
    await offlineDB.pending_mutations.update(m.id!, updated);
  }
}

export { OFFLINE_TABLES };
