import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { validateCronSecret, validateUserOwner, unauthorized } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_TZ = "America/Sao_Paulo";

function nowInTz(tz = APP_TZ): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`);
}

function todayStr(tz = APP_TZ): string {
  const d = nowInTz(tz);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((da - db) / (1000 * 60 * 60 * 24));
}

function normalizePhoneBR(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

function formatBRL(n: number): string {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBR(date: string): string {
  if (!date) return "";
  const d = date.length >= 10 ? date.substring(0, 10) : date;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function applyVariables(message: string, ctx: {
  nome: string; valorParcela: number; dataVenc: string;
  diasAtraso: number; juros: number; valorTotal: number;
  etiqueta: string; linkPagamento: string;
}) {
  return message
    .replace(/\{nome_cliente\}/g, ctx.nome)
    .replace(/\{nome\}/g, ctx.nome)
    .replace(/\{valor_parcela\}/g, formatBRL(ctx.valorParcela))
    .replace(/\{valor\}/g, formatBRL(ctx.valorParcela))
    .replace(/\{data_vencimento\}/g, formatBR(ctx.dataVenc))
    .replace(/\{dias_atraso\}/g, String(Math.max(0, ctx.diasAtraso)))
    .replace(/\{juros\}/g, formatBRL(ctx.juros))
    .replace(/\{valor_total\}/g, formatBRL(ctx.valorTotal))
    .replace(/\{etiqueta\}/g, ctx.etiqueta)
    .replace(/\{link_pagamento\}/g, ctx.linkPagamento);
}

const DEFAULT_MESSAGES = {
  a_vencer:
    "Olá {nome_cliente}, sua parcela de {valor_parcela} vence em {data_vencimento}. Evite juros pagando antecipadamente.\n{link_pagamento}",
  vence_hoje:
    "Olá {nome_cliente}, sua parcela de {valor_parcela} vence hoje ({data_vencimento}). Por favor, regularize.\n{link_pagamento}",
  vencida:
    "Olá {nome_cliente}, sua parcela de {valor_parcela} venceu há {dias_atraso} dia(s). Total com juros/multa: {valor_total}.\n{link_pagamento}",
  muito_vencida:
    "Olá {nome_cliente}, atraso de {dias_atraso} dias na parcela de {valor_parcela}. Total atualizado: {valor_total} ({juros} de encargos).\n{link_pagamento}",
};

type DueStatus = "vencida" | "muito_vencida" | "vence_hoje" | "a_vencer";

function getDueStatus(dueDate: string, today: string, veryOverdueDays: number): DueStatus {
  const d = diffDays(dueDate, today);
  if (d < 0) {
    const dias = Math.abs(d);
    if (dias >= veryOverdueDays) return "muito_vencida";
    return "vencida";
  }
  if (d === 0) return "vence_hoje";
  return "a_vencer";
}

function computeLateFees(loan: any, baseAmount: number, daysOverdue: number) {
  if (daysOverdue <= 0) return 0;
  const lateInterestValue = Number(loan.late_interest_value ?? 0);
  const penalty = Number(loan.penalty_value ?? 0);
  let interest = 0;
  if (lateInterestValue > 0) {
    interest = loan.late_interest_type === "fixed"
      ? lateInterestValue * daysOverdue
      : baseAmount * (lateInterestValue / 100) * daysOverdue;
  }
  return Math.max(0, interest + penalty);
}

async function sendWhatsmiau(baseUrl: string, instance: string, apiKey: string, phone: string, text: string) {
  const url = `${baseUrl.replace(/\/+$/, "")}/message/sendText/${instance}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: phone, text, textMessage: { text } }),
  });
  const body = await resp.text();
  return { ok: resp.ok, status: resp.status, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const API_KEY = Deno.env.get("WHATSMIAU_API_KEY") ?? "";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let forceOwner: string | null = null;
    let manualRun = false;
    try {
      const json = await req.json();
      if (json?.owner_id) forceOwner = json.owner_id;
      manualRun = json?.manual_run === true;
    } catch { /* no body */ }

    // AUTH: per-owner manual run requires the caller's JWT to belong to that owner;
    // cron path (no owner_id) requires the shared cron secret header.
    if (forceOwner) {
      const owned = await validateUserOwner(admin, req, forceOwner);
      if (!owned.ok) return unauthorized(corsHeaders, owned.reason || "Unauthorized");
    } else {
      const isCron = await validateCronSecret(admin, req);
      if (!isCron) return unauthorized(corsHeaders);
    }

    const today = todayStr();
    const nowHM = (() => {
      const d = nowInTz();
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    })();

    const scheduleCols = "owner_id, enabled, send_time, base_url, instance_id, days_before_due, send_on_due_day, send_when_overdue, overdue_repeat_days";
    let scheduleQuery = admin.from("whatsapp_billing_schedule").select(scheduleCols).eq("enabled", true);
    if (forceOwner) scheduleQuery = scheduleQuery.eq("owner_id", forceOwner);
    const { data: schedules, error: schedErr } = await scheduleQuery;
    if (schedErr) throw schedErr;

    const results: any[] = [];

    for (const sched of schedules ?? []) {
      if (!forceOwner) {
        const targetHour = (sched.send_time || "09:00").slice(0, 2);
        const currentHour = nowHM.slice(0, 2);
        if (targetHour !== currentHour) continue;
      }

      if (!sched.base_url || !sched.instance_id || !API_KEY) {
        results.push({ owner_id: sched.owner_id, skipped: "missing_credentials" });
        continue;
      }

      const ownerId = sched.owner_id;

      const { data: tplRow } = await admin
        .from("whatsapp_billing_messages")
        .select("message_upcoming, message_due_today, message_overdue, message_very_overdue, pix_link, very_overdue_days")
        .eq("owner_id", ownerId)
        .maybeSingle();
      const veryOverdueDays = Number((tplRow as any)?.very_overdue_days ?? 30) || 30;
      const linkPagamento = (tplRow as any)?.pix_link?.trim() || "";
      const templates: Record<DueStatus, string> = {
        a_vencer: tplRow?.message_upcoming?.trim() || DEFAULT_MESSAGES.a_vencer,
        vence_hoje: tplRow?.message_due_today?.trim() || DEFAULT_MESSAGES.vence_hoje,
        vencida: tplRow?.message_overdue?.trim() || DEFAULT_MESSAGES.vencida,
        muito_vencida: (tplRow as any)?.message_very_overdue?.trim() || tplRow?.message_overdue?.trim() || DEFAULT_MESSAGES.muito_vencida,
      };

      const { data: loans } = await admin
        .from("loans").select("*")
        .eq("user_id", ownerId)
        .neq("status", "paid")
        .eq("auto_billing_enabled", true);

      if (!loans?.length) continue;

      const loanIds = loans.map((l: any) => l.id);
      const borrowerIds = Array.from(new Set(loans.map((l: any) => l.borrower_id).filter(Boolean)));

      const { data: clients } = borrowerIds.length
        ? await admin.from("clients").select("id, name, phone, auto_billing_enabled").in("id", borrowerIds)
        : { data: [] as any[] };
      const clientById = new Map((clients ?? []).map((c: any) => [c.id, c]));

      const { data: schedules2 } = await admin
        .from("loan_installments").select("loan_id, installment_number, due_date, amount").in("loan_id", loanIds);
      const schedByLoan = new Map<string, any[]>();
      for (const s of schedules2 ?? []) {
        const arr = schedByLoan.get(s.loan_id) ?? [];
        arr.push(s);
        schedByLoan.set(s.loan_id, arr);
      }

      const { data: todayLogs } = await admin
        .from("whatsapp_billing_log")
        .select("loan_id, status_when_sent, success")
        .eq("owner_id", ownerId)
        .eq("sent_date", today);
      const sentTodayKey = new Set(
        (todayLogs ?? []).filter((l) => l.success).map((l) => `${l.loan_id}|${l.status_when_sent}`),
      );

      for (const loan of loans) {
        try {
          const client = loan.borrower_id ? clientById.get(loan.borrower_id) : null;
          const phoneRaw = client?.phone || "";
          if (!phoneRaw) continue;
          if (client && client.auto_billing_enabled === false) continue;

          const paid = loan.paid_installments ?? 0;
          const total = loan.installments ?? 1;
          if (paid >= total) continue;

          const list = (schedByLoan.get(loan.id) ?? []).sort(
            (a: any, b: any) => a.installment_number - b.installment_number,
          );
          const nextInst = list.find((s: any) => s.installment_number === paid + 1);
          const dueDate: string | null = nextInst?.due_date ?? loan.due_date ?? null;
          const installmentNumber = (nextInst?.installment_number ?? paid + 1) as number;
          const amount = Number(nextInst?.amount ?? loan.amount ?? 0);

          if (!dueDate) continue;

          const status = getDueStatus(dueDate, today, veryOverdueDays);
          const daysDiff = diffDays(dueDate, today);
          const daysOverdue = daysDiff < 0 ? Math.abs(daysDiff) : 0;

          let shouldSend = false;
          if (status === "a_vencer") {
            shouldSend = daysDiff === (sched.days_before_due ?? 1);
          } else if (status === "vence_hoje") {
            shouldSend = !!sched.send_on_due_day;
          } else if (status === "vencida" || status === "muito_vencida") {
            if (sched.send_when_overdue) {
              const repeat = Math.max(1, sched.overdue_repeat_days ?? 3);
              shouldSend = manualRun ? daysOverdue > 0 : daysOverdue === 0 || daysOverdue % repeat === 0;
            }
          }
          if (!shouldSend) continue;

          const key = `${loan.id}|${status}`;
          if (sentTodayKey.has(key)) continue;

          const template = templates[status] ?? "";
          if (!template.trim()) continue;

          const juros = computeLateFees(loan, amount, daysOverdue);
          const valorTotal = amount + juros;
          const etiqueta = Array.isArray(loan.tags)
            ? loan.tags
                .map((t: unknown) => (t == null ? "" : String(t).trim()))
                .filter((t: string) => t.length > 0 && t.toLowerCase() !== "null" && t.toLowerCase() !== "undefined")
                .join(", ")
            : "";

          const message = applyVariables(template, {
            nome: client?.name ?? loan.borrower_name ?? "",
            valorParcela: amount,
            dataVenc: dueDate,
            diasAtraso: daysOverdue,
            juros,
            valorTotal,
            etiqueta,
            linkPagamento,
          });

          const phone = normalizePhoneBR(phoneRaw);
          const send = await sendWhatsmiau(sched.base_url, sched.instance_id, API_KEY, phone, message);

          await admin.from("whatsapp_billing_log").insert({
            owner_id: ownerId,
            loan_id: loan.id,
            client_id: client?.id ?? null,
            installment_number: installmentNumber,
            status_when_sent: status,
            phone,
            message,
            success: send.ok,
            error_message: send.ok ? null : `HTTP ${send.status}: ${send.body.slice(0, 500)}`,
            sent_date: today,
          });

          results.push({ owner_id: ownerId, loan_id: loan.id, status, success: send.ok });
        } catch (e) {
          results.push({ owner_id: ownerId, loan_id: loan.id, error: String(e) });
        }
      }

      await admin.from("whatsapp_billing_schedule")
        .update({ last_run_at: new Date().toISOString() })
        .eq("owner_id", ownerId);
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-whatsapp-billing] error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
