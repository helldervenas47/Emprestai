import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";

const LS_KEY = "data-owner-id:";

function readCached(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(LS_KEY + userId);
  } catch {
    return null;
  }
}

function writeCached(userId: string, ownerId: string) {
  try {
    localStorage.setItem(LS_KEY + userId, ownerId);
  } catch { /* noop */ }
}

export function useDataOwner() {
  const { user } = useAuth();
  // Hidrata do cache local para não bloquear as consultas dependentes enquanto
  // a RPC `get_data_owner_id` responde. O valor é revalidado logo em seguida.
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(() => readCached(user?.id));

  useEffect(() => {
    if (!user) {
      setDataOwnerId(null);
      return;
    }

    const cached = readCached(user.id);
    if (cached) setDataOwnerId(cached);

    let cancelled = false;
    const fetch = async () => {
      // Use SQL function so "view as" sessions and user_owner are both respected.
      const { data, error } = await supabase.rpc("get_data_owner_id", { _user_id: user.id });
      if (cancelled) return;
      const resolved = error || !data ? user.id : (data as string);
      writeCached(user.id, resolved);
      setDataOwnerId((prev) => (prev === resolved ? prev : resolved));
    };

    fetch();
    return () => { cancelled = true; };
  }, [user]);

  return dataOwnerId;
}
