import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export interface ApprovalRequest {
  id: string;
  user_id: string;
  owner_id: string;
  status: "pending" | "approved" | "rejected";
  email: string | null;
  display_name: string | null;
  invite_code: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

const APPROVAL_REQUEST_COLUMNS =
  "id, user_id, owner_id, status, email, display_name, invite_code, rejection_reason, reviewed_at, reviewed_by, created_at";

export function useApprovalRequests() {
  const { user, role } = useAuth();
  const instanceId = useId();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!user || role !== "admin") {
      setRequests([]);
      setLoading(false);
      return;
    }
    const { data } = await (supabase as any)
      .from("user_approvals")
      .select(APPROVAL_REQUEST_COLUMNS)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    setRequests((data as ApprovalRequest[]) || []);
    setLoading(false);
  }, [user, role]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (!user || role !== "admin") return;
    const channel = supabase
      .channel(`approvals-owner:${user.id}:${instanceId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "user_approvals", filter: `owner_id=eq.${user.id}` },
        () => fetchRequests(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role, fetchRequests, instanceId]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const approve = useCallback(
    async (req: ApprovalRequest, opts: { role: "admin" | "cliente" | "visualizador"; allowedTabs: string[] }) => {
      if (!user) return { ok: false, error: "unauthorized" };

      // 1) Link sub-user to owner
      await supabase.from("user_owner" as any).upsert(
        { user_id: req.user_id, owner_id: user.id },
        { onConflict: "user_id" } as any,
      );

      // 2) Assign role (remove previous roles first to avoid duplicates)
      await supabase.from("user_roles").delete().eq("user_id", req.user_id);
      await supabase.from("user_roles").insert({ user_id: req.user_id, role: opts.role });

      // 3) Tab permissions
      const { data: existing } = await (supabase as any)
        .from("user_tab_permissions")
        .select("id")
        .eq("user_id", req.user_id)
        .maybeSingle();
      if (existing) {
        await (supabase as any)
          .from("user_tab_permissions")
          .update({ allowed_tabs: opts.allowedTabs, updated_at: new Date().toISOString() })
          .eq("user_id", req.user_id);
      } else {
        await (supabase as any)
          .from("user_tab_permissions")
          .insert({ user_id: req.user_id, allowed_tabs: opts.allowedTabs });
      }

      // 4) Mark approval
      const { error } = await (supabase as any)
        .from("user_approvals")
        .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: user.id })
        .eq("id", req.id);

      if (error) return { ok: false, error: error.message };
      await fetchRequests();
      return { ok: true };
    },
    [user, fetchRequests],
  );

  const reject = useCallback(
    async (req: ApprovalRequest, reason?: string) => {
      if (!user) return { ok: false, error: "unauthorized" };
      const { error } = await (supabase as any)
        .from("user_approvals")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          rejection_reason: reason ?? null,
        })
        .eq("id", req.id);
      if (error) return { ok: false, error: error.message };
      await fetchRequests();
      return { ok: true };
    },
    [user, fetchRequests],
  );

  return { requests, pendingCount, loading, approve, reject, refetch: fetchRequests };
}
