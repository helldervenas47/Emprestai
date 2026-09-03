import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { LoanRenegotiation } from "@/types/loan";
import { notifyRemoteUpdate } from "@/lib/realtimeToast";
import { assertWritable } from "@/lib/readOnlyState";

function rowToRenegotiation(r: any): LoanRenegotiation {
  return {
    id: r.id,
    loanId: r.loan_id,
    userId: r.user_id,
    renegotiatedAt: r.renegotiated_at,
    type: r.type,
    previousAmount: Number(r.previous_amount ?? 0),
    newAmount: Number(r.new_amount ?? 0),
    penaltyAmount: Number(r.penalty_amount ?? 0),
    penaltyMode: r.penalty_mode ?? null,
    penaltyInput: r.penalty_input != null ? Number(r.penalty_input) : null,
    previousInstallments: r.previous_installments ?? null,
    newInstallments: r.new_installments ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
  };
}

const LOAN_RENEGOTIATION_COLUMNS =
  "id, loan_id, user_id, renegotiated_at, type, previous_amount, new_amount, penalty_amount, penalty_mode, penalty_input, previous_installments, new_installments, notes, created_at";
const LOAN_RENEGOTIATION_WITH_SNAPSHOT_COLUMNS = `${LOAN_RENEGOTIATION_COLUMNS}, previous_state`;

export function useLoanRenegotiations() {
  const { user, dataOwnerId } = useAuth();
  const instanceId = useId();
  const [renegotiations, setRenegotiations] = useState<LoanRenegotiation[]>([]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("loan_renegotiations" as any)
      .select(LOAN_RENEGOTIATION_COLUMNS)
      .order("created_at", { ascending: false });
    if (!error && data) setRenegotiations((data as any[]).map(rowToRenegotiation));
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, dataOwnerId]);

  // Refetch quando o evento de sync local for disparado (ex: após criar/excluir renegociação)
  useEffect(() => {
    const handler = (e: any) => {
      const tables: string[] = e?.detail?.tables || [];
      if (tables.includes("loan_renegotiations") || tables.includes("loans")) {
        fetchAll();
      }
    };
    window.addEventListener("offline-sync:flushed", handler);
    return () => window.removeEventListener("offline-sync:flushed", handler);
  }, [fetchAll]);

  // Realtime: atualiza quando outra aba/dispositivo inserir/alterar renegociações
  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const channel = supabase
      .channel(`loan-renegotiations:${dataOwnerId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loan_renegotiations", filter: `user_id=eq.${dataOwnerId}` },
        () => { fetchAll(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, dataOwnerId, fetchAll, instanceId]);

  const updateRenegotiation = useCallback(
    async (
      id: string,
      patch: { notes?: string | null; type?: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null },
    ) => {
      assertWritable();
      const updatePayload: any = {};
      if (patch.notes !== undefined) updatePayload.notes = patch.notes;
      if (patch.type !== undefined) updatePayload.type = patch.type;
      if (patch.penaltyMode !== undefined) updatePayload.penalty_mode = patch.penaltyMode;
      if (patch.penaltyInput !== undefined) updatePayload.penalty_input = patch.penaltyInput;
      const { error } = await supabase
        .from("loan_renegotiations" as any)
        .update(updatePayload)
        .eq("id", id);
      if (error) throw new Error(error.message);
      setRenegotiations((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                notes: patch.notes !== undefined ? patch.notes : r.notes,
                type: patch.type !== undefined ? patch.type : r.type,
                penaltyMode: patch.penaltyMode !== undefined ? patch.penaltyMode : r.penaltyMode,
                penaltyInput: patch.penaltyInput !== undefined ? patch.penaltyInput : r.penaltyInput,
              }
            : r,
        ),
      );
    },
    [],
  );

  const deleteRenegotiation = useCallback(async (id: string) => {
    assertWritable();
    // Busca o registro com snapshot para reverter o contrato
    const { data: row, error: fetchErr } = await supabase
      .from("loan_renegotiations" as any)
      .select(LOAN_RENEGOTIATION_WITH_SNAPSHOT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("Renegociação não encontrada");

    const snapshot = (row as any).previous_state as
      | { version?: number; loan?: any; schedules?: Array<{ installment_number: number; due_date: string; amount: number }> }
      | null
      | undefined;

    if (!snapshot || !snapshot.loan) {
      throw new Error(
        "Esta renegociação foi criada antes do recurso de reversão e não pode ser excluída. Apenas renegociações novas podem ser revertidas.",
      );
    }

    const loanId = (row as any).loan_id as string;
    const penaltyApplied = Number((row as any).penalty_amount ?? 0);

    // 1) Reverte os campos do contrato
    const loanPatch: any = {
      remaining_amount: Number(snapshot.loan.remaining_amount ?? 0),
      installments: Number(snapshot.loan.installments ?? 1),
      custom_installment_value: snapshot.loan.custom_installment_value ?? null,
      renegotiation_penalty_total: Number(snapshot.loan.renegotiation_penalty_total ?? 0),
      due_date: snapshot.loan.due_date,
    };
    const { error: loanErr } = await supabase.from("loans").update(loanPatch).eq("id", loanId);
    if (loanErr) throw new Error(loanErr.message);

    // 2) Recria o cronograma exatamente como estava no snapshot
    if (Array.isArray(snapshot.schedules)) {
      // Apaga cronograma atual
      await supabase.from("loan_installments").delete().eq("loan_id", loanId);
      if (snapshot.schedules.length > 0 && dataOwnerId) {
        const rows = snapshot.schedules.map((s) => ({
          loan_id: loanId,
          user_id: dataOwnerId,
          installment_number: s.installment_number,
          due_date: s.due_date,
          amount: s.amount,
        }));
        const { error: insErr } = await supabase.from("loan_installments").insert(rows as any);
        if (insErr) throw new Error(insErr.message);
      }
    }

    // 3) Remove o registro de renegociação
    const { error: delErr } = await supabase.from("loan_renegotiations" as any).delete().eq("id", id);
    if (delErr) throw new Error(delErr.message);

    setRenegotiations((prev) => prev.filter((r) => r.id !== id));

    // Dispara refresh local imediato dos hooks de loans/parcelas (sem esperar realtime)
    try {
      window.dispatchEvent(
        new CustomEvent("offline-sync:flushed", {
          detail: { tables: ["loans", "loan_installments", "payments"] },
        }),
      );
    } catch {}

    // Notifica outros dispositivos (toast)
    notifyRemoteUpdate("loans");
    notifyRemoteUpdate("loan_installments");

    // Recarrega o próprio histórico de renegociações
    await fetchAll();

    return { revertedPenalty: penaltyApplied };
  }, [dataOwnerId, fetchAll]);

  return { renegotiations, refresh: fetchAll, updateRenegotiation, deleteRenegotiation };
}
