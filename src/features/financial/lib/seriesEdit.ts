/**
 * Helpers para edição com escopo (apenas esta / esta e próximas / todas)
 * em séries recorrentes/parceladas de receitas e despesas.
 */
import { supabase } from "@/integrations/supabase/userClient";
import type { Expense } from "@/types/loan";
import type { Income } from "@/features/financial/hooks/useIncomes";

export type EditScope = "this" | "pending" | "all";

// -----------------------------
// Despesas (expenses)
// -----------------------------

export interface ExpenseScopePatch {
  description?: string;
  amount?: number;         // valor por parcela (não total)
  dueDate?: string;
  category?: string;
  notes?: string | null;
  paymentMethodId?: string | null;
}

export function isExpenseInSeries(exp: Expense): boolean {
  const parcelada = exp.type === "recorrente" && (exp.installments ?? 0) > 1;
  return parcelada || !!exp.parentExpenseId;
}

/**
 * Aplica `patch` à despesa selecionada e propaga conforme o escopo escolhido.
 * `onUpdateLocal(id, partial)` deve atualizar tanto o backend quanto o estado local
 * (passe a função `updateExpense` retornada por `useExpenses`).
 *
 * `patch.amount` representa o valor POR PARCELA. Para o registro pai (parcelada),
 * armazenamos `amount = porParcela * installments`. Para filhos (parcelas já pagas)
 * armazenamos `amount = porParcela`.
 */
export async function applyExpenseScopedUpdate(opts: {
  target: Expense;
  patch: ExpenseScopePatch;
  scope: EditScope;
  expenses: Expense[];
  onUpdateLocal: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => Promise<void> | void;
}): Promise<void> {
  const { target, patch, scope, expenses, onUpdateLocal } = opts;
  const isParcelada = target.type === "recorrente" && (target.installments ?? 0) > 1;
  const isChild = !!target.parentExpenseId;

  const perInstallment = patch.amount;
  const totalInstallments = isChild
    ? expenses.find((e) => e.id === target.parentExpenseId)?.installments ?? target.installments ?? 1
    : (target.installments ?? 1);
  const targetIsParent = isParcelada && !isChild;

  // Patch para o registro do alvo (o pai armazena o TOTAL).
  const targetPatch: Partial<Omit<Expense, "id" | "createdAt">> = {
    description: patch.description,
    dueDate: patch.dueDate,
    category: patch.category,
    notes: patch.notes ?? undefined,
    paymentMethodId: patch.paymentMethodId,
    amount: perInstallment === undefined
      ? undefined
      : (targetIsParent ? perInstallment * totalInstallments : perInstallment),
  };
  Object.keys(targetPatch).forEach((k) => {
    if ((targetPatch as any)[k] === undefined) delete (targetPatch as any)[k];
  });

  await onUpdateLocal(target.id, targetPatch);

  if (scope === "this" || (!isParcelada && !isChild)) return;

  const parentId = isChild ? target.parentExpenseId! : target.id;
  const parentExpense = isChild ? expenses.find((e) => e.id === parentId) : target;

  // Atualiza os irmãos (parcelas filhas).
  let q = supabase.from("expenses").select("id, paid").eq("parent_expense_id", parentId);
  if (scope === "pending") q = q.eq("paid", false);
  const { data: siblings } = await q;

  const siblingPatch: any = {};
  if (patch.description !== undefined) siblingPatch.description = patch.description;
  if (patch.category !== undefined) siblingPatch.category = patch.category;
  if (patch.notes !== undefined) siblingPatch.notes = patch.notes;
  if (patch.paymentMethodId !== undefined) siblingPatch.payment_method_id = patch.paymentMethodId;
  if (perInstallment !== undefined) siblingPatch.amount = perInstallment;

  if (Object.keys(siblingPatch).length > 0) {
    for (const s of (siblings ?? [])) {
      if ((s as any).id === target.id) continue;
      await supabase.from("expenses").update(siblingPatch).eq("id", (s as any).id);
    }
  }

  // Se o alvo era um filho, também ajusta o pai (mantendo o total recalculado).
  if (isChild && parentExpense) {
    const parentPatch: Partial<Omit<Expense, "id" | "createdAt">> = {
      description: patch.description,
      category: patch.category,
      notes: patch.notes ?? undefined,
      paymentMethodId: patch.paymentMethodId,
      amount: perInstallment === undefined
        ? undefined
        : perInstallment * (parentExpense.installments ?? totalInstallments),
    };
    Object.keys(parentPatch).forEach((k) => {
      if ((parentPatch as any)[k] === undefined) delete (parentPatch as any)[k];
    });
    if (Object.keys(parentPatch).length > 0) {
      await onUpdateLocal(parentId, parentPatch);
    }
  }
}

/**
 * Exclusão com escopo para despesas em série (parceladas/recorrentes).
 * - `this`: apenas a linha alvo
 * - `pending`: alvo + irmãs não pagas com dueDate >= alvo
 * - `all`: série inteira (pai + filhas)
 *
 * `onDeleteLocal(id)` deve remover a linha do backend e do estado local
 * (ex.: `deleteExpense` do `useExpenses`, ou o wrapper de veículos que
 * também reverte o saldo da carteira).
 */
export async function applyExpenseScopedDelete(opts: {
  target: Expense;
  scope: EditScope;
  expenses: Expense[];
  onDeleteLocal: (id: string) => Promise<void> | void;
}): Promise<void> {
  const { target, scope, expenses, onDeleteLocal } = opts;

  if (scope === "this" || !isExpenseInSeries(target)) {
    await onDeleteLocal(target.id);
    return;
  }

  const parentId = target.parentExpenseId ?? target.id;
  const seriesMembers = expenses.filter(
    (e) => e.id === parentId || e.parentExpenseId === parentId,
  );

  let toDelete: Expense[];
  if (scope === "all") {
    toDelete = seriesMembers;
  } else {
    // pending: alvo + demais não pagas a partir da data do alvo
    toDelete = seriesMembers.filter((e) => {
      if (e.id === target.id) return true;
      if (e.paid) return false;
      return (e.dueDate ?? "") >= (target.dueDate ?? "");
    });
  }

  // Ordena para excluir filhas antes do pai (evita conflito de FK).
  toDelete.sort((a, b) => {
    if (a.id === parentId) return 1;
    if (b.id === parentId) return -1;
    return 0;
  });

  for (const row of toDelete) {
    await onDeleteLocal(row.id);
  }
}

// -----------------------------
// Receitas (incomes)
// -----------------------------

export interface IncomeScopePatch {
  description?: string;
  amount?: number;
  category?: string | null;
  clientId?: string | null;
  source?: string | null;
  paymentMethodId?: string | null;
  receivedDate?: string;
  notes?: string | null;
}

/** Identifica receitas que pertencem à mesma série (raiz comum). */
export function incomeSeriesIds(target: Income, all: Income[]): string[] {
  const root = target.parentId || target.id;
  return all.filter((i) => i.id === root || i.parentId === root).map((i) => i.id);
}

export function isIncomeInSeries(target: Income, all: Income[]): boolean {
  if (target.recurrence !== "once" && !target.parentId) return true; // raiz recorrente
  if (target.parentId) return true; // filha de série
  return incomeSeriesIds(target, all).length > 1;
}

export async function applyIncomeScopedUpdate(opts: {
  target: Income;
  patch: IncomeScopePatch;
  scope: EditScope;
  incomes: Income[];
  onUpdateLocal: (id: string, data: Partial<Income>) => Promise<void> | void;
}): Promise<void> {
  const { target, patch, scope, incomes, onUpdateLocal } = opts;

  // Atualiza o alvo.
  const targetPatch: Partial<Income> = {
    description: patch.description,
    amount: patch.amount,
    category: patch.category as any,
    clientId: patch.clientId as any,
    source: patch.source as any,
    paymentMethodId: patch.paymentMethodId as any,
    notes: patch.notes as any,
    // Para o alvo aplicamos a data se o usuário mudou.
    receivedDate: patch.receivedDate,
  };
  Object.keys(targetPatch).forEach((k) => {
    if ((targetPatch as any)[k] === undefined) delete (targetPatch as any)[k];
  });
  await onUpdateLocal(target.id, targetPatch);

  if (scope === "this") return;

  const ids = incomeSeriesIds(target, incomes).filter((id) => id !== target.id);
  if (ids.length === 0) return;

  // Filtros adicionais conforme escopo.
  const targets = incomes
    .filter((i) => ids.includes(i.id))
    .filter((i) => {
      if (scope === "all") return true;
      // pending/forward: somente ocorrências NÃO recebidas e com data >= alvo
      if (i.status === "received") return false;
      return i.receivedDate >= target.receivedDate;
    });

  // Para os irmãos NÃO alteramos a data (ela é a identidade da ocorrência).
  const siblingPatch: Partial<Income> = {
    description: patch.description,
    amount: patch.amount,
    category: patch.category as any,
    clientId: patch.clientId as any,
    source: patch.source as any,
    paymentMethodId: patch.paymentMethodId as any,
    notes: patch.notes as any,
  };
  Object.keys(siblingPatch).forEach((k) => {
    if ((siblingPatch as any)[k] === undefined) delete (siblingPatch as any)[k];
  });
  if (Object.keys(siblingPatch).length === 0) return;

  for (const sib of targets) {
    await onUpdateLocal(sib.id, siblingPatch);
  }
}
