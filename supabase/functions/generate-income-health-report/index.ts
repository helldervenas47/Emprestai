// v2 - direct Gemini API
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
}

interface Metrics {
  score: number;
  improvementPct: number;
  monthsCovered: number;
  expenseDelta: number;
  piggyBalance: number;
  current: { income: number; expense: number; pendingExpense: number };
  previous?: { income: number; expense: number; pendingExpense: number };
  radar: { axis: string; value: number }[];
  categories: { name: string; value: number }[];
  monthKey: string;
  monthLabel?: string;
  periodStart?: string;
  periodEnd?: string;
}

function normalizeMetrics(raw: any): Metrics {
  const m = (raw && typeof raw === "object") ? raw : {};
  const current = (m.current && typeof m.current === "object") ? m.current : {};
  const previous = (m.previous && typeof m.previous === "object") ? m.previous : undefined;
  return {
    score: Number(m.score) || 0,
    improvementPct: Number(m.improvementPct) || 0,
    monthsCovered: Number(m.monthsCovered) || 0,
    expenseDelta: Number(m.expenseDelta) || 0,
    piggyBalance: Number(m.piggyBalance) || 0,
    current: {
      income: Number(current.income) || 0,
      expense: Number(current.expense) || 0,
      pendingExpense: Number(current.pendingExpense) || 0,
    },
    previous: previous
      ? {
          income: Number(previous.income) || 0,
          expense: Number(previous.expense) || 0,
          pendingExpense: Number(previous.pendingExpense) || 0,
        }
      : undefined,
    radar: Array.isArray(m.radar)
      ? m.radar.filter((r: any) => r && typeof r === "object").map((r: any) => ({ axis: String(r.axis ?? ""), value: Number(r.value) || 0 }))
      : [],
    categories: Array.isArray(m.categories)
      ? m.categories.filter((c: any) => c && typeof c === "object").map((c: any) => ({ name: String(c.name ?? ""), value: Number(c.value) || 0 }))
      : [],
    monthKey: String(m.monthKey ?? ""),
    monthLabel: m.monthLabel ? String(m.monthLabel) : undefined,
    periodStart: m.periodStart ? String(m.periodStart) : undefined,
    periodEnd: m.periodEnd ? String(m.periodEnd) : undefined,
  };
}

function buildPrompt(m: Metrics): string {
  const lines: string[] = [];
  const balance = m.current.income - m.current.expense;
  const label = m.monthLabel || m.monthKey || "mês atual";
  lines.push(`MÊS DE REFERÊNCIA: ${label}${m.monthKey ? ` (${m.monthKey})` : ""}`);
  if (m.periodStart && m.periodEnd) {
    lines.push(`PERÍODO CONSIDERADO: ${m.periodStart} a ${m.periodEnd}`);
  }
  lines.push(`Score de saúde financeira: ${m.score}/100 (variação vs mês anterior: ${m.improvementPct >= 0 ? "+" : ""}${m.improvementPct}%)`);
  lines.push("");
  lines.push(`>>> TODOS os valores abaixo são EXCLUSIVAMENTE do mês ${label}. NÃO some, NÃO some com outros meses, NÃO invente outros totais. <<<`);
  lines.push("");
  lines.push(`Receitas recebidas no mês: ${fmt(m.current.income)}`);
  lines.push(`Despesas pessoais pagas no mês: ${fmt(m.current.expense)}`);
  lines.push(`Despesas pessoais pendentes (com vencimento no mês): ${fmt(m.current.pendingExpense)}`);
  lines.push(`Lucro/Prejuízo do mês (receitas - despesas pagas): ${fmt(balance)}`);
  lines.push("");
  if (m.previous) {
    const prevBalance = m.previous.income - m.previous.expense;
    lines.push("Comparativo com o mês anterior (apenas referência, NÃO é o mês atual):");
    lines.push(`- Receitas mês anterior: ${fmt(m.previous.income)}`);
    lines.push(`- Despesas pagas mês anterior: ${fmt(m.previous.expense)}`);
    lines.push(`- Saldo mês anterior: ${fmt(prevBalance)}`);
    lines.push(`- Variação de despesa: ${m.expenseDelta >= 0 ? "+" : ""}${m.expenseDelta}%`);
    lines.push("");
  }
  lines.push(`Reserva acumulada (cofrinhos, saldo total): ${fmt(m.piggyBalance)} — cobre ${m.monthsCovered.toFixed(1)} meses de despesa média`);
  if (m.radar.length > 0) {
    lines.push("");
    lines.push("Componentes do score (0-100):");
    for (const r of m.radar) lines.push(`- ${r.axis}: ${r.value}`);
  }
  if (m.categories.length > 0) {
    lines.push("");
    lines.push(`Top categorias de despesa pessoal NO MÊS de ${label}:`);
    for (const c of m.categories) lines.push(`- ${c.name}: ${fmt(c.value)}`);
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `Você é um consultor financeiro pessoal especializado em fluxo de receitas e saúde financeira. Recebe um diagnóstico de UM ÚNICO MÊS com score, receitas, despesas, reserva e componentes (controle, reserva, dívidas, investimentos, estabilidade).

REGRAS CRÍTICAS DE DADOS (não negocie):
1. Use SOMENTE os valores literais fornecidos no input. Nunca invente, estime ou some números.
2. Todos os totais de receitas/despesas/saldo se referem APENAS ao mês de referência informado. Não cite valores de outros períodos como se fossem do mês atual.
3. Sempre cite o mês de referência ao mencionar valores (ex.: "em ${"$"}{mês}, suas despesas foram R$ X").
4. Se o usuário tiver despesas pendentes, mantenha-as separadas das pagas — não some os dois ao falar do "valor gasto no mês".
5. A reserva (cofrinhos) é um saldo acumulado total, não confunda com fluxo do mês.

Responda em português do Brasil, em Markdown enxuto, sem títulos H1, com no máximo 320 palavras, organizada nestas seções (use exatamente esses títulos com ##):

## 📊 Diagnóstico
2-3 frases objetivas sobre o estado do MÊS DE REFERÊNCIA: receitas vs despesas pagas, lucro/prejuízo, score, tendência vs mês anterior. Cite o nome do mês.

## ⚠️ Pontos de atenção
Bullets curtos com componentes frágeis (score baixo) e riscos do mês (reserva insuficiente, despesas crescendo, pendências altas). Cite números literais do input.

## 💡 Como melhorar a saúde da aba Receitas
3-5 bullets PRÁTICOS e específicos baseados nos dados do mês: aumentar entradas, reduzir categorias que estão pesando NO MÊS, fortalecer reserva.

## ✅ Próximas ações desta semana
3-4 ações concretas no infinitivo (ex.: "Lançar receitas pendentes", "Definir meta de R$ X de reserva", "Cobrar clientes em atraso").

Tom equilibrado, profissional e acolhedor. Se receitas do mês = 0, oriente a cadastrar receitas primeiro.`;

async function callAI(userPrompt: string): Promise<string> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (response.status === 429) throw new Error("Limite de requisições atingido. Tente novamente em instantes.");
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${t}`);
  }
  const data = await response.json();
  return (data.choices?.[0]?.message?.content as string) || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as { metrics?: any };
    if (!body || typeof body !== "object" || !body.metrics) {
      return new Response(JSON.stringify({ error: "metrics ausente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const metrics = normalizeMetrics(body.metrics);
    const userPrompt = buildPrompt(metrics);
    const content = await callAI(userPrompt);
    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[generate-income-health-report]", e);
    return new Response(JSON.stringify({ error: e?.message || "erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
