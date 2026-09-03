import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";
import { buildFallbackInsight, isFallbackFunctionPayload, readFunctionErrorMessage } from "@/lib/personalInsightsFallback";

export interface PersonalInsight {
  content: string;
  summary?: string | null;
  exceeded_categories: string[];
  generated_at?: string;
  cached?: boolean;
  empty?: boolean;
  fallback?: boolean;
  error_code?: string;
  month?: string;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Fetches the AI-generated personal expenses report for a given month.
 * Auto-fetches the cached version on mount, and provides a `regenerate` to force.
 */
export function usePersonalInsights(month?: string) {
  const { user, dataOwnerId } = useAuth();
  const targetMonth = month ?? currentMonth();
  const [data, setData] = useState<PersonalInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load cached version from DB on mount/month change
  const loadCached = useCallback(async () => {
    if (!dataOwnerId) return;
    const { data: row } = await supabase
      .from("personal_ai_insights" as any)
      .select("content, summary, exceeded_categories, generated_at")
      .eq("user_id", dataOwnerId)
      .eq("month", targetMonth)
      .maybeSingle();
    if (row) {
      setData({
        content: (row as any).content,
        summary: (row as any).summary,
        exceeded_categories: (row as any).exceeded_categories || [],
        generated_at: (row as any).generated_at,
        cached: true,
      });
    } else {
      setData(null);
    }
  }, [dataOwnerId, targetMonth]);

  useEffect(() => { loadCached(); }, [loadCached]);

  const generate = useCallback(async (force = false) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Validate the session against the server (not just the cached JWT).
      // The cached session can be stale (deleted server-side) and would cause 401.
      const { data: userCheck, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userCheck?.user) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("Sessão expirada. Faça login novamente.");
      }
      const { data: result, error: fnError } = await supabase.functions.invoke(
        "generate-personal-insights",
        { body: { month: targetMonth, force } },
      );
      if (fnError) {
        const fullMessage = await readFunctionErrorMessage(fnError);
        const fallback = buildFallbackInsight(fullMessage, targetMonth);
        setData(fallback);
        setError(null);
        return fallback;
      }
      if (isFallbackFunctionPayload(result)) {
        const fallback = {
          ...buildFallbackInsight(String((result as any)?.message || (result as any)?.error || ""), targetMonth),
          ...(result as any),
          error: undefined,
        } as PersonalInsight;
        setData(fallback);
        setError(null);
        return fallback;
      }
      if ((result as any).error) throw new Error((result as any).error);
      setData(result as PersonalInsight);
      return result as PersonalInsight;
    } catch (e: any) {
      const msg = e?.message || "Erro ao gerar relatório";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [user, targetMonth]);

  return { data, loading, error, generate, reload: loadCached };
}
