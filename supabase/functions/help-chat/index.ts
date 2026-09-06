// Help chat — assistente IA que conhece o app EmprestAI a fundo.
// Recebe { messages: [{role, content}] } e devolve { reply: string }.
//
// Aprendizado incremental: cada par (pergunta, resposta) é salvo na tabela
// public.help_chat_knowledge no projeto externo e usado como contexto
// adicional (RAG simples por keyword) nas próximas conversas.

import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};

const SYSTEM_PROMPT = `Você é o "Assistente EmprestAI" — tutor oficial do aplicativo EmprestAI. Sua missão é ENSINAR o usuário a usar o app de forma REAL, passo a passo, com base APENAS nas funcionalidades descritas abaixo. NÃO invente telas, botões ou recursos que não estão listados.

==============================
NAVEGAÇÃO (abas reais do app)
==============================
O app tem uma navegação por abas (topo no desktop, menu lateral/inferior no tablet/mobile). As abas existentes são exatamente estas (id → nome visível):
- overview → "Dashboard" (visão geral)
- dashboard → "Empréstimos"
- products → "Vendas"
- vehicles → "Veículos"
- calendar → "Calendário"
- clients → "Cadastro" (clientes)
- expenses → "Receitas e Despesas"
- boletos → "Boletos"
- salary → "Salário"
- accountant → "Contador"
- overdue → "Relatório"
- settings → "Configurações"
- system → "Sistema"
- ajuda → "Assistente EmprestAI" (esta tela)

Algumas áreas têm rota própria: /planejamento-do-dia, /cofrinhos, /cofrinho/:id, /planos, /bem-vindo (onboarding), /reset-password, /cadastro, /auth.

Visibilidade de abas depende do papel do usuário (admin / gerente / operador / visualizador / cliente) e das permissões definidas em Configurações → Usuários (ou no plano em Configurações → Planos).

==============================
COMO USAR CADA ÁREA (passo a passo real)
==============================

**Dashboard (aba "Dashboard"):** mostra capital ativo, lucro do mês, inadimplência, gráficos. Use os filtros de período no topo do card para mudar o mês. Cards podem ser ocultados/reorganizados pelas preferências do dashboard.

**Empréstimos (aba "Empréstimos"):**
1. Botão "Novo empréstimo" abre o formulário.
2. Selecione o cliente (ou cadastre na hora), valor, juros ao mês, número de parcelas e periodicidade (diária/semanal/quinzenal/mensal).
3. O app calcula o valor da parcela; é possível ajustar a data da 1ª parcela.
4. Após salvar, o empréstimo aparece na lista. Clique para abrir detalhes, registrar pagamento, gerar contrato em PDF, simular ou renegociar (com multa configurável).
5. Pagamentos atrasados geram juros/multa automáticos conforme regras configuradas.

**Vendas (aba "Vendas"):**
- Tem sub-abas: Produtos (cadastro/estoque), Vendas, Movimentações.
- Cadastre produto com preço de custo, venda e estoque.
- Em "Vendas", crie venda à vista ou parcelada. Vendas parceladas viram automaticamente um empréstimo vinculado ao cliente.

**Veículos (aba "Veículos"):** registre veículos (consórcios, financiamentos, vendas) e acompanhe o saldo veicular.

**Calendário (aba "Calendário"):** mostra vencimentos do dia, semana e mês. Para o planejamento detalhado do dia abra /planejamento-do-dia.

**Cadastro (aba "Cadastro"):** lista de clientes. Botão "Novo cliente" abre formulário com dados, telefone, anexos. Cada cliente tem histórico de empréstimos, score de risco e detalhes.

**Receitas e Despesas (aba "Receitas e Despesas"):**
- Separadas em Receitas, Despesas do negócio e Despesas pessoais.
- Cadastre categorias personalizadas, defina orçamentos mensais por categoria.
- A IA gera insights pessoais (card "Insights de IA").
- Para poupança/reserva, use **Cofrinhos** em /cofrinhos: criar cofrinho, depositar, sacar, ver rendimento CDI e IR estimado.

**Boletos (aba "Boletos"):**
1. Cole/escaneie a linha digitável.
2. O app valida e mostra valor/vencimento.
3. Botões abrem deep link do banco emissor ou geram QR Code PIX (quando aplicável).
4. É possível vincular o boleto a uma despesa ou receita.

**Salário (aba "Salário"):** crie folhas (payrolls) mensais para funcionários, gere holerites (payslips) em PDF e configure comissões de gerente.

**Contador (aba "Contador"):** relatórios contábeis consolidados e logs de auditoria.

**Relatório (aba "Relatório"):** inadimplência, vencimentos da semana, exporta CSV/PDF.

**Configurações (aba "Configurações"):** sub-seções típicas:
- Perfil / Telefone / Senha
- Usuários: criar, convidar (códigos de convite), aprovar cadastros, atribuir papel e permissões por aba.
- Planos: criar/editar planos, permissões por plano.
- Marca/Branding: logo, cores, título, favicon.
- Notificações: push (PWA) e preferências.
- Telegram: vincular conta a um bot oficial para receber resumos diário/semanal/mensal, vencimentos do dia, cobranças, planejamento do dia, insights pessoais. Cada tipo de relatório tem seu próprio toggle.
- Assinatura: plano atual via Paddle (/planos para contratar).
- Sessões ativas, chaves API, modo offline.

**Sistema (aba "Sistema"):** backups automáticos, exportar/restaurar backup, painel de migração (/painel-migracao).

**Onboarding:** novo usuário é levado a /bem-vindo (3 passos) e recebe categorias padrão de receitas/despesas.

==============================
INTEGRAÇÕES REAIS
==============================
- **Telegram**: SIM. O usuário vincula sua conta gerando um código em Configurações → Telegram e enviando ao bot. Os @usernames dos bots ativos estão listados em "Bots oficiais do Telegram" abaixo — use SOMENTE esses.
- **WhatsApp**: NÃO existe. Se perguntarem, diga claramente que o app não tem integração com WhatsApp e ofereça o Telegram como alternativa.
- **Pagamentos do plano**: via Paddle em /planos.
- **PWA / Push**: o app pode ser instalado como PWA (banner aparece) e enviar notificações push.

==============================
REGRAS DE RESPOSTA (obrigatórias)
==============================
1. SEMPRE em português do Brasil, tom amigável e direto.
2. Use markdown leve: **negrito** para nomes de botões/abas, listas numeradas para passo a passo curtos.
3. Para "como faço X", responda em PASSOS NUMERADOS reais, citando a aba exata (ex: "vá na aba **Empréstimos** → botão **Novo empréstimo**"). Nada de respostas genéricas tipo "procure no menu".
4. Se a funcionalidade pedida NÃO está descrita acima, diga honestamente "essa função não existe no app hoje" ou "não tenho certeza, recomendo abrir um chamado com o suporte" — NUNCA invente tela, botão, atalho ou recurso.
5. Não cite tabelas do banco, IDs internos, nomes de edge functions, Lovable, Supabase ou qualquer detalhe técnico de bastidor.
6. Para perguntas fora do escopo (assuntos não-EmprestAI), redirecione gentilmente.
7. Bots do Telegram: use APENAS os @usernames da seção "Bots oficiais do Telegram" abaixo. Se a lista estiver vazia, diga que ainda não há bots ativos. Nunca invente, abrevie ou suponha nomes.
8. Sobre WhatsApp: sempre diga que não há integração e sugira Telegram.
9. Respostas devem ser CURTAS e ÚTEIS: ideal 3–8 linhas. Só estenda se o usuário pedir detalhe.
10. Se houver "Conhecimento aprendido de conversas anteriores", use como referência só se estiver coerente com este guia oficial; caso contrário, ignore.`;

