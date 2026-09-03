// Sends a WEEKLY per-manager summary to the user's Telegram REPORTS bot.
// For each owner with prefs enabled at the configured weekday/time:
//   - identifies all active managers (clients.is_manager = true, active = true)
//   - for each manager, builds a list of loans assigned to them that are
//     OVERDUE and/or DUE THIS WEEK (Mon..Sun in America/Sao_Paulo)
//   - renders the user's editable template and sends ONE message per manager
//     to the owner's reports bot chat.
// Manual modes:
//   - { owner_id, manual_run: true }       → ignore schedule gating
//   - { owner_id, preview_only: true }     → render previews per manager
//   - { owner_id, manager_client_id }      → restrict to one manager
//   - { owner_id, list_managers: true }    → list managers + their state
//
// Triggered by pg_cron every 5 minutes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getExternalAdmin } from "../_shared/external-supabase.ts";
import { isTimeDueToday } from "../_shared/schedule.ts";

const GATEWAY_URL = "https://api.telegram.org";
const APP_TZ = "America/Sao_Paulo";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function nowInTz(tz = APP_TZ) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wkMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    date,
    hhmm: `${get("hour")}:${get("minute")}`,
    weekday: wkMap[get("weekday")] ?? 0,
  };
}

function nextWeekISO(today: string): { start: string; end: string } {
  // Próxima semana ISO (Seg..Dom), inclusive em ambas as pontas.
  // O cálculo é feito puramente sobre a string YYYY-MM-DD ancorada ao meio-dia UTC,
  // portanto não depende do fuso horário do servidor (Deno default = UTC),
  // e o "today" já chega convertido para America/Sao_Paulo via nowInTz().
  const d = new Date(`${today}T12:00:00Z`);
  const dow = d.getUTCDay() || 7; // Dom=0 → 7, Seg=1 .. Sáb=6
  // Segunda da semana ATUAL (em UTC, ainda meio-dia para evitar DST flips)
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dow - 1));
  // Avança 7 dias → segunda da PRÓXIMA semana
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  // Domingo da próxima semana = nextMonday + 6
  const nextSunday = new Date(nextMonday);
  nextSunday.setUTCDate(nextMonday.getUTCDate() + 6);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  const start = fmt(nextMonday);
  const end = fmt(nextSunday);
  // Sanity check: precisa ser exatamente 7 dias e começar numa segunda.
  if (new Date(`${start}T12:00:00Z`).getUTCDay() !== 1) {
    throw new Error(`nextWeekISO: start ${start} não é segunda-feira`);
  }
  if (new Date(`${end}T12:00:00Z`).getUTCDay() !== 0) {
    throw new Error(`nextWeekISO: end ${end} não é domingo`);
  }
  return { start, end };
}

