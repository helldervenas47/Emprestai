import { useState, useCallback, useEffect, useMemo, useRef, useId } from "react";
import { onAppUIEvent } from "@/lib/appUIEvents";
import { todayInAppTz } from "@/lib/timezone";
import { Expense } from "@/types/loan";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { extractPiggyId } from "@/features/piggyBanks/hooks/usePiggyBanks";
import { notifyRemoteUpdate } from "@/lib/realtimeToast";
import { recordLedger, removeLedgerByRef } from "@/features/financial/lib/ledger";
import { isVehicleExpenseForVehicles } from "@/features/vehicles/components/VehicleExpenseForm";
import { adjustVehicleBalance } from "@/features/vehicles/lib/vehicleBalance";
import { financeFetchError, financeFetchStart, financeFetchSuccess, financeInvalidate, financeRealtimeEvent, financeSetState, useFinanceHookDebug } from "@/lib/financeDebug";
import { extractCardIdFromNotes } from "@/features/financial/lib/expensePaymentUtils";
import { isCreditCardExpense } from "@/features/creditCards/lib/creditCardInvoiceTotals";
import {
  cacheRows, getCachedRows, upsertCachedRow, removeCachedRow,
  enqueueMutation, rewritePendingRecordId,
} from "@/lib/offline/sync";
import { isOnline } from "@/lib/offline/status";
import { assertWritable } from "@/lib/readOnlyState";
import { toast } from "sonner";
import { insertExpenseRow, updateExpenseRow, isLogicalWriteError } from "@/features/financial/lib/expenseWrite";
import {
  loadSharedResource, readSharedResource, writeSharedResource,
  invalidateSharedResource, subscribeSharedResource,
} from "@/lib/sharedResource";
import { getInstallmentScheduleStart, getInstallmentNumberForDueDate, readSeriesStart, withSeriesStart, withHealedSeriesStart } from "@/features/financial/lib/installmentEdit";
import {
  round2, occurrenceAmount, defaultOccurrenceMonth, partialPaidForMonth,
  withPartialPayment, withoutPartialPayments,
} from "@/features/financial/lib/partialPayments";

const EXPENSES_STALE_MS = 60_000;

/**
 * Pagamentos de "recorrente após pagamento" em andamento (por id da despesa).
 * Evita que duplo clique / re-render gere duas próximas ocorrências.
 */
const payingAfterPayment = new Set<string>();

