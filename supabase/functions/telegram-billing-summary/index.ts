import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getExternalAdmin, getExternalSupabaseUrl, getExternalAnonKey } from "../_shared/external-supabase.ts";
import { dueSlotKeys } from "../_shared/schedule.ts";
import { sendReportsAsImage, getReportsLinkForUser } from "../_shared/reports-bot.ts";
import { sendWhatsappText } from "../_shared/whatsapp-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(n)
    .replace(/\u00a0/g, " ");
}

function todayInTZ(tz = "America/Sao_Paulo") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
  };
}

function formatDateBR(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function normalizePhoneBR(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

interface BillingCandidateItem {
  loanId: string;
  clientId: string;
  clientName: string;
  amount: number;
  interestAmount: number;
  billingDate: string;
}

interface GroupedClientBilling {
  clientName: string;
  amount: number;
  interestAmount: number;
  count: number;
}

function groupCandidatesByClient(candidates: BillingCandidateItem[]): GroupedClientBilling[] {
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

async function buildWhatsappBillingReport(admin: any, ownerId: string, today: string): Promise<string> {
  const todayStart = `${today}T00:00:00-03:00`;
  const tomorrowObj = new Date(`${today}T00:00:00-03:00`);
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowIso = tomorrowObj.toISOString();

  const [loansRes, clientsRes, schedulesRes, paymentsRes, promisesRes, sentQueueRes] = await Promise.all([
    admin.from("loans").select("*").eq("user_id", ownerId).neq("status", "paid"),
    admin.from("clients").select("*").eq("user_id", ownerId),
    admin.from("loan_installments").select("*").eq("user_id", ownerId),
    admin.from("payments").select("*").eq("user_id", ownerId),
    admin.from("whatsapp_payment_promises").select("loan_id, installment_number, promised_date").eq("user_id", ownerId),
    admin.from("whatsapp_billing_queue").select("client_id, loan_id, loan_ids, status, sent_at").eq("user_id", ownerId).eq("status", "sent").gte("sent_at", todayStart).lt("sent_at", tomorrowIso),
  ]);

  const loans = loansRes.data ?? [];
  const clients = clientsRes.data ?? [];
  const schedules = schedulesRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const promises = promisesRes.data ?? [];
  const clientById = new Map<string, any>(clients.map((c: any) => [c.id, c]));

  const candidates: BillingCandidateItem[] = [];

  for (const loan of loans) {
    const paidInstallments = Number(loan.paid_installments || 0);
    const totalInstallments = Math.max(1, Number(loan.installments || 1));
    if (paidInstallments >= totalInstallments) continue;

    const client = loan.borrower_id ? clientById.get(loan.borrower_id) : undefined;
    const clientId = client?.id || loan.borrower_id || `loan:${loan.id}`;
    const clientName = client?.name || loan.borrower_name || "Cliente não identificado";
    const nextInstallmentNum = paidInstallments + 1;

    const schedule = schedules.find(
      (s: any) => s.loan_id === loan.id && Number(s.installment_number) === nextInstallmentNum
    );
    const dueDate = (schedule?.due_date || loan.due_date || "").slice(0, 10);
    const storedPromise = promises.find(
      (p: any) => p.loan_id === loan.id && Number(p.installment_number) === nextInstallmentNum
    );
    const rawPromisedDate = storedPromise?.promised_date;
    const promisedDate = (rawPromisedDate && rawPromisedDate >= dueDate) ? rawPromisedDate : undefined;
    const billingDate = promisedDate || dueDate;

    // Filtro da aba "A cobrar" (billingDate <= hoje)
    if (billingDate > today) continue;

    // Cálculo do valor da parcela
    let baseAmount = Number(loan.custom_installment_value || 0);
    if (!baseAmount && schedule?.amount) {
      baseAmount = Number(schedule.amount);
    }
    if (!baseAmount) {
      const principal = Number(loan.amount || 0);
      const rate = Number(loan.interest_rate || 0);
      const total = principal * (1 + rate / 100);
      baseAmount = totalInstallments > 0 ? total / totalInstallments : total;
    }

    const contractualInterestRate = Number(loan.interest_rate) || 0;
    const nominalInterest = (Number(loan.amount || 0) * contractualInterestRate) / (100 * totalInstallments);
    const interestAmount = Math.max(0, Math.round(nominalInterest * 100) / 100);

    candidates.push({
      loanId: loan.id,
      clientId,
      clientName,
      amount: baseAmount,
      interestAmount,
      billingDate,
    });
  }

  const sentIds = new Set<string>();
  const sentClientIds = new Set<string>();
  (sentQueueRes.data || []).forEach((row: any) => {
    if (row.client_id) sentClientIds.add(row.client_id);
    const loanList = Array.isArray(row.loan_ids) && row.loan_ids.length ? row.loan_ids : (row.loan_id ? [row.loan_id] : []);
    loanList.forEach((id: string) => { if (id) sentIds.add(id); });
  });

  const isSent = (item: BillingCandidateItem) =>
    sentIds.has(item.loanId) || (Boolean(item.clientId) && Boolean(sentClientIds.has(item.clientId)));

  const enviadas = candidates.filter(isSent);
  const naoEnviadas = candidates.filter((item) => !isSent(item));

  const totalCount = candidates.length;
  const totalAmount = candidates.reduce((s, i) => s + i.amount, 0);
  const totalInterest = candidates.reduce((s, i) => s + (i.interestAmount || 0), 0);

  const envCount = enviadas.length;
  const envAmount = enviadas.reduce((s, i) => s + i.amount, 0);
  const envInterest = enviadas.reduce((s, i) => s + (i.interestAmount || 0), 0);

  const naoCount = naoEnviadas.length;
  const naoAmount = naoEnviadas.reduce((s, i) => s + i.amount, 0);
  const naoInterest = naoEnviadas.reduce((s, i) => s + (i.interestAmount || 0), 0);

  const groupedEnviadas = groupCandidatesByClient(enviadas);
  const groupedNaoEnviadas = groupCandidatesByClient(naoEnviadas);

  const dateFormatted = formatDateBR(today);

  const lines: string[] = [
    `📊 *RESUMO DAS COBRANÇAS — HOJE*`,
    ``,
    `📌 *RESUMO DO DIA — ${dateFormatted}*`,
    ``,
    `Total de cobranças: *${totalCount}*`,
    `✅ Enviadas: *${envCount}*`,
    `⚠️ Não enviadas: *${naoCount}*`,
    ``,
    `💰 Juros: *${fmtBRL(totalInterest)}*`,
    `💵 Total a cobrar: *${fmtBRL(totalAmount)}*`,
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
      lines.push(`${item.clientName} / Contratos: ${item.count} / Juros: ${fmtBRL(item.interestAmount)} / Total: ${fmtBRL(item.amount)}`);
      if (index < groupedEnviadas.length - 1) {
        lines.push(``);
      }
    });
  }

  lines.push(
    ``,
    `*Total enviado: ${envCount} / ${fmtBRL(envInterest)} / ${fmtBRL(envAmount)}*`,
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
      lines.push(`${item.clientName} / Contratos: ${item.count} / Juros: ${fmtBRL(item.interestAmount)} / Total: ${fmtBRL(item.amount)}`);
      if (index < groupedNaoEnviadas.length - 1) {
        lines.push(``);
      }
    });
  }

  lines.push(
    ``,
    `*Total não enviado: ${naoCount} / ${fmtBRL(naoInterest)} / ${fmtBRL(naoAmount)}*`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `*Resumo gerado automaticamente pelo EmprestAI.*`
  );

  return lines.join("\n");
}

