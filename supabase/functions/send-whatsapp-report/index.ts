// Envia um relatório financeiro resumido pelo WhatsApp (Evolution API / WppConnect / Whatsmiau).
import { getExternalAdmin } from "../_shared/external-supabase.ts";

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
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
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
    const admin = getExternalAdmin();

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

    let baseUrl = "";
    let instanceId = "";
    let apiKey = "";
    let provider = "evolution";

    // 1. Prioriza configuração passada no body (se preenchida)
    if (body.whatsapp_config?.base_url?.trim() && body.whatsapp_config?.instance_id?.trim()) {
      baseUrl = body.whatsapp_config.base_url.trim();
      instanceId = body.whatsapp_config.instance_id.trim();
      apiKey = body.whatsapp_config.api_key || "";
      provider = body.whatsapp_config.provider || "evolution";
    }

    // 2. Busca por owner_id na tabela whatsapp_billing_schedule (preenche apiKey ou baseUrl/instanceId)
    if (!baseUrl || !instanceId || !apiKey) {
      const { data: directSched } = await admin
        .from("whatsapp_billing_schedule")
        .select("*")
        .eq("owner_id", ownerId)
        .maybeSingle();

      if (directSched) {
        if (!baseUrl && directSched.base_url?.trim()) baseUrl = directSched.base_url.trim();
        if (!instanceId && directSched.instance_id?.trim()) instanceId = directSched.instance_id.trim();
        if (!apiKey && directSched.api_key) apiKey = directSched.api_key;
        if (directSched.provider) provider = directSched.provider;
      }
    }

    // 3. Fallback: busca qualquer registro com credenciais válidas na tabela whatsapp_billing_schedule
    if (!baseUrl || !instanceId || !apiKey) {
      const { data: allSchedRows } = await admin
        .from("whatsapp_billing_schedule")
        .select("*")
        .not("base_url", "is", null)
        .neq("base_url", "")
        .limit(10);

      const found = (allSchedRows || []).find(
        (r: any) => Boolean(r.base_url?.trim() && r.instance_id?.trim())
      );
      if (found) {
        if (!baseUrl) baseUrl = found.base_url.trim();
        if (!instanceId) instanceId = found.instance_id.trim();
        if (!apiKey && found.api_key) apiKey = found.api_key;
        if (found.provider) provider = found.provider;
      }
    }

    // 4. Fallback: variáveis de ambiente globais (caso configuradas em Secrets)
    if (!baseUrl || !instanceId) {
      const envUrl = Deno.env.get("EVOLUTION_BASE_URL") || Deno.env.get("WHATSMIAU_BASE_URL") || "";
      const envInst = Deno.env.get("EVOLUTION_INSTANCE") || Deno.env.get("WHATSMIAU_INSTANCE_ID") || "";
      if (envUrl && envInst) {
        baseUrl = envUrl.trim();
        instanceId = envInst.trim();
      }
    }

    if (!baseUrl || !instanceId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "whatsapp_not_configured",
          message: "Nenhuma URL ou Instância de WhatsApp encontrada em whatsapp_billing_schedule.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!apiKey) {
      apiKey = Deno.env.get("EVOLUTION_API_KEY") || Deno.env.get("WHATSMIAU_API_KEY") || "";
    }

    if (!apiKey) {
      try {
        const { data: cfgKey } = await admin
          .from("app_internal_config")
          .select("value")
          .in("key", ["evolution_api_key", "whatsapp_api_key", "whatsmiau_api_key"])
          .limit(1)
          .maybeSingle();
        if (cfgKey?.value) apiKey = String(cfgKey.value);
      } catch (_) {}
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

