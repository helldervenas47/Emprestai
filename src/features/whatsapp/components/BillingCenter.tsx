import React from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Clock3, Flag, ListChecks, Loader2, MessageCircle, Pause, RefreshCw, Send, Users, WalletCards, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_WHATSAPP_MESSAGES } from "@/lib/whatsappBilling";
import { buildBillingCandidates, type BillingCandidate } from "../lib/billingCenter";
import { toast } from "sonner";

type Filter = "all" | "today" | "overdue" | "upcoming";
type QueueRow = { id: string; batch_id: string; client_id: string; loan_id: string; loan_ids?: string[] | null; status: string; scheduled_at: string; sent_at?: string; error_message?: string; attempts: number };
type ClientBillingPreference = { id: string; name: string; openLoans: number; enabled: boolean };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = (ymd: string) => ymd.split("-").reverse().join("/");
const bahiaDay = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(value));
const getDaysUntil = (ymd: string, today: string) =>
  Math.round((new Date(`${ymd}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);

function SummaryCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-border/60 bg-muted/25 p-3 text-center">
    <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate">{label}</span>
    </div>
    <p className="mt-1 truncate text-base font-bold tabular-nums sm:text-lg" title={value}>{value}</p>
  </div>;
}

export function BillingCenter() {
  const { user, dataOwnerId } = useAuth();
  const [items, setItems] = React.useState<BillingCandidate[]>([]);
  const [queue, setQueue] = React.useState<QueueRow[]>([]);
  const [sentTodayClientIds, setSentTodayClientIds] = React.useState<Set<string>>(new Set());
  const [sentTodayLoanIds, setSentTodayLoanIds] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState<Filter>("all");
  const [confirm, setConfirm] = React.useState<BillingCandidate[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [historyStatus, setHistoryStatus] = React.useState<"all" | "sent" | "failed" | "cancelled">("all");
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [chargedTodayOpen, setChargedTodayOpen] = React.useState(true);
  const [clientsOpen, setClientsOpen] = React.useState(false);
  const [clientPreferences, setClientPreferences] = React.useState<ClientBillingPreference[]>([]);
  const [clientPreferenceDraft, setClientPreferenceDraft] = React.useState<Set<string>>(new Set());
  const [clientPreferenceView, setClientPreferenceView] = React.useState<"all" | "selected" | "unselected">("all");
  const [savingClients, setSavingClients] = React.useState(false);
  const autoSelectionKeyRef = React.useRef("");
  const [centerTemplates, setCenterTemplates] = React.useState({
    single: DEFAULT_WHATSAPP_MESSAGES.message_center_single,
    multiple: DEFAULT_WHATSAPP_MESSAGES.message_center_multiple,
    pixLink: "",
  });

  const refresh = React.useCallback(async () => {
    if (!user || !dataOwnerId) return;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
    const todayStart = new Date(`${today}T00:00:00-03:00`).toISOString();
    const tomorrow = new Date(`${today}T00:00:00-03:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const [loans, clients, schedules, payments, promises, queued, sentClients, templates] = await Promise.all([
      supabase.from("loans").select("*").eq("user_id", dataOwnerId),
      supabase.from("clients").select("*").eq("user_id", dataOwnerId),
      supabase.from("loan_installments").select("*").eq("user_id", dataOwnerId),
      supabase.from("payments").select("*").eq("user_id", dataOwnerId),
      supabase.from("whatsapp_payment_promises").select("loan_id, installment_number, promised_date").eq("user_id", dataOwnerId),
      supabase.from("whatsapp_billing_queue").select("id, batch_id, client_id, loan_id, loan_ids, status, scheduled_at, sent_at, error_message, attempts").eq("user_id", dataOwnerId).order("created_at", { ascending: false }).limit(100),
      supabase.from("whatsapp_billing_queue").select("client_id, loan_id, loan_ids").eq("user_id", dataOwnerId).eq("status", "sent").gte("sent_at", todayStart).lt("sent_at", tomorrow.toISOString()),
      supabase.from("whatsapp_billing_messages").select("message_upcoming, message_due_today, message_overdue, message_very_overdue, message_center_single, message_center_multiple, very_overdue_days, pix_link").eq("owner_id", dataOwnerId).maybeSingle(),
    ]);
    const errors = [loans.error, clients.error, schedules.error, payments.error, promises.error, queued.error, sentClients.error].filter(Boolean);
    if (errors.length) toast.error("Não foi possível carregar toda a Central de Cobranças.");
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
    const openLoansByClient = new Map<string, number>();
    for (const loan of mappedLoans) {
      if (!loan.borrowerId || loan.status === "paid" || loan.paidInstallments >= loan.installments) continue;
      openLoansByClient.set(loan.borrowerId, (openLoansByClient.get(loan.borrowerId) || 0) + 1);
    }
    const preferences = mappedClients
      .filter((client: any) => openLoansByClient.has(client.id))
      .map((client: any) => ({
        id: client.id,
        name: client.name || "Cliente sem nome",
        openLoans: openLoansByClient.get(client.id) || 0,
        enabled: client.auto_billing_enabled !== false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
    setClientPreferences(preferences);
    const mappedSchedules = (schedules.data || []).map((s: any) => ({ ...s, loanId: s.loan_id, installmentNumber: Number(s.installment_number), dueDate: s.due_date, amount: Number(s.amount ?? 0) }));
    const mappedPayments = (payments.data || []).map((p: any) => ({ ...p, loanId: p.loan_id, installmentNumber: Number(p.installment_number), amount: Number(p.amount ?? 0) }));
    setItems(buildBillingCandidates({ loans: mappedLoans as any, clients: mappedClients as any, schedules: mappedSchedules, payments: mappedPayments, promises: promises.data || [], today, messages: (templates.data as any) || undefined }));
    setCenterTemplates({
      single: (templates.data as any)?.message_center_single || DEFAULT_WHATSAPP_MESSAGES.message_center_single,
      multiple: (templates.data as any)?.message_center_multiple || DEFAULT_WHATSAPP_MESSAGES.message_center_multiple,
      pixLink: (templates.data as any)?.pix_link || "",
    });
    setQueue((queued.data || []) as QueueRow[]);
    setSentTodayClientIds(new Set((sentClients.data || []).map((row: any) => row.client_id)));
    setSentTodayLoanIds(new Set((sentClients.data || []).flatMap((row: any) =>
      Array.isArray(row.loan_ids) && row.loan_ids.length ? row.loan_ids : [row.loan_id]
    ).filter(Boolean)));
    setLoading(false);
  }, [user, dataOwnerId]);

  React.useEffect(() => { refresh(); }, [refresh]);
  React.useEffect(() => {
    if (!queue.some((q) => q.status === "pending" || q.status === "processing")) return;
    const id = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(id);
  }, [queue, refresh]);

  const todayInBahia = bahiaDay(new Date());
  const autoBillingClientIds = React.useMemo(
    () => new Set(clientPreferences.filter((client) => client.enabled).map((client) => client.id)),
    [clientPreferences],
  );
  const visible = items.filter((item) => (filter === "all" && item.billingDate <= todayInBahia) ||
    (filter === "today" && ["requested_today", "today"].includes(item.priority)) ||
    (filter === "overdue" && item.priority === "overdue") ||
    (filter === "upcoming" && ["tomorrow", "in_two_days", "in_three_days", "in_four_days"].includes(item.priority)));
  React.useEffect(() => {
    if (loading) return;
    const keys = visible.filter((item) => item.validPhone && autoBillingClientIds.has(item.clientId) && !sentTodayClientIds.has(item.clientId)).map((item) => item.key).sort();
    const autoSelectionKey = `${filter}:${keys.join("|")}`;
    if (autoSelectionKeyRef.current === autoSelectionKey) return;
    autoSelectionKeyRef.current = autoSelectionKey;
    setSelected(new Set(keys));
  }, [filter, loading, visible, autoBillingClientIds, sentTodayClientIds]);
  const selectedItems = visible.filter((item) => selected.has(item.key));
  const visibleClientIds = new Set(visible.map((item) => item.clientId));
  const sentToday = queue.filter((q) => q.status === "sent" && q.sent_at && bahiaDay(q.sent_at) === todayInBahia && visibleClientIds.has(q.client_id)).length;
  const visibleAmount = visible.reduce((sum, item) => sum + item.amount, 0);

  const enqueue = async () => {
    if (!confirm?.length) return;
    setCreating(true);
    const chargeable = confirm.filter((item) => !sentTodayClientIds.has(item.clientId));
    if (!chargeable.length) {
      setCreating(false);
      setConfirm(null);
      return toast.info("Este cliente já foi cobrado hoje.");
    }
    const grouped = Array.from(chargeable.reduce((map, item) => {
      const rows = map.get(item.clientId) || [];
      rows.push(item); map.set(item.clientId, rows); return map;
    }, new Map<string, BillingCandidate[]>()).values());
    const queueItems = grouped.map((rows) => {
      const first = rows[0];
      return { client_id: first.clientId, loan_id: first.loanId, loan_ids: rows.map((item) => item.loanId), installment_number: first.installmentNumber, phone: first.phone, message: rows.length > 1 ? consolidatedMessage(rows, centerTemplates.multiple, centerTemplates.pixLink) : singleContractMessage(first, centerTemplates.single, centerTemplates.pixLink), amount: rows.reduce((sum, item) => sum + item.amount, 0), due_date: first.dueDate };
    });
    const { data, error } = await supabase.functions.invoke("create-whatsapp-billing-queue", { body: { owner_id: dataOwnerId, items: queueItems } });
    setCreating(false);
    if (error || data?.error) return toast.error(data?.error === "already_charged_today" ? "Este cliente já foi cobrado hoje." : data?.error === "duplicate_today" ? "Uma dessas cobranças já foi enviada ou está na fila hoje." : "Não foi possível criar a fila de cobranças.");
    toast.success(`${confirm.length} contrato(s) agrupado(s) em ${queueItems.length} mensagem(ns).`);
    setSelected(new Set()); setConfirm(null); await refresh();
  };

  const updateBatch = async (status: "paused" | "pending" | "cancelled") => {
    const batch = queue.find((q) => ["pending", "processing", "paused"].includes(q.status))?.batch_id;
    if (!batch) return;
    const source = status === "pending" ? "paused" : "pending";
    await supabase.from("whatsapp_billing_queue").update({ status, ...(status === "pending" ? { scheduled_at: new Date().toISOString() } : {}) }).eq("batch_id", batch).eq("status", source);
    await refresh();
  };

  const retry = async (id: string) => {
    await supabase.from("whatsapp_billing_queue").update({ status: "pending", scheduled_at: new Date().toISOString(), error_message: null }).eq("id", id).eq("status", "failed");
    await refresh();
  };

  const openClientPreferences = () => {
    setClientPreferenceDraft(new Set(clientPreferences.filter((client) => client.enabled).map((client) => client.id)));
    setClientPreferenceView("all");
    setClientsOpen(true);
  };

  const filteredClientPreferences = clientPreferences.filter((client) =>
    clientPreferenceView === "all"
      || (clientPreferenceView === "selected" && clientPreferenceDraft.has(client.id))
      || (clientPreferenceView === "unselected" && !clientPreferenceDraft.has(client.id))
  );

  const saveClientPreferences = async () => {
    if (!dataOwnerId) return;
    const changed = clientPreferences.filter((client) => client.enabled !== clientPreferenceDraft.has(client.id));
    if (!changed.length) {
      setClientsOpen(false);
      return;
    }
    setSavingClients(true);
    const results = await Promise.all(changed.map((client) => supabase
      .from("clients")
      .update({ auto_billing_enabled: clientPreferenceDraft.has(client.id) })
      .eq("id", client.id)
      .eq("user_id", dataOwnerId)));
    setSavingClients(false);
    if (results.some((result) => result.error)) {
      toast.error("Não foi possível salvar a seleção de todos os clientes.");
      return;
    }
    setClientPreferences((previous) => previous.map((client) => ({
      ...client,
      enabled: clientPreferenceDraft.has(client.id),
    })));
    setSelected(new Set(visible
      .filter((item) => item.validPhone && clientPreferenceDraft.has(item.clientId))
      .map((item) => item.key)));
    autoSelectionKeyRef.current = "";
    setClientsOpen(false);
    toast.success("Clientes da cobrança automática atualizados.");
  };

  const clientGroups = Array.from(
    visible.reduce((map, item) => {
      const current = map.get(item.clientId) || { clientId: item.clientId, clientName: item.clientName, rows: [] as BillingCandidate[] };
      current.rows.push(item);
      current.rows.sort((a, b) => a.billingDate.localeCompare(b.billingDate) || a.dueDate.localeCompare(b.dueDate));
      map.set(item.clientId, current);
      return map;
    }, new Map<string, { clientId: string; clientName: string; rows: BillingCandidate[] }>()).values(),
  ).sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR", { sensitivity: "base" }));
  const clientsSentToday = sentTodayClientIds;
  const chargedTodayGroups = clientGroups
    .map((group) => ({ ...group, rows: group.rows.filter((item) => sentTodayLoanIds.has(item.loanId)) }))
    .filter((group) => group.rows.length > 0);
  const pendingClientGroups = clientGroups
    .map((group) => ({ ...group, rows: group.rows.filter((item) => !sentTodayLoanIds.has(item.loanId)) }))
    .filter((group) => group.rows.length > 0);

  const upcomingDayGroups = React.useMemo(() => {
    if (filter !== "upcoming") return [];
    const dayMap = new Map<number, { dateYmd: string; items: BillingCandidate[] }>();
    for (const item of visible) {
      if (sentTodayLoanIds.has(item.loanId)) continue;
      const daysUntil = Math.max(1, getDaysUntil(item.billingDate, todayInBahia));
      const current = dayMap.get(daysUntil) || { dateYmd: item.billingDate, items: [] };
      current.items.push(item);
      if (!current.dateYmd || item.billingDate < current.dateYmd) {
        current.dateYmd = item.billingDate;
      }
      dayMap.set(daysUntil, current);
    }
    const sortedDays = Array.from(dayMap.keys()).sort((a, b) => a - b);
    return sortedDays.map((daysUntil) => {
      const data = dayMap.get(daysUntil)!;
      const label = daysUntil === 1 ? "Vence em 1 dia" : `Vence em ${daysUntil} dias`;
      const totalAmount = data.items.reduce((sum, i) => sum + i.amount, 0);
      const totalContracts = data.items.length;
      const clientMap = new Map<string, { clientId: string; clientName: string; rows: BillingCandidate[] }>();
      for (const item of data.items) {
        const current = clientMap.get(item.clientId) || { clientId: item.clientId, clientName: item.clientName, rows: [] };
        current.rows.push(item);
        clientMap.set(item.clientId, current);
      }
      const groups = Array.from(clientMap.values()).sort((a, b) =>
        a.clientName.localeCompare(b.clientName, "pt-BR", { sensitivity: "base" })
      );
      return {
        daysUntil,
        dateFormatted: date(data.dateYmd),
        label,
        totalAmount,
        totalContracts,
        clientGroups: groups,
      };
    });
  }, [filter, visible, todayInBahia, sentTodayLoanIds]);

  const activeQueue = queue.filter((q) => ["pending", "processing"].includes(q.status));
  const pausedQueue = queue.filter((q) => q.status === "paused");
  const historyRows = queue.filter((q) => historyStatus === "all" || q.status === historyStatus).slice(0, 30);

  return <div className="space-y-3">
    <Card no3d className="rounded-2xl border-border/60"><CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-500"/><h2 className="font-bold">Central de Cobranças</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Quem você precisa cobrar hoje, em uma única lista.</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-full px-3" onClick={openClientPreferences}>
          <Users className="mr-1.5 h-3.5 w-3.5"/>Clientes
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryCard icon={ListChecks} label="Cobranças" value={String(visible.length)} />
        <SummaryCard icon={WalletCards} label="A receber" value={money.format(visibleAmount)} />
        <SummaryCard icon={Users} label="Clientes" value={String(visibleClientIds.size)} />
        <SummaryCard icon={Send} label="Enviadas hoje" value={String(sentToday)} />
      </div>
    </CardContent></Card>

    <div className="flex w-full items-center gap-2 pb-1"><div className="grid min-w-0 flex-1 grid-cols-4 gap-1.5">{([['today','Hoje'],['overdue','Atrasadas'],['all','A cobrar'],['upcoming','Futuras']] as [Filter,string][]).map(([id,label]) => <Button key={id} size="sm" variant={filter === id ? "default" : "outline"} className="h-8 w-full min-w-0 rounded-full px-1 text-[11px] sm:px-3 sm:text-xs" onClick={() => setFilter(id)}>{label}</Button>)}</div><Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0" aria-label="Atualizar cobranças" onClick={refresh}><RefreshCw className="h-3.5 w-3.5"/></Button></div>

    <div className="sticky top-2 z-20 flex w-full items-center gap-1.5 rounded-xl border bg-background/95 p-2 shadow-sm backdrop-blur sm:gap-2">
      <Button size="sm" variant="ghost" className="min-w-0 flex-1 px-1 text-xs sm:flex-none sm:px-3 sm:text-sm" onClick={() => setSelected(new Set(visible.filter((i) => i.validPhone && !clientsSentToday.has(i.clientId)).map((i) => i.key)))}>Selecionar todos</Button>
      <Button size="sm" variant="ghost" className="min-w-0 flex-1 px-1 text-xs sm:flex-none sm:px-3 sm:text-sm" onClick={() => setSelected(new Set())}>Desmarcar</Button>
      <Button size="sm" className="shrink-0 bg-emerald-600 px-3 hover:bg-emerald-700 sm:ml-auto" disabled={!selectedItems.length} onClick={() => setConfirm(selectedItems)}><Send className="mr-1.5 h-4 w-4"/>Cobrar</Button>
    </div>

    {activeQueue.length > 0 && <Card no3d className="border-primary/30"><CardContent className="p-3 flex items-center gap-3"><Loader2 className="h-4 w-4 animate-spin text-primary"/><div className="flex-1"><p className="text-sm font-semibold">Enviando cobranças</p><p className="text-xs text-muted-foreground">{queue.filter(q => q.status === 'sent').length} enviadas · {activeQueue.length} aguardando/processando</p></div><Button size="sm" variant="outline" onClick={() => updateBatch('paused')}><Pause className="h-3.5 w-3.5 mr-1"/>Pausar</Button><Button size="sm" variant="ghost" onClick={() => updateBatch('cancelled')}>Cancelar fila</Button></CardContent></Card>}
    {pausedQueue.length > 0 && <Card no3d className="border-amber-500/30"><CardContent className="p-3 flex items-center gap-3"><Pause className="h-4 w-4 text-amber-500"/><p className="text-sm font-semibold flex-1">Fila pausada · {pausedQueue.length} aguardando</p><Button size="sm" onClick={() => updateBatch('pending')}>Retomar</Button><Button size="sm" variant="ghost" onClick={() => updateBatch('cancelled')}>Cancelar fila</Button></CardContent></Card>}

    {chargedTodayGroups.length > 0 && (
      <Collapsible open={chargedTodayOpen} onOpenChange={setChargedTodayOpen} className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
        <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-emerald-500/10">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-emerald-700 dark:text-emerald-400">Cobrado Hoje</span>
            <span className="block text-[11px] text-muted-foreground">Clientes que já receberam cobrança neste dia</span>
          </span>
          <Badge className="border-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">{chargedTodayGroups.length}</Badge>
          <ChevronDown className={`h-4 w-4 transition-transform ${chargedTodayOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 border-t border-emerald-500/20 p-2">
          {chargedTodayGroups.map((group) => (
            <ClientBillingFolder
              key={`charged-${group.clientId}`}
              group={group}
              sentToday
              selected={selected}
              setSelected={setSelected}
              onCharge={(item) => setConfirm([item])}
              onChargeMany={(rows) => setConfirm(rows)}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    )}

    {loading ? (
      <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary"/></div>
    ) : visible.length === 0 ? (
      <Card no3d><CardContent className="py-10 text-center text-sm text-muted-foreground"><CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500"/>Nenhuma cobrança prioritária neste filtro.</CardContent></Card>
    ) : filter === "upcoming" ? (
      <div className="space-y-4">
        {upcomingDayGroups.map((dayGroup) => (
          <div key={dayGroup.daysUntil} className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1 pt-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <CalendarClock className="h-3 w-3" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground truncate">
                  {dayGroup.label}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  ({dayGroup.dateFormatted})
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium shrink-0">
                <Badge variant="outline" className="text-[10px] font-semibold h-5 px-1.5">
                  {dayGroup.totalContracts} {dayGroup.totalContracts === 1 ? "contrato" : "contratos"}
                </Badge>
                <span className="font-bold text-foreground tabular-nums">
                  {money.format(dayGroup.totalAmount)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {dayGroup.clientGroups.map((group) => (
                <ClientBillingFolder
                  key={`${dayGroup.daysUntil}-${group.clientId}`}
                  group={group}
                  sentToday={false}
                  blockedToday={clientsSentToday.has(group.clientId)}
                  selected={selected}
                  setSelected={setSelected}
                  onCharge={(item) => setConfirm([item])}
                  onChargeMany={(rows) => setConfirm(rows)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="space-y-2">
        {pendingClientGroups.map((group) => (
          <ClientBillingFolder
            key={group.clientId}
            group={group}
            sentToday={false}
            blockedToday={clientsSentToday.has(group.clientId)}
            selected={selected}
            setSelected={setSelected}
            onCharge={(item) => setConfirm([item])}
            onChargeMany={(rows) => setConfirm(rows)}
          />
        ))}
      </div>
    )}

    <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}><Card no3d><CardContent className="p-3"><CollapsibleTrigger className="flex w-full items-center gap-2 text-left"><h3 className="flex-1 text-sm font-semibold">Histórico recente</h3><Badge variant="outline" className="text-[10px]">{queue.length}</Badge><ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`}/></CollapsibleTrigger><CollapsibleContent><div className="mt-3 flex flex-wrap gap-1">{([['all','Todas'],['sent','Enviadas'],['failed','Falharam'],['cancelled','Canceladas']] as const).map(([id,label]) => <Button key={id} size="sm" variant={historyStatus === id ? 'secondary' : 'ghost'} className="h-7 px-2 text-[11px]" onClick={() => setHistoryStatus(id)}>{label}</Button>)}</div><div className="mt-2 space-y-1">{historyRows.map(row => <div key={row.id} className="flex items-center gap-2 text-xs py-1.5 border-b last:border-0">{row.status === 'sent' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500"/> : row.status === 'failed' ? <XCircle className="h-3.5 w-3.5 text-destructive"/> : <Clock3 className="h-3.5 w-3.5 text-muted-foreground"/>}<span className="capitalize">{row.status}</span><span className="ml-auto text-muted-foreground">Tentativa {row.attempts}</span>{row.error_message && <span className="truncate max-w-[35%] text-destructive">{row.error_message}</span>}{row.status === 'failed' && <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => retry(row.id)}>Tentar novamente</Button>}</div>)}</div></CollapsibleContent></CardContent></Card></Collapsible>

    <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}><DialogContent><DialogHeader><DialogTitle>Enviar cobranças?</DialogTitle><DialogDescription>{confirm && new Set(confirm.map(i => i.clientId)).size === 1 ? `Enviar uma mensagem com ${confirm.length} contrato(s) para ${confirm[0].clientName}?` : `${confirm?.length || 0} contratos serão agrupados por cliente, sem limite de quantidade.`}</DialogDescription></DialogHeader>{confirm && new Set(confirm.map(i => i.clientId)).size === 1 && <div className="max-h-72 overflow-y-auto rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-wrap">{confirm.length > 1 ? consolidatedMessage(confirm, centerTemplates.multiple, centerTemplates.pixLink) : singleContractMessage(confirm[0], centerTemplates.single, centerTemplates.pixLink)}</div>}<DialogFooter><Button variant="outline" onClick={() => setConfirm(null)}>Cancelar</Button><Button onClick={enqueue} disabled={creating}>{creating && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Enviar mensagem</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={clientsOpen} onOpenChange={setClientsOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Clientes da cobrança automática</DialogTitle>
          <DialogDescription>Marque quem pode receber cobranças automáticas. A lista inclui clientes com pelo menos um empréstimo em aberto.</DialogDescription>
        </DialogHeader>
        <div className="grid w-full grid-cols-3 rounded-xl bg-muted p-1" role="group" aria-label="Filtrar clientes da cobrança automática">
          {([
            ["all", "Todos", clientPreferences.length],
            ["selected", "Marcados", clientPreferenceDraft.size],
            ["unselected", "Desmarcados", clientPreferences.length - clientPreferenceDraft.size],
          ] as const).map(([id, label, count]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={clientPreferenceView === id ? "secondary" : "ghost"}
              aria-pressed={clientPreferenceView === id}
              onClick={() => setClientPreferenceView(id)}
              className="h-auto min-w-0 rounded-lg px-1.5 py-2 text-[11px] sm:px-3 sm:text-xs"
            >
              <span className="truncate">{label}</span>
              <Badge variant="outline" className="ml-1 h-5 min-w-5 shrink-0 justify-center px-1 text-[9px]">{count}</Badge>
            </Button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setClientPreferenceDraft(new Set(clientPreferences.map((client) => client.id)))}>Marcar todos</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setClientPreferenceDraft(new Set())}>Desmarcar todos</Button>
        </div>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {filteredClientPreferences.map((client) => {
            const checked = clientPreferenceDraft.has(client.id);
            return <button key={client.id} type="button" onClick={() => setClientPreferenceDraft((previous) => {
              const next = new Set(previous);
              checked ? next.delete(client.id) : next.add(client.id);
              return next;
            })} className="flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:bg-muted/40">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                <Flag className={`h-4 w-4 ${checked ? "fill-current" : ""}`}/>
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{client.name}</span>
              <Badge variant="outline" className="shrink-0 text-[10px]">{client.openLoans}<span className="hidden sm:inline">&nbsp;em aberto</span></Badge>
            </button>;
          })}
          {!filteredClientPreferences.length && <p className="py-8 text-center text-sm text-muted-foreground">{clientPreferences.length ? "Nenhum cliente neste filtro." : "Nenhum cliente com empréstimo em aberto."}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setClientsOpen(false)}>Cancelar</Button>
          <Button onClick={saveClientPreferences} disabled={savingClients}>{savingClients && <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/>}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function ClientBillingFolder({ group, sentToday, blockedToday = sentToday, selected, setSelected, onCharge, onChargeMany }: {
  group: { clientId: string; clientName: string; rows: BillingCandidate[] };
  sentToday: boolean;
  blockedToday?: boolean;
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  onCharge: (item: BillingCandidate) => void;
  onChargeMany: (items: BillingCandidate[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectableKeys = blockedToday ? [] : group.rows.filter((item) => item.validPhone).map((item) => item.key);
  const allSelected = selectableKeys.length > 0 && selectableKeys.every((key) => selected.has(key));
  const toggleGroup = () => setSelected((previous) => {
    const next = new Set(previous);
    if (allSelected) selectableKeys.forEach((key) => next.delete(key));
    else selectableKeys.forEach((key) => next.add(key));
    return next;
  });
  return <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border bg-card overflow-hidden">
    <div className="flex w-full items-center hover:bg-muted/40">
      <button type="button" onClick={toggleGroup} disabled={!selectableKeys.length} aria-label={`${allSelected ? "Desmarcar" : "Selecionar"} todos os contratos de ${group.clientName}`} aria-pressed={allSelected} className={`ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-40 ${allSelected ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
        <Flag className={`h-4 w-4 ${allSelected ? "fill-current" : ""}`}/>
      </button>
      <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 px-2 py-3 text-left">
      <span className={`min-w-0 flex-1 truncate text-sm font-bold ${sentToday ? "text-emerald-500" : ""}`}>{group.clientName}</span>
      {sentToday && <Badge className="bg-emerald-500/15 text-emerald-600 border-0 text-[10px]">Cobrado hoje</Badge>}
      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground sm:text-xs">{money.format(group.rows.reduce((sum, item) => sum + item.amount, 0))}</span>
      <Badge variant="outline" className="min-w-7 justify-center px-2 text-[10px]">
        <span>{group.rows.length}</span><span className="hidden sm:inline">&nbsp;contrato(s)</span>
      </Badge>
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}/>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent className="border-t">
      {group.rows.map(item => <div key={item.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b last:border-0 px-3 py-2.5">
        <Checkbox checked={selected.has(item.key)} disabled={!item.validPhone || blockedToday} onCheckedChange={(checked) => setSelected(prev => { const next = new Set(prev); checked ? next.add(item.key) : next.delete(item.key); return next; })}/>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="max-w-full truncate text-[10px]">{item.contractLabel}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{money.format(item.amount)} · vencimento original {date(item.dueDate)}{item.daysOverdue ? ` · ${item.daysOverdue} dias de atraso` : ""}</p>
          {item.promisedDate && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary"><CalendarClock className="h-3.5 w-3.5"/>Nova Data: {date(item.promisedDate)}</p>}
          {!item.validPhone && <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3"/>Número de WhatsApp inválido</p>}
        </div>
        <Button size="sm" variant="outline" disabled={!item.validPhone || blockedToday} onClick={() => onCharge(item)}>Cobrar</Button>
      </div>)}
      <div className="flex justify-end bg-muted/20 p-3"><Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto" disabled={blockedToday || !group.rows.some(item => item.validPhone)} onClick={() => onChargeMany(group.rows.filter(item => item.validPhone))}><Send className="mr-1.5 h-3.5 w-3.5"/>{sentToday ? "Cobrado hoje" : blockedToday ? "Cliente já cobrado hoje" : `Cobrar todos (${group.rows.filter(item => item.validPhone).length})`}</Button></div>
    </CollapsibleContent>
  </Collapsible>;
}

function itemSituation(item: BillingCandidate) {
  if (item.promisedDate) return `Venc. ${date(item.billingDate)}`;
  return item.daysOverdue > 0 ? `vencido há ${item.daysOverdue} dia(s)` : item.priority === "today" ? "vence hoje" : `vence em ${date(item.dueDate)}`;
}

function singleContractMessage(item: BillingCandidate, template: string, pixLink: string): string {
  return template
    .replace(/\{nome_cliente\}|\{nome\}/g, item.clientName)
    .replace(/\{etiqueta\}/g, item.contractLabel)
    .replace(/\{valor_total\}|\{valor_cobranca\}|\{valor_parcela\}|\{valor\}/g, money.format(item.amount))
    .replace(/\{valor_base\}/g, money.format(item.baseAmount))
    .replace(/\{encargos\}|\{juros\}/g, money.format(item.lateFees))
    .replace(/\{parcelas_vencidas\}/g, String(item.overdueInstallmentCount))
    .replace(/\{vencimento_original\}/g, date(item.dueDate))
    .replace(/\{data_priorizada\}|\{data_vencimento\}/g, date(item.billingDate))
    .replace(/\{dias_atraso\}/g, String(item.daysOverdue))
    .replace(/\{situacao\}/g, itemSituation(item))
    .replace(/\{link_pagamento\}/g, pixLink);
}

function consolidatedMessage(items: BillingCandidate[], template: string, pixLink: string): string {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const baseTotal = items.reduce((sum, item) => sum + item.baseAmount, 0);
  const feesTotal = items.reduce((sum, item) => sum + item.lateFees, 0);
  const overdueInstallments = items.reduce((sum, item) => sum + item.overdueInstallmentCount, 0);
  const lines = items.map((item) => {
    const amountSummary = item.overdueInstallmentCount > 1
      ? `${item.overdueInstallmentCount} parcelas vencidas — ${money.format(item.amount)}`
      : money.format(item.amount);
    if (item.promisedDate) {
      return `• ${item.contractLabel} — ${amountSummary} — Venc. ${date(item.billingDate)}`;
    }
    return `• ${item.contractLabel} — ${amountSummary} — ${itemSituation(item)}`;
  });
  return template
    .replace(/\{nome_cliente\}|\{nome\}/g, items[0].clientName)
    .replace(/\{lista_contratos\}/g, lines.join("\n"))
    .replace(/\{quantidade_contratos\}/g, String(items.length))
    .replace(/\{valor_total\}|\{valor_cobranca\}|\{valor\}/g, money.format(total))
    .replace(/\{valor_base\}/g, money.format(baseTotal))
    .replace(/\{encargos\}|\{juros\}/g, money.format(feesTotal))
    .replace(/\{parcelas_vencidas\}/g, String(overdueInstallments))
    .replace(/\{etiquetas_contratos\}/g, items.map((item) => item.contractLabel).join(", "))
    .replace(/\{valores_contratos\}/g, items.map((item) => money.format(item.amount)).join("; "))
    .replace(/\{datas_priorizadas\}/g, items.map((item) => date(item.billingDate)).join("; "))
    .replace(/\{link_pagamento\}/g, pixLink);
}
