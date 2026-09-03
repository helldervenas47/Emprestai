/**
 * Validações para evitar duplicidade entre data de vencimento (receivedDate / dueDate)
 * e data real do pagamento (actualReceivedDate / paidDate) em receitas, despesas e
 * pagamentos vinculados à aba Vendas.
 *
 * Regra geral:
 *  - A "data efetiva" de um lançamento recebido/pago é `actualReceivedDate || receivedDate`
 *    (para receitas) ou `paidDate || dueDate` (para despesas).
 *  - Dois lançamentos da mesma série (mesmo parentId ou mesma raiz) não podem ocupar
 *    a mesma data efetiva, pois isso causaria colisão visual no calendário e
 *    duplicidade no fluxo de caixa.
 *  - Para vendas, dois pagamentos do mesmo `paymentHistory` não podem ter a mesma
 *    data (`date`) com o mesmo tipo, pois geram dois recebimentos sintéticos no
 *    mesmo dia.
 */

export interface IncomeLike {
  id: string;
  parentId?: string | null;
  receivedDate: string;
  actualReceivedDate?: string | null;
  status?: string;
}

export interface ExpenseLike {
  id: string;
  parentId?: string | null;
  dueDate: string;
  paidDate?: string | null;
  paid?: boolean;
}

export interface SalePaymentLike {
  date: string;
  amount: number;
  type?: string;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  conflictingId?: string;
}

/** Retorna a data efetiva de uma receita (data real quando recebida; senão, vencimento). */
export function effectiveIncomeDate(i: IncomeLike): string {
  if (i.status === "received") return i.actualReceivedDate || i.receivedDate;
  return i.receivedDate;
}

/** Retorna a data efetiva de uma despesa (data real do pagamento ou vencimento). */
export function effectiveExpenseDate(e: ExpenseLike): string {
  if (e.paid) return e.paidDate || e.dueDate;
  return e.dueDate;
}

/** Raiz da série recorrente (parentId quando houver; caso contrário, o próprio id). */
function seriesRoot<T extends { id: string; parentId?: string | null }>(item: T): string {
  return item.parentId || item.id;
}

/**
 * Verifica se a nova data efetiva colide com outra ocorrência da mesma série.
 * Use ao mudar receivedDate/actualReceivedDate de uma receita.
 */
export function validateIncomeDate(
  target: IncomeLike,
  incomes: IncomeLike[],
  newEffectiveDate: string,
): ValidationResult {
  if (!newEffectiveDate) {
    return { ok: false, reason: "Data de pagamento obrigatória" };
  }
  const root = seriesRoot(target);
  for (const other of incomes) {
    if (other.id === target.id) continue;
    const otherRoot = seriesRoot(other);
    if (otherRoot !== root) continue;
    if (effectiveIncomeDate(other) === newEffectiveDate) {
      return {
        ok: false,
        reason: `Já existe uma ocorrência desta receita em ${newEffectiveDate}. Escolha outra data.`,
        conflictingId: other.id,
      };
    }
  }
  return { ok: true };
}

/** Mesma regra, aplicada a despesas. */
export function validateExpenseDate(
  target: ExpenseLike,
  expenses: ExpenseLike[],
  newEffectiveDate: string,
): ValidationResult {
  if (!newEffectiveDate) {
    return { ok: false, reason: "Data de pagamento obrigatória" };
  }
  const root = seriesRoot(target);
  for (const other of expenses) {
    if (other.id === target.id) continue;
    if (seriesRoot(other) !== root) continue;
    if (effectiveExpenseDate(other) === newEffectiveDate) {
      return {
        ok: false,
        reason: `Já existe uma ocorrência desta despesa em ${newEffectiveDate}.`,
        conflictingId: other.id,
      };
    }
  }
  return { ok: true };
}

/**
 * Valida adicionar/editar um pagamento em uma venda: rejeita se já existir outro
 * pagamento do mesmo tipo na mesma data (gera duplicidade no calendário).
 */
export function validateSalePayment(
  history: SalePaymentLike[],
  newPayment: SalePaymentLike,
  editingIndex?: number,
): ValidationResult {
  if (!newPayment.date) return { ok: false, reason: "Data do pagamento obrigatória" };
  if (!(Number(newPayment.amount) > 0)) {
    return { ok: false, reason: "Valor do pagamento deve ser maior que zero" };
  }
  
  // Regra flexibilizada: permitimos múltiplos pagamentos na mesma data.
  // O bloqueio anterior impedia pagamentos parciais no mesmo dia (ex: R$ 25 + R$ 25).
  // Apenas bloqueamos se for exatamente o mesmo valor e data (provável clique duplo).
  for (let idx = 0; idx < history.length; idx++) {
    if (idx === editingIndex) continue;
    const p = history[idx];
    if (
      p.date === newPayment.date && 
      (p.type ?? "installment") === (newPayment.type ?? "installment") &&
      Math.abs(Number(p.amount) - Number(newPayment.amount)) < 0.01
    ) {
      return {
        ok: false,
        reason: `Já existe um pagamento idêntico (mesma data e valor) nesta venda.`,
      };
    }
  }
  return { ok: true };
}
