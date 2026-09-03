// AUTO-GENERATED STANDALONE — cole este arquivo inteiro no Supabase Dashboard.
// Todas as dependências de _shared estão embutidas abaixo.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============= _shared/cors.ts =============
// CORS headers padronizados para todas as Edge Functions do app.
// Uso:
//   import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
//   const pre = handleCorsPreflight(req); if (pre) return pre;
//   return new Response(..., { headers: { ...corsHeaders, "Content-Type": "application/json" } });
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

/** Retorna a resposta 200 de preflight se `req` for OPTIONS; caso contrário, null. */
function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

// ============= _shared/external-supabase.ts =============
// Helper para acessar EXCLUSIVAMENTE o banco externo do usuário
// (syyxnqzxqabeuqbuptkh). Quando a function roda no projeto Lovable Cloud,
// usa EXTERNAL_*; quando roda diretamente no projeto externo, usa SUPABASE_*.

// Permite sobrescrever via secret EXTERNAL_PROJECT_REF; mantém o valor
// histórico como fallback para não quebrar deploys existentes.
const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(
      `[external-supabase] secret ${name} não configurado. Configure-o em Settings → Secrets para apontar ao projeto externo (syyxnqzxqabeuqbuptkh).`,
    );
  }
  return v;
}

function getExternalSupabaseUrl(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (external?.includes(EXTERNAL_PROJECT_REF)) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF)) return nativeUrl;

  return `https://${EXTERNAL_PROJECT_REF}.supabase.co`;
}

function getExternalServiceRoleKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return required("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
}

function getExternalAnonKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return required("EXTERNAL_SUPABASE_ANON_KEY");
}

/** Admin client (service role) apontando ao Supabase EXTERNO. */
function getExternalAdmin(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey(), {
    auth: {
      persistSession: false,
    },
  });
}

/** Anon client usado para validar JWTs emitidos pelo Supabase EXTERNO. */
function getExternalUserClient(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalAnonKey(), {
    auth: {
      persistSession: false,
    },
  });
}


// ============= _shared/require-admin.ts =============
// Shared helper to require an authenticated user with the 'admin' role
// (via the public.user_roles table). Returns a Response on failure, or
// the verified user id on success.
// ⚠️ Sempre opera no Supabase EXTERNO (banco principal do app).

const adminCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  let admin;
  try {
    admin = getExternalAdmin();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server misconfigured", detail: (e as Error).message }), {
      status: 500, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace(/^Bearer\s+/i, "");
  // Valida o JWT contra o próprio Supabase externo usando o service role do servidor.
  // Isso evita falso 401 quando a anon key usada para validação está ausente/rotacionada
  // nos secrets da Edge Function, sem reduzir a checagem de papel admin abaixo.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...adminCors, "Content-Type": "application/json" },
    });
  }
  return { userId: userData.user.id };
}


// ============= _shared/require-cron-or-admin.ts =============
// Shared guard for cron-triggered edge functions. Accepts either:
//   - Header `x-cron-secret` matching env CRON_SECRET (constant-time compare); or
//   - An authenticated admin (via requireAdmin).
// On failure returns a Response (401/403). On success returns { via }.

const cronCors = {
  ...adminCors,
  "Access-Control-Allow-Headers":
    adminCors["Access-Control-Allow-Headers"] + ", x-cron-secret",
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function requireCronOrAdmin(
  req: Request,
): Promise<{ via: "cron" | "admin"; userId?: string } | Response> {
  const provided = req.headers.get("x-cron-secret") ?? "";
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  if (expected && provided && safeEqual(provided, expected)) {
    return { via: "cron" };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (token) {
    const serviceKeys = [
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ];

    try {
      const externalServiceKey = getExternalServiceRoleKey();
      if (!serviceKeys.includes(externalServiceKey)) serviceKeys.push(externalServiceKey);
    } catch {
      // Se o projeto externo ainda não estiver configurado, seguimos para a validação admin normal.
    }

    if (serviceKeys.some((key) => key && safeEqual(token, key))) {
      return { via: "cron" };
    }
  }

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const res = await requireAdmin(req);
    if (!(res instanceof Response)) return { via: "admin", userId: res.userId };
    return res;
  }

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...cronCors, "Content-Type": "application/json" },
  });
}

// ============= _shared/reports-commands.ts =============
const TZ = "America/Sao_Paulo";

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function todayInTZ(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthBounds(date = todayInTZ()): { start: string; end: string; prefix: string } {
  const [year, month] = date.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end, prefix: `${year}-${String(month).padStart(2, "0")}` };
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.floor((b - a) / 86_400_000);
}

function inMonth(date: string | null | undefined, month: string): boolean {
  return !!date && String(date).slice(0, 7) === month;
}

function num(value: unknown): number {
  return Number(value || 0);
}

function totalWithInterest(loan: any): number {
  return Math.round(num(loan.amount) * (1 + num(loan.interest_rate) / 100));
}

function calcLateFees(loan: any, baseAmount: number, daysOverdue: number): number {
  if (daysOverdue <= 0) return 0;
  const lateValue = num(loan.late_interest_value);
  const lateInterest = lateValue > 0
    ? loan.late_interest_type === "fixed"
      ? lateValue * daysOverdue
      : baseAmount * (lateValue / 100) * daysOverdue
    : 0;
  const penalty = num(loan.penalty_value);
  return lateInterest + (penalty > 0 ? penalty : 0);
}

const REPORT_COMMANDS = new Set([
  "relatorios", "dashboard",
  "kpi_geral", "carteira_ativa",
  "emprestimos_atrasados", "vencimentos_hoje", "inadimplencia",
  "resumo_diario", "resumo_mensal",
  "top_clientes", "vencimentos_semana", "projecao_mes",
  "novos_contratos", "historico_cliente", "alertas",
]);

function parseReportCommand(text: string): string | null {
  const normalized = text.trim().replace(/\\_/g, "_");
  const match = normalized.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+(.+))?\s*$/i);
  if (!match) return null;
  const command = match[1].toLowerCase();
  if (!REPORT_COMMANDS.has(command)) return null;
  const arg = (match[2] || "").trim();
  return arg ? `${command}|${arg}` : command;
}

function renderMenu(brand = "Relatórios"): string {
  return [
    `📊 *${brand} — Menu de Relatórios*`,
    "",
    "Use um dos comandos abaixo:",
    "",
    "*Visão geral*",
    "/dashboard — Visão executiva consolidada",
    "/kpi\\_geral — Indicadores principais",
    "",
    "*Carteira & inadimplência*",
    "/carteira\\_ativa — Capital e pendências",
    "/emprestimos\\_atrasados — Lista de contratos em atraso",
    "/inadimplencia — Taxa e faixas de atraso",
    "",
    "*Operação*",
    "/vencimentos\\_hoje — Contratos que vencem hoje",
    "/vencimentos\\_semana — Parcelas dos próximos 7 dias",
    "/resumo\\_diario — Movimentação do dia",
    "/resumo\\_mensal — Fechamento do mês",
    "",
    "*Carteira & crescimento*",
    "/top\\_clientes — Melhores e piores pagadores",
    "/novos\\_contratos — Contratos do mês",
    "/projecao\\_mes — Projeção de caixa do mês",
    "/alertas — Sinais de risco",
    "",
    "*Consulta*",
    "/historico\\_cliente <nome> — Ficha de um cliente",
  ].join("\n");
}

