import { Expense } from "@/types/loan";
import { isCreditCardExpense } from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { isAfterPaymentRecurrence } from "./expensePaymentUtils";
import { getInstallmentScheduleStart } from "./installmentEdit";

/**
 * Filtra despesas para o modo empresarial (Business).
 * Regra: Exclui qualquer despesa vinculada a cartão de crédito (considerada pessoal).
 */
export function filterBusinessExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => {
    // Escopo deve ser business
    if (e.scope !== "business") return false;
    
    // Ignora despesas de cartão de crédito (faturas ou compras no cartão)
    if (isCreditCardExpense(e)) return false;
    
    // Metadados específicos de pagamento de fatura
    if ((e as any)?.metadata?.kind === "credit_card_invoice_payment") return false;
    
    // Categorias que remetem a cartão (segurança extra)
    const cat = (e.category || "").trim().toLowerCase();
    if (cat === "cartão de crédito" || cat === "cartao de credito") return false;
    
    const desc = (e.description || "").trim().toLowerCase();
    if (desc.startsWith("fatura")) return false;

    return true;
  });
}

/**
 * Verifica se uma despesa ocorre em um determinado mês (YYYY-MM).
 */
export function isExpenseOccurringInMonth(e: Expense, yyyymm: string): boolean {
  const [sYear, sMonth] = yyyymm.split("-").map(Number);
  
  // "Recorrente após pagamento" nunca é expandida: só existe o ciclo atual.
  const isRec = e.type === "recorrente" && !!e.installments && e.installments > 1
    && !isAfterPaymentRecurrence(e);
    
  if (isRec) {
    const scheduleStart = getInstallmentScheduleStart(e);
    const [dYear, dMonth] = scheduleStart.split("-").map(Number);
    const startTotalMonths = dYear * 12 + dMonth;
    const selectedTotalMonths = sYear * 12 + sMonth;
    const diff = selectedTotalMonths - startTotalMonths;
    
    return diff >= 0 && diff < (e.installments || 0);
  }
  
  return e.dueDate.startsWith(yyyymm);
}

/**
 * Detecta o índice da parcela (1-based) para um determinado mês.
 */
export function getInstallmentIndexForMonth(e: Expense, yyyymm: string): number {
  if (e.type !== "recorrente" || !e.installments || e.installments <= 1) return 1;
  
  const scheduleStart = getInstallmentScheduleStart(e);
  const [sy, sm] = scheduleStart.split("-").map(Number);
  const [my, mm] = yyyymm.split("-").map(Number);
  
  const diffMonths = (my * 12 + mm) - (sy * 12 + sm);
  return Math.min(Math.max(1, diffMonths + 1), e.installments);
}

/**
 * Detecta se uma despesa foi gerada automaticamente pelo sistema (Bot/Engine).
 */
export function isCoreBotExpense(e: Expense): boolean {
  const notes = (e.notes || "").toLowerCase();
  const desc = (e.description || "").toLowerCase();
  
  // Marcadores comuns de despesas automáticas
  if (notes.includes("gerada automaticamente") || notes.includes("[bot]") || notes.includes("[payroll:")) return true;
  if (desc.includes("bônus por atingimento das metas")) return true;
  
  const meta = (e as any).metadata;
  if (meta?.via_telegram || meta?.kind === "telegram_bot") return true;
  
  return false;
}
