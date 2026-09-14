import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useScheduledReportPrefs } from "@/hooks/useScheduledReportPrefs";
import { supabase } from "@/integrations/supabase/userClient";
import { buildBillingCandidates, type BillingCandidate } from "@/features/whatsapp/lib/billingCenter";
import { sumInterestReceivedInPeriod } from "@/features/financial/lib/interestAllocation";
import { useWhatsappBillingSchedule } from "@/hooks/useWhatsappBillingSchedule";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MessageCircle,
  Clock,
  Send,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Smartphone,
  TrendingUp,
  ListChecks,
  Activity,
  Calendar,
  Eye,
  Copy,
  Check,
} from "lucide-react";

type SlotKey = "send_time_1" | "send_time_2" | "send_time_3";
const slots: SlotKey[] = ["send_time_1", "send_time_2", "send_time_3"];

interface GroupedClientBilling {
  clientName: string;
  amount: number;
  interestAmount: number;
  count: number;
}

function groupCandidatesByClient(candidates: BillingCandidate[]): GroupedClientBilling[] {
  const map = new Map<string, GroupedClientBilling>();
  for (const item of candidates) {
    const nameClean = (item.clientName || "").trim();
    const nameKey = nameClean.toLowerCase();
    const idKey = (item.clientId && !item.clientId.startsWith("loan:")) ? `id:${item.clientId}` : `name:${nameKey}`;

    const existing = map.get(idKey) || (nameKey ? map.get(`name:${nameKey}`) : undefined);
    if (existing) {
      existing.amount += item.amount;
      existing.interestAmount += (item.interestAmount || 0);
      existing.count += 1;
    } else {
      const entry: GroupedClientBilling = {
        clientName: nameClean || "Cliente não identificado",
        amount: item.amount,
        interestAmount: item.interestAmount || 0,
        count: 1,
      };
      map.set(idKey, entry);
      if (nameKey) map.set(`name:${nameKey}`, entry);
    }
  }
  return Array.from(new Set(map.values())).sort((a, b) =>
    a.clientName.localeCompare(b.clientName, "pt-BR", { sensitivity: "base" })
  );
}

