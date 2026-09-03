import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export interface InviteCode {
  id: string;
  code: string;
  owner_id: string;
  active: boolean;
  expires_at: string | null;
  uses_count: number;
  max_uses: number | null;
  created_at: string;
}

const INVITE_CODE_COLUMNS =
  "id, code, owner_id, active, expires_at, uses_count, max_uses, created_at";

function generateCode(len = 10) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function useInviteCodes() {
  const { user, role } = useAuth();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCodes = useCallback(async () => {
    if (!user || role !== "admin") {
      setCodes([]);
      setLoading(false);
      return;
    }
    const { data } = await (supabase as any)
      .from("invite_codes")
      .select(INVITE_CODE_COLUMNS)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    setCodes((data as InviteCode[]) || []);
    setLoading(false);
  }, [user, role]);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  const create = useCallback(async (opts?: { expiresInDays?: number; maxUses?: number | null }) => {
    if (!user) return null;
    const code = generateCode();
    const expires_at = opts?.expiresInDays
      ? new Date(Date.now() + opts.expiresInDays * 86400000).toISOString()
      : null;
    const { data, error } = await (supabase as any)
      .from("invite_codes")
      .insert({
        code,
        owner_id: user.id,
        active: true,
        expires_at,
        max_uses: opts?.maxUses ?? null,
      })
      .select()
      .maybeSingle();

    if (!error) await fetchCodes();
    return data as InviteCode | null;
  }, [user, fetchCodes]);

  const toggleActive = useCallback(async (id: string, active: boolean) => {
    await (supabase as any).from("invite_codes").update({ active }).eq("id", id);
    await fetchCodes();
  }, [fetchCodes]);

  const remove = useCallback(async (id: string) => {
    await (supabase as any).from("invite_codes").delete().eq("id", id);
    await fetchCodes();
  }, [fetchCodes]);

  return { codes, loading, create, toggleActive, remove, refetch: fetchCodes };
}

export async function validateInviteCode(code: string): Promise<{ valid: boolean; owner_id?: string; require_approval?: boolean; reason?: string }> {
  const { data, error } = await (supabase as any).rpc("validate_invite_code", { _code: code });
  if (error) return { valid: false, reason: "Erro ao validar código" };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { valid: false, reason: "Código não encontrado" };
  if (!row.valid) return { valid: false, reason: row.reason || "Código inválido" };
  return {
    valid: true,
    owner_id: row.owner_id,
    require_approval: !!row.require_approval,
  };
}
