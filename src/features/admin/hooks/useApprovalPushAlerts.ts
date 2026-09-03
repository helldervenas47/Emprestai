import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Mostra uma notificação local (via Service Worker) sempre que uma nova
 * solicitação de aprovação é criada para o admin atual. Assim o usuário
 * recebe alerta no instante em que o badge "Mais" aumenta.
 *
 * Requer que o usuário tenha ativado push notifications previamente
 * (permissão concedida + service worker registrado).
 */
export function useApprovalPushAlerts() {
  const { user, role } = useAuth();
  const { isSubscribed, permission } = usePushNotifications();
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || role !== "admin") return;
    if (!isSubscribed || permission !== "granted") return;

    const channel = supabase
      .channel(`approval-push:${user.id}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "user_approvals",
          filter: `owner_id=eq.${user.id}`,
        },
        async (payload: any) => {
          const row = payload?.new;
          if (!row?.id || seenIds.current.has(row.id)) return;
          if (row.status && row.status !== "pending") return;
          seenIds.current.add(row.id);

          try {
            const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
            if (!reg) return;
            const who = row.display_name || row.email || "Novo usuário";
            await reg.showNotification("🔔 Nova solicitação de acesso", {
              body: `${who} aguarda sua aprovação.`,
              icon: "/logo-icon.png",
              badge: "/logo-icon.png",
              tag: `approval-${row.id}`,
              data: { url: "/", approvalId: row.id },
            } as NotificationOptions);
          } catch (err) {
            console.error("Approval push alert error:", err);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role, isSubscribed, permission]);
}