interface ChatMsg { role: "user" | "assistant" | "system"; content: string }

// --- Clientes Supabase ---------------------------------------------------
// Cloud (para system_telegram_bots — onde a lista de bots vive)
async function getCloudClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
  return createClient(url, key);
}

// External (onde fica a base de conhecimento incremental do help-chat)
async function getExternalClient() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL");
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
  return createClient(url, key);
}

// --- Bootstrap da tabela (idempotente, roda apenas se necessário) --------
let bootstrapped = false;
async function ensureKnowledgeTable(_supa: any) {
  // Tabela criada e versionada no banco de dados via migrações oficiais.
  return;
}

// --- Contexto: bots do Telegram -----------------------------------------
async function fetchBotsContext(): Promise<string> {
  try {
    const supa = await getExternalClient();
    if (!supa) return "\n\nBots oficiais do Telegram: (não foi possível consultar — NÃO invente @usernames).";
    const { data, error } = await supa
      .from("system_telegram_bots")
      .select("bot_username, purpose, label, is_active")
      .eq("is_active", true);
    if (error) console.warn("[help-chat] fetchBotsContext erro:", error);
    if (!data || data.length === 0) {
      return "\n\nBots oficiais do Telegram: (nenhum bot ativo cadastrado — NÃO invente @usernames, diga que ainda não há bots configurados).";
    }
    const lines = data
      .map((b: any) => {
        const handle = b.bot_username ? `@${String(b.bot_username).replace(/^@/, "")}` : "(sem username)";
        const purpose = b.purpose ? ` — ${b.purpose}` : "";
        const label = b.label ? ` (${b.label})` : "";
        return `- ${handle}${label}${purpose}`;
      })
      .join("\n");
    return `\n\nBots oficiais do Telegram (use EXATAMENTE estes @usernames ao responder; nunca invente outros):\n${lines}`;
  } catch {
    return "";
  }
}

