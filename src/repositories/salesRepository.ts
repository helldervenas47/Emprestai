/**
 * Repository de vendas — superfície única para `sales` e RPC de estoque
 * atômica (step 5.4).
 */
import { supabase } from "@/integrations/supabase/userClient";
import { assertWritable } from "@/lib/readOnlyState";

export type SaleRow = Record<string, any>;

export interface SaleListOptions {
  limit?: number;
  productId?: string;
  columns?: string;
}

const DEFAULT_LIST_LIMIT = 5000;

export const salesRepository = {
  async list(opts: SaleListOptions = {}): Promise<SaleRow[]> {
    let q = supabase
      .from("sales")
      .select(opts.columns ?? "*")
      .order("sale_date", { ascending: false })
      .limit(opts.limit ?? DEFAULT_LIST_LIMIT);
    if (opts.productId) q = q.eq("product_id", opts.productId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as SaleRow[];
  },

  async insert(payload: Record<string, any>): Promise<SaleRow> {
    assertWritable();
    const { data, error } = await (supabase.from("sales") as any)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as SaleRow;
  },

  async update(id: string, patch: Record<string, any>): Promise<void> {
    assertWritable();
    const { error } = await (supabase.from("sales") as any).update(patch).eq("id", id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    assertWritable();
    const { error } = await supabase.from("sales").delete().eq("id", id);
    if (error) throw error;
  },

  /**
   * Decremento atômico de estoque (lock FOR UPDATE no produto + validação
   * server-side + insert do movimento na mesma transação).
   * Retorno padronizado para o caller decidir entre erro real ou fallback.
   */
  async decrementStockAtomic(input: {
    productId: string;
    ownerId: string;
    userId: string;
    quantity: number;
    saleId?: string | null;
    notes?: string | null;
    totalValue?: number | null;
  }): Promise<{ ok: true } | { ok: false; missing: boolean; error: any }> {
    assertWritable();
    const { error } = await supabase.rpc("decrement_stock_atomic" as any, {
      p_product_id: input.productId,
      p_owner_id: input.ownerId,
      p_user_id: input.userId,
      p_quantity: input.quantity,
      p_sale_id: input.saleId ?? null,
      p_notes: input.notes ?? null,
      p_total_value: input.totalValue ?? null,
    });
    if (!error) return { ok: true };
    const msg = String(error.message || "");
    const missing = /decrement_stock_atomic|function .* does not exist|PGRST202/i.test(msg);
    return { ok: false, missing, error };
  },
};
