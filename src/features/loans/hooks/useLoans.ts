import { useState, useCallback, useEffect, useId, useRef } from "react";
import { onAppUIEvent } from "@/lib/appUIEvents";
import { useQueryClient } from "@tanstack/react-query";
import {
  DASHBOARD_LOAN_TOTALS_QUERY_ROOT,
  DASHBOARD_LOAN_BY_LOAN_QUERY_ROOT,
} from "@/services/dashboardLoanTotals";
import { todayInAppTz } from "@/lib/timezone";

import { Loan, Payment, InstallmentSchedule, PaymentSplit } from "@/types/loan";
import { adjustBalance, adjustBalanceOffline } from "@/features/financial/lib/balance";
import { recordLedger, removeLedgerByRef, paymentLedgerExists } from "@/features/financial/lib/ledger";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { getLoanLateFees } from "@/features/loans/lib/loanLateFees";
import { notifyRemoteUpdate } from "@/lib/realtimeToast";
import {
  cacheRows, getCachedRows, upsertCachedRow, removeCachedRow,
  enqueueMutation, rewritePendingRecordId,
} from "@/lib/offline/sync";
import { isOnline } from "@/lib/offline/status";
import { assertWritable } from "@/lib/readOnlyState";
import { computeInstallmentInterest, allocateInterestByPayment, allocatePartialProrata, ALLOCATION_VERSION_REMAINING_PRORATA } from "@/features/financial/lib/interestAllocation";
import { buildPaymentAllocationMetadata, withAllocation, lateFeeAllocationMetadata, interestCycleAllocationMetadata, amortizationAllocationMetadata } from "@/features/loans/lib/paymentAllocationMetadata";
import { buildPaymentLedgerRows } from "@/features/loans/lib/paymentLedgerRows";

async function resolveWalletKind(paymentMethodId: string | null): Promise<"account" | "cash"> {
  if (!paymentMethodId) return "account";
  const { data } = await supabase
    .from("payment_methods" as any)
    .select("kind")
    .eq("id", paymentMethodId)
    .maybeSingle();
  const k = (data as any)?.kind;
  return k === "cash" ? "cash" : "account";
}

function rowToLoan(l: any): Loan {
  let paymentSplit: PaymentSplit | null = null;
  const rawSplit = l.payment_method_split;
  if (rawSplit && Array.isArray(rawSplit.parts)) {
    const parts = rawSplit.parts
      .filter((p: any) => p && Number(p.amount) > 0)
      .map((p: any) => ({ paymentMethodId: p.payment_method_id ?? p.paymentMethodId ?? null, amount: Number(p.amount) }));
    if (parts.length >= 2) paymentSplit = { parts };
  }
  return {
    id: l.id, borrowerName: l.borrower_name, borrowerId: l.borrower_id,
    amount: Number(l.amount),
    originalAmount: l.original_amount != null ? Number(l.original_amount) : Number(l.amount),
    interestRate: Number(l.interest_rate),
    interestType: l.interest_type, paymentType: l.payment_type,
    startDate: l.start_date, dueDate: l.due_date, originalDueDate: l.original_due_date ?? l.due_date, installments: l.installments,
    paidInstallments: l.paid_installments, status: l.status as Loan["status"],
    remainingAmount: l.remaining_amount != null ? Number(l.remaining_amount) : undefined,
    customInstallmentValue: l.custom_installment_value != null ? Number(l.custom_installment_value) : null,
    customInterestValue: l.custom_interest_value != null ? Number(l.custom_interest_value) : null,
    tags: l.tags, notes: l.notes, createdAt: l.created_at,
    lateInterestType: l.late_interest_type, lateInterestValue: l.late_interest_value != null ? Number(l.late_interest_value) : null,
    penaltyValue: l.penalty_value != null ? Number(l.penalty_value) : null,
    hasManager: l.has_manager ?? false,
    managerId: l.manager_id ?? null,
    managerCommissionRate: l.manager_commission_rate != null ? Number(l.manager_commission_rate) : 10,
    autoBillingEnabled: l.auto_billing_enabled ?? true,
    renegotiationPenaltyTotal: l.renegotiation_penalty_total != null ? Number(l.renegotiation_penalty_total) : 0,
    isSale: l.is_sale ?? false,
    paymentSplit,
  };
}

function rowToPayment(p: any): Payment {
  return {
    id: p.id, loanId: p.loan_id, amount: Number(p.amount), date: p.date,
    installmentNumber: p.installment_number, previousDueDate: p.previous_due_date,
    paymentMethodId: p.payment_method_id ?? null,
    metadata: p.metadata ?? null,
    createdAt: p.created_at ?? undefined,
  };
}

/**
 * Validates a payment split (must have 2 parts whose amounts sum to expected total).
 * Returns the normalized split or null if invalid/empty.
 */
function normalizeSplit(split: PaymentSplit | null | undefined, expectedTotal: number): PaymentSplit | null {
  if (!split || !Array.isArray(split.parts) || split.parts.length < 2) return null;
  const parts = split.parts.filter((p) => p && Number(p.amount) > 0);
  if (parts.length < 2) return null;
  const sum = parts.reduce((acc, p) => acc + Number(p.amount), 0);
  if (Math.abs(sum - expectedTotal) > 0.02) return null;
  return { parts: parts.map((p) => ({ paymentMethodId: p.paymentMethodId ?? null, amount: Number(p.amount) })) };
}

/**
 * Builds metadata object including split info if provided. Preserves existing metadata.
 */
function withSplit(base: Record<string, any> | null | undefined, split: PaymentSplit | null): Record<string, any> | undefined {
  if (!split) return base ?? undefined;
  return { ...(base ?? {}), split };
}

export function getOpenInstallmentAmountForLoan(loan: Loan, schedules: InstallmentSchedule[], installmentNumber: number): number {
  const schedule = schedules.find((s) => s.loanId === loan.id && s.installmentNumber === installmentNumber);
  const fallbackFullInstallment = loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, loan.installments);
  if (installmentNumber !== loan.paidInstallments + 1) {
    return schedule?.amount ?? fallbackFullInstallment;
  }
  const fullInstallment = schedule?.amount ?? fallbackFullInstallment;
  // Desconta pagamentos parciais já feitos na parcela atual (saldo do contrato menor
  // que o esperado pelas parcelas em aberto = restou só o residual desta parcela).
  if (loan.remainingAmount != null && loan.remainingAmount >= 0) {
    const futureSum = schedules
      .filter((s) => s.loanId === loan.id && s.installmentNumber > installmentNumber)
      .reduce((sum, s) => sum + Number(s.amount || 0), 0);
    if (schedule) {
      return Math.min(Number(fullInstallment), Math.max(0, Number(loan.remainingAmount) - futureSum));
    }
    // Sem cronograma persistido: assume parcelas futuras com valor cheio.
    const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
    const expectedFutureFull = fullInstallment * (remainingInstallments - 1);
    const currentBalance = Math.max(0, Number(loan.remainingAmount) - expectedFutureFull);
    return Math.min(Number(fullInstallment), currentBalance);
  }
  return Number(fullInstallment);
}

async function applyPaymentBalance(amount: number, paymentMethodId: string | null, split: PaymentSplit | null, multiplier = 1) {
  if (split?.parts?.length) {
    for (const part of split.parts) {
      const wallet = await resolveWalletKind(part.paymentMethodId ?? null);
      await adjustBalance((Number(part.amount) || 0) * multiplier, wallet);
    }
    return;
  }
  const wallet = await resolveWalletKind(paymentMethodId);
  await adjustBalance(amount * multiplier, wallet);
}

async function applyPaymentBalanceOffline(amount: number, paymentMethodId: string | null, split: PaymentSplit | null, multiplier = 1) {
  if (split?.parts?.length) {
    for (const part of split.parts) {
      const wallet = await resolveWalletKind(part.paymentMethodId ?? null);
      await adjustBalanceOffline((Number(part.amount) || 0) * multiplier, wallet);
    }
    return;
  }
  const wallet = await resolveWalletKind(paymentMethodId);
  await adjustBalanceOffline(amount * multiplier, wallet);
}

// NOTA: não existe mais criação de extrato de PAGAMENTO no frontend.
// Todos os pagamentos de empréstimo passam por uma RPC transacional
// (`register_loan_payment_atomic` / `register_loan_interest_payment_atomic`),
// que grava payments + loans + account_ledger no mesmo commit.
// As linhas de extrato continuam sendo montadas por `buildPaymentLedgerRows`
// (regra única de split) e enviadas como payload para a RPC.



/** Erro amigável quando a RPC transacional não existe no ambiente. */
const RPC_MISSING_MESSAGE =
  "Não foi possível registrar o pagamento porque a função transacional não está disponível neste ambiente. Atualize o banco de dados e tente novamente.";

function isMissingRpcError(error: any): boolean {
  const msg = String(error?.message || "");
  const code = String((error as any)?.code || "");
  return code === "PGRST202" || /PGRST202|function .* does not exist|could not find the function/i.test(msg);
}

/** Normaliza erros de RPC em mensagens claras (sem fallback não atômico). */
function rpcPaymentError(error: any, context: string): Error {
  if (isMissingRpcError(error)) {
    console.error(`[${context}] RPC transacional ausente:`, error);
    return new Error(RPC_MISSING_MESSAGE);
  }
  console.error(`[${context}] RPC transacional falhou:`, error);
  return new Error(String(error?.message || "Falha ao registrar pagamento"));
}


