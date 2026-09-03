/**
 * Repository de despesas — superfície única para a tabela `expenses`.
 * Replica o padrão estabelecido em loansRepository.
 */
import { supabase } from "@/integrations/supabase/userClient";
import { assertWritable } from "@/lib/readOnlyState";

export type ExpenseRow = Record<string, any>;

export interface ExpenseListOptions {
  limit?: number;
  parentId?: string;
  paid?: boolean;
  columns?: string;
}

const DEFAULT_LIST_LIMIT = 5000;

export const expensesRepository = {
  async list(opts: ExpenseListOptions = {}): Promise<ExpenseRow[]> {
    let q = supabase
      .from("expenses")
      .select(opts.columns ?? "*")
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? DEFAULT_LIST_LIMIT);
    if (opts.parentId !== undefined) q = q.eq("parent_expense_id", opts.parentId);
    if (opts.paid !== undefined) q = q.eq("paid", opts.paid);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ExpenseRow[];
  },

  async findById(id: string, columns: string = "*"): Promise<ExpenseRow | null> {
    const { data, error } = await supabase
      .from("expenses")
      .select(columns)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as ExpenseRow | null;
  },

  async insert(payload: Record<string, any>): Promise<ExpenseRow> {
    assertWritable();
    const { data, error } = await (supabase.from("expenses") as any)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as ExpenseRow;
  },

  async update(id: string, patch: Record<string, any>): Promise<void> {
    assertWritable();
    const { error } = await (supabase.from("expenses") as any).update(patch).eq("id", id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    assertWritable();
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) throw error;
  },
};
