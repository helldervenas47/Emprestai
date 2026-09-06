import { getExternalAdmin, getExternalUserClient, getExternalAnonKey } from "../_shared/external-supabase.ts";
import { sendReportsMessage, getReportsLinkForUser, sendReportsAsImage } from "../_shared/reports-bot.ts";
import { dueSlotKeys } from "../_shared/schedule.ts";
import { requireCronOrAdmin, cronCors } from "../_shared/require-cron-or-admin.ts";

const corsHeaders = {
  ...cronCors,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function fmtDateBR(iso: string) {
  return iso.split("-").reverse().join("/");
}
function nowInTZ(tz = "America/Sao_Paulo") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const tomorrow = d.toISOString().slice(0, 10);
  return { date: today, tomorrow, hhmm: `${get("hour")}:${get("minute")}` };
}

interface Row { origin: string; description: string; amount: number; }

function isCreditCardExpense(notes: string | null | undefined): boolean {
  return /\[\s*cr[eé]dito\s*\]/i.test(notes ?? "");
}
function addMonthsKeepDay(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getCycleForRef(ref: Date, closingDay: number, dueDay: number) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  const closingThis = new Date(y, m, Math.min(closingDay, new Date(y, m + 1, 0).getDate()));
  const closingNext = day >= closingDay
    ? new Date(y, m + 1, Math.min(closingDay, new Date(y, m + 2, 0).getDate()))
    : closingThis;
  const closingPrev = day >= closingDay
    ? closingThis
    : new Date(y, m - 1, Math.min(closingDay, new Date(y, m, 0).getDate()));
  const dueMonth = dueDay > closingDay ? closingNext.getMonth() : closingNext.getMonth() + 1;
  const dueYear = closingNext.getFullYear();
  const dueDate = new Date(dueYear, dueMonth, Math.min(dueDay, new Date(dueYear, dueMonth + 1, 0).getDate()));
  return { from: closingPrev, to: closingNext, dueDate };
}
function getCycleForDueMonth(yyyymm: string, closingDay: number, dueDay: number) {
  const [ty, tm] = yyyymm.split("-").map(Number);
  for (let off = -36; off <= 36; off++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + off);
    const c = getCycleForRef(d, closingDay, dueDay);
    if (c.dueDate.getFullYear() === ty && c.dueDate.getMonth() + 1 === tm) return c;
  }
  return null;
}
function cycleKeyFromDate(closingTo: Date): string {
  return `${closingTo.getFullYear()}-${String(closingTo.getMonth() + 1).padStart(2, "0")}`;
}
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function buildAndSend(
  admin: any,
  userId: string,
  date: string,
  brandName: string,
  titleLabel: string,
  opts?: { returnText?: boolean; skipIfEmpty?: boolean },
): Promise<{ sent: boolean; text?: string; empty?: boolean }> {
  const link = await getReportsLinkForUser(admin, userId);
  if (!link && !opts?.returnText) return { sent: false };
  const chatId = link ? Number(link.chat_id) : 0;

  // Incomes a receber (pendentes/atrasadas) com vencimento na data
  const { data: incomes } = await admin.from("incomes")
    .select("description, amount, source, category, received_date, status")
    .eq("user_id", userId)
    .eq("received_date", date)
    .neq("status", "received");

  const incomeRows: Row[] = (incomes ?? []).map((i: any) => ({
    origin: i.source || i.category || "Receita",
    description: i.description,
    amount: Number(i.amount || 0),
  }));

  // Despesas pessoais (escopo personal) — ignora despesas da empresa.
  // Carrega TODAS as pessoais para conseguir consolidar a fatura do mês.
  const { data: allPersonal } = await admin.from("expenses")
    .select("id, description, amount, scope, category, installments, paid_installments, parent_expense_id, due_date, paid, notes, type")
    .eq("user_id", userId)
    .eq("scope", "personal");

  const personal = (allPersonal ?? []) as any[];

  // Linhas de despesas pessoais NÃO-cartão com vencimento na data e não pagas.
  const expenseRows: { description: string; amount: number }[] = [];
  for (const e of personal) {
    if (isCreditCardExpense(e.notes)) continue;
    if (e.due_date !== date) continue;
    if (e.paid) continue;
    const total = Number(e.amount || 0);
    const installments = Number(e.installments || 0);
    const isParentInstallment = !e.parent_expense_id && installments > 1;
    expenseRows.push({
      description: e.description,
      amount: isParentInstallment ? total / installments : total,
    });
  }

  // Faturas de cartão: uma linha por cartão cujo vencimento === date,
  // somando apenas as compras da competência daquele mês.
  const targetDate = new Date(date + "T00:00:00");
  const yyyymm = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;
  const dayOfMonth = targetDate.getDate();

  const { data: cards } = await admin.from("credit_cards")
    .select("id, nickname, last_four, closing_day, due_day, active")
    .eq("user_id", userId);
  const { data: openings } = await admin.from("credit_card_invoice_openings")
    .select("card_id, cycle_key, opening_amount, notes")
    .eq("user_id", userId);

  const invoiceRows: { description: string; amount: number; paid: boolean }[] = [];

  for (const card of (cards ?? []) as any[]) {
    if (card.active === false) continue;
    const cycle = getCycleForDueMonth(yyyymm, card.closing_day, card.due_day);
    if (!cycle) continue;
    if (isoLocal(cycle.dueDate) !== date) continue;
    if (cycle.dueDate.getDate() !== dayOfMonth) continue;

    const cardTag = String(card.nickname || card.last_four || "").toLowerCase();
    let itemsTotal = 0;
    let pendingCount = 0;
    let totalCount = 0;

    for (const e of personal) {
      if (!isCreditCardExpense(e.notes)) continue;
      const n = String(e.notes ?? "").toLowerCase();
      if (cardTag) {
        if (!n.includes(cardTag)) {
          if (/cart[aã]o[:\s]/i.test(n)) continue;
        }
      }
      const isParcelada = e.type === "recorrente" && Number(e.installments || 0) > 1 && !e.parent_expense_id;
      const installmentValue = isParcelada ? Number(e.amount) / Number(e.installments) : Number(e.amount);

      if (isParcelada) {
        // expandir parcelas virtuais ainda em aberto
        const total = Number(e.installments);
        const paidInstallments = Number(e.paid_installments || 0);
        const firstDue = addMonthsKeepDay(e.due_date, -paidInstallments);
        for (let i = paidInstallments + 1; i <= total; i++) {
          const due = new Date(addMonthsKeepDay(firstDue, i - 1) + "T00:00:00");
          if (due >= cycle.from && due < cycle.to) {
            itemsTotal += installmentValue;
            totalCount++;
            pendingCount++;
          }
        }
      } else {
        const due = new Date(e.due_date + "T00:00:00");
        if (due >= cycle.from && due < cycle.to) {
          itemsTotal += installmentValue;
          totalCount++;
          if (!e.paid) pendingCount++;
        }
      }
    }

    const ck = cycleKeyFromDate(cycle.to);
    const opening = (openings ?? []).find((o: any) => o.card_id === card.id && o.cycle_key === ck);
    const openingAmount = Number(opening?.opening_amount ?? 0);
    const total = itemsTotal + openingAmount;
    if (total <= 0) continue;

    const cardLabel = card.nickname || (card.last_four ? `Final ${card.last_four}` : "Cartão");
    invoiceRows.push({
      description: `Fatura ${cardLabel} (${String(targetDate.getMonth() + 1).padStart(2, "0")}/${targetDate.getFullYear()})`,
      amount: total,
      paid: pendingCount === 0 && totalCount > 0,
    });
  }

  const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
  const totalInvoices = invoiceRows.reduce((s, r) => s + r.amount, 0);
  const totalSimple = expenseRows.reduce((s, r) => s + r.amount, 0);
  const totalExpense = totalSimple + totalInvoices;
  const expenseCount = expenseRows.length + invoiceRows.length;
  const balance = totalIncome - totalExpense;
  const negative = balance < 0;

  const lines: string[] = [];
  lines.push(`📒 *${brandName} — ${titleLabel}*`);
  lines.push(`🗓️ ${fmtDateBR(date)}`);
  lines.push("");
  lines.push(`🟢 *A receber:* ${fmtBRL(totalIncome)}  _(${incomeRows.length})_`);
  lines.push(`🔴 *A pagar:* ${fmtBRL(totalExpense)}  _(${expenseCount})_`);
  lines.push(`${negative ? "⚠️" : "💰"} *Saldo previsto:* ${fmtBRL(balance)}`);
  if (negative) lines.push(`_Atenção: saldo negativo previsto para o dia._`);

  if (incomeRows.length > 0) {
    lines.push("");
    lines.push(`*🟢 Receitas a receber:*`);
    const sorted = [...incomeRows].sort((a, b) => b.amount - a.amount);
    for (const r of sorted) {
      lines.push(`• [${r.origin}] ${r.description} — *${fmtBRL(r.amount)}*`);
    }
  }

  if (expenseRows.length > 0) {
    lines.push("");
    lines.push(`*👤 Despesas pessoais:* ${fmtBRL(totalSimple)}  _(${expenseRows.length})_`);
    for (const r of [...expenseRows].sort((a, b) => b.amount - a.amount)) {
      lines.push(`• ${r.description} — *${fmtBRL(r.amount)}*`);
    }
  }

  if (invoiceRows.length > 0) {
    lines.push("");
    lines.push(`*💳 Faturas de cartão:* ${fmtBRL(totalInvoices)}  _(${invoiceRows.length})_`);
    for (const r of [...invoiceRows].sort((a, b) => b.amount - a.amount)) {
      lines.push(`• ${r.description} — *${fmtBRL(r.amount)}*${r.paid ? " ✓" : ""}`);
    }
  }

  if (incomeRows.length === 0 && expenseRows.length === 0 && invoiceRows.length === 0) {
    lines.push("");
    lines.push("_Nenhum lançamento previsto para este dia._");
  }

  const isEmpty = incomeRows.length === 0 && expenseRows.length === 0 && invoiceRows.length === 0;

  const text = lines.join("\n");
  if (opts?.returnText) return { sent: false, text, empty: isEmpty };

  // Envio automático: não envia relatório vazio (sem receitas nem despesas)
  if (opts?.skipIfEmpty && isEmpty) return { sent: false, text, empty: true };
  
  const res = await sendReportsAsImage(admin, userId, chatId, lines, { name: brandName }, {
    title: titleLabel,
    reportKey: "incomes_expenses",
  });
  
  return { sent: res.sent, text, empty: isEmpty };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = getExternalAdmin();

  let brandName = "EmprestAI";
  try {
    const { data: bRow } = await admin.from("app_branding").select("brand_name").limit(1).maybeSingle();
    if ((bRow as any)?.brand_name) brandName = (bRow as any).brand_name;
  } catch (_) { /* ignore */ }

  const { date: today, tomorrow, hhmm } = nowInTZ();
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const anonKeys = new Set([
    getExternalAnonKey(),
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
  ].filter(Boolean));

  let authenticatedUser: any = null;
  if (token && !anonKeys.has(token)) {
    const userClient = getExternalUserClient();
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    if (!userErr && user?.id) {
      authenticatedUser = user;
    }
  }

  // 1. Envio sob demanda autenticado pelo próprio usuário
  if (authenticatedUser && req.method === "POST") {
    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    const returnText = body?.return_text === true;
    let manualTarget = (body?.date as string) || tomorrow;
    let manualLabel = "Receitas e Despesas";
    if (!body?.date) {
      const { data: pref } = await admin
        .from("incomes_expenses_telegram_prefs")
        .select("send_target")
        .eq("user_id", authenticatedUser.id)
        .maybeSingle();
      if ((pref as any)?.send_target === "today") {
        manualTarget = today;
        manualLabel = "Receitas e Despesas";
      }
    } else if (body.date === today) {
      manualLabel = "Receitas e Despesas";
    }
    // Checa link antes para devolver erro claro ao front
    if (!returnText) {
      const link = await getReportsLinkForUser(admin, authenticatedUser.id);
      if (!link) {
        return new Response(
          JSON.stringify({ ok: false, error: "no_reports_link", message: "Conecte o Bot de Relatórios (envie /start ao bot) antes de enviar." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    const res = await buildAndSend(admin, authenticatedUser.id, manualTarget, brandName, manualLabel, { returnText });
    return new Response(
      JSON.stringify({ ok: res.sent || returnText, sent: res.sent ? 1 : 0, date: manualTarget, text: res.text }),
      { status: res.sent || returnText ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 2. Modo Cron Global: exige autenticação rígida de Cron ou Admin
  const cronAuth = await requireCronOrAdmin(req);
  if (cronAuth instanceof Response) return cronAuth;
  const [hh, mm] = hhmm.split(":").map(Number);
  const nowMin = hh * 60 + mm;

  const { data: prefs, error } = await admin
    .from("incomes_expenses_telegram_prefs")
    .select("user_id, enabled, send_time_1, send_time_2, send_time_3, send_target, last_sent")
    .eq("enabled", true);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let sent = 0;
  const diag: any[] = [];
  for (const pref of (prefs ?? [])) {
    const userId = (pref as any).user_id;
    try {
      const slots = [
        { key: "send_time_1", time: (pref as any).send_time_1 },
        { key: "send_time_2", time: (pref as any).send_time_2 },
        { key: "send_time_3", time: (pref as any).send_time_3 },
      ] as const;
      const lastSent = ((pref as any).last_sent ?? {}) as Record<string, string>;
      const firedSlots = dueSlotKeys(slots, nowMin, today, lastSent);
      if (firedSlots.length === 0) {
        diag.push({ userId, status: "no_slot_due", lastSent });
        continue;
      }

      const isToday = (pref as any).send_target === "today";
      const targetDate = isToday ? today : tomorrow;
      const label = "Receitas e Despesas";

      const link = await getReportsLinkForUser(admin, userId);
      if (!link) {
        diag.push({ userId, status: "no_reports_link", firedSlots });
        console.error("[incomes-expenses-summary] no reports link for", userId);
        continue;
      }

      const res = await buildAndSend(admin, userId, targetDate, brandName, label, { skipIfEmpty: true });
      if (res.empty && !res.sent) {
        // Nada previsto para o dia: marca os slots como processados e não envia mensagem.
        const newLast = { ...lastSent };
        for (const slot of firedSlots) newLast[slot] = today;
        await admin.from("incomes_expenses_telegram_prefs")
          .update({ last_sent: newLast })
          .eq("user_id", userId);
        diag.push({ userId, status: "skipped_empty", firedSlots, targetDate });
        continue;
      }
      diag.push({ userId, status: res.sent ? "sent" : "send_failed", firedSlots, targetDate, chat_id: link.chat_id });
      if (res.sent) {
        const newLast = { ...lastSent };
        for (const slot of firedSlots) newLast[slot] = today;
        await admin.from("incomes_expenses_telegram_prefs")
          .update({ last_sent: newLast })
          .eq("user_id", userId);
        sent++;
      } else {
        console.error("[incomes-expenses-summary] buildAndSend returned sent=false for", userId);
      }
    } catch (e) {
      console.error("incomes-expenses-summary error", userId, e);
      diag.push({ userId, status: "exception", error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: prefs?.length ?? 0, hhmm, diag }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
