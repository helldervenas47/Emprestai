/**
 * Repository de recebimentos (receitas) — superfície única para `incomes`.
 */
import { supabase } from "@/integrations/supabase/userClient";
import { assertWritable } from "@/lib/readOnlyState";

export type IncomeRow = Record<string, any>;

export interface IncomeListOptions {
  limit?: number;
  status?: string;
  columns?: string;
}

const DEFAULT_LIST_LIMIT = 5000;

export const incomesRepository = {
  async list(opts: IncomeListOptions = {}): Promise<IncomeRow[]> {
    let q = supabase
      .from("incomes" as any)
      .select(opts.columns ?? "*")
      .order("received_date", { ascending: false })
      .limit(opts.limit ?? DEFAULT_LIST_LIMIT);
    if (opts.status) q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as unknown) as IncomeRow[];
  },

  async insert(payload: Record<string, any>): Promise<IncomeRow> {
    assertWritable();
    const { data, error } = await (supabase.from("incomes" as any) as any)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as IncomeRow;
  },

  async update(id: string, patch: Record<string, any>): Promise<void> {
    assertWritable();
    const { error } = await (supabase.from("incomes" as any) as any).update(patch).eq("id", id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    assertWritable();
    const { error } = await supabase.from("incomes" as any).delete().eq("id", id);
    if (error) throw error;
  },

  async removeMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    assertWritable();
    const { error } = await supabase.from("incomes" as any).delete().in("id", ids);
    if (error) throw error;
  },
};
