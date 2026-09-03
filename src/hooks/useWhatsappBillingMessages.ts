import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwner } from "@/hooks/useDataOwner";
import {
  DEFAULT_WHATSAPP_MESSAGES,
  type WhatsappBillingMessages,
} from "@/lib/whatsappBilling";

export function useWhatsappBillingMessages() {
  const { user } = useAuth();
  const ownerId = useDataOwner();
  const [messages, setMessages] = useState<WhatsappBillingMessages>(DEFAULT_WHATSAPP_MESSAGES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !ownerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("whatsapp_billing_messages" as any)
        .select(
          "message_upcoming, message_due_today, message_overdue, message_very_overdue, message_manager_weekly, pix_link, very_overdue_days",
        )
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const d = data as any;
        setMessages({
          message_upcoming: d.message_upcoming ?? DEFAULT_WHATSAPP_MESSAGES.message_upcoming,
          message_due_today: d.message_due_today ?? DEFAULT_WHATSAPP_MESSAGES.message_due_today,
          message_overdue: d.message_overdue ?? DEFAULT_WHATSAPP_MESSAGES.message_overdue,
          message_very_overdue:
            d.message_very_overdue ?? DEFAULT_WHATSAPP_MESSAGES.message_very_overdue,
          message_manager_weekly:
            d.message_manager_weekly ?? DEFAULT_WHATSAPP_MESSAGES.message_manager_weekly,
          pix_link: d.pix_link ?? "",
          very_overdue_days: Number(d.very_overdue_days ?? 30) || 30,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, ownerId]);

  const save = useCallback(
    async (updates: Partial<WhatsappBillingMessages>) => {
      if (!ownerId) return { error: new Error("Sem dono de dados") } as const;
      const next = { ...messages, ...updates };
      setMessages(next);
      const { error } = await supabase
        .from("whatsapp_billing_messages" as any)
        .upsert(
          {
            owner_id: ownerId,
            message_upcoming: next.message_upcoming,
            message_due_today: next.message_due_today,
            message_overdue: next.message_overdue,
            message_very_overdue: next.message_very_overdue,
            message_manager_weekly: next.message_manager_weekly,
            pix_link: next.pix_link,
            very_overdue_days: next.very_overdue_days,
          },
          { onConflict: "owner_id" },
        );
      return { error } as const;
    },
    [ownerId, messages],
  );

  return { messages, loading, save };
}
