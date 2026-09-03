import { useState, useEffect, useCallback, useId } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { ManagerCommission } from "@/types/loan";
import { assertWritable } from "@/lib/readOnlyState";

export function useManagerCommissions(enabled: boolean = true) {
  const { user, dataOwnerId } = useAuth();
  const instanceId = useId();
  const [commissions, setCommissions] = useState<ManagerCommission[]>([]);

  const fetch = useCallback(async () => {
    if (!user || !enabled) return;
    const BASE_COLUMNS =
      "id, loan_id, manager_id, payment_id, commission_type, base_amount, rate, amount, generated_at, notes, created_at";
    const FROZEN_COLUMNS = `${BASE_COLUMNS}, installment_number, manager_name_snapshot, source, locked`;

    // Tenta ler as colunas de congelamento; se a migração ainda não foi
    // aplicada no Supabase, cai para o conjunto básico sem quebrar a tela.
    let { data, error } = await supabase
      .from("manager_commissions")
      .select(FROZEN_COLUMNS)
      .order("generated_at", { ascending: false });

    if (error) {
      const fallback = await supabase
        .from("manager_commissions")
        .select(BASE_COLUMNS)
        .order("generated_at", { ascending: false });
      data = fallback.data as any;
    }

    if (data) {

      setCommissions(
        data.map((c: any) => ({
          id: c.id,
          loanId: c.loan_id,
          managerId: c.manager_id,
          paymentId: c.payment_id,
          commissionType: c.commission_type as "interest" | "full",
          baseAmount: Number(c.base_amount),
          rate: Number(c.rate),
          amount: Number(c.amount),
          generatedAt: c.generated_at,
          installmentNumber:
            typeof c.installment_number === "number" ? c.installment_number : null,
          managerNameSnapshot: c.manager_name_snapshot ?? null,
          source: c.source ?? null,
          locked: c.locked ?? null,
          notes: c.notes,
          createdAt: c.created_at,
        }))
      );
    }
  }, [user, enabled]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!user || !enabled || !dataOwnerId) return;
    const channel = supabase
      .channel(`manager-commissions:${dataOwnerId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "manager_commissions", filter: `user_id=eq.${dataOwnerId}` },
        () => fetch()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loans", filter: `user_id=eq.${dataOwnerId}` },
        () => fetch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, enabled, dataOwnerId, fetch, instanceId]);

  const addCommission = useCallback(
    async (params: {
      loanId: string;
      managerId: string;
      paymentId?: string | null;
      commissionType: "interest" | "full";
      baseAmount: number;
      rate: number;
      generatedAt: string;
      notes?: string;
    }) => {
      assertWritable();
      if (!user || !dataOwnerId) return;
      const amount = (params.baseAmount * params.rate) / 100;
      const { error } = await supabase.from("manager_commissions").insert({
        user_id: dataOwnerId!,
        loan_id: params.loanId,
        manager_id: params.managerId,
        payment_id: params.paymentId ?? null,
        commission_type: params.commissionType,
        base_amount: params.baseAmount,
        rate: params.rate,
        amount,
        generated_at: params.generatedAt,
        notes: params.notes ?? null,
      } as any);
      if (!error) await fetch();
    },
    [user, dataOwnerId, fetch]
  );

  return { commissions, addCommission, refresh: fetch };
}