function fmtBRL(n: number) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBR(date: string) {
  if (!date) return "";
  const [y, m, d] = date.substring(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

import { sendReportsAsImage, getReportsLinkForUser } from "../_shared/reports-bot.ts";

const DEFAULT_TEMPLATE =
  `Olá {nome_gerente}! 👋
Resumo da próxima semana:

⚠️ Atrasados: {total_emprestimos_atrasados}
📅 Vencendo na próxima semana: {total_emprestimos_semana}
💰 Valor restante total: {valor_total}

Clientes:
{lista_clientes}`;

type Item = {
  borrower_name: string;
  amount: number; // valor restante do contrato
  due: string;
  status: "overdue" | "this_week";
  tags: string[];
};

async function processOwner(
  admin: any,
  ownerId: string,
  opts: {
    preview_only?: boolean;
    list_managers?: boolean;
    target_manager_client_id?: string | null;
    skip_chat_check?: boolean;
  },
  today: string,
) {
  // Load preferences (template / enabled). For manual/preview, we don't require enabled.
  const { data: pref } = await admin
    .from("telegram_manager_weekly_prefs")
    .select("message_template")
    .eq("user_id", ownerId)
    .maybeSingle();
  const template = (pref as any)?.message_template?.trim() || DEFAULT_TEMPLATE;

  // Load reports bot link (chat_id) for this owner
  const link = await getReportsLinkForUser(admin, ownerId);

  if (!opts.skip_chat_check && !opts.preview_only && !opts.list_managers && !link) {
    return { owner_id: ownerId, skipped: "no_reports_bot_linked" };
  }

  // Load active managers
  const { data: managerClients } = await admin
    .from("clients")
    .select("id, name, phone, active, is_manager")
    .eq("user_id", ownerId)
    .eq("is_manager", true)
    .eq("active", true);

  const managers: { client_id: string; name: string }[] =
    (managerClients ?? []).map((c: any) => ({
      client_id: String(c.id),
      name: String(c.name || ""),
    }));

  if (opts.list_managers) {
    return { owner_id: ownerId, managers };
  }

  let working = managers;
  if (opts.target_manager_client_id) {
    working = managers.filter((m) => m.client_id === opts.target_manager_client_id);
  }

  // Load loans + installments only once for the owner
  const { data: loans } = await admin
    .from("loans")
    .select("id, borrower_name, due_date, amount, remaining_amount, tags, paid_installments, installments, has_manager, manager_id, status")
    .eq("user_id", ownerId)
    .neq("status", "paid");

  const loanIds = (loans ?? []).map((l: any) => l.id);
  const { data: insts } = loanIds.length
    ? await admin.from("loan_installments").select("loan_id, installment_number, due_date, amount, paid").in("loan_id", loanIds)
    : { data: [] as any[] };

  const week = nextWeekISO(today);

  const buildItems = (managerClientId: string): Item[] => {
    const out: Item[] = [];
    for (const loan of loans ?? []) {
      if (!loan.has_manager) continue;
      if (String(loan.manager_id || "") !== managerClientId) continue;

      // Use remaining_amount as the displayed value for the contract
      const remaining = Number(loan.remaining_amount ?? loan.amount ?? 0);
      const tags: string[] = Array.isArray(loan.tags)
        ? (loan.tags as any[]).map((t) => String(t).trim()).filter(Boolean)
        : [];

      const list = (insts ?? [])
        .filter((s: any) => s.loan_id === loan.id)
        .sort((a: any, b: any) => a.installment_number - b.installment_number);

      const unpaid = list.filter((s: any) => !s.paid);
      // Determine the most relevant due date for this loan in the window:
      // earliest overdue first, otherwise earliest due in this week.
      let chosenDue: string | null = null;
      let chosenStatus: "overdue" | "this_week" | null = null;

      if (unpaid.length > 0) {
        for (const s of unpaid) {
          const due = String(s.due_date || "").substring(0, 10);
          if (!due) continue;
          if (due < today) {
            if (!chosenDue || due < chosenDue || chosenStatus !== "overdue") {
              chosenDue = due; chosenStatus = "overdue";
            }
          } else if (due >= week.start && due <= week.end && chosenStatus !== "overdue") {
            if (!chosenDue || due < chosenDue) {
              chosenDue = due; chosenStatus = "this_week";
            }
          }
        }
      } else {
        const due = String(loan.due_date || "").substring(0, 10);
        if (due) {
          if (due < today) { chosenDue = due; chosenStatus = "overdue"; }
          else if (due >= week.start && due <= week.end) { chosenDue = due; chosenStatus = "this_week"; }
        }
      }

      if (chosenDue && chosenStatus) {
        out.push({
          borrower_name: loan.borrower_name ?? "",
          amount: remaining,
          due: chosenDue,
          status: chosenStatus,
          tags,
        });
      }
    }
    return out.sort((a, b) => a.due.localeCompare(b.due));
  };

  const renderMessage = (managerName: string, items: Item[]) => {
    const overdue = items.filter((i) => i.status === "overdue");
    const week = items.filter((i) => i.status === "this_week");
    const total = items.reduce((s, i) => s + i.amount, 0);
    const lista = items.length
      ? items.map((i) => {
          const tag = i.status === "overdue" ? "⚠️ ATRASADO" : "📅 próxima semana";
          const etiquetas = i.tags.length ? `\n   🏷️ ${i.tags.join(", ")}` : "";
          return `• ${i.borrower_name} — ${fmtBRL(i.amount)} (vence ${fmtBR(i.due)}) ${tag}${etiquetas}`;
        }).join("\n")
      : "Nenhum empréstimo atrasado ou vencendo na próxima semana.";

    // Aggregated tags variable (unique, comma-separated)
    const allTags = Array.from(new Set(items.flatMap((i) => i.tags))).filter(Boolean);
    const etiquetaStr = allTags.length ? allTags.join(", ") : "";

    return template
      .replace(/\{nome_gerente\}/g, managerName)
      .replace(/\{total_emprestimos_atrasados\}/g, String(overdue.length))
      .replace(/\{total_emprestimos_semana\}/g, String(week.length))
      // New canonical names + backwards-compat aliases
      .replace(/\{valor_total\}/g, fmtBRL(total))
      .replace(/\{valor_restante_total\}/g, fmtBRL(total))
      .replace(/\{valores_totais\}/g, fmtBRL(total))
      .replace(/\{etiquetas\}/g, etiquetaStr)
      .replace(/\{etiqueta\}/g, etiquetaStr)
      .replace(/\{lista_clientes\}/g, lista);
  };

  // PREVIEW MODE
  if (opts.preview_only) {
    const previews = working.map((m) => {
      const items = buildItems(m.client_id);
      return {
        client_id: m.client_id,
        name: m.name,
        loans_count: items.length,
        overdue_count: items.filter((i) => i.status === "overdue").length,
        week_count: items.filter((i) => i.status === "this_week").length,
        total_amount: items.reduce((s, i) => s + i.amount, 0),
        message: renderMessage(m.name, items),
      };
    });
    return {
      owner_id: ownerId,
      preview: true,
      reference_date: today,
      week_start: week.start,
      week_end: week.end,
      managers: previews,
    };
  }

  // SEND MODE
  if (!link) return { owner_id: ownerId, skipped: "no_reports_bot_linked" };
  const chatId = Number((link as any).chat_id);

  const results: any[] = [];
  for (const m of working) {
    try {
      const items = buildItems(m.client_id);
      // Skip managers without overdue / due-this-week installments,
      // unless explicitly targeted (manual single-manager send).
      if (items.length === 0 && !opts.target_manager_client_id) {
        results.push({
          client_id: m.client_id,
          name: m.name,
          loans_count: 0,
          success: true,
          skipped: "no_relevant_installments",
        });
        continue;
      }
      const message = renderMessage(m.name, items);
      const send = await sendReportsAsImage(
        admin,
        ownerId,
        chatId,
        message.split("\n"),
        { name: "EmprestAI" },
        { fallbackText: message, reportKey: "manager_weekly" },
      );
      results.push({
        client_id: m.client_id,
        name: m.name,
        loans_count: items.length,
        success: send.sent,
        error: send.sent ? null : (send.reason ?? "send_failed"),
      });
    } catch (e) {
      results.push({ client_id: m.client_id, name: m.name, success: false, error: String(e) });
    }
  }
  return { owner_id: ownerId, sent: results.filter((r) => !r.skipped).length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = getExternalAdmin();

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const ownerId: string | null = body?.owner_id ?? null;
    const manualRun: boolean = body?.manual_run === true;
    const previewOnly: boolean = body?.preview_only === true;
    const listManagers: boolean = body?.list_managers === true;
    const targetManagerClientId: string | null = body?.manager_client_id ? String(body.manager_client_id) : null;

    // Optional simulation date (YYYY-MM-DD). When informed, the report uses it
    // as "today" instead of the current date in America/Sao_Paulo.
    const refDateRaw: string | null = body?.reference_date ? String(body.reference_date).trim() : null;
    const refDateValid = refDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(refDateRaw) && !Number.isNaN(Date.parse(`${refDateRaw}T12:00:00Z`));
    const referenceDate: string | null = refDateValid ? refDateRaw : null;

    // AUTH: per-owner request requires the caller's JWT to belong to the owner
    // (or to a user mapped to that owner via user_owner). Cron path (no ownerId)
    // is open — this function deploys with verify_jwt = false and the cron
    // already passes the project anon key in Authorization.
    if (ownerId) {
      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!jwt) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const callerId = userData.user.id;
      let resolvedOwner = callerId;
      const { data: mapping } = await admin
        .from("user_owner").select("owner_id").eq("user_id", callerId).maybeSingle();
      if ((mapping as any)?.owner_id) resolvedOwner = (mapping as any).owner_id;
      if (resolvedOwner !== ownerId && callerId !== ownerId) {
        return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Manual / preview / list path — single owner
    if (ownerId && (manualRun || previewOnly || listManagers || targetManagerClientId)) {
      const { date: realToday } = nowInTz();
      const today = referenceDate ?? realToday;
      const result = await processOwner(
        admin, ownerId,
        {
          preview_only: previewOnly,
          list_managers: listManagers,
          target_manager_client_id: targetManagerClientId,
          skip_chat_check: previewOnly || listManagers,
        },
        today,
      );

      // For real send (manualRun) update last_sent_date
      if (manualRun && !previewOnly && !listManagers && !targetManagerClientId) {
        await admin.from("telegram_manager_weekly_prefs")
          .update({ last_sent_date: today })
          .eq("user_id", ownerId);
      }
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CRON path — iterate enabled prefs and check weekday + time window
    const { date: today, hhmm, weekday } = nowInTz();
    const [hh, mm] = hhmm.split(":").map(Number);
    const nowMin = hh * 60 + mm;

    const { data: prefs, error } = await admin
      .from("telegram_manager_weekly_prefs")
      .select("user_id, enabled, send_weekday, send_time, last_sent_date")
      .eq("enabled", true);
    if (error) throw error;

    const out: any[] = [];
    for (const p of prefs ?? []) {
      try {
        if (Number((p as any).send_weekday) !== weekday) continue;
        if (!isTimeDueToday(String((p as any).send_time || "09:00"), nowMin)) continue;
        if ((p as any).last_sent_date === today) continue; // anti-duplicate

        const result = await processOwner(
          admin, (p as any).user_id,
          { skip_chat_check: false },
          today,
        );

        // Mark as sent only if we actually attempted sending (not skipped)
        if (!(result as any).skipped) {
          await admin.from("telegram_manager_weekly_prefs")
            .update({ last_sent_date: today })
            .eq("user_id", (p as any).user_id);
        }
        out.push(result);
      } catch (e) {
        console.error("manager weekly error", (p as any).user_id, e);
        out.push({ owner_id: (p as any).user_id, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: out.length, hhmm, weekday, results: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[telegram-manager-weekly-summary] error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
