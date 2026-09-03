import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_INITIAL_LIMIT } from "@/features/creditCards/lib/creditLimit";
import { assertWritable } from "@/lib/readOnlyState";

export interface CreditLimit {
  id: string;
  userId: string;
  clientId: string;
  currentLimit: number;
  mode: "auto" | "manual";
  lastAutoCalculatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreditLimitHistoryEntry {
  id: string;
  userId: string;
  clientId: string;
  changeType: "manual" | "automatic" | "initial";
  previousLimit: number;
  newLimit: number;
  reason: string | null;
  changedBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function rowToLimit(r: any): CreditLimit {
  return {
    id: r.id,
    userId: r.user_id,
    clientId: r.client_id,
    currentLimit: Number(r.current_limit ?? 0),
    mode: r.mode,
    lastAutoCalculatedAt: r.last_auto_calculated_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToHistory(r: any): CreditLimitHistoryEntry {
  return {
    id: r.id,
    userId: r.user_id,
    clientId: r.client_id,
    changeType: r.change_type,
    previousLimit: Number(r.previous_limit ?? 0),
    newLimit: Number(r.new_limit ?? 0),
    reason: r.reason,
    changedBy: r.changed_by,
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
  };
}

const CREDIT_LIMIT_COLUMNS =
  "id, user_id, client_id, current_limit, mode, last_auto_calculated_at, created_at, updated_at";
const CREDIT_LIMIT_HISTORY_COLUMNS =
  "id, user_id, client_id, change_type, previous_limit, new_limit, reason, changed_by, metadata, created_at";

export function useCreditLimits() {
  const { user, dataOwnerId } = useAuth();
  const instanceId = useId();
  const [limits, setLimits] = useState<CreditLimit[]>([]);

  const fetchLimits = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("credit_limits")
      .select(CREDIT_LIMIT_COLUMNS);
    if (!error && data) setLimits(data.map(rowToLimit));
  }, [user]);

  useEffect(() => {
    fetchLimits();
  }, [fetchLimits]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`credit-limits:${user.id}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_limits", filter: `user_id=eq.${user.id}` },
        () => fetchLimits(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, fetchLimits, instanceId]);

  const ensureLimit = useCallback(
    async (clientId: string): Promise<CreditLimit | null> => {
      assertWritable();
      if (!user || !dataOwnerId) return null;
      const existing = limits.find((l) => l.clientId === clientId);
      if (existing) return existing;

      const { data, error } = await supabase
        .from("credit_limits")
        .insert({
          user_id: dataOwnerId,
          client_id: clientId,
          current_limit: DEFAULT_INITIAL_LIMIT,
          mode: "auto",
        })
        .select()
        .single();

      if (error || !data) return null;

      await supabase.from("credit_limit_history").insert([{
        user_id: dataOwnerId,
        client_id: clientId,
        change_type: "initial",
        previous_limit: 0,
        new_limit: DEFAULT_INITIAL_LIMIT,
        reason: "Limite inicial",
        changed_by: user.id,
      }]);

      const created = rowToLimit(data);
      setLimits((prev) => [...prev, created]);
      return created;
    },
    [user, dataOwnerId, limits],
  );

  const updateLimit = useCallback(
    async (
      clientId: string,
      newLimit: number,
      opts: {
        mode?: "auto" | "manual";
        changeType: "manual" | "automatic";
        reason?: string;
        metadata?: Record<string, unknown>;
      },
    ) => {
      assertWritable();
      if (!user || !dataOwnerId) return;
      let existing = limits.find((l) => l.clientId === clientId);
      if (!existing) {
        existing = (await ensureLimit(clientId)) ?? undefined;
      }
      if (!existing) return;

      const previous = existing.currentLimit;
      const updates: {
        current_limit: number;
        updated_at: string;
        mode?: "auto" | "manual";
        last_auto_calculated_at?: string;
      } = {
        current_limit: newLimit,
        updated_at: new Date().toISOString(),
      };
      if (opts.mode) updates.mode = opts.mode;
      if (opts.changeType === "automatic") {
        updates.last_auto_calculated_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("credit_limits")
        .update(updates)
        .eq("id", existing.id);

      if (error) return;

      await supabase.from("credit_limit_history").insert([{
        user_id: dataOwnerId,
        client_id: clientId,
        change_type: opts.changeType,
        previous_limit: previous,
        new_limit: newLimit,
        reason: opts.reason ?? null,
        changed_by: user.id,
        metadata: (opts.metadata ?? {}) as any,
      }]);

      await fetchLimits();
    },
    [user, dataOwnerId, limits, ensureLimit, fetchLimits],
  );

  const fetchHistory = useCallback(
    async (clientId: string): Promise<CreditLimitHistoryEntry[]> => {
      const { data, error } = await supabase
        .from("credit_limit_history")
        .select(CREDIT_LIMIT_HISTORY_COLUMNS)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error || !data) return [];
      return data.map(rowToHistory);
    },
    [],
  );

  const getLimitForClient = useCallback(
    (clientId: string): CreditLimit | undefined =>
      limits.find((l) => l.clientId === clientId),
    [limits],
  );

  return {
    limits,
    getLimitForClient,
    ensureLimit,
    updateLimit,
    fetchHistory,
    refetch: fetchLimits,
  };
}
