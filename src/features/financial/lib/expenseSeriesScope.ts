/**
 * Exclusão com escopo em séries de despesas (pessoais e empresariais).
 *
 * A série é identificada SEMPRE por vínculo estrutural — `id` do registro pai e
 * `parent_expense_id` dos filhos — e nunca por descrição/valor/categoria. O
 * contexto (`scope`: personal | business) também entra na identificação, de modo
 * que uma operação pessoal jamais atinge um registro empresarial e vice-versa.
 *
 * Despesas parceladas/fixas existem como UM registro pai expandido mês a mês nas
 * listas. Para excluir apenas uma competência (ou a partir dela) sem apagar o
 * histórico, gravamos marcadores em `notes`:
 *
 *   [Skip: 2026-09, 2026-11]   → competências removidas pontualmente
 *   [SkipFrom: 2026-10]        → a partir dessa competência a série termina
 */
import type { Expense } from "@/types/loan";
import { getInstallmentScheduleStart } from "@/features/financial/lib/installmentEdit";
import { isMonthlyExpandable } from "@/features/financial/lib/expensePaymentUtils";

export type DeleteScope = "this" | "future" | "all";

const SKIP_RE = /\[Skip:\s*([^\]]*)\]/i;
const SKIP_FROM_RE = /\[SkipFrom:\s*(\d{4}-\d{2})\]/i;

export function readSkippedMonths(notes?: string | null): string[] {
  const m = (notes ?? "").match(SKIP_RE);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}$/.test(s));
}

export function readSkipFrom(notes?: string | null): string | null {
  const m = (notes ?? "").match(SKIP_FROM_RE);
  return m ? m[1] : null;
}

/** True quando a competência informada foi excluída da série. */
export function isOccurrenceSkipped(notes: string | null | undefined, month: string): boolean {
  if (readSkippedMonths(notes).includes(month)) return true;
  const from = readSkipFrom(notes);
  return !!from && month >= from;
}

function strip(notes: string | null | undefined, re: RegExp): string {
  return (notes ?? "").replace(re, "").replace(/\n{2,}/g, "\n").trim();
}

export function withSkippedMonth(notes: string | null | undefined, month: string): string {
  const months = Array.from(new Set([...readSkippedMonths(notes), month])).sort();
  const base = strip(notes, /\n?\[Skip:[^\]]*\]/gi);
  const marker = `[Skip: ${months.join(", ")}]`;
  return base ? `${base}\n${marker}` : marker;
}

export function withSkipFrom(notes: string | null | undefined, month: string): string {
  const current = readSkipFrom(notes);
  const next = current && current < month ? current : month;
  const base = strip(notes, /\n?\[SkipFrom:[^\]]*\]/gi);
  const marker = `[SkipFrom: ${next}]`;
  return base ? `${base}\n${marker}` : marker;
}

/** Competências (YYYY-MM) ainda ativas de uma despesa parcelada/fixa. */
export function activeOccurrenceMonths(parent: Expense): string[] {
  if (!isMonthlyExpandable(parent)) {
    const month = (parent.dueDate ?? "").slice(0, 7);
    return isOccurrenceSkipped(parent.notes, month) ? [] : [month];
  }
  const [y, m] = getInstallmentScheduleStart(parent).split("-").map(Number);
  const total = parent.installments ?? 1;
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(y, m - 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!isOccurrenceSkipped(parent.notes, key)) out.push(key);
  }
  return out;
}

/** True quando a despesa pertence a uma sequência (parcelada, fixa, recorrente ou filha). */
export function isExpenseSeries(expense: Expense): boolean {
  if (expense.parentExpenseId) return true;
  if (expense.type !== "recorrente") return false;
  return (expense.installments ?? 0) > 1 || expense.recurrenceType === "after_payment";
}

/** Registros da mesma série E do mesmo contexto (pessoal/empresarial). */
export function seriesMembers(expenses: Expense[], target: Expense): Expense[] {
  const parentId = target.parentExpenseId ?? target.id;
  const ctx = target.scope ?? "business";
  return expenses.filter(
    (e) =>
      (e.id === parentId || e.parentExpenseId === parentId) &&
      (e.scope ?? "business") === ctx,
  );
}

export interface ScopedDeleteOptions {
  target: Expense;
  /** Competência exibida na lista (YYYY-MM) da ocorrência clicada. */
  month: string;
  scope: DeleteScope;
  expenses: Expense[];
  /** Exclui um registro real (backend + estado local). */
  onDelete: (id: string) => Promise<void> | void;
  /** Atualiza as notas do registro pai (marcadores de competência). */
  onUpdateNotes: (id: string, notes: string) => Promise<void> | void;
}

/**
 * Executa a exclusão respeitando o escopo escolhido e o contexto da despesa.
 */
export async function applyScopedExpenseDelete(opts: ScopedDeleteOptions): Promise<void> {
  const { target, month, scope, expenses, onDelete, onUpdateNotes } = opts;

  if (!isExpenseSeries(target)) {
    await onDelete(target.id);
    return;
  }

  const parentId = target.parentExpenseId ?? target.id;
  const members = seriesMembers(expenses, target);
  const parent = members.find((e) => e.id === parentId) ?? target;
  const children = members.filter((e) => e.parentExpenseId === parentId);
  const monthly = isMonthlyExpandable(parent);

  const deleteAll = async () => {
    for (const child of children) await onDelete(child.id);
    await onDelete(parentId);
  };

  if (scope === "all") {
    await deleteAll();
    return;
  }

  if (scope === "future") {
    if (!monthly) {
      // Recorrente após pagamento / registros individuais da série:
      // remove o alvo e as ocorrências posteriores ainda não pagas.
      const toRemove = members.filter(
        (e) => e.id === target.id || (!e.paid && (e.dueDate ?? "") >= (target.dueDate ?? "")),
      );
      for (const row of toRemove.filter((r) => r.id !== parentId)) await onDelete(row.id);
      if (toRemove.some((r) => r.id === parentId)) await onDelete(parentId);
      return;
    }
    const startMonth = getInstallmentScheduleStart(parent).slice(0, 7);
    if (month <= startMonth) {
      await deleteAll();
      return;
    }
    for (const child of children.filter((c) => (c.dueDate ?? "").slice(0, 7) >= month)) {
      await onDelete(child.id);
    }
    await onUpdateNotes(parentId, withSkipFrom(parent.notes, month));
    return;
  }

  // scope === "this"
  if (!monthly) {
    await onDelete(target.id);
    return;
  }

  for (const child of children.filter((c) => (c.dueDate ?? "").slice(0, 7) === month)) {
    await onDelete(child.id);
  }
  const notes = withSkippedMonth(parent.notes, month);
  const remaining = activeOccurrenceMonths({ ...parent, notes });
  if (remaining.length === 0) {
    await deleteAll();
    return;
  }
  await onUpdateNotes(parentId, notes);
}
