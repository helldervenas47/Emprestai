import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { assertWritable } from "@/lib/readOnlyState";

export interface BoletoHistoryItem {
  id: string;
  digits: string;
  barcode: string | null;
  kind: "bancario" | "arrecadacao";
  bank_code: string | null;
  bank_name: string | null;
  segment: string | null;
  segment_label: string | null;
  amount: number;
  due_date: string | null;
  label: string;
  parsed_at: string;
  pix_brcode?: string | null;
}

const LOCAL_KEY = "boleto.history.v1";
const MAX = 30;
const BOLETO_LOOKUP_COLUMNS =
  "id, digits, barcode, kind, bank_code, bank_name, segment, segment_label, amount, due_date, label, parsed_at, pix_brcode";

function loadLocal(): BoletoHistoryItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveLocal(items: BoletoHistoryItem[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, MAX))); } catch { /* noop */ }
}

export function useBoletoHistory() {
  const { user } = useAuth();
  const [items, setItems] = useState<BoletoHistoryItem[]>(() => loadLocal());
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("boleto_lookups")
      .select(BOLETO_LOOKUP_COLUMNS)
      .order("parsed_at", { ascending: false })
      .limit(MAX);
    setLoading(false);
    if (!error && data) {
      const mapped = data.map((d: any) => ({
        id: d.id,
        digits: d.digits,
        barcode: d.barcode,
        kind: d.kind,
        bank_code: d.bank_code,
        bank_name: d.bank_name,
        segment: d.segment,
        segment_label: d.segment_label,
        amount: Number(d.amount) || 0,
        due_date: d.due_date,
        label: d.label,
        parsed_at: d.parsed_at,
        pix_brcode: d.pix_brcode ?? null,
      })) as BoletoHistoryItem[];
      setItems(mapped);
      saveLocal(mapped);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setItems(loadLocal());
      return;
    }
    fetchItems();
    const ch = supabase
      .channel(`boleto-lookups:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boleto_lookups", filter: `user_id=eq.${user.id}` },
        () => fetchItems(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchItems]);

  const addItem = useCallback(async (input: Omit<BoletoHistoryItem, "id" | "parsed_at"> & { parsed_at?: string }) => {
    assertWritable();
    const parsed_at = input.parsed_at ?? new Date().toISOString();
    if (!user) {
      const local: BoletoHistoryItem = { ...input, id: crypto.randomUUID(), parsed_at };
      const next = [local, ...items.filter((i) => i.digits !== input.digits)].slice(0, MAX);
      setItems(next);
      saveLocal(next);
      return;
    }
    // upsert by (owner_id, digits)
    const { data: ownerRow } = await supabase.rpc("get_data_owner_id", { _user_id: user.id });
    const owner_id = (ownerRow as unknown as string) ?? user.id;
    await supabase.from("boleto_lookups").upsert(
      {
        user_id: user.id,
        owner_id,
        digits: input.digits,
        barcode: input.barcode,
        kind: input.kind,
        bank_code: input.bank_code,
        bank_name: input.bank_name,
        segment: input.segment,
        segment_label: input.segment_label,
        amount: input.amount,
        due_date: input.due_date,
        label: input.label,
        parsed_at,
        pix_brcode: input.pix_brcode ?? null,
      },
      { onConflict: "owner_id,digits" },
    );
    fetchItems();
  }, [user, items, fetchItems]);

  const clear = useCallback(async () => {
    assertWritable();
    if (!user) {
      setItems([]);
      saveLocal([]);
      return;
    }
    await supabase.from("boleto_lookups").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setItems([]);
    saveLocal([]);
  }, [user]);

  const remove = useCallback(async (id: string) => {
    assertWritable();
    if (!user) {
      const next = items.filter((i) => i.id !== id);
      setItems(next);
      saveLocal(next);
      return;
    }
    await supabase.from("boleto_lookups").delete().eq("id", id);
  }, [user, items]);

  return { items, loading, addItem, clear, remove, refresh: fetchItems };
}
