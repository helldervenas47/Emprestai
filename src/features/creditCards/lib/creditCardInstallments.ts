import type { Expense } from "@/types/loan";
import { getInstallmentScheduleStart } from "@/features/financial/lib/installmentEdit";
import { isCreditCardExpense } from "@/features/creditCards/lib/creditCardInvoiceTotals";

/**
 * Item "virtual" derivado de uma despesa parcelada de cartão de crédito.
 * Cada parcela (1..N) é exibida em sua própria fatura, com data prevista
 * = primeira data + (i-1) meses, e valor = total / N.
 *
 * Parcelas já quitadas são representadas por registros "filhos" reais
 * (criados em payExpense), portanto NÃO geramos virtuais para elas.
 */
export interface ExpandedExpense extends Expense {
  /** True quando a linha foi gerada virtualmente para uma parcela futura. */
  isVirtualInstallment?: boolean;
  /** Número da parcela (1-based) quando virtual. */
  virtualInstallmentNumber?: number;
}

function addMonthsKeepDay(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Expande despesas parceladas de cartão de crédito em itens por parcela.
 * - Mantém despesas não-parceladas e despesas que não são de cartão.
 * - Para parents parcelados de cartão: substitui por N entradas virtuais
 *   das parcelas ainda em aberto (paidInstallments+1 .. installments),
 *   posicionadas no mês de cada parcela. Filhos já pagos continuam aparecendo
 *   normalmente, pois são registros reais separados.
 */
export function expandCreditCardExpenses(expenses: Expense[]): ExpandedExpense[] {
  const result: ExpandedExpense[] = [];
  for (const e of expenses) {
    const isParcelada =
      e.type === "recorrente" && !!e.installments && e.installments > 1;
    const isCard = isCreditCardExpense(e);
    
    // Se for "recorrente após pagamento", não expandimos parcelas virtuais.
    // O sistema gerará a próxima despesa real somente quando a atual for paga.
    const isAfterPayment = e.recurrenceType === "after_payment";

    if (!isParcelada || !isCard || e.parentExpenseId || isAfterPayment) {
      result.push(e);
      continue;
    }
    // Parent parcelado de cartão: gerar parcelas virtuais ainda em aberto.
    const total = e.installments!;
    const paid = e.paidInstallments ?? 0;
    // currentDueDate aponta para a próxima parcela em aberto (paid+1).
    // Logo, a primeira parcela = currentDueDate - paid meses.
    // Fonte única de verdade da 1ª parcela: marcador [SerieStart] quando existir.
    const firstDue = getInstallmentScheduleStart(e);
    const installmentValue = e.amount / total;
    for (let i = paid + 1; i <= total; i++) {
      const due = addMonthsKeepDay(firstDue, i - 1);
      result.push({
        ...e,
        id: `${e.id}::virt::${i}`,
        amount: installmentValue,
        installments: 1,
        paidInstallments: 0,
        type: "fixa",
        dueDate: due,
        paid: false,
        isVirtualInstallment: true,
        virtualInstallmentNumber: i,
        description: `${e.description} (${i}/${total})`,
      });
    }
  }
  return result;
}
