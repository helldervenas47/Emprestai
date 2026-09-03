import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export function useMyProfilePhone() {
  const { user } = useAuth();
  const [phone, setPhone] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles" as any)
        .select("phone")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setPhone(((data as any)?.phone ?? "") as string);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const save = useCallback(async (next: string) => {
    if (!user) return { error: new Error("não autenticado") } as const;
    setPhone(next);
    const { error } = await supabase
      .from("profiles" as any)
      .update({ phone: next })
      .eq("user_id", user.id);
    return { error } as const;
  }, [user]);

  return { phone, setPhone, save, loading };
}