export function useLoans() {
  const { user, dataOwnerId } = useAuth();
  const instanceId = useId();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [installmentSchedules, setInstallmentSchedules] = useState<InstallmentSchedule[]>([]);

  // Invalidação do cache da RPC financeira V3 sempre que pagamentos ou contratos
  // mudam (inclusive via realtime). Sem isso os cards do Dashboard ficavam com
  // dados antigos por até 60s (staleTime) depois de um pagamento, o que também
  // provocava falso halt de paridade RPC × legado.
  const queryClient = useQueryClient();
  const financialSignature = `${payments.length}:${loans.length}:${
    payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0).toFixed(2)
  }:${loans.reduce((sum, l) => sum + (Number(l.remainingAmount) || 0), 0).toFixed(2)}`;

  const lastSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastSignatureRef.current === null) {
      lastSignatureRef.current = financialSignature;
      return;
    }
    if (lastSignatureRef.current === financialSignature) return;
    lastSignatureRef.current = financialSignature;
    queryClient.invalidateQueries({ queryKey: [DASHBOARD_LOAN_TOTALS_QUERY_ROOT] });
    queryClient.invalidateQueries({ queryKey: [DASHBOARD_LOAN_BY_LOAN_QUERY_ROOT] });
  }, [financialSignature, queryClient]);


  const fetchLoans = useCallback(async () => {
    if (!user) return;
    if (isOnline()) {
      const { data, error } = await supabase
        .from("loans").select("id, user_id, borrower_name, borrower_id, amount, original_amount, interest_rate, interest_type, payment_type, start_date, due_date, original_due_date, installments, paid_installments, status, remaining_amount, custom_installment_value, custom_interest_value, tags, notes, created_at, late_interest_type, late_interest_value, penalty_value, has_manager, manager_id, manager_commission_rate, auto_billing_enabled, renegotiation_penalty_total, is_sale, payment_method_split")
        .order("created_at", { ascending: false })
        .limit(10000); // safety cap — paginação por página será adicionada com UI de "carregar mais"
      if (!error && data) {
        setLoans(data.map(rowToLoan));
        cacheRows("loans", data).catch(() => { /* noop */ });
        return;
      }
    }
    const cached = await getCachedRows("loans", user.id);
    if (cached.length > 0) {
      setLoans(cached
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .map(rowToLoan));
    }
  }, [user]);

  const fetchPayments = useCallback(async () => {
    if (!user) return;
    if (isOnline()) {
      const { data, error } = await supabase
        .from("payments").select("id, user_id, loan_id, amount, date, installment_number, previous_due_date, payment_method_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(50000); // safety cap
      if (!error && data) {
        setPayments(data.map(rowToPayment));
        cacheRows("payments", data).catch(() => { /* noop */ });
        return;
      }
    }
    const cached = await getCachedRows("payments", user.id);
    if (cached.length > 0) {
      setPayments(cached
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .map(rowToPayment));
    }
  }, [user]);

  const fetchSchedules = useCallback(async () => {
    if (!user) return;
    if (isOnline()) {
      const { data, error } = await supabase
        .from("loan_installments").select("id, user_id, loan_id, installment_number, due_date, amount")
        .order("installment_number", { ascending: true })
        .limit(10000); // safety cap
      if (!error && data) {
        setInstallmentSchedules(data.map((s: any) => ({
          id: s.id, loanId: s.loan_id, installmentNumber: s.installment_number,
          dueDate: s.due_date, amount: Number(s.amount),
        })));
        cacheRows("loan_installments", data).catch(() => { /* noop */ });
        return;
      }
    }
    const cached = await getCachedRows("loan_installments", user.id);
    if (cached.length > 0) {
      setInstallmentSchedules(cached.map((s: any) => ({
        id: s.id, loanId: s.loan_id, installmentNumber: s.installment_number,
        dueDate: s.due_date, amount: Number(s.amount),
      })));
    }
  }, [user]);

  useEffect(() => {
    fetchLoans();
    fetchPayments();
    fetchSchedules();

    return onAppUIEvent("METAS_RELOAD", () => {
      fetchLoans();
      fetchPayments();
      fetchSchedules();
    });
  }, [fetchLoans, fetchPayments, fetchSchedules]);

  // Refetch after offline queue flush
  useEffect(() => {
    const handler = (e: any) => {
      const tables: string[] = e.detail?.tables || [];
      if (tables.includes("loans")) fetchLoans();
      if (tables.includes("payments")) fetchPayments();
      if (tables.includes("loan_installments")) fetchSchedules();
    };
    window.addEventListener("offline-sync:flushed", handler);
    return () => window.removeEventListener("offline-sync:flushed", handler);
  }, [fetchLoans, fetchPayments, fetchSchedules]);

  // Realtime subscriptions com patch local (evita SELECT completo por evento — P0 egress)
  useEffect(() => {
    if (!user) return;
    const ownerId = dataOwnerId ?? user.id;
    const safe = <T,>(fn: () => T, fallback: () => void) => {
      try { fn(); } catch (e) { console.warn("[useLoans realtime patch failed, refetching]", e); fallback(); }
    };
    const channel = supabase
      .channel(`loans:${ownerId}:${instanceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'loans', filter: `user_id=eq.${ownerId}` }, (payload) => {
        safe(() => setLoans((prev) => {
          const row = rowToLoan(payload.new as any);
          if (prev.some((l) => l.id === row.id)) return prev;
          return [row, ...prev];
        }), fetchLoans);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'loans', filter: `user_id=eq.${ownerId}` }, (payload) => {
        safe(() => setLoans((prev) => prev.map((l) => l.id === (payload.new as any).id ? rowToLoan(payload.new as any) : l)), fetchLoans);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'loans' }, (payload) => {
        safe(() => setLoans((prev) => prev.filter((l) => l.id !== (payload.old as any).id)), fetchLoans);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, (payload) => {
        safe(() => setPayments((prev) => {
          const row = rowToPayment(payload.new as any);
          if (prev.some((p) => p.id === row.id)) return prev;
          return [row, ...prev];
        }), fetchPayments);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments' }, (payload) => {
        safe(() => setPayments((prev) => prev.map((p) => p.id === (payload.new as any).id ? rowToPayment(payload.new as any) : p)), fetchPayments);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'payments' }, (payload) => {
        safe(() => setPayments((prev) => prev.filter((p) => p.id !== (payload.old as any).id)), fetchPayments);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'loan_installments' }, (payload) => {
        safe(() => setInstallmentSchedules((prev) => {
          const s: any = payload.new;
          if (prev.some((x) => x.id === s.id)) return prev;
          return [...prev, { id: s.id, loanId: s.loan_id, installmentNumber: s.installment_number, dueDate: s.due_date, amount: Number(s.amount) }];
        }), fetchSchedules);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'loan_installments' }, (payload) => {
        safe(() => setInstallmentSchedules((prev) => prev.map((x) => {
          const s: any = payload.new;
          return x.id === s.id ? { id: s.id, loanId: s.loan_id, installmentNumber: s.installment_number, dueDate: s.due_date, amount: Number(s.amount) } : x;
        })), fetchSchedules);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'loan_installments' }, (payload) => {
        safe(() => setInstallmentSchedules((prev) => prev.filter((x) => x.id !== (payload.old as any).id)), fetchSchedules);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, dataOwnerId, fetchLoans, fetchPayments, fetchSchedules, instanceId]);

  const saveSchedule = useCallback(async (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => {
    assertWritable();
    if (!user || !dataOwnerId) {
      console.warn("[saveSchedule] Skipped: missing user or dataOwnerId", { user: !!user, dataOwnerId });
      throw new Error("Usuário não autenticado");
    }
    const { error: delErr } = await supabase.from("loan_installments").delete().eq("loan_id", loanId);
    if (delErr) {
      console.error("[saveSchedule] delete error", delErr);
      throw delErr;
    }
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("loan_installments").insert(
        rows.map((r) => ({
          user_id: dataOwnerId,
          loan_id: loanId,
          installment_number: r.installmentNumber,
          due_date: r.dueDate,
          amount: r.amount,
        }))
      );
      if (insErr) {
        console.error("[saveSchedule] insert error", insErr);
        throw insErr;
      }
    }
    await fetchSchedules();
  }, [user, dataOwnerId, fetchSchedules]);

  const addLoan = useCallback(async (loan: Omit<Loan, "id"> & { status?: string; paidInstallments?: number; paymentMethodId?: string | null; paymentSplit?: PaymentSplit | null }): Promise<string | null> => {
    assertWritable();
    if (!user || !dataOwnerId) return null;

    // Check loan limit based on subscription plan
    const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;
    const subEnv = clientToken?.startsWith("test_") ? "sandbox" : "live";
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("product_id, status")
      .eq("user_id", user.id)
      .eq("environment", subEnv)
      .maybeSingle();

    const PLAN_MAX_LOANS: Record<string, number> = {
      basico_plan: 50,
      profissional_plan: 200,
      empresarial_plan: 9999,
    };

    const isSubActive = sub && ["active", "trialing"].includes(sub.status);
    const maxLoans = isSubActive ? (PLAN_MAX_LOANS[sub.product_id] || 50) : 5;
    const activeLoansCount = loans.filter(l => l.status === "active").length;

    if (activeLoansCount >= maxLoans) {
      toast.error(
        isSubActive
          ? `Limite de ${maxLoans} empréstimos ativos atingido no seu plano. Faça upgrade para aumentar.`
          : "Limite de empréstimos atingido. Assine um plano para continuar."
      );
      return null;
    }

    const status = (loan.status as Loan["status"]) || "active";
    const tempId = crypto.randomUUID();
    const optimistic: Loan = {
      ...loan, id: tempId, status, paidInstallments: loan.paidInstallments ?? 0,
      createdAt: new Date().toISOString(),
    };
    setLoans((prev) => [optimistic, ...prev]);

    const normalizedDisbSplit = normalizeSplit(loan.paymentSplit ?? null, loan.amount);
    const insertPayload = {
      id: tempId,
      user_id: dataOwnerId, borrower_name: loan.borrowerName, borrower_id: loan.borrowerId,
      amount: loan.amount, interest_rate: loan.interestRate,
      interest_type: loan.interestType || "Mensal", payment_type: loan.paymentType || "Parcelado",
      start_date: loan.startDate, due_date: loan.dueDate, original_due_date: loan.dueDate, installments: loan.installments,
      paid_installments: loan.paidInstallments ?? 0, status, tags: loan.tags,
      notes: loan.notes != null ? String(loan.notes) : null,
      remaining_amount: loan.remainingAmount ?? 0,
      custom_interest_value: loan.customInterestValue ?? null,
      has_manager: loan.hasManager ?? false,
      manager_id: loan.managerId ?? null,
      manager_commission_rate: loan.managerCommissionRate ?? 10,
      is_sale: loan.isSale ?? false,
      payment_method_split: normalizedDisbSplit
        ? { parts: normalizedDisbSplit.parts.map((p) => ({ payment_method_id: p.paymentMethodId, amount: p.amount })) }
        : null,
    };

    await upsertCachedRow("loans", { ...insertPayload, created_at: optimistic.createdAt });

    if (!isOnline()) {
      await enqueueMutation({ table: "loans", op: "insert", recordId: tempId, payload: insertPayload });
      // Balance adjust will sync next time online via realtime/refresh; skip here
      return tempId;
    }

    const { data, error } = await supabase.from("loans").insert(insertPayload as any).select().single();

    if (error) {
      if (!error.message.toLowerCase().includes("row-level")) {
        await enqueueMutation({ table: "loans", op: "insert", recordId: tempId, payload: insertPayload });
        return tempId;
      }
      setLoans((prev) => prev.filter((l) => l.id !== tempId));
      await removeCachedRow("loans", tempId);
      return null;
    } else if (data) {
      setLoans((prev) => prev.map((l) => l.id === tempId ? { ...l, id: data.id, createdAt: data.created_at } : l));
      await removeCachedRow("loans", tempId);
      await upsertCachedRow("loans", data);
      await rewritePendingRecordId("loans", tempId, data.id);

      // Helper: outflow ledger entries (one per split part, or one combined)
      const recordDisbursement = async () => {
        if (normalizedDisbSplit) {
          const parts = normalizedDisbSplit.parts;
          const failures: number[] = [];
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            try {
              await recordLedger({
                direction: "out", category: "loan", amount: Number(part.amount),
                description: `Empréstimo concedido - ${loan.borrowerName}`,
                occurred_on: loan.startDate, loan_id: data.id, source: "auto", syncBalance: false,
                payment_method_id: part.paymentMethodId ?? null,
                metadata: {
                  borrower_name: loan.borrowerName,
                  split_part: true,
                  split_index: i,
                  split_count: parts.length,
                  total_amount: loan.amount,
                },
              });
            } catch (e) {
              console.error(`[recordDisbursement] part ${i + 1}/${parts.length} failed`, e);
              failures.push(i);
            }
          }
          if (failures.length > 0) {
            // Retry once after a short delay to mitigate transient errors
            await new Promise((r) => setTimeout(r, 250));
            for (const i of failures) {
              const part = parts[i];
              try {
                await recordLedger({
                  direction: "out", category: "loan", amount: Number(part.amount),
                  description: `Empréstimo concedido - ${loan.borrowerName}`,
                  occurred_on: loan.startDate, loan_id: data.id, source: "auto", syncBalance: false,
                  payment_method_id: part.paymentMethodId ?? null,
                  metadata: {
                    borrower_name: loan.borrowerName,
                    split_part: true,
                    split_index: i,
                    split_count: parts.length,
                    total_amount: loan.amount,
                    retry: true,
                  },
                });
              } catch (e) {
                console.error(`[recordDisbursement] retry of part ${i + 1}/${parts.length} failed`, e);
              }
            }
          }
        } else {
          await recordLedger({
            direction: "out", category: "loan", amount: loan.amount,
            description: `Empréstimo concedido - ${loan.borrowerName}`,
            occurred_on: loan.startDate, loan_id: data.id, source: "auto", syncBalance: false,
            payment_method_id: loan.paymentMethodId ?? null,
            metadata: { borrower_name: loan.borrowerName },
          });
        }
      };

      if (status === "paid") {
        const totalReceived = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
        // Net effect goes to selected wallet (out principal + in totalReceived)
        await applyPaymentBalance(loan.amount, loan.paymentMethodId ?? null, normalizedDisbSplit, -1);
        const wallet = await resolveWalletKind(loan.paymentMethodId ?? null);
        await adjustBalance(totalReceived, wallet);
        await recordDisbursement();
          await recordLedger({
            direction: "in", category: "payment", amount: totalReceived,
            description: `Empréstimo quitado na criação - ${loan.borrowerName}`,
            occurred_on: loan.startDate, loan_id: data.id, source: "auto", syncBalance: false,
            payment_method_id: loan.paymentMethodId ?? null,
            metadata: { borrower_name: loan.borrowerName },
          });
      } else {
        await applyPaymentBalance(loan.amount, loan.paymentMethodId ?? null, normalizedDisbSplit, -1);
        await recordDisbursement();
      }
      return data.id;
    }
    return null;
  }, [user, dataOwnerId]);

  const addPayment = useCallback(async (loanId: string, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => {
    assertWritable();
    if (!user || !dataOwnerId) throw new Error("Sessão ainda não carregada");
    const dateStr = paymentDate || todayInAppTz();
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");

    const remaining = getLoanRemainingAmount(loan, payments);
    const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
    const calculatedInstallment = remaining / remainingInstallments;
    const newPaid = loan.paidInstallments + 1;
    // Prioriza o valor da parcela atual no cronograma (cobre renegociações,
    // parcelas customizadas e fluxos com valores variáveis por parcela).
    const currentSchedule = installmentSchedules.find(
      (s) => s.loanId === loanId && s.installmentNumber === newPaid,
    );
    let installmentAmount = getOpenInstallmentAmountForLoan(loan, installmentSchedules, newPaid) || (
      currentSchedule?.amount != null && currentSchedule.amount > 0
        ? currentSchedule.amount
        : (loan.customInstallmentValue != null && loan.customInstallmentValue > 0
          ? loan.customInstallmentValue
          : calculatedInstallment)
    );
    // Última parcela: usar o saldo restante para evitar centavos pendurados
    if (newPaid >= loan.installments) {
      installmentAmount = remaining;
    }
    const newRemaining = Math.max(0, remaining - installmentAmount);
    const online = isOnline();

    // Calculate next due date from schedule or by frequency
    let nextDueDate = loan.dueDate;
    if (newPaid < loan.installments) {
      const fromSchedule = installmentSchedules.find(
        (s) => s.loanId === loanId && s.installmentNumber === newPaid + 1,
      );
      if (fromSchedule?.dueDate) {
        nextDueDate = fromSchedule.dueDate;
      } else if (online) {
        const { data: nextSchedule } = await supabase
          .from("loan_installments")
          .select("due_date")
          .eq("loan_id", loanId)
          .eq("installment_number", newPaid + 1)
          .maybeSingle();
        if (nextSchedule?.due_date) {
          nextDueDate = nextSchedule.due_date;
        } else {
          nextDueDate = computeNextDueDate(loan.dueDate, loan.interestType || "Mensal", 1);
        }
      } else {
        nextDueDate = computeNextDueDate(loan.dueDate, loan.interestType || "Mensal", 1);
      }
    }

    const newStatus = newPaid >= loan.installments ? "paid" : loan.status;
    const tempPaymentId = crypto.randomUUID();
    const normalizedSplit = normalizeSplit(paymentSplit ?? null, installmentAmount);
    // ETAPA 4.15 — persiste a alocação oficial (mesma que o leitor derivaria).
    const allocationMeta = buildPaymentAllocationMetadata({
      loan: loan as any,
      priorPayments: payments as any,
      payment: { id: tempPaymentId, loanId, amount: installmentAmount, date: dateStr, installmentNumber: newPaid } as any,
      isPayoff: newPaid >= loan.installments,
    });
    const splitMetadata = withAllocation(withSplit(null, normalizedSplit), allocationMeta);
    const paymentPayload: any = {
      id: tempPaymentId,
      user_id: dataOwnerId,
      loan_id: loanId,
      amount: installmentAmount,
      date: dateStr,
      installment_number: newPaid,
      payment_method_id: paymentMethodId ?? null,
    };
    if (splitMetadata) paymentPayload.metadata = splitMetadata;
    const loanUpdate = {
      paid_installments: newPaid,
      status: newStatus,
      remaining_amount: newRemaining,
      due_date: nextDueDate,
    };

    // Optimistic state
    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount: installmentAmount, date: dateStr, installmentNumber: newPaid, paymentMethodId: paymentMethodId ?? null, metadata: (splitMetadata as any) ?? null },
      ...prev,
    ]);
    setLoans((prev) => prev.map((l) => l.id === loanId ? {
      ...l, paidInstallments: newPaid, status: newStatus as Loan["status"],
      remainingAmount: newRemaining, dueDate: nextDueDate,
    } : l));
    await upsertCachedRow("payments", { ...paymentPayload, created_at: new Date().toISOString() });

    if (!online) {
      await enqueueMutation({ table: "payments", op: "insert", recordId: tempPaymentId, payload: paymentPayload });
      await enqueueMutation({ table: "loans", op: "update", recordId: loanId, payload: loanUpdate });
      await applyPaymentBalanceOffline(installmentAmount, paymentMethodId ?? null, normalizedSplit);
      return;
    }

    const revertOptimisticState = async () => {
      setPayments((prev) => prev.filter((p) => p.id !== tempPaymentId));
      setLoans((prev) => prev.map((l) => l.id === loanId ? loan : l));
      await removeCachedRow("payments", tempPaymentId);
    };

    // Atomic insert payment + update loan (single transaction, FOR UPDATE lock
    // on the loan row + optimistic concurrency check on paid_installments).
    // Falls back to the legacy dual-write if the RPC is not yet deployed.
    const { error: atomicError } = await supabase.rpc("register_loan_payment_atomic" as any, {
      p_loan_id: loanId,
      p_user_id: dataOwnerId,
      p_payment_id: tempPaymentId,
      p_amount: installmentAmount,
      p_payment_date: dateStr,
      p_installment_number: newPaid,
      p_payment_method_id: paymentMethodId ?? null,
      p_metadata: splitMetadata ?? null,
      p_expected_paid_installments: loan.paidInstallments,
      p_new_paid_installments: newPaid,
      p_new_status: newStatus,
      p_new_remaining_amount: newRemaining,
      p_new_due_date: nextDueDate,
    });

    // Pagamento + contrato + extrato são criados pela RPC transacional.
    if (atomicError) {
      await revertOptimisticState();
      throw rpcPaymentError(atomicError, "addPayment");
    }


    try {
      await applyPaymentBalance(installmentAmount, paymentMethodId ?? null, normalizedSplit);
      // Aloca a fração de juros/principal desta parcela pró-rata (contratos
      // parcelados) ou 100% juros no excedente (parcela única).
      const priorInterest = payments
        .filter((p) => p.loanId === loanId && p.installmentNumber >= 1 && p.installmentNumber < newPaid)
        .reduce((s, p) => {
          const parcelAmt = Number(p.amount) || 0;
          const { interestPart } = computeInstallmentInterest({
            principal: loan.amount,
            rate: loan.interestRate,
            installments: loan.installments,
            installmentAmount: parcelAmt,
            installmentNumber: p.installmentNumber,
            priorInterestAllocated: s,
          });
          return s + interestPart;
        }, 0);
      const { interestPart, principalPart } = computeInstallmentInterest({
        principal: loan.amount,
        rate: loan.interestRate,
        installments: loan.installments,
        installmentAmount,
        installmentNumber: newPaid,
        priorInterestAllocated: priorInterest,
      });
      void interestPart; void principalPart; // alocação persistida em metadata pela RPC

    } catch (balanceError: any) {
      console.error("[addPayment] adjust balance failed:", balanceError);
      await Promise.all([
        supabase.from("payments").delete().eq("id", tempPaymentId),
        supabase.from("loans").update({
          paid_installments: loan.paidInstallments,
          status: loan.status,
          remaining_amount: loan.remainingAmount ?? 0,
          due_date: loan.dueDate,
        }).eq("id", loanId),
      ]);
      await revertOptimisticState();
      throw new Error(balanceError?.message ?? "Falha ao atualizar saldo");
    }

    await fetchPayments();
    await fetchLoans();
  }, [user, dataOwnerId, loans, payments, installmentSchedules, fetchLoans, fetchPayments]);

  const addPartialPayment = useCallback(async (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => {
    assertWritable();
    if (!user || !dataOwnerId) throw new Error("Sessão ainda não carregada");
    if (amount <= 0) throw new Error("Informe um valor de pagamento válido");
    const dateStr = paymentDate || todayInAppTz();
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    // Aplica pagamento primeiro sobre o saldo base (principal + juros contratuais);
    // o excedente abate a multa/penalidade em aberto (loan.penaltyValue) para que
    // pagamentos maiores que o saldo base não sejam silenciosamente descartados.
    const currentBase = getLoanRemainingAmount(loan, payments);
    const appliedToBase = Math.min(currentBase, amount);
    const newRemaining = Math.max(0, currentBase - appliedToBase);
    let overflow = amount - appliedToBase;
    const currentPenalty = Number(loan.penaltyValue ?? 0);
    const appliedToPenalty = Math.min(Math.max(0, currentPenalty), Math.max(0, overflow));
    overflow -= appliedToPenalty;
    const newPenalty = Math.max(0, currentPenalty - appliedToPenalty);
    const penaltyChanged = appliedToPenalty > 0;
    const online = isOnline();

    const tempPaymentId = crypto.randomUUID();
    const normalizedSplit = normalizeSplit(paymentSplit ?? null, amount);

    // ── FLAG DE ROLLBACK ─────────────────────────────────────────────────
    // `VITE_ENABLE_REMAINING_BALANCE_PRORATA` (default: true) controla se
    // NOVOS pagamentos parciais nascem com a regra proporcional. Se
    // desligada em produção, novos parciais voltam à regra legada — mas
    // pagamentos já criados com a versão nova permanecem com seus valores
    // persistidos definitivos (a leitura em `interestAllocation.ts` sempre
    // honra `metadata.interest_amount`/`principal_amount`).
    const PRORATA_ENABLED =
      String((import.meta as any)?.env?.VITE_ENABLE_REMAINING_BALANCE_PRORATA ?? "true")
        .toLowerCase() !== "false";

    // Nova regra proporcional para pagamentos parciais — calcula juros/principal
    // pelos SALDOS remanescentes do contrato no momento do pagamento (não mais
    // "juros primeiro"). Só se aplica ao valor efetivamente abatido do saldo
    // base (principal + juros contratuais); a parte que abate multa/penalidade
    // (`overflow`/`appliedToPenalty`) NÃO gera juros contratuais.
    let allocationMetadata: Record<string, any> | null = null;
    let partialInterest = 0;
    let partialPrincipal = 0;

    if (PRORATA_ENABLED) {
      const priorPayments = payments.filter((p) => p.loanId === loanId);
      const priorInterestMap = allocateInterestByPayment([loan] as any, priorPayments as any);
      const priorInterestPaid = priorPayments.reduce(
        (s, p) => s + (priorInterestMap.get(p.id) ?? 0),
        0,
      );
      const priorPrincipalPaid = priorPayments.reduce((s, p) => {
        // Juros avulsos/ciclo (0, -2) não abatem principal; multas idem.
        if (p.installmentNumber === 0 || p.installmentNumber === -2) return s;
        const meta = (p.metadata as any) || {};
        if (meta.kind === "late_fee") return s;
        const int = priorInterestMap.get(p.id) ?? 0;
        return s + Math.max(0, Number(p.amount) - int);
      }, 0);
      const totalContractInterest = Math.max(
        0,
        Math.round(loan.amount * (1 + loan.interestRate / 100)) - loan.amount,
      );
      const interestRemaining = Math.max(0, totalContractInterest - priorInterestPaid);
      const principalRemaining = Math.max(0, loan.amount - priorPrincipalPaid);
      const alloc = allocatePartialProrata({
        amount: appliedToBase,
        interestRemaining,
        principalRemaining,
      });
      partialInterest = alloc.interest;
      partialPrincipal = alloc.principal;

      // Invariantes obrigatórias antes de persistir:
      //  - ambos ≥ 0;
      //  - juros ≤ juros remanescente;
      //  - principal ≤ principal remanescente;
      //  - juros + principal = valor destinado ao contrato (± R$ 0,01).
      // Invariantes obrigatórias antes de persistir:
      //  - ambos ≥ 0;
      //  - juros ≤ juros remanescente;
      //  - principal ≤ principal remanescente;
      //  - juros + principal = valor destinado ao contrato (± R$ 0,05 para amortecedor de arredondamento).
      const sumOk = Math.abs((partialInterest + partialPrincipal) - appliedToBase) <= 0.05;
      const capsOk =
        partialInterest >= -0.05
        && partialPrincipal >= -0.05
        && partialInterest <= interestRemaining + 0.05
        && partialPrincipal <= principalRemaining + 0.05;

      if (!sumOk || !capsOk) {
        console.error("[addPartialPayment] alocação pró-rata violou invariantes — corrigindo centavos", {
          appliedToBase, partialInterest, partialPrincipal, interestRemaining, principalRemaining,
        });
        
        // Ajuste automático de segurança em vez de lançar erro fatal.
        // Se a soma divergir ou houver estouro de centavos, forçamos o juros a respeitar o cap
        // e o principal a absorver a diferença do valor aplicado à base.
        partialInterest = Math.max(0, Math.min(interestRemaining, partialInterest));
        partialPrincipal = Math.max(0, Math.round((appliedToBase - partialInterest) * 100) / 100);
      }

      allocationMetadata = {
        allocation_version: ALLOCATION_VERSION_REMAINING_PRORATA,
        interest_amount: partialInterest,
        principal_amount: partialPrincipal,
      };
    }

    const partialAllocationMeta = buildPaymentAllocationMetadata({
      loan: loan as any,
      priorPayments: payments as any,
      payment: { id: tempPaymentId, loanId, amount, date: dateStr, installmentNumber: -1 } as any,
      override: allocationMetadata ? { interest: partialInterest, principal: Math.max(0, Math.round((amount - partialInterest) * 100) / 100) } : null,
    });
    const splitMetadata = withAllocation(withSplit(null, normalizedSplit), partialAllocationMeta);
    const paymentPayload: any = {
      id: tempPaymentId,
      user_id: dataOwnerId, loan_id: loanId, amount, date: dateStr, installment_number: -1,
      payment_method_id: paymentMethodId ?? null,
    };
    if (splitMetadata) paymentPayload.metadata = splitMetadata;
    const loanUpdate: any = { remaining_amount: newRemaining };
    if (penaltyChanged) loanUpdate.penalty_value = newPenalty;

    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount, date: dateStr, installmentNumber: -1, paymentMethodId: paymentMethodId ?? null, metadata: (splitMetadata as any) ?? null },
      ...prev,
    ]);
    setLoans((prev) => prev.map((l) => l.id === loanId ? { ...l, remainingAmount: newRemaining, ...(penaltyChanged ? { penaltyValue: newPenalty } : {}) } : l));
    await upsertCachedRow("payments", { ...paymentPayload, created_at: new Date().toISOString() });

    if (!online) {
      await enqueueMutation({ table: "payments", op: "insert", recordId: tempPaymentId, payload: paymentPayload });
      await enqueueMutation({ table: "loans", op: "update", recordId: loanId, payload: loanUpdate });
      await applyPaymentBalanceOffline(amount, paymentMethodId ?? null, normalizedSplit);
      return;
    }

    const revertOptimisticState = async () => {
      setPayments((prev) => prev.filter((p) => p.id !== tempPaymentId));
      setLoans((prev) => prev.map((l) => l.id === loanId ? loan : l));
      await removeCachedRow("payments", tempPaymentId);
    };

    // Atomic insert payment + update loan.remaining_amount (FOR UPDATE lock).
    const { error: atomicError } = await supabase.rpc("register_loan_payment_atomic" as any, {
      p_loan_id: loanId,
      p_user_id: dataOwnerId,
      p_payment_id: tempPaymentId,
      p_amount: amount,
      p_payment_date: dateStr,
      p_installment_number: -1,
      p_payment_method_id: paymentMethodId ?? null,
      p_metadata: splitMetadata ?? null,
      p_expected_paid_installments: loan.paidInstallments,
      p_new_paid_installments: loan.paidInstallments,
      p_new_status: loan.status,
      p_new_remaining_amount: newRemaining,
      p_new_due_date: loan.dueDate,
    });

    // Pagamento + contrato + extrato são criados pela RPC transacional.
    if (atomicError) {
      await revertOptimisticState();
      throw rpcPaymentError(atomicError, "addPartialPayment");
    }


    // Persiste a redução da multa (penalty_value) quando o pagamento excedeu o saldo base.
    // A RPC atômica só atualiza remaining_amount, então aplicamos aqui em passo separado.
    if (penaltyChanged) {
      const { error: penaltyError } = await supabase
        .from("loans")
        .update({ penalty_value: newPenalty } as any)
        .eq("id", loanId);
      if (penaltyError) {
        console.error("[addPartialPayment] update penalty_value failed:", penaltyError);
      }
    }

    try {
      await applyPaymentBalance(amount, paymentMethodId ?? null, normalizedSplit);
    } catch (balanceError: any) {
      console.error("[addPartialPayment] adjust balance failed:", balanceError);
      await Promise.all([
        supabase.from("payments").delete().eq("id", tempPaymentId),
        supabase.from("loans").update({ remaining_amount: loan.remainingAmount ?? 0 }).eq("id", loanId),
      ]);
      await revertOptimisticState();
      throw new Error(balanceError?.message ?? "Falha ao atualizar saldo");
    }

    await fetchPayments();
    await fetchLoans();
  }, [user, dataOwnerId, loans, payments, fetchLoans, fetchPayments]);

  const payOffLoan = useCallback(async (loanId: string, paymentDate?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => {
    assertWritable();
    if (!user || !dataOwnerId) throw new Error("Usuário não autenticado");
    const dateStr = paymentDate || todayInAppTz();
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    const remaining = getLoanRemainingAmount(loan, payments);
    if (remaining <= 0 && !(typeof customAmount === "number" && customAmount > 0)) {
      throw new Error("Não há saldo restante para quitar");
    }

    const payAmount = typeof customAmount === "number" && customAmount > 0
      ? customAmount
      : remaining;
    const online = isOnline();

    const tempPaymentId = crypto.randomUUID();
    const normalizedSplit = normalizeSplit(paymentSplit ?? null, payAmount);
    const payoffAllocationMeta = buildPaymentAllocationMetadata({
      loan: loan as any,
      priorPayments: payments as any,
      payment: { id: tempPaymentId, loanId, amount: payAmount, date: dateStr, installmentNumber: loan.installments } as any,
      isPayoff: true,
    });
    const splitMetadata = withAllocation(withSplit(null, normalizedSplit), payoffAllocationMeta);
    const paymentPayload: any = {
      id: tempPaymentId,
      user_id: dataOwnerId, loan_id: loanId, amount: payAmount,
      date: dateStr, installment_number: loan.installments,
      payment_method_id: paymentMethodId ?? null,
    };
    if (splitMetadata) paymentPayload.metadata = splitMetadata;
    const loanUpdate = {
      paid_installments: loan.installments,
      status: "paid",
      remaining_amount: 0,
    };

    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount: payAmount, date: dateStr, installmentNumber: loan.installments, paymentMethodId: paymentMethodId ?? null, metadata: (splitMetadata as any) ?? null },
      ...prev,
    ]);
    setLoans((prev) => prev.map((l) => l.id === loanId ? {
      ...l, paidInstallments: loan.installments, status: "paid", remainingAmount: 0,
    } : l));
    await upsertCachedRow("payments", { ...paymentPayload, created_at: new Date().toISOString() });

    if (!online) {
      await enqueueMutation({ table: "payments", op: "insert", recordId: tempPaymentId, payload: paymentPayload });
      await enqueueMutation({ table: "loans", op: "update", recordId: loanId, payload: loanUpdate });
      await applyPaymentBalanceOffline(payAmount, paymentMethodId ?? null, normalizedSplit);
      // Manager commission é pulada offline; será criada manualmente ao reconectar pelo usuário se necessário.
      return;
    }

    const revertOptimisticState = async () => {
      setPayments((prev) => prev.filter((p) => p.id !== tempPaymentId));
      setLoans((prev) => prev.map((l) => l.id === loanId ? loan : l));
      await removeCachedRow("payments", tempPaymentId);
    };

    // Atomic insert payment + update loan (FOR UPDATE lock on loan row).
    const { error: atomicError } = await supabase.rpc("register_loan_payment_atomic" as any, {
      p_loan_id: loanId,
      p_user_id: dataOwnerId,
      p_payment_id: tempPaymentId,
      p_amount: payAmount,
      p_payment_date: dateStr,
      p_installment_number: loan.installments,
      p_payment_method_id: paymentMethodId ?? null,
      p_metadata: splitMetadata ?? null,
      p_expected_paid_installments: loan.paidInstallments,
      p_new_paid_installments: loan.installments,
      p_new_status: "paid",
      p_new_remaining_amount: 0,
      p_new_due_date: loan.dueDate,
    });

    // Pagamento + contrato + extrato são criados pela RPC transacional.
    if (atomicError) {
      await revertOptimisticState();
      throw rpcPaymentError(atomicError, "payOffLoan");
    }


    try {
      await applyPaymentBalance(payAmount, paymentMethodId ?? null, normalizedSplit);
      // Alocação de juros/principal:
      // - Contrato de parcela única: excedente sobre o principal remanescente é juros (legado).
      // - Contrato parcelado: usa a fórmula pró-rata; juros da última parcela fecha
      //   `totalInterest`, e QUALQUER excedente por acordo/bônus fica em principal
      //   (não infla o card de "Juros Recebidos").
      let interestPortion = 0;
      let principalPortion = payAmount;
      if (loan.installments <= 1) {
        const principalPaidBefore = payments
          .filter((p) => p.loanId === loanId)
          .reduce((sum, p) => sum + Math.min(Number(p.amount) || 0, Math.max(0, loan.amount - sum)), 0);
        principalPortion = Math.min(payAmount, Math.max(0, loan.amount - principalPaidBefore));
        interestPortion = Math.max(0, Math.round((payAmount - principalPortion) * 100) / 100);
      } else {
        const priorInterest = payments
          .filter((p) => p.loanId === loanId && p.installmentNumber >= 1 && p.installmentNumber < loan.installments)
          .reduce((s, p) => {
            const parcelAmt = Number(p.amount) || 0;
            const { interestPart } = computeInstallmentInterest({
              principal: loan.amount,
              rate: loan.interestRate,
              installments: loan.installments,
              installmentAmount: parcelAmt,
              installmentNumber: p.installmentNumber,
              priorInterestAllocated: s,
            });
            return s + interestPart;
          }, 0);
        const finalAlloc = computeInstallmentInterest({
          principal: loan.amount,
          rate: loan.interestRate,
          installments: loan.installments,
          installmentAmount: payAmount,
          installmentNumber: loan.installments,
          priorInterestAllocated: priorInterest,
        });
        interestPortion = finalAlloc.interestPart;
        principalPortion = Math.max(0, Math.round((payAmount - interestPortion) * 100) / 100);
      }
    } catch (balanceError: any) {

      console.error("[payOffLoan] adjust balance failed:", balanceError);
      await Promise.all([
        supabase.from("payments").delete().eq("id", tempPaymentId),
        supabase.from("loans").update({
          paid_installments: loan.paidInstallments,
          status: loan.status,
          remaining_amount: loan.remainingAmount ?? remaining,
        }).eq("id", loanId),
      ]);
      await revertOptimisticState();
      throw new Error(balanceError?.message ?? "Falha ao atualizar saldo");
    }

    // Manager commission (isolated — does NOT affect balance/profit/expenses)
    // Só registra se ainda não houver comissão integral para este empréstimo
    if (loan.hasManager && loan.managerId) {
      const { data: existingFull } = await supabase
        .from("manager_commissions")
        .select("id")
        .eq("loan_id", loanId)
        .eq("commission_type", "full")
        .limit(1);

      if (!existingFull || existingFull.length === 0) {
        const rate = loan.managerCommissionRate ?? 10;
        const base = loan.originalAmount ?? loan.amount;
        const totalCommission = (base * rate) / 100;
        // Em contratos parcelados, cada parcela já paga gerou comissão derivada
        // (perInstallment) no gráfico. Ao quitar, só registramos a comissão das
        // parcelas QUE FALTAVAM — senão somariam em dobro com as derivadas.
        const remaining = Math.max(0, loan.installments - loan.paidInstallments);
        const perInstallment = totalCommission / Math.max(1, loan.installments);
        const amount = loan.installments <= 1
          ? totalCommission
          : Math.max(0, Math.round(perInstallment * remaining * 100) / 100);
        await supabase.from("manager_commissions").insert({
          user_id: dataOwnerId,
          loan_id: loanId,
          manager_id: loan.managerId,
          payment_id: tempPaymentId,
          commission_type: "full",
          base_amount: base,
          rate,
          amount,
          generated_at: dateStr,
        } as any);

      }

    }

    await fetchPayments();
    await fetchLoans();
  }, [user, dataOwnerId, loans, payments, fetchLoans, fetchPayments]);

  const addInterestOnlyPayment = useCallback(async (loanId: string, paymentDate?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => {
    assertWritable();
    if (!user || !dataOwnerId) throw new Error("Sessão ainda não carregada");
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    const dateStr = paymentDate || todayInAppTz();
    const isInstallmentLoan = loan.installments >= 2;
    const { lateFees } = getLoanLateFees(loan, payments, installmentSchedules);
    const appliedFees = feesAmount != null && feesAmount > 0 ? feesAmount : lateFees;

    if (isInstallmentLoan) {
      // Para contratos parcelados: registra a multa/juros de atraso como um
      // pagamento separado (installment_number = -2) e cria uma entrada
      // dedicada no extrato (account_ledger) para que o valor dos juros
      // apareça claramente, sem inflar a parcela do cronograma.
      if (appliedFees <= 0) return;
      const feesPaymentId = crypto.randomUUID();
      const feesPayload: any = {
        id: feesPaymentId,
        user_id: dataOwnerId,
        loan_id: loanId,
        amount: appliedFees,
        date: dateStr,
        installment_number: -2,
        previous_due_date: loan.dueDate,
        payment_method_id: paymentMethodId ?? null,
        metadata: { ...(lateFeeAllocationMetadata(appliedFees) ?? {}), kind: "late_fee", notes: options?.notes ?? null, borrower_name: loan.borrowerName } as any,
      };

      setPayments((prev) => [
        { id: feesPaymentId, loanId, amount: appliedFees, date: dateStr, installmentNumber: -2, previousDueDate: loan.dueDate, paymentMethodId: paymentMethodId ?? null, metadata: feesPayload.metadata },
        ...prev,
      ]);
      await upsertCachedRow("payments", { ...feesPayload, created_at: new Date().toISOString() });

      if (!isOnline()) {
        await enqueueMutation({ table: "payments", op: "insert", recordId: feesPaymentId, payload: feesPayload });
        await applyPaymentBalanceOffline(appliedFees, paymentMethodId ?? null, null);
        return;
      }

      // Pagamento + extrato em UMA transação (RPC). Sem insert direto.
      const { error: feeRpcError } = await supabase.rpc("register_loan_interest_payment_atomic" as any, {
        p_user_id: dataOwnerId,
        p_loan_id: loanId,
        p_payment_id: feesPaymentId,
        p_amount: appliedFees,
        p_payment_date: dateStr,
        p_installment_number: -2,
        p_previous_due_date: loan.dueDate,
        p_payment_method_id: paymentMethodId ?? null,
        p_metadata: feesPayload.metadata,
        p_ledger_description: `Juros/multa por atraso - ${loan.borrowerName}`,
        p_ledger_rows: buildPaymentLedgerRows({
          amount: appliedFees,
          paymentMethodId: paymentMethodId ?? null,
          split: null,
          extraMetadata: { kind: "late_fee", fees_amount: appliedFees },
        }),
        p_loan_update: {},
      });
      if (feeRpcError) {
        setPayments((prev) => prev.filter((p) => p.id !== feesPaymentId));
        await removeCachedRow("payments", feesPaymentId);
        throw rpcPaymentError(feeRpcError, "addInterestOnlyPayment/lateFee");
      }

      try {
        await applyPaymentBalance(appliedFees, paymentMethodId ?? null, null);
      } catch (balanceError: any) {
        console.error("[addInterestOnlyPayment] adjust fees balance failed:", balanceError);
        throw new Error(balanceError?.message ?? "Falha ao atualizar saldo");
      }
      await fetchPayments();
      return;
    }



    const baseInterest = loan.customInterestValue != null && loan.customInterestValue > 0
      ? loan.customInterestValue
      : loan.amount * (loan.interestRate / 100);

    // 🔄 Soma pagamentos parciais já feitos no CICLO ATUAL (juros + encargos pendentes deste vencimento).
    // Pagamentos parciais ficam registrados com installment_number = 0 e metadata.kind = "interest_partial",
    // e NÃO avançam o due_date. Quando a soma atingir o alvo do ciclo (juros + multa/encargos), fecha.
    const cyclePartials = payments
      .filter((p) => p.loanId === loanId && p.installmentNumber === 0
        && (p as any).metadata?.kind === "interest_partial"
        && (p.previousDueDate === loan.dueDate || !(p as any).metadata?.cycle_due_date || (p as any).metadata?.cycle_due_date === loan.dueDate));
    const cyclePartialsPaid = cyclePartials.reduce((s, p) => s + Number(p.amount || 0), 0);
    // Maior alvo de fees registrado em parciais anteriores (preserva o cycle_fees_target ao longo das parciais)
    const priorCycleFeesTarget = cyclePartials.reduce(
      (m, p) => Math.max(m, Number((p as any).metadata?.cycle_fees_total || 0)),
      0,
    );
    const isExplicitPartial = !!options?.partial;
    // Em modo parcial com fees, o alvo do ciclo cresce para juros + multa/encargos
    const callFeesTarget = appliedFees > 0 ? appliedFees : 0;
    const cycleFeesTarget = Math.max(priorCycleFeesTarget, isExplicitPartial ? callFeesTarget : 0);
    const cycleTarget = Math.round((baseInterest + cycleFeesTarget) * 100) / 100;
    const cycleInterestPending = Math.max(0, Math.round((cycleTarget - cyclePartialsPaid) * 100) / 100);

    const requestedAmount = customAmount != null && customAmount > 0 ? customAmount : cycleInterestPending || cycleTarget;
    // Tolerância: ≥ 99,5% do pendente é considerado quitação total do ciclo,
    // inclusive quando o usuário marca "receber valor parcial" mas informa o saldo restante.
    const closesCycle = requestedAmount + 0.005 >= cycleInterestPending && cycleInterestPending > 0;
    // Se for parcial OU não fechar o ciclo, NÃO avança vencimento.
    const advanceCycle = closesCycle || (!isExplicitPartial && cycleInterestPending === 0);
    // Limita o valor cobrado ao pendente quando excederia o saldo.
    let interestAmount = requestedAmount;
    let excessAmount = 0;
    if (cycleInterestPending > 0 && interestAmount > cycleInterestPending) {
      excessAmount = Math.round((interestAmount - cycleInterestPending) * 100) / 100;
      interestAmount = cycleInterestPending;
    }

    // Em modo parcial com fees, NÃO inserimos linha separada de late_fee — o valor parcial
    // já contempla a fração paga de juros + encargos. Em modo NÃO parcial mantemos comportamento atual.
    const feesExtra = (!isExplicitPartial && feesAmount != null && feesAmount > 0) ? feesAmount : 0;
    // No fechamento do ciclo (advanceCycle), se houve fees acumulados em parciais anteriores,
    // limpamos a multa de renegociação mesmo que feesExtra seja 0 nesta chamada.
    const cycleHadFees = priorCycleFeesTarget > 0 || feesExtra > 0;
    // Regra (Bugfix Fase 4): O usuário relatou que ao alterar o vencimento (ex: 20/08 -> 30/08),
    // o pagamento do juros retornava para a data original (20/09). Para corrigir, usamos SEMPRE
    // a dueDate atual como âncora para avançar o ciclo se for Juros Mensal.
    const anchorRef = loan.dueDate;
    const freq = loan.interestType || "Mensal";
    const advance = (d: Date) => {
      if (freq === "Diário") d.setDate(d.getDate() + 1);
      else if (freq === "Semanal") d.setDate(d.getDate() + 7);
      else if (freq === "Quinzenal") d.setDate(d.getDate() + 15);
      else {
        const anchorDay = Number(anchorRef.split("-")[2]);
        const currentMonth = d.getMonth();
        const currentYear = d.getFullYear();
        // Fix JS setMonth bug (ex: Jan 31 + 1 month = Mar 3)
        // Usa o dia 1 para pular de mês em segurança, e só depois define o dia alvo.
        d.setMonth(currentMonth + 1, 1);
        if (Number.isFinite(anchorDay) && anchorDay >= 1 && anchorDay <= 31) {
          const lastDay = new Date(currentYear, currentMonth + 2, 0).getDate();
          d.setDate(Math.min(anchorDay, lastDay));
        }
      }
    };
    // Avança a partir da âncora original até superar o vencimento atual do contrato
    // (NÃO a data do pagamento). Isso garante que pagar com atraso de poucos dias
    // não pule o próximo ciclo — ex.: âncora 02/04, dueDate 29/04, pago 03/05 → próximo 02/05.
    const currentDue = new Date(anchorRef + "T00:00:00");
    advance(currentDue);
    let guard = 0;
    while (currentDue.toISOString().split("T")[0] <= loan.dueDate && guard < 600) {
      advance(currentDue);
      guard += 1;
    }
    // Se for pagamento parcial, mantém a data atual; só avança quando quita o ciclo.
    const newDueDate = advanceCycle ? currentDue.toISOString().split("T")[0] : loan.dueDate;
    const online = isOnline();

    const tempPaymentId = crypto.randomUUID();
    const totalReceivedNow = interestAmount + feesExtra;
    const normalizedSplit = normalizeSplit(paymentSplit ?? null, totalReceivedNow);
    const splitMetadata = withSplit(null, normalizedSplit);
    // Marca metadata do pagamento: parcial vs. fechamento de ciclo.
    const partialMetadata: Record<string, any> = {};
    if (!advanceCycle) {
      partialMetadata.kind = "interest_partial";
      partialMetadata.cycle_due_date = loan.dueDate;
      partialMetadata.cycle_interest_total = baseInterest;
      partialMetadata.cycle_fees_total = cycleFeesTarget;
      partialMetadata.cycle_target_total = cycleTarget;
      partialMetadata.cycle_pending_after = Math.max(0, Math.round((cycleInterestPending - interestAmount) * 100) / 100);
    } else if (cyclePartialsPaid > 0) {
      partialMetadata.kind = "interest_partial_final";
      partialMetadata.cycle_due_date = loan.dueDate;
      partialMetadata.cycle_interest_total = baseInterest;
      partialMetadata.cycle_fees_total = cycleFeesTarget;
      partialMetadata.cycle_target_total = cycleTarget;
      partialMetadata.cycle_partials_total = cyclePartialsPaid;
    }
    if (options?.notes) partialMetadata.notes = options.notes;
    if (excessAmount > 0) partialMetadata.excess_returned = excessAmount;
    const finalMetadata = { ...(interestCycleAllocationMetadata(interestAmount) ?? {}), ...(splitMetadata ?? {}), ...partialMetadata };
    const paymentPayload: any = {
      id: tempPaymentId,
      user_id: dataOwnerId, loan_id: loanId, amount: interestAmount,
      date: dateStr, installment_number: 0, previous_due_date: loan.dueDate,
      payment_method_id: paymentMethodId ?? null,
    };
    if (Object.keys(finalMetadata).length > 0) paymentPayload.metadata = finalMetadata;
    const renegPenaltyPending = Number(loan.renegotiationPenaltyTotal || 0);
    const shouldClearRenegPenalty = advanceCycle && cycleHadFees && renegPenaltyPending > 0;
    const loanUpdate: any = advanceCycle ? { due_date: newDueDate } : {};
    if (shouldClearRenegPenalty) {
      loanUpdate.renegotiation_penalty_total = 0;
      loanUpdate.remaining_amount = Math.max(0, Math.round((Number(loan.remainingAmount || 0) - renegPenaltyPending) * 100) / 100);
    }

    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount: interestAmount, date: dateStr, installmentNumber: 0, previousDueDate: loan.dueDate, paymentMethodId: paymentMethodId ?? null, metadata: (Object.keys(finalMetadata).length > 0 ? finalMetadata : null) as any },
      ...prev,
    ]);
    setLoans((prev) => prev.map((l) => l.id === loanId ? {
      ...l,
      dueDate: newDueDate,
      ...(shouldClearRenegPenalty ? {
        renegotiationPenaltyTotal: 0,
        remainingAmount: Math.max(0, Math.round((Number(l.remainingAmount || 0) - renegPenaltyPending) * 100) / 100),
      } : {}),
    } : l));
    await upsertCachedRow("payments", { ...paymentPayload, created_at: new Date().toISOString() });

    if (!online) {
      await enqueueMutation({ table: "payments", op: "insert", recordId: tempPaymentId, payload: paymentPayload });
      if (Object.keys(loanUpdate).length > 0) {
        await enqueueMutation({ table: "loans", op: "update", recordId: loanId, payload: loanUpdate });
      }
      // Ajusta o saldo offline com o TOTAL (juros + multa) em uma única operação
      await applyPaymentBalanceOffline(interestAmount + feesExtra, paymentMethodId ?? null, normalizedSplit);
      if (feesExtra > 0) {
        const feesPaymentId = crypto.randomUUID();
        const feesPayload = {
          id: feesPaymentId,
          user_id: dataOwnerId, loan_id: loanId, amount: feesExtra,
          date: dateStr, installment_number: -2, previous_due_date: loan.dueDate,
          payment_method_id: paymentMethodId ?? null,
          metadata: { ...(lateFeeAllocationMetadata(feesExtra) ?? {}), kind: "late_fee", consolidated_with: tempPaymentId } as any,
        };
        setPayments((prev) => [
          { id: feesPaymentId, loanId, amount: feesExtra, date: dateStr, installmentNumber: -2, previousDueDate: loan.dueDate, paymentMethodId: paymentMethodId ?? null, metadata: { ...(lateFeeAllocationMetadata(feesExtra) ?? {}), kind: "late_fee", consolidated_with: tempPaymentId } as any },
          ...prev,
        ]);
        await upsertCachedRow("payments", { ...feesPayload, created_at: new Date().toISOString() });
        await enqueueMutation({ table: "payments", op: "insert", recordId: feesPaymentId, payload: feesPayload });
        // NÃO ajusta saldo aqui — já incluído no total acima
      }
      return;
    }

    const loanRollback: any = { due_date: loan.dueDate };
    if (shouldClearRenegPenalty) {
      loanRollback.renegotiation_penalty_total = renegPenaltyPending;
      loanRollback.remaining_amount = Number(loan.remainingAmount || 0);
    }

    const revertOptimisticState = async () => {
      setPayments((prev) => prev.filter((p) => p.id !== tempPaymentId));
      setLoans((prev) => prev.map((l) => l.id === loanId ? loan : l));
      await removeCachedRow("payments", tempPaymentId);
    };

    // ── Registro transacional único ────────────────────────────────────────
    // Pagamento de juros + (opcional) multa consolidada + contrato + cronograma
    // + extrato consolidado são gravados na MESMA transação pela RPC.
    // Os dois IDs são gerados uma única vez por tentativa e reaproveitados em
    // qualquer retry (a RPC devolve sucesso para replays idênticos e conflito
    // quando os mesmos IDs chegam com dados diferentes).
    const feesPaymentId = feesExtra > 0 ? crypto.randomUUID() : null;
    const feesMetadata = feesExtra > 0
      ? { ...(lateFeeAllocationMetadata(feesExtra) ?? {}), kind: "late_fee", consolidated_with: tempPaymentId }
      : null;
    const totalReceived = Math.round((interestAmount + feesExtra) * 100) / 100;
    const ledgerDescription = feesExtra > 0
      ? `Pagamento de empréstimo (juros + multa) - ${loan.borrowerName}`
      : `Juros mensal - ${loan.borrowerName}`;
    const ledgerRows = buildPaymentLedgerRows({
      amount: totalReceived,
      paymentMethodId: paymentMethodId ?? null,
      split: normalizedSplit,
      extraMetadata: feesExtra > 0
        ? { interest_amount: interestAmount, fees_amount: feesExtra }
        : { interest_amount: interestAmount },
    });

    const { error: interestRpcError } = await supabase.rpc("register_loan_interest_payment_atomic" as any, {
      p_user_id: dataOwnerId,
      p_loan_id: loanId,
      p_payment_id: tempPaymentId,
      p_amount: interestAmount,
      p_payment_date: dateStr,
      p_installment_number: 0,
      p_previous_due_date: loan.dueDate,
      p_payment_method_id: paymentMethodId ?? null,
      p_metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : {},
      p_ledger_description: ledgerDescription,
      p_ledger_rows: ledgerRows,
      p_loan_update: loanUpdate,
      p_schedule_installment_number: advanceCycle ? loan.paidInstallments + 1 : null,
      p_schedule_due_date: advanceCycle ? newDueDate : null,
      p_late_fee_payment_id: feesPaymentId,
      p_late_fee_amount: feesExtra > 0 ? feesExtra : null,
      p_late_fee_metadata: feesMetadata,
    });

    if (interestRpcError) {
      await revertOptimisticState();
      throw rpcPaymentError(interestRpcError, "addInterestOnlyPayment");
    }

    try {
      await applyPaymentBalance(totalReceived, paymentMethodId ?? null, normalizedSplit);
    } catch (balanceError: any) {
      // O pagamento já está confirmado no banco (transação concluída); não
      // desfazemos registros financeiros — apenas sinalizamos a falha de saldo.
      console.error("[addInterestOnlyPayment] adjust balance failed:", balanceError);
      throw new Error(balanceError?.message ?? "Falha ao atualizar saldo");
    }

    if (feesPaymentId && feesExtra > 0) {
      const feesRow = {
        id: feesPaymentId,
        user_id: dataOwnerId, loan_id: loanId, amount: feesExtra,
        date: dateStr, installment_number: -2, previous_due_date: loan.dueDate,
        payment_method_id: paymentMethodId ?? null,
        metadata: feesMetadata as any,
      };
      setPayments((prev) => [
        { id: feesPaymentId, loanId, amount: feesExtra, date: dateStr, installmentNumber: -2, previousDueDate: loan.dueDate, paymentMethodId: paymentMethodId ?? null, metadata: feesMetadata as any },
        ...prev,
      ]);
      await upsertCachedRow("payments", { ...feesRow, created_at: new Date().toISOString() });
    }


    // Comissão do gerente sobre juros: gerada A CADA ciclo de juros quitado
    // (taxa% do valor ORIGINAL do contrato), isolada do saldo/lucro.
    // Pagamentos parciais de ciclo não geram comissão — só o que fecha o ciclo.
    if (loan.hasManager && loan.managerId && advanceCycle) {
      const rate = loan.managerCommissionRate ?? 10;
      const base = loan.originalAmount ?? loan.amount;
      const amount = Math.round(((base * rate) / 100) * 100) / 100;
      const { data: existingForPayment } = await supabase
        .from("manager_commissions")
        .select("id")
        .eq("loan_id", loanId)
        .eq("payment_id", tempPaymentId)
        .limit(1);

      if (!existingForPayment || existingForPayment.length === 0) {
        await supabase.from("manager_commissions").insert({
          user_id: dataOwnerId,
          loan_id: loanId,
          manager_id: loan.managerId,
          payment_id: tempPaymentId,
          commission_type: "interest",
          base_amount: base,
          rate,
          amount,
          generated_at: dateStr,
        } as any);
      }
    }


    await fetchLoans();
    await fetchPayments();
    await fetchSchedules();
  }, [user, dataOwnerId, loans, payments, fetchLoans, fetchPayments]);

  /**
   * Amortizar contrato: reduz o principal do empréstimo pelo valor informado,
   * reduzindo proporcionalmente os juros futuros (juros são recalculados sobre
   * o novo principal). Atualiza o saldo restante e o cronograma de parcelas
   * pendentes. Registra a operação no histórico (installment_number = -3).
   */
  const amortizeLoan = useCallback(async (
    loanId: string,
    amortizeAmount: number,
    paymentDate?: string,
    paymentMethodId?: string | null,
    paymentSplit?: PaymentSplit | null,
  ) => {
    assertWritable();
    if (!user || !dataOwnerId) throw new Error("Sessão ainda não carregada");
    if (amortizeAmount == null || isNaN(Number(amortizeAmount)) || Number(amortizeAmount) <= 0) {
      throw new Error("Informe um valor de amortização válido (maior que zero)");
    }
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    if (loan.status === "paid") {
      throw new Error("Este contrato já está quitado e não pode ser amortizado");
    }
    if (loan.status !== "active" && loan.status !== "overdue") {
      throw new Error("Apenas contratos em aberto podem ser amortizados");
    }
    const remainingBalance = getLoanRemainingAmount(loan, payments);
    if (remainingBalance <= 0) {
      throw new Error("Este contrato já está quitado e não pode ser amortizado");
    }

    const dateStr = paymentDate || todayInAppTz();
    // Valida data dentro do período do contrato
    const startStr = loan.startDate;
    const endStr = loan.dueDate;
    if (startStr && dateStr < startStr) {
      throw new Error(`A data da amortização não pode ser anterior ao início do contrato (${startStr})`);
    }
    if (endStr && dateStr > endStr) {
      throw new Error(`A data da amortização não pode ser posterior ao vencimento do contrato (${endStr})`);
    }
    const rate = Number(loan.interestRate) || 0;
    const oldPrincipal = Number(loan.amount) || 0;
    if (amortizeAmount > oldPrincipal) {
      throw new Error(`O valor da amortização não pode ser maior que o saldo principal (R$ ${oldPrincipal.toFixed(2)})`);
    }
    const newPrincipal = Math.max(0, oldPrincipal - amortizeAmount);

    // Recalcula juros proporcionalmente ao novo principal
    const newCustomInterest = loan.customInterestValue != null && loan.customInterestValue > 0 && oldPrincipal > 0
      ? (loan.customInterestValue * (newPrincipal / oldPrincipal))
      : null;
    const newInterestTotal = newCustomInterest != null
      ? newCustomInterest
      : newPrincipal * (rate / 100);
    const newTotalContract = newPrincipal + newInterestTotal;

    // Quanto já foi pago em parcelas/quitações (exclui juros-only e taxas)
    const paidPrincipalAndInstallments = payments
      .filter((p) => p.loanId === loanId && p.installmentNumber !== 0 && p.installmentNumber !== -2)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const newRemaining = Math.max(0, newTotalContract - paidPrincipalAndInstallments);
    const remainingInst = Math.max(1, loan.installments - loan.paidInstallments);
    const newInstallmentValue = Math.round((newRemaining / remainingInst) * 100) / 100;

    const oldInterestTotal = loan.customInterestValue != null && loan.customInterestValue > 0
      ? Number(loan.customInterestValue)
      : oldPrincipal * (rate / 100);
    const interestSaved = Math.max(0, oldInterestTotal - newInterestTotal);

    const normalizedSplit = normalizeSplit(paymentSplit ?? null, amortizeAmount);
    const amortizationMetadata: Record<string, any> = {
      kind: "amortization" as const,
      old_principal: oldPrincipal,
      new_principal: newPrincipal,
      old_interest_total: oldInterestTotal,
      new_interest_total: newInterestTotal,
      interest_saved: interestSaved,
      new_remaining: newRemaining,
      interest_rate: rate,
    };
    Object.assign(amortizationMetadata, amortizationAllocationMetadata(amortizeAmount) ?? {});
    if (normalizedSplit) amortizationMetadata.split = normalizedSplit;

    const online = isOnline();
    const tempPaymentId = crypto.randomUUID();
    const paymentPayload = {
      id: tempPaymentId,
      user_id: dataOwnerId,
      loan_id: loanId,
      amount: amortizeAmount,
      date: dateStr,
      installment_number: -3, // marcador de amortização
      payment_method_id: paymentMethodId ?? null,
      metadata: amortizationMetadata,
    };
    // IMPORTANTE: a amortização NÃO altera o valor original do empréstimo
    // (loan.amount), nem a configuração de juros (custom_interest_value), nem
    // a data de criação, cliente, ou histórico original. Apenas atualiza o
    // SALDO DEVEDOR (remaining_amount) e recalcula as parcelas FUTURAS via
    // loan_installments. O custom_installment_value só é tocado quando o
    // contrato não possui cronograma persistido (fallback de exibição).
    const hasSchedule = installmentSchedules.some(
      (s) => s.loanId === loanId && s.installmentNumber > loan.paidInstallments,
    );
    const loanUpdate: any = {
      remaining_amount: newRemaining,
    };
    if (!hasSchedule) {
      loanUpdate.custom_installment_value = newInstallmentValue;
    }

    // Atualização otimista
    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount: amortizeAmount, date: dateStr, installmentNumber: -3, paymentMethodId: paymentMethodId ?? null, metadata: amortizationMetadata as any },
      ...prev,
    ]);
    setLoans((prev) => prev.map((l) => l.id === loanId ? {
      ...l,
      remainingAmount: newRemaining,
      ...(hasSchedule ? {} : { customInstallmentValue: newInstallmentValue }),
    } : l));
    await upsertCachedRow("payments", { ...paymentPayload, created_at: new Date().toISOString() });

    if (!online) {
      await enqueueMutation({ table: "payments", op: "insert", recordId: tempPaymentId, payload: paymentPayload });
      await enqueueMutation({ table: "loans", op: "update", recordId: loanId, payload: loanUpdate });
      await applyPaymentBalanceOffline(amortizeAmount, paymentMethodId ?? null, normalizedSplit);
      toast.success("Amortização registrada (offline)");
      return;
    }

    const revert = async () => {
      setPayments((prev) => prev.filter((p) => p.id !== tempPaymentId));
      setLoans((prev) => prev.map((l) => l.id === loanId ? loan : l));
      await removeCachedRow("payments", tempPaymentId);
    };

    // Atomic insert payment + update loan.remaining_amount (FOR UPDATE lock).
    // custom_installment_value (campo de fallback de exibição) é atualizado em
    // um segundo update fora da transação principal — não afeta saldo nem juros.
    const { error: atomicErr } = await supabase.rpc("register_loan_payment_atomic" as any, {
      p_loan_id: loanId,
      p_user_id: dataOwnerId,
      p_payment_id: tempPaymentId,
      p_amount: amortizeAmount,
      p_payment_date: dateStr,
      p_installment_number: -3,
      p_payment_method_id: paymentMethodId ?? null,
      p_metadata: amortizationMetadata as any,
      p_expected_paid_installments: loan.paidInstallments,
      p_new_paid_installments: loan.paidInstallments,
      p_new_status: loan.status,
      p_new_remaining_amount: newRemaining,
      p_new_due_date: loan.dueDate,
    });

    // Pagamento + contrato + extrato são criados pela RPC transacional.
    if (atomicErr) {
      await revert();
      throw rpcPaymentError(atomicErr, "amortizeLoan");
    }
    if (!hasSchedule) {
      // Atualiza apenas o campo de fallback de exibição.
      await supabase.from("loans")
        .update({ custom_installment_value: newInstallmentValue })
        .eq("id", loanId);
    }


    // Atualiza valores das parcelas futuras (não pagas) proporcionalmente
    const unpaidScheds = installmentSchedules
      .filter((s) => s.loanId === loanId && s.installmentNumber > loan.paidInstallments)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    if (unpaidScheds.length > 0) {
      const evenValue = Math.round((newRemaining / unpaidScheds.length) * 100) / 100;
      // ajusta a última parcela para fechar a soma exata
      const total = evenValue * unpaidScheds.length;
      const diff = Math.round((newRemaining - total) * 100) / 100;
      for (let i = 0; i < unpaidScheds.length; i++) {
        const sched = unpaidScheds[i];
        const isLast = i === unpaidScheds.length - 1;
        const amt = isLast ? Math.max(0, evenValue + diff) : evenValue;
        if (sched.id) {
          await supabase.from("loan_installments").update({ amount: amt }).eq("id", sched.id);
        }
      }
    }

    try {
      await applyPaymentBalance(amortizeAmount, paymentMethodId ?? null, normalizedSplit);

    } catch (balErr: any) {
      // reverter
      await Promise.all([
        supabase.from("payments").delete().eq("id", tempPaymentId),
        supabase.from("loans").update({
          remaining_amount: loan.remainingAmount ?? null,
          ...(hasSchedule ? {} : { custom_installment_value: loan.customInstallmentValue ?? null }),
        }).eq("id", loanId),
      ]);
      await revert();
      throw new Error(balErr?.message ?? "Falha ao atualizar saldo");
    }

    await fetchPayments();
    await fetchLoans();
    await fetchSchedules();
  }, [user, dataOwnerId, loans, payments, installmentSchedules, fetchPayments, fetchLoans, fetchSchedules]);

  const updateLoan = useCallback(async (id: string, data: Partial<Omit<Loan, "id">>) => {
    assertWritable();
    // Auditoria: se algum campo financeiro mudou em contrato com pagamentos,
    // grava snapshot do estado anterior no extrato (category=adjustment, amount=0).
    try {
      const oldLoan = loans.find((l) => l.id === id);
      const loanPayments = payments.filter((p) => p.loanId === id);
      if (oldLoan && loanPayments.length > 0) {
        const sensitiveChanged: Record<string, { from: any; to: any }> = {};
        const checkField = (key: keyof Loan, newVal: any, oldVal: any) => {
          if (newVal !== undefined && Number(newVal) !== Number(oldVal ?? 0)) {
            sensitiveChanged[key as string] = { from: oldVal ?? null, to: newVal };
          }
        };
        checkField("amount", data.amount, oldLoan.amount);
        checkField("remainingAmount", data.remainingAmount, oldLoan.remainingAmount);
        checkField("installments", data.installments, oldLoan.installments);
        checkField("paidInstallments", data.paidInstallments, oldLoan.paidInstallments);
        if (Object.keys(sensitiveChanged).length > 0) {
          const fieldsList = Object.keys(sensitiveChanged)
            .map((k) => `${k}: ${sensitiveChanged[k].from} → ${sensitiveChanged[k].to}`)
            .join("; ");
          await recordLedger({
            direction: "in",
            category: "adjustment",
            amount: 0,
            description: `Edição manual do contrato de ${oldLoan.borrowerName} — ${fieldsList}`,
            occurred_on: todayInAppTz(),
            loan_id: id,
            source: "loan_edit_audit",
            syncBalance: false,
                metadata: {
                  audit: true,
                  borrower_name: oldLoan.borrowerName,
                  changes: sensitiveChanged,
                  payments_count: loanPayments.length,
                  previous_state: {
                    amount: oldLoan.amount,
                    remaining_amount: oldLoan.remainingAmount,
                    installments: oldLoan.installments,
                    paid_installments: oldLoan.paidInstallments,
                    custom_installment_value: oldLoan.customInstallmentValue,
                    due_date: oldLoan.dueDate,
                  },
                },
          });
        }
      }
    } catch (auditErr) {
      console.warn("[updateLoan] Falha ao gravar auditoria:", auditErr);
    }

    if (data.remainingAmount !== undefined) {
      const oldLoan = loans.find((l) => l.id === id);
      if (oldLoan) {
        const oldRemaining = oldLoan.remainingAmount ?? 0;
        const newRemaining = data.remainingAmount ?? 0;
        const diff = newRemaining - oldRemaining;
        if (diff !== 0) {
          // diff > 0: saldo devedor aumentou → saída de caixa (emprestamos mais)
          // diff < 0: saldo devedor diminuiu → entrada de caixa (recebemos)
          const direction: "in" | "out" = diff > 0 ? "out" : "in";
          const absAmount = Math.abs(diff);
          const borrower = oldLoan.borrowerName || "empréstimo";
          try {
            await recordLedger({
              direction,
              category: "adjustment",
              amount: absAmount,
              description: `Ajuste de saldo do empréstimo de ${borrower}`,
              loan_id: id,
              source: "loan_adjustment",
              metadata: { borrower_name: borrower, old_remaining: oldRemaining, new_remaining: newRemaining },
            });
          } catch (err) {
            console.error("[updateLoan] Falha ao registrar ajuste no extrato:", err);
            // Fallback: ajusta apenas o saldo se o ledger falhar
            await adjustBalance(-diff);
          }
        }
      }
    }
    setLoans((prev) => prev.map((l) => l.id === id ? { ...l, ...data } : l));
    const updateData: any = {};
    if (data.borrowerName !== undefined) updateData.borrower_name = data.borrowerName;
    if (data.borrowerId !== undefined) updateData.borrower_id = data.borrowerId;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.interestRate !== undefined) updateData.interest_rate = data.interestRate;
    if (data.interestType !== undefined) updateData.interest_type = data.interestType;
    if (data.paymentType !== undefined) updateData.payment_type = data.paymentType;
    if (data.startDate !== undefined) updateData.start_date = data.startDate;
    if (data.dueDate !== undefined) updateData.due_date = data.dueDate;
    if (data.originalDueDate !== undefined) updateData.original_due_date = data.originalDueDate;
    if (data.installments !== undefined) updateData.installments = data.installments;
    if (data.paidInstallments !== undefined) updateData.paid_installments = data.paidInstallments;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.notes !== undefined) updateData.notes = data.notes != null ? String(data.notes) : null;
    if (data.remainingAmount !== undefined) updateData.remaining_amount = data.remainingAmount;
    if (data.customInstallmentValue !== undefined) updateData.custom_installment_value = data.customInstallmentValue;
    if (data.customInterestValue !== undefined) updateData.custom_interest_value = data.customInterestValue;
    if (data.lateInterestType !== undefined) updateData.late_interest_type = data.lateInterestType;
    if (data.lateInterestValue !== undefined) updateData.late_interest_value = data.lateInterestValue;
    if (data.penaltyValue !== undefined) updateData.penalty_value = data.penaltyValue;
    if (data.hasManager !== undefined) (updateData as any).has_manager = data.hasManager;
    if (data.managerId !== undefined) (updateData as any).manager_id = data.managerId;
    if (data.managerCommissionRate !== undefined) (updateData as any).manager_commission_rate = data.managerCommissionRate ?? 10;
    if (data.autoBillingEnabled !== undefined) (updateData as any).auto_billing_enabled = data.autoBillingEnabled;
    if (data.isSale !== undefined) (updateData as any).is_sale = data.isSale;
    if (data.paymentSplit !== undefined) {
      const split = data.paymentSplit;
      (updateData as any).payment_method_split = split && split.parts && split.parts.length >= 2
        ? { parts: split.parts.map((p) => ({ payment_method_id: p.paymentMethodId, amount: Number(p.amount) })) }
        : null;
    }
    if (!isOnline()) {
      await enqueueMutation({ table: "loans", op: "update", recordId: id, payload: updateData });
      return;
    }
    const { error: updateErr } = await supabase.from("loans").update(updateData).eq("id", id);
    if (updateErr) {
      if (!updateErr.message.toLowerCase().includes("row-level")) {
        await enqueueMutation({ table: "loans", op: "update", recordId: id, payload: updateData });
      } else {
        console.error("[updateLoan] Falha ao salvar:", updateErr);
        toast.error("Falha ao salvar alterações: " + updateErr.message);
        await fetchLoans();
      }
    }
  }, [loans, fetchLoans]);

  const deleteLoan = useCallback(async (id: string) => {
    assertWritable();
    const loan = loans.find((l) => l.id === id);
    const loanPayments = payments.filter((p) => p.loanId === id);
    setLoans((prev) => prev.filter((l) => l.id !== id));
    setPayments((prev) => prev.filter((p) => p.loanId !== id));
    await removeCachedRow("loans", id);

    // Net balance impact: refund principal, then revert all received payments
    const netDelta = (loan ? loan.amount : 0) - loanPayments.reduce((s, p) => s + p.amount, 0);

    if (!isOnline()) {
      await enqueueMutation({ table: "loans", op: "delete", recordId: id });
      if (netDelta !== 0) await adjustBalanceOffline(netDelta);
      return;
    }
    if (netDelta !== 0) await adjustBalance(netDelta);
    // Remove todos os lançamentos do extrato vinculados a esse empréstimo (sem mexer no saldo, já feito acima)
    if (loan) {
      await removeLedgerByRef({ loan_id: id }, { syncBalance: false });
    }
    const { error } = await supabase.from("loans").delete().eq("id", id);
    if (error) await enqueueMutation({ table: "loans", op: "delete", recordId: id });
  }, [loans, payments]);

  const deletePayment = useCallback(async (id: string) => {
    assertWritable();
    const payment = payments.find((p) => p.id === id);
    if (!payment) return;
    const online = isOnline();

    setPayments((prev) => prev.filter((p) => p.id !== id));
    await removeCachedRow("payments", id);

    const loan = loans.find((l) => l.id === payment.loanId);
    let loanUpdates: any = null;

    if (loan) {
      const newRemaining = (loan.remainingAmount ?? 0) + payment.amount;
      loanUpdates = { remaining_amount: newRemaining };

      if (payment.installmentNumber > 0) {
        const newPaid = Math.max(0, loan.paidInstallments - 1);
        const newStatus = newPaid < loan.installments ? "active" : loan.status;
        loanUpdates.paid_installments = newPaid;
        loanUpdates.status = newStatus;
        setLoans((prev) => prev.map((l) => l.id === payment.loanId ? {
          ...l, paidInstallments: newPaid, status: newStatus, remainingAmount: newRemaining,
        } : l));
      } else if (payment.installmentNumber === -1 && loan.status === "paid") {
        loanUpdates.status = "active";
        setLoans((prev) => prev.map((l) => l.id === payment.loanId ? {
          ...l, status: "active", remainingAmount: newRemaining,
        } : l));
      } else if (payment.installmentNumber === 0 && payment.previousDueDate) {
        loanUpdates.due_date = payment.previousDueDate;
        delete loanUpdates.remaining_amount;
        setLoans((prev) => prev.map((l) => l.id === payment.loanId ? {
          ...l, dueDate: payment.previousDueDate!,
        } : l));
        if (online) {
          const nextNum = loan.paidInstallments + 1;
          await supabase.from("loan_installments")
            .update({ due_date: payment.previousDueDate })
            .eq("loan_id", payment.loanId)
            .eq("installment_number", nextNum);
        }
      } else {
        setLoans((prev) => prev.map((l) => l.id === payment.loanId ? {
          ...l, remainingAmount: newRemaining,
        } : l));
      }
    }

    if (!online) {
      if (loan && loanUpdates) {
        await enqueueMutation({ table: "loans", op: "update", recordId: payment.loanId, payload: loanUpdates });
      }
      await enqueueMutation({ table: "payments", op: "delete", recordId: id });
      const split = normalizeSplit((payment.metadata as any)?.split ?? null, payment.amount);
      await applyPaymentBalanceOffline(payment.amount, payment.paymentMethodId ?? null, split, -1);
      return;
    }

    if (loan && loanUpdates) {
      await supabase.from("loans").update(loanUpdates).eq("id", payment.loanId);
    }
    const split = normalizeSplit((payment.metadata as any)?.split ?? null, payment.amount);
    await applyPaymentBalance(payment.amount, payment.paymentMethodId ?? null, split, -1);
    // Remove a entrada do extrato (sem mexer no saldo de novo)
    await removeLedgerByRef({ payment_id: id }, { syncBalance: false });
    await supabase.from("payments").delete().eq("id", id);
    await fetchSchedules();
    await fetchLoans();
    await fetchPayments();
  }, [payments, loans, fetchSchedules, fetchLoans, fetchPayments]);

  /**
   * Renegociar contrato:
   * - "no_interest": apenas ajusta valor/parcelas (sem multa)
   * - "with_penalty": adiciona multa (R$ fixo ou % do saldo restante) ao valor total.
   * Preserva start_date (data de saída do contrato).
   * Registra histórico imutável em loan_renegotiations.
   */
  const renegotiateLoan = useCallback(async (
    loanId: string,
    params: {
      type: "no_interest" | "with_penalty";
      penaltyMode?: "fixed" | "percentage" | null;
      penaltyInput?: number | null;
      penaltyDistribution?: "diluted" | "first" | null;
      newInstallments?: number | null;
      notes?: string | null;
      selectedInstallmentNumbers?: number[] | null;
      firstDueDate?: string | null;
      frequency?: "monthly" | "biweekly" | "weekly" | "daily" | null;
      customDates?: string[] | null;
      /** Valores personalizados de cada nova parcela (índice 0..n-1). Quando válidos, são salvos exatamente como informados. */
      customInstallmentAmounts?: number[] | null;
      discountNewTotal?: number | null;
    }
  ) => {
    assertWritable();
    if (!user || !dataOwnerId) throw new Error("Sessão ainda não carregada");
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    if (loan.status === "paid") throw new Error("Contratos quitados não podem ser renegociados");

    const totalRemaining = getLoanRemainingAmount(loan, payments);
    if (totalRemaining <= 0) throw new Error("Não há saldo a renegociar");

    // Cronograma atual de parcelas
    const allScheds = installmentSchedules
      .filter((s) => s.loanId === loanId)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    const pendingScheds = allScheds.filter((s) => s.installmentNumber > loan.paidInstallments);

    const isInstallmentLoan = loan.paymentType === "Parcelado" && loan.installments > 1;
    const hasSchedule = pendingScheds.length > 0;

    // Determina parcelas selecionadas (somente para parcelado com cronograma)
    const selectedSet = new Set<number>(
      isInstallmentLoan && hasSchedule && params.selectedInstallmentNumbers && params.selectedInstallmentNumbers.length > 0
        ? params.selectedInstallmentNumbers.filter(
            (n) => n > loan.paidInstallments && n <= loan.installments
          )
        : pendingScheds.map((s) => s.installmentNumber)
    );

    const isPartialReneg = isInstallmentLoan && hasSchedule && selectedSet.size < pendingScheds.length;

    // Saldo a renegociar = soma das parcelas selecionadas (parcelado) ou saldo total
    let remaining: number;
    if (isInstallmentLoan && hasSchedule) {
      const sum = pendingScheds
        .filter((s) => selectedSet.has(s.installmentNumber))
        .reduce((acc, s) => acc + Number(s.amount || 0), 0);
      remaining = Math.round(sum * 100) / 100;
    } else {
      remaining = totalRemaining;
    }
    if (remaining <= 0) throw new Error("Selecione ao menos uma parcela com saldo");

    let penaltyAmount = 0;
    if (params.type === "with_penalty") {
      const input = Number(params.penaltyInput ?? 0);
      if (!input || input <= 0) throw new Error("Informe um valor de multa válido");
      if (params.penaltyMode === "percentage") {
        penaltyAmount = Math.round((remaining * input / 100) * 100) / 100;
      } else {
        penaltyAmount = Math.round(input * 100) / 100;
      }
    }

    // Modo desconto: novo valor total < saldo atual
    const discountNewTotal = Number(params.discountNewTotal ?? 0);
    const isDiscount = params.type === "no_interest"
      && discountNewTotal > 0
      && discountNewTotal < remaining;
    if (params.discountNewTotal != null && params.discountNewTotal > 0 && params.discountNewTotal >= remaining) {
      throw new Error("O novo valor deve ser menor que o saldo atual");
    }

    const newAmount = isDiscount
      ? Math.round(discountNewTotal * 100) / 100
      : Math.round((remaining + penaltyAmount) * 100) / 100;

    // Quantas parcelas substituirão as selecionadas
    const desiredNewPending = params.newInstallments && params.newInstallments > 0
      ? Math.floor(params.newInstallments)
      : (isInstallmentLoan && hasSchedule
          ? Math.max(1, selectedSet.size)
          : Math.max(1, loan.installments - loan.paidInstallments));

    // Modo "first": multa inteira na 1ª nova parcela (só faz sentido com multa > 0 e mais de uma parcela).
    const useFirstMode =
      params.type === "with_penalty" &&
      penaltyAmount > 0 &&
      params.penaltyDistribution === "first" &&
      desiredNewPending > 1;

    // Valor "base" das novas parcelas. No modo "first", a base ignora a multa.
    const baseInstallmentValue = useFirstMode
      ? Math.round((remaining / desiredNewPending) * 100) / 100
      : Math.round((newAmount / desiredNewPending) * 100) / 100;
    const firstInstallmentValue = useFirstMode
      ? Math.round((baseInstallmentValue + penaltyAmount) * 100) / 100
      : baseInstallmentValue;
    // Mantém variável original para compatibilidade no resto do fluxo (custom_installment_value etc.)
    const newInstallmentValue = baseInstallmentValue;

    // ---- Valores personalizados por parcela (editados pelo usuário na renegociação) ----
    const rawCustomAmounts = Array.isArray(params.customInstallmentAmounts)
      ? params.customInstallmentAmounts.slice(0, desiredNewPending)
      : null;
    const customAmountsValid =
      !!rawCustomAmounts &&
      rawCustomAmounts.length === desiredNewPending &&
      rawCustomAmounts.every((v) => Number.isFinite(Number(v)) && Number(v) >= 0) &&
      rawCustomAmounts.some((v) => Number(v) > 0);
    const customAmounts = customAmountsValid
      ? (rawCustomAmounts as number[]).map((v) => Math.round(Number(v) * 100) / 100)
      : null;
    const customAmountsTotal = customAmounts
      ? Math.round(customAmounts.reduce((s, v) => s + v, 0) * 100) / 100
      : 0;
    /** Total efetivo da renegociação: soma das parcelas personalizadas quando houver. */
    const effectiveNewAmount = customAmounts ? customAmountsTotal : newAmount;
    const customAmountsUniform =
      !!customAmounts && customAmounts.every((v) => Math.abs(v - customAmounts[0]) < 0.005);

    // Saldo total novo do contrato (parcelas pagas + não selecionadas + novas renegociadas)
    const unselectedPendingTotal = pendingScheds
      .filter((s) => !selectedSet.has(s.installmentNumber))
      .reduce((acc, s) => acc + Number(s.amount || 0), 0);
    const newLoanRemaining = Math.round((unselectedPendingTotal + effectiveNewAmount) * 100) / 100;

    // Total de parcelas do contrato após a renegociação
    const newInstallmentsTotal = isInstallmentLoan && hasSchedule
      ? loan.paidInstallments + (pendingScheds.length - selectedSet.size) + desiredNewPending
      : loan.paidInstallments + desiredNewPending;

    const renegotiatedAt = todayInAppTz();

    // Snapshot do estado anterior do contrato (usado para reverter ao excluir a renegociação)
    const previousState = {
      version: 1,
      loan: {
        remaining_amount: Number(loan.remainingAmount ?? 0),
        installments: loan.installments,
        custom_installment_value: loan.customInstallmentValue ?? null,
        renegotiation_penalty_total: Number(loan.renegotiationPenaltyTotal ?? 0),
        due_date: loan.dueDate,
      },
      schedules: allScheds.map((s) => ({
        installment_number: s.installmentNumber,
        due_date: s.dueDate,
        amount: Number(s.amount ?? 0),
      })),
    };

    const renegRow = {
      loan_id: loanId,
      user_id: dataOwnerId,
      renegotiated_at: renegotiatedAt,
      type: params.type,
      previous_amount: remaining,
      new_amount: effectiveNewAmount,
      penalty_amount: penaltyAmount,
      penalty_mode: params.type === "with_penalty" ? (params.penaltyMode ?? null) : null,
      penalty_input: params.type === "with_penalty" ? Number(params.penaltyInput ?? 0) : null,
      previous_installments: loan.installments,
      new_installments: newInstallmentsTotal,
      notes: isPartialReneg
        ? `[Parcelas ${Array.from(selectedSet).sort((a, b) => a - b).join(", ")}] ${params.notes ?? ""}`.trim()
        : (params.notes ?? null),
      previous_state: previousState,
    };

    const { error: renegErr } = await supabase
      .from("loan_renegotiations" as any)
      .insert(renegRow as any);
    if (renegErr) throw new Error(renegErr.message);

    const overrideFirstDateTop = params.firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(params.firstDueDate)
      ? params.firstDueDate
      : null;

    const loanUpdate: any = {
      remaining_amount: newLoanRemaining,
      installments: newInstallmentsTotal,
      // custom_installment_value só faz sentido se TODAS as pendentes têm o mesmo valor.
      // No modo "first", a 1ª parcela carrega a multa → valores diferentes → null.
      custom_installment_value: (isPartialReneg || useFirstMode)
        ? null
        : customAmounts
          ? (customAmountsUniform ? customAmounts[0] : null)
          : newInstallmentValue,
      // A multa já está embutida em newAmount (e portanto em newLoanRemaining e nas parcelas).
      // Não acumular em renegotiation_penalty_total para evitar cobrança em dobro.
      renegotiation_penalty_total: Number(loan.renegotiationPenaltyTotal) || 0,
      ...(overrideFirstDateTop ? { due_date: overrideFirstDateTop } : {}),
    };

    const { error: loanErr } = await supabase
      .from("loans").update(loanUpdate).eq("id", loanId);
    if (loanErr) throw new Error(loanErr.message);

    if (hasSchedule) {
      // Estratégia: remover as parcelas selecionadas, depois reinserir desiredNewPending novas parcelas
      // mantendo as não selecionadas. Por fim, renumerar todas as pendentes em ordem cronológica
      // para manter integridade de installment_number sequencial.

      // 1) Apaga as selecionadas
      const idsToDelete = pendingScheds
        .filter((s) => selectedSet.has(s.installmentNumber) && s.id)
        .map((s) => s.id as string);
      if (idsToDelete.length > 0) {
        await supabase.from("loan_installments").delete().in("id", idsToDelete);
      }

      // 2) Calcula datas das novas parcelas: começam após a última parcela existente (paga ou não selecionada)
      const remainingScheds = pendingScheds.filter((s) => !selectedSet.has(s.installmentNumber));
      const lastDate = remainingScheds.length > 0
        ? remainingScheds[remainingScheds.length - 1].dueDate
        : (allScheds.length > 0 ? allScheds[allScheds.length - 1].dueDate : loan.dueDate);

      // Se substituiu TODAS as pendentes, manter a primeira data igual à primeira selecionada
      const firstSelectedDate = isPartialReneg
        ? null
        : (pendingScheds.find((s) => selectedSet.has(s.installmentNumber))?.dueDate || loan.dueDate);

      // Override: usuário escolheu nova data de vencimento
      const overrideFirstDate = params.firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(params.firstDueDate)
        ? params.firstDueDate
        : null;

      // 3) Cria novas parcelas
      const freq = params.frequency || "monthly";
      const stepFreq = (baseISO: string, n: number): string => {
        const d = new Date(baseISO + "T00:00:00");
        if (isNaN(d.getTime())) return baseISO;
        if (freq === "monthly") d.setMonth(d.getMonth() + n);
        else if (freq === "biweekly") d.setDate(d.getDate() + 15 * n);
        else if (freq === "weekly") d.setDate(d.getDate() + 7 * n);
        else d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
      };
      const customDates = Array.isArray(params.customDates) ? params.customDates : null;

      let acc = 0;
      const newScheds: { dueDate: string; amount: number }[] = [];
      for (let i = 0; i < desiredNewPending; i++) {
        let dueStr: string;
        const customForI = customDates && customDates[i] && /^\d{4}-\d{2}-\d{2}$/.test(customDates[i])
          ? customDates[i]
          : null;
        if (customForI) {
          dueStr = customForI;
        } else if (overrideFirstDate) {
          dueStr = stepFreq(overrideFirstDate, i);
        } else if (!isPartialReneg && i === 0 && firstSelectedDate) {
          dueStr = firstSelectedDate;
        } else {
          const baseDate = !isPartialReneg && firstSelectedDate ? firstSelectedDate : lastDate;
          const offset = !isPartialReneg && firstSelectedDate ? i : (i + 1);
          dueStr = stepFreq(baseDate, offset);
        }
        const isLast = i === desiredNewPending - 1;
        let amt: number;
        if (customAmounts) {
          // Valores personalizados: salvos exatamente como informados pelo usuário.
          amt = customAmounts[i];
        } else if (useFirstMode && i === 0) {
          amt = firstInstallmentValue;
        } else if (isLast) {
          amt = Math.round((newAmount - acc) * 100) / 100;
        } else {
          amt = baseInstallmentValue;
        }
        acc += amt;
        newScheds.push({ dueDate: dueStr, amount: amt });
      }

      // 4) Renumera tudo: pegamos as parcelas pagas + não selecionadas + novas (ordenadas por data)
      //    e reescrevemos installment_number sequencialmente.
      const paidScheds = allScheds.filter((s) => s.installmentNumber <= loan.paidInstallments);

      // Atualiza installment_number das pagas (devem manter a ordem)
      // Não tocamos as pagas — mantêm seus números (1..paidInstallments).

      // Combina pendentes não selecionadas + novas, ordena por data
      const combinedPending = [
        ...remainingScheds.map((s) => ({ id: s.id, dueDate: s.dueDate, amount: Number(s.amount || 0), isNew: false })),
        ...newScheds.map((s) => ({ id: undefined as string | undefined, dueDate: s.dueDate, amount: s.amount, isNew: true })),
      ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

      // Atualiza/insere com numeração sequencial após as pagas
      for (let i = 0; i < combinedPending.length; i++) {
        const item = combinedPending[i];
        const newNumber = loan.paidInstallments + i + 1;
        if (item.isNew) {
          await supabase.from("loan_installments").insert({
            loan_id: loanId,
            user_id: dataOwnerId,
            installment_number: newNumber,
            due_date: item.dueDate,
            amount: item.amount,
          } as any);
        } else if (item.id) {
          await supabase.from("loan_installments").update({
            installment_number: newNumber,
            amount: item.amount,
          }).eq("id", item.id);
        }
      }
    }

    setLoans((prev) => prev.map((l) => l.id === loanId ? {
      ...l,
      remainingAmount: newLoanRemaining,
      installments: newInstallmentsTotal,
      customInstallmentValue: (isPartialReneg || useFirstMode)
        ? null
        : customAmounts
          ? (customAmountsUniform ? customAmounts[0] : null)
          : newInstallmentValue,
      renegotiationPenaltyTotal: Number(l.renegotiationPenaltyTotal) || 0,
      ...(overrideFirstDateTop ? { dueDate: overrideFirstDateTop } : {}),
    } : l));

    await fetchLoans();
    await fetchSchedules();
    notifyRemoteUpdate("loans");

    // Avisa o hook useLoanRenegotiations para recarregar o histórico imediatamente
    try {
      window.dispatchEvent(
        new CustomEvent("offline-sync:flushed", {
          detail: { tables: ["loan_renegotiations", "loans", "loan_installments"] },
        }),
      );
    } catch {}
    toast.success(
      params.type === "with_penalty"
        ? `Renegociação registrada com multa de R$ ${penaltyAmount.toFixed(2)}`
        : isDiscount
          ? `Renegociação com desconto de R$ ${(remaining - newAmount).toFixed(2)} registrada`
          : "Renegociação registrada"
    );
  }, [user, dataOwnerId, loans, payments, installmentSchedules, fetchLoans, fetchSchedules]);

  return { loans, payments, installmentSchedules, addLoan, addPayment, addPartialPayment, payOffLoan, addInterestOnlyPayment, amortizeLoan, renegotiateLoan, updateLoan, deleteLoan, deletePayment, saveSchedule };
}

export function calculateInstallment(principal: number, rate: number, months: number): number {
  const total = principal * (1 + rate / 100);
  return months > 0 ? total / months : total;
}

export function computeNextDueDate(currentDueDate: string, frequency: string, paidCount: number): string {
  const base = new Date(currentDueDate + "T00:00:00");
  if (frequency === "Diário") base.setDate(base.getDate() + paidCount);
  else if (frequency === "Semanal") base.setDate(base.getDate() + 7 * paidCount);
  else if (frequency === "Quinzenal") base.setDate(base.getDate() + 15 * paidCount);
  else base.setMonth(base.getMonth() + paidCount);
  return base.toISOString().split("T")[0];
}

export function calculateTotalWithInterest(principal: number, rate: number, _months: number): number {
  return Math.round(principal * (1 + rate / 100));
}

export function getLoanRemainingAmount(loan: Loan, payments: Payment[]): number {
  // Contratos quitados sempre têm restante 0 — mesmo quando o pagamento final foi menor que o total devido (acordo/desconto).
  if (loan.status === "paid") {
    return 0;
  }

  if (loan.remainingAmount != null && loan.remainingAmount > 0) {
    return Math.max(0, loan.remainingAmount);
  }

  const totalExpected = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = payments.filter((p) => p.loanId === loan.id).reduce((sum, p) => sum + p.amount, 0);

  return Math.max(0, totalExpected - totalPaid);
}
