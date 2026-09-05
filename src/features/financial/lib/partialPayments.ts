/**
 * Pagamentos parciais de despesas (pessoais e empresariais).
 *
 * Não há tabela dedicada: o histórico de pagamentos parciais é gravado em um
 * marcador estruturado dentro de `notes`, no formato
 *
 *   [Partial: 2026-08|2026-08-22=400.00; 2026-08|2026-08-30=100.00]
 *
 * onde cada entrada é `competência|data=valor`. A competência (YYYY-MM) permite
 * que despesas parceladas/fixas — que são expandidas mês a mês a partir do
 * registro pai — mantenham o controle do saldo pendente de cada ocorrência de
 * forma independente.
 *
 * Regras:
 *  - Nenhum valor pago → Pendente
 *  - Valor parcialmente pago → Parcialmente paga
 *  - Saldo quitado → a despesa (ou a parcela) é marcada como Paga
 */
import type { Expense } from "@/types/loan";
import { isAfterPaymentRecurrence } from "@/features/financial/lib/expensePaymentUtils";

export interface PartialPayment {
  /** Competência da ocorrência (YYYY-MM). */
  month: string;
  /** Data efetiva do pagamento (YYYY-MM-DD). */
  date: string;
  amount: number;
}

const PARTIAL_RE = /\[Partial:\s*([^\]]*)\]/i;

export function round2(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

export function readPartialPayments(notes?: string | null): PartialPayment[] {
  const m = (notes ?? "").match(PARTIAL_RE);
  if (!m) return [];
  return m[1]
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [head, rawAmount] = entry.split("=");
      const [month, date] = (head ?? "").split("|");
      const amount = Number(rawAmount);
      if (!month || !/^\d{4}-\d{2}$/.test(month.trim()) || !Number.isFinite(amount)) return null;
      return {
        month: month.trim(),
        date: (date ?? "").trim() || `${month.trim()}-01`,
        amount: round2(amount),
      } as PartialPayment;
    })
    .filter((p): p is PartialPayment => !!p);
}

function stripMarker(notes?: string | null): string {
  return (notes ?? "")
    .replace(/\n?\[Partial:[^\]]*\]/gi, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function serialize(list: PartialPayment[]): string {
  return `[Partial: ${list
    .map((p) => `${p.month}|${p.date}=${p.amount.toFixed(2)}`)
    .join("; ")}]`;
}

/** Reescreve o marcador com a lista informada (remove quando vazia). */
export function writePartialPayments(
  notes: string | null | undefined,
  list: PartialPayment[],
): string | null {
  const base = stripMarker(notes);
  if (list.length === 0) return base || null;
  const marker = serialize(list);
  return base ? `${base}\n${marker}` : marker;
}

/** Adiciona um pagamento parcial preservando o histórico existente. */
export function withPartialPayment(
  notes: string | null | undefined,
  payment: PartialPayment,
): string | null {
  const list = [...readPartialPayments(notes), { ...payment, amount: round2(payment.amount) }];
  return writePartialPayments(notes, list);
}

/** Remove pagamentos parciais (de uma competência específica ou de todas). */
export function withoutPartialPayments(
  notes: string | null | undefined,
  month?: string,
): string | null {
  if (!month) return writePartialPayments(notes, []);
  const list = readPartialPayments(notes).filter((p) => p.month !== month);
  return writePartialPayments(notes, list);
}

/** Total já pago parcialmente na competência informada. */
export function partialPaidForMonth(notes: string | null | undefined, month: string): number {
  return round2(
    readPartialPayments(notes)
      .filter((p) => p.month === month)
      .reduce((s, p) => s + p.amount, 0),
  );
}

/** Valor de UMA ocorrência da despesa (parcela mensal ou valor único). */
export function occurrenceAmount(expense: Expense): number {
  const isMonthly =
    expense.type === "recorrente" &&
    !!expense.installments &&
    expense.installments > 1 &&
    !isAfterPaymentRecurrence(expense);
  return round2(isMonthly ? expense.amount / expense.installments! : expense.amount);
}

/** Competência padrão de uma despesa (usada quando a lista não informa o mês). */
export function defaultOccurrenceMonth(expense: Expense): string {
  return (expense.dueDate ?? "").slice(0, 7);
}

/** Saldo pendente da ocorrência (valor da parcela − parciais já pagos). */
export function outstandingForMonth(expense: Expense, month: string): number {
  if (expense.paid) return 0;
  return Math.max(0, round2(occurrenceAmount(expense) - partialPaidForMonth(expense.notes, month)));
}

export type ExpensePaymentStatus = "pending" | "partial" | "paid";

export function paymentStatusFor(expense: Expense, month: string): ExpensePaymentStatus {
  if (expense.paid) return "paid";
  const paidSoFar = partialPaidForMonth(expense.notes, month);
  if (paidSoFar <= 0) return "pending";
  return paidSoFar + 0.005 >= occurrenceAmount(expense) ? "paid" : "partial";
}

/** Total acumulado de todos os pagamentos parciais registrados nas observações. */
export function totalPartialPaid(notes?: string | null): number {
  return round2(
    readPartialPayments(notes).reduce((s, p) => s + p.amount, 0),
  );
}

/** Saldo pendente de uma receita considerando pagamentos parciais. */
export function incomeOutstanding(income: { amount: number; status: string; notes?: string | null }): number {
  if (income.status === "received") return 0;
  return Math.max(0, round2(income.amount - totalPartialPaid(income.notes)));
}