// --- Conhecimento incremental -------------------------------------------
const STOPWORDS = new Set([
  "a","o","e","de","do","da","dos","das","em","no","na","um","uma","para","por",
  "com","que","como","qual","quais","quando","onde","sobre","ao","à","os","as",
  "se","sem","ser","tem","ter","sou","é","são","meu","minha","seu","sua","pode",
  "posso","faço","faz","the","of","to","and","in","is","it","i","you","do","what"
]);

function extractKeywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
    ),
  ).slice(0, 8);
}

async function fetchKnowledgeContext(question: string): Promise<string> {
  try {
    const supa = await getExternalClient();
    if (!supa) return "";
    await ensureKnowledgeTable(supa);

    const keywords = extractKeywords(question);
    if (keywords.length === 0) return "";

    // Busca por OR de ilike em search_text — simples e barato.
    let query = supa
      .from("help_chat_knowledge")
      .select("question, answer, upvotes")
      .eq("approved", true)
      .limit(5);

    const orExpr = keywords.map((k) => `search_text.ilike.%${k}%`).join(",");
    query = query.or(orExpr).order("upvotes", { ascending: false }).order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error || !data || data.length === 0) return "";

    const lines = data
      .map((r: any, i: number) => `(${i + 1}) P: ${r.question}\n    R: ${String(r.answer).slice(0, 600)}`)
      .join("\n\n");
    return `\n\nConhecimento aprendido de conversas anteriores (use como referência, ignore se estiver errado):\n${lines}`;
  } catch (e) {
    console.warn("[help-chat] fetchKnowledgeContext falhou:", e);
    return "";
  }
}

async function saveKnowledge(question: string, answer: string, userId: string | null) {
  try {
    const supa = await getExternalClient();
    if (!supa) return;
    await ensureKnowledgeTable(supa);
    if (!question || !answer) return;
    // Evita lixo: respostas de erro não viram conhecimento.
    if (answer.startsWith("⚠️") || answer.toLowerCase().includes("não consegui gerar")) return;
    await supa.from("help_chat_knowledge").insert({
      user_id: userId,
      question: question.slice(0, 2000),
      answer: answer.slice(0, 4000),
    });
  } catch (e) {
    console.warn("[help-chat] saveKnowledge falhou:", e);
  }
}

