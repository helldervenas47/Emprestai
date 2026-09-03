import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getExternalAdmin, getExternalUserClient } from "../_shared/external-supabase.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface CategoryStat {
  category: string;
  spent: number;       // total previsto no mês (pagos + a pagar)
  paid: number;        // efetivamente pago no mês
  pending: number;     // ainda a pagar (não vencido)
  overdue: number;     // vencido e não pago
  budget: number;      // orçamento do mês (0 quando não há)
  pct: number;         // % somente quando budget > 0
  status: "ok" | "warning" | "exceeded" | "no_budget";
  trend?: "up" | "down" | "stable";
  prevSpent?: number;
}

async function buildContext(supabase: any, ownerId: string, month: string) {
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const monthEndDate = new Date(y, m, 0);
  const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;
  const todayStr = new Date().toISOString().slice(0, 10);

  const prevD = new Date(y, m - 2, 1);
  const prevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
  const prevStart = `${prevMonth}-01`;
  const prevEndDate = new Date(prevD.getFullYear(), prevD.getMonth() + 1, 0);
  const prevEnd = `${prevEndDate.getFullYear()}-${String(prevEndDate.getMonth() + 1).padStart(2, "0")}-${String(prevEndDate.getDate()).padStart(2, "0")}`;

  // Orçamentos: usar EXCLUSIVAMENTE os do mês analisado. Não fazer fallback
  // para meses anteriores/posteriores — isso causava percentuais absurdos
  // (ex.: 642%) ao comparar despesas do mês atual com um orçamento antigo.
  const { data: monthBudgets } = await supabase
    .from("personal_budgets")
    .select("category, amount, month")
    .eq("user_id", ownerId)
    .eq("month", month);

  const budgets: { category: string; amount: number }[] = (monthBudgets || [])
    .map((b: any) => ({ category: b.category, amount: Number(b.amount) || 0 }))
    .filter((b: any) => b.amount > 0);

  // Despesas do mês (pagas e não pagas) para calcular previsto/pago/pendente/vencido.
  const { data: expenses } = await supabase
    .from("expenses")
    .select("category, amount, type, installments, due_date, paid, paid_date")
    .eq("user_id", ownerId)
    .eq("scope", "personal")
    .gte("due_date", monthStart)
    .lte("due_date", monthEnd);

  const { data: prevExpenses } = await supabase
    .from("expenses")
    .select("category, amount, type, installments, due_date")
    .eq("user_id", ownerId)
    .eq("scope", "personal")
    .gte("due_date", prevStart)
    .lte("due_date", prevEnd);

  const instAmount = (e: any) => {
    const isRec = e.type === "recorrente" && e.installments && Number(e.installments) > 1;
    return isRec ? Number(e.amount) / Number(e.installments) : Number(e.amount);
  };

  type Bucket = { total: number; paid: number; pending: number; overdue: number };
  const bucketByCategory = new Map<string, Bucket>();
  for (const e of expenses || []) {
    const amt = instAmount(e);
    const cat = e.category as string;
    const b = bucketByCategory.get(cat) || { total: 0, paid: 0, pending: 0, overdue: 0 };
    b.total += amt;
    if (e.paid) b.paid += amt;
    else if (e.due_date < todayStr) b.overdue += amt;
    else b.pending += amt;
    bucketByCategory.set(cat, b);
  }

  const prevSpentByCat = new Map<string, number>();
  for (const e of prevExpenses || []) {
    prevSpentByCat.set(e.category, (prevSpentByCat.get(e.category) || 0) + instAmount(e));
  }

  const categoriesSet = new Set<string>([
    ...budgets.map((b) => b.category),
    ...bucketByCategory.keys(),
  ]);

  const stats: CategoryStat[] = [];
  for (const cat of categoriesSet) {
    const budget = budgets.find((b) => b.category === cat)?.amount ?? 0;
    const bucket = bucketByCategory.get(cat) || { total: 0, paid: 0, pending: 0, overdue: 0 };
    const sp = bucket.total;
    const ps = prevSpentByCat.get(cat) || 0;
    const pct = budget > 0 ? (sp / budget) * 100 : 0;
    let status: CategoryStat["status"] = "ok";
    if (budget <= 0) status = "no_budget";
    else if (pct > 100) status = "exceeded";
    else if (pct >= 80) status = "warning";

    let trend: "up" | "down" | "stable" = "stable";
    if (ps > 0) {
      const change = (sp - ps) / ps;
      if (change > 0.15) trend = "up";
      else if (change < -0.15) trend = "down";
    } else if (sp > 0) trend = "up";

    stats.push({
      category: cat,
      spent: sp,
      paid: bucket.paid,
      pending: bucket.pending,
      overdue: bucket.overdue,
      budget,
      pct,
      status,
      trend,
      prevSpent: ps,
    });
  }

  stats.sort((a, b) => b.spent - a.spent);

  const totalSpent = stats.reduce((s, x) => s + x.spent, 0);
  const totalPaid = stats.reduce((s, x) => s + x.paid, 0);
  const totalPending = stats.reduce((s, x) => s + x.pending, 0);
  const totalOverdue = stats.reduce((s, x) => s + x.overdue, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const hasAnyBudget = totalBudget > 0;

  return { stats, totalSpent, totalPaid, totalPending, totalOverdue, totalBudget, hasAnyBudget, month, prevMonth };
}

function buildPrompt(ctx: any) {
  const lines: string[] = [];
  lines.push(`Mês de referência: ${ctx.month}`);
  lines.push(`Total previsto no mês (pagos + a pagar): ${fmt(ctx.totalSpent)}`);
  lines.push(`Total pago: ${fmt(ctx.totalPaid)} | Total pendente: ${fmt(ctx.totalPending)} | Total vencido: ${fmt(ctx.totalOverdue)}`);
  lines.push(
    ctx.hasAnyBudget
      ? `Orçamento mensal cadastrado: ${fmt(ctx.totalBudget)}`
      : `Orçamento mensal: NÃO cadastrado (não calcule percentuais de orçamento)`,
  );
  lines.push("");
  lines.push("Categorias (previsto | pago | pendente | vencido | orçamento | tendência vs mês anterior):");
  for (const s of ctx.stats) {
    const trendLabel = s.trend === "up" ? "↑ alta" : s.trend === "down" ? "↓ queda" : "→ estável";
    const budgetTxt = s.budget > 0
      ? `orçamento ${fmt(s.budget)} (${s.pct.toFixed(0)}%)`
      : `sem orçamento cadastrado`;
    lines.push(
      `- ${s.category}: previsto ${fmt(s.spent)} | pago ${fmt(s.paid)} | pendente ${fmt(s.pending)} | vencido ${fmt(s.overdue)} | ${budgetTxt} | ${trendLabel} (anterior: ${fmt(s.prevSpent || 0)})`,
    );
  }
  return lines.join("\n");
}


async function callAI(systemPrompt: string, userPrompt: string) {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured.");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User Data:\n${userPrompt}` },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Gemini API error ${response.status}:`, errorText);
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content as string;
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  balanced: "Tom equilibrado, profissional e acolhedor. Claro, direto e empático, sem alarmismo.",
  strict: "Tom firme e objetivo, focado em disciplina financeira. NUNCA use termos alarmistas como 'crítico', 'monumental', 'descontrolado', 'inaceitável'. Aponte apenas o que os números mostram.",
  motivational: "Tom encorajador. Celebre o que estiver dentro do orçamento e proponha próximos passos. Sem exageros.",
  technical: "Tom técnico e analítico. Use somente os números fornecidos (variação MoM, share da carteira). Mínimo de emojis.",
  friendly: "Tom amigável e conversacional, sem jargão e sem exageros.",
};

const HARD_RULES = `
REGRAS OBRIGATÓRIAS (nunca quebrar):
1. Use APENAS os números fornecidos em "User Data". Nunca invente valores, categorias ou percentuais.
2. Percentual do orçamento (%) só pode ser citado quando a categoria tem "orçamento" > 0 nos dados. Se estiver "sem orçamento cadastrado", NÃO cite %, apenas o valor gasto.
3. Não use termos alarmistas: "crítico", "descontrolado", "monumental", "inaceitável", "situação crítica", "estouro monumental", "gastos descontrolados". Prefira: "acima do orçamento", "atenção", "acompanhar".
4. Só chame de "estouro" ou "acima do orçamento" quando % > 100 e o orçamento existir. Só chame de "atenção" entre 80% e 100%.
5. Diferencie sempre "previsto", "pago", "pendente" e "vencido" quando relevante.
6. Recomendações devem ser prudentes e ancoradas nas maiores categorias reais. Nada de sugestões genéricas ("cancele assinaturas") sem base nos dados.
7. Se não há orçamento nenhum cadastrado, informe isso explicitamente e não emita julgamento de estouro.
8. Tom profissional. Sem drama.
`;

function buildSystemPrompt(tone: string): string {
  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? TONE_INSTRUCTIONS.balanced;
  return `Você é um consultor financeiro pessoal. Analisa um resumo mensal real de despesas por categoria, com orçamentos (quando cadastrados) e tendência vs. o mês anterior.

TOM DE VOZ: ${toneInstruction}
${HARD_RULES}

Formato da resposta (Português do Brasil, Markdown enxuto, sem H1, máximo 280 palavras, use exatamente esses títulos com ##):

## 📊 Visão geral
1-2 frases objetivas. Cite total previsto, pago e pendente do mês. Se houver orçamento total, cite o % consumido; caso contrário, apenas informe que não há orçamento cadastrado.

## ⚠️ Pontos de atenção
Bullets APENAS para categorias com orçamento cadastrado e uso ≥ 80%. Para cada uma: **categoria**, valor previsto, % do orçamento. Se nenhuma se qualifica, escreva "Nenhuma categoria acima de 80% do orçamento neste mês.". Nunca invente %.

## 💡 Oportunidades de redução
2-3 bullets práticos baseados nas MAIORES categorias por valor real. Se a categoria não tem orçamento, sugira definir um limite. Nada genérico.

## ✅ Próximas ações
2-3 ações concretas e prudentes ancoradas nos dados (ex.: "Definir orçamento para X", "Quitar despesa vencida Y"). Verbos no infinitivo.`;
}

function buildCategorySystemPrompt(tone: string, category: string): string {
  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? TONE_INSTRUCTIONS.balanced;
  return `Você é um consultor financeiro pessoal analisando UMA categoria: **${category}**.

TOM DE VOZ: ${toneInstruction}
${HARD_RULES}

Formato (Português do Brasil, Markdown enxuto, máximo 220 palavras, sem H1, use estas seções com ##):

## 📊 Análise da categoria
Diagnóstico com os números reais de **${category}**: previsto, pago, pendente e vencido. Se houver orçamento cadastrado, cite o % consumido; se não houver, diga "sem orçamento cadastrado" e não invente %.

## 🚨 Pontos de atenção
Bullets somente quando houver base numérica (ex.: uso ≥ 80% do orçamento, vencidos > 0, alta ≥ 15% vs mês anterior). Caso contrário: "Sem pontos de atenção com base nos dados.".

## 💰 Sugestões de redução
2-4 bullets específicos para **${category}**, com estimativas somente quando derivadas dos números fornecidos.

## 🎯 Recomendações de controle
2-3 ações concretas (ex.: definir orçamento, revisar recorrências). Nada genérico.`;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = getExternalAdmin();

    let ownerId: string | null = null;
    let force = false;
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    
    if (token) {
      // Validate token against the EXTERNAL Supabase where users are actually authenticated
      const userClient = getExternalUserClient();
      const { data: userData } = await userClient.auth.getUser(token);
      if (userData?.user) {
        const { data: ownerRow } = await supabase
          .from("user_owner")
          .select("owner_id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        ownerId = (ownerRow as any)?.owner_id || userData.user.id;
      }
    }
    if (!ownerId && body.user_id) {
      ownerId = body.user_id;
    }

    if (!ownerId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    force = !!body.force;
    const month = body.month || currentMonth();
    const targetCategory: string | undefined = body.category;

    // Per-category mode: ad-hoc, not cached
    if (targetCategory) {
      const ctx = await buildContext(supabase, ownerId, month);
      const stat = ctx.stats.find((s: CategoryStat) => s.category === targetCategory);
      if (!stat || (stat.spent === 0 && stat.budget === 0)) {
        return new Response(JSON.stringify({
          content: `## 📊 Análise da categoria\n\nAinda não há dados suficientes em **${targetCategory}** neste mês para uma análise detalhada.`,
          category: targetCategory,
          empty: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const totalShare = ctx.totalSpent > 0 ? (stat.spent / ctx.totalSpent) * 100 : 0;
      const trendLabel = stat.trend === "up" ? "↑ alta" : stat.trend === "down" ? "↓ queda" : "→ estável";
      const userPromptCat = [
        `Categoria analisada: ${targetCategory}`,
        `Mês: ${month} (anterior: ${ctx.prevMonth})`,
        `Total previsto no mês (pagos + a pagar): ${fmt(stat.spent)}`,
        `Total previsto mês anterior: ${fmt(stat.prevSpent || 0)}`,
        `Orçamento: ${stat.budget > 0 ? `${fmt(stat.budget)} (${stat.pct.toFixed(0)}% comprometido)` : "sem limite definido"}`,
        `Tendência: ${trendLabel}`,
        `Status: ${stat.status}`,
        `Share no total mensal previsto: ${totalShare.toFixed(1)}% (${fmt(stat.spent)} de ${fmt(ctx.totalSpent)})`,
      ].join("\n");

      const { data: tonePrefCat } = await supabase
        .from("personal_insights_telegram_prefs")
        .select("tone")
        .eq("user_id", ownerId)
        .maybeSingle();
      const toneCat = (tonePrefCat as any)?.tone || body.tone || "balanced";

      const contentCat = await callAI(buildCategorySystemPrompt(toneCat, targetCategory), userPromptCat);

      return new Response(JSON.stringify({
        content: contentCat,
        category: targetCategory,
        stat: { spent: stat.spent, budget: stat.budget, pct: stat.pct, trend: stat.trend, status: stat.status },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Reuse cached only when recente e gerado pela versão nova do prompt.
    // Detectamos versões antigas pelo título de seção "Pontos críticos" (agora "Pontos de atenção")
    // ou por termos alarmistas removidos, para não servir análises falsas do cache.
    const LEGACY_MARKERS = [
      "Pontos críticos",
      "estouro monumental",
      "situação crítica",
      "gastos descontrolados",
    ];
    const CACHE_TTL_MS = 30 * 60 * 1000;
    if (!force) {
      const { data: existing } = await supabase
        .from("personal_ai_insights")
        .select("id, content, summary, exceeded_categories, generated_at")
        .eq("user_id", ownerId)
        .eq("month", month)
        .maybeSingle();
      if (existing) {
        const ageMs = Date.now() - new Date((existing as any).generated_at).getTime();
        const content = String((existing as any).content || "");
        const isLegacy = LEGACY_MARKERS.some((m) => content.toLowerCase().includes(m.toLowerCase()));
        if (!isLegacy && ageMs < CACHE_TTL_MS) {
          return new Response(JSON.stringify({ ...existing, cached: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }



    const ctx = await buildContext(supabase, ownerId, month);
    if (ctx.stats.length === 0) {
      return new Response(JSON.stringify({
        content: "## 📊 Visão geral\n\nAinda não há despesas pessoais registradas neste mês para gerar uma análise. Comece adicionando seus gastos para receber recomendações personalizadas.",
        exceeded_categories: [],
        empty: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userPrompt = buildPrompt(ctx);

    // Load tone preference (defaults to balanced)
    const { data: tonePref } = await supabase
      .from("personal_insights_telegram_prefs")
      .select("tone")
      .eq("user_id", ownerId)
      .maybeSingle();
    const tone = (tonePref as any)?.tone || body.tone || "balanced";

    const content = await callAI(buildSystemPrompt(tone), userPrompt);

    const exceeded = ctx.stats.filter((s: CategoryStat) => s.status === "exceeded").map((s: CategoryStat) => s.category);
    const trends = ctx.stats
      .filter((s: CategoryStat) => s.trend === "up" && s.spent > 0)
      .map((s: CategoryStat) => ({ category: s.category, prev: s.prevSpent, current: s.spent }));

    // Generate a one-line summary for telegram preview
    const summary = ctx.hasAnyBudget
      ? `${exceeded.length > 0 ? `${exceeded.length} categoria(s) acima do orçamento` : "Sem categorias acima do orçamento"} • Previsto ${fmt(ctx.totalSpent)} / Orçado ${fmt(ctx.totalBudget)}`
      : `Sem orçamento cadastrado • Previsto ${fmt(ctx.totalSpent)} (pago ${fmt(ctx.totalPaid)} / pendente ${fmt(ctx.totalPending)})`;

    await supabase
      .from("personal_ai_insights")
      .upsert({
        user_id: ownerId,
        month,
        content,
        summary,
        exceeded_categories: exceeded,
        trends,
        generated_at: new Date().toISOString(),
      }, { onConflict: "user_id,month" });


    return new Response(JSON.stringify({
      content, summary, exceeded_categories: exceeded, trends,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[generate-personal-insights] error:", e);
    const msg = String(e?.message || e);
    // Detect billing / credits exhaustion (402) from upstream AI provider
    if (/\b402\b/.test(msg) || /\b403\b/.test(msg) || /payment_required/i.test(msg) || /Not enough credits/i.test(msg) || /credit_limit_reached/i.test(msg) || /credit limit/i.test(msg)) {
      return new Response(JSON.stringify({
        code: "AI_CREDITS_EXHAUSTED",
        message: "Créditos de IA esgotados. Verifique seu plano e tente novamente em alguns minutos.",
        fallback: true,
        content: "## ⚠️ Análise indisponível\n\nO serviço de IA está temporariamente indisponível por falta de créditos. Tente novamente mais tarde.",
        exceeded_categories: [],
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (/\b429\b/.test(msg) || /rate.?limit/i.test(msg)) {
      return new Response(JSON.stringify({
        code: "AI_RATE_LIMITED",
        message: "Muitas requisições à IA. Aguarde alguns segundos e tente novamente.",
        fallback: true,
        content: "## ⏳ Limite de uso atingido\n\nMuitas análises foram solicitadas em sequência. Tente novamente em instantes.",
        exceeded_categories: [],
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      code: "AI_REPORT_UNAVAILABLE",
      message: msg,
      fallback: true,
      content: "## ❌ Erro na análise\n\nNão foi possível gerar a análise neste momento. Tente novamente em alguns instantes.",
      exceeded_categories: [],
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

