// Detecta se o usuário atual ainda não passou pelo onboarding.
// Heurística: 0 categorias pessoais E flag local não setada.
// É barato (uma query count) e roda só uma vez por sessão.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";

const LS_KEY = (uid: string) => `emprestai-onboarded-${uid}`;

export function useNeedsOnboarding(): { loading: boolean; needs: boolean } {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [needs, setNeeds] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const uid = user?.id;
    if (!uid) {
      setLoading(false);
      setNeeds(false);
      return;
    }
    // Fast path: flag local
    try {
      if (localStorage.getItem(LS_KEY(uid))) {
        setNeeds(false);
        setLoading(false);
        return;
      }
    } catch { /* noop */ }

    // Usuários já existentes (conta criada há mais de 5 minutos) não passam pela tela de boas-vindas.
    const createdAt = user?.created_at ? new Date(user.created_at).getTime() : 0;
    const isRecentlyCreated = createdAt > 0 && (Date.now() - createdAt) < 5 * 60 * 1000;
    if (!isRecentlyCreated) {
      try { localStorage.setItem(LS_KEY(uid), "1"); } catch { /* noop */ }
      setNeeds(false);
      setLoading(false);
      return;
    }

    // Timeout de 6s: se a query travar, libera app com needs=false.
    const timeout = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setNeeds(false);
      setLoading(false);
    }, 6000);

    (async () => {
      try {
        const { count, error } = await supabase
          .from("personal_expense_categories")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid);
        if (cancelled) return;
        if (error) {
          setNeeds(false);
          return;
        }
        const isNew = (count ?? 0) === 0;
        if (!isNew) {
          try { localStorage.setItem(LS_KEY(uid), "1"); } catch { /* noop */ }
        }
        setNeeds(isNew);
      } catch (error) {
        console.error("[useNeedsOnboarding] error:", error);
        if (!cancelled) setNeeds(false);
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [user?.id, user?.created_at]);

  return { loading, needs };
}
