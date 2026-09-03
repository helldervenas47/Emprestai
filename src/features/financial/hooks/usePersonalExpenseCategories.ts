import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { notifyRemoteUpdate } from "@/lib/realtimeToast";
import { assertWritable } from "@/lib/readOnlyState";
import {
  loadSharedResource,
  invalidateSharedResource,
  readSharedResource,
  subscribeSharedResource,
  writeSharedResource,
} from "@/lib/sharedResource";

export interface CustomPersonalCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

// P1-01: staleTime alto — categorias mudam raramente.
const STALE_MS = 5 * 60_000;

async function fetchPersonalCategories(): Promise<CustomPersonalCategory[]> {
  const { data, error } = await supabase
    .from("personal_expense_categories")
    .select("id, name, icon, color")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CustomPersonalCategory[];
}

export function usePersonalExpenseCategories() {
  const { user } = useAuth();
  const cacheKey = user ? `personal_expense_categories:${user.id}` : "";
  const [categories, setCategories] = useState<CustomPersonalCategory[]>(
    () => readSharedResource<CustomPersonalCategory[]>(cacheKey) ?? [],
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setCategories([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await loadSharedResource(cacheKey, fetchPersonalCategories, { staleTime: STALE_MS });
      setCategories(rows);
    } catch (err) {
      console.error("[personal-categories] load", err);
    } finally {
      setLoading(false);
    }
  }, [user, cacheKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!cacheKey) return;
    return subscribeSharedResource(cacheKey, () => {
      const next = readSharedResource<CustomPersonalCategory[]>(cacheKey);
      if (next) setCategories(next);
    });
  }, [cacheKey]);

  const commit = useCallback((updater: (prev: CustomPersonalCategory[]) => CustomPersonalCategory[]) => {
    setCategories((prev) => {
      const next = updater(prev);
      if (cacheKey) writeSharedResource(cacheKey, next);
      return next;
    });
  }, [cacheKey]);

  const create = useCallback(
    async (input: { name: string; icon: string; color: string }) => {
      assertWritable();
      if (!user) return null;
      const name = input.name.trim();
      if (!name) return null;
      const { data, error } = await supabase
        .from("personal_expense_categories")
        .insert({ user_id: user.id, name, icon: input.icon, color: input.color })
        .select("id, name, icon, color")
        .single();
      if (error) {
        toast({
          title: "Não foi possível criar categoria",
          description: error.message.includes("duplicate") ? "Já existe uma categoria com esse nome." : error.message,
          variant: "destructive",
        });
        return null;
      }
      commit((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      toast({ title: "Categoria criada", description: name });
      return data;
    },
    [user, commit],
  );

  const update = useCallback(
    async (id: string, input: { name: string; icon: string; color: string }) => {
      assertWritable();
      const name = input.name.trim();
      if (!name) return null;

      // Lê o nome anterior para propagar a renomeação às despesas existentes.
      const previous = categories.find((c) => c.id === id);
      const previousName = previous?.name ?? null;

      const { data, error } = await supabase
        .from("personal_expense_categories")
        .update({ name, icon: input.icon, color: input.color })
        .eq("id", id)
        .select("id, name, icon, color")
        .single();
      if (error) {
        toast({
          title: "Não foi possível atualizar categoria",
          description: error.message.includes("duplicate") ? "Já existe uma categoria com esse nome." : error.message,
          variant: "destructive",
        });
        return null;
      }

      // Se o nome mudou, atualiza todas as despesas pessoais que ainda
      // referenciam o nome antigo — assim gráfico, cards e listagens
      // refletem a nova categoria automaticamente.
      if (previousName && previousName !== name && user) {
        const { error: expErr } = await supabase
          .from("expenses")
          .update({ category: name })
          .eq("user_id", user.id)
          .eq("scope", "personal")
          .eq("category", previousName);
        if (expErr) {
          console.error("[personal-categories] propagate rename to expenses", expErr);
        }
        // Propaga também aos orçamentos pessoais por categoria.
        const { error: budErr } = await supabase
          .from("personal_budgets")
          .update({ category: name })
          .eq("user_id", user.id)
          .eq("category", previousName);
        if (budErr) {
          console.error("[personal-categories] propagate rename to budgets", budErr);
        }
      }

      commit((prev) => prev.map((c) => (c.id === id ? data : c)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      toast({ title: "Categoria atualizada", description: name });
      return data;
    },
    [categories, user, commit],
  );
  const remove = useCallback(async (id: string) => {
    assertWritable();
    const { error } = await supabase.from("personal_expense_categories").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    commit((prev) => prev.filter((c) => c.id !== id));
  }, [commit]);

  const reload = useCallback(() => {
    if (cacheKey) invalidateSharedResource(cacheKey);
    return load();
  }, [cacheKey, load]);

  return { categories, loading, create, update, remove, reload };
}
