// Envia um relatório financeiro resumido pelo WhatsApp (Evolution API / WppConnect / Whatsmiau).
// Pensado para ser colado no Dashboard do Supabase EXTERNO ou nativo (Edge Functions → New).
// Body: { owner_id: string, phone?: string, report_type?: "daily"|"weekly"|"monthly"|"accountant", custom_text?: string, message?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TZ = "America/Sao_Paulo";

function todayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function addDays(s: string, n: number) {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtBRL(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBR(d: string) {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}
function normalizePhone(raw: string) {
  const v = (raw || "").replace(/\D/g, "");
  return v.startsWith("55") ? v : (v.length >= 10 ? "55" + v : v);
}

async function sendWhatsapp(
  baseUrl: string,
  instance: string,
  apiKey: string,
  phone: string,
  text: string,
  provider?: string,
) {
  const base = baseUrl.replace(/\/+$/, "");
  const inst = encodeURIComponent(instance.trim());
  const formattedPhone = normalizePhone(phone);

  if (provider === "wppconnect") {
    const url = `${base}/api/${inst}/send-message`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ phone: formattedPhone, message: text }),
    });
    return { ok: resp.ok, status: resp.status, body: await resp.text() };
  }

  // Evolution API / Whatsmiau / Padrão
  const url = `${base}/message/sendText/${inst}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { apikey: apiKey } : {}),
    },
    body: JSON.stringify({
      number: formattedPhone,
      text: text,
      textMessage: { text: text },
    }),
  });
  return { ok: resp.ok, status: resp.status, body: await resp.text() };
}

async function buildReport(admin: any, ownerId: string, type: string) {
  const today = todayStr();
  const monthStart = today.slice(0, 7) + "-01";
  const rangeStart =
    type === "daily" ? today :
    type === "weekly" ? addDays(today, -6) :
    monthStart;

  const [loansRes, paymentsRes, expensesRes, incomesRes] = await Promise.all([
    admin.from("loans").select("id,borrower_name,remaining_amount,due_date,status,paid_installments")
      .eq("user_id", ownerId).neq("status", "paid"),
    admin.from("payments").select("amount,date").eq("user_id", ownerId).gte("date", rangeStart),
    admin.from("expenses").select("amount,paid,due_date,description").eq("user_id", ownerId).gte("due_date", rangeStart),
    admin.from("incomes").select("amount,date,description").eq("user_id", ownerId).gte("date", rangeStart),
  ]);
  const loans = loansRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const expenses = expensesRes.data ?? [];
  const incomes = incomesRes.data ?? [];

  const received = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const expTotal = expenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const expPaid = expenses.filter((e: any) => e.paid).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const expPend = expTotal - expPaid;
  const incomesTotal = incomes.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

  const overdue = loans.filter((l: any) => l.due_date && l.due_date < today);
  const toReceive = loans.reduce((s: number, l: any) => s + Number(l.remaining_amount || 0), 0);

  const label =
    type === "daily" ? `Relatório de hoje (${fmtBR(today)})` :
    type === "weekly" ? `Relatório dos últimos 7 dias (${fmtBR(rangeStart)} a ${fmtBR(today)})` :
    type === "accountant" ? `Relatório contábil — mês ${today.slice(0, 7)}` :
    `Relatório do mês ${today.slice(0, 7)}`;

  const lines = [
    `📊 *${label}*`,
    ``,
    `💰 Recebido: ${fmtBRL(received)}`,
    `💵 Outras receitas: ${fmtBRL(incomesTotal)}`,
    `🧾 Despesas: ${fmtBRL(expTotal)} (pagas ${fmtBRL(expPaid)} / pendentes ${fmtBRL(expPend)})`,
    `📈 Resultado: ${fmtBRL(received + incomesTotal - expPaid)}`,
    ``,
    `📌 Contratos ativos: ${(loans ?? []).length}`,
    `⏳ Total a receber: ${fmtBRL(toReceive)}`,
    `🔴 Vencidos: ${overdue.length}`,
  ];
  if (overdue.length) {
    lines.push("", "*Top vencidos:*");
    for (const o of overdue.slice(0, 5)) {
      lines.push(`• ${o.borrower_name} — ${fmtBRL(o.remaining_amount)} (venc. ${fmtBR(o.due_date)})`);
    }
  }
  return lines.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL =
      Deno.env.get("EXTERNAL_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL") ||
      "";
    const SERVICE_KEY =
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "";

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(
        JSON.stringify({ error: "Credenciais do Supabase não configuradas no ambiente da Edge Function." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const ownerId: string = body.owner_id;
    const reportType: string = body.report_type ?? "daily";
    if (!ownerId) {
      return new Response(JSON.stringify({ error: "owner_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Telefone destino: body.phone > whatsapp_assistant_authorized > profiles.phone
    let phone: string = body.phone ?? "";
    if (!phone) {
      const { data: auth } = await admin
        .from("whatsapp_assistant_authorized")
        .select("phone").eq("owner_id", ownerId).eq("enabled", true).limit(1).maybeSingle();
      phone = auth?.phone ?? "";
    }
    if (!phone) {
      const { data: prof } = await admin
        .from("profiles").select("phone").eq("user_id", ownerId).maybeSingle();
      phone = prof?.phone ?? "";
    }
    if (!phone) {
      return new Response(JSON.stringify({ error: "no_phone_configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let baseUrl = body.whatsapp_config?.base_url?.trim() || "";
    let instanceId = body.whatsapp_config?.instance_id?.trim() || "";
    let apiKey = body.whatsapp_config?.api_key || "";
    let provider = body.whatsapp_config?.provider || "evolution";

    if (!baseUrl || !instanceId) {
      const { data: sched } = await admin
        .from("whatsapp_billing_schedule")
        .select("base_url, instance_id, api_key, provider")
        .eq("owner_id", ownerId)
        .maybeSingle();

      if (sched?.base_url && sched?.instance_id) {
        baseUrl = sched.base_url.trim();
        instanceId = sched.instance_id.trim();
        apiKey = sched.api_key || apiKey;
        provider = sched.provider || provider;
      }
    }

    if (!baseUrl || !instanceId) {
      const { data: allSchedRows } = await admin
        .from("whatsapp_billing_schedule")
        .select("base_url, instance_id, api_key, provider")
        .limit(10);
      const found = allSchedRows?.find((r: any) => Boolean(r.base_url?.trim() && r.instance_id?.trim()));
      if (found) {
        baseUrl = found.base_url.trim();
        instanceId = found.instance_id.trim();
        apiKey = found.api_key || apiKey;
        provider = found.provider || provider;
      }
    }

    if (!baseUrl || !instanceId) {
      return new Response(JSON.stringify({ ok: false, error: "whatsapp_not_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!apiKey) {
      apiKey = Deno.env.get("EVOLUTION_API_KEY") || Deno.env.get("WHATSMIAU_API_KEY") || "";
    }

    const text = body.custom_text || body.message || await buildReport(admin, ownerId, reportType);
    const sent = await sendWhatsapp(
      baseUrl,
      instanceId,
      apiKey,
      phone,
      text,
      provider,
    );

    if (!sent.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Falha na API do WhatsApp (HTTP ${sent.status}): ${sent.body || "Sem detalhes"}`,
          status: sent.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true, status: sent.status, preview: text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[send-whatsapp-report]", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