interface Ctx {
  supabase: any;
  userId: string;
  today: string;
}

interface Snapshot {
  loans: any[];
  installments: any[];
  payments: any[];
  clients: any[];
  active: any[];
  totalLent: number;
  totalToReceive: number;
  pendingReceivable: number;
  estimatedProfit: number;
  overdueLoans: number;
}

async function loadLoans(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase.from("loans").select("*").eq("user_id", ctx.userId);
  if (error) throw error;
  return data ?? [];
}

async function loadInstallments(ctx: Ctx, loanIds: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < loanIds.length; i += 50) {
    const chunk = loanIds.slice(i, i + 50);
    const { data, error } = await ctx.supabase
      .from("loan_installments")
      .select("loan_id, installment_number, amount, due_date")
      .in("loan_id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function loadPayments(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase
    .from("payments")
    .select("id, loan_id, amount, date, installment_number, created_at, metadata")
    .eq("user_id", ctx.userId)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadClients(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase
    .from("clients")
    .select("id, name, phone, active, created_at")
    .eq("user_id", ctx.userId);
  if (error) throw error;
  return data ?? [];
}

function dueEntriesForLoan(loan: any, installments: any[]) {
  const count = Math.max(1, num(loan.installments) || 1);
  const total = totalWithInterest(loan);
  const installmentValue = total / count;
  const paidInstallments = num(loan.paid_installments);
  const schedules = installments
    .filter((schedule) => schedule.loan_id === loan.id)
    .sort((a, b) => num(a.installment_number) - num(b.installment_number));

  if (schedules.length > 0) {
    return schedules.map((schedule) => ({
      loan_id: loan.id,
      installment_number: num(schedule.installment_number),
      due_date: schedule.due_date,
      amount: num(schedule.amount) || installmentValue,
      paid: loan.status === "paid" || schedule.paid === true || num(schedule.installment_number) <= paidInstallments,
    }));
  }

  if (count <= 1) {
    return [{
      loan_id: loan.id,
      installment_number: 1,
      due_date: loan.due_date,
      amount: total,
      paid: loan.status === "paid" || paidInstallments >= 1,
    }];
  }

  const base = new Date(`${String(loan.due_date).slice(0, 10)}T00:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const due = new Date(base.getFullYear(), base.getMonth() + index, base.getDate());
    return {
      loan_id: loan.id,
      installment_number: index + 1,
      due_date: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
      amount: installmentValue,
      paid: loan.status === "paid" || index + 1 <= paidInstallments,
    };
  });
}

function paymentsInRange(payments: any[], from: string, to: string): any[] {
  return payments.filter((payment) => payment.date >= from && payment.date <= to);
}

function totalPaidByLoan(payments: any[]): Record<string, number> {
  return payments.reduce<Record<string, number>>((acc, payment) => {
    acc[payment.loan_id] = (acc[payment.loan_id] || 0) + num(payment.amount);
    return acc;
  }, {});
}

function getOverdueByLoan(ctx: Ctx, snap: Snapshot) {
  const paidByLoan = totalPaidByLoan(snap.payments);
  const overdue = new Map<string, { value: number; oldest: string }>();

  for (const loan of snap.loans) {
    const count = Math.max(1, num(loan.installments) || 1);
    for (const entry of dueEntriesForLoan(loan, snap.installments)) {
      if (entry.paid || !entry.due_date || entry.due_date >= ctx.today) continue;
      const fallbackRemaining = Math.max(0, totalWithInterest(loan) - (paidByLoan[loan.id] || 0));
      const value = count === 1 ? Math.max(0, num(loan.remaining_amount) || fallbackRemaining) : entry.amount;
      const current = overdue.get(loan.id) ?? { value: 0, oldest: entry.due_date };
      current.value += value;
      if (entry.due_date < current.oldest) current.oldest = entry.due_date;
      overdue.set(loan.id, current);
    }
  }

  return overdue;
}

function computeDefaultRate(ctx: Ctx, snap: Snapshot, month: string): number {
  const paidByLoan = totalPaidByLoan(snap.payments);
  let portfolio = 0;
  let overdue = 0;

  for (const loan of snap.loans) {
    const count = Math.max(1, num(loan.installments) || 1);
    for (const entry of dueEntriesForLoan(loan, snap.installments)) {
      if (!inMonth(entry.due_date, month)) continue;
      portfolio += entry.amount;
      if (entry.paid || entry.due_date >= ctx.today) continue;
      if (count === 1) {
        const fallbackRemaining = Math.max(0, totalWithInterest(loan) - (paidByLoan[loan.id] || 0));
        overdue += Math.max(0, num(loan.remaining_amount) || fallbackRemaining);
      } else {
        overdue += entry.amount;
      }
    }
  }

  return portfolio > 0 ? (overdue / portfolio) * 100 : 0;
}

function computeExpectedReceivable(loans: any[], month: string): number {
  return loans.reduce((sum, loan) => {
    const count = Math.max(1, num(loan.installments) || 1);
    const total = totalWithInterest(loan);
    if (count <= 1) return inMonth(loan.due_date, month) ? sum + total : sum;

    const [year, startMonth, day] = String(loan.start_date || "").split("-").map(Number);
    if (!year || !startMonth || !day) return sum;
    const installmentValue = total / count;
    let monthlyTotal = 0;
    for (let i = 0; i < count; i++) {
      const due = new Date(year, (startMonth - 1) + (i + 1), day);
      const key = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
      if (key === month) monthlyTotal += installmentValue;
    }
    return sum + monthlyTotal;
  }, 0);
}

function computeProfitRealized(loans: any[], payments: any[], month: string): number {
  const sorted = [...payments].sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
  const interestByPayment = new Map<string, number>();
  const remainingInterestByLoan = new Map<string, number>();

  for (const loan of loans) {
    remainingInterestByLoan.set(loan.id, Math.max(0, totalWithInterest(loan) - num(loan.amount)));
  }

  for (const payment of sorted) {
    const amount = num(payment.amount);
    if (amount <= 0) {
      interestByPayment.set(payment.id, 0);
      continue;
    }

    const installmentNumber = num(payment.installment_number);
    if (installmentNumber === 0 || installmentNumber === -2) {
      interestByPayment.set(payment.id, amount);
      remainingInterestByLoan.set(payment.loan_id, Math.max(0, (remainingInterestByLoan.get(payment.loan_id) ?? 0) - amount));
      continue;
    }
    if (installmentNumber === -3) {
      interestByPayment.set(payment.id, 0);
      continue;
    }

    const loan = loans.find((item) => item.id === payment.loan_id);
    const total = loan ? totalWithInterest(loan) : 0;
    const ratio = total > 0 && loan ? Math.max(0, 1 - num(loan.amount) / total) : 0;
    const interest = Math.min(remainingInterestByLoan.get(payment.loan_id) ?? 0, Math.max(0, amount * ratio));
    interestByPayment.set(payment.id, interest);
    remainingInterestByLoan.set(payment.loan_id, Math.max(0, (remainingInterestByLoan.get(payment.loan_id) ?? 0) - interest));
  }

  const lastPaymentByLoan = new Map<string, string>();
  for (const payment of sorted) lastPaymentByLoan.set(payment.loan_id, payment.id);
  for (const loan of loans) {
    if (loan.status !== "paid") continue;
    const lastId = lastPaymentByLoan.get(loan.id);
    if (!lastId) continue;
    const loanPayments = payments.filter((payment) => payment.loan_id === loan.id);
    const totalPaid = loanPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
    const allocated = loanPayments.reduce((sum, payment) => sum + (interestByPayment.get(payment.id) ?? 0), 0);
    const principal = num(loan.original_amount ?? loan.amount);
    const diff = (totalPaid - principal) - allocated;
    if (Math.abs(diff) >= 0.005) interestByPayment.set(lastId, Math.max(0, (interestByPayment.get(lastId) ?? 0) + diff));
  }

  return payments
    .filter((payment) => inMonth(payment.date, month))
    .reduce((sum, payment) => sum + (interestByPayment.get(payment.id) ?? 0), 0);
}

async function snapshot(ctx: Ctx): Promise<Snapshot> {
  const [loans, clients, payments] = await Promise.all([loadLoans(ctx), loadClients(ctx), loadPayments(ctx)]);
  const installments = await loadInstallments(ctx, loans.map((loan) => loan.id));
  const active = loans.filter((loan) => loan.status !== "paid");
  // Capital na rua = principal proporcional ao número de parcelas em aberto
  // (espelha a lógica do card "Capital na Rua" do app).
  const totalLent = active.reduce((sum, loan) => {
    const n = num(loan.installments) > 0 ? num(loan.installments) : 1;
    const paid = Math.min(num(loan.paid_installments), n);
    const remainingRatio = Math.max(0, (n - paid) / n);
    return sum + num(loan.amount) * remainingRatio;
  }, 0);
  const totalToReceive = active.reduce((sum, loan) => {
    const total = totalWithInterest(loan);
    const dueDate = new Date(`${loan.due_date}T00:00:00`);
    const today = new Date(`${ctx.today}T00:00:00`);
    const daysLate = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000));
    const paidForLoan = payments.filter((payment) => payment.loan_id === loan.id).reduce((s, payment) => s + num(payment.amount), 0);
    const baseRemaining = num(loan.remaining_amount) > 0 ? num(loan.remaining_amount) : Math.max(0, total - paidForLoan);
    let lateFees = 0;
    if (num(loan.late_interest_value) > 0 && daysLate > 0) {
      lateFees += loan.late_interest_type === "fixed"
        ? num(loan.late_interest_value) * daysLate
        : baseRemaining * (num(loan.late_interest_value) / 100) * daysLate;
    }
    if (num(loan.penalty_value) > 0 && daysLate > 0) lateFees += num(loan.penalty_value);
    const interestPaymentsReceived = payments
      .filter((payment) => payment.loan_id === loan.id && num(payment.installment_number) === 0)
      .reduce((s, payment) => s + num(payment.amount), 0);
    return sum + Math.round((total + lateFees + interestPaymentsReceived) * 100) / 100;
  }, 0);
  const pendingReceivable = active.reduce((sum, loan) => sum + num(loan.remaining_amount), 0);
  const estimatedProfit = pendingReceivable - totalLent;
  const overdueLoans = loans.filter((loan) => loan.status === "overdue" && loan.due_date < ctx.today).length;

  return { loans, installments, payments, clients, active, totalLent, totalToReceive, pendingReceivable, estimatedProfit, overdueLoans };
}

async function recebimentosHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const payments = paymentsInRange(snap.payments, ctx.today, ctx.today);
  const total = payments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const byClient = new Map<string, number>();
  for (const payment of payments) {
    const loan = snap.loans.find((item) => item.id === payment.loan_id);
    const name = loan?.borrower_name || "—";
    byClient.set(name, (byClient.get(name) ?? 0) + num(payment.amount));
  }
  const dueEntries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments));
  const dueToday = dueEntries.filter((entry) => entry.due_date === ctx.today);

  const lines = [
    `📅 *Recebimentos de hoje* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `💰 Total recebido: *${fmtBRL(total)}*`,
    `🧾 Pagamentos: *${payments.length}*`,
  ];
  if (byClient.size > 0) {
    lines.push("", "*Clientes que pagaram:*");
    for (const [name, value] of [...byClient.entries()].sort((a, b) => b[1] - a[1])) lines.push(`• ${name} — ${fmtBRL(value)}`);
  }
  lines.push("", `📆 Parcelas com vencimento hoje: *${dueToday.length}* (pendentes: ${dueToday.filter((entry) => !entry.paid).length})`);
  lines.push(`⏳ Parcelas pendentes totais: *${dueEntries.filter((entry) => !entry.paid).length}*`);
  return lines.join("\n");
}

async function carteiraAtiva(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdueCount = getOverdueByLoan(ctx, snap).size;
  return [
    "💰 *Carteira Ativa*",
    "",
    `📤 Capital na rua: *${fmtBRL(snap.totalLent)}*`,
    `⏳ Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `📈 Lucro estimado: *${fmtBRL(snap.estimatedProfit)}*`,
    `📑 Empréstimos ativos: *${snap.active.length}*`,
    overdueCount > 0 ? `🚨 Em atraso: *${overdueCount}*` : "✅ Nenhum empréstimo em atraso",
  ].join("\n");
}

async function emprestimosAtrasados(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const sorted = [...overdue.entries()]
    .map(([loanId, item]) => {
      const loan = snap.loans.find((entry) => entry.id === loanId);
      const days = daysBetween(item.oldest, ctx.today);
      const fees = loan ? calcLateFees(loan, item.value, days) : 0;
      return { name: loan?.borrower_name || "—", days, value: item.value + fees };
    })
    .sort((a, b) => b.days - a.days);
  const total = sorted.reduce((sum, r) => sum + r.value, 0);
  const lines = ["🚨 *Empréstimos em Atraso*", "", `📑 Contratos: *${overdue.size}*`, `💸 Valor em atraso (com juros/multa): *${fmtBRL(total)}*`];
  if (overdue.size === 0) return [...lines, "", "_Nenhum contrato em atraso. 🎉_"].join("\n");

  lines.push("", "*Clientes:*");

  const nameWidth = Math.min(14, Math.max(...sorted.map((r) => r.name.length)));
  const daysWidth = Math.max(...sorted.map((r) => `${r.days}d`.length));
  const valueWidth = Math.max(...sorted.map((r) => fmtBRL(r.value).length));
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
  const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

  for (const row of sorted) {
    const shortName = row.name.length > nameWidth ? row.name.slice(0, nameWidth) : row.name;
    const marker = row.days > 20 ? " 🔴" : "";
    lines.push(`\`${pad(shortName, nameWidth)} ${padL(`${row.days}d`, daysWidth)} ${padL(fmtBRL(row.value), valueWidth)}\`${marker}`);
  }
  return lines.join("\n");
}

async function vencimentosHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const rows = snap.loans.flatMap((loan) =>
    dueEntriesForLoan(loan, snap.installments)
      .filter((e) => e.due_date === ctx.today && !e.paid)
      .map((e) => ({ name: loan.borrower_name || "—", value: num(e.amount) }))
  );
  const total = rows.reduce((s, r) => s + r.value, 0);
  const dateBR = ctx.today.split("-").reverse().join("/");
  const lines = [`📆 *Vencem hoje — ${dateBR}*`, "", `📑 Contratos: *${rows.length}*`, `💰 Valor previsto: *${fmtBRL(total)}*`];
  if (rows.length === 0) return [...lines, "", "_Nenhum vencimento para hoje. 🎉_"].join("\n");

  lines.push("", "*Clientes:*");
  const sorted = rows.sort((a, b) => b.value - a.value);

  const nameWidth = Math.min(14, Math.max(...sorted.map((r) => r.name.length)));
  const valueWidth = Math.max(...sorted.map((r) => fmtBRL(r.value).length));
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
  const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

  for (const row of sorted) {
    const shortName = row.name.length > nameWidth ? row.name.slice(0, nameWidth) : row.name;
    lines.push(`\`${pad(shortName, nameWidth)} ${padL(fmtBRL(row.value), valueWidth)}\``);
  }
  return lines.join("\n");
}

async function inadimplencia(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { prefix } = monthBounds(ctx.today);
  const overdue = getOverdueByLoan(ctx, snap);
  const overdueValue = [...overdue.values()].reduce((sum, item) => sum + item.value, 0);
  const buckets = { b1: 0, b2: 0, b3: 0, b4: 0 };
  for (const item of overdue.values()) {
    const days = daysBetween(item.oldest, ctx.today);
    if (days <= 30) buckets.b1 += item.value;
    else if (days <= 60) buckets.b2 += item.value;
    else if (days <= 90) buckets.b3 += item.value;
    else buckets.b4 += item.value;
  }

  return [
    "📉 *Inadimplência*",
    "",
    `💼 Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `⚠️ Valor vencido em aberto: *${fmtBRL(overdueValue)}*`,
    `📊 Taxa do mês (igual Metas): *${computeDefaultRate(ctx, snap, prefix).toFixed(2)}%*`,
    "",
    "*Faixas de atraso:*",
    `• 1–30 dias: ${fmtBRL(buckets.b1)}`,
    `• 31–60 dias: ${fmtBRL(buckets.b2)}`,
    `• 61–90 dias: ${fmtBRL(buckets.b3)}`,
    `• 90+ dias: ${fmtBRL(buckets.b4)}`,
  ].join("\n");
}

async function resumoDiario(ctx: Ctx, snap: Snapshot): Promise<string> {
  const newLoans = snap.loans.filter((loan) => loan.start_date === ctx.today);
  const payments = paymentsInRange(snap.payments, ctx.today, ctx.today);
  const dueToday = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments)).filter((entry) => entry.due_date === ctx.today).length;

  return [
    `📅 *Resumo do dia* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `🆕 Novos empréstimos: *${newLoans.length}*`,
    `📤 Valor emprestado hoje: *${fmtBRL(newLoans.reduce((sum, loan) => sum + num(loan.amount), 0))}*`,
    `💰 Recebimentos: *${fmtBRL(payments.reduce((sum, payment) => sum + num(payment.amount), 0))}* (${payments.length})`,
    `📆 Parcelas vencendo hoje: *${dueToday}*`,
    `✅ Pagamentos registrados hoje: *${payments.length}*`,
    `🚨 Contratos inadimplentes: *${getOverdueByLoan(ctx, snap).size}*`,
  ].join("\n");
}

