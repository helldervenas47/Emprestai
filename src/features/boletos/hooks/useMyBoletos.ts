import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { assertWritable } from "@/lib/readOnlyState";

export type MyBoletoStatus = "pendente" | "pago" | "vencido";

export interface MyBoleto {
  id: string;
  description: string;
  beneficiary: string | null;
  category: string | null;
  status: MyBoletoStatus;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  digits: string | null;
  barcode: string | null;
  bank_code: string | null;
  bank_name: string | null;
  segment: string | null;
  segment_label: string | null;
  kind: string | null;
  notes: string | null;
  attachment_path: string | null;
  pix_brcode: string | null;
  expense_id: string | null;
  income_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MyBoletoPayment {
  id: string;
  boleto_id: string;
  paid_at: string;
  amount: number;
  payment_method: string | null;
  status: string;
  notes: string | null;
  user_name: string | null;
  user_id: string;
  created_at: string;
}

export type MyBoletoInput = Partial<Pick<MyBoleto, "expense_id" | "income_id">> &
  Omit<MyBoleto, "id" | "created_at" | "updated_at" | "status" | "expense_id" | "income_id"> & {
    status?: MyBoletoStatus;
  };

export interface PaymentInput {
  paid_at?: string;
  amount: number;
  payment_method?: string | null;
  status?: string;
  notes?: string | null;
}

const BOLETO_COLUMNS =
  "id, description, beneficiary, category, status, amount, due_date, paid_at, digits, barcode, bank_code, bank_name, segment, segment_label, kind, notes, attachment_path, pix_brcode, expense_id, income_id, created_at, updated_at";
const BOLETO_PAYMENT_COLUMNS =
  "id, boleto_id, paid_at, amount, payment_method, status, notes, user_name, user_id, created_at";

export function useMyBoletos() {
  const { user } = useAuth();
  const [items, setItems] = useState<MyBoleto[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!user) { setItems([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("my_boletos")
      .select(BOLETO_COLUMNS)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    setLoading(false);
    if (!error && data) setItems(data as MyBoleto[]);
  }, [user]);

  useEffect(() => {
    fetchItems();
    if (!user) return;
    const ch = supabase.channel(`my_boletos_changes_${crypto.randomUUID()}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "my_boletos" }, () => fetchItems());
    ch.on("postgres_changes", { event: "*", schema: "public", table: "my_boleto_payments" }, () => fetchItems());
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchItems]);

  const add = useCallback(async (input: MyBoletoInput): Promise<string> => {
    assertWritable();
    if (!user) throw new Error("not-auth");
    const { data: ownerRow } = await supabase.rpc("get_data_owner_id", { _user_id: user.id });
    const owner_id = (ownerRow as unknown as string) ?? user.id;
    const { data, error } = await supabase.from("my_boletos").insert({
      ...input,
      user_id: user.id,
      owner_id,
      status: input.status ?? "pendente",
    }).select("id").single();
    if (error) throw error;
    await fetchItems();
    return (data as any).id as string;
  }, [user, fetchItems]);

  const syncExpensePaid = useCallback(async (expenseId: string | null | undefined, paid: boolean, paidDate: string | null) => {
    assertWritable();
    if (!expenseId) return;
    try {
      await supabase
        .from("expenses")
        .update({ paid, paid_date: paid ? paidDate : null })
        .eq("id", expenseId);
    } catch { /* noop */ }
  }, []);

  const update = useCallback(async (id: string, patch: Partial<MyBoletoInput & { status: MyBoletoStatus }>) => {
    assertWritable();
    const { error } = await supabase.from("my_boletos").update(patch).eq("id", id);
    if (error) throw error;
    await fetchItems();
  }, [fetchItems]);

  const remove = useCallback(async (id: string) => {
    assertWritable();
    const item = items.find((i) => i.id === id);
    if (item?.expense_id) {
      await syncExpensePaid(item.expense_id, false, null);
    }
    if (item?.attachment_path) {
      await supabase.storage.from("boleto-attachments").remove([item.attachment_path]).catch(() => {});
    }
    const { error } = await supabase.from("my_boletos").delete().eq("id", id);
    if (error) throw error;
    await fetchItems();
  }, [items, fetchItems, syncExpensePaid]);

  const recordPayment = useCallback(async (boletoId: string, payment: PaymentInput) => {
    assertWritable();
    if (!user) throw new Error("not-auth");
    const { data: ownerRow } = await supabase.rpc("get_data_owner_id", { _user_id: user.id });
    const owner_id = (ownerRow as unknown as string) ?? user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const paid_at = payment.paid_at ?? new Date().toISOString().slice(0, 10);
    const status = payment.status ?? "pago";
    const { error: insErr } = await supabase.from("my_boleto_payments").insert({
      boleto_id: boletoId,
      owner_id,
      user_id: user.id,
      paid_at,
      amount: payment.amount,
      payment_method: payment.payment_method ?? null,
      status,
      notes: payment.notes ?? null,
      user_name: profile?.display_name ?? user.email ?? null,
    });
    if (insErr) throw insErr;
    if (status === "pago") {
      await update(boletoId, { status: "pago", paid_at });
      const b = items.find((x) => x.id === boletoId);
      if (b?.expense_id) await syncExpensePaid(b.expense_id, true, paid_at);
    }
  }, [user, update, items, syncExpensePaid]);

  const markPaid = useCallback(async (id: string) => {
    const b = items.find((x) => x.id === id);
    await recordPayment(id, {
      amount: Number(b?.amount) || 0,
      payment_method: null,
      status: "pago",
    });
  }, [items, recordPayment]);

  const listPayments = useCallback(async (boletoId: string): Promise<MyBoletoPayment[]> => {
    const { data, error } = await supabase
      .from("my_boleto_payments")
      .select(BOLETO_PAYMENT_COLUMNS)
      .eq("boleto_id", boletoId)
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []) as MyBoletoPayment[];
  }, []);

  const deletePayment = useCallback(async (paymentId: string) => {
    assertWritable();
    // Descobre o boleto vinculado antes de excluir
    const { data: payRow } = await supabase
      .from("my_boleto_payments")
      .select("boleto_id")
      .eq("id", paymentId)
      .maybeSingle();
    const boletoId = (payRow as any)?.boleto_id as string | undefined;

    const { error } = await supabase.from("my_boleto_payments").delete().eq("id", paymentId);
    if (error) throw error;

    if (!boletoId) {
      await fetchItems();
      return;
    }
    // Sempre reverte o boleto para pendente ao excluir um pagamento
    await supabase.from("my_boletos").update({ status: "pendente", paid_at: null }).eq("id", boletoId);
    const { data: b } = await supabase
      .from("my_boletos")
      .select("expense_id")
      .eq("id", boletoId)
      .maybeSingle();
    const expId = (b as any)?.expense_id as string | null | undefined;
    if (expId) await syncExpensePaid(expId, false, null);
    await fetchItems();
  }, [syncExpensePaid, fetchItems]);

  const uploadAttachment = useCallback(async (file: File): Promise<string> => {
    if (!user) throw new Error("not-auth");
    const { data: ownerRow } = await supabase.rpc("get_data_owner_id", { _user_id: user.id });
    const owner_id = (ownerRow as unknown as string) ?? user.id;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${owner_id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("boleto-attachments").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    return path;
  }, [user]);

  const getAttachmentUrl = useCallback(async (path: string) => {
    const { data } = await supabase.storage.from("boleto-attachments").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }, []);

  const linkExpense = useCallback(async (boletoId: string, expenseId: string) => {
    assertWritable();
    // Garante 1:1 — desvincula qualquer outro boleto que já aponte para essa despesa
    await supabase.from("my_boletos").update({ expense_id: null }).eq("expense_id", expenseId);
    const { error } = await supabase.from("my_boletos").update({ expense_id: expenseId }).eq("id", boletoId);
    if (error) throw error;
    await fetchItems();
  }, [fetchItems]);

  const unlinkExpense = useCallback(async (boletoId: string) => {
    assertWritable();
    const { error } = await supabase.from("my_boletos").update({ expense_id: null }).eq("id", boletoId);
    if (error) throw error;
    await fetchItems();
  }, [fetchItems]);

  const linkIncome = useCallback(async (boletoId: string, incomeId: string) => {
    assertWritable();
    // Garante 1:1 — desvincula qualquer outro boleto que já aponte para essa receita
    await supabase.from("my_boletos").update({ income_id: null }).eq("income_id", incomeId);
    const { error } = await supabase.from("my_boletos").update({ income_id: incomeId }).eq("id", boletoId);
    if (error) throw error;
    await fetchItems();
  }, [fetchItems]);

  const unlinkIncome = useCallback(async (boletoId: string) => {
    assertWritable();
    const { error } = await supabase.from("my_boletos").update({ income_id: null }).eq("id", boletoId);
    if (error) throw error;
    await fetchItems();
  }, [fetchItems]);

  const createExpenseFromBoleto = useCallback(async (
    boletoId: string,
    opts: { scope: "business" | "personal"; category: string; type?: "fixa" | "recorrente" },
  ): Promise<string> => {
    assertWritable();
    if (!user) throw new Error("not-auth");
    const { data: ownerRow } = await supabase.rpc("get_data_owner_id", { _user_id: user.id });
    const owner_id = (ownerRow as unknown as string) ?? user.id;
    const b = items.find((x) => x.id === boletoId);
    if (!b) throw new Error("Boleto não encontrado");
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        user_id: owner_id,
        description: b.description,
        amount: Number(b.amount) || 0,
        category: opts.category,
        type: opts.type ?? "fixa",
        due_date: b.due_date ?? today,
        notes: `Gerada a partir do boleto "${b.description}"`,
        scope: opts.scope,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("Falha ao criar despesa");
    await linkExpense(boletoId, (data as any).id);
    return (data as any).id as string;
  }, [user, items, linkExpense]);

  return {
    items, loading, add, update, remove, markPaid,
    recordPayment, listPayments, deletePayment,
    uploadAttachment, getAttachmentUrl, refresh: fetchItems,
    linkExpense, unlinkExpense, createExpenseFromBoleto,
    linkIncome, unlinkIncome,
  };
}
