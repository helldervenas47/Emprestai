// Sends a weekly WhatsApp summary to users with the "gerente" role,
// listing loans (from their owner's account) that are due during the
// current week (Mon..Sun). Triggered by cron or manually with
// { owner_id, manual_run: true }.

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

function todayStr(): string {
  const d = nowInTz();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeekISO(): { start: string; end: string } {
  const d = nowInTz();
  // ISO week: Monday=1..Sunday=7
  const dow = d.getDay() || 7; // Sunday=0 → 7
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

function formatBRL(n: number): string {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatBR(date: string): string {
  if (!date) return "";
  const [y, m, day] = date.substring(0, 10).split("-");
  return `${day}/${m}/${y}`;
}
function normalizePhoneBR(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

const DEFAULT_TEMPLATE =
  "Olá! Resumo da semana:\n• {total_emprestimos_semana} empréstimo(s) vencendo\n• Total: {valores_totais}\n\nClientes:\n{lista_clientes}";

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
    let previewOnly = false;
    let listManagers = false;
    let targetManagerId: string | null = null;
    try {
      const j = await req.json();
      if (j?.owner_id) forceOwner = j.owner_id;
      manualRun = j?.manual_run === true;
      previewOnly = j?.preview_only === true;
      listManagers = j?.list_managers === true;
      if (j?.manager_user_id) targetManagerId = String(j.manager_user_id);
    } catch { /* no body */ }

    // AUTH: per-owner request requires the caller's JWT; cron path requires the shared secret.
    if (forceOwner) {
      const owned = await validateUserOwner(admin, req, forceOwner);
      if (!owned.ok) return unauthorized(corsHeaders, owned.reason || "Unauthorized");
    } else {
      const isCron = await validateCronSecret(admin, req);
      if (!isCron) return unauthorized(corsHeaders);
    }

    const today = todayStr();
    const nowParts = nowInTz();
    const currentDow = nowParts.getDay(); // 0..6
    const currentHM = `${String(nowParts.getHours()).padStart(2, "0")}:${String(nowParts.getMinutes()).padStart(2, "0")}`;

    const managerScheduleCols = "owner_id, manager_summary_enabled, manager_summary_day_of_week, manager_summary_time, base_url, instance_id";
    let q = admin.from("whatsapp_billing_schedule").select(managerScheduleCols).eq("manager_summary_enabled", true);
    if (forceOwner) q = admin.from("whatsapp_billing_schedule").select(managerScheduleCols).eq("owner_id", forceOwner);
    const { data: schedules, error: schedErr } = await q;
    if (schedErr) throw schedErr;

    const results: any[] = [];
    const week = startOfWeekISO();

    for (const sched of schedules ?? []) {
      // Skip schedule-time gating for manual/preview/list flows
      if (!forceOwner && !previewOnly && !listManagers && !targetManagerId) {
        if (Number(sched.manager_summary_day_of_week) !== currentDow) continue;
        const targetHour = (sched.manager_summary_time || "09:00").slice(0, 2);
        if (currentHM.slice(0, 2) !== targetHour) continue;
      }
      const skipCredsCheck = previewOnly || listManagers;
      if (!skipCredsCheck && (!sched.base_url || !sched.instance_id || !API_KEY)) {
        results.push({ owner_id: sched.owner_id, skipped: "missing_credentials" });
        continue;
      }

      const ownerId = sched.owner_id;

      // Template
      const { data: tpl } = await admin
        .from("whatsapp_billing_messages")
        .select("message_manager_weekly, pix_link")
        .eq("owner_id", ownerId)
        .maybeSingle();
      const template = (tpl as any)?.message_manager_weekly?.trim() || DEFAULT_TEMPLATE;
      const linkPagamento = (tpl as any)?.pix_link?.trim() || "";

      // Loans due this week (active loans) — keep manager_id/has_manager so we can filter per manager
      const { data: loans } = await admin
        .from("loans").select("id, borrower_id, borrower_name, due_date, amount, paid_installments, installments, tags, has_manager, manager_id")
        .eq("user_id", ownerId)
        .neq("status", "paid");

      const loanIds = (loans ?? []).map((l: any) => l.id);
      const { data: insts } = loanIds.length
        ? await admin.from("loan_installments").select("loan_id, installment_number, due_date, amount").in("loan_id", loanIds)
        : { data: [] as any[] };

      type Item = { name: string; amount: number; due: string; tags: string[] };

      // Build the list of items relevant to a given manager (by client id).
      // Only loans whose manager_id matches that manager are included.
      const buildItemsForManager = (managerClientId: string | null): Item[] => {
        const out: Item[] = [];
        for (const loan of loans ?? []) {
          if (!loan.has_manager) continue;
          if (!managerClientId) continue;
          if (String(loan.manager_id || "") !== String(managerClientId)) continue;

          const list = (insts ?? []).filter((s: any) => s.loan_id === loan.id)
            .sort((a: any, b: any) => a.installment_number - b.installment_number);
          const next = list.find((s: any) => s.installment_number === (loan.paid_installments ?? 0) + 1);
          const due = next?.due_date ?? loan.due_date;
          const amount = Number(next?.amount ?? loan.amount ?? 0);
          if (!due) continue;
          if (due >= week.start && due <= week.end) {
            const tags = Array.isArray(loan.tags) ? loan.tags.filter((t: any) => typeof t === "string" && t.trim()) : [];
            out.push({ name: loan.borrower_name ?? "", amount, due, tags });
          }
        }
        out.sort((a, b) => a.due.localeCompare(b.due));
        return out;
      };

      const renderForManager = (managerClientId: string | null) => {
        const items = buildItemsForManager(managerClientId);
        const totalAmount = items.reduce((s, i) => s + i.amount, 0);
        const lista = items.length
          ? items.map((i) => {
              const tagPart = i.tags.length ? ` [${i.tags.join(", ")}]` : "";
              return `- ${i.name}${tagPart} — ${formatBRL(i.amount)} (vence ${formatBR(i.due)})`;
            }).join("\n")
          : "Nenhum empréstimo vencendo nesta semana.";
        const allTags = Array.from(new Set(items.flatMap((i) => i.tags)));
        const etiquetas = allTags.length ? allTags.join(", ") : "";
        const message = template
          .replace(/\{total_emprestimos_semana\}/g, String(items.length))
          .replace(/\{valores_totais\}/g, formatBRL(totalAmount))
          .replace(/\{lista_clientes\}/g, lista)
          .replace(/\{etiquetas\}/g, etiquetas)
          .replace(/\{link_pagamento\}/g, linkPagamento);
        return { items, totalAmount, message };
      };

      // Find managers — clients flagged as is_manager belonging to this owner
      const { data: managerClients } = await admin
        .from("clients")
        .select("id, name, phone, active, is_manager")
        .eq("user_id", ownerId)
        .eq("is_manager", true)
        .eq("active", true);

      const candidates: { user_id: string; phone: string; display_name: string }[] =
        (managerClients ?? []).map((c: any) => ({
          user_id: c.id, // client id used as recipient identifier
          phone: String(c.phone || ""),
          display_name: String(c.name || ""),
        }));

      // listManagers: just return managers (with phone/name) and exit early per owner
      if (listManagers) {
        results.push({
          owner_id: ownerId,
          managers: candidates.map((m) => ({
            user_id: m.user_id,
            display_name: m.display_name,
            phone: m.phone,
            has_phone: m.phone.trim().length > 0,
          })),
        });
        continue;
      }

      // Filter by target manager (single send / single preview)
      let workingCandidates = candidates;
      if (targetManagerId) {
        workingCandidates = candidates.filter((c) => c.user_id === targetManagerId);
      }

      // previewOnly: render per manager and return — no log, no send
      if (previewOnly) {
        // If a specific manager is targeted, return single message; otherwise return per-manager previews
        const previews = workingCandidates.map((m) => {
          const r = renderForManager(m.user_id);
          return {
            user_id: m.user_id,
            display_name: m.display_name,
            phone: m.phone,
            message: r.message,
            loans_count: r.items.length,
            total_amount: r.totalAmount,
          };
        });
        const first = previews[0];
        results.push({
          owner_id: ownerId,
          preview: true,
          // Backwards-compatible top-level fields use the first (or targeted) manager
          message: first?.message ?? "",
          loans_count: first?.loans_count ?? 0,
          total_amount: first?.total_amount ?? 0,
          managers: previews,
        });
        continue;
      }

      // Real send path needs phone numbers
      const sendable = workingCandidates.filter((c) => c.phone.trim().length > 0);
      if (sendable.length === 0) {
        results.push({ owner_id: ownerId, skipped: "no_managers" });
        if (!targetManagerId) {
          await admin.from("whatsapp_billing_schedule")
            .update({ manager_last_run_at: new Date().toISOString() })
            .eq("owner_id", ownerId);
        }
        continue;
      }

      for (const m of sendable) {
        try {
          const phone = normalizePhoneBR(m.phone);
          const r = renderForManager(m.user_id);
          const send = await sendWhatsmiau(sched.base_url, sched.instance_id, API_KEY, phone, r.message);
          await admin.from("whatsapp_manager_billing_log").insert({
            owner_id: ownerId,
            manager_user_id: m.user_id,
            phone,
            message: r.message,
            loans_count: r.items.length,
            total_amount: r.totalAmount,
            success: send.ok,
            error_message: send.ok ? null : `HTTP ${send.status}: ${send.body.slice(0, 500)}`,
            sent_date: today,
          });
          results.push({ owner_id: ownerId, manager_user_id: m.user_id, success: send.ok, loans_count: r.items.length });
        } catch (e) {
          results.push({ owner_id: ownerId, manager_user_id: m.user_id, error: String(e) });
        }
      }

      if (!targetManagerId) {
        await admin.from("whatsapp_billing_schedule")
          .update({ manager_last_run_at: new Date().toISOString() })
          .eq("owner_id", ownerId);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-whatsapp-manager-summary] error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
