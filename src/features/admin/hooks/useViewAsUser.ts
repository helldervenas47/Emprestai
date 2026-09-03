import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { offlineDB, OFFLINE_TABLES } from "@/lib/offline/db";

async function clearViewingCaches() {
  // Clear offline cached rows (do not touch pending_mutations of the real user)
  try {
    await Promise.all(OFFLINE_TABLES.map((t) => (offlineDB as any)[t].clear()));
    await offlineDB.meta.clear();
  } catch {}
  // Clear app-level localStorage caches that may be tied to the viewed user
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith("rq-") ||
        k.startsWith("cache:") ||
        k.startsWith("emprestaii:") ||
        k.includes("dataOwner") ||
        k.includes("viewing")
      ) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch {}
}

interface ViewingSession {
  viewing_user_id: string;
  started_at: string;
  target_name?: string;
}

/**
 * Hook to manage admin "View as user" sessions.
 * When active, all RLS-scoped queries return data of the target user (read-only).
 */
export function useViewAsUser() {
  const { user, role } = useAuth();
  const [session, setSession] = useState<ViewingSession | null>(null);
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!user || role !== "admin") {
      if (!mountedRef.current) return;
      setSession(null);
      setLoading(false);
      return;
    }
    if (mountedRef.current) setLoading(true);
    const { data } = await supabase
      .from("admin_viewing_sessions" as any)
      .select("viewing_user_id, started_at")
      .eq("admin_id", user.id)
      .maybeSingle();

    if (data) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", (data as any).viewing_user_id)
        .maybeSingle();
      if (!mountedRef.current) return;
      setSession({
        viewing_user_id: (data as any).viewing_user_id,
        started_at: (data as any).started_at,
        target_name: profile?.display_name || "Usuário",
      });
    } else {
      if (!mountedRef.current) return;
      setSession(null);
    }
    if (mountedRef.current) setLoading(false);
  }, [user, role]);

  useEffect(() => {
    refresh();
  }, [refresh]);


  const startViewing = useCallback(
    async (targetUserId: string) => {
      if (!user || role !== "admin") return { error: "Não autorizado" };
      const { error } = await supabase
        .from("admin_viewing_sessions" as any)
        .upsert(
          { admin_id: user.id, viewing_user_id: targetUserId, started_at: new Date().toISOString() },
          { onConflict: "admin_id" }
        );
      if (!error) {
        await clearViewingCaches();
        const url = new URL(window.location.href);
        url.searchParams.set("_r", Date.now().toString());
        window.location.replace(url.toString());
      }
      return { error: error?.message };
    },
    [user, role]
  );

  const stopViewing = useCallback(async () => {
    if (!user) return;
    try {
      await supabase.from("admin_viewing_sessions" as any).delete().eq("admin_id", user.id);
    } catch {}
    await clearViewingCaches();
    // Hard reload with cache-bust to ensure no stale state from viewed user remains
    const url = new URL(window.location.href);
    url.searchParams.set("_r", Date.now().toString());
    window.location.replace(url.toString());
  }, [user]);

  return {
    session,
    isViewingAs: !!session,
    loading,
    startViewing,
    stopViewing,
    refresh,
  };
}
