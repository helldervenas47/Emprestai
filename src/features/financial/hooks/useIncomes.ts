import { useState, useCallback, useEffect, useRef, useId } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { displayIncomeCategory } from "@/features/financial/lib/incomeCategory";
import { todayInAppTz } from "@/lib/timezone";
import { assertWritable } from "@/lib/readOnlyState";
import { cacheRows, getCachedRows } from "@/lib/offline/sync";
import { financeFetchStart, financeFetchSuccess, financeInvalidate, financeRealtimeEvent, financeSetState, useFinanceHookDebug } from "@/lib/financeDebug";
import {
  loadSharedResource, readSharedResource, writeSharedResource,
  invalidateSharedResource, subscribeSharedResource,
} from "@/lib/sharedResource";

import { toast } from "sonner";
import {
  withPartialPayment,
  withoutPartialPayments,
  totalPartialPaid,
  round2,
} from "@/features/financial/lib/partialPayments";

export type IncomeStatus = "pending" | "received" | "overdue";
export type IncomeRecurrence = "once" | "weekly" | "biweekly" | "monthly" | "yearly";

export interface Income {
  id: string;
  /** Opcional: presente em payloads legados/mocks. */
  userId?: string | null;
  description: string;
  amount: number;
  category: string | null;
  clientId: string | null;
  source: string | null;
  paymentMethodId: string | null;
  receivedDate: string;
  actualReceivedDate?: string | null;
  status: IncomeStatus;
  notes: string | null;
  recurrence: IncomeRecurrence;
  parentId: string | null;
  createdAt: string;
}

const globalRecurringBackfillLocks = new Set<string>();

function recurringBackfillLockKey(dataOwnerId: string, incomeId: string) {
  const periodKey = todayInAppTz().slice(0, 7);
  return `${dataOwnerId}:${incomeId}:${periodKey}`;
}

function deriveStatus(persisted: IncomeStatus, receivedDate: string): IncomeStatus {
  if (persisted === "received") return "received";
  // Qualquer parcela com vencimento anterior a hoje é considerada vencida
  if (receivedDate && receivedDate < todayInAppTz()) return "overdue";
  return "pending";
}

function rowToIncome(r: any): Income {
  const persisted = (r.status as IncomeStatus) ?? "pending";
  return {
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    category: displayIncomeCategory(r.category),
    clientId: r.client_id,
    source: r.source,
    paymentMethodId: r.payment_method_id,
    receivedDate: r.received_date,
    actualReceivedDate: r.actual_received_date ?? null,
    status: deriveStatus(persisted, r.received_date),
    notes: r.notes,
    recurrence: r.recurrence,
    parentId: r.parent_id,
    createdAt: r.created_at,
  };
}

