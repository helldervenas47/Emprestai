/**
 * Repository de pagamentos de empréstimos.
 * Mesmo padrão de loansRepository — única superfície para a tabela `payments`.
 */
import { supabase } from "@/integrations/supabase/userClient";
import { assertWritable } from "@/lib/readOnlyState";

export type PaymentRow = Record<string, any>;

export interface PaymentListOptions {
  limit?: number;
  loanId?: string;
  columns?: string;
}

const DEFAULT_LIST_LIMIT = 5000;

export const paymentsRepository = {
  async list(opts: PaymentListOptions = {}): Promise<PaymentRow[]> {
    let q = supabase
      .from("payments")
      .select(opts.columns ?? "*")
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? DEFAULT_LIST_LIMIT);
    if (opts.loanId) q = q.eq("loan_id", opts.loanId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PaymentRow[];
  },

  /**
   * P0-03 (B): busca pagamentos de UM empréstimo apenas.
   * Uso pretendido: diálogos/telas de detalhe (Histórico, Renegociação,
   * Ajuste de vencimento) — evita transferir a lista global.
   * Ordena por `date` ascendente.
   */
  async fetchByLoanId(loanId: string, columns?: string): Promise<PaymentRow[]> {
    const { data, error } = await supabase
      .from("payments")
      .select(columns ?? "id, loan_id, amount, date, installment_number, previous_due_date, payment_method_id, metadata, created_at")
      .eq("loan_id", loanId)
      .order("date", { ascending: true })
      .limit(2000);
    if (error) throw error;
    return (data ?? []) as PaymentRow[];
  },

  async insert(payload: Record<string, any>): Promise<PaymentRow> {
    assertWritable();
    const { data, error } = await (supabase.from("payments") as any)
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Falha ao registrar pagamento: nenhum registro retornado (verifique permissões).");
    return data as PaymentRow;

  },

  async remove(id: string): Promise<void> {
    assertWritable();
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) throw error;
  },

  async removeByLoan(loanId: string): Promise<void> {
    assertWritable();
    const { error } = await supabase.from("payments").delete().eq("loan_id", loanId);
    if (error) throw error;
  },
};