export function formatBillingReportForWhatsapp(
  aCobrar: BillingCandidate[],
  sentIds: Set<string>,
  sentClientIds?: Set<string>,
  referenceDate?: string,
  extraTotals?: { interestReceived?: number; totalReceived?: number },
): string {
  const isSent = (item: BillingCandidate) =>
    sentIds.has(item.loanId) || (Boolean(item.clientId) && Boolean(sentClientIds?.has(item.clientId)));

  const enviadas = aCobrar.filter(isSent);
  const naoEnviadas = aCobrar.filter((item) => !isSent(item));

  const totalCount = aCobrar.length;
  const totalAmount = aCobrar.reduce((s, i) => s + i.amount, 0);
  const totalInterest = aCobrar.reduce((s, i) => s + (i.interestAmount || 0), 0);

  const envCount = enviadas.length;
  const envAmount = enviadas.reduce((s, i) => s + i.amount, 0);
  const envInterest = enviadas.reduce((s, i) => s + (i.interestAmount || 0), 0);

  const naoCount = naoEnviadas.length;
  const naoAmount = naoEnviadas.reduce((s, i) => s + i.amount, 0);
  const naoInterest = naoEnviadas.reduce((s, i) => s + (i.interestAmount || 0), 0);

  const moneyFmt = {
    format: (val: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
        .format(val)
        .replace(/\u00a0/g, " "),
  };

  const dateFormatted = referenceDate
    ? (referenceDate.includes("-") ? referenceDate.split("-").reverse().join("/") : referenceDate)
    : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia" }).format(new Date());

  const groupedEnviadas = groupCandidatesByClient(enviadas);
  const groupedNaoEnviadas = groupCandidatesByClient(naoEnviadas);

  const interestReceivedToday = extraTotals?.interestReceived ?? 0;
  const totalReceivedToday = extraTotals?.totalReceived ?? 0;

  const lines: string[] = [
    `📊 *RESUMO DAS COBRANÇAS — HOJE*`,
    ``,
    `📌 *RESUMO DO DIA — ${dateFormatted}*`,
    ``,
    `Total de cobranças: *${totalCount}*`,
    `✅ Enviadas: *${envCount}*`,
    `⚠️ Não enviadas: *${naoCount}*`,
    ``,
    `💰 Juros a cobrar: *${moneyFmt.format(totalInterest)}*`,
    `💵 Total a cobrar: *${moneyFmt.format(totalAmount)}*`,
    ``,
    `🪙 Juros recebidos: *${moneyFmt.format(interestReceivedToday)}*`,
    `📥 Total recebido: *${moneyFmt.format(totalReceivedToday)}*`,
    ``,
    `📈 Juros total: *${moneyFmt.format(totalInterest + interestReceivedToday)}*`,
    `💼 Total geral: *${moneyFmt.format(totalAmount + totalReceivedToday)}*`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `✅ *COBRANÇAS ENVIADAS*`,
    ``,
  ];

  if (groupedEnviadas.length === 0) {
    lines.push(`Nenhuma cobrança enviada.`);
  } else {
    groupedEnviadas.forEach((item, index) => {
      lines.push(`*${item.clientName}* / Contratos: ${item.count} / Juros: ${moneyFmt.format(item.interestAmount)} / Total: ${moneyFmt.format(item.amount)}`);
      if (index < groupedEnviadas.length - 1) {
        lines.push(``);
      }
    });
  }

  lines.push(
    ``,
    `*Total enviado: ${envCount} / ${moneyFmt.format(envInterest)} / ${moneyFmt.format(envAmount)}*`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `⚠️ *COBRANÇAS NÃO ENVIADAS*`,
    ``,
  );

  if (groupedNaoEnviadas.length === 0) {
    lines.push(`Nenhuma cobrança pendente.`);
  } else {
    groupedNaoEnviadas.forEach((item, index) => {
      lines.push(`*${item.clientName}* / Contratos: ${item.count} / Juros: ${moneyFmt.format(item.interestAmount)} / Total: ${moneyFmt.format(item.amount)}`);
      if (index < groupedNaoEnviadas.length - 1) {
        lines.push(``);
      }
    });
  }

  lines.push(
    ``,
    `*Total não enviado: ${naoCount} / ${moneyFmt.format(naoInterest)} / ${moneyFmt.format(naoAmount)}*`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `*Resumo gerado automaticamente pelo EmprestAI.*`
  );

  return lines.join("\n");
}

async function sendWhatsappDirectly(
  schedule: { provider?: string; base_url?: string; instance_id?: string; api_key?: string },
  rawPhone: string,
  message: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!schedule.base_url?.trim() || !schedule.instance_id?.trim()) {
    return { ok: false, error: "whatsapp_not_configured" };
  }

  const digits = rawPhone.replace(/\D/g, "");
  const phone = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
  const base = schedule.base_url.replace(/\/+$/, "");
  const instance = encodeURIComponent(schedule.instance_id.trim());
  const provider = schedule.provider || "evolution";
  const apiKey = schedule.api_key || "";

  try {
    if (provider === "wppconnect") {
      const res = await fetch(`${base}/api/${instance}/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ phone, message }),
      });
      return { ok: res.ok, status: res.status };
    }

    // Evolution API / Whatsmiau
    const res = await fetch(`${base}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { apikey: apiKey } : {}),
      },
      body: JSON.stringify({
        number: phone,
        text: message,
        textMessage: { text: message },
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export function WhatsappReportCard() {
  const { user, dataOwnerId } = useAuth();
  const ownerId = dataOwnerId || user?.id;

  const { schedule } = useWhatsappBillingSchedule();

  // Prefs do Resumo Operacional
  const {
    prefs: opPrefs,
    loading: loadingOpPrefs,
    save: saveOpPrefs,
  } = useScheduledReportPrefs("telegram_operational_summary_prefs");

  // Prefs do Relatório de Cobranças
  const {
    prefs: billPrefs,
    loading: loadingBillPrefs,
    save: saveBillPrefs,
  } = useScheduledReportPrefs("telegram_billing_prefs");

  const todayInBahia = useCallback(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date()),
    [],
  );

  const getRelativeDate = (offsetDays: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(d);
  };

  const [selectedDate, setSelectedDate] = useState<string>(todayInBahia);

  const [profilePhone, setProfilePhone] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [sendingOpSummary, setSendingOpSummary] = useState(false);
  const [sendingBillingReport, setSendingBillingReport] = useState(false);

  // Estados de pré-visualização
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewType, setPreviewType] = useState<"billing" | "operational">("billing");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  // Carrega telefone do perfil do usuário
  const loadProfilePhone = useCallback(async () => {
    if (!ownerId) return;
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("phone")
        .eq("user_id", ownerId)
        .maybeSingle();

      if (prof?.phone) {
        setProfilePhone(prof.phone);
      }
    } catch (e) {
      console.error("[WhatsappReportCard] Erro ao carregar perfil:", e);
    }
  }, [ownerId]);

  useEffect(() => {
    loadProfilePhone();
  }, [loadProfilePhone]);

  useEffect(() => {
    if (opPrefs.whatsapp_phone !== undefined) {
      setWhatsappPhone(opPrefs.whatsapp_phone || "");
    }
  }, [opPrefs.whatsapp_phone]);

  const isWhatsappConfigured = Boolean(
    schedule.base_url?.trim() && schedule.instance_id?.trim()
  );

  const handleOpTimeChange = async (key: SlotKey, value: string | null) => {
    try {
      await saveOpPrefs({ [key]: value });
    } catch {
      toast.error("Erro ao salvar horário.");
    }
  };

  const handleBillTimeChange = async (key: SlotKey, value: string | null) => {
    try {
      await saveBillPrefs({ [key]: value });
    } catch {
      toast.error("Erro ao salvar horário.");
    }
  };

  const handlePhoneBlur = async () => {
    if (whatsappPhone !== (opPrefs.whatsapp_phone || "")) {
      try {
        await saveOpPrefs({ whatsapp_phone: whatsappPhone.trim() || null });
      } catch {
        toast.error("Erro ao salvar telefone.");
      }
    }
  };

  const activeOpSlots = slots.filter((s) => Boolean(opPrefs[s]));
  const canAddMoreOpSlots = activeOpSlots.length < 3;

  const activeBillSlots = slots.filter((s) => Boolean(billPrefs[s]));
  const canAddMoreBillSlots = activeBillSlots.length < 3;

  const formatDateBRDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  };

  // Gerador do texto do Relatório de Cobranças para uma data específica
  const generateBillingReportText = async (targetDate: string): Promise<string> => {
    if (!ownerId) return "";
    const targetStart = new Date(`${targetDate}T00:00:00-03:00`).toISOString();
    const targetTomorrow = new Date(`${targetDate}T00:00:00-03:00`);
    targetTomorrow.setDate(targetTomorrow.getDate() + 1);

    const [loans, clients, schedulesRes, payments, promises, sentQueueRes, templates] = await Promise.all([
      supabase.from("loans").select("*").eq("user_id", ownerId),
      supabase.from("clients").select("*").eq("user_id", ownerId),
      supabase.from("loan_installments").select("*").eq("user_id", ownerId),
      supabase.from("payments").select("*").eq("user_id", ownerId),
      supabase.from("whatsapp_payment_promises").select("loan_id, installment_number, promised_date").eq("user_id", ownerId),
      supabase
        .from("whatsapp_billing_queue")
        .select("id, client_id, loan_id, loan_ids, status, sent_at")
        .eq("user_id", ownerId)
        .eq("status", "sent")
        .gte("sent_at", targetStart)
        .lt("sent_at", targetTomorrow.toISOString()),
      supabase
        .from("whatsapp_billing_messages")
        .select("message_upcoming, message_due_today, message_overdue, message_very_overdue, message_center_single, message_center_multiple, very_overdue_days, pix_link")
        .eq("owner_id", ownerId)
        .maybeSingle(),
    ]);

    const mappedLoans = (loans.data || []).map((l: any) => ({
      ...l,
      borrowerId: l.borrower_id,
      borrowerName: l.borrower_name,
      dueDate: l.due_date,
      amount: Number(l.amount ?? 0),
      interestRate: Number(l.interest_rate ?? 0),
      installments: Math.max(1, Number(l.installments ?? 1)),
      paidInstallments: Number(l.paid_installments ?? 0),
      remainingAmount: l.remaining_amount == null ? undefined : Number(l.remaining_amount),
      customInstallmentValue: l.custom_installment_value == null ? null : Number(l.custom_installment_value),
      lateInterestType: l.late_interest_type,
      lateInterestValue: l.late_interest_value == null ? null : Number(l.late_interest_value),
      penaltyValue: l.penalty_value == null ? null : Number(l.penalty_value),
      renegotiationPenaltyTotal: Number(l.renegotiation_penalty_total ?? 0),
    }));

    const mappedClients = (clients.data || []).map((c: any) => ({ ...c, createdAt: c.created_at }));
    const mappedSchedules = (schedulesRes.data || []).map((s: any) => ({
      ...s,
      loanId: s.loan_id,
      installmentNumber: Number(s.installment_number),
      dueDate: s.due_date,
      amount: Number(s.amount ?? 0),
    }));
    const mappedPayments = (payments.data || []).map((p: any) => ({
      ...p,
      loanId: p.loan_id,
      installmentNumber: Number(p.installment_number),
      amount: Number(p.amount ?? 0),
    }));

    const candidates = buildBillingCandidates({
      loans: mappedLoans as any,
      clients: mappedClients as any,
      schedules: mappedSchedules,
      payments: mappedPayments,
      promises: promises.data || [],
      today: targetDate,
      messages: (templates.data as any) || undefined,
    });

    const aCobrarCandidates = candidates.filter((c) => c.billingDate <= targetDate);

    const sentIds = new Set<string>();
    const sentClientIds = new Set<string>();
    (sentQueueRes.data || []).forEach((row: any) => {
      if (row.client_id) sentClientIds.add(row.client_id);
      const loanList = Array.isArray(row.loan_ids) && row.loan_ids.length ? row.loan_ids : (row.loan_id ? [row.loan_id] : []);
      loanList.forEach((id: string) => { if (id) sentIds.add(id); });
    });

    const paymentsToday = mappedPayments.filter((p: any) => (p.date || "").slice(0, 10) === targetDate);
    const totalReceivedToday = paymentsToday.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
    const interestReceivedToday = sumInterestReceivedInPeriod(mappedLoans as any, mappedPayments as any, targetDate, targetDate);

    return formatBillingReportForWhatsapp(
      aCobrarCandidates,
      sentIds,
      sentClientIds,
      targetDate,
      { interestReceived: interestReceivedToday, totalReceived: totalReceivedToday },
    );
  };

  // Gerador do texto do Resumo Operacional para uma data específica
  const generateOperationalSummaryText = async (targetDate: string): Promise<string> => {
    if (!ownerId) return "";
    const { data, error } = await supabase.functions.invoke("telegram-operational-summary", {
      body: {
        owner_id: ownerId,
        date: targetDate,
        channel: "whatsapp",
        send_whatsapp: false,
      },
    });
    if (error) throw error;
    return data?.text || "";
  };

  // Pré-visualização do Relatório de Cobranças
  const handlePreviewBillingReport = async () => {
    setLoadingPreview(true);
    try {
      const text = await generateBillingReportText(selectedDate);
      setPreviewTitle(`Relatório de Cobranças — ${formatDateBRDisplay(selectedDate)}`);
      setPreviewText(text);
      setPreviewType("billing");
      setPreviewOpen(true);
    } catch (e: any) {
      console.error("Erro ao gerar pré-visualização:", e);
      toast.error("Erro ao carregar pré-visualização.", { description: e?.message });
    } finally {
      setLoadingPreview(false);
    }
  };

  // Pré-visualização do Resumo Operacional
  const handlePreviewOpSummary = async () => {
    setLoadingPreview(true);
    try {
      const text = await generateOperationalSummaryText(selectedDate);
      setPreviewTitle(`Resumo Operacional — ${formatDateBRDisplay(selectedDate)}`);
      setPreviewText(text);
      setPreviewType("operational");
      setPreviewOpen(true);
    } catch (e: any) {
      console.error("Erro ao gerar pré-visualização:", e);
      toast.error("Erro ao carregar pré-visualização.", { description: e?.message });
    } finally {
      setLoadingPreview(false);
    }
  };

  // Cópia para a área de transferência
  const handleCopyText = async (textToCopy: string) => {
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success("Texto copiado para a área de transferência!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Erro ao copiar texto.");
    }
  };

  // Disparo do Resumo Operacional para a data selecionada
  const sendOperationalSummaryNow = async () => {
    if (!ownerId) return;
    setSendingOpSummary(true);
    try {
      const destPhone = whatsappPhone.trim() || profilePhone || undefined;
      const { data, error } = await supabase.functions.invoke("telegram-operational-summary", {
        body: {
          owner_id: ownerId,
          date: selectedDate,
          channel: "whatsapp",
          send_whatsapp: true,
          phone: destPhone,
          whatsapp_config: {
            provider: schedule.provider || "evolution",
            base_url: schedule.base_url || "",
            instance_id: schedule.instance_id || "",
          },
        },
      });

      if (error) throw error;

      if (data?.sent) {
        toast.success(`Resumo Operacional de ${formatDateBRDisplay(selectedDate)} enviado para o seu WhatsApp!`);
      } else {
        const reason = data?.reason;
        if (reason === "whatsapp_not_configured") {
          toast.error("WhatsApp não configurado", {
            description: "Configure sua API do WhatsApp na aba 'Disparos & Automação'.",
          });
        } else if (reason === "no_phone_configured") {
          toast.error("Nenhum telefone configurado", {
            description: "Informe o telefone de destino para o envio.",
          });
        } else {
          toast.error("Falha no envio do resumo", {
            description: reason || "O provedor de WhatsApp não confirmou o envio.",
          });
        }
      }
    } catch (e: any) {
      console.error("[WhatsappReportCard] Erro ao enviar resumo operacional:", e);
      toast.error("Erro ao enviar resumo operacional", {
        description: e?.message || "Ocorreu um problema de comunicação com a API.",
      });
    } finally {
      setSendingOpSummary(false);
    }
  };

  // Disparo do Relatório de Cobranças para a data selecionada
  const sendBillingReportNow = async () => {
    if (!ownerId) return;
    setSendingBillingReport(true);
    try {
      const reportMessage = await generateBillingReportText(selectedDate);
      const destPhone = (whatsappPhone.trim() || profilePhone || "").trim();
      if (!destPhone) {
        toast.error("Nenhum telefone configurado", {
          description: "Informe o telefone WhatsApp de destino acima.",
        });
        return;
      }

      // 1. Tenta envio direto se a API estiver configurada
      const directRes = await sendWhatsappDirectly(schedule, destPhone, reportMessage);
      if (directRes.ok) {
        toast.success(`Relatório de Cobranças de ${formatDateBRDisplay(selectedDate)} enviado para o seu WhatsApp!`);
        return;
      }

      // 2. Se o envio direto falhar, utiliza a Edge Function
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke("send-whatsapp-report", {
        body: {
          owner_id: ownerId,
          phone: destPhone,
          custom_text: reportMessage,
          whatsapp_config: {
            provider: schedule.provider || "evolution",
            base_url: schedule.base_url || "",
            instance_id: schedule.instance_id || "",
            api_key: schedule.api_key || "",
          },
        },
      });

      if (!edgeErr && edgeRes?.ok) {
        toast.success(`Relatório de Cobranças de ${formatDateBRDisplay(selectedDate)} enviado para o seu WhatsApp!`);
      } else {
        let errorDesc = edgeRes?.error;
        if (edgeErr) {
          try {
            if ((edgeErr as any).context && typeof (edgeErr as any).context.json === "function") {
              const errJson = await (edgeErr as any).context.json();
              if (errJson?.error) errorDesc = errJson.error;
            }
          } catch {
            // ignore
          }
          if (!errorDesc) errorDesc = edgeErr.message;
        }
        if (!errorDesc) errorDesc = directRes.error || "O servidor de WhatsApp não autorizou o envio.";

        toast.error("Falha ao enviar pelo WhatsApp", {
          description: errorDesc,
        });
      }
    } catch (e: any) {
      console.error("[WhatsappReportCard] Erro ao enviar relatório de cobranças:", e);
      toast.error("Erro ao enviar relatório", {
        description: e?.message || "Ocorreu um problema de comunicação com a API.",
      });
    } finally {
      setSendingBillingReport(false);
    }
  };

  const todayStr = todayInBahia();
  const isToday = selectedDate === todayStr;
  const isYesterday = selectedDate === getRelativeDate(-1);

  return (
    <div className="space-y-5">
      {/* 📅 Seletor de Data Dinâmico dos Relatórios */}
      <Card no3d className="border-border/60 shadow-xs rounded-2xl overflow-hidden bg-gradient-to-r from-card via-card to-muted/20">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Calendar className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-foreground">
                  Data de Referência dos Relatórios
                </h3>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-semibold py-0.5 px-2 rounded-md ${
                    isToday
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  }`}
                >
                  {isToday ? "Hoje" : isYesterday ? "Ontem" : formatDateBRDisplay(selectedDate)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-snug pl-10">
                Selecione uma data para visualizar, copiar ou disparar os relatórios de cobranças e operacionais retroativos.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap pl-10 md:pl-0">
              <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/50">
                <Button
                  type="button"
                  variant={isToday ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedDate(todayStr)}
                  className="h-8 text-xs font-semibold rounded-lg px-2.5"
                >
                  Hoje
                </Button>
                <Button
                  type="button"
                  variant={isYesterday ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedDate(getRelativeDate(-1))}
                  className="h-8 text-xs font-semibold rounded-lg px-2.5"
                >
                  Ontem
                </Button>
                <Button
                  type="button"
                  variant={selectedDate === getRelativeDate(-2) ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedDate(getRelativeDate(-2))}
                  className="h-8 text-xs font-semibold rounded-lg px-2.5"
                >
                  Anteontem
                </Button>
              </div>

              <div className="relative">
                <Input
                  type="date"
                  value={selectedDate}
                  max={todayStr}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                  className="h-10 text-xs font-semibold rounded-xl bg-background border-border/70 w-[150px] cursor-pointer"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 1: Configurações de Telefone e Ativação do WhatsApp */}
      <Card no3d className="border-border/60 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shadow-xs shrink-0 ring-1 ring-primary/20">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base font-bold text-foreground leading-tight">
                  Telefone e Destino no WhatsApp
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Defina o número de destino e habilite o envio automatizado dos resumos e relatórios.
                </CardDescription>
              </div>
            </div>

            <div className="shrink-0">
              {isWhatsappConfigured ? (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 text-[10px] font-semibold gap-1.5 py-1 px-2.5 rounded-lg whitespace-nowrap"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span className="hidden sm:inline">API WhatsApp Conectada</span>
                  <span className="sm:hidden">Conectado</span>
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-semibold gap-1.5 py-1 px-2.5 rounded-lg whitespace-nowrap"
                >
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <span className="hidden sm:inline">API Pendente</span>
                  <span className="sm:hidden">Pendente</span>
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-2 space-y-4">
          {/* Toggle de Ativação Geral */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border/40 gap-3">
            <div className="space-y-0.5 flex-1 min-w-0 pr-1">
              <Label className="text-xs sm:text-sm font-semibold text-foreground cursor-pointer block">
                Ativar envio automático no WhatsApp
              </Label>
              <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">
                Dispara os resumos e relatórios diários para o número configurado abaixo.
              </p>
            </div>
            <Switch
              checked={opPrefs.send_whatsapp ?? false}
              disabled={loadingOpPrefs}
              onCheckedChange={async (checked) => {
                try {
                  await saveOpPrefs({ send_whatsapp: checked });
                  toast.success(checked ? "Envio automático no WhatsApp ativado!" : "Envio automático no WhatsApp desativado.");
                } catch {
                  toast.error("Erro ao salvar configuração de envio.");
                }
              }}
              className="shrink-0"
            />
          </div>

          {/* Telefone de Destino */}
          <div className="space-y-2 pt-0.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-xs font-semibold text-foreground">
                Telefone WhatsApp de Destino
              </Label>
              {profilePhone && whatsappPhone !== profilePhone && (
                <button
                  type="button"
                  onClick={async () => {
                    setWhatsappPhone(profilePhone);
                    try {
                      await saveOpPrefs({ whatsapp_phone: profilePhone });
                      toast.success("Telefone do perfil aplicado!");
                    } catch {
                      toast.error("Erro ao salvar telefone.");
                    }
                  }}
                  className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                >
                  Usar telefone do perfil ({profilePhone})
                </button>
              )}
            </div>

            <div className="relative">
              <Smartphone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={profilePhone || "Ex.: (11) 99999-8888"}
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                onBlur={handlePhoneBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePhoneBlur();
                }}
                className="text-sm rounded-xl h-11 pl-9 pr-3 bg-background"
              />
            </div>

            <p className="text-[11px] text-muted-foreground leading-tight">
              {profilePhone
                ? `Se em branco, usará o telefone cadastrado no perfil (${profilePhone}).`
                : "Informe o número com DDD (ex: 11999998888)."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Resumo Operacional Diário */}
      <Card no3d className="border-border/60 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start sm:items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shadow-xs shrink-0 ring-1 ring-primary/20">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  Resumo Operacional Diário
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Consolidado financeiro com faturamento, juros recebidos, despesas e inadimplência referente a <strong>{formatDateBRDisplay(selectedDate)}</strong>.
                </CardDescription>
              </div>
            </div>

            <Badge variant="outline" className="text-xs font-semibold py-1 px-2.5 bg-muted/30">
              📅 Referência: {formatDateBRDisplay(selectedDate)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-2 space-y-5">
          {/* Horários de Envio do Resumo Operacional */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>Horários Programados de Envio Automático</span>
              </Label>
              <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground py-0.5 px-2 bg-muted/30">
                {activeOpSlots.length}/3 horários
              </Badge>
            </div>

            {activeOpSlots.length === 0 ? (
              <div className="flex flex-col sm:flex-row items-center justify-between p-3.5 rounded-xl border border-dashed border-border/80 bg-muted/20 gap-3">
                <p className="text-xs text-muted-foreground">
                  Nenhum horário programado para o resumo operacional.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs rounded-lg gap-1.5 font-medium"
                  onClick={() => handleOpTimeChange(slots[0], "19:00")}
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Primeiro Horário
                </Button>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-3">
                {activeOpSlots.map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border/70 bg-card hover:border-primary/40 transition-colors shadow-2xs group"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Clock className="h-3.5 w-3.5" />
                      </div>
                      <input
                        type="time"
                        value={opPrefs[key] ?? ""}
                        onChange={(e) => handleOpTimeChange(key, e.target.value || null)}
                        className="bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer w-full tracking-wide"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpTimeChange(key, null)}
                      title="Remover horário"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                {canAddMoreOpSlots && (
                  <button
                    type="button"
                    onClick={() => handleOpTimeChange(slots.find((s) => !opPrefs[s])!, "19:00")}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-border hover:border-primary/60 bg-muted/10 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all text-xs font-semibold h-full min-h-[46px]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar Horário</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Indicadores incluídos no Resumo Operacional */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Indicadores calculados para {formatDateBRDisplay(selectedDate)}:</span>
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <span className="font-semibold text-foreground text-xs">Recebido no dia</span>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">Total e juros recebidos na data</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <span className="font-semibold text-foreground text-xs">Juros no Mês</span>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">Faturamento acumulado</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <span className="font-semibold text-foreground text-xs">Comissões &amp; Despesas</span>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">Gerentes e custos pagos</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <span className="font-semibold text-foreground text-xs">Saldo &amp; Inadimplência</span>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">Fluxo de caixa e % de atraso</p>
              </div>
            </div>
          </div>

          {/* Ações: Pré-visualizar e Enviar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border/40">
            <p className="text-[11px] text-muted-foreground">
              {!isWhatsappConfigured ? (
                <span className="text-amber-500 font-medium">
                  Aviso: Conecte sua API do WhatsApp na aba &quot;Disparos &amp; Automação&quot; para realizar os envios.
                </span>
              ) : (
                <span>Você pode pré-visualizar o texto antes ou enviar direto para seu WhatsApp.</span>
              )}
            </p>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={handlePreviewOpSummary}
                disabled={loadingPreview}
                className="flex-1 sm:flex-initial h-9 text-xs font-semibold rounded-xl gap-2 shadow-2xs"
              >
                {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                Pré-visualizar
              </Button>

              <Button
                onClick={sendOperationalSummaryNow}
                disabled={sendingOpSummary || !isWhatsappConfigured}
                className="flex-1 sm:flex-initial h-9 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-xs"
              >
                {sendingOpSummary ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar Resumo Operacional Agora
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Relatório de Cobranças pelo WhatsApp */}
      <Card no3d className="border-border/60 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start sm:items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shadow-xs shrink-0 ring-1 ring-emerald-500/20">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  Relatório de Cobranças pelo WhatsApp
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Resumo das cobranças da aba <strong>&quot;A cobrar&quot;</strong>, enviadas e pendentes referente a <strong>{formatDateBRDisplay(selectedDate)}</strong>.
                </CardDescription>
              </div>
            </div>

            <Badge variant="outline" className="text-xs font-semibold py-1 px-2.5 bg-muted/30">
              📅 Referência: {formatDateBRDisplay(selectedDate)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-2 space-y-5">
          {/* Horários de Envio Deste Relatório */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>Horários Programados de Envio Automático</span>
              </Label>
              <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground py-0.5 px-2 bg-muted/30">
                {activeBillSlots.length}/3 horários
              </Badge>
            </div>

            {activeBillSlots.length === 0 ? (
              <div className="flex flex-col sm:flex-row items-center justify-between p-3.5 rounded-xl border border-dashed border-border/80 bg-muted/20 gap-3">
                <p className="text-xs text-muted-foreground">
                  Nenhum horário programado para o relatório de cobranças.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs rounded-lg gap-1.5 font-medium"
                  onClick={() => handleBillTimeChange(slots[0], "09:00")}
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Primeiro Horário
                </Button>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-3">
                {activeBillSlots.map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border/70 bg-card hover:border-primary/40 transition-colors shadow-2xs group"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Clock className="h-3.5 w-3.5" />
                      </div>
                      <input
                        type="time"
                        value={billPrefs[key] ?? ""}
                        onChange={(e) => handleBillTimeChange(key, e.target.value || null)}
                        className="bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer w-full tracking-wide"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleBillTimeChange(key, null)}
                      title="Remover horário"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                {canAddMoreBillSlots && (
                  <button
                    type="button"
                    onClick={() => handleBillTimeChange(slots.find((s) => !billPrefs[s])!, "09:00")}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-border hover:border-primary/60 bg-muted/10 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all text-xs font-semibold h-full min-h-[46px]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar Horário</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Indicadores incluídos no Relatório do WhatsApp */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Informações geradas para {formatDateBRDisplay(selectedDate)}:</span>
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <div className="flex items-center gap-1.5 text-foreground font-semibold text-xs">
                  <ListChecks className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Resumo do Dia</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  Total e juros a cobrar, recebidos, juros total e total geral
                </p>
              </div>

              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Enviadas</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  Clientes notificados com juros e total
                </p>
              </div>

              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold text-xs">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Não Enviadas</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  Cobranças pendentes de disparo com valores
                </p>
              </div>

              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <div className="flex items-center gap-1.5 text-foreground font-semibold text-xs">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Subtotais</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  Totais consolidados de cada seção
                </p>
              </div>
            </div>
          </div>

          {/* Ações: Pré-visualizar e Enviar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border/40">
            <p className="text-[11px] text-muted-foreground">
              {!isWhatsappConfigured ? (
                <span className="text-amber-500 font-medium">
                  Aviso: Conecte sua API do WhatsApp na aba &quot;Disparos &amp; Automação&quot; para realizar os envios.
                </span>
              ) : (
                <span>O relatório pode ser pré-visualizado, copiado ou enviado para o seu WhatsApp.</span>
              )}
            </p>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={handlePreviewBillingReport}
                disabled={loadingPreview}
                className="flex-1 sm:flex-initial h-9 text-xs font-semibold rounded-xl gap-2 shadow-2xs"
              >
                {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                Pré-visualizar
              </Button>

              <Button
                onClick={sendBillingReportNow}
                disabled={sendingBillingReport || !isWhatsappConfigured}
                className="flex-1 sm:flex-initial h-9 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-xs"
              >
                {sendingBillingReport ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar Relatório Agora no WhatsApp
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 🔍 Modal de Pré-Visualização e Cópia do Relatório */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border-border">
          <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-border/60 bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Eye className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-sm sm:text-base font-bold text-foreground">
                  {previewTitle}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Texto formatado exatamente como será enviado no WhatsApp / Telegram.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-4 sm:p-5 flex-1 overflow-y-auto bg-muted/10">
            <div className="p-4 rounded-xl bg-background border border-border/70 shadow-inner font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed select-text">
              {previewText}
            </div>
          </div>

          <DialogFooter className="p-3 sm:p-4 border-t border-border/60 bg-card flex flex-row items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCopyText(previewText)}
              className="h-9 text-xs font-semibold rounded-xl gap-1.5"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado!" : "Copiar Texto"}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreviewOpen(false)}
                className="h-9 text-xs font-semibold rounded-xl"
              >
                Fechar
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setPreviewOpen(false);
                  if (previewType === "billing") {
                    sendBillingReportNow();
                  } else {
                    sendOperationalSummaryNow();
                  }
                }}
                disabled={!isWhatsappConfigured}
                className={`h-9 text-xs font-semibold rounded-xl gap-1.5 text-white ${
                  previewType === "billing" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-primary hover:bg-primary/90"
                }`}
              >
                <Send className="h-3.5 w-3.5" />
                Enviar pelo WhatsApp
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
