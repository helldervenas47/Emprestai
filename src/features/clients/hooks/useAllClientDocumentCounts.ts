import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

/**
 * Perf fix (P0): substitui N chamadas de `useClientDocuments(clientId)`
 * — uma por card na aba Cadastros — por UMA única query que agrega a
 * contagem de documentos por cliente.
 *
 * Retorna um `Record<clientId, count>`. O `client_documents` já é filtrado
 * por RLS ao `owner_id` do usuário logado, então basta selecionar
 * `client_id` do owner e agregar no cliente.
 */
export function useAllClientDocumentCounts(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !user || !dataOwnerId) return;
    setLoading(true);
    // Uma única query — apenas a coluna client_id — leve mesmo com muitos docs.
    const { data, error } = await supabase
      .from("client_documents" as any)
      .select("client_id")
      .eq("owner_id", dataOwnerId);
    setLoading(false);
    if (error || !data) return;
    const map: Record<string, number> = {};
    for (const row of (data as unknown as { client_id: string }[])) {
      const id = row.client_id;
      if (!id) continue;
      map[id] = (map[id] ?? 0) + 1;
    }
    setCounts(map);
  }, [enabled, user, dataOwnerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime localizado: incrementa/decrementa apenas o cliente afetado.
  useEffect(() => {
    if (!enabled || !user || !dataOwnerId) return;
    const channel = supabase
      .channel(`client_documents_counts:${dataOwnerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_documents",
          filter: `owner_id=eq.${dataOwnerId}`,
        },
        (payload: any) => {
          const newId = payload?.new?.client_id as string | undefined;
          const oldId = payload?.old?.client_id as string | undefined;
          if (payload.eventType === "INSERT" && newId) {
            setCounts((prev) => ({ ...prev, [newId]: (prev[newId] ?? 0) + 1 }));
            return;
          }
          if (payload.eventType === "DELETE" && oldId) {
            setCounts((prev) => {
              const next = { ...prev };
              const v = (next[oldId] ?? 0) - 1;
              if (v <= 0) delete next[oldId]; else next[oldId] = v;
              return next;
            });
            return;
          }
          if (payload.eventType === "UPDATE" && newId && oldId && newId !== oldId) {
            setCounts((prev) => {
              const next = { ...prev };
              const vOld = (next[oldId] ?? 0) - 1;
              if (vOld <= 0) delete next[oldId]; else next[oldId] = vOld;
              next[newId] = (next[newId] ?? 0) + 1;
              return next;
            });
            return;
          }
          // Fallback (payload incompleto): refaz a agregação.
          refresh();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [enabled, user, dataOwnerId, refresh]);

  return { counts, loading, refresh };
}
