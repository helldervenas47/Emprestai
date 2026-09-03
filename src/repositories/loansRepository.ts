/**
 * Repository de empréstimos — camada de acesso a dados.
 *
 * Objetivo: isolar toda a comunicação com a tabela `loans` (e RPCs
 * relacionadas) num único módulo. Hooks/componentes não devem mais chamar
 * `supabase.from("loans")` diretamente — usam este repository.
 *
 * Benefícios:
 *  - Trocar de banco/schema vira mudança em um arquivo só.
 *  - Centraliza paginação, ordenação e seleção de colunas.
 *  - Facilita testes (basta mockar este módulo).
 *
 * Esta é a entidade-piloto. O mesmo padrão deve ser replicado para
 * `payments`, `expenses`, `incomes`, `sales` etc. nas próximas iterações.
 */
import { supabase } from "@/integrations/supabase/userClient";
import { assertWritable } from "@/lib/readOnlyState";

/** Linha bruta da tabela `loans` no banco (snake_case). */
export type LoanRow = Record<string, any>;

export interface LoanListOptions {
  limit?: number;
  order?: { column: string; ascending: boolean };
  columns?: string;
}

const DEFAULT_LIST_LIMIT = 2000;

export const loansRepository = {
  /** Lista contratos do owner atual (RLS já restringe). */
  async list(opts: LoanListOptions = {}): Promise<LoanRow[]> {
    const order = opts.order ?? { column: "created_at", ascending: false };
    const { data, error } = await supabase
      .from("loans")
      .select(opts.columns ?? "*")
      .order(order.column, { ascending: order.ascending })
      .limit(opts.limit ?? DEFAULT_LIST_LIMIT);
    if (error) throw error;
    return (data ?? []) as LoanRow[];
  },

  async findById(id: string, columns: string = "*"): Promise<LoanRow | null> {
    const { data, error } = await supabase
      .from("loans")
      .select(columns)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as LoanRow | null;
  },

  async insert(payload: Record<string, any>): Promise<LoanRow> {
    assertWritable();
    const { data, error } = await (supabase.from("loans") as any)
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Falha ao criar empréstimo: nenhum registro retornado (verifique permissões).");
    return data as LoanRow;

  },

  async update(id: string, patch: Record<string, any>): Promise<void> {
    assertWritable();
    const { error } = await (supabase.from("loans") as any).update(patch).eq("id", id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    assertWritable();
    const { error } = await supabase.from("loans").delete().eq("id", id);
    if (error) throw error;
  },

  // ------------------------------------------------------------------
  // RPCs atômicas (step 5.1) — única superfície para chamadas server-side.
  // ------------------------------------------------------------------

  /**
   * Registra um pagamento (parcela, parcial, quitação ou amortização) de
   * forma atômica: insert em `payments` + update em `loans` na mesma
   * transação, com `SELECT … FOR UPDATE` na linha do empréstimo e
   * verificação otimista de `paid_installments`.
   *
   * Retorna `{ ok: true }` no sucesso, `{ ok: false, missing: true, error }`
   * quando a RPC ainda não foi publicada (caller pode aplicar fallback
   * dual-write) ou `{ ok: false, missing: false, error }` em erro real.
   */
  async registerPaymentAtomic(input: {
    loanId: string;
    userId: string;
    paymentId: string;
    amount: number;
    paymentDate: string;
    installmentNumber: number;
    paymentMethodId: string | null;
    metadata: any;
    expectedPaidInstallments: number;
    newPaidInstallments: number;
    newStatus: string;
    newRemainingAmount: number;
    newDueDate: string;
  }): Promise<{ ok: true } | { ok: false; missing: boolean; error: any }> {
    assertWritable();
    const { error } = await supabase.rpc("register_loan_payment_atomic" as any, {
      p_loan_id: input.loanId,
      p_user_id: input.userId,
      p_payment_id: input.paymentId,
      p_amount: input.amount,
      p_payment_date: input.paymentDate,
      p_installment_number: input.installmentNumber,
      p_payment_method_id: input.paymentMethodId,
      p_metadata: input.metadata,
      p_expected_paid_installments: input.expectedPaidInstallments,
      p_new_paid_installments: input.newPaidInstallments,
      p_new_status: input.newStatus,
      p_new_remaining_amount: input.newRemainingAmount,
      p_new_due_date: input.newDueDate,
    });
    if (!error) return { ok: true };
    const msg = String(error.message || "");
    const missing = /register_loan_payment_atomic|function .* does not exist|PGRST202/i.test(msg);
    return { ok: false, missing, error };
  },
};
