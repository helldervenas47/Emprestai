import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwner } from "@/hooks/useDataOwner";
import { toast } from "sonner";
import { assertWritable } from "@/lib/readOnlyState";

const CREDIT_CARD_COLUMNS =
  "id, nickname, bank, brand, last_four, credit_limit, closing_day, due_day, active";

export interface CreditCard {
  id: string;
  nickname: string;
  bank: string;
  brand: string;
  lastFour: string;
  creditLimit: number;
  closingDay: number;
  dueDay: number;
  active: boolean;
}

export interface CreditCardInput {
  nickname: string;
  bank: string;
  brand: string;
  lastFour: string;
  creditLimit: number;
  closingDay: number;
  dueDay: number;
  active?: boolean;
}

const fromRow = (r: any): CreditCard => ({
  id: r.id,
  nickname: r.nickname ?? "",
  bank: r.bank,
  brand: r.brand ?? "visa",
  lastFour: r.last_four ?? "",
  creditLimit: Number(r.credit_limit ?? 0),
  closingDay: r.closing_day,
  dueDay: r.due_day,
  active: r.active ?? true,
});

export function useCreditCards() {
  const { user } = useAuth();
  const ownerId = useDataOwner();
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ownerId) return;
    const { data, error } = await supabase
      .from("credit_cards")
      .select(CREDIT_CARD_COLUMNS)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar cartões");
      return;
    }
    setCards((data ?? []).map(fromRow));
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (user && ownerId) load();
  }, [user, ownerId, load]);

  const addCard = async (input: CreditCardInput) => {
    assertWritable();
    if (!ownerId) return;
    const { data, error } = await supabase
      .from("credit_cards")
      .insert({
        user_id: ownerId,
        nickname: input.nickname,
        bank: input.bank,
        brand: input.brand,
        last_four: input.lastFour,
        credit_limit: input.creditLimit,
        closing_day: input.closingDay,
        due_day: input.dueDay,
        active: input.active ?? true,
      })
      .select()
      .single();
    if (error) {
      toast.error("Erro ao salvar cartão");
      return;
    }
    setCards((prev) => [...prev, fromRow(data)]);
    toast.success("Cartão cadastrado");
  };

  const updateCard = async (id: string, input: CreditCardInput) => {
    assertWritable();
    const { data, error } = await supabase
      .from("credit_cards")
      .update({
        nickname: input.nickname,
        bank: input.bank,
        brand: input.brand,
        last_four: input.lastFour,
        credit_limit: input.creditLimit,
        closing_day: input.closingDay,
        due_day: input.dueDay,
        ...(input.active !== undefined ? { active: input.active } : {}),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      toast.error("Erro ao atualizar cartão");
      return;
    }
    setCards((prev) => prev.map((c) => (c.id === id ? fromRow(data) : c)));
    toast.success("Cartão atualizado");
  };

  const deleteCard = async (id: string) => {
    assertWritable();
    const { error } = await supabase.from("credit_cards").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir cartão");
      return;
    }
    setCards((prev) => prev.filter((c) => c.id !== id));
    toast.success("Cartão removido");
  };

  return { cards, loading, addCard, updateCard, deleteCard };
}