async function sendWhatsappReportAuto(admin: any, ownerId: string, text: string): Promise<{ sent: boolean; reason?: string }> {
  let phone = "";
  const { data: opPref } = await admin
    .from("telegram_operational_summary_prefs")
    .select("whatsapp_phone")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (opPref?.whatsapp_phone) phone = normalizePhoneBR(opPref.whatsapp_phone);

  if (!phone) {
    const { data: prof } = await admin.from("profiles").select("phone").eq("user_id", ownerId).maybeSingle();
    if (prof?.phone) phone = normalizePhoneBR(prof.phone);
  }

  if (!phone) return { sent: false, reason: "no_phone_configured" };

  let baseUrl = "";
  let instanceId = "";
  let apiKey = "";
  let provider = "evolution";

  const { data: sched } = await admin.from("whatsapp_billing_schedule").select("*").eq("owner_id", ownerId).maybeSingle();
  if (sched?.base_url && sched?.instance_id) {
    baseUrl = sched.base_url.trim();
    instanceId = sched.instance_id.trim();
    apiKey = sched.api_key || apiKey;
    provider = sched.provider || provider;
  }

  if (!baseUrl || !instanceId) {
    const { data: allSchedRows } = await admin.from("whatsapp_billing_schedule").select("*").not("base_url", "is", null).neq("base_url", "").limit(10);
    const found = (allSchedRows || []).find((r: any) => Boolean(r.base_url?.trim() && r.instance_id?.trim()));
    if (found) {
      baseUrl = found.base_url.trim();
      instanceId = found.instance_id.trim();
      apiKey = found.api_key || apiKey;
      provider = found.provider || provider;
    }
  }

  if (!baseUrl || !instanceId) {
    const envUrl = Deno.env.get("EVOLUTION_BASE_URL") || Deno.env.get("WHATSMIAU_BASE_URL") || "";
    const envInst = Deno.env.get("EVOLUTION_INSTANCE") || Deno.env.get("WHATSMIAU_INSTANCE_ID") || "";
    if (envUrl && envInst) {
      baseUrl = envUrl.trim();
      instanceId = envInst.trim();
    }
  }

  if (!baseUrl || !instanceId) return { sent: false, reason: "whatsapp_not_configured" };

  if (!apiKey) {
    apiKey = Deno.env.get("EVOLUTION_API_KEY") || Deno.env.get("WHATSMIAU_API_KEY") || "";
  }

  const res = await sendWhatsappText({ provider, baseUrl, instanceId, apiKey }, phone, text);
  return { sent: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}: ${res.body}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = getExternalAdmin();
  const url = new URL(req.url);
  const forceUserId = url.searchParams.get("user_id");
  const returnText = url.searchParams.get("return_text") === "1";

  if (forceUserId) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Auth required" }), { status: 401, headers: corsHeaders });
    const userClient = createClient(getExternalSupabaseUrl(), getExternalAnonKey());
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsErr || !userId) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    if (userId !== forceUserId) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  if (forceUserId && returnText) {
    const { date: today2 } = todayInTZ();
    const text = await buildWhatsappBillingReport(admin, forceUserId, today2);
    return new Response(JSON.stringify({ ok: true, text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { date: today, hhmm } = todayInTZ();
  const [hh, mm] = hhmm.split(":").map(Number);
  const nowMin = hh * 60 + mm;

  let query = admin.from("telegram_billing_prefs").select("user_id, enabled, send_time_1, send_time_2, send_time_3, last_sent");
  if (forceUserId) query = query.eq("user_id", forceUserId);

  const { data: prefs, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let sent = 0;
  const errors: string[] = [];

  for (const pref of prefs ?? []) {
    try {
      const slots = [
        { key: "send_time_1", time: (pref as any).send_time_1 },
        { key: "send_time_2", time: (pref as any).send_time_2 },
        { key: "send_time_3", time: (pref as any).send_time_3 },
      ] as const;
      const lastSent = (pref.last_sent ?? {}) as Record<string, string>;
      const slotsToSend: string[] = forceUserId ? ["manual"] : dueSlotKeys(slots, nowMin, today, lastSent);

      if (slotsToSend.length === 0) continue;

      let anySent = false;
      const reportText = await buildWhatsappBillingReport(admin, pref.user_id, today);

      // 1. Envio automático via WhatsApp
      const wppRes = await sendWhatsappReportAuto(admin, pref.user_id, reportText);
      if (wppRes.sent) {
        anySent = true;
      } else {
        errors.push(`${pref.user_id} WhatsApp: ${wppRes.reason || "fail"}`);
      }

      // 2. Envio via Telegram se o bot estiver configurado e ativado
      if (pref.enabled) {
        const link = await getReportsLinkForUser(admin, pref.user_id);
        if (link) {
          const sendTg = await sendReportsAsImage(
            admin,
            pref.user_id,
            Number(link.chat_id),
            reportText.split("\n"),
            { name: "EmprestAI" },
            { fallbackText: reportText, reportKey: "billing" },
          );
          if (sendTg.sent) anySent = true;
        }
      }

      if (anySent && !forceUserId) {
        const merged = { ...lastSent } as Record<string, string>;
        for (const slot of slotsToSend) merged[slot] = today;
        await admin.from("telegram_billing_prefs")
          .update({ last_sent: merged })
          .eq("user_id", pref.user_id);
        sent++;
      }
    } catch (e: any) {
      console.error("billing summary error for", pref.user_id, e);
      errors.push(`${pref.user_id}: ${e?.message || String(e)}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: prefs?.length ?? 0, hhmm, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

