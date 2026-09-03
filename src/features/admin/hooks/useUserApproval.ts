import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "none";

export function useUserApproval() {
  const { user } = useAuth();
  const [status, setStatus] = useState<ApprovalStatus>("none");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setStatus("none");
      setLoading(false);
      return;
    }

    let mounted = true;
    const uid = user.id;
    const timeout = setTimeout(() => {
      if (!mounted) return;
      // Fallback seguro em caso de timeout: assume "none" (não bloqueia app).
      setStatus("none");
      setLoading(false);
    }, 6000);

    const fetchStatus = async () => {
      try {
        const { data } = await (supabase as any)
          .from("user_approvals")
          .select("status")
          .eq("user_id", uid)
          .maybeSingle();
        if (!mounted) return;
        setStatus((data?.status as ApprovalStatus) || "none");
      } catch (error) {
        console.error("[useUserApproval] fetchStatus error:", error);
        if (mounted) setStatus("none");
      } finally {
        clearTimeout(timeout);
        if (mounted) setLoading(false);
      }
    };

    fetchStatus();

    // Realtime: user sees own status flip to approved
    const channel = supabase
      .channel(`approval-self:${uid}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "user_approvals", filter: `user_id=eq.${uid}` },
        (payload: any) => {
          const newStatus = payload.new?.status as ApprovalStatus | undefined;
          if (newStatus) setStatus(newStatus);
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { status, loading, isPending: status === "pending", isRejected: status === "rejected" };
}