// --- Manifesto de validação (rotas, abas e botões REAIS) ----------------
const ALLOWED_ROUTES = new Set<string>([
  "/", "/auth", "/cadastro", "/planos", "/termos", "/reembolso", "/privacidade",
  "/reset-password", "/planejamento-do-dia", "/painel-migracao",
  "/cofrinhos", "/cofrinho", "/bem-vindo", "/ajuda",
]);

const ALLOWED_TABS = new Set<string>([
  "Dashboard", "Empréstimos", "Vendas", "Veículos", "Calendário",
  "Cadastro", "Receitas e Despesas", "Boletos", "Salário", "Contador",
  "Relatório", "Configurações", "Sistema", "Ajuda", "Assistente EmprestAI",
]);

const ALLOWED_BUTTONS = [
  "novo emprestimo", "novo cliente", "nova venda", "novo produto",
  "novo veiculo", "nova receita", "nova despesa", "nova categoria",
  "novo cofrinho", "depositar", "sacar", "registrar pagamento",
  "renegociar", "gerar contrato", "simular", "exportar", "importar",
  "salvar", "cancelar", "editar", "excluir", "adicionar",
  "novo bot", "vincular telegram", "gerar codigo", "instalar app",
  "ler linha digitavel", "pagar pix", "novo holerite", "nova folha",
];

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function validateReply(reply: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];

  // Rotas citadas (padrão /algo). Ignora http(s)://.
  const routeRegex = /(?<![:\w/])\/[a-z][a-z0-9-]*(?:\/[a-z0-9:-]+)?/gi;
  for (const raw of reply.match(routeRegex) || []) {
    const base = "/" + raw.slice(1).split("/")[0].toLowerCase();
    if (!ALLOWED_ROUTES.has(base)) issues.push(`Rota "${raw}" não existe no app.`);
  }

  // Abas: aba **X** ou aba "X".
  const tabRegex = /aba\s+(?:\*\*|")([^*"\n]{2,40})(?:\*\*|")/gi;
  let m: RegExpExecArray | null;
  while ((m = tabRegex.exec(reply)) !== null) {
    const name = m[1].trim().replace(/[:.,;]$/, "");
    const ok = Array.from(ALLOWED_TABS).some((t) => stripAccents(t) === stripAccents(name));
    if (!ok) issues.push(`Aba "${name}" não existe.`);
  }

  // Botões em **negrito** que pareçam rótulo de ação.
  const boldRegex = /\*\*([^*\n]{2,40})\*\*/g;
  while ((m = boldRegex.exec(reply)) !== null) {
    const raw = m[1].trim().replace(/[:.,;!?]$/, "");
    const norm = stripAccents(raw);
    if (Array.from(ALLOWED_TABS).some((t) => stripAccents(t) === norm)) continue;
    if (norm.startsWith("/")) continue;
    const looksLikeButton = /^(novo|nova|adicionar|criar|salvar|editar|excluir|gerar|registrar|vincular|instalar|depositar|sacar|renegociar|simular|exportar|importar|pagar|ler)\b/.test(norm);
    if (!looksLikeButton) continue;
    const known = ALLOWED_BUTTONS.some((b) => norm === b || norm.startsWith(b) || b.startsWith(norm));
    if (!known) issues.push(`Botão "${raw}" não consta na lista oficial.`);
  }

  return { ok: issues.length === 0, issues };
}

const MODEL_FALLBACK_CHAIN = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"];

async function callAI(
  systemContent: string,
  history: ChatMsg[],
  apiKey: string,
): Promise<{ ok: true; reply: string } | { ok: false; status: number; text: string }> {
  let lastErr: { status: number; text: string } = { status: 500, text: "no attempt" };
  for (const model of MODEL_FALLBACK_CHAIN) {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemContent }, ...history],
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      const reply = data?.choices?.[0]?.message?.content?.trim() || "Não consegui gerar resposta.";
      return { ok: true, reply };
    }
    lastErr = { status: resp.status, text: await resp.text() };
    // Só tenta fallback em 503/429/500; outros erros (400/401/403) abortam.
    if (![429, 500, 502, 503, 504].includes(resp.status)) break;
    console.warn(`[help-chat] modelo ${model} falhou (${resp.status}), tentando próximo`);
  }
  return { ok: false, ...lastErr };
}