async function syncLinkedBoletoPaid(expenseId: string, paid: boolean, paidDate: string | null, amount: number) {
  assertWritable();
  try {
    // Resolve all expense ids in this chain (parent + all its children).
    // Boletos may be linked to either the parent expense or a specific installment child.
    const idSet = new Set<string>([expenseId]);
    const { data: expRow } = await supabase
      .from("expenses")
      .select("id, parent_expense_id")
      .eq("id", expenseId)
      .maybeSingle();
    const parentId = (expRow as any)?.parent_expense_id ?? expenseId;
    idSet.add(parentId);
    const { data: children } = await supabase
      .from("expenses")
      .select("id")
      .eq("parent_expense_id", parentId);
    for (const c of (children ?? [])) idSet.add((c as any).id);

    const { data: boletos } = await supabase
      .from("my_boletos")
      .select("id, status, amount, owner_id, due_date")
      .in("expense_id", Array.from(idSet));
    if (!boletos || boletos.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    const { data: profile } = uid
      ? await supabase.from("profiles").select("display_name").eq("user_id", uid).maybeSingle()
      : { data: null as any };

    for (const boleto of boletos) {
      const b: any = boleto;
      if (paid) {
        if (b.status === "pago") continue;
        await supabase.from("my_boletos")
          .update({ status: "pago", paid_at: paidDate })
          .eq("id", b.id);
        if (uid) {
          await supabase.from("my_boleto_payments").insert({
            boleto_id: b.id,
            owner_id: b.owner_id,
            user_id: uid,
            paid_at: paidDate ?? today,
            amount: Number(amount) || Number(b.amount) || 0,
            payment_method: null,
            status: "pago",
            notes: "Pago automaticamente ao quitar a despesa vinculada",
            user_name: (profile as any)?.display_name ?? auth.user?.email ?? null,
          });
        }
      } else {
        // Restaura o status anterior: "vencido" se a data já passou, senão "pendente"
        const restoredStatus = b.due_date && b.due_date < today ? "vencido" : "pendente";
        await supabase.from("my_boletos")
          .update({ status: restoredStatus, paid_at: null })
          .eq("id", b.id);
        await supabase.from("my_boleto_payments").delete().eq("boleto_id", b.id);
      }
    }
  } catch { /* noop */ }
}



function rowToExpense(e: any): Expense {
  return {
    id: e.id, description: e.description, amount: Number(e.amount),
    type: e.type as "fixa" | "recorrente", category: e.category,
    installments: e.installments, paidInstallments: e.paid_installments,
    dueDate: e.due_date, 
    paid: e.type === "recorrente" && e.installments && e.installments > 1
      ? (e.paid_installments ?? 0) >= e.installments
      : !!e.paid,
    paidDate: e.paid_date,
    notes: e.notes, createdAt: e.created_at,
    parentExpenseId: e.parent_expense_id ?? undefined,
    scope: (e.scope === "personal" ? "personal" : "business") as "business" | "personal",
    paymentMethodId: e.payment_method_id ?? null,
    generateIncomeOnPay: !!e.generate_income_on_pay,
    generatedIncomeId: e.generated_income_id ?? null,
    recurrenceType: (e.recurrence_type as "standard" | "after_payment") ?? "standard",
  };
}

/** Cria receita vinculada a uma despesa paga (idempotente via marker em notes). */
async function createLinkedIncome(opts: {
  ownerId: string;
  expenseId: string;           // referência usada como marker e dedup
  description: string;
  amount: number;
  category: string | null;
  paymentMethodId: string | null;
  date: string;
  parentExpenseId?: string | null;
}): Promise<string | null> {
  assertWritable();
  const marker = `[FromExpense:${opts.expenseId}]`;
  // Dedup: já existe?
  const { data: existing } = await supabase
    .from("incomes" as any)
    .select("id")
    .eq("user_id", opts.ownerId)
    .ilike("notes", `%${marker}%`)
    .limit(1);
  if (existing && existing.length > 0) return (existing[0] as any).id as string;

  const payload: any = {
    user_id: opts.ownerId,
    description: opts.description,
    amount: opts.amount,
    category: opts.category,
    client_id: null,
    source: "expense",
    payment_method_id: opts.paymentMethodId,
    received_date: opts.date,
    actual_received_date: opts.date,
    status: "received",
    notes: `Gerada automaticamente pela despesa\n${marker}`,
    recurrence: "once",
    parent_id: null,
  };
  const { data, error } = await supabase.from("incomes" as any).insert(payload).select("id").single();
  if (error || !data) return null;
  return (data as any).id as string;
}

async function deleteLinkedIncomeFor(ownerId: string, expenseId: string): Promise<void> {
  assertWritable();
  const marker = `[FromExpense:${expenseId}]`;
  await supabase
    .from("incomes" as any)
    .delete()
    .eq("user_id", ownerId)
    .ilike("notes", `%${marker}%`);
}

/**
 * Sincroniza a folha de pagamento vinculada quando o pagamento é feito/desfeito
 * pela aba "Despesas da Empresa". Não duplica registros: a despesa é a mesma
 * já vinculada à folha; aqui só atualizamos status e histórico.
 */
async function syncPayrollOnExpensePaid(opts: {
  ownerId: string;
  expenseId: string;
  paid: boolean;
  paidDate: string | null;
  amount: number;
  paymentMethodId: string | null;
}) {
  assertWritable();
  const { data: payroll } = await supabase
    .from("payrolls" as any)
    .select("id, net_salary")
    .eq("expense_id", opts.expenseId)
    .maybeSingle();
  if (!payroll) return;
  const p = payroll as any;
  const net = Number(p.net_salary ?? 0);

  if (opts.paid) {
    await supabase.from("payroll_payments" as any).insert({
      user_id: opts.ownerId,
      payroll_id: p.id,
      amount: net,
      paid_date: opts.paidDate ?? new Date().toISOString().slice(0, 10),
      payment_method_id: opts.paymentMethodId,
      expense_id: opts.expenseId,
      income_id: null,
      notes: "Pago via Despesas da Empresa",
    } as any);
    await supabase.from("payrolls" as any).update({
      paid_amount: net,
      status: "pago",
      paid_date: opts.paidDate,
      payment_method_id: opts.paymentMethodId,
      closed: true,
    } as any).eq("id", p.id);
  } else {
    await supabase.from("payroll_payments" as any).delete().eq("payroll_id", p.id);
    await supabase.from("payrolls" as any).update({
      paid_amount: 0,
      status: "pendente",
      paid_date: null,
      closed: false,
    } as any).eq("id", p.id);
  }
}

export function useExpenses(enabled = true) {
  useFinanceHookDebug("useExpenses");
  const { user, dataOwnerId } = useAuth();
  const instanceId = useId();
  const ownerKey = dataOwnerId ?? user?.id ?? null;
  const cacheKey = ownerKey ? `expenses:${ownerKey}` : null;
  const [expenses, setExpenses] = useState<Expense[]>(() =>
    cacheKey ? (readSharedResource<Expense[]>(cacheKey) ?? []) : [],
  );
  const selfWriteRef = useRef(false);
  const skipInitialMirrorRef = useRef<string | null>(null);

  const fetchExpenses = useCallback(async () => {
    if (!user || !cacheKey) return;
    financeFetchStart("useExpenses", "expenses", { source: isOnline() ? "remote" : "cache" });
    if (isOnline()) {
      try {
        const rows = await loadSharedResource<Expense[]>(
          cacheKey,
          async () => {
            const { data, error } = await supabase
              .from("expenses")
              .select("*")
              .order("created_at", { ascending: false });
            if (error) throw error;
            const list = data ?? [];
            cacheRows("expenses", list).catch(() => { /* noop */ });
            return list.map(rowToExpense);
          },
          { staleTime: EXPENSES_STALE_MS },
        );
        financeSetState("useExpenses", "expenses", { rows: rows.length, source: "remote" });
        setExpenses(rows);
        financeFetchSuccess("useExpenses", "expenses", { rows: rows.length, source: "remote" });
        return;
      } catch (error: any) {
        financeFetchError("useExpenses", "expenses", { message: error?.message });
      }
    }
    const cached = await getCachedRows("expenses", ownerKey);
    if (cached.length > 0) {
      const mapped = cached
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .map(rowToExpense);
      financeSetState("useExpenses", "expenses", { rows: mapped.length, source: "cache" });
      setExpenses(mapped);
      financeFetchSuccess("useExpenses", "expenses", { rows: mapped.length, source: "cache" });
    }
  }, [user, cacheKey, ownerKey]);

  // Cross-instance sync + seed inicial a partir do cache persistido.
  useEffect(() => {
    if (!cacheKey) return;
    const activeCacheKey = cacheKey;
    const activeOwnerKey = ownerKey;
    const persisted = readSharedResource<Expense[]>(activeCacheKey);
    // Evita sobrescrever o snapshot persistido com o estado inicial vazio.
    // O fetch remoto ainda roda porque o sharedResource hidratado de localStorage
    // fica stale (loadedAt=0); a UI pinta imediatamente com o último snapshot.
    skipInitialMirrorRef.current = activeCacheKey;
    selfWriteRef.current = true;
    setExpenses(persisted ?? []);
    selfWriteRef.current = false;
    if (persisted === undefined) {
      getCachedRows("expenses", activeOwnerKey).then((cached) => {
        // Race guard: só aplica se o owner/cacheKey ainda for o mesmo desta execução do effect.
        if (activeCacheKey !== cacheKey || activeOwnerKey !== ownerKey) return;
        if (cached.length === 0) return;
        setExpenses(cached.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).map(rowToExpense));
      }).catch(() => { /* noop */ });
    }
    return subscribeSharedResource(activeCacheKey, () => {
      if (selfWriteRef.current) return;
      const next = readSharedResource<Expense[]>(activeCacheKey);
      if (next) setExpenses(next);
    });
  }, [cacheKey, ownerKey]);


  // Mirror local state to shared cache
  useEffect(() => {
    if (!cacheKey) return;
    if (skipInitialMirrorRef.current === cacheKey) {
      skipInitialMirrorRef.current = null;
      return;
    }
    selfWriteRef.current = true;
    writeSharedResource(cacheKey, expenses);
    selfWriteRef.current = false;
  }, [expenses, cacheKey]);

  useEffect(() => {
    if (enabled) {
      fetchExpenses();
      return onAppUIEvent("METAS_RELOAD", () => {
        fetchExpenses();
      });
    }
  }, [fetchExpenses, enabled]);

  // Realtime subscription com patch local (evita SELECT completo por evento — P0 egress)
  useEffect(() => {
    if (!user || !enabled) return;
    const ownerId = dataOwnerId ?? user.id;
    const safe = (fn: () => void) => {
      try { fn(); } catch (e) {
        console.warn("[useExpenses realtime patch failed, refetching]", e);
        if (cacheKey) invalidateSharedResource(cacheKey);
        financeInvalidate("useExpenses", "expenses", { reason: "realtime-fallback" });
        fetchExpenses();
      }
    };
    const channel = supabase
      .channel(`expenses:${ownerId}:${instanceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'expenses', filter: `user_id=eq.${ownerId}` }, (payload) => {
        financeRealtimeEvent("useExpenses", "expenses", { eventType: "INSERT" });
        safe(() => setExpenses((prev) => {
          const row = rowToExpense(payload.new as any);
          if (prev.some((e) => e.id === row.id)) return prev;
          return [row, ...prev];
        }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'expenses', filter: `user_id=eq.${ownerId}` }, (payload) => {
        financeRealtimeEvent("useExpenses", "expenses", { eventType: "UPDATE" });
        safe(() => {
          setExpenses((prev) => {
            const updatedRow = rowToExpense(payload.new as any);
            const existing = prev.find((e) => e.id === updatedRow.id);
            if (!existing) return prev;

            // Se for uma despesa parcelada, verificamos se o contador de parcelas pagas no banco
            // é menor ou igual ao que já temos localmente para evitar "pulos" causados por
            // notificações atrasadas de um processo que o cliente já completou localmente.
            // Também garantimos que o status 'paid' do registro pai reflita se TODAS as parcelas foram pagas.
            if (updatedRow.type === "recorrente" && updatedRow.installments && updatedRow.installments > 1) {
              const isFullyPaid = (updatedRow.paidInstallments ?? 0) >= updatedRow.installments;
              updatedRow.paid = isFullyPaid;
              
              if ((updatedRow.paidInstallments ?? 0) <= (existing.paidInstallments ?? 0) &&
                  updatedRow.dueDate === existing.dueDate) {
                return prev;
              }
            }

            return prev.map((e) => e.id === updatedRow.id ? updatedRow : e);
          });
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'expenses' }, (payload) => {
        financeRealtimeEvent("useExpenses", "expenses", { eventType: "DELETE" });
        safe(() => setExpenses((prev) => prev.filter((e) => e.id !== (payload.old as any).id)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, dataOwnerId, fetchExpenses, enabled, cacheKey, instanceId]);

  // Refetch after offline queue flush (invalidate cache first)
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.tables?.includes("expenses")) {
        if (cacheKey) invalidateSharedResource(cacheKey);
        financeInvalidate("useExpenses", "expenses", { reason: "offline-sync:flushed" });
        fetchExpenses();
      }
    };
    window.addEventListener("offline-sync:flushed", handler);
    return () => window.removeEventListener("offline-sync:flushed", handler);
  }, [fetchExpenses, cacheKey]);

  const addExpense = useCallback(async (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">): Promise<string | null> => {
    assertWritable();
    if (!user || !dataOwnerId) return null;
    const tempId = crypto.randomUUID();
    // Parceladas: gravamos a data do 1º vencimento como fonte única de verdade
    // da numeração das parcelas (1/N, 2/N, ...), independente de pagamentos.
    const isParcelada = expense.type === "recorrente" && (expense.installments ?? 1) > 1
      && (expense.recurrenceType ?? "standard") !== "after_payment";
    if (isParcelada) {
      expense = { ...expense, notes: withSeriesStart(expense.notes, expense.dueDate) };
    }
    const optimistic: Expense = {
      ...expense, id: tempId, paid: false, paidDate: undefined,
      paidInstallments: 0, createdAt: new Date().toISOString(),
      scope: expense.scope ?? "business",
      recurrenceType: expense.recurrenceType ?? "standard",
    };
    financeSetState("useExpenses", "optimistic expense insert", { rows: 1 });
    setExpenses((prev) => [optimistic, ...prev]);

    const insertPayload = {
      id: tempId,
      user_id: dataOwnerId, description: expense.description, amount: expense.amount,
      type: expense.type, category: expense.category, installments: expense.installments,
      paid_installments: 0, due_date: expense.dueDate, paid: false,
      notes: expense.notes ?? null,
      scope: expense.scope ?? "business",
      payment_method_id: expense.paymentMethodId || null,
      generate_income_on_pay: !!expense.generateIncomeOnPay,
      recurrence_type: expense.recurrenceType || "standard",
    };

    await upsertCachedRow("expenses", { ...insertPayload, created_at: optimistic.createdAt });

    if (!isOnline()) {
      await enqueueMutation({ table: "expenses", op: "insert", recordId: tempId, payload: insertPayload });
      return tempId;
    }

    const { data, error } = await insertExpenseRow(insertPayload);

    if (error) {
      // Erros lógicos (RLS, schema, constraint) nunca vão passar em retry:
      // desfazemos o otimismo e mostramos a falha real em vez de simular sucesso.
      if (isLogicalWriteError(error)) {
        financeSetState("useExpenses", "rollback expense insert", { id: tempId });
        setExpenses((prev) => prev.filter((e) => e.id !== tempId));
        await removeCachedRow("expenses", tempId);
        toast.error("Não foi possível salvar a despesa no banco", { description: error.message });
        return null;
      }
      // Falha de rede → fila offline (será sincronizada depois)
      await enqueueMutation({ table: "expenses", op: "insert", recordId: tempId, payload: insertPayload });
      return tempId;
    } else if (data) {
      financeSetState("useExpenses", "confirm expense insert", { id: data.id });
      setExpenses((prev) => prev.map((e) => e.id === tempId ? { ...e, id: data.id, createdAt: data.created_at } : e));
      await removeCachedRow("expenses", tempId);
      await upsertCachedRow("expenses", data);
      await rewritePendingRecordId("expenses", tempId, data.id);
      if ((expense.scope ?? "business") === "personal") {
        supabase.functions.invoke("notify-budget-overrun").catch(() => { /* silent */ });
      }
      return (data as any).id as string;
    }
    // Se caiu aqui sem erro e sem data (raro), retorna o tempId como fallback do offline
    return tempId;
  }, [user, dataOwnerId, setExpenses]);

  const payExpense = useCallback(async (id: string, skipBalanceAdjust = false, payDate?: string, paidAmount?: number) => {
    assertWritable();
    if (!dataOwnerId) return;
    const expense = expenses.find((e) => e.id === id);
    if (!expense || expense.paid) return;

    const today = payDate || todayInAppTz();
    const isRecorrenteParcelada = expense.type === "recorrente" && expense.installments && expense.installments > 1 && expense.recurrenceType !== "after_payment";
    const isAfterPaymentRecurrent = expense.type === "recorrente" && expense.recurrenceType === "after_payment";
    const online = isOnline();

    if (isRecorrenteParcelada) {
      // Verificação de idempotência para evitar duplicatas em registros filhos
      if (online) {
        // Bloqueia execução se houver uma mutação pendente para este ID no offline queue
        // (Isso evita que o clique dispare enquanto o app ainda está sincronizando o estado anterior)
        const { data: existingChild } = await supabase
          .from("expenses")
          .select("id")
          .eq("parent_expense_id", id)
          .eq("due_date", expense.dueDate)
          .maybeSingle();
        
        if (existingChild) {
          console.warn("[payExpense] Parcela já paga (registro filho existente), sincronizando estado local.");
          // Se o banco já tem a parcela mas o pai local está atrasado, força um refetch ou ajuste
          setExpenses(prev => prev.map(e => {
            if (e.id === id) {
              const currentPaid = e.paidInstallments || 0;
              const serverPaidCount = existingChild ? currentPaid + 1 : currentPaid; // Placeholder logic, should reflect actual DB state
              // In this specific idempotency hit, we just want to stop the double-increment
              return e;
            }
            return e;
          }));
          return;
        }
      }

      const originalInstallment = expense.amount / expense.installments!;
      const installmentAmount = typeof paidAmount === "number" && paidAmount > 0 ? paidAmount : originalInstallment;
      const newPaid = (expense.paidInstallments || 0) + 1;
      const fullyPaid = newPaid >= expense.installments!;
      const scheduleStart = getInstallmentScheduleStart(expense);
      const [sYear, sMonth, sDay] = scheduleStart.split("-").map(Number);
      const nextDue = new Date(sYear, sMonth - 1 + newPaid, sDay);
      const nextDueDate = nextDue.toISOString().split("T")[0];

      // Stash previous dueDate in notes so unpay can restore it exactly (avoid day-of-month drift)
      const prevDueStash = `[PrevDue: ${expense.dueDate}]`;
      // Garante o marcador imutável da série (cura registros legados sem alterar posições)
      const notesWithSeries = readSeriesStart(expense.notes)
        ? (expense.notes ?? "")
        : withSeriesStart(expense.notes, scheduleStart);
      const baseNotesRec = notesWithSeries.replace(/\n?\[PrevDue:\s*[\d-]+\]/gi, "").trimEnd();
      const stashedNotes = fullyPaid
        ? (baseNotesRec || null)
        : (baseNotesRec ? `${baseNotesRec}\n${prevDueStash}` : prevDueStash);
      // Número da parcela paga = posição cronológica do vencimento atual na série
      const paidNumber = getInstallmentNumberForDueDate(expense, expense.dueDate);

      // Optimistic: update parent
      financeSetState("useExpenses", "optimistic recurring expense payment", { id, installment: newPaid });
      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e,
        paidInstallments: newPaid,
        paid: fullyPaid,
        dueDate: fullyPaid ? expense.dueDate : nextDueDate,
        paidDate: fullyPaid ? today : undefined,
        notes: stashedNotes,
      } : e));

      const childTempId = crypto.randomUUID();
      const childPayload = {
        id: childTempId,
        user_id: dataOwnerId,
        description: `${expense.description} (${paidNumber}/${expense.installments})`,
        amount: installmentAmount,
        type: "fixa",
        category: expense.category,
        installments: null,
        paid_installments: null,
        due_date: expense.dueDate,
        paid: true,
        paid_date: today,
        notes: expense.notes,
        parent_expense_id: id,
        scope: expense.scope ?? "business",
        payment_method_id: expense.paymentMethodId ?? null,
      };
      const parentUpdate = {
        paid_installments: newPaid,
        paid: fullyPaid,
        due_date: fullyPaid ? expense.dueDate : nextDueDate,
        paid_date: fullyPaid ? today : null,
        notes: stashedNotes,
      };

      await upsertCachedRow("expenses", { ...childPayload, created_at: new Date().toISOString() });

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "insert", recordId: childTempId, payload: childPayload });
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: parentUpdate });
        return;
      }

      await insertExpenseRow(childPayload as any);
      await supabase.from("expenses").update(parentUpdate).eq("id", id);
      if (fullyPaid) await syncLinkedBoletoPaid(id, true, today, installmentAmount);

      // Saída no extrato: parcela paga (apenas business; despesas de veículos NÃO
      // entram no extrato — são debitadas exclusivamente do "Saldo em Conta" da aba Veículos).
      if (!skipBalanceAdjust && (expense.scope ?? "business") === "business" && !isVehicleExpenseForVehicles(expense)) {
        // Idempotência para o extrato (ledger): verifica se já existe lançamento para este expense_id
        const { data: existingLedger } = await supabase
          .from("account_ledger")
          .select("id")
          .eq("expense_id", childTempId)
          .eq("category", "expense")
          .maybeSingle();

        if (!existingLedger) {
          await recordLedger({
            direction: "out", category: "expense", amount: installmentAmount,
            description: `Despesa - ${expense.description} (${paidNumber}/${expense.installments})`,
            occurred_on: today, expense_id: childTempId, source: "auto",
            payment_method_id: expense.paymentMethodId ?? null,
            metadata: { 
              parent_expense_id: id, 
              category: expense.category,
              kind: "credit_card_expense_installment",
              card_id: (expense.notes?.match(/\{ID:([a-f0-9-]{36})\}/i)?.[1]) || null
            },
          });
        }
      } else if (!skipBalanceAdjust && isVehicleExpenseForVehicles(expense)) {
        // Debita o "Saldo em Conta" da aba Veículos.
        await adjustVehicleBalance(-installmentAmount);
      }

      // Receita gerada automaticamente (flag opt-in na despesa pai)
      if (expense.generateIncomeOnPay && (expense.scope ?? "business") === "business") {
        await createLinkedIncome({
          ownerId: dataOwnerId,
          expenseId: childTempId,
          description: `${expense.description} (${paidNumber}/${expense.installments})`,
          amount: installmentAmount,
          category: expense.category,
          paymentMethodId: expense.paymentMethodId ?? null,
          date: today,
          parentExpenseId: id,
        });
      }
    } else if (isAfterPaymentRecurrent) {
      // Recorrente após pagamento: a PRÓXIMA ocorrência só nasce agora, e apenas uma vez.
      const paidAt = today;
      if (payingAfterPayment.has(id)) return; // guarda contra duplo clique
      payingAfterPayment.add(id);
      
      // Optimistic update
      financeSetState("useExpenses", "optimistic after_payment expense payment", { id });
      setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, paid: true, paidDate: paidAt } : e));

      try {
        // O filtro `paid = false` torna a confirmação atômica: se outra execução
        // (clique duplo / retry) já pagou, nenhuma linha retorna e paramos aqui.
        const { data, error } = await supabase
          .from("expenses")
          .update({ paid: true, paid_date: paidAt } as any)
          .eq("id", id)
          .eq("paid", false)
          .select()
          .maybeSingle();

        if (error || !data) {
          if (!error) {
            console.warn("[payExpense] recorrente após pagamento já estava paga — ignorando.");
            await fetchExpenses();
          }
          return;
        }

        // Próximo vencimento (mesmo dia, mês seguinte) sem drift de timezone.
        const [pY, pM, pD] = expense.dueDate.split("-").map(Number);
        const nd = new Date(pY, pM - 1 + 1, 1);
        const lastDay = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate();
        nd.setDate(Math.min(pD, lastDay));
        const nextDueDateStr = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`;

        // Idempotência persistente: a próxima ocorrência carrega [NextAfter:<id da paga>].
        const marker = `[NextAfter:${id}]`;
        const { data: existingNext } = await supabase
          .from("expenses")
          .select("id")
          .eq("user_id", dataOwnerId)
          .ilike("notes", `%${marker}%`)
          .limit(1);

        if (!existingNext || existingNext.length === 0) {
          // Mantém o vínculo do cartão ({ID:uuid} na nota) e limpa marcadores antigos.
          const baseNotes = (expense.notes ?? "")
            .replace(/\n?\[NextAfter:[^\]]+\]/gi, "")
            .trimEnd();
          const nextPayload = {
            user_id: dataOwnerId,
            description: expense.description,
            amount: expense.amount,
            type: "recorrente",
            category: expense.category,
            installments: expense.installments,
            paid_installments: 0,
            due_date: nextDueDateStr,
            paid: false,
            notes: baseNotes ? `${baseNotes}\n${marker}` : marker,
            scope: expense.scope,
            payment_method_id: expense.paymentMethodId || null,
            generate_income_on_pay: expense.generateIncomeOnPay,
            recurrence_type: "after_payment",
          };
          await insertExpenseRow(nextPayload as any);
        }
      } finally {
        payingAfterPayment.delete(id);
      }

      // Saída no extrato (Ledger)
      if (!skipBalanceAdjust && (expense.scope ?? "business") === "business" && !isVehicleExpenseForVehicles(expense)) {
        await recordLedger({
          direction: "out", category: "expense", amount: expense.amount,
          description: `Despesa - ${expense.description}`,
          occurred_on: paidAt, expense_id: id, source: "auto",
          payment_method_id: expense.paymentMethodId ?? null,
          metadata: { 
            category: expense.category, 
            kind: "recurrent_after_payment",
            card_id: (expense.notes?.match(/\{ID:([a-f0-9-]{36})\}/i)?.[1]) || null
          },
        });
      } else if (!skipBalanceAdjust && isVehicleExpenseForVehicles(expense)) {
        await adjustVehicleBalance(-expense.amount);
      }

      if (expense.generateIncomeOnPay && (expense.scope ?? "business") === "business") {
        const incId = await createLinkedIncome({
          ownerId: dataOwnerId, expenseId: id, description: expense.description,
          amount: expense.amount, category: expense.category,
          paymentMethodId: expense.paymentMethodId, date: paidAt
        });
        if (incId) await supabase.from("expenses").update({ generated_income_id: incId } as any).eq("id", id);
      }

      await fetchExpenses();
      notifyRemoteUpdate("Pagamento registrado e próxima despesa gerada");
    } else {
      // Simple fixa expense — if a different paid amount was provided, update the amount
      // and stash the original in notes so we can restore it on unpay.
      const overrode = typeof paidAmount === "number" && paidAmount > 0 && paidAmount !== expense.amount;
      const finalAmount = overrode ? paidAmount! : expense.amount;
      const baseNotes = (expense.notes ?? "").replace(/\n?\[Original:\s*[\d.]+\]/gi, "").trimEnd();
      const finalNotes = overrode
        ? (baseNotes ? `${baseNotes}\n[Original: ${expense.amount.toFixed(2)}]` : `[Original: ${expense.amount.toFixed(2)}]`)
        : expense.notes ?? null;

      financeSetState("useExpenses", "optimistic expense payment", { id, amount: finalAmount });
      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paid: true, paidDate: today, amount: finalAmount, notes: finalNotes,
      } : e));

      const updatePayload = { paid: true, paid_date: today, amount: finalAmount, notes: finalNotes };
      await upsertCachedRow("expenses", { ...expense, ...updatePayload, id });

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
        return;
      }

      await supabase.from("expenses").update(updatePayload).eq("id", id);
      await syncLinkedBoletoPaid(id, true, today, finalAmount);
      await syncPayrollOnExpensePaid({
        ownerId: dataOwnerId,
        expenseId: id,
        paid: true,
        paidDate: today,
        amount: finalAmount,
        paymentMethodId: expense.paymentMethodId ?? null,
      });

      // Verificação de idempotência para o extrato (ledger)
      const { data: existingLedger } = await supabase
        .from("account_ledger")
        .select("id")
        .eq("expense_id", id)
        .eq("category", "expense")
        .maybeSingle();

      // Saída no extrato: despesa simples paga (apenas business; despesas de veículos NÃO
      // entram no extrato — são debitadas exclusivamente do "Saldo em Conta" da aba Veículos).
      if (!skipBalanceAdjust && !existingLedger && (expense.scope ?? "business") === "business" && !isVehicleExpenseForVehicles(expense)) {
        await recordLedger({
          direction: "out", category: "expense", amount: finalAmount,
          description: `Despesa - ${expense.description}`,
          occurred_on: today, expense_id: id, source: "auto",
          payment_method_id: expense.paymentMethodId ?? null,
          metadata: { 
            category: expense.category, 
            direct_payment: true,
            kind: "direct_expense_payment",
            card_id: (expense.notes?.match(/\{ID:([a-f0-9-]{36})\}/i)?.[1]) || null
          },
        });
      } else if (!skipBalanceAdjust && isVehicleExpenseForVehicles(expense)) {
        // Debita o "Saldo em Conta" da aba Veículos.
        await adjustVehicleBalance(-finalAmount);
      }

      // Receita gerada automaticamente (flag opt-in)
      if (expense.generateIncomeOnPay && (expense.scope ?? "business") === "business") {
        const incomeId = await createLinkedIncome({
          ownerId: dataOwnerId,
          expenseId: id,
          description: expense.description,
          amount: finalAmount,
          category: expense.category,
          paymentMethodId: expense.paymentMethodId ?? null,
          date: today,
        });
        if (incomeId) {
          await supabase.from("expenses").update({ generated_income_id: incomeId } as any).eq("id", id);
          setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, generatedIncomeId: incomeId } : e));
        }
      }


      // Piggy bank credit: only when the piggy expense is paid.
      // Nova arquitetura: o depósito SEMPRE passa pela Edge Function
      // `processar-deposito-cofrinho`. Nunca mais escrever em piggy_bank_deposits.
      const piggyId = extractPiggyId(expense.notes);
      if (piggyId) {
        try {
          const { error: depErr } = await supabase.functions.invoke(
            "processar-deposito-cofrinho",
            {
              body: {
                cofrinho_id: piggyId,
                valor: finalAmount,
                data_aporte: today,
                expense_id: id,
              },
            },
          );
          if (depErr) {
            console.warn("[piggy] falha ao registrar aporte via edge function:", depErr);
          }
        } catch (e) {
          console.warn("[piggy] erro inesperado em processar-deposito-cofrinho:", e);
        }
      }
    }

    // Trigger budget overrun alert (push + Telegram) for personal expenses
    if (expense.scope === "personal" && online) {
      supabase.functions.invoke("notify-budget-overrun").catch(() => { /* silent */ });
    }
  }, [expenses, dataOwnerId]);

  /**
   * Pagamento PARCIAL de uma despesa (pessoal ou empresarial).
   *
   * - Registra cada pagamento individualmente (histórico em `notes`).
   * - Recalcula o saldo pendente e nunca aceita valor acima dele.
   * - Só marca a despesa/parcela como paga quando o saldo é totalmente quitado
   *   (e é nesse momento que recorrências "após pagamento" avançam).
   * - Lança a saída no extrato/saldo uma única vez por pagamento parcial,
   *   respeitando o contexto (pessoais não entram no extrato empresarial).
   */
  const payExpensePartial = useCallback(async (
    id: string,
    amount: number,
    payDate?: string,
    occurrenceMonth?: string,
  ): Promise<boolean> => {
    assertWritable();
    if (!dataOwnerId) return false;
    const expense = expenses.find((e) => e.id === id);
    if (!expense || expense.paid) return false;

    const value = round2(amount);
    if (!(value > 0)) {
      toast.error("Informe um valor de pagamento maior que zero");
      return false;
    }

    const month = occurrenceMonth || defaultOccurrenceMonth(expense);
    const occAmount = occurrenceAmount(expense);
    const already = partialPaidForMonth(expense.notes, month);
    const outstanding = round2(occAmount - already);

    if (value > outstanding + 0.005) {
      toast.error("Valor acima do saldo pendente", {
        description: `Saldo pendente: ${outstanding.toFixed(2)}`,
      });
      return false;
    }

    const today = payDate || todayInAppTz();
    const isBusiness = (expense.scope ?? "business") === "business";
    const isVehicle = isVehicleExpenseForVehicles(expense);
    const closesBalance = value >= outstanding - 0.005;

    // Movimentação financeira do valor efetivamente pago agora.
    if (isVehicle) {
      await adjustVehicleBalance(-value);
    } else if (isBusiness) {
      await recordLedger({
        direction: "out", category: "expense", amount: value,
        description: `Despesa (parcial) - ${expense.description}`,
        occurred_on: today, expense_id: id, source: "auto",
        payment_method_id: expense.paymentMethodId ?? null,
        metadata: {
          category: expense.category,
          kind: "partial_expense_payment",
          competence: month,
          card_id: extractCardIdFromNotes(expense.notes ?? null),
        },
      });
    }

    if (closesBalance) {
      // Quitação: delega ao fluxo oficial (parcelas, filhos, recorrências,
      // boletos, folha) sem duplicar a movimentação já registrada acima.
      await payExpense(id, true, today, occAmount);
      try {
        const { data } = await supabase.from("expenses").select("notes").eq("id", id).maybeSingle();
        const cleaned = withoutPartialPayments((data as any)?.notes ?? expense.notes, month);
        await supabase.from("expenses").update({ notes: cleaned } as any).eq("id", id);
        setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, notes: cleaned ?? undefined } : e));
      } catch { /* noop */ }
      return true;
    }

    const notes = withPartialPayment(expense.notes, { month, date: today, amount: value });
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, notes: notes ?? undefined } : e));
    await upsertCachedRow("expenses", { ...expense, notes, id });
    if (!isOnline()) {
      await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: { notes } });
      return true;
    }
    const { error } = await updateExpenseRow(id, { notes });
    if (error) {
      if (isLogicalWriteError(error)) {
        toast.error("Não foi possível registrar o pagamento parcial", { description: error.message });
        await fetchExpenses();
        return false;
      }
      await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: { notes } });
    }
    return true;
  }, [expenses, dataOwnerId, payExpense, fetchExpenses]);



  const unpayExpense = useCallback(async (id: string) => {
    assertWritable();
    const expense = expenses.find((e) => e.id === id);
    if (!expense) return;

    const isRecorrenteParcelada = expense.type === "recorrente" && expense.installments && expense.installments > 1;
    const online = isOnline();

    if (isRecorrenteParcelada && (expense.paidInstallments || 0) > 0) {
      const newPaid = (expense.paidInstallments || 0) - 1;
      const wasFullyPaid = expense.paid;
      // Prefer restoring the exact previous dueDate that was stashed in notes when paying.
      const stashMatch = (expense.notes ?? "").match(/\[PrevDue:\s*([\d-]+)\]/i);
      let newDueDate: string;
      if (stashMatch) {
        newDueDate = stashMatch[1];
      } else {
        const currentDue = new Date(expense.dueDate + "T00:00:00");
        if (!wasFullyPaid) currentDue.setMonth(currentDue.getMonth() - 1);
        newDueDate = currentDue.toISOString().split("T")[0];
      }
      const restoredNotesRec = (expense.notes ?? "").replace(/\n?\[PrevDue:\s*[\d-]+\]/gi, "").trim() || null;

      // Find latest historical child record (online only — offline we can only update parent)
      let latestChildId: string | undefined;
      if (online) {
        const { data: children } = await supabase
          .from("expenses")
          .select("id, paid_date, created_at")
          .eq("parent_expense_id", id)
          .order("created_at", { ascending: false })
          .limit(1);
        latestChildId = children?.[0]?.id;
      }

      // Optimistic update
      setExpenses((prev) => prev
        .filter((e) => e.id !== latestChildId)
        .map((e) => e.id === id ? {
          ...e,
          paidInstallments: newPaid,
          paid: false,
          paidDate: undefined,
          dueDate: newDueDate,
          notes: restoredNotesRec,
        } : e));

      const parentUpdate = {
        paid_installments: newPaid,
        paid: false,
        paid_date: null,
        due_date: newDueDate,
        notes: restoredNotesRec,
      };

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: parentUpdate });
        return;
      }

      if (latestChildId) {
        // Reverte saldo + remove lançamento do extrato vinculado ao child (carteira correta)
        if ((expense.scope ?? "business") === "business" && !isVehicleExpenseForVehicles(expense)) {
          await removeLedgerByRef({ expense_id: latestChildId, category: "expense" });
        }
        // Estorno em despesa de veículo: devolve o valor da parcela ao "Saldo em Conta" da aba Veículos.
        if (isVehicleExpenseForVehicles(expense)) {
          const { data: child } = await supabase
            .from("expenses")
            .select("amount")
            .eq("id", latestChildId)
            .maybeSingle();
          const refund = Number((child as any)?.amount ?? (expense.amount / (expense.installments || 1)));
          await adjustVehicleBalance(refund);
        }
        // Remove receita gerada para esta parcela específica, se existir
        if (dataOwnerId) await deleteLinkedIncomeFor(dataOwnerId, latestChildId);
        await supabase.from("expenses").delete().eq("id", latestChildId);
      }
      await supabase.from("expenses").update(parentUpdate).eq("id", id);
      if (wasFullyPaid) await syncLinkedBoletoPaid(id, false, null, 0);
    } else if (expense.paid) {
      // Restore original amount if we stashed it on pay.
      const m = (expense.notes ?? "").match(/\[Original:\s*([\d.]+)\]/i);
      const restoredAmount = m ? parseFloat(m[1]) : expense.amount;
      const restoredNotes = (expense.notes ?? "").replace(/\n?\[Original:\s*[\d.]+\]/gi, "").trim() || null;

      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paid: false, paidDate: undefined, amount: restoredAmount, notes: restoredNotes,
      } : e));
      const updatePayload = { paid: false, paid_date: null, amount: restoredAmount, notes: restoredNotes };
      await upsertCachedRow("expenses", { ...expense, ...updatePayload, id });

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
        return;
      }

      await supabase.from("expenses").update(updatePayload).eq("id", id);
      await syncLinkedBoletoPaid(id, false, null, 0);
      if (dataOwnerId) {
        await syncPayrollOnExpensePaid({
          ownerId: dataOwnerId,
          expenseId: id,
          paid: false,
          paidDate: null,
          amount: expense.amount,
          paymentMethodId: expense.paymentMethodId ?? null,
        });
      }

      // Reverte saída do extrato (despesa simples) - apenas business não-veículo
      if ((expense.scope ?? "business") === "business" && !isVehicleExpenseForVehicles(expense)) {
        await removeLedgerByRef({ expense_id: id, category: "expense" });
      }
      // Estorno em despesa simples de veículo: devolve ao "Saldo em Conta" da aba Veículos.
      if (isVehicleExpenseForVehicles(expense)) {
        await adjustVehicleBalance(expense.amount);
      }

      // Remove receita gerada (se houver) e limpa o vínculo
      if (dataOwnerId) {
        await deleteLinkedIncomeFor(dataOwnerId, id);
        await supabase.from("expenses").update({ generated_income_id: null } as any).eq("id", id);
        setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, generatedIncomeId: null } : e));
      }

      // Reverse piggy bank credit when unpaying a piggy expense.
      // Nova arquitetura: aportes não carregam expense_id e ficam preservados
      // como histórico em `cofrinho_aportes`/`cofrinho_eventos`. Para reverter
      // saldo o usuário deve usar um resgate. No-op intencional aqui.
      if (extractPiggyId(expense.notes)) { /* no-op */ }

    }
  }, [expenses, dataOwnerId]);

  const deleteExpense = useCallback(async (id: string, skipBalanceAdjust = false) => {
    assertWritable();
    const expense = expenses.find((e) => e.id === id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    await removeCachedRow("expenses", id);
    if (!isOnline()) {
      await enqueueMutation({ table: "expenses", op: "delete", recordId: id });
      return;
    }
    // Nova arquitetura: aportes não têm expense_id; nada para limpar aqui.


    // Remove lançamento do extrato (reverte saldo na carteira correta automaticamente)
    await removeLedgerByRef({ expense_id: id, category: "expense" });

    // Despesa de veículo paga sendo excluída: devolve o valor pago ao "Saldo em Conta" da aba Veículos.
    if (!skipBalanceAdjust && expense && isVehicleExpenseForVehicles(expense) && expense.paid) {
      const refund = expense.type === "recorrente" && expense.installments && expense.installments > 1
        ? expense.amount / expense.installments
        : expense.amount;
      await adjustVehicleBalance(refund);
    }

    // Remove receita gerada vinculada (se houver)
    if (dataOwnerId) await deleteLinkedIncomeFor(dataOwnerId, id);

    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) await enqueueMutation({ table: "expenses", op: "delete", recordId: id });
  }, [expenses, dataOwnerId]);

  const updateExpense = useCallback(async (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
    assertWritable();
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, ...data } : e));
    const updatePayload: any = {
      description: data.description, amount: data.amount, type: data.type,
      category: data.category, installments: data.installments,
      paid_installments: data.paidInstallments, due_date: data.dueDate,
      paid: data.paid, paid_date: data.paidDate, notes: data.notes,
      payment_method_id: data.paymentMethodId,
      generate_income_on_pay: data.generateIncomeOnPay,
      scope: data.scope,
      recurrence_type: data.recurrenceType,
    };
    Object.keys(updatePayload).forEach(k => updatePayload[k] === undefined && delete updatePayload[k]);
    if (!isOnline()) {
      await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
      return;
    }
    const { error } = await updateExpenseRow(id, updatePayload);
    if (error) {
      if (isLogicalWriteError(error)) {
        toast.error("Não foi possível salvar a alteração no banco", { description: error.message });
        await fetchExpenses();
        return;
      }
      await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
    }
  }, [fetchExpenses]);



  // Numeração das parcelas: normaliza registros antigos (sem marcador) usando
  // os recibos filhos como referência cronológica.
  const normalizedExpenses = useMemo(() => withHealedSeriesStart(expenses), [expenses]);

  return { expenses: normalizedExpenses, addExpense, payExpense, payExpensePartial, unpayExpense, deleteExpense, updateExpense };
}
