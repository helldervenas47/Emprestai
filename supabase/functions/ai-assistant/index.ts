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
import { createUserClient, executeTool, TOOL_DEFINITIONS, type ToolContext } from "./tools.ts";
import {
  isLearnableAnswer,
  missingPeriodDisclosure,
  redactSecrets,
  resolvePeriod,
  selectDomains,
} from "./pure.ts";

const MODEL_CHAIN = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"];
const AI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MAX_TOOL_STEPS = 3;

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
  todayIso: string;
  periodLabel: string;
  tab?: string | null;
  mode?: string | null;
}): string {
  return `Você é o EmprestAI, assistente financeiro sênior do aplicativo Emprestaii.

# Identidade
Você conhece profundamente o produto E tem acesso aos dados reais do usuário através de tools.
Você NÃO é um tutor genérico: quando a pergunta envolve números, você consulta os dados antes de responder.

# Contexto atual
- Data de hoje: ${params.todayIso}
- Período padrão quando o usuário não especificar: ${params.periodLabel}
- Aba aberta no app: ${params.tab ?? "desconhecida"}
- Modo: ${params.mode ?? "não informado"}

# Regras invioláveis
1. NUNCA invente números. Todo valor citado deve vir de uma tool executada nesta conversa.
2. Se a tool não retornar registros, diga explicitamente que não encontrou registros no período — não estime.
3. Sempre informe o período a que os valores se referem.
4. Formate dinheiro como R$ 1.234,56 (nunca abreviado).
5. Se a pergunta for ambígua (cliente, período ou módulo), pergunte antes de consultar.
6. Nunca exiba tokens, chaves, IDs internos de credenciais ou dados de outros usuários.
7. Ao explicar um cálculo, use as fórmulas oficiais do conhecimento abaixo — não crie fórmulas próprias.
8. Respostas curtas e diretas em português do Brasil, com listas quando houver mais de dois números.
9. Ao decompor um total, use apenas os campos de "composicao_*" devolvidos pela tool e respeite a fórmula indicada. Nunca liste "valor_vencido" como parcela da composição do total a receber — ele é um recorte (parcelas vencidas), não uma parcela somável.

# Conhecimento de domínio
${params.knowledge}`;
}

async function callModel(messages: ChatMessage[], apiKey: string): Promise<any> {
  let lastError = "";
  for (const model of MODEL_CHAIN) {
    const resp = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 1200,
      }),
    });
    if (resp.ok) return await resp.json();
    lastError = `${resp.status} ${await resp.text()}`;
    // 404 = modelo descontinuado/indisponível → tenta o próximo da cadeia.
    if (resp.status === 404 || resp.status === 429 || resp.status >= 500) continue;
    break;
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

    // Rate limit e resolução de owner dependem do service role; nunca podem
    // derrubar o assistente se o secret/RPC não estiver disponível.
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
    const systemPrompt = buildSystemPrompt({
      knowledge: buildKnowledgeBlock(domains),
      todayIso,
      periodLabel: defaultPeriod.label,
      tab,
      mode,
    });

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "GEMINI_API_KEY missing" }, 500);

    const ctx: ToolContext = { client: userClient, ownerId, todayIso };
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: question },
    ];

    const toolsUsed: string[] = [];
    let reply = "";

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      let data: any;
      try {
        data = await callModel(messages, apiKey);
      } catch (e) {
        console.error("[ai-assistant] model call failed:", e);
        return json({
          error: "Assistente indisponível no momento (falha no provedor de IA).",
          detail: String((e as Error)?.message ?? e).slice(0, 500),
        }, 502);
      }
      const choice = data?.choices?.[0]?.message;
      if (!choice) break;


      const calls = choice.tool_calls ?? [];
      if (calls.length === 0) {
        reply = String(choice.content ?? "").trim();
        break;
      }

      messages.push({ role: "assistant", content: choice.content ?? null, tool_calls: calls });

      for (const call of calls) {
        const name = call?.function?.name ?? "";
        let args: any = {};
        try {
          args = JSON.parse(call?.function?.arguments || "{}");
        } catch {
          args = {};
        }
        toolsUsed.push(name);
        let result: unknown;
        try {
          result = await executeTool(name, args, ctx);
        } catch (error) {
          console.error(`[ai-assistant] tool ${name} failed:`, error);
          result = { erro: "Não foi possível consultar os dados agora." };
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 20000),
        });
      }
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
      tools_used: toolsUsed,
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
