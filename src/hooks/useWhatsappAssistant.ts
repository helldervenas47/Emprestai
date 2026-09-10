import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, USER_SUPABASE_URL } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

type WhatsappAuthorizedNumber = {
  id: string;
  phone: string;
  label: string | null;
  enabled: boolean;
};

export function useWhatsappAssistant() {
  const { user } = useAuth();
  const [numbers, setNumbers] = useState<WhatsappAuthorizedNumber[]>([]);
  const [loading, setLoading] = useState(false);

  const webhookUrl = useMemo(() => {
    const base = USER_SUPABASE_URL || "";
    return `${base.replace(/\/$/, "")}/functions/v1/whatsapp-assistant-webhook`;
  }, []);

  const load = useCallback(async () => {
    if (!user?.id) {
      setNumbers([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_assistant_authorized")
      .select("id, phone, label, enabled")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (!error && data) {
      setNumbers(
        data.map((d: any) => ({
          id: d.id,
          phone: d.phone,
          label: d.label,
          enabled: d.enabled ?? true,
        })),
      );
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const addNumber = useCallback(
    async (phone: string, label: string) => {
      if (!user?.id) return { error: new Error("Usuário não autenticado") };
      const digits = phone.replace(/\D/g, "");
      const { error } = await supabase.from("whatsapp_assistant_authorized").insert({
        owner_id: user.id,
        phone: digits,
        label: label.trim() || null,
        enabled: true,
      } as any);
      if (!error) await load();
      return { error };
    },
    [user?.id, load],
  );

  const toggleNumber = useCallback(
    async (id: string, enabled: boolean) => {
      const { error } = await supabase
        .from("whatsapp_assistant_authorized")
        .update({ enabled } as any)
        .eq("id", id);
      if (!error) await load();
      return { error };
    },
    [load],
  );

  const removeNumber = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("whatsapp_assistant_authorized").delete().eq("id", id);
      if (!error) await load();
      return { error };
    },
    [load],
  );

  return { numbers, loading, addNumber, toggleNumber, removeNumber, webhookUrl, reload: load };
}