async function resumoMensal(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const newLoans = snap.loans.filter((loan) => loan.start_date >= start && loan.start_date <= end);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const interest = computeProfitRealized(snap.loans, snap.payments, prefix);
  const expected = computeExpectedReceivable(snap.loans, prefix);
  const paidOff = snap.loans.filter((loan) => {
    if (loan.status !== "paid") return false;
    const last = snap.payments.filter((payment) => payment.loan_id === loan.id).map((payment) => String(payment.date || "")).sort().pop();
    return !!last && last >= start && last <= end;
  }).length;

  return [
    `📆 *Resumo mensal* — ${prefix.split("-").reverse().join("/")}`,
    "",
    `🆕 Novos contratos: *${newLoans.length}*`,
    `📤 Valor emprestado: *${fmtBRL(newLoans.reduce((sum, loan) => sum + num(loan.amount), 0))}*`,
    `💰 Valor recebido: *${fmtBRL(received)}*`,
    `📌 Previsto no mês: *${fmtBRL(expected)}*`,
    `📈 Juros recebidos: *${fmtBRL(interest)}*`,
    `✅ Contratos quitados: *${paidOff}*`,
    `🚨 Contratos em atraso: *${getOverdueByLoan(ctx, snap).size}*`,
    `🎯 Faturamento do período: *${(expected > 0 ? (received / expected) * 100 : 0).toFixed(2)}%*`,
    `📊 Rentabilidade s/ carteira: *${(snap.totalLent > 0 ? (interest / snap.totalLent) * 100 : 0).toFixed(2)}%*`,
  ].join("\n");
}

