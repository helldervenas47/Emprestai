import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type InsightTone = "balanced" | "strict" | "motivational" | "technical" | "friendly";
type ReportType = "risk-reduction" | "priority-insight";

const toneGuide: Record<InsightTone, string> = {
  balanced: "Tom equilibrado, claro, executivo e prático.",
  strict: "Tom direto, firme e objetivo, sem suavizar riscos.",
  motivational: "Tom encorajador, positivo e orientado à ação.",
  technical: "Tom analítico, preciso, com linguagem mais técnica e orientada a indicadores.",
  friendly: "Tom próximo, leve e fácil de entender, sem perder utilidade.",
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const asNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value: unknown) => asNumber(value).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const formatPercent = (value: unknown) => `${asNumber(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const buildLocalReport = (reportType: ReportType, metrics: Record<string, unknown>) => {
  if (reportType === "priority-insight") {
    const title = String(metrics?.title ?? metrics?.insight ?? "Insight prioritário");
    return `## Resumo executivo\n- ${title}\n- Priorize a ação de maior impacto com base nos indicadores atuais.\n\n## Ação imediata\n- Revise os contratos ou clientes que mais pesam no indicador.\n- Acompanhe o efeito da ação no próximo fechamento do período.`;
  }

  const risk = metrics?.riskScore ?? metrics?.risco ?? metrics?.risk ?? 0;
  const returns = metrics?.returnScore ?? metrics?.retorno ?? metrics?.return ?? 0;
  const defaultRate = metrics?.defaultRate ?? metrics?.inadimplencia ?? metrics?.default_rate ?? 0;
  const received = metrics?.received ?? metrics?.recebido ?? metrics?.totalIncome ?? metrics?.income ?? 0;

  return `## Resumo executivo\n- Risco atual: ${formatPercent(risk)}; retorno: ${formatPercent(returns)}; inadimplência: ${formatPercent(defaultRate)}.\n- Recebido no período: ${formatCurrency(received)}. Foque em reduzir exposição sem travar as operações rentáveis.\n\n## Ações imediatas\n- Priorize cobrança dos maiores saldos em atraso e renegocie contratos com maior risco.\n- Evite novas liberações para perfis com atraso recorrente até o indicador estabilizar.`;
};

const fetchWithTimeout = async (input: string, init: RequestInit, timeoutMs = 4500) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let fallbackReport = "";
  let fallbackReportType: ReportType = "risk-reduction";
  let fallbackMetrics: Record<string, unknown> = {};

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsErr || !userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => null);
    const requestedType = body?.type === "priority-insight" ? "priority-insight" : "risk-reduction";
    const reportType = requestedType as ReportType;
    const metrics = body?.metrics as Record<string, unknown> | undefined;

    if (!metrics) {
      return jsonResponse({ error: "Missing metrics" }, 400);
    }

    fallbackReportType = reportType;
    fallbackMetrics = metrics;
    fallbackReport = buildLocalReport(reportType, metrics);

    const promptByType: Record<ReportType, { system: string[]; userIntro: string }> = {
      "risk-reduction": {
        system: [
          "Você é um consultor financeiro especialista em crédito e cobrança.",
          toneGuide.balanced,
          "Analise o risco da operação e gere um relatório em markdown.",
          "Objetivo: dizer o que fazer para diminuir o risco sem destruir o retorno.",
          "Estruture a resposta com apenas estes blocos: Resumo executivo e Ações imediatas.",
          "O relatório deve ser ultra resumido, com informações claras, diretas e acionáveis.",
          "Limite cada bloco a no máximo 2 bullets curtos e priorize somente o que mais impacta a decisão imediata.",
          "Seja específico com base nos números recebidos. Não invente dados. Evite explicações longas e linguagem genérica.",
        ],
        userIntro: "Dados atuais da operação:",
      },
      "priority-insight": {
        system: [
          "Você é um consultor financeiro especialista em performance, risco e cobrança.",
          toneGuide.balanced,
          "Analise o insight prioritário recebido e gere um relatório executivo em markdown.",
          "Objetivo: resumir o problema ou oportunidade e dizer o que fazer agora.",
          "Estruture a resposta com apenas estes blocos: Resumo executivo e Ação imediata.",
          "Cada bloco deve ter no máximo 2 bullets bem curtos, claros e diretos.",
          "Seja específico com base nos números recebidos. Não invente dados. Corte contexto desnecessário.",
        ],
        userIntro: "Contexto do insight prioritário:",
      },
    };

    const promptConfig = promptByType[reportType] ?? promptByType["risk-reduction"];
    const systemPrompt = promptConfig.system.join(" ");
    const userPrompt = `${promptConfig.userIntro}\n${JSON.stringify(metrics, null, 2)}\n\nGere um relatório prático e acionável.`;

    const callGateway = async () =>
      fetchWithTimeout("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

    // Mantém o tempo total baixo para evitar timeout/503 da plataforma quando a IA oscila.
    let response: Response | null = null;
    let lastErrText = "";
    const transient = new Set([500, 502, 503, 504]);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await callGateway();
        if (response.ok) break;
        if (!transient.has(response.status)) break;
        lastErrText = await response.text().catch(() => "");
      } catch (err) {
        lastErrText = err instanceof Error ? err.message : String(err);
      }
      await new Promise((r) => setTimeout(r, 350 * Math.pow(2, attempt)));
    }

    if (!response || !response.ok) {
      const status = response?.status ?? 502;
      if (status === 429 || status === 402) {
        return jsonResponse({
          report: fallbackReport,
          fallback: true,
          error: status === 402 ? "AI_CREDITS_EXHAUSTED" : "AI_RATE_LIMITED",
          message: status === 402
            ? "Créditos de IA indisponíveis. Um relatório local foi gerado para manter o fluxo funcionando."
            : "Limite temporário de IA atingido. Um relatório local foi gerado para manter o fluxo funcionando.",
          details: lastErrText?.slice(0, 500),
        });
      }
      // Erros transitórios/upstream: responde com relatório determinístico para nunca derrubar a UI.
      return jsonResponse({
        report: fallbackReport,
        fallback: true,
        error: "AI_SERVICE_UNAVAILABLE",
        message: "A IA demorou para responder. Um relatório local foi gerado com os dados disponíveis.",
        details: lastErrText?.slice(0, 500),
      });
    }

    const result = await response.json().catch(() => null);
    const report = result?.choices?.[0]?.message?.content || fallbackReport;

    return jsonResponse({ report });
  } catch (error) {
    // Erro inesperado: também devolve 200 para impedir runtime error/blank screen no client.
    return jsonResponse({
      report: fallbackReport || buildLocalReport(fallbackReportType, fallbackMetrics),
      fallback: true,
      error: "EDGE_FUNCTION_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});