import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import type { Category } from "@/features/loans/components/list/types";

export interface FilterState {
  selectedCategories: Category[];
  dueDateQuick: "yesterday" | "today" | "tomorrow" | null;
  dateFrom: string;
  dateTo: string;
  dueDateFrom: string;
  dueDateTo: string;
  amountMin: string;
  amountMax: string;
  tagFilter: string;
  notesFilter: "all" | "with" | "without";
  notesSearch: string;
  sortBy: "dueDate" | "startDate" | "amount" | "name";
}

export interface SavedFilter {
  id: string;
  name: string;
  state: FilterState;
}

const MAX_FILTERS = 5;

export function useSavedFilters() {
  const { user } = useAuth();
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);

  // Load from Supabase
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("loan_saved_filters" as any)
        .select("id, name, state")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
        
      if (!error && data) {
        setSavedFilters(data as SavedFilter[]);
      }
      setLoading(false);
    })();
  }, [user]);

  const saveFilter = useCallback(async (name: string, state: FilterState) => {
    if (!user) return false;
    if (savedFilters.length >= MAX_FILTERS) {
      toast.error(`Limite atingido`, { 
        description: `Você já possui ${MAX_FILTERS} filtros salvos. Exclua um antes de salvar outro.`
      });
      return false;
    }

    const newId = crypto.randomUUID();
    const newFilter = { id: newId, name, state };
    
    // Optimistic update
    setSavedFilters((prev) => [...prev, newFilter]);
    toast.success("Filtro salvo com sucesso!");

    // Background persist
    const { error } = await supabase.from("loan_saved_filters" as any).insert({
      id: newId,
      user_id: user.id,
      name,
      state,
    });

    if (error) {
       toast.error("Erro ao salvar o filtro no banco de dados.");
       console.error("Save filter error", error);
    }
    return true;
  }, [user, savedFilters]);

  const deleteFilter = useCallback(async (id: string) => {
    if (!user) return;
    setSavedFilters((prev) => prev.filter((f) => f.id !== id));
    toast.success("Filtro excluído.");

    const { error } = await supabase.from("loan_saved_filters" as any).delete().eq("id", id);
    if (error) console.error("Delete filter error", error);
  }, [user]);

  const renameFilter = useCallback(async (id: string, newName: string) => {
    if (!user) return;
    setSavedFilters((prev) => prev.map((f) => f.id === id ? { ...f, name: newName } : f));
    toast.success("Filtro renomeado.");

    const { error } = await supabase.from("loan_saved_filters" as any).update({ name: newName }).eq("id", id);
    if (error) console.error("Rename filter error", error);
  }, [user]);

  const duplicateFilter = useCallback(async (id: string) => {
    const target = savedFilters.find((f) => f.id === id);
    if (!target) return;
    const baseName = `${target.name} (Cópia)`;
    await saveFilter(baseName, target.state);
  }, [savedFilters, saveFilter]);

  return {
    savedFilters,
    loading,
    saveFilter,
    deleteFilter,
    renameFilter,
    duplicateFilter,
    maxLimit: MAX_FILTERS,
  };
}