async function dashboard(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const activeClients = snap.clients.filter((client) => client.active !== false).length;
  const overdueCount = getOverdueByLoan(ctx, snap).size;

  return [
    "📊 *Dashboard Executivo*",
    "",
    "*Visão geral*",
    `👥 Clientes ativos: *${activeClients}*`,
    `📑 Empréstimos ativos: *${snap.active.length}*`,
    `🚨 Contratos em atraso: *${overdueCount}*`,
    "",
    "*Financeiro do mês*",
    `📤 Capital na rua: *${fmtBRL(snap.totalLent)}*`,
    `💰 Recebido no mês: *${fmtBRL(received)}*`,
    `⏳ Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `💎 Lucro estimado: *${fmtBRL(snap.estimatedProfit)}*`,
  ].join("\n");
}

async function kpiGeral(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const interest = computeProfitRealized(snap.loans, snap.payments, prefix);
  const defaultRate = computeDefaultRate(ctx, snap, prefix);
  const avgTicket = snap.active.length > 0 ? snap.pendingReceivable / snap.active.length : 0;
  const portfolioYield = snap.totalLent > 0 ? (interest / snap.totalLent) * 100 : 0;
  const collectionRate = snap.pendingReceivable + received > 0
    ? (received / (received + snap.pendingReceivable)) * 100
    : 0;
  const overdueCount = getOverdueByLoan(ctx, snap).size;
  const overdueRatio = snap.active.length > 0 ? (overdueCount / snap.active.length) * 100 : 0;

  return [
    "📈 *KPIs Gerais*",
    "",
    "*Performance da carteira*",
    `🎯 Ticket médio: *${fmtBRL(avgTicket)}*`,
    `💎 Rentabilidade: *${portfolioYield.toFixed(2)}%*`,
    `📈 Juros recebidos no mês: *${fmtBRL(interest)}*`,
    "",
    "*Cobrança e inadimplência*",
    `📊 Taxa de inadimplência: *${defaultRate.toFixed(2)}%*`,
    `🚨 Contratos em atraso: *${overdueCount}* (${overdueRatio.toFixed(1)}% da carteira)`,
    `✅ Eficiência de cobrança: *${collectionRate.toFixed(2)}%*`,
  ].join("\n");
}

function phoneByName(snap: Snapshot, name: string): string {
  const c = snap.clients.find((cl) => (cl.name || "").toLowerCase() === (name || "").toLowerCase());
  return c?.phone ? ` 📞 ${c.phone}` : "";
}

async function topClientes(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const stats = new Map<string, { lent: number; paid: number; overdue: number; days: number }>();
  for (const loan of snap.loans) {
    const name = loan.borrower_name || "—";
    const s = stats.get(name) ?? { lent: 0, paid: 0, overdue: 0, days: 0 };
    s.lent += num(loan.amount);
    s.paid += snap.payments.filter((p) => p.loan_id === loan.id).reduce((a, p) => a + num(p.amount), 0);
    const od = overdue.get(loan.id);
    if (od) {
      s.overdue += od.value;
      s.days = Math.max(s.days, daysBetween(od.oldest, ctx.today));
    }
    stats.set(name, s);
  }
  const arr = [...stats.entries()].map(([name, s]) => ({ name, ...s }));
  const best = [...arr].filter((x) => x.paid > 0).sort((a, b) => b.paid - a.paid).slice(0, 5);
  const worst = [...arr].filter((x) => x.overdue > 0).sort((a, b) => b.days - a.days || b.overdue - a.overdue).slice(0, 5);
  const lines = ["🏆 *Top Clientes*", "", "*Melhores pagadores*"];
  if (best.length === 0) lines.push("_Sem dados._");
  for (const b of best) {
    lines.push(`• ${b.name} — pago ${fmtBRL(b.paid)} / emprestado ${fmtBRL(b.lent)}`);
  }
  lines.push("", "*Maiores devedores*");
  if (worst.length === 0) lines.push("_Nenhum cliente em atraso. 🎉_");
  for (const w of worst) lines.push(`• ${w.name} — ${w.days}d em atraso — ${fmtBRL(w.overdue)}`);
  return lines.join("\n");
}

async function vencimentosSemana(ctx: Ctx, snap: Snapshot): Promise<string> {
  const start = new Date(`${ctx.today}T00:00:00`);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const entries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments).map((e) => ({ ...e, borrower: loan.borrower_name || "—" })));
  const upcoming = entries
    .filter((e) => !e.paid && e.due_date >= ctx.today && e.due_date <= endStr)
    .sort(
      (a, b) => a.due_date.localeCompare(b.due_date) || b.amount - a.amount || a.borrower.localeCompare(b.borrower),
    );
  const total = upcoming.reduce((s, e) => s + e.amount, 0);
  const lines = [`📆 *Vencimentos — próximos 7 dias*`, "", `📑 Parcelas: *${upcoming.length}* — Total: *${fmtBRL(total)}*`];
  if (upcoming.length === 0) return [...lines, "", "_Nada a vencer no período._"].join("\n");

  const byDay = new Map<string, typeof upcoming>();
  for (const it of upcoming) {
    if (!byDay.has(it.due_date)) byDay.set(it.due_date, [] as any);
    byDay.get(it.due_date)!.push(it);
  }
  for (const [day, items] of byDay) {
    items.sort((a, b) => b.amount - a.amount || a.borrower.localeCompare(b.borrower));
    const dayTotal = items.reduce((s, e) => s + e.amount, 0);
    lines.push("", `*${day.split("-").reverse().join("/")}* — ${items.length} parcela(s) — ${fmtBRL(dayTotal)}`);
    for (const it of items) {
      lines.push(`• ${it.borrower} — ${fmtBRL(it.amount)}`);
    }
  }
  return lines.join("\n");
}

async function projecaoMes(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((s, p) => s + num(p.amount), 0);
  const entries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments));
  const monthEntries = entries.filter((e) => inMonth(e.due_date, prefix) && !e.paid);
  const remainingMonth = monthEntries.filter((e) => e.due_date >= ctx.today).reduce((s, e) => s + e.amount, 0);
  const overdueInMonth = monthEntries.filter((e) => e.due_date < ctx.today).reduce((s, e) => s + e.amount, 0);
  const expected = computeExpectedReceivable(snap.loans, prefix);
  const projected = received + remainingMonth + overdueInMonth;
  return [
    `📡 *Projeção de Caixa — ${prefix.split("-").reverse().join("/")}*`,
    "",
    `📌 Previsto no mês: *${fmtBRL(expected)}*`,
    `💰 Já recebido: *${fmtBRL(received)}*`,
    `📆 A vencer ainda no mês: *${fmtBRL(remainingMonth)}*`,
    `🚨 Atrasado (mês corrente): *${fmtBRL(overdueInMonth)}*`,
    `🎯 Projeção final: *${fmtBRL(projected)}*`,
    `📊 Realizado vs previsto: *${(expected > 0 ? (received / expected) * 100 : 0).toFixed(1)}%*`,
  ].join("\n");
}

async function novosContratos(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const newLoans = snap.loans.filter((l) => l.start_date >= start && l.start_date <= end);
  const totalLent = newLoans.reduce((s, l) => s + num(l.amount), 0);
  const avgRate = newLoans.length > 0 ? newLoans.reduce((s, l) => s + num(l.interest_rate), 0) / newLoans.length : 0;
  const avgTerm = newLoans.length > 0 ? newLoans.reduce((s, l) => s + (num(l.installments) || 1), 0) / newLoans.length : 0;
  const existingNames = new Set(snap.loans.filter((l) => l.start_date < start).map((l) => l.borrower_name));
  const newClients = new Set(newLoans.filter((l) => !existingNames.has(l.borrower_name)).map((l) => l.borrower_name));
  const lines = [
    `🆕 *Novos Contratos — ${prefix.split("-").reverse().join("/")}*`,
    "",
    `📑 Contratos: *${newLoans.length}*`,
    `📤 Volume emprestado: *${fmtBRL(totalLent)}*`,
    `📈 Taxa média: *${avgRate.toFixed(2)}%*`,
    `📅 Prazo médio: *${avgTerm.toFixed(1)} parcelas*`,
    `👥 Clientes novos: *${newClients.size}* / recorrentes: *${newLoans.length - newClients.size}*`,
  ];
  if (newLoans.length > 0) {
    lines.push("", "*Contratos:*");
    for (const l of newLoans) lines.push(`• ${l.borrower_name || "—"} — ${fmtBRL(num(l.amount))} (${num(l.installments) || 1}x)`);
  }
  return lines.join("\n");
}

async function cobrancaHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const overdueRows = [...overdue.entries()].map(([loanId, item]) => {
    const loan = snap.loans.find((l) => l.id === loanId);
    return { name: loan?.borrower_name || "—", days: daysBetween(item.oldest, ctx.today), value: item.value };
  }).sort((a, b) => b.days - a.days);
  const dueToday = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments).filter((e) => e.due_date === ctx.today && !e.paid).map((e) => ({ name: loan.borrower_name || "—", value: e.amount })));
  const totalOverdue = overdueRows.reduce((s, r) => s + r.value, 0);
  const totalToday = dueToday.reduce((s, r) => s + r.value, 0);
  const lines = [
    `📞 *Cobrança de hoje* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `🚨 Em atraso: *${overdueRows.length}* — ${fmtBRL(totalOverdue)}`,
    `📆 Vencem hoje: *${dueToday.length}* — ${fmtBRL(totalToday)}`,
  ];
  if (overdueRows.length > 0) {
    lines.push("", "*Em atraso (prioridade):*");
    for (const r of overdueRows) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}${phoneByName(snap, r.name)}`);
  }
  if (dueToday.length > 0) {
    lines.push("", "*Vencem hoje:*");
    for (const r of dueToday) lines.push(`• ${r.name} — ${fmtBRL(r.value)}${phoneByName(snap, r.name)}`);
  }
  if (overdueRows.length === 0 && dueToday.length === 0) lines.push("", "_Nada para cobrar hoje. 🎉_");
  return lines.join("\n");
}

async function historicoCliente(ctx: Ctx, snap: Snapshot, query: string): Promise<string> {
  if (!query) return "Use: `/historico_cliente <nome do cliente>`";
  const q = query.toLowerCase();
  const matches = snap.loans.filter((l) => (l.borrower_name || "").toLowerCase().includes(q));
  const names = [...new Set(matches.map((l) => l.borrower_name))];
  if (names.length === 0) return `Nenhum cliente encontrado para *${query}*.`;
  if (names.length > 1) return ["Vários clientes encontrados:", "", ...names.map((n) => `• ${n}`), "", "Refine o nome."].join("\n");
  const name = names[0];
  const loans = matches;
  const overdue = getOverdueByLoan(ctx, snap);
  const totalLent = loans.reduce((s, l) => s + num(l.amount), 0);
  const totalDue = loans.reduce((s, l) => s + totalWithInterest(l), 0);
  const paid = snap.payments.filter((p) => loans.some((l) => l.id === p.loan_id)).reduce((s, p) => s + num(p.amount), 0);
  const overdueValue = loans.reduce((s, l) => s + (overdue.get(l.id)?.value ?? 0), 0);
  const active = loans.filter((l) => l.status !== "paid").length;
  const paidOff = loans.filter((l) => l.status === "paid").length;
  const lines = [
    `👤 *${name}*${phoneByName(snap, name)}`,
    "",
    `📑 Contratos: *${loans.length}* (ativos: ${active} | quitados: ${paidOff})`,
    `📤 Total emprestado: *${fmtBRL(totalLent)}*`,
    `📊 Total a receber (com juros): *${fmtBRL(totalDue)}*`,
    `💰 Total pago: *${fmtBRL(paid)}*`,
    `🚨 Valor em atraso: *${fmtBRL(overdueValue)}*`,
    "",
    "*Contratos:*",
  ];
  for (const l of loans.sort((a, b) => String(b.due_date).localeCompare(String(a.due_date)))) {
    const od = overdue.get(l.id);
    const tag = l.status === "paid" ? "✅ quitado" : od ? `🚨 ${daysBetween(od.oldest, ctx.today)}d atraso` : "⏳ em dia";
    const tagsArr = Array.isArray(l.tags) ? l.tags.filter(Boolean) : [];
    const tagsStr = tagsArr.length > 0 ? ` — 🏷️ ${tagsArr.join(", ")}` : "";
    const dueStr = l.due_date ? String(l.due_date).slice(0, 10).split("-").reverse().join("/") : "—";
    lines.push(`• venc. ${dueStr} — ${fmtBRL(num(l.amount))} (${num(l.installments) || 1}x) — ${tag}${tagsStr}`);
  }
  return lines.join("\n");
}

async function alertas(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const recentOverdue: { name: string; days: number; value: number }[] = [];
  for (const [loanId, item] of overdue) {
    const days = daysBetween(item.oldest, ctx.today);
    if (days <= 7) {
      const loan = snap.loans.find((l) => l.id === loanId);
      recentOverdue.push({ name: loan?.borrower_name || "—", days, value: item.value });
    }
  }
  const critical: { name: string; days: number; value: number }[] = [];
  for (const [loanId, item] of overdue) {
    const days = daysBetween(item.oldest, ctx.today);
    if (days > 60) {
      const loan = snap.loans.find((l) => l.id === loanId);
      critical.push({ name: loan?.borrower_name || "—", days, value: item.value });
    }
  }
  const exposureByClient = new Map<string, number>();
  for (const l of snap.active) {
    const n = l.borrower_name || "—";
    exposureByClient.set(n, (exposureByClient.get(n) ?? 0) + num(l.amount));
  }
  const totalActive = [...exposureByClient.values()].reduce((s, v) => s + v, 0);
  const concentration = [...exposureByClient.entries()]
    .map(([name, value]) => ({ name, value, pct: totalActive > 0 ? (value / totalActive) * 100 : 0 }))
    .filter((r) => r.pct >= 20)
    .sort((a, b) => b.pct - a.pct);

  const lines = ["⚠️ *Alertas de Risco*", ""];
  lines.push(`🆕 Atrasos novos (≤7d): *${recentOverdue.length}*`);
  for (const r of recentOverdue.slice(0, 10)) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}`);
  lines.push("", `🔥 Atrasos críticos (>60d): *${critical.length}*`);
  for (const r of critical.slice(0, 10)) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}`);
  lines.push("", `📊 Concentração de carteira (≥20%): *${concentration.length}*`);
  for (const r of concentration) lines.push(`• ${r.name} — ${r.pct.toFixed(1)}% (${fmtBRL(r.value)})`);
  if (recentOverdue.length === 0 && critical.length === 0 && concentration.length === 0) {
    lines.push("", "_Nenhum sinal de risco no momento. 🎉_");
  }
  return lines.join("\n");
}

async function runReportCommand(supabase: any, userId: string, command: string): Promise<string> {
  if (command === "relatorios") return renderMenu();
  const [base, ...rest] = command.split("|");
  const arg = rest.join("|");
  const ctx: Ctx = { supabase, userId, today: todayInTZ() };
  const snap = await snapshot(ctx);
  switch (base) {
    case "dashboard": return dashboard(ctx, snap);
    case "kpi_geral": return kpiGeral(ctx, snap);
    case "carteira_ativa": return carteiraAtiva(ctx, snap);
    
    case "emprestimos_atrasados": return emprestimosAtrasados(ctx, snap);
    case "vencimentos_hoje": return vencimentosHoje(ctx, snap);
    case "inadimplencia": return inadimplencia(ctx, snap);
    case "resumo_diario": return resumoDiario(ctx, snap);
    case "resumo_mensal": return resumoMensal(ctx, snap);
    case "top_clientes": return topClientes(ctx, snap);
    case "vencimentos_semana": return vencimentosSemana(ctx, snap);
    case "projecao_mes": return projecaoMes(ctx, snap);
    case "novos_contratos": return novosContratos(ctx, snap);
    
    case "historico_cliente": return historicoCliente(ctx, snap, arg);
    case "alertas": return alertas(ctx, snap);
    default: return renderMenu();
  }
}

// ============= FUNCTION BODY =============



const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

async function tgSend(token: string, chatId: number, text: string) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error(`[reports-poll] tgSend failed ${r.status}`, body);
      // Plain retry
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    }
  } catch (e) {
    console.error("[reports-poll] tgSend exception", e);
  }
}

async function saveIncomingMessage(supabase: any, update: any, bot: { id: string }) {
  const msg = update.message;
  if (!msg?.chat?.id) return;
  // Use the raw Telegram update_id directly. The previous "scoped" id
  // (botHash * 1e10 + update_id) overflowed the int4 column and the upsert
  // failed silently, breaking history and the /start link flow.
  await supabase.from("telegram_messages").upsert({
    update_id: update.update_id,
    chat_id: msg.chat.id,
    text: msg.text ?? msg.caption ?? null,
    raw_update: { ...update, _system_bot_id: bot.id },
    bot_id: bot.id,
    processed: true,
    processed_at: new Date().toISOString(),
  }, { onConflict: "update_id" }).then(() => null).catch((e: any) => {
    console.error("[reports-poll] saveIncomingMessage upsert failed", e);
  });
}

async function deleteWebhook(token: string) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    return await r.json().catch(() => ({}));
  } catch (e) {
    return { error: String(e) };
  }
}

async function generateChatLinkCode(chatId: number, kind: "expenses" | "reports", secret: string, now = Date.now()): Promise<string> {
  const bucket = Math.floor(now / (15 * 60 * 1000));
  const payload = `${kind}:${chatId}:${bucket}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const bytes = Array.from(new Uint8Array(signature.slice(0, 8)));
  const value = bytes.reduce((acc, byte) => acc * 256n + BigInt(byte), 0n);
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let n = value;
  let code = "";
  for (let i = 0; i < 6; i++) {
    code = alphabet[Number(n % BigInt(alphabet.length))] + code;
    n /= BigInt(alphabet.length);
  }
  return code;
}

