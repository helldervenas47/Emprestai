import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";

export interface WhatsappBillingSchedule {
  id?: string;
  owner_id?: string;
  enabled: boolean;
  provider: string;
  base_url: string;
  instance_id: string;
  send_time: string;
  days_before_due: number;
  send_on_due_day: boolean;
  send_when_overdue: boolean;
  overdue_repeat_days: number;
  last_run_at?: string | null;
  manager_summary_enabled: boolean;
  manager_summary_day_of_week: number; // 0=Sun..6=Sat
  manager_summary_time: string; // HH:MM
  manager_last_run_at?: string | null;
}

export interface WhatsappBillingLog {
  id: string;
  loan_id: string;
  client_id: string | null;
  installment_number: number;
  status_when_sent: string;
  phone: string;
  message: string;
  success: boolean;
  error_message: string | null;
  sent_date: string;
  created_at: string;
}

const DEFAULT: WhatsappBillingSchedule = {
  enabled: false,
  provider: "whatsmiau",
  base_url: "",
  instance_id: "",
  send_time: "09:00",
  days_before_due: 1,
  send_on_due_day: true,
  send_when_overdue: true,
  overdue_repeat_days: 3,
  manager_summary_enabled: false,
  manager_summary_day_of_week: 1,
  manager_summary_time: "09:00",
};

const BILLING_SCHEDULE_COLUMNS =
  "id, owner_id, enabled, provider, base_url, instance_id, send_time, days_before_due, send_on_due_day, send_when_overdue, overdue_repeat_days, last_run_at, manager_summary_enabled, manager_summary_day_of_week, manager_summary_time, manager_last_run_at";

const BILLING_LOG_COLUMNS =
  "id, loan_id, client_id, installment_number, status_when_sent, phone, message, success, error_message, sent_date, created_at";

export function useWhatsappBillingSchedule() {
  const { user, dataOwnerId } = useAuth();
  const [schedule, setSchedule] = useState<WhatsappBillingSchedule>(DEFAULT);
  const [logs, setLogs] = useState<WhatsappBillingLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("whatsapp_billing_schedule").select(BILLING_SCHEDULE_COLUMNS).maybeSingle();
    if (data) setSchedule({ ...DEFAULT, ...(data as any) });
    else setSchedule(DEFAULT);

    const { data: logRows } = await supabase
      .from("whatsapp_billing_log").select(BILLING_LOG_COLUMNS)
      .order("created_at", { ascending: false }).limit(30);
    setLogs((logRows ?? []) as any);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const save = useCallback(async (patch: Partial<WhatsappBillingSchedule>) => {
    if (!user || !dataOwnerId) return;
    const next = { ...schedule, ...patch };
    setSchedule(next);
    const payload = {
      owner_id: dataOwnerId,
      enabled: next.enabled,
      provider: next.provider,
      base_url: next.base_url,
      instance_id: next.instance_id,
      send_time: next.send_time,
      days_before_due: next.days_before_due,
      send_on_due_day: next.send_on_due_day,
      send_when_overdue: next.send_when_overdue,
      overdue_repeat_days: next.overdue_repeat_days,
      manager_summary_enabled: next.manager_summary_enabled,
      manager_summary_day_of_week: next.manager_summary_day_of_week,
      manager_summary_time: next.manager_summary_time,
    };
    await supabase.from("whatsapp_billing_schedule")
      .upsert(payload, { onConflict: "owner_id" });
  }, [user, dataOwnerId, schedule]);

  const runNow = useCallback(async () => {
    if (!dataOwnerId) return null;
    const { data, error } = await supabase.functions.invoke("send-whatsapp-billing", {
      body: { owner_id: dataOwnerId, manual_run: true },
    });
    await fetchAll();
    if (error) throw error;
    return data;
  }, [dataOwnerId, fetchAll]);

  const runManagerSummaryNow = useCallback(async (opts?: { manager_user_id?: string }) => {
    if (!dataOwnerId) return null;
    const body: any = { owner_id: dataOwnerId, manual_run: true };
    if (opts?.manager_user_id) body.manager_user_id = opts.manager_user_id;
    const { data, error } = await supabase.functions.invoke("send-whatsapp-manager-summary", { body });
    await fetchAll();
    if (error) throw error;
    return data;
  }, [dataOwnerId, fetchAll]);

  const listManagerSummaryRecipients = useCallback(async () => {
    if (!dataOwnerId) return null;
    const { data, error } = await supabase.functions.invoke("send-whatsapp-manager-summary", {
      body: { owner_id: dataOwnerId, list_managers: true },
    });
    if (error) throw error;
    return data;
  }, [dataOwnerId]);

  const previewManagerSummary = useCallback(async (managerUserId?: string) => {
    if (!dataOwnerId) return null;
    const body: any = { owner_id: dataOwnerId, preview_only: true };
    if (managerUserId) body.manager_user_id = managerUserId;
    const { data, error } = await supabase.functions.invoke("send-whatsapp-manager-summary", { body });
    if (error) throw error;
    return data;
  }, [dataOwnerId]);

  return {
    schedule, logs, loading, save, runNow,
    runManagerSummaryNow,
    listManagerSummaryRecipients,
    previewManagerSummary,
    refresh: fetchAll,
  };
}
