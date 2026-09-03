import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_TZ = "America/Sao_Paulo";

function todayStr(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date());
}

function monthStr(): string {
  return todayStr().slice(0, 7);
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((da - db) / (1000 * 60 * 60 * 24));
}

function normalizePhone(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

function formatBRL(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBR(date: string): string {
  if (!date) return "";
  const d = date.length >= 10 ? date.substring(0, 10) : date;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

async function sendWhatsapp(baseUrl: string, instance: string, apiKey: string, phone: string, text: string) {
  const url = `${baseUrl.replace(/\/+$/, "")}/message/sendText/${instance}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: phone, text, textMessage: { text } }),
  });
  const body = await resp.text();
  return { ok: resp.ok, status: resp.status, body };
}

// Extract incoming message from various Evolution API webhook payload shapes
function extractMessage(payload: any): { phone: string; text: string; fromMe: boolean } | null {
  try {
    const data = payload?.data ?? payload;
    const key = data?.key ?? {};
    const fromMe = !!key.fromMe;
    const remoteJid: string = key.remoteJid ?? data?.remoteJid ?? "";
    if (!remoteJid) return null;
    if (remoteJid.includes("@g.us")) return null; // ignore groups
    const phone = remoteJid.split("@")[0];

    const m = data?.message ?? {};
    const text =
      m.conversation ??
      m.extendedTextMessage?.text ??
      m.imageMessage?.caption ??
      m.videoMessage?.caption ??
      data?.text ??
      "";
    if (!text || typeof text !== "string") return null;
    return { phone: normalizePhone(phone), text: text.trim(), fromMe };
  } catch {
    return null;
  }
}

async function buildContext(admin: any, ownerId: string) {
  const today = todayStr();
  const month = monthStr();
  const monthStart = `${month}-01`;

  const [{ data: loans }, { data: clients }, { data: payments }, { data: expenses }, { data: goals }] =
    await Promise.all([
      admin.from("loans").select("id,borrower_name,borrower_id,amount,remaining_amount,installments,paid_installments,due_date,status,start_date").eq("user_id", ownerId).neq("status", "paid"),
      admin.from("clients").select("id,name,phone,active").eq("user_id", ownerId).eq("active", true),
      admin.from("payments").select("amount,date,loan_id").eq("user_id", ownerId).gte("date", monthStart),
      admin.from("expenses").select("amount,description,category,due_date,paid,scope").eq("user_id", ownerId).gte("due_date", monthStart),
      admin.from("monthly_goals").select("goal_type,target_value,month").eq("user_id", ownerId).eq("month", month),
    ]);

  const loanIds = (loans ?? []).map((l: any) => l.id);
  const { data: installments } = loanIds.length
    ? await admin.from("loan_installments").select("loan_id,installment_number,due_date,amount").in("loan_id", loanIds)
    : { data: [] as any[] };

  const instByLoan = new Map<string, any[]>();
  for (const i of installments ?? []) {
    const arr = instByLoan.get(i.loan_id) ?? [];
    arr.push(i);
    instByLoan.set(i.loan_id, arr);
  }

  const clientById = new Map<string, any>((clients ?? []).map((c: any) => [c.id, c]));

  const overdue: any[] = [];
  const dueToday: any[] = [];
  const upcoming: any[] = [];
  let totalToReceive = 0;

  for (const l of loans ?? []) {
    const list = (instByLoan.get(l.id) ?? []).sort((a, b) => a.installment_number - b.installment_number);
    const next = list.find((s) => s.installment_number === (l.paid_installments ?? 0) + 1);
    const due = next?.due_date ?? l.due_date;
    const amount = Number(next?.amount ?? l.amount ?? 0);
    if (!due) continue;
    const d = diffDays(due, today);
    const client = l.borrower_id ? clientById.get(l.borrower_id) : null;
    const item = { name: client?.name ?? l.borrower_name, due: formatBR(due), amount, daysDiff: d };
    totalToReceive += Number(l.remaining_amount ?? 0);
    if (d < 0) overdue.push({ ...item, daysOverdue: Math.abs(d) });
    else if (d === 0) dueToday.push(item);
    else if (d <= 7) upcoming.push(item);
  }

  const receivedThisMonth = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const expensesThisMonth = (expenses ?? []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const expensesPaid = (expenses ?? []).filter((e: any) => e.paid).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const expensesPending = expensesThisMonth - expensesPaid;

  return {
    today: formatBR(today),
    month,
    summary: {
      totalActiveLoans: (loans ?? []).length,
      totalToReceive,
      receivedThisMonth,
      expensesThisMonth,
      expensesPaid,
      expensesPending,
      profitMonth: receivedThisMonth - expensesPaid,
    },
    goals: (goals ?? []).map((g: any) => ({ type: g.goal_type, target: Number(g.target_value) })),
    overdue: overdue.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 15),
    dueToday: dueToday.slice(0, 15),
    upcoming: upcoming.sort((a, b) => a.daysDiff - b.daysDiff).slice(0, 15),
  };
}

async function callAI(systemPrompt: string, userMessage: string, history: any[]): Promise<string> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 429) return "⚠️ Limite de requisições atingido. Tente novamente em alguns instantes.";
    if (resp.status === 402) return "⚠️ Créditos da IA esgotados. Adicione créditos no workspace.";
    console.error("AI error", resp.status, t);
    return "❌ Erro ao consultar a IA. Tente novamente.";
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "Sem resposta.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Health check (GET)
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, service: "whatsapp-assistant-webhook" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const API_KEY = Deno.env.get("WHATSMIAU_API_KEY") ?? "";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify webhook came from the WhatsApp provider via shared apikey header
    const providerKey =
      req.headers.get("apikey") ||
      req.headers.get("x-api-key") ||
      req.headers.get("x-webhook-secret") ||
      "";
    if (!API_KEY || providerKey !== API_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json().catch(() => ({}));
    const msg = extractMessage(payload);

    if (!msg || msg.fromMe || !msg.text) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: 60 mensagens/min por telefone
    {
      const { checkRateLimit, rateLimitResponse } = await import("../_shared/rate-limit.ts");
      const ok = await checkRateLimit({ bucket: "wa-webhook", key: msg.phone, max: 60, windowSecs: 60 });
      if (!ok) return rateLimitResponse(corsHeaders);
    }

    // Find owner authorized for this phone
    const candidates = [msg.phone];
    if (!msg.phone.startsWith("55")) candidates.push("55" + msg.phone);
    if (msg.phone.startsWith("55")) candidates.push(msg.phone.slice(2));

    const { data: auths } = await admin
      .from("whatsapp_assistant_authorized")
      .select("owner_id, phone, enabled")
      .in("phone", candidates);

    const auth = (auths ?? []).find((a: any) => a.enabled);
    if (!auth) {
      console.log("Phone not authorized:", msg.phone);
      return new Response(JSON.stringify({ ok: true, unauthorized: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerId = auth.owner_id;

    // Get instance config
    const { data: sched } = await admin
      .from("whatsapp_billing_schedule")
      .select("base_url, instance_id")
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (!sched?.base_url || !sched?.instance_id) {
      console.error("Missing whatsapp config for owner", ownerId);
      return new Response(JSON.stringify({ ok: false, error: "missing_config" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log incoming
    await admin.from("whatsapp_assistant_log").insert({
      owner_id: ownerId, phone: msg.phone, direction: "in", message: msg.text,
    });

    // Build context
    const ctx = await buildContext(admin, ownerId);

    // Recent history (last 8 turns) for memory
    const { data: recent } = await admin
      .from("whatsapp_assistant_log")
      .select("direction, message")
      .eq("owner_id", ownerId)
      .eq("phone", msg.phone)
      .order("created_at", { ascending: false })
      .limit(8);

    const history = (recent ?? [])
      .reverse()
      .slice(0, -1) // exclude the message we just inserted
      .map((m: any) => ({
        role: m.direction === "in" ? "user" : "assistant",
        content: m.message,
      }));

    const systemPrompt = `Você é um assistente financeiro pessoal via WhatsApp. Responda de forma curta, direta e amigável (português BR). Use emojis com moderação. Formate valores em R$. Use os DADOS REAIS abaixo para responder. Se a pergunta não tiver relação com finanças do usuário, responda educadamente mas redirecione.

DADOS DE HOJE (${ctx.today}) — mês ${ctx.month}:
• Contratos ativos: ${ctx.summary.totalActiveLoans}
• Total a receber: ${formatBRL(ctx.summary.totalToReceive)}
• Recebido no mês: ${formatBRL(ctx.summary.receivedThisMonth)}
• Despesas no mês: ${formatBRL(ctx.summary.expensesThisMonth)} (pagas: ${formatBRL(ctx.summary.expensesPaid)}, pendentes: ${formatBRL(ctx.summary.expensesPending)})
• Lucro do mês (recebido - despesas pagas): ${formatBRL(ctx.summary.profitMonth)}
${ctx.goals.length ? `• Metas do mês: ${ctx.goals.map((g: any) => `${g.type}=${formatBRL(g.target)}`).join(", ")}` : ""}

CONTRATOS VENCIDOS (${ctx.overdue.length}):
${ctx.overdue.map((o) => `- ${o.name}: ${formatBRL(o.amount)} venceu em ${o.due} (${o.daysOverdue}d atraso)`).join("\n") || "Nenhum"}

VENCEM HOJE (${ctx.dueToday.length}):
${ctx.dueToday.map((o) => `- ${o.name}: ${formatBRL(o.amount)}`).join("\n") || "Nenhum"}

PRÓXIMOS 7 DIAS (${ctx.upcoming.length}):
${ctx.upcoming.map((o) => `- ${o.name}: ${formatBRL(o.amount)} em ${o.due}`).join("\n") || "Nenhum"}

Responda de forma concisa (máx ~6 linhas no WhatsApp). Não invente dados.`;

    const reply = await callAI(systemPrompt, msg.text, history);

    // Send reply
    const sent = await sendWhatsapp(sched.base_url, sched.instance_id, API_KEY, msg.phone, reply);

    // Log outgoing
    await admin.from("whatsapp_assistant_log").insert({
      owner_id: ownerId, phone: msg.phone, direction: "out", message: reply,
      metadata: { http_status: sent.status, ok: sent.ok },
    });

    return new Response(JSON.stringify({ ok: true, replied: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[whatsapp-assistant-webhook] error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
