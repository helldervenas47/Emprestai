import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import type { AuditReport } from "@/lib/accountantAudit";

export interface AuditLogRow {
  id: string;
  executed_at: string;
  period_start: string | null;
  period_end: string | null;
  confidence_score: number;
  totals: any;
  issues: any[];
  corrections: any[];
  notes: string | null;
}

const AUDIT_LOG_COLUMNS =
  "id, executed_at, period_start, period_end, confidence_score, totals, issues, corrections, notes";

export function useAccountantAuditLogs() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("accountant_audit_logs" as any)
      .select(AUDIT_LOG_COLUMNS)
      .order("executed_at", { ascending: false })
      .limit(50);
    if (!error && data) setLogs(data as unknown as AuditLogRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const saveAudit = useCallback(async (report: AuditReport, notes?: string) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data, error } = await supabase
      .from("accountant_audit_logs" as any)
      .insert({
        user_id: u.user.id,
        executed_at: report.executedAt,
        period_start: report.periodStart ?? null,
        period_end: report.periodEnd ?? null,
        confidence_score: report.confidenceScore,
        totals: report.totals,
        issues: report.issues,
        corrections: report.corrections,
        notes: notes ?? null,
      })
      .select()
      .single();
    if (!error && data) {
      setLogs((prev) => [data as unknown as AuditLogRow, ...prev].slice(0, 50));
    }
    return data;
  }, []);

  return { logs, loading, saveAudit, refresh: fetchLogs };
}