export function useIncomes(enabled = true) {
  useFinanceHookDebug("useIncomes");
  const { user, dataOwnerId } = useAuth();
  const instanceId = useId();
  const ownerKey = dataOwnerId ?? user?.id ?? null;
  const cacheKey = ownerKey ? `incomes:${ownerKey}` : null;
  const [incomes, setIncomes] = useState<Income[]>(() =>
    cacheKey ? (readSharedResource<Income[]>(cacheKey) ?? []) : [],
  );
  const [loading, setLoading] = useState(false);
  const selfWriteRef = useRef(false);
  const skipInitialMirrorRef = useRef<string | null>(null);

  const fetch = useCallback(async () => {
    if (!user || !cacheKey) return;
    financeFetchStart("useIncomes", "incomes", { reason: "fetch/refetch" });
    setLoading(true);
    try {
      const rows = await loadSharedResource<Income[]>(
        cacheKey,
        async () => {
          const { data, error } = await supabase
            .from("incomes" as any)
            .select("id, user_id, description, amount, category, client_id, source, payment_method_id, received_date, actual_received_date, status, notes, recurrence, parent_id, created_at")
            .order("received_date", { ascending: false })
            .limit(5000);
          if (error) throw error;
          const list = (data as any[] | null) ?? [];
          cacheRows("incomes", list).catch(() => { /* noop */ });
          return list.map(rowToIncome);
        },
        { staleTime: INCOMES_STALE_MS },
      );
      financeSetState("useIncomes", "incomes", { rows: rows.length });
      setIncomes(rows);
      financeFetchSuccess("useIncomes", "incomes", { rows: rows.length });
    } catch (error: any) {
      const cached = await getCachedRows("incomes", ownerKey);
      if (cached.length > 0) {
        const mapped = cached
          .sort((a, b) => (b.received_date || "").localeCompare(a.received_date || ""))
          .map(rowToIncome);
        financeSetState("useIncomes", "incomes", { rows: mapped.length, source: "indexeddb-cache" });
        setIncomes(mapped);
        financeFetchSuccess("useIncomes", "incomes", { rows: mapped.length, source: "indexeddb-cache", remoteError: error?.message });
      }
    } finally {
      setLoading(false);
      financeSetState("useIncomes", "loading", { value: false });
    }
  }, [user, cacheKey, ownerKey]);

  // Sync from cache when other instances update + seed inicial (cold reload)
  useEffect(() => {
    if (!cacheKey) return;
    const persisted = readSharedResource<Income[]>(cacheKey);
    // Evita sobrescrever o snapshot persistido com o estado inicial vazio.
    // O fetch remoto ainda roda porque o sharedResource hidratado de localStorage
    // fica stale (loadedAt=0); a UI pinta imediatamente com o último snapshot.
    skipInitialMirrorRef.current = cacheKey;
    selfWriteRef.current = true;
    setIncomes(persisted ?? []);
    selfWriteRef.current = false;
    if (persisted === undefined) {
      getCachedRows("incomes", ownerKey).then((cached) => {
        if (cached.length === 0) return;
        setIncomes(cached.sort((a, b) => (b.received_date || "").localeCompare(a.received_date || "")).map(rowToIncome));
      }).catch(() => { /* noop */ });
    }
    return subscribeSharedResource(cacheKey, () => {
      if (selfWriteRef.current) return;
      const next = readSharedResource<Income[]>(cacheKey);
      if (next) setIncomes(next);
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
    writeSharedResource(cacheKey, incomes);
    selfWriteRef.current = false;
  }, [incomes, cacheKey]);

  useEffect(() => { if (enabled) { fetch(); } }, [fetch, enabled]);

  // Refetch after offline queue flush (invalidate cache first)
  useEffect(() => {
    if (!cacheKey) return;
    const handler = (e: any) => {
      if (e?.detail?.tables?.includes?.("incomes")) {
        invalidateSharedResource(cacheKey);
        financeInvalidate("useIncomes", "incomes", { reason: "offline-sync:flushed" });
        fetch();
      }
    };
    window.addEventListener("offline-sync:flushed", handler);
    return () => window.removeEventListener("offline-sync:flushed", handler);
  }, [fetch, cacheKey]);

  useEffect(() => {
    if (!user || !enabled) return;
    const ownerId = dataOwnerId ?? user.id;
    const safe = (fn: () => void) => {
      try { fn(); } catch (e) {
        console.warn("[useIncomes realtime patch failed, refetching]", e);
        if (cacheKey) invalidateSharedResource(cacheKey);
        financeInvalidate("useIncomes", "incomes", { reason: "realtime-fallback" });
        fetch();
      }
    };
    const channel = supabase
      .channel(`incomes:${ownerId}:${instanceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incomes", filter: `user_id=eq.${ownerId}` }, (payload) => {
        financeRealtimeEvent("useIncomes", "incomes", { eventType: "INSERT" });
        safe(() => setIncomes((prev) => {
          const row = rowToIncome(payload.new as any);
          if (prev.some((i) => i.id === row.id)) return prev;
          return [row, ...prev];
        }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "incomes", filter: `user_id=eq.${ownerId}` }, (payload) => {
        financeRealtimeEvent("useIncomes", "incomes", { eventType: "UPDATE" });
        safe(() => setIncomes((prev) => prev.map((i) => i.id === (payload.new as any).id ? rowToIncome(payload.new as any) : i)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "incomes" }, (payload) => {
        financeRealtimeEvent("useIncomes", "incomes", { eventType: "DELETE" });
        safe(() => setIncomes((prev) => prev.filter((i) => i.id !== (payload.old as any).id)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, dataOwnerId, fetch, enabled, instanceId]);

  const insertSingle = useCallback(async (
    input: Omit<Income, "id" | "createdAt">,
  ): Promise<Income | null> => {
    assertWritable();
    if (!dataOwnerId) return null;
    const payload: any = {
      user_id: dataOwnerId,
      description: input.description,
      amount: input.amount,
      category: displayIncomeCategory(input.category),
      client_id: input.clientId,
      source: input.source,
      payment_method_id: input.paymentMethodId,
      received_date: input.receivedDate,
      status: input.status,
      notes: input.notes,
      recurrence: input.recurrence,
      parent_id: input.parentId,
    };
    const { data, error } = await supabase.from("incomes" as any).insert(payload).select().single();
    if (error || !data) return null;
    return rowToIncome(data);
  }, [dataOwnerId]);

  // Quantos meses à frente materializar receitas mensais/anuais
  const FUTURE_MONTHS_HORIZON = 12;

  function ymd(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function monthlyDates(baseIso: string, horizonMonths: number): string[] {
    const base = new Date(baseIso + "T00:00:00");
    const day = base.getDate();
    const startY = base.getFullYear();
    const startM = base.getMonth();
    const today = new Date();
    const endY = today.getFullYear();
    const endM = today.getMonth() + horizonMonths;
    const out: string[] = [];
    let y = startY;
    let m = startM;
    while (y < endY || (y === endY && m <= endM)) {
      const lastDay = new Date(y, m + 1, 0).getDate();
      const useDay = Math.min(day, lastDay);
      out.push(ymd(new Date(y, m, useDay)));
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return out;
  }

  function yearlyDates(baseIso: string, horizonMonths: number): string[] {
    const base = new Date(baseIso + "T00:00:00");
    const today = new Date();
    const endY = today.getFullYear() + Math.ceil(horizonMonths / 12);
    const out: string[] = [];
    let y = base.getFullYear();
    while (y <= endY) {
      const lastDay = new Date(y, base.getMonth() + 1, 0).getDate();
      const useDay = Math.min(base.getDate(), lastDay);
      out.push(ymd(new Date(y, base.getMonth(), useDay)));
      y += 1;
    }
    return out;
  }

  // Expande receitas recorrentes (semanais/quinzenais no mês, mensais/anuais até o horizonte)
  const addIncome = useCallback(async (
    input: Omit<Income, "id" | "createdAt">,
  ): Promise<Income | null> => {
    if (!dataOwnerId) return null;
    const today = todayInAppTz();
    let dates: string[] | null = null;
    if (input.recurrence === "weekly" || input.recurrence === "biweekly") {
      const stepDays = input.recurrence === "weekly" ? 7 : 14;
      const base = new Date(input.receivedDate + "T00:00:00");
      const horizonEnd = new Date();
      horizonEnd.setMonth(horizonEnd.getMonth() + FUTURE_MONTHS_HORIZON + 1, 0);
      dates = [];
      const d = new Date(base);
      while (d <= horizonEnd) {
        dates.push(ymd(d));
        d.setDate(d.getDate() + stepDays);
      }
    } else if (input.recurrence === "monthly") {
      dates = monthlyDates(input.receivedDate, FUTURE_MONTHS_HORIZON);
    } else if (input.recurrence === "yearly") {
      dates = yearlyDates(input.receivedDate, FUTURE_MONTHS_HORIZON);
    }
    if (dates && dates.length > 0) {
      const baseNotes = (input.notes ?? "").trim();
      const stampedNotes = baseNotes ? `${baseNotes}\n[Expanded]` : "[Expanded]";
      let parent: Income | null = null;
      const created: Income[] = [];
      for (let i = 0; i < dates.length; i++) {
        const isFirst = i === 0;
        const inc = await insertSingle({
          ...input,
          receivedDate: dates[i],
          status: dates[i] > today ? "pending" : input.status,
          recurrence: isFirst ? input.recurrence : "once",
          parentId: isFirst ? input.parentId : (parent?.id ?? null),
          notes: isFirst ? stampedNotes : input.notes,
        });
        if (!inc) continue;
        if (isFirst) parent = inc;
        created.push(inc);
      }
      if (created.length > 0) {
        financeSetState("useIncomes", "optimistic recurring incomes", { rows: created.length });
        setIncomes((prev) => [...created, ...prev]);
      }
      return parent;
    }
    const inc = await insertSingle(input);
    if (inc) {
      financeSetState("useIncomes", "optimistic income insert", { rows: 1 });
      setIncomes((prev) => [inc, ...prev]);
    }
    return inc;
  }, [dataOwnerId, insertSingle]);

  const updateIncome = useCallback(async (id: string, patch: Partial<Income>) => {
    assertWritable();
    const updatePayload: any = {};
    if (patch.description !== undefined) updatePayload.description = patch.description;
    if (patch.amount !== undefined) updatePayload.amount = patch.amount;
    if (patch.category !== undefined) updatePayload.category = displayIncomeCategory(patch.category);
    if (patch.clientId !== undefined) updatePayload.client_id = patch.clientId;
    if (patch.source !== undefined) updatePayload.source = patch.source;
    if (patch.paymentMethodId !== undefined) updatePayload.payment_method_id = patch.paymentMethodId;
    if (patch.receivedDate !== undefined) updatePayload.received_date = patch.receivedDate;
    if (patch.actualReceivedDate !== undefined) updatePayload.actual_received_date = patch.actualReceivedDate;
    if (patch.status !== undefined) updatePayload.status = patch.status;
    if (patch.notes !== undefined) updatePayload.notes = patch.notes;
    if (patch.recurrence !== undefined) updatePayload.recurrence = patch.recurrence;

    financeSetState("useIncomes", "optimistic income update", { id });
    setIncomes((arr) => arr.map((i) => i.id === id ? { ...i, ...patch, category: patch.category !== undefined ? displayIncomeCategory(patch.category) : i.category } : i));
    await supabase.from("incomes" as any).update(updatePayload).eq("id", id);
  }, []);

  const deleteIncome = useCallback(async (id: string, scope: "single" | "pending" | "all" = "single") => {
    assertWritable();
    const target = incomes.find((i) => i.id === id);
    const rootId = target?.parentId ?? id;

    if (scope === "single") {
      financeSetState("useIncomes", "optimistic income delete", { id, scope });
      setIncomes((arr) => arr.filter((i) => i.id !== id));
      await supabase.from("incomes" as any).delete().eq("id", id);
      return;
    }

    // Coletar IDs da série (raiz + filhos)
    const seriesIds = incomes
      .filter((i) => i.id === rootId || i.parentId === rootId)
      .filter((i) => scope === "all" ? true : i.status !== "received")
      .map((i) => i.id);

    if (seriesIds.length === 0) return;
    financeSetState("useIncomes", "optimistic income series delete", { rows: seriesIds.length, scope });
    setIncomes((arr) => arr.filter((i) => !seriesIds.includes(i.id)));
    await supabase.from("incomes" as any).delete().in("id", seriesIds);
  }, [incomes]);

  const duplicateIncome = useCallback(async (id: string) => {
    const src = incomes.find((i) => i.id === id);
    if (!src) return;
    const { id: _, createdAt: __, ...rest } = src;
    await addIncome({ ...rest, status: "pending", receivedDate: todayInAppTz() });
  }, [incomes, addIncome]);

  const markReceived = useCallback(async (id: string) => {
    const today = todayInAppTz();
    const target = incomes.find((i) => i.id === id);
    if (target) {
      // Evita colisão: se já existe outra ocorrência da mesma série em "hoje",
      // não força actualReceivedDate=hoje (mantém a data original como real).
      const root = target.parentId || target.id;
      const collision = incomes.find((other) =>
        other.id !== target.id &&
        (other.parentId || other.id) === root &&
        ((other.status === "received" ? (other.actualReceivedDate || other.receivedDate) : other.receivedDate) === today)
      );
      if (collision) {
        await updateIncome(id, { status: "received", actualReceivedDate: target.receivedDate });
        return;
      }
    }
    const patch: Partial<Income> = { status: "received", actualReceivedDate: today };
    await updateIncome(id, patch);
  }, [incomes, updateIncome]);

  const payIncomePartial = useCallback(async (
    id: string,
    amount: number,
    payDate?: string,
  ): Promise<boolean> => {
    assertWritable();
    if (!dataOwnerId) return false;
    const income = incomes.find((i) => i.id === id);
    if (!income || income.status === "received") return false;

    const value = round2(amount);
    if (!(value > 0)) {
      toast.error("Informe um valor de pagamento maior que zero");
      return false;
    }

    const totalAmount = income.amount;
    const month = (income.receivedDate || todayInAppTz()).slice(0, 7);
    const already = totalPartialPaid(income.notes);
    const outstanding = round2(totalAmount - already);

    if (value > outstanding + 0.005) {
      toast.error("Valor acima do saldo pendente", {
        description: `Saldo pendente: R$ ${outstanding.toFixed(2)}`,
      });
      return false;
    }

    const today = payDate || todayInAppTz();
    const closesBalance = value >= outstanding - 0.005;

    if (closesBalance) {
      const isRecurring = !!income.parentId || income.recurrence !== "once";
      const patch: any = {
        status: "received",
        actualReceivedDate: today,
        amount: totalAmount,
      };
      if (!isRecurring) {
        patch.receivedDate = today;
      }
      const cleaned = withoutPartialPayments(income.notes);
      patch.notes = cleaned;
      await updateIncome(id, patch);
      return true;
    }

    const notes = withPartialPayment(income.notes, { month, date: today, amount: value });
    await updateIncome(id, { notes });
    return true;
  }, [incomes, dataOwnerId, updateIncome]);



  // Backfill: para receitas recorrentes antigas que ainda não foram expandidas,
  // gera as ocorrências restantes (semanal/quinzenal no mês; mensal/anual no horizonte futuro).
  const processingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!enabled || !dataOwnerId || incomes.length === 0) return;
    const parents = incomes.filter((i) => {
      if (!(i.recurrence === "weekly" || i.recurrence === "biweekly" || i.recurrence === "monthly" || i.recurrence === "yearly")) return false;
      if (i.parentId) return false;
      if ((i.notes ?? "").includes("[Expanded]")) return false;
      if (processingRef.current.has(i.id)) return false;
      if (globalRecurringBackfillLocks.has(recurringBackfillLockKey(dataOwnerId, i.id))) {
        processingRef.current.add(i.id);
        return false;
      }
      return true;
    });
    if (parents.length === 0) return;
    const lockedParents = parents.filter((p) => {
      const lockKey = recurringBackfillLockKey(dataOwnerId, p.id);
      if (globalRecurringBackfillLocks.has(lockKey)) return false;
      globalRecurringBackfillLocks.add(lockKey);
      processingRef.current.add(p.id);
      return true;
    });
    if (lockedParents.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        assertWritable();
        for (const p of lockedParents) {
          if (cancelled) return;
          // 1) Marca o pai como [Expanded] ANTES de inserir filhos para fechar a janela de corrida.
          // Evita UPDATE repetido caso o registro já tenha chegado marcado por realtime/refetch.
          if (!((p.notes ?? "").includes("[Expanded]"))) {
            const baseNotes = (p.notes ?? "").trim();
            const stamped = baseNotes ? `${baseNotes}\n[Expanded]` : "[Expanded]";
            await supabase.from("incomes" as any).update({ notes: stamped }).eq("id", p.id);
          }

          const today = todayInAppTz();
          let allDates: string[] = [];
          if (p.recurrence === "weekly" || p.recurrence === "biweekly") {
            const stepDays = p.recurrence === "weekly" ? 7 : 14;
            const base = new Date(p.receivedDate + "T00:00:00");
            const horizonEnd = new Date();
            horizonEnd.setMonth(horizonEnd.getMonth() + FUTURE_MONTHS_HORIZON + 1, 0);
            const d = new Date(base);
            while (d <= horizonEnd) {
              allDates.push(ymd(d));
              d.setDate(d.getDate() + stepDays);
            }
          } else if (p.recurrence === "monthly") {
            allDates = monthlyDates(p.receivedDate, FUTURE_MONTHS_HORIZON);
          } else if (p.recurrence === "yearly") {
            allDates = yearlyDates(p.receivedDate, FUTURE_MONTHS_HORIZON);
          }
          const childDates = allDates.filter((dt) => dt !== p.receivedDate);

          // 2) Busca filhos já existentes direto do banco para evitar duplicatas em concorrência.
          const { data: existingRows } = await supabase
            .from("incomes" as any)
            .select("received_date")
            .eq("parent_id", p.id);
          const existingDates = new Set(((existingRows as any[]) ?? []).map((r) => r.received_date));

          for (const dt of childDates) {
            if (existingDates.has(dt)) continue;
            await insertSingle({
              description: p.description,
              amount: p.amount,
              category: p.category,
              clientId: p.clientId,
              source: p.source,
              paymentMethodId: p.paymentMethodId,
              receivedDate: dt,
              status: dt > today ? "pending" : p.status,
              notes: p.notes,
              recurrence: "once",
              parentId: p.id,
            });
            existingDates.add(dt);
          }
        }
        if (!cancelled) fetch();
      } finally {
        lockedParents.forEach((p) => {
          globalRecurringBackfillLocks.delete(recurringBackfillLockKey(dataOwnerId, p.id));
        });
      }
    })();
    return () => { cancelled = true; };
  }, [incomes, enabled, dataOwnerId, insertSingle, fetch]);

  return { incomes, loading, addIncome, updateIncome, deleteIncome, duplicateIncome, markReceived, payIncomePartial, refetch: fetch };
}
