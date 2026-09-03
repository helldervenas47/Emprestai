import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { toast } from "sonner";

export const DEFAULT_BUSINESS_CATEGORIES = [
  "Aluguel",
  "Energia",
  "Água",
  "Internet",
  "Telefone",
  "Alimentação",
  "Transporte",
  "Salários",
  "Impostos",
  "Outros",
].sort((a, b) => a.localeCompare(b, "pt-BR"));

export function useBusinessExpenseCategories() {
  const { user } = useAuth();
  const { expenses } = useExpenses();
  const storageKey = `business_expense_custom_categories:${user?.id || "global"}`;

  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignora erro de parsing
    }
    return [];
  });

  // Atualiza do storage se mudar a conta/usuário
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCustomCategories(parsed);
          return;
        }
      }
    } catch {
      // noop
    }
    setCustomCategories([]);
  }, [storageKey]);

  // Sincroniza alterações em abas diferentes
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setCustomCategories(parsed);
        } catch {
          // noop
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKey]);

  // Unifica categorias padrão + customizadas + existentes em despesas do histórico
  const categories = useMemo(() => {
    const categorySet = new Set<string>();

    // 1. Categorias padrão
    DEFAULT_BUSINESS_CATEGORIES.forEach((c) => categorySet.add(c.trim()));

    // 2. Categorias existentes em despesas empresariais
    (expenses || []).forEach((e) => {
      if ((e.scope ?? "business") === "business" && e.category && e.category.trim()) {
        categorySet.add(e.category.trim());
      }
    });

    // 3. Categorias customizadas
    customCategories.forEach((c) => {
      if (c && c.trim()) categorySet.add(c.trim());
    });

    return Array.from(categorySet).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [expenses, customCategories]);

  const addCategory = useCallback(
    (rawName: string): string | null => {
      const name = rawName.trim();
      if (!name) {
        toast.error("O nome da categoria não pode ficar em branco.");
        return null;
      }

      // Verifica se já existe com mesmo nome (case-insensitive)
      const existing = categories.find((c) => c.toLowerCase() === name.toLowerCase());
      if (existing) {
        toast.info(`A categoria "${existing}" já está disponível.`);
        return existing;
      }

      const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
      const updated = [...customCategories, formattedName].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      );

      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // noop
      }

      setCustomCategories(updated);
      toast.success(`Categoria "${formattedName}" criada com sucesso!`);
      return formattedName;
    },
    [categories, customCategories, storageKey],
  );

  return {
    categories,
    customCategories,
    addCategory,
  };
}
