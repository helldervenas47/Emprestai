/**
 * Repository de parcelas de empréstimo (loan_installments).
 * Criado no P0-03 (etapa B) — helpers para carregar SOMENTE as parcelas
 * de um único empréstimo em diálogos/telas de detalhe.
 *
 * O carregamento global continua em `useLoans.fetchSchedules` até que a
 * etapa A (RPC agregada) seja validada e liberada.
 */
import { supabase } from "@/integrations/supabase/userClient";
import type { InstallmentSchedule } from "@/types/loan";

export type LoanInstallmentRow = {
  id: string;
  loan_id: string;
  installment_number: number;
  due_date: string;
  amount: number | string;
};

function rowToSchedule(s: LoanInstallmentRow): InstallmentSchedule {
  return {
    id: s.id,
    loanId: s.loan_id,
    installmentNumber: s.installment_number,
    dueDate: s.due_date,
    amount: Number(s.amount),
  };
}

export const loanInstallmentsRepository = {
  /** Busca as parcelas de UM único empréstimo, ordenadas por installment_number. */
  async fetchByLoanId(loanId: string): Promise<InstallmentSchedule[]> {
    const { data, error } = await supabase
      .from("loan_installments")
      .select("id, loan_id, installment_number, due_date, amount")
      .eq("loan_id", loanId)
      .order("installment_number", { ascending: true })
      .limit(2000);
    if (error) throw error;
    return ((data ?? []) as LoanInstallmentRow[]).map(rowToSchedule);
  },
};