async function processBot(
  supabase: any,
  bot: { id: string; token: string; bot_username: string | null; update_offset: number },
  budgetMs: number,
) {
  const startedAt = Date.now();
  let currentOffset = bot.update_offset || 0;
  let totalProcessed = 0;
  let recovered = false;

  while (true) {
    const remainingMs = budgetMs - (Date.now() - startedAt);
    if (remainingMs < MIN_REMAINING_MS) break;
    const timeout = Math.min(25, Math.max(1, Math.floor(remainingMs / 1000) - 5));
    if (timeout < 1) break;

    let r: Response;
    try {
      r = await fetch(`https://api.telegram.org/bot${bot.token}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset: currentOffset, timeout, allowed_updates: ["message"] }),
      });
    } catch (e) {
      console.error(`[reports-poll] getUpdates fetch error for bot=${bot.id}`, e);
      break;
    }

    const data = await r.json().catch(() => ({} as any));

    const is409 =
      r.status === 409 ||
      (data?.error_code === 409) ||
      (typeof data?.description === "string" && data.description.includes("terminated by other getUpdates"));

    if (!r.ok || data?.ok === false) {
      if (is409 && !recovered) {
        console.warn(`[reports-poll] bot=${bot.id} 409 — clearing webhook and retrying`);
        const rec = await deleteWebhook(bot.token);
        console.warn(`[reports-poll] deleteWebhook result bot=${bot.id}`, rec);
        recovered = true;
        continue;
      }
      if (is409) {
        console.warn(`[reports-poll] bot=${bot.id} 409 after recovery — skipping`);
        break;
      }
      // 401 unauthorized → token invalid; mark as such
      if (r.status === 401) {
        await supabase
          .from("system_telegram_bots")
          .update({ validation_status: "invalid", last_validated_at: new Date().toISOString() })
          .eq("id", bot.id);
      }
      console.error(`[reports-poll] bot=${bot.id} getUpdates failed`, r.status, data);
      break;
    }


    const updates = data.result ?? [];
    if (updates.length === 0) break; // long-poll returned empty → stop this bot for this run

    for (const u of updates) {
      const msg = u.message;
      if (!msg) continue;
      const chatId = msg.chat.id;
      const text = (msg.text ?? "").trim();
      await saveIncomingMessage(supabase, u, bot);

      const startMatch = text.match(/^\/start(?:@\w+)?\s+(\d{6})\s*$/);

      if (startMatch) {
        const code = startMatch[1];
        // Look up by code only — the app may have stored a different bot_id
        // (when multiple purpose=reports rows exist in system_telegram_bots).
        const { data: reportCodeRow, error: reportCodeErr } = await supabase
          .from("telegram_reports_link_codes")
          .select("id, user_id, expires_at, bot_id")
          .eq("code", code)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (reportCodeErr) {
          console.error(`[reports-poll] code lookup error`, reportCodeErr);
          await tgSend(bot.token, chatId, "❌ Erro ao validar o código. Tente novamente em instantes.");
          totalProcessed++;
          continue;
        }
        const codeRow = reportCodeRow;
        if (!codeRow) {
          await tgSend(bot.token, chatId, "❌ Código inválido ou expirado. Gere um novo no app.");
        } else if (new Date((codeRow as any).expires_at).getTime() < Date.now()) {
          await tgSend(bot.token, chatId, "⌛ Código expirado. Gere um novo no app.");
          await supabase.from("telegram_reports_link_codes").delete().eq("id", (codeRow as any).id);
        } else {
          const linkPayload = {
            user_id: (codeRow as any).user_id,
            chat_id: chatId,
            bot_id: bot.id,
            label: bot.bot_username ? `@${bot.bot_username}` : null,
          };
          const { error: deleteLinkErr } = await supabase.from("telegram_reports_links").delete()
            .or(`chat_id.eq.${chatId},user_id.eq.${(codeRow as any).user_id}`);
          if (deleteLinkErr) console.error("[reports-poll] reports link cleanup failed", deleteLinkErr);
          const { error: insertLinkErr } = await supabase.from("telegram_reports_links").insert(linkPayload);
          if (insertLinkErr) {
            console.error("[reports-poll] reports link insert failed", insertLinkErr);
            await tgSend(bot.token, chatId, "❌ Erro ao conectar o bot. Gere um novo código e tente novamente.");
          } else {
            await supabase.from("telegram_reports_link_codes").delete().eq("id", (codeRow as any).id);
            await tgSend(bot.token, chatId, "✅ *Bot de Relatórios conectado!*\n\nVocê receberá os relatórios nos horários configurados.");
          }
        }
      } else if (text === "/start" || text === "/help") {
        await tgSend(bot.token, chatId,
          "👋 Este é o *Bot de Relatórios*.\n\nAbra o app, gere o comando */start* em *Configurações → Bots do Telegram → Bot de Relatórios* e envie aqui para vincular.\n\nApós conectar, use /relatorios para ver os comandos disponíveis.");
      } else {
        const cmd = parseReportCommand(text);
        if (cmd) {
          // Prefer dedicated reports links; fall back to legacy telegram_links
          // (both expenses and reports bots historically shared that table).
          let userId: string | undefined;
          const { data: repLink } = await supabase
            .from("telegram_reports_links")
            .select("user_id")
            .eq("chat_id", chatId)
            .eq("bot_id", bot.id)
            .maybeSingle();
          userId = (repLink as any)?.user_id;
          if (!userId) {
            const { data: legacy } = await supabase
              .from("telegram_links")
              .select("user_id")
              .eq("chat_id", chatId)
              .eq("bot_id", bot.id)
              .maybeSingle();
            userId = (legacy as any)?.user_id;
          }
          if (!userId) {
            const { data: anyLegacy } = await supabase
              .from("telegram_links")
              .select("user_id")
              .eq("chat_id", chatId)
              .maybeSingle();
            userId = (anyLegacy as any)?.user_id;
          }
          if (!userId) {
            await tgSend(bot.token, chatId, "🔒 Este chat não está vinculado.\n\nAbra o app, gere o comando */start* em *Configurações → Bots do Telegram → Bot de Relatórios* e envie aqui para vincular.");
          } else {
            try {
              const { data: ownerId, error: ownerErr } = await supabase.rpc("get_data_owner_id", { _user_id: userId });
              if (ownerErr) console.error("[reports-poll] get_data_owner_id failed", ownerErr);
              const message = await runReportCommand(supabase, (ownerId as string) || userId, cmd);
              await tgSend(bot.token, chatId, message);
            } catch (e: any) {
              console.error(`[reports-poll] runReportCommand failed cmd=${cmd}`, e);
              await tgSend(bot.token, chatId, "❌ Falha ao gerar o relatório. Tente novamente em instantes.");
            }
          }
        }
      }


      totalProcessed++;
    }

    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    currentOffset = newOffset;
    await supabase
      .from("system_telegram_bots")
      .update({ update_offset: newOffset, last_polled_at: new Date().toISOString() })
      .eq("id", bot.id);
  }

  return totalProcessed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // AuthZ: only cron (x-cron-secret) or an admin JWT may drive polling.
  const gate = await requireCronOrAdmin(req);
  if (gate instanceof Response) return gate;


  const startTime = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const EXPENSES_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const REPORTS_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN_REPORTS") ?? "";
  const supabase = getExternalAdmin();

  // Concurrency guard: if another invocation logged a run < 15s ago and we're not
  // forced, skip silently to prevent overlapping getUpdates → 409 noise.
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force) {
    const { data: recent } = await supabase
      .from("telegram_job_logs")
      .select("created_at")
      .eq("job", "telegram-reports-poll")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastTs = recent?.[0]?.created_at ? new Date(recent[0].created_at as string).getTime() : 0;
    const sinceLastMs = Date.now() - lastTs;
    if (lastTs && sinceLastMs < 15_000) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "recent run in flight", sinceLastMs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Load all active GLOBAL reports bots (system-wide, shared by all accounts)
  const { data: bots, error } = await supabase
    .from("system_telegram_bots")
    .select("id, token, bot_username, update_offset, purpose, active")
    .eq("active", true)
    .eq("purpose", "reports");

  if (error) {
    console.error("[reports-poll] failed to list bots", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const list = ((bots ?? []) as any[]).filter((bot) => {
    if (EXPENSES_BOT_TOKEN && bot.token === EXPENSES_BOT_TOKEN) return false;
    return true;
  });
  if (list.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, bots: 0, note: "no active reports bots with reports token" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Split runtime budget across all bots so the function fits in Edge limits
  const perBotBudget = Math.max(8_000, Math.floor((MAX_RUNTIME_MS - 2_000) / list.length));
  let total = 0;
  const errors: { bot_id: string; error: string }[] = [];
  for (const b of list) {
    const remaining = MAX_RUNTIME_MS - (Date.now() - startTime);
    if (remaining < MIN_REMAINING_MS) break;
    const budget = Math.min(perBotBudget, remaining);
    try {
      total += await processBot(supabase, b, budget);
      await supabase.from("system_telegram_bots")
        .update({ last_success_at: new Date().toISOString(), last_error: null, last_error_at: null })
        .eq("id", b.id);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error(`[reports-poll] processBot failed for ${b.id}`, e);
      errors.push({ bot_id: b.id, error: msg });
      await supabase.from("system_telegram_bots")
        .update({ last_error: msg, last_error_at: new Date().toISOString() })
        .eq("id", b.id);
    }
  }

  const { error: logError } = await supabase.from("telegram_job_logs").insert({
    job: "telegram-reports-poll",
    ok: errors.length === 0,
    processed: total,
    duration_ms: Date.now() - startTime,
    error: errors.length ? errors.map((e) => `${e.bot_id}: ${e.error}`).join(" | ") : null,
    details: { bots: list.length, errors },
  });
  if (logError) console.error("[reports-poll] failed to write job log", logError);

  return new Response(JSON.stringify({ ok: errors.length === 0, processed: total, bots: list.length, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});