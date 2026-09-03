import { useState, useEffect, useCallback, useRef, useId } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { assertWritable } from "@/lib/readOnlyState";
import {
  loadSharedResource, readSharedResource, writeSharedResource,
  invalidateSharedResource, subscribeSharedResource,
} from "@/lib/sharedResource";

const STOCK_STALE_MS = 2 * 60_000;

export type StockMovementType = "entrada_manual" | "compra" | "venda" | "ajuste";

export interface StockMovement {
  id: string;
  productId: string | null;
  productName: string;
  type: StockMovementType;
  quantity: number;
  unitCost: number | null;
  totalValue: number | null;
  expenseId: string | null;
  saleId: string | null;
  notes: string | null;
  createdAt: string;
}

const mapRow = (r: any): StockMovement => ({
  id: r.id,
  productId: r.product_id,
  productName: r.product_name,
  type: r.movement_type,
  quantity: r.quantity,
  unitCost: r.unit_cost != null ? Number(r.unit_cost) : null,
  totalValue: r.total_value != null ? Number(r.total_value) : null,
  expenseId: r.expense_id,
  saleId: r.sale_id,
  notes: r.notes,
  createdAt: r.created_at,
});

const STOCK_MOVEMENT_COLUMNS =
  "id, product_id, product_name, movement_type, quantity, unit_cost, total_value, expense_id, sale_id, notes, created_at";

export function useStockMovements(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const instanceId = useId();
  const ownerKey = dataOwnerId ?? user?.id ?? null;
  const cacheKey = ownerKey ? `stock_movements:${ownerKey}` : null;
  const [movements, setMovements] = useState<StockMovement[]>(() =>
    cacheKey ? (readSharedResource<StockMovement[]>(cacheKey) ?? []) : [],
  );
  const [loading, setLoading] = useState(true);
  const selfWriteRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!cacheKey) return;
    const rows = await loadSharedResource<StockMovement[]>(
      cacheKey,
      async () => {
        const { data } = await supabase
          .from("stock_movements" as any)
          .select(STOCK_MOVEMENT_COLUMNS)
          .order("created_at", { ascending: false });
        return (data as any[] | null)?.map(mapRow) ?? [];
      },
      { staleTime: STOCK_STALE_MS },
    );
    setMovements(rows);
    setLoading(false);
  }, [cacheKey]);

  useEffect(() => {
    if (!user || !enabled || !cacheKey) return;
    const cached = readSharedResource<StockMovement[]>(cacheKey);
    if (cached) { setMovements(cached); setLoading(false); }
    else setLoading(true);
    fetchData();
  }, [user, enabled, fetchData, cacheKey]);

  useEffect(() => {
    if (!cacheKey) return;
    return subscribeSharedResource(cacheKey, () => {
      if (selfWriteRef.current) return;
      const next = readSharedResource<StockMovement[]>(cacheKey);
      if (next) setMovements(next);
    });
  }, [cacheKey]);

  // Mirror local state to shared cache (self-write guarded to avoid loop)
  useEffect(() => {
    if (!cacheKey) return;
    selfWriteRef.current = true;
    writeSharedResource(cacheKey, movements);
    selfWriteRef.current = false;
  }, [movements, cacheKey]);

  useEffect(() => {
    if (!user || !enabled || !cacheKey || !dataOwnerId) return;
    const channel = supabase
      .channel(`stock-movements:${dataOwnerId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_movements", filter: `owner_id=eq.${dataOwnerId}` },
        () => {
          invalidateSharedResource(cacheKey);
          fetchData();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, enabled, fetchData, cacheKey, dataOwnerId, instanceId]);

  useEffect(() => {
    if (!cacheKey) return;
    const handler = (e: any) => {
      if (e?.detail?.tables?.includes?.("stock_movements")) {
        invalidateSharedResource(cacheKey);
        fetchData();
      }
    };
    window.addEventListener("offline-sync:flushed", handler);
    return () => window.removeEventListener("offline-sync:flushed", handler);
  }, [fetchData, cacheKey]);

  const recordMovement = useCallback(async (input: {
    productId: string | null;
    productName: string;
    type: StockMovementType;
    quantity: number;
    unitCost?: number | null;
    totalValue?: number | null;
    expenseId?: string | null;
    saleId?: string | null;
    notes?: string | null;
  }) => {
    assertWritable();
    if (!user || !dataOwnerId) return null;
    const { data, error } = await supabase.from("stock_movements" as any).insert({
      owner_id: dataOwnerId,
      user_id: user.id,
      product_id: input.productId,
      product_name: input.productName,
      movement_type: input.type,
      quantity: input.quantity,
      unit_cost: input.unitCost ?? null,
      total_value: input.totalValue ?? null,
      expense_id: input.expenseId ?? null,
      sale_id: input.saleId ?? null,
      notes: input.notes ?? null,
    } as any).select().single();
    if (error || !data) return null;
    return mapRow(data);
  }, [user, dataOwnerId]);

  const deleteMovement = useCallback(async (id: string) => {
    assertWritable();
    const { error } = await supabase.from("stock_movements" as any).delete().eq("id", id);
    if (!error) setMovements((prev) => prev.filter((m) => m.id !== id));
    return !error;
  }, []);

  return { movements, loading, recordMovement, deleteMovement };
}
