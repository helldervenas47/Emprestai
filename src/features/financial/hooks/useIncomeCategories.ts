import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { displayIncomeCategory, incomeCategoryKey } from "@/features/financial/lib/incomeCategory";
import { assertWritable } from "@/lib/readOnlyState";
import {
  loadSharedResource,
  invalidateSharedResource,
  readSharedResource,
  subscribeSharedResource,
  writeSharedResource,
} from "@/lib/sharedResource";

export interface CustomIncomeCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

// P1-01: staleTime alto — categorias mudam raramente.
const STALE_MS = 5 * 60_000;

async function fetchIncomeCategories(): Promise<CustomIncomeCategory[]> {
  const { data, error } = await supabase
    .from("income_categories" as any)
    .select("id, name, icon, color")
    .order("name", { ascending: true });
  if (error) throw error;
  const seen = new Set<string>();
  return ((data ?? []) as any[]).reduce<CustomIncomeCategory[]>((acc, row) => {
    const key = incomeCategoryKey(row.name);
    if (seen.has(key)) return acc;
    seen.add(key);
    acc.push({ ...row, name: displayIncomeCategory(row.name) });
    return acc;
  }, []);
}

export function useIncomeCategories() {
  const { user } = useAuth();
  const cacheKey = user ? `income_categories:${user.id}` : "";
  const [categories, setCategories] = useState<CustomIncomeCategory[]>(
    () => readSharedResource<CustomIncomeCategory[]>(cacheKey) ?? [],
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setCategories([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await loadSharedResource(cacheKey, fetchIncomeCategories, { staleTime: STALE_MS });
      setCategories(rows);
    } catch (err) {
      console.error("[income-categories] load", err);
    } finally {
      setLoading(false);
    }
  }, [user, cacheKey]);

  useEffect(() => { load(); }, [load]);

  // Assina o cache: se outro hook/tela invalidar ou atualizar, refletir aqui.
  useEffect(() => {
    if (!cacheKey) return;
    return subscribeSharedResource(cacheKey, () => {
      const next = readSharedResource<CustomIncomeCategory[]>(cacheKey);
      if (next) setCategories(next);
    });
  }, [cacheKey]);

  // Atualiza estado local + cache compartilhado atomicamente.
  const commit = useCallback((updater: (prev: CustomIncomeCategory[]) => CustomIncomeCategory[]) => {
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
      const rawName = input.name.trim();
      if (!rawName) return null;
      const name = displayIncomeCategory(rawName);
      const existing = categories.find((c) => incomeCategoryKey(c.name) === incomeCategoryKey(name));
      if (existing) return existing;
      const { data, error } = await supabase
        .from("income_categories" as any)
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
      const created = data as any as CustomIncomeCategory;
      commit((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      toast({ title: "Categoria criada", description: name });
      return created;
    },
    [user, categories, commit],
  );

  const update = useCallback(
    async (id: string, input: { name: string; icon: string; color: string }) => {
      assertWritable();
      if (!user) return null;
      const rawName = input.name.trim();
      if (!rawName) return null;
      const name = displayIncomeCategory(rawName);
      const { data, error } = await supabase
        .from("income_categories" as any)
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
      const updated = data as any as CustomIncomeCategory;
      commit((prev) => prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      toast({ title: "Categoria atualizada", description: name });
      return updated;
    },
    [user, commit],
  );

  const remove = useCallback(
    async (id: string) => {
      assertWritable();
      if (!user) return;
      const { error } = await supabase.from("income_categories" as any).delete().eq("id", id);
      if (error) {
        toast({
          title: "Não foi possível excluir categoria",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      commit((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "Categoria excluída" });
    },
    [user, commit],
  );

  const reload = useCallback(() => {
    if (cacheKey) invalidateSharedResource(cacheKey);
    return load();
  }, [cacheKey, load]);

  return { categories, loading, create, update, remove, reload };
}