// --- Handler -------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = (await req.json()) as { messages?: ChatMsg[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const currentQuestion = lastUser?.content?.trim() || "";

    // AuthN: require a valid Supabase JWT — prevents anonymous callers from
    // burning Gemini quota on our LLM key.
    let userId: string | null = null;
    try {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (token) {
        const supa = await getExternalClient();
        if (supa) {
          const { data } = await supa.auth.getUser(token);
          userId = data.user?.id ?? null;
        }
      }
    } catch { /* ignore */ }

    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: cap per-user AI usage to protect quota/cost.
    const rlOk = await checkRateLimit({
      bucket: "help-chat",
      key: userId,
      max: 30,
      windowSecs: 60,
    });
    if (!rlOk) return rateLimitResponse(corsHeaders);
    // Secondary per-IP cap for defence in depth.
    const ipOk = await checkRateLimit({
      bucket: "help-chat-ip",
      key: getClientIp(req),
      max: 60,
      windowSecs: 60,
    });
    if (!ipOk) return rateLimitResponse(corsHeaders);

    const trimmed = messages.slice(-12);
    const [botsContext, knowledgeContext] = await Promise.all([
      fetchBotsContext(),
      currentQuestion ? fetchKnowledgeContext(currentQuestion) : Promise.resolve(""),
    ]);

    const manifestNote = `\n\n==============================
MANIFESTO OFICIAL (use APENAS estes nomes/rotas)
==============================
Rotas válidas: ${Array.from(ALLOWED_ROUTES).join(", ")}.
Abas válidas: ${Array.from(ALLOWED_TABS).join(", ")}.
Botões conhecidos: ${ALLOWED_BUTTONS.join(", ")}.
Se a ação que o usuário quer NÃO puder ser explicada com esses elementos, diga honestamente que a função não existe ou peça que ele confirme com o suporte. NUNCA invente rota, aba ou botão fora desta lista.`;

    const systemContent = SYSTEM_PROMPT + manifestNote + botsContext + knowledgeContext;

    let attempt = await callAI(systemContent, trimmed, GEMINI_API_KEY);
    if (!attempt.ok) {
      const status = attempt.status === 429 || attempt.status === 402 ? attempt.status : 500;
      const msg =
        attempt.status === 429
          ? "Muitas requisições — aguarde alguns segundos e tente de novo."
          : attempt.status === 402
          ? "Créditos de IA esgotados. Adicione créditos no workspace."
          : `Erro IA: ${attempt.text.slice(0, 200)}`;
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let reply = attempt.reply;
    let validation = validateReply(reply);

    // Auto-correção: 1 nova tentativa com lista de problemas detectados.
    if (!validation.ok) {
      console.warn("[help-chat] resposta inválida, corrigindo:", validation.issues);
      const correctionHistory: ChatMsg[] = [
        ...trimmed,
        { role: "assistant", content: reply },
        {
          role: "user",
          content:
            `Sua resposta acima contém referências que NÃO existem no app:\n` +
            validation.issues.map((i) => `- ${i}`).join("\n") +
            `\n\nReescreva a resposta usando APENAS rotas, abas e botões do MANIFESTO OFICIAL. ` +
            `Se a ação não puder ser executada com esses elementos, diga honestamente que essa função não existe no app. Envie só a resposta corrigida.`,
        },
      ];
      const fix = await callAI(systemContent, correctionHistory, GEMINI_API_KEY);
      if (fix.ok) {
        const fixValidation = validateReply(fix.reply);
        if (fixValidation.ok || fixValidation.issues.length < validation.issues.length) {
          reply = fix.reply;
          validation = fixValidation;
        }
      }
    }

    // Só salva no conhecimento se passou na validação.
    if (currentQuestion && validation.ok) {
      saveKnowledge(currentQuestion, reply, userId).catch(() => {});
    }

    return new Response(
      JSON.stringify({ reply, validation: { ok: validation.ok, issues: validation.issues } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
