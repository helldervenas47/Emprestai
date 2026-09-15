/**
 * ai-assistant — assistente financeiro com acesso a dados reais.
 *
 * Segurança:
 * - Exige JWT válido (nada de endpoint público, ao contrário do help-chat).
 * - Toda leitura usa o client do usuário → RLS garante o escopo.
 * - Nenhum segredo é devolvido ao cliente (redactSecrets na resposta final).
 */

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getExternalAdmin } from "./external-supabase.ts";
import { checkRateLimit, rateLimitResponse } from "./rate-limit.ts";
import { buildKnowledgeBlock } from "./knowledge.ts";
import { createUserClient, loadLiveDataContext, type ToolContext } from "./tools.ts";
import {
  isLearnableAnswer,
  missingPeriodDisclosure,
  redactSecrets,
  resolvePeriod,
  selectDomains,
} from "./pure.ts";

const MODEL_CHAIN = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
const AI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildSystemPrompt(params: {
  knowledge: string;
  liveData: string;
  todayIso: string;
  periodLabel: string;
  tab?: string | null;
  mode?: string | null;
}): string {
  return `Você é o EmprestAI, assistente financeiro sênior do aplicativo Emprestaii.

# Identidade
Você conhece profundamente o produto E tem acesso aos dados reais do usuário abaixo.
Você NÃO é um tutor genérico: responda sempre com base nos dados reais do usuário.

# Contexto atual
- Data de hoje: ${params.todayIso}
- Período considerado: ${params.periodLabel}
- Aba aberta no app: ${params.tab ?? "desconhecida"}
- Modo: ${params.mode ?? "não informado"}

# Regras invioláveis
1. NUNCA invente números. Todo valor citado deve vir dos dados reais fornecidos abaixo.
2. Se não houver registros para a pergunta (ex.: nenhum vencimento hoje), diga explicitamente isso de forma clara e amigável.
3. Sempre informe o período ou data a que os valores se referem.
4. Formate dinheiro como R$ 1.234,56 (nunca abreviado).
5. Se a pergunta for ambígua, peça esclarecimento educadamente.
6. Nunca exiba tokens, senhas ou credenciais.
7. Ao explicar um cálculo, use as fórmulas oficiais do conhecimento de domínio.
8. Respostas curtas, diretas e elegantes em português do Brasil, utilizando listas em tópicos quando houver múltiplos itens.

${params.liveData}

# Conhecimento de domínio
${params.knowledge}`;
}

async function callGemini(
  systemPrompt: string,
  history: ChatMessage[],
  question: string,
  apiKey: string,
): Promise<string> {
  const models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"];
  let lastError = "";

  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || "" }],
    })),
    {
      role: "user",
      parts: [{ text: question }],
    },
  ];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1500,
          },
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      }

      const errText = await resp.text();
      lastError = `[${model}] ${resp.status} ${errText}`;
    } catch (fetchErr) {
      lastError = `[${model}] Falha de rede: ${String((fetchErr as Error)?.message ?? fetchErr)}`;
    }
  }

  throw new Error(`AI request failed: ${lastError}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const userClient = createUserClient(authHeader);
    const { data: userRes, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    try {
      const allowed = await checkRateLimit({
        bucket: "ai-assistant",
        key: userId,
        max: 30,
        windowSecs: 300,
      });
      if (!allowed) return rateLimitResponse(corsHeaders);
    } catch (e) {
      console.error("[ai-assistant] rate limit skipped:", e);
    }

    let ownerId = userId;
    try {
      const admin = getExternalAdmin();
      const { data: ownerRow } = await admin.rpc("get_data_owner_id", { _user_id: userId });
      if (typeof ownerRow === "string" && ownerRow) ownerId = ownerRow;
    } catch (e) {
      console.error("[ai-assistant] owner resolution fallback:", e);
    }

    const body = await req.json().catch(() => ({}));
    const question = String(body?.message ?? body?.question ?? "").trim().slice(0, 2000);
    if (!question) return json({ error: "Mensagem vazia" }, 400);

    const history: ChatMessage[] = Array.isArray(body?.history)
      ? body.history
          .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-10)
          .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
      : [];

    const tab = body?.context?.tab ?? null;
    const mode = body?.context?.mode ?? null;
    const todayIso = String(body?.context?.today ?? new Date().toISOString().slice(0, 10));
    const defaultPeriod = resolvePeriod(body?.context?.period ?? null, todayIso);

    const domains = selectDomains(question, tab);
    const ctx: ToolContext = { client: userClient, ownerId, todayIso };
    const liveData = await loadLiveDataContext(ctx, defaultPeriod);

    const systemPrompt = buildSystemPrompt({
      knowledge: buildKnowledgeBlock(domains),
      liveData,
      todayIso,
      periodLabel: defaultPeriod.label,
      tab,
      mode,
    });

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "GEMINI_API_KEY missing" }, 500);

    let reply = "";
    try {
      reply = await callGemini(systemPrompt, history, question, apiKey);
    } catch (e) {
      console.error("[ai-assistant] model call failed:", e);
      return json({
        error: "Assistente indisponível no momento (falha no provedor de IA).",
        detail: String((e as Error)?.message ?? e).slice(0, 500),
      }, 502);
    }

    if (!reply) {
      reply = "Não consegui concluir a consulta agora. Reformule a pergunta ou tente novamente em instantes.";
    }
    reply = redactSecrets(reply);
    if (missingPeriodDisclosure(reply)) {
      reply += `\n\n_Período considerado: ${defaultPeriod.label}._`;
    }

    return json({
      reply,
      tools_used: ["live_database_sync"],
      domains,
      period: defaultPeriod,
      learnable: isLearnableAnswer(question, reply),
    });
  } catch (error) {
    console.error("[ai-assistant] error:", error);
    return json({
      error: "Erro interno do assistente",
      detail: String((error as Error)?.message ?? error).slice(0, 500),
    }, 500);
  }

});
