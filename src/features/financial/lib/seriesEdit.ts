import { supabase } from "@/integrations/supabase/userClient";
import type { Expense } from "@/types/loan";
import type { Income } from "@/features/financial/hooks/useIncomes";
import {
  getInstallmentEdits,
  calculateTotalFromInstallments,
  withCustomInstallments,
  getInstallmentNumberForDueDate,
} from "@/features/financial/lib/installmentEdit";

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
 * `patch.amount` representa o valor POR PARCELA.
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

  if (isChild) {
    const parentId = target.parentExpenseId!;
    const parentExpense = expenses.find((e) => e.id === parentId);
    const siblings = expenses.filter((e) => e.parentExpenseId === parentId);

    const childPatch: Partial<Omit<Expense, "id" | "createdAt">> = {
      description: patch.description,
      dueDate: patch.dueDate,
      category: patch.category,
      notes: patch.notes ?? undefined,
      paymentMethodId: patch.paymentMethodId,
      amount: perInstallment,
    };
    Object.keys(childPatch).forEach((k) => {
      if ((childPatch as any)[k] === undefined) delete (childPatch as any)[k];
    });

    await onUpdateLocal(target.id, childPatch);

    if (scope === "this") {
      // Recalcula o total no registro pai
      if (parentExpense) {
        const allEdits = getInstallmentEdits(parentExpense, siblings.map(s => s.id === target.id ? { ...s, ...childPatch } as Expense : s));
        const newTotal = calculateTotalFromInstallments(allEdits);
        await onUpdateLocal(parentId, { amount: newTotal });
      }
      return;
    }

    // Escopo pending ou all a partir de filho
    if (parentExpense) {
      const count = parentExpense.installments || 1;
      const allEdits = getInstallmentEdits(parentExpense, siblings);
      const targetIndex = getInstallmentNumberForDueDate(parentExpense, target.dueDate) - 1;
      const validIndex = Math.min(Math.max(0, targetIndex), count - 1);

      const startIdx = scope === "pending" ? validIndex : 0;
      for (let i = startIdx; i < count; i++) {
        if (perInstallment !== undefined) allEdits[i].amount = perInstallment;
      }

      const newTotal = calculateTotalFromInstallments(allEdits);
      const cleanNotes = scope === "all"
        ? (patch.notes ?? parentExpense.notes ?? "").replace(/\[CustomInstallments:[^\]]*\]/gi, "").trim()
        : withCustomInstallments(patch.notes ?? parentExpense.notes, allEdits);

      await onUpdateLocal(parentId, {
        description: patch.description ?? parentExpense.description,
        category: patch.category ?? parentExpense.category,
        paymentMethodId: patch.paymentMethodId !== undefined ? patch.paymentMethodId : parentExpense.paymentMethodId,
        amount: newTotal,
        notes: cleanNotes || undefined,
      });

      // Atualiza irmãos
      for (const sib of siblings) {
        if (sib.id === target.id) continue;
        if (scope === "pending" && (sib.dueDate < target.dueDate)) continue;
        const sibPatch: any = {};
        if (patch.description !== undefined) sibPatch.description = patch.description;
        if (patch.category !== undefined) sibPatch.category = patch.category;
        if (patch.paymentMethodId !== undefined) sibPatch.payment_method_id = patch.paymentMethodId;
        if (perInstallment !== undefined) sibPatch.amount = perInstallment;
        if (Object.keys(sibPatch).length > 0) {
          await supabase.from("expenses").update(sibPatch).eq("id", sib.id);
        }
      }
    }
    return;
  }

  if (isParcelada) {
    const count = target.installments || 1;
    const siblings = expenses.filter((e) => e.parentExpenseId === target.id);
    const allEdits = getInstallmentEdits(target, siblings);
    const targetDueDate = patch.dueDate || target.dueDate;
    const targetIndex = getInstallmentNumberForDueDate(target, targetDueDate) - 1;
    const validIndex = Math.min(Math.max(0, targetIndex), count - 1);

    if (scope === "this") {
      if (perInstallment !== undefined) {
        allEdits[validIndex].amount = perInstallment;
      }
      if (patch.dueDate !== undefined) {
        allEdits[validIndex].dueDate = patch.dueDate;
      }

      const newTotal = calculateTotalFromInstallments(allEdits);
      const customNotes = withCustomInstallments(patch.notes ?? target.notes, allEdits);

      const parentPatch: Partial<Omit<Expense, "id" | "createdAt">> = {
        description: patch.description ?? target.description,
        category: patch.category ?? target.category,
        paymentMethodId: patch.paymentMethodId !== undefined ? patch.paymentMethodId : target.paymentMethodId,
        amount: newTotal,
        notes: customNotes,
      };
      await onUpdateLocal(target.id, parentPatch);
      return;
    }

    if (scope === "pending") {
      for (let i = validIndex; i < count; i++) {
        if (perInstallment !== undefined) allEdits[i].amount = perInstallment;
      }
      const newTotal = calculateTotalFromInstallments(allEdits);
      const customNotes = withCustomInstallments(patch.notes ?? target.notes, allEdits);

      const parentPatch: Partial<Omit<Expense, "id" | "createdAt">> = {
        description: patch.description ?? target.description,
        category: patch.category ?? target.category,
        paymentMethodId: patch.paymentMethodId !== undefined ? patch.paymentMethodId : target.paymentMethodId,
        amount: newTotal,
        notes: customNotes,
      };
      await onUpdateLocal(target.id, parentPatch);
      return;
    }

    if (scope === "all") {
      for (let i = 0; i < count; i++) {
        if (perInstallment !== undefined) allEdits[i].amount = perInstallment;
      }
      const newTotal = (perInstallment !== undefined ? perInstallment : (target.amount / count)) * count;
      const cleanNotes = (patch.notes ?? target.notes ?? "").replace(/\[CustomInstallments:[^\]]*\]/gi, "").trim();

      const parentPatch: Partial<Omit<Expense, "id" | "createdAt">> = {
        description: patch.description ?? target.description,
        category: patch.category ?? target.category,
        paymentMethodId: patch.paymentMethodId !== undefined ? patch.paymentMethodId : target.paymentMethodId,
        amount: newTotal,
        notes: cleanNotes || undefined,
      };
      await onUpdateLocal(target.id, parentPatch);

      // Atualiza também os filhos (recibos já pagos)
      for (const sib of siblings) {
        const sibPatch: any = {};
        if (patch.description !== undefined) sibPatch.description = patch.description;
        if (patch.category !== undefined) sibPatch.category = patch.category;
        if (patch.paymentMethodId !== undefined) sibPatch.payment_method_id = patch.paymentMethodId;
        if (perInstallment !== undefined) sibPatch.amount = perInstallment;
        if (Object.keys(sibPatch).length > 0) {
          await supabase.from("expenses").update(sibPatch).eq("id", sib.id);
        }
      }
      return;
    }
  }

  // Despesa simples / fixa não parcelada
  const singlePatch: Partial<Omit<Expense, "id" | "createdAt">> = {
    description: patch.description,
    dueDate: patch.dueDate,
    category: patch.category,
    notes: patch.notes ?? undefined,
    paymentMethodId: patch.paymentMethodId,
    amount: perInstallment,
  };
  Object.keys(singlePatch).forEach((k) => {
    if ((singlePatch as any)[k] === undefined) delete (singlePatch as any)[k];
  });
  await onUpdateLocal(target.id, singlePatch);
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
