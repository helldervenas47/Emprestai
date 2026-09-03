import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getReportsBotId } from "../_shared/reports-bot.ts";
import { getExternalServiceRoleKey, getExternalAdmin } from "../_shared/external-supabase.ts";


const GATEWAY_URL = "https://api.telegram.org";
const AI_GATEWAY = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = [
  "Alimentação", "Assinaturas", "Cartão de Crédito", "Combustível", "Compras", "Contas",
  "Educação", "Lazer", "Moradia", "Outros", "Pets", "Presentes", "Saúde", "Transporte",
];

// Categorias usadas pela aba "Veículos" do app. Nenhum lançamento criado pelo
// bot do Telegram pode ficar nessas categorias — caso contrário apareceria
// nessa aba. Mapeamos para a categoria não-veicular mais próxima.
const VEHICLE_CATEGORY_MAP: Record<string, string> = {
  // "Combustível" intencionalmente fora do mapa: é uma categoria exclusiva da aba Despesas.
  "Manutenção": "Transporte",
  "Seguro": "Contas",
  "IPVA": "Transporte",
  "Multas": "Transporte",
  "Lavagem": "Transporte",
  "Estacionamento": "Transporte",
  "Pneus": "Transporte",
  "Documentação": "Outros",
  "Peças": "Transporte",
  "Guincho": "Transporte",
  "Financiamento": "Contas",
  "Outros (Veículo)": "Outros",
};

/** Garante que despesas criadas pelo bot nunca caiam em categorias da aba Veículos. */
function nonVehicleCategory(cat: string | null | undefined): string {
  if (!cat) return "Outros";
  return VEHICLE_CATEGORY_MAP[cat] ?? cat;
}

// In-memory cache (per-isolate) for chat_id → user_id lookups. TTL 5min.
const linkCache = new Map<string, { userId: string | null; expires: number }>();
const botTokenCache = new Map<string, { token: string | null; expires: number }>();
const LINK_CACHE_TTL_MS = 5 * 60 * 1000;

async function getLinkedUserId(admin: any, chatId: number, botId?: string | null): Promise<string | null> {
  const cacheKey = botId ? `${chatId}:${botId}` : String(chatId);
  const cached = linkCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.userId;
  let q = admin.from("telegram_links")
    .select("user_id").eq("chat_id", chatId)
    .order("bot_id", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (botId) {
    q = q.eq("bot_id", botId);
  } else {
    const reportsBotId = await getReportsBotId(admin);
    if (reportsBotId) q = q.or(`bot_id.is.null,bot_id.neq.${reportsBotId}`);
  }
  const { data } = await q.maybeSingle();
  const userId = data?.user_id ?? null;
  linkCache.set(cacheKey, { userId, expires: Date.now() + LINK_CACHE_TTL_MS });
  return userId;
}

function invalidateLinkCache(chatId: number) {
  for (const key of linkCache.keys()) {
    if (key === String(chatId) || key.startsWith(`${chatId}:`)) linkCache.delete(key);
  }
}

async function getExpenseBotTokenForMessage(admin: any, msg: any, fallback: string): Promise<string> {
  const raw = msg.raw_update as any;
  const rawBotId = raw?._system_bot_id as string | undefined;
  const chatId = Number(msg.chat_id);
  const cacheKey = rawBotId ? `bot:${rawBotId}` : `chat:${chatId}`;
  const cached = botTokenCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.token || fallback;

  let token: string | null = null;
  if (rawBotId) {
    const { data } = await admin
      .from("system_telegram_bots")
      .select("token")
      .eq("id", rawBotId)
      .eq("purpose", "expenses")
      .eq("active", true)
      .maybeSingle();
    token = (data as any)?.token ?? null;
  }

  if (!token) {
    let linkQ = admin
      .from("telegram_links")
      .select("bot_id, system_telegram_bots(token)")
      .eq("chat_id", chatId)
      .order("bot_id", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);
    if (rawBotId) linkQ = linkQ.eq("bot_id", rawBotId);
    const { data: link } = await linkQ.maybeSingle();
    token = (link as any)?.system_telegram_bots?.token ?? null;
  }

  if (!token) {
    const { data: activeBot } = await admin
      .from("system_telegram_bots")
      .select("token")
      .eq("active", true)
      .eq("purpose", "expenses")
      .order("bot_id", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    token = (activeBot as any)?.token ?? null;
  }

  botTokenCache.set(cacheKey, { token, expires: Date.now() + LINK_CACHE_TTL_MS });
  return token || fallback;
}

// Keyword → category mapping for regex pre-parser.
// Order matters only within a category; first matching category wins.
const CATEGORY_KEYWORDS: Array<{ category: string; words: string[] }> = [
  { category: "Combustível", words: ["gasolina", "combustivel", "combustível", "etanol", "alcool", "álcool", "diesel", "posto", "posto de gasolina", "abastecer", "abasteci", "abastecimento", "shell", "ipiranga", "petrobras", "ale", "br mania"] },
  { category: "Transporte", words: ["uber", "99", "99pop", "taxi", "táxi", "cabify", "indrive", "blablacar", "onibus", "ônibus", "metro", "metrô", "trem", "brt", "passagem", "ipva", "pedagio", "pedágio", "estacionamento", "zona azul", "lavagem", "lava jato", "lava-jato", "oficina", "mecanico", "mecânico"] },
  { category: "Alimentação", words: ["mercado", "supermercado", "feira", "padaria", "açougue", "acougue", "hortifruti", "sacolao", "sacolão", "ifood", "rappi", "delivery", "lanche", "lanchonete", "restaurante", "almoço", "almoco", "janta", "jantar", "café", "cafe", "cafeteria", "starbucks", "mc donalds", "mcdonalds", "mc", "burger", "bk", "burger king", "subway", "pizza", "pizzaria", "sushi", "japones", "japonês", "churrascaria", "marmita", "quentinha", "açai", "acai"] },
  { category: "Assinaturas", words: ["netflix", "spotify", "disney", "disney+", "hbo", "max", "prime video", "amazon prime", "youtube premium", "apple music", "deezer", "tidal", "globoplay", "paramount", "crunchyroll", "icloud", "google one", "drive", "dropbox", "chatgpt", "claude", "midjourney", "canva", "notion", "office", "microsoft 365"] },
  { category: "Contas", words: ["luz", "energia", "agua", "água", "gas", "gás", "internet", "wifi", "telefone", "celular", "claro", "vivo", "tim", "oi", "net", "iptu", "condominio", "condomínio", "aluguel", "boleto", "fatura", "conta de luz", "conta de agua", "conta de água"] },
  { category: "Saúde", words: ["farmacia", "farmácia", "remedio", "remédio", "medicamento", "drogaria", "drogasil", "pacheco", "raia", "consulta", "medico", "médico", "dentista", "exame", "laboratorio", "laboratório", "hospital", "clinica", "clínica", "psicologo", "psicólogo", "terapia", "fisioterapia", "academia", "gym", "smartfit", "bioritmo"] },
  { category: "Lazer", words: ["cinema", "ingresso", "show", "festa", "balada", "bar", "cerveja", "drink", "bebida", "viagem", "hotel", "airbnb", "passeio", "parque", "teatro", "museu", "jogo", "game", "steam", "playstation", "xbox", "nintendo", "livro", "amazon"] },
  { category: "Compras", words: ["roupa", "calça", "calca", "camisa", "camiseta", "tenis", "tênis", "sapato", "shopping", "magalu", "magazine", "americanas", "shopee", "mercado livre", "mercadolivre", "ml", "aliexpress", "shein"] },
  { category: "Pets", words: ["pet", "petshop", "pet shop", "racao", "ração", "veterinario", "veterinário", "vet", "cocheira", "banho e tosa", "cobasi", "petz"] },
  { category: "Educação", words: ["curso", "faculdade", "mensalidade", "escola", "colegio", "colégio", "livro didatico", "alura", "udemy", "coursera", "pos graduacao", "pós-graduação", "ingles", "inglês"] },
  { category: "Moradia", words: ["material de construção", "material de construcao", "tinta", "reforma", "marceneiro", "pedreiro", "eletricista", "encanador", "leroy", "leroy merlin", "telha norte", "moveis", "móveis", "casa bahia", "decoracao", "decoração"] },
  { category: "Cartão de Crédito", words: ["fatura cartao", "fatura cartão", "fatura do cartao", "fatura do cartão", "cartao", "cartão", "nubank fatura", "itau fatura"] },
  { category: "Presentes", words: ["presente", "aniversario", "aniversário", "natal", "dia das maes", "dia das mães", "dia dos pais"] },
];

// Detects mentions of past dates in PT-BR text. If present, AI should handle the date,
// not the regex quick-parser (which assumes "today").
const DATE_HINT_REGEX = /\b(ontem|anteontem|antes de ontem|hoje|amanh[ãa]|domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|h[áa]\s+\d+\s+(dia|dias|semana|semanas)|dia\s+\d{1,2}|\d{1,2}\/\d{1,2}(\/\d{2,4})?|\d{1,2}-\d{1,2}(-\d{2,4})?)\b/i;

// If the text mentions natural-language amount or payment method, defer to AI.
const NATURAL_LANGUAGE_HINT = /\b(reais|real|pila|conto|contos|mangos|pix|dinheiro|esp[eé]cie|cash|d[eé]bito|cart[ãa]o|boleto|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil)\b/i;

function hasDateHint(text: string): boolean {
  return DATE_HINT_REGEX.test(text);
}

function hasNaturalLanguageHint(text: string): boolean {
  return NATURAL_LANGUAGE_HINT.test(text);
}

// Helpers da nova arquitetura de cofrinhos
function parseCofrinhoMeta(raw: any): { shortId: number | null } {
  if (!raw || typeof raw !== "string") return { shortId: null };
  const t = raw.trim();
  if (!t.startsWith("{")) return { shortId: null };
  try {
    const p = JSON.parse(t);
    return { shortId: typeof p?.shortId === "number" ? p.shortId : null };
  } catch {
    return { shortId: null };
  }
}

async function invokeExternalCofrinhoFn(
  fn: "processar-deposito-cofrinho" | "processar-resgate-cofrinho" | "processar-ajuste-cofrinho",
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; data?: any }> {
  try {
    const url = `${Deno.env.get("EXTERNAL_SUPABASE_URL")}/functions/v1/${fn}`;
    const key = await getExternalServiceRoleKey();
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
        "apikey": key,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: (data as any)?.error || `HTTP ${r.status}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function handleAportesSaldo(admin: any, userId: string): Promise<string> {
  const { data: ownerData } = await admin.rpc("get_data_owner_id", { _user_id: userId });
  const ownerId = (typeof ownerData === "string" && ownerData) ? ownerData : userId;

  const { data: banks, error: banksErr } = await admin
    .from("cofrinhos")
    .select("id, nome, descricao, saldo_total, ativo, created_at")
    .eq("usuario_id", ownerId)
    .order("created_at", { ascending: true });

  if (banksErr) return "❌ Erro ao buscar caixinhas: " + banksErr.message;
  const active = (banks ?? []).filter((b: any) => b.ativo !== false);
  if (active.length === 0) {
    return "ℹ️ Nenhuma caixinha cadastrada ainda.";
  }

  let total = 0;
  let msg = "🐷 *Saldo das caixinhas*\n";
  for (const b of active as any[]) {
    const bal = Number(b.saldo_total) || 0;
    total += bal;
    const meta = parseCofrinhoMeta(b.descricao);
    const tag = meta.shortId ? `#${meta.shortId}` : `#${String(b.id).slice(0, 4)}`;
    msg += `${tag} ${b.nome} — *${fmtBRL(bal)}*\n`;
  }
  msg += `\n*Total geral:* ${fmtBRL(total)}`;
  return msg;
}



function detectCategory(description: string): string {
  const lower = description.toLowerCase();
  for (const { category, words } of CATEGORY_KEYWORDS) {
    for (const w of words) {
      // Word-boundary-ish match: substring with surrounding non-letter or string edges
      const idx = lower.indexOf(w);
      if (idx === -1) continue;
      const before = idx === 0 ? "" : lower[idx - 1];
      const after = idx + w.length >= lower.length ? "" : lower[idx + w.length];
      const isWordChar = (c: string) => /[a-záéíóúâêôãõç0-9]/i.test(c);
      if (!isWordChar(before) && !isWordChar(after)) return category;
    }
  }
  return "Outros";
}

// ============================================================
// 🧠 Learned categorization (per-user keyword cache + LLM few-shot)
// ============================================================

const STOPWORDS = new Set([
  "a","o","as","os","de","da","do","das","dos","e","em","na","no","nas","nos",
  "para","pra","pro","por","com","sem","um","uma","uns","umas","que","ao","à",
  "às","aos","ou","se","minha","meu","meus","minhas","sua","seu","seus","suas",
  "isso","esse","essa","este","esta","aqui","ali","la","lá","muito","muita",
  "bem","mal","ja","já","hoje","ontem","amanha","amanhã","r","rs","reais","real",
  "comprei","gastei","paguei","fiz","tomei","fui","ir","vim","ter","tive","fiz",
  "the","of","and","for","to","in","on","at",
]);

function tokensFromDescription(desc: string): string[] {
  const norm = normalize(desc); // lowercase, strip accents/punct (already defined below)
  const raw = norm.split(" ").filter(Boolean);
  const out: string[] = [];
  for (const w of raw) {
    if (w.length < 3) continue;
    if (/^\d+$/.test(w)) continue;
    if (STOPWORDS.has(w)) continue;
    out.push(w);
  }
  // Also include adjacent bigrams (e.g. "burger king", "lava jato")
  for (let i = 0; i < raw.length - 1; i++) {
    const a = raw[i], b = raw[i + 1];
    if (a.length < 3 || b.length < 3) continue;
    if (STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
    out.push(`${a} ${b}`);
  }
  return Array.from(new Set(out));
}

/** Look up the best learned category for this description from the user's own history. */
async function suggestCategoryFromHints(
  admin: any,
  userId: string,
  description: string,
): Promise<{ category: string; hits: number } | null> {
  const tokens = tokensFromDescription(description);
  if (tokens.length === 0) return null;
  const { data } = await admin
    .from("expense_category_hints")
    .select("keyword, category, hits")
    .eq("user_id", userId)
    .in("keyword", tokens);
  if (!data || data.length === 0) return null;

  // Aggregate hits per category across all matched keywords
  const byCat = new Map<string, number>();
  for (const r of data) {
    byCat.set(r.category, (byCat.get(r.category) || 0) + (Number(r.hits) || 1));
  }
  let best: { category: string; hits: number } | null = null;
  for (const [cat, hits] of byCat) {
    if (!best || hits > best.hits) best = { category: cat, hits };
  }
  return best;
}

/** Reinforce learning: increment hit count for every token in the description for the chosen category. */
async function learnCategoryFromExpense(
  admin: any,
  userId: string,
  description: string,
  category: string,
) {
  if (!category || !category.trim()) return;
  const tokens = tokensFromDescription(description);
  if (tokens.length === 0) return;
  const nowIso = new Date().toISOString();

  // Read existing rows for these tokens to decide insert vs increment
  const { data: existing } = await admin
    .from("expense_category_hints")
    .select("id, keyword, category, hits")
    .eq("user_id", userId)
    .in("keyword", tokens);

  const map = new Map<string, { id: string; category: string; hits: number }>();
  for (const r of existing ?? []) {
    map.set(`${r.keyword}::${r.category}`, { id: r.id, category: r.category, hits: Number(r.hits) || 1 });
  }

  const toInsert: any[] = [];
  const toUpdate: Array<{ id: string; hits: number }> = [];
  for (const kw of tokens) {
    const key = `${kw}::${category}`;
    const row = map.get(key);
    if (row) {
      toUpdate.push({ id: row.id, hits: row.hits + 1 });
    } else {
      toInsert.push({ user_id: userId, keyword: kw, category, hits: 1, last_used: nowIso });
    }
  }
  if (toInsert.length > 0) {
    await admin.from("expense_category_hints").insert(toInsert);
  }
  for (const u of toUpdate) {
    await admin.from("expense_category_hints")
      .update({ hits: u.hits, last_used: nowIso })
      .eq("id", u.id);
  }
}

/** Few-shot LLM classifier using the user's own recent confirmed expenses. */
async function suggestCategoryWithLLM(
  admin: any,
  userId: string,
  description: string,
): Promise<string | null> {
  // Pull recent confirmed expenses (descriptive examples)
  const { data: recent } = await admin
    .from("expenses")
    .select("description, category")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .order("created_at", { ascending: false })
    .limit(30);

  const examples = (recent ?? [])
    .filter((e: any) => e.description && e.category && CATEGORIES.includes(e.category))
    .slice(0, 20)
    .map((e: any) => `- "${e.description}" → ${e.category}`)
    .join("\n");

  if (!examples) return null;

  try {
    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Classifique a despesa em UMA das categorias: ${CATEGORIES.join(", ")}.
Use os exemplos pessoais do usuário abaixo como referência principal. Se nada parecer próximo, use "Outros".

Exemplos do usuário:
${examples}`,
          },
          { role: "user", content: `Despesa: "${description}"` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "pick_category",
            description: "Escolhe a melhor categoria",
            parameters: {
              type: "object",
              properties: { category: { type: "string", enum: CATEGORIES } },
              required: ["category"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "pick_category" } },
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return null;
    const args = JSON.parse(call.function.arguments);
    return CATEGORIES.includes(args.category) ? args.category : null;
  } catch (e) {
    console.error("suggestCategoryWithLLM err", e);
    return null;
  }
}

/**
 * Hybrid resolver: returns the best category for a description using
 * (1) per-user learned hints, (2) LLM few-shot fallback, (3) the AI/regex initial guess.
 */
async function resolveCategoryHybrid(
  admin: any,
  userId: string,
  description: string,
  initialGuess: string,
): Promise<string> {
  // 1) Cache hit (instant, free)
  const learned = await suggestCategoryFromHints(admin, userId, description);
  if (learned && learned.hits >= 1) return learned.category;

  // 2) If the initial guess is "Outros" (i.e. heuristic gave up), try the LLM few-shot.
  if (!initialGuess || initialGuess === "Outros") {
    const llm = await suggestCategoryWithLLM(admin, userId, description);
    if (llm) return llm;
  }

  return initialGuess && CATEGORIES.includes(initialGuess) ? initialGuess : "Outros";
}

// ============================================================
// 🧠 Income learned categorization (mirrors expense logic)
// ============================================================

async function suggestIncomeCategoryFromHints(
  admin: any,
  userId: string,
  description: string,
): Promise<{ category: string; hits: number } | null> {
  const tokens = tokensFromDescription(description);
  if (tokens.length === 0) return null;
  const { data } = await admin
    .from("income_category_hints")
    .select("keyword, category, hits")
    .eq("user_id", userId)
    .in("keyword", tokens);
  if (!data || data.length === 0) return null;
  const byCat = new Map<string, number>();
  for (const r of data) {
    byCat.set(r.category, (byCat.get(r.category) || 0) + (Number(r.hits) || 1));
  }
  let best: { category: string; hits: number } | null = null;
  for (const [cat, hits] of byCat) {
    if (!best || hits > best.hits) best = { category: cat, hits };
  }
  return best;
}

async function learnIncomeCategory(
  admin: any,
  userId: string,
  description: string,
  category: string,
) {
  // INCOME_CATEGORIES is declared later; validate by simple guard list inline.
  const allowed = ["Vendas","Serviços","Comissões","Aluguel","Investimentos","Salário","Reembolso","Outros"];
  if (!allowed.includes(category)) return;
  const tokens = tokensFromDescription(description);
  if (tokens.length === 0) return;
  const nowIso = new Date().toISOString();
  const { data: existing } = await admin
    .from("income_category_hints")
    .select("id, keyword, category, hits")
    .eq("user_id", userId)
    .in("keyword", tokens);
  const map = new Map<string, { id: string; category: string; hits: number }>();
  for (const r of existing ?? []) {
    map.set(`${r.keyword}::${r.category}`, { id: r.id, category: r.category, hits: Number(r.hits) || 1 });
  }
  const toInsert: any[] = [];
  const toUpdate: Array<{ id: string; hits: number }> = [];
  for (const kw of tokens) {
    const key = `${kw}::${category}`;
    const row = map.get(key);
    if (row) toUpdate.push({ id: row.id, hits: row.hits + 1 });
    else toInsert.push({ user_id: userId, keyword: kw, category, hits: 1, last_used: nowIso });
  }
  if (toInsert.length > 0) await admin.from("income_category_hints").insert(toInsert);
  for (const u of toUpdate) {
    await admin.from("income_category_hints")
      .update({ hits: u.hits, last_used: nowIso })
      .eq("id", u.id);
  }
}

async function suggestIncomeCategoryWithLLM(
  admin: any,
  userId: string,
  description: string,
  lovableKey: string,
): Promise<string | null> {
  const allowed = ["Vendas","Serviços","Comissões","Aluguel","Investimentos","Salário","Reembolso","Outros"];
  const { data: recent } = await admin
    .from("incomes")
    .select("description, category")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  const examples = (recent ?? [])
    .filter((e: any) => e.description && e.category && allowed.includes(e.category))
    .slice(0, 20)
    .map((e: any) => `- "${e.description}" → ${e.category}`)
    .join("\n");
  if (!examples) return null;
  try {
    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: `Classifique a receita em UMA das categorias: ${allowed.join(", ")}.
Use os exemplos do próprio usuário como referência principal. Se nada parecer próximo, use "Outros".

Exemplos do usuário:
${examples}` },
          { role: "user", content: `Receita: "${description}"` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "pick_category",
            description: "Escolhe a melhor categoria de receita",
            parameters: {
              type: "object",
              properties: { category: { type: "string", enum: allowed } },
              required: ["category"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "pick_category" } },
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return null;
    const args = JSON.parse(call.function.arguments);
    return allowed.includes(args.category) ? args.category : null;
  } catch (e) {
    console.error("suggestIncomeCategoryWithLLM err", e);
    return null;
  }
}

async function resolveIncomeCategoryHybrid(
  admin: any,
  userId: string,
  description: string,
  initialGuess: string,
  lovableKey: string,
): Promise<string> {
  const allowed = ["Vendas","Serviços","Comissões","Aluguel","Investimentos","Salário","Reembolso","Outros"];
  const learned = await suggestIncomeCategoryFromHints(admin, userId, description);
  if (learned && learned.hits >= 1) return learned.category;
  if (!initialGuess || initialGuess === "Outros") {
    const llm = await suggestIncomeCategoryWithLLM(admin, userId, description);
    if (llm) return llm;
  }
  return initialGuess && allowed.includes(initialGuess) ? initialGuess : "Outros";
}

// ============================================================
// Credit card detection
// ============================================================

interface CardLite {
  id: string;
  nickname: string;
  bank: string;
  last_four: string;
  closing_day: number;
  due_day: number;
}

// Cache: user_id → cards (TTL 5min)
const cardsCache = new Map<string, { cards: CardLite[]; expires: number }>();
const CARDS_CACHE_TTL_MS = 5 * 60 * 1000;

async function getUserCards(admin: any, userId: string): Promise<CardLite[]> {
  const cached = cardsCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.cards;
  const { data } = await admin
    .from("credit_cards")
    .select("id, nickname, bank, last_four, closing_day, due_day")
    .eq("user_id", userId);
  const cards = (data ?? []) as CardLite[];
  cardsCache.set(userId, { cards, expires: Date.now() + CARDS_CACHE_TTL_MS });
  return cards;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detects an explicit credit-card mention in the user's message.
 * Matches against the card's nickname, bank name, or last 4 digits.
 * Requires either: an explicit card keyword (cartao/credito/no cartão) OR the last4 digits OR the full nickname.
 */
function detectCardInText(text: string, cards: CardLite[]): CardLite | null {
  if (cards.length === 0) return null;
  const normText = normalize(text);
  const hasCardKeyword = /\b(cartao|credito|fatura)\b/.test(normText);

  // 1) Try last_four match (very specific)
  for (const c of cards) {
    if (c.last_four && c.last_four.length >= 3 && normText.includes(c.last_four)) {
      return c;
    }
  }
  // 2) Try nickname match (substring, must be at least 3 chars)
  for (const c of cards) {
    const nick = normalize(c.nickname || "");
    if (nick && nick.length >= 3 && normText.includes(nick)) {
      return c;
    }
  }
  // 3) Bank match — only if a card-related keyword is present (avoids false positives)
  if (hasCardKeyword) {
    for (const c of cards) {
      const bank = normalize(c.bank || "");
      if (bank && bank.length >= 3 && normText.includes(bank)) {
        return c;
      }
    }
  }
  return null;
}

/** Computes the next due date (YYYY-MM-DD) for a purchase made today on a given card. */
function nextDueDateForCard(closingDay: number, dueDay: number): string {
  const today = todayBR();
  const [y, m, d] = today.split("-").map(Number);
  // Reference: today (1-indexed month back to 0-indexed JS month)
  const ref = new Date(Date.UTC(y, m - 1, d));
  const day = ref.getUTCDate();
  const yr = ref.getUTCFullYear();
  const mo = ref.getUTCMonth();

  // Compras feitas no dia do fechamento (ou depois) entram no próximo ciclo.
  const closingNextMonth = day >= closingDay ? mo + 1 : mo;
  // Due date falls in the month after closing (or same month if dueDay > closingDay).
  const dueMonth = dueDay > closingDay ? closingNextMonth : closingNextMonth + 1;
  const lastDay = new Date(Date.UTC(yr, dueMonth + 1, 0)).getUTCDate();
  const safeDay = Math.min(dueDay, lastDay);
  const due = new Date(Date.UTC(yr, dueMonth, safeDay));
  return due.toISOString().slice(0, 10);
}

/**
 * Builds the insert payload for a credit-card purchase.
 *
 * IMPORTANT: `due_date` stores the *purchase date* (today) so the expense falls
 * inside the card's current closing cycle in the invoice view (which filters by
 * dueDate ∈ (cycle.from, cycle.to]). The invoice payment date is recorded in
 * notes for reference and shown to the user.
 */
function buildCreditCardExpense(card: CardLite, _baseDescription: string, baseNotes?: string): {
  due_date: string;
  paid: false;
  paid_date: null;
  notes: string;
  invoiceDueDate: string;
} {
  const purchaseDate = todayBR();
  const invoiceDueDate = nextDueDateForCard(card.closing_day, card.due_day);
  const tag = card.nickname || card.last_four || card.bank;
  const cardLine = `[Crédito] Cartão: ${tag} {ID:${card.id}} (vence ${invoiceDueDate})`;
  const notes = baseNotes && baseNotes.trim() ? `${cardLine}\n${baseNotes.trim()}` : cardLine;
  return { due_date: purchaseDate, paid: false, paid_date: null, notes, invoiceDueDate };
}

/** Reconstrói o ciclo (from, to) ancorado em uma data de referência (espelha src/lib/creditCardInvoiceTotals.ts). */
function getCycleForRef(ref: Date, closingDay: number, dueDay: number) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const day = ref.getUTCDate();
  const lastDayThis = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const closingThis = new Date(Date.UTC(y, m, Math.min(closingDay, lastDayThis)));
  const lastDayNext = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  const closingNext =
    day >= closingDay
      ? new Date(Date.UTC(y, m + 1, Math.min(closingDay, lastDayNext)))
      : closingThis;
  const lastDayPrev = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const closingPrev =
    day >= closingDay
      ? closingThis
      : new Date(Date.UTC(y, m - 1, Math.min(closingDay, lastDayPrev)));
  return { from: closingPrev, to: closingNext };
}

function cycleKeyFromDate(closingTo: Date): string {
  return `${closingTo.getUTCFullYear()}-${String(closingTo.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Calcula o total atual da fatura em aberto do cartão (compras do ciclo vigente
 * + saldo inicial registrado em credit_card_invoice_openings). Usado para dar
 * feedback imediato após registrar uma despesa de cartão pelo bot.
 */
async function computeCurrentInvoiceTotal(
  admin: any,
  userId: string,
  card: CardLite,
): Promise<number> {
  try {
    const today = todayBR();
    const [y, m, d] = today.split("-").map(Number);
    const ref = new Date(Date.UTC(y, m - 1, d));
    const cycle = getCycleForRef(ref, card.closing_day, card.due_day);
    const fromYmd = cycle.from.toISOString().slice(0, 10);
    const toYmd = cycle.to.toISOString().slice(0, 10);
    const cardTag = (card.nickname || card.last_four || "").toLowerCase();

    // Despesas de cartão do ciclo (mesmo critério usado em creditCardInvoiceTotals.ts):
    // due_date dentro do ciclo + tag [Crédito] nas notes.
    const { data: rows } = await admin
      .from("expenses")
      .select("amount, type, installments, notes")
      .eq("user_id", userId)
      .gte("due_date", fromYmd)
      .lt("due_date", toYmd);

    let itemsTotal = 0;
    for (const e of (rows ?? []) as any[]) {
      const notes = String(e.notes ?? "");
      if (!/\[\s*cr[eé]dito\s*\]/i.test(notes)) continue;
      // Filtra por cartão: se a nota referencia outro cartão, ignora.
      if (cardTag) {
        const n = notes.toLowerCase();
        if (!n.includes(cardTag) && /cart[aã]o[:\s]/i.test(n)) continue;
      }
      const isRec = e.type === "recorrente" && !!e.installments && e.installments > 1;
      const value = isRec ? Number(e.amount) / Number(e.installments) : Number(e.amount);
      if (Number.isFinite(value)) itemsTotal += value;
    }

    // Saldo inicial da fatura (opening) para esse ciclo.
    const cycleKey = cycleKeyFromDate(cycle.to);
    const { data: opening } = await admin
      .from("credit_card_invoice_openings")
      .select("opening_amount")
      .eq("user_id", userId)
      .eq("card_id", card.id)
      .eq("cycle_key", cycleKey)
      .maybeSingle();
    const openingAmount = Number((opening as any)?.opening_amount ?? 0);

    return itemsTotal + (Number.isFinite(openingAmount) ? openingAmount : 0);
  } catch (e) {
    console.error("computeCurrentInvoiceTotal err", e);
    return 0;
  }
}

// Detects installment phrasing in the message and returns N parcels.
// Examples: "10x", "em 3x", "em 12 vezes", "parcelado em 6", "6 parcelas",
//           "dividido em 4", "4 vezes de 50".
function detectInstallments(text: string): number | null {
  const t = text.toLowerCase();
  const patterns = [
    /\bem\s+(\d{1,2})\s*x\b/i,
    /\bem\s+(\d{1,2})\s+vezes\b/i,
    /\bparcel(?:ad[oa])?\s+em\s+(\d{1,2})\b/i,
    /\b(\d{1,2})\s+parcelas?\b/i,
    /\bdividid[oa]?\s+em\s+(\d{1,2})\b/i,
    /\b(\d{1,2})\s+vezes\s+de\b/i,
    /\b(\d{1,2})\s*x\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 2 && n <= 36) return n;
    }
  }
  return null;
}

// Strips installment phrasing from description so it doesn't pollute the saved text.
function stripInstallmentPhrase(desc: string): string {
  return desc
    .replace(/\bem\s+\d{1,2}\s*x\b/gi, "")
    .replace(/\bem\s+\d{1,2}\s+vezes\b/gi, "")
    .replace(/\bparcel(?:ad[oa])?\s+em\s+\d{1,2}\b/gi, "")
    .replace(/\b\d{1,2}\s+parcelas?\b/gi, "")
    .replace(/\bdividid[oa]?\s+em\s+\d{1,2}\b/gi, "")
    .replace(/\b\d{1,2}\s+vezes\s+de\s+[\d.,]+\b/gi, "")
    .replace(/\b\d{1,2}\s*x\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Regex-first parser for common expense formats.
// Examples: "45 mercado", "R$ 12,50 uber", "uber 25", "1.234,56 conta luz",
//           "tv 1200 em 10x", "tenis 300 3x"
function quickParseExpense(text: string): { amount: number; description: string; category: string; installments: number | null } | null {
  const t = text.trim();
  if (t.length < 2 || t.startsWith("/")) return null;
  // Defer to AI when text mentions a date — quick parser would assume "today".
  if (hasDateHint(t)) return null;
  // Defer to AI when natural-language amount/payment hints are present.
  if (hasNaturalLanguageHint(t)) return null;
  const installments = detectInstallments(t);
  // Remove installment tokens before extracting amount/description so they don't confuse the regex.
  const cleaned = installments ? stripInstallmentPhrase(t) : t;
  let amountStr: string | null = null;
  let description: string | null = null;
  const mA = cleaned.match(/^R?\$?\s*([\d]+(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)\s+(.{2,80})$/i);
  if (mA) { amountStr = mA[1]; description = mA[2]; }
  else {
    const mB = cleaned.match(/^(.{2,80}?)\s+R?\$?\s*([\d]+(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)$/i);
    if (mB) { description = mB[1]; amountStr = mB[2]; }
  }
  if (!amountStr || !description) return null;
  const amount = parseAmount(amountStr);
  if (amount === null) return null;
  const desc = stripInstallmentPhrase(description.trim());
  if (desc.length < 2) return null;
  return { amount, description: desc, category: detectCategory(desc), installments };
}

const HELP_TEXT = `🤖 *Como usar*

Envie uma despesa em texto livre, ex:
• "gastei 45 no uber ontem"
• "mercado 230"
• "netflix 39,90 assinatura"

💵 *Quer registrar uma receita?*
Use palavras como "recebi", "entrou", "salário", "venda", ex:
• "recebi 500 do cliente João pix"
• "salário 3500 hoje"
• "vendi 1200 produto"

💳 *Compra no cartão de crédito?*
Mencione o nome (apelido), banco ou os últimos 4 dígitos do cartão na mensagem, ex:
• "ifood 60 nubank"
• "amazon 250 cartão final 1234"
A despesa será lançada como *pendente* na fatura do cartão (vence no próximo vencimento) e só vira "paga" quando você quitar a fatura no app.

📸 Ou envie uma *foto de cupom/nota fiscal* — eu leio o comprovante e extraio o valor automaticamente. Inclua o nome do cartão na legenda se foi no crédito.

🎤 Ou envie um *áudio* falando a despesa — eu transcrevo e cadastro.

Vou interpretar e cadastrar automaticamente.

*Comandos:*
/saldo — gastos do mês por categoria
/mes — resumo completo do mês
/semana — resumo dos últimos 7 dias
/comparar — compara este mês com o anterior
/orcamento — status dos orçamentos do mês
/ultimas — últimas 5 despesas
/apagar — apaga a despesa mais recente
/aporte — fazer um aporte em uma caixinha (cofrinho). Você pode passar valor e nota: \`/aporte 200 aniversário\`
/aportes\_saldo — saldo atual de todas as caixinhas
/meus\_aportes — últimos 10 aportes nas caixinhas
/resgatar — resgatar saldo de uma caixinha para a conta. Ex.: \`resgatar 200 da caixinha 1\` ou \`resgatar tudo do cofrinho\`
/help — esta mensagem
/start CODIGO — vincular conta (gere o código no app)`;

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const fmtDayMonth = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function budgetIcon(pct: number | null): string {
  if (pct === null) return "⚪";
  if (pct >= 100) return "🔴";
  if (pct >= 70) return "🟡";
  return "🟢";
}

async function handleSaldo(admin: any, userId: string): Promise<string> {
  const { year, month } = nowBR();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthName = MONTH_NAMES[month];

  const { data: expenses } = await admin
    .from("expenses")
    .select("amount, category, paid_date, due_date")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .eq("paid", true);

  const monthExpenses = (expenses ?? []).filter((e: any) => {
    const ref = (e.paid_date || e.due_date || "") as string;
    return ref.startsWith(monthPrefix);
  });

  const byCat = new Map<string, number>();
  let total = 0;
  for (const e of monthExpenses) {
    const amt = Number(e.amount) || 0;
    total += amt;
    byCat.set(e.category || "Outros", (byCat.get(e.category || "Outros") || 0) + amt);
  }

  const { data: budgets } = await admin
    .from("personal_budgets")
    .select("category, amount")
    .eq("user_id", userId)
    .eq("month", monthPrefix);
  const budgetMap = new Map<string, number>();
  for (const b of budgets ?? []) budgetMap.set(b.category, Number(b.amount) || 0);

  let msg = `💰 *Gastos de ${monthName}*\nTotal: ${fmtBRL(total)}\n`;
  if (byCat.size === 0) {
    msg += `\n_Sem despesas neste mês._`;
    return msg;
  }
  msg += `\n📂 *Por categoria:*\n`;
  const sorted = [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  for (const [cat, spent] of sorted) {
    const budget = budgetMap.get(cat);
    if (budget && budget > 0) {
      const pct = (spent / budget) * 100;
      msg += `${budgetIcon(pct)} ${cat}: ${fmtBRL(spent)} / ${fmtBRL(budget)} (${pct.toFixed(0)}%)\n`;
    } else {
      msg += `${budgetIcon(null)} ${cat}: ${fmtBRL(spent)} (sem orçamento)\n`;
    }
  }
  return msg.trimEnd();
}

async function handleUltimas(admin: any, userId: string): Promise<string> {
  const { data } = await admin
    .from("expenses")
    .select("amount, description, category, paid_date, due_date, created_at")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .order("paid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return "ℹ️ Nenhuma despesa registrada ainda.";

  let msg = "🧾 *Últimas despesas*\n";
  data.forEach((e: any, i: number) => {
    const date = e.paid_date || e.due_date || "";
    const dateStr = date ? fmtDayMonth(date) : "—";
    msg += `${i + 1}. ${fmtBRL(Number(e.amount) || 0)} — ${e.description} (${e.category}) — ${dateStr}\n`;
  });
  return msg.trimEnd();
}

async function handleApagar(admin: any, userId: string): Promise<string> {
  const { data } = await admin
    .from("expenses")
    .select("id, amount, description, category, paid_date, due_date")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .order("paid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return "ℹ️ Nenhuma despesa para apagar.";

  const e = data[0];
  const { error } = await admin.from("expenses").delete().eq("id", e.id);
  if (error) return "❌ Erro ao apagar: " + error.message;

  const date = e.paid_date || e.due_date || "";
  const dateStr = date ? fmtDayMonth(date) : "—";
  return `🗑️ *Despesa removida:*\n${fmtBRL(Number(e.amount) || 0)} — ${e.description} (${e.category}) — ${dateStr}`;
}

async function handleMeusAportes(admin: any, userId: string): Promise<string> {
  const { data: ownerData } = await admin.rpc("get_data_owner_id", { _user_id: userId });
  const ownerId = (typeof ownerData === "string" && ownerData) ? ownerData : userId;

  // Nova arquitetura: eventos via `cofrinho_eventos`, filtrados pelos cofrinhos
  // do usuário. Usa `data_evento` como data financeira real.
  const { data: banks } = await admin
    .from("cofrinhos")
    .select("id, nome")
    .eq("usuario_id", ownerId);
  const bankList = (banks ?? []) as any[];
  if (bankList.length === 0) {
    return "ℹ️ Nenhum aporte em caixinhas registrado ainda.\nUse /aporte para fazer o primeiro.";
  }
  const nameById = new Map<string, string>();
  for (const b of bankList) nameById.set(b.id, b.nome);

  const { data: events } = await admin
    .from("cofrinho_eventos")
    .select("tipo, valor, data_evento, created_at, cofrinho_id")
    .in("cofrinho_id", bankList.map((b) => b.id))
    .in("tipo", ["DEPOSITO", "RESGATE"])
    .order("data_evento", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (!events || events.length === 0) {
    return "ℹ️ Nenhum aporte em caixinhas registrado ainda.\nUse /aporte para fazer o primeiro.";
  }

  let total = 0;
  let msg = "🐷 *Últimos aportes*\n";
  events.forEach((d: any, i: number) => {
    const raw = Number(d.valor) || 0;
    const amt = String(d.tipo).toUpperCase() === "RESGATE" ? -Math.abs(raw) : Math.abs(raw);
    total += amt;
    const rawDate = d.data_evento ?? d.created_at;
    const dateStr = rawDate ? fmtDayMonth(String(rawDate).slice(0, 10)) : "—";
    const sign = amt < 0 ? "↓ " : "";
    msg += `${i + 1}. ${sign}${fmtBRL(amt)} — ${nameById.get(d.cofrinho_id) ?? "Caixinha"} — ${dateStr}\n`;
  });
  msg += `\n*Total exibido:* ${fmtBRL(total)}`;
  return msg;
}

// Registers an internal contribution (aporte) to a piggy bank.
// Delega para a Edge Function `processar-deposito-cofrinho`, fonte de verdade
// da nova arquitetura. Nenhuma escrita direta em tabelas legadas.
async function finalizePiggyAporte(
  admin: any,
  userId: string,
  bank: { id: string; name: string },
  amount: number,
  _note: string | null,
): Promise<string> {
  const today = todayBR();
  const res = await invokeExternalCofrinhoFn("processar-deposito-cofrinho", {
    cofrinho_id: bank.id,
    valor: amount,
    data_aporte: today,
  });
  if (!res.ok) return "❌ Erro ao registrar aporte: " + (res.error ?? "desconhecido");

  // Saldo atualizado via tabela `cofrinhos`.
  const { data: cof } = await admin
    .from("cofrinhos")
    .select("saldo_total")
    .eq("id", bank.id)
    .maybeSingle();
  const balance = Number((cof as any)?.saldo_total ?? 0);
  return `✅ Aporte de ${fmtBRL(amount)} adicionado em *${bank.name}*\n💰 Saldo atual: *${fmtBRL(balance)}*`;
}

// Resgate (withdrawal) — usa Edge Function dedicada da nova arquitetura.
async function finalizePiggyResgate(
  admin: any,
  userId: string,
  bank: { id: string; name: string },
  amount: number,
): Promise<string> {
  const ownerId = await resolvePiggyOwner(admin, userId);
  const today = todayBR();

  // Verifica saldo via `cofrinhos.saldo_total`.
  const { data: cof, error: balErr } = await admin
    .from("cofrinhos")
    .select("saldo_total")
    .eq("id", bank.id)
    .maybeSingle();
  if (balErr) return "❌ Erro ao consultar saldo da caixinha: " + balErr.message;
  const currentBalance = Number((cof as any)?.saldo_total ?? 0);
  if (amount > currentBalance + 0.005) {
    return `❌ Saldo insuficiente em *${bank.name}*.\n💰 Disponível: *${fmtBRL(currentBalance)}*`;
  }

  // 1) Resgate via Edge Function.
  const res = await invokeExternalCofrinhoFn("processar-resgate-cofrinho", {
    cofrinho_id: bank.id,
    valor: amount,
    data_resgate: today,
  });
  if (!res.ok) return "❌ Erro ao registrar resgate: " + (res.error ?? "desconhecido");

  // 2) Crédito no extrato como receita "Resgate Cofrinho".
  const { error: incErr } = await admin.from("incomes").insert({
    user_id: ownerId,
    description: `Resgate da caixinha ${bank.name}`,
    amount,
    category: "Resgate Cofrinho",
    source: "Cofrinho",
    received_date: today,
    status: "received",
    recurrence: "once",
    notes: `[bot][cofrinho:${bank.id}]`,
  });
  if (incErr) {
    return "⚠️ Resgate efetuado, mas falhou ao lançar receita: " + incErr.message;
  }

  const newBalance = currentBalance - amount;
  return [
    `✅ Resgate de ${fmtBRL(amount)} de *${bank.name}*`,
    `🐷 Saldo da caixinha: *${fmtBRL(newBalance)}*`,
    `🏦 Crédito lançado em receitas como _Resgate Cofrinho_`,
  ].join("\n");
}


// Detects natural-language requests to transfer money from a piggy bank back
// into the main account, e.g.:
//   "transferir saldo da caixinha para conta"
//   "resgatar 200 do cofrinho"
//   "mandar 100 da caixinha 1 para a conta"
function looksLikeResgate(text: string): boolean {
  const t = text.toLowerCase();
  if (/^\/resgat/i.test(t)) return true;
  const verb = /(transfer|resgat|sacar|saca|mandar|enviar|retirar|tira(r)?)/i;
  const piggy = /(caixinha|cofrinho|cofre)/i;
  if (!verb.test(t) || !piggy.test(t)) return false;
  // Avoid matching "transferir 100 para caixinha" (that's an aporte).
  // Heuristic: piggy must come before "conta" OR after the verb.
  if (/para\s+(a\s+)?(caixinha|cofrinho)/i.test(t)) return false;
  return true;
}

// Parses "<verb> [valor] [da|do caixinha|cofrinho [ref]] [para conta]".
// Returns amount (null = "todo o saldo") and bank reference token (null = ask).
function parseResgateText(text: string): { amount: number | null; bankToken: string | null; allBalance: boolean } {
  const t = text.trim();
  // amount: first number-like token in the message.
  const amtMatch = t.match(/R?\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  const amount = amtMatch ? parseAmount(amtMatch[1].replace(/\s/g, "")) : null;
  const allBalance = !amount && /(tudo|todo|saldo\s+(total|inteiro|todo)|esvaziar)/i.test(t);

  // bank ref: after "caixinha"/"cofrinho" optionally a number or quoted name.
  let bankToken: string | null = null;
  const refMatch = t.match(/(?:caixinha|cofrinho|cofre)\s+(?:["“']([^"“”']+)["”']|#?(\d{1,2})|([A-Za-zÀ-ÿ][\wÀ-ÿ-]{1,40}))/i);
  if (refMatch) {
    bankToken = (refMatch[1] || refMatch[2] || refMatch[3] || "").trim() || null;
    // Filter common stop words that look like names.
    if (bankToken && /^(para|pra|conta|principal|do|da|no|na|de)$/i.test(bankToken)) bankToken = null;
  }
  return { amount, bankToken, allBalance };
}

async function handleResgateCommand(
  admin: any,
  userId: string,
  chatId: number,
  text: string,
  telegramKey: string,
): Promise<void> {
  const { banks } = await listUserPiggyBanks(admin, userId);
  if (banks.length === 0) {
    await tgSend(chatId, "🐷 Você ainda não tem nenhuma caixinha cadastrada.", telegramKey);
    return;
  }

  const parsed = parseResgateText(text);
  let bank: PiggyBankRef | null = null;
  if (parsed.bankToken) {
    const r = resolvePiggyBankByToken(banks, parsed.bankToken);
    if (r.ambiguous && r.ambiguous.length > 0) {
      const list = r.ambiguous.map((b) => `• *${b.name}* — \`${b.id.slice(0, 8)}\``).join("\n");
      await tgSend(chatId, `⚠️ Encontrei mais de uma caixinha com "${parsed.bankToken}":\n${list}`, telegramKey);
      return;
    }
    bank = r.bank ?? null;
    if (!bank) {
      await tgSend(chatId, `❌ Caixinha "${parsed.bankToken}" não encontrada.\n\n${formatPiggyBanksList(banks)}`, telegramKey);
      return;
    }
  } else if (banks.length === 1) {
    bank = banks[0];
  } else {
    await tgSend(
      chatId,
      `🐷 Você tem mais de uma caixinha. Diga qual usar.\n\n${formatPiggyBanksList(banks)}\n\nEx.: \`resgatar 200 da caixinha 1\``,
      telegramKey,
    );
    return;
  }

  let amount = parsed.amount;
  if (amount === null && parsed.allBalance) {
    const { data: cof } = await admin
      .from("cofrinhos")
      .select("saldo_total")
      .eq("id", bank.id)
      .maybeSingle();
    const totalAvailable = Number((cof as any)?.saldo_total ?? 0);
    amount = totalAvailable;
    if (totalAvailable <= 0) {
      await tgSend(chatId, `ℹ️ A caixinha *${bank.name}* não tem saldo para resgatar.`, telegramKey);
      return;
    }
  }


  if (amount === null || amount <= 0) {
    await tgSend(
      chatId,
      `🐷 Quanto você quer resgatar de *${bank.name}*?\nEx.: \`resgatar 200 da caixinha ${bank.shortId ?? bank.name}\` ou \`resgatar tudo da caixinha ${bank.shortId ?? bank.name}\``,
      telegramKey,
    );
    return;
  }

  const reply = await finalizePiggyResgate(admin, userId, bank, amount);
  await tgSend(chatId, reply, telegramKey);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Returns today's date in America/Sao_Paulo as YYYY-MM-DD.
// The Edge runtime is UTC, so toISOString() can return tomorrow after 21:00 BRT.
/** Capitaliza a primeira letra (preservando acentos), deixando o restante intacto. */
function capitalizeFirst(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  if (!t) return t;
  return t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1);
}

function todayBR(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA already formats as YYYY-MM-DD
}

// Returns current date components in America/Sao_Paulo timezone.
function nowBR(): { year: number; month: number; day: number } {
  const [y, m, d] = todayBR().split("-").map(Number);
  return { year: y, month: m - 1, day: d }; // month 0-indexed for compatibility
}

// Validates and clamps an AI-provided date (YYYY-MM-DD).
// - Returns todayBR() if invalid format.
// - Clamps future dates to today.
// - Clamps dates older than 1 year to today (likely AI hallucination).
function sanitizeDate(input: unknown): string {
  const today = todayBR();
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return today;
  if (input > today) return today; // future
  // Compute 1y ago
  const [y, m, d] = today.split("-").map(Number);
  const oneYearAgo = `${y - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (input < oneYearAgo) return today;
  return input;
}

async function summarizeRange(
  admin: any,
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<{ total: number; count: number; byCat: Map<string, number>; topItems: any[] }> {
  const { data } = await admin
    .from("expenses")
    .select("amount, category, description, paid_date, due_date")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .eq("paid", true);

  const filtered = (data ?? []).filter((e: any) => {
    const ref = (e.paid_date || e.due_date || "") as string;
    return ref >= fromISO && ref <= toISO;
  });

  const byCat = new Map<string, number>();
  let total = 0;
  for (const e of filtered) {
    const amt = Number(e.amount) || 0;
    total += amt;
    byCat.set(e.category || "Outros", (byCat.get(e.category || "Outros") || 0) + amt);
  }

  const topItems = [...filtered]
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
    .slice(0, 5);

  return { total, count: filtered.length, byCat, topItems };
}

async function handleMes(admin: any, userId: string): Promise<string> {
  const { year, month, day } = nowBR();
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const monthName = MONTH_NAMES[month];

  const { total, count, byCat, topItems } = await summarizeRange(
    admin, userId, ymd(first), ymd(last),
  );

  if (count === 0) return `📅 *Resumo de ${monthName}*\n\n_Sem despesas neste mês._`;

  const dayOfMonth = day;
  const avgPerDay = total / dayOfMonth;

  let msg = `📅 *Resumo de ${monthName}*\n`;
  msg += `Total: ${fmtBRL(total)} (${count} ${count === 1 ? "despesa" : "despesas"})\n`;
  msg += `Média/dia: ${fmtBRL(avgPerDay)}\n`;

  msg += `\n📂 *Por categoria:*\n`;
  const sorted = [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  for (const [cat, spent] of sorted) {
    const pct = total > 0 ? (spent / total) * 100 : 0;
    msg += `• ${cat}: ${fmtBRL(spent)} (${pct.toFixed(0)}%)\n`;
  }

  msg += `\n🔝 *Maiores despesas:*\n`;
  topItems.forEach((e: any, i: number) => {
    const date = e.paid_date || e.due_date || "";
    const dateStr = date ? fmtDayMonth(date) : "—";
    msg += `${i + 1}. ${fmtBRL(Number(e.amount) || 0)} — ${e.description} (${dateStr})\n`;
  });

  return msg.trimEnd();
}

async function handleSemana(admin: any, userId: string): Promise<string> {
  const { year, month, day } = nowBR();
  const to = new Date(Date.UTC(year, month, day));
  const from = new Date(Date.UTC(year, month, day - 6));

  const { total, count, byCat, topItems } = await summarizeRange(
    admin, userId, ymd(from), ymd(to),
  );

  const fromStr = `${String(from.getUTCDate()).padStart(2, "0")}/${String(from.getUTCMonth() + 1).padStart(2, "0")}`;
  const toStr = `${String(to.getUTCDate()).padStart(2, "0")}/${String(to.getUTCMonth() + 1).padStart(2, "0")}`;

  if (count === 0) return `🗓️ *Resumo da semana* (${fromStr} – ${toStr})\n\n_Sem despesas nos últimos 7 dias._`;

  const avgPerDay = total / 7;

  let msg = `🗓️ *Resumo da semana* (${fromStr} – ${toStr})\n`;
  msg += `Total: ${fmtBRL(total)} (${count} ${count === 1 ? "despesa" : "despesas"})\n`;
  msg += `Média/dia: ${fmtBRL(avgPerDay)}\n`;

  msg += `\n📂 *Por categoria:*\n`;
  const sorted = [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  for (const [cat, spent] of sorted) {
    const pct = total > 0 ? (spent / total) * 100 : 0;
    msg += `• ${cat}: ${fmtBRL(spent)} (${pct.toFixed(0)}%)\n`;
  }

  msg += `\n🔝 *Maiores despesas:*\n`;
  topItems.forEach((e: any, i: number) => {
    const date = e.paid_date || e.due_date || "";
    const dateStr = date ? fmtDayMonth(date) : "—";
    msg += `${i + 1}. ${fmtBRL(Number(e.amount) || 0)} — ${e.description} (${dateStr})\n`;
  });

  return msg.trimEnd();
}

async function handleComparar(admin: any, userId: string): Promise<string> {
  const { year, month } = nowBR();

  // Current month range
  const curFirst = new Date(Date.UTC(year, month, 1));
  const curLast = new Date(Date.UTC(year, month + 1, 0));

  // Previous month range
  const prevFirst = new Date(Date.UTC(year, month - 1, 1));
  const prevLast = new Date(Date.UTC(year, month, 0));

  const [cur, prev] = await Promise.all([
    summarizeRange(admin, userId, ymd(curFirst), ymd(curLast)),
    summarizeRange(admin, userId, ymd(prevFirst), ymd(prevLast)),
  ]);

  const curMonthName = MONTH_NAMES[curFirst.getMonth()];
  const prevMonthName = MONTH_NAMES[prevFirst.getMonth()];

  if (cur.count === 0 && prev.count === 0) {
    return `📊 *Comparativo ${prevMonthName} → ${curMonthName}*\n\n_Sem despesas em nenhum dos dois meses._`;
  }

  const fmtVar = (curVal: number, prevVal: number): string => {
    if (prevVal === 0 && curVal === 0) return "—";
    if (prevVal === 0) return "🆕 novo";
    if (curVal === 0) return "✅ -100%";
    const diff = curVal - prevVal;
    const pct = (diff / prevVal) * 100;
    const arrow = diff > 0 ? "🔺" : diff < 0 ? "🔻" : "➖";
    const sign = diff > 0 ? "+" : "";
    return `${arrow} ${sign}${pct.toFixed(0)}%`;
  };

  let msg = `📊 *Comparativo ${prevMonthName} → ${curMonthName}*\n\n`;

  // Total
  msg += `💰 *Total*\n`;
  msg += `${prevMonthName}: ${fmtBRL(prev.total)}\n`;
  msg += `${curMonthName}: ${fmtBRL(cur.total)}\n`;
  msg += `Variação: ${fmtVar(cur.total, prev.total)}`;
  if (prev.total > 0 && cur.total > 0) {
    const diff = cur.total - prev.total;
    msg += ` (${diff >= 0 ? "+" : ""}${fmtBRL(diff)})`;
  }
  msg += `\n\n`;

  // Por categoria — união das categorias dos dois meses
  msg += `📂 *Por categoria:*\n`;
  const allCats = new Set<string>([...cur.byCat.keys(), ...prev.byCat.keys()]);
  const rows = [...allCats].map((cat) => ({
    cat,
    curVal: cur.byCat.get(cat) || 0,
    prevVal: prev.byCat.get(cat) || 0,
  }));
  // Ordena alfabeticamente pelo nome da categoria (A–Z)
  rows.sort((a, b) => a.cat.localeCompare(b.cat, "pt-BR"));

  for (const r of rows) {
    msg += `\n*${r.cat}*\n`;
    msg += `${prevMonthName}: ${fmtBRL(r.prevVal)} → ${curMonthName}: ${fmtBRL(r.curVal)}\n`;
    msg += `${fmtVar(r.curVal, r.prevVal)}\n`;
  }

  return msg.trimEnd();
}

async function handleOrcamento(admin: any, userId: string): Promise<string> {
  const { year, month, day } = nowBR();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthName = MONTH_NAMES[month];
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = day;
  const daysLeft = lastDay - today;

  const [{ data: budgets }, { data: expenses }] = await Promise.all([
    admin.from("personal_budgets").select("category, amount").eq("user_id", userId).eq("month", monthPrefix),
    admin
      .from("expenses")
      .select("amount, category, paid_date, due_date")
      .eq("user_id", userId)
      .eq("scope", "personal")
      .eq("paid", true),
  ]);

  if (!budgets || budgets.length === 0) {
    return `🎯 *Orçamentos de ${monthName}*\n\n_Nenhum orçamento cadastrado._\n\nDefina orçamentos por categoria no app para acompanhar aqui.`;
  }

  // Spent per category in current month
  const spentByCat = new Map<string, number>();
  for (const e of expenses ?? []) {
    const ref = (e.paid_date || e.due_date || "") as string;
    if (!ref.startsWith(monthPrefix)) continue;
    const cat = e.category || "Outros";
    spentByCat.set(cat, (spentByCat.get(cat) || 0) + (Number(e.amount) || 0));
  }

  // Build rows with computed metrics, sorted by % consumed desc
  const rows = (budgets ?? []).map((b: any) => {
    const budget = Number(b.amount) || 0;
    const spent = spentByCat.get(b.category) || 0;
    const remaining = budget - spent;
    const pct = budget > 0 ? (spent / budget) * 100 : 0;
    const dailyAllowance = daysLeft > 0 && remaining > 0 ? remaining / (daysLeft + 1) : 0;
    return { category: b.category, budget, spent, remaining, pct, dailyAllowance };
  });
  rows.sort((a: any, b: any) => b.pct - a.pct);

  let totalBudget = 0, totalSpent = 0;
  for (const r of rows) { totalBudget += r.budget; totalSpent += r.spent; }
  const totalRemaining = totalBudget - totalSpent;
  const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  let msg = `🎯 *Orçamentos de ${monthName}*\n`;
  msg += `📅 Faltam *${daysLeft}* ${daysLeft === 1 ? "dia" : "dias"} para fim do mês\n\n`;

  msg += `💰 *Total*\n`;
  msg += `${budgetIcon(totalPct)} ${fmtBRL(totalSpent)} / ${fmtBRL(totalBudget)} (${totalPct.toFixed(0)}%)\n`;
  if (totalRemaining >= 0) {
    msg += `Restante: ${fmtBRL(totalRemaining)}\n\n`;
  } else {
    msg += `🚨 Estouro: ${fmtBRL(Math.abs(totalRemaining))}\n\n`;
  }

  msg += `📂 *Por categoria:*\n`;
  for (const r of rows) {
    msg += `\n${budgetIcon(r.pct)} *${r.category}* — ${r.pct.toFixed(0)}%\n`;
    msg += `${fmtBRL(r.spent)} / ${fmtBRL(r.budget)}\n`;
    if (r.remaining >= 0) {
      msg += `Restante: ${fmtBRL(r.remaining)}`;
      if (r.dailyAllowance > 0) {
        msg += ` (~${fmtBRL(r.dailyAllowance)}/dia)`;
      }
      msg += `\n`;
    } else {
      msg += `🚨 Estouro: ${fmtBRL(Math.abs(r.remaining))}\n`;
    }
  }

  return msg.trimEnd();
}

async function checkBudgetAndAlert(
  admin: any,
  userId: string,
  chatId: number,
  category: string,
  telegramKey: string,
) {
  try {
    const month = new Date().toISOString().slice(0, 7);

    const { data: budgetRow } = await admin
      .from("personal_budgets")
      .select("amount")
      .eq("user_id", userId)
      .eq("category", category)
      .eq("month", month)
      .maybeSingle();
    const budget = Number(budgetRow?.amount) || 0;
    if (budget <= 0) return;

    const { data: expenses } = await admin
      .from("expenses")
      .select("amount, paid_date, due_date")
      .eq("user_id", userId)
      .eq("scope", "personal")
      .eq("category", category)
      .eq("paid", true);

    const total = (expenses || []).reduce((sum: number, e: any) => {
      const d = (e.paid_date || e.due_date || "").slice(0, 7);
      return d === month ? sum + (Number(e.amount) || 0) : sum;
    }, 0);

    if (total < budget) return;

    const { data: existingAlert } = await admin
      .from("personal_budget_alerts")
      .select("id")
      .eq("user_id", userId)
      .eq("category", category)
      .eq("month", month)
      .eq("alert_type", "exceeded")
      .maybeSingle();

    if (existingAlert) return;

    await admin.from("personal_budget_alerts").insert({
      user_id: userId,
      category,
      month,
      alert_type: "exceeded",
    });

    const pct = Math.round((total / budget) * 100);
    const fmtTotal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total);
    const fmtBudget = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(budget);

    await tgSend(
      chatId,
      `🚨 *Orçamento estourado!*\n\n📂 ${category}\n💸 Gasto: ${fmtTotal} / ${fmtBudget} (${pct}%)\n\nVocê ultrapassou o limite mensal desta categoria.`,
      telegramKey,
    );
  } catch (e) {
    console.error("checkBudgetAndAlert error", e);
  }
}

/**
 * Diagnóstico: registra em `telegram_job_logs` toda tentativa de insert de despesa
 * feita pelo bot, incluindo o erro exato quando a gravação falha. Útil para
 * identificar RLS, constraints, colunas ausentes e outras causas silenciosas.
 */
async function logExpenseInsertAttempt(
  admin: any,
  source: "text" | "voice" | "photo",
  userId: string,
  chatId: number,
  payload: Record<string, any>,
  result: { ok: boolean; expenseId?: string | null; error?: any },
) {
  try {
    await admin.from("telegram_job_logs").insert({
      job: `telegram-process:expense-insert:${source}`,
      ok: result.ok,
      processed: result.ok ? 1 : 0,
      error: result.ok ? null : (result.error?.message ?? String(result.error ?? "unknown")),
      details: {
        chat_id: chatId,
        user_id: userId,
        expense_id: result.expenseId ?? null,
        payload,
        error: result.ok ? null : {
          message: result.error?.message ?? null,
          code: result.error?.code ?? null,
          details: result.error?.details ?? null,
          hint: result.error?.hint ?? null,
        },
      },
    });
  } catch (e) {
    console.error("logExpenseInsertAttempt failed", e);
  }
}

function isRawTelegramToken(key: string) {
  return /^\d+:[A-Za-z0-9_-]{20,}$/.test(key);
}

function telegramMethodUrl(method: string, telegramKey: string) {
  return isRawTelegramToken(telegramKey)
    ? `https://api.telegram.org/bot${telegramKey}/${method}`
    : `${GATEWAY_URL}/bot${telegramKey}/${method}`;
}

function telegramHeaders(telegramKey: string, json = true) {
  const headers: Record<string, string> = json ? { "Content-Type": "application/json" } : {};
  if (!isRawTelegramToken(telegramKey)) {
    headers.Authorization = "";
    headers["X-Connection-Api-Key"] = telegramKey;
  }
  return headers;
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

async function tgSend(chatId: number, text: string, telegramKey: string): Promise<number | null> {
  const r = await fetch(telegramMethodUrl("sendMessage", telegramKey), {
    method: "POST",
    headers: telegramHeaders(telegramKey),
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e), json: async () => null } as any));
  if (!r.ok) { console.error("sendMessage err", r.status, await r.text().catch(() => "")); return null; }
  try { const j: any = await (r as Response).json(); return j?.result?.message_id ?? null; } catch { return null; }
}

async function tgSendWithKeyboard(chatId: number, text: string, keyboard: any, telegramKey: string) {
  const r = await fetch(telegramMethodUrl("sendMessage", telegramKey), {
    method: "POST",
    headers: telegramHeaders(telegramKey),
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as Response));
  if (!r.ok) console.error("sendMessage kb err", r.status, await r.text().catch(() => ""));
}

async function tgEditMessage(chatId: number, messageId: number, text: string, keyboard: any | null, telegramKey: string) {
  const body: any = { chat_id: chatId, message_id: messageId, text, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  const r = await fetch(telegramMethodUrl("editMessageText", telegramKey), {
    method: "POST",
    headers: telegramHeaders(telegramKey),
    body: JSON.stringify(body),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as Response));
  if (!r.ok) console.error("editMessage err", r.status, await r.text().catch(() => ""));
}

async function tgEditReplyMarkup(chatId: number, messageId: number, keyboard: any, telegramKey: string) {
  const r = await fetch(telegramMethodUrl("editMessageReplyMarkup", telegramKey), {
    method: "POST",
    headers: telegramHeaders(telegramKey),
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: keyboard },
    }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as Response));
  if (!r.ok) console.error("editReplyMarkup err", r.status, await r.text().catch(() => ""));
}

async function tgAnswerCallback(callbackId: string, text: string | undefined, telegramKey: string) {
  const body: any = { callback_query_id: callbackId };
  if (text) body.text = text;
  const r = await fetch(telegramMethodUrl("answerCallbackQuery", telegramKey), {
    method: "POST",
    headers: telegramHeaders(telegramKey),
    body: JSON.stringify(body),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as Response));
  if (!r.ok) console.error("answerCb err", r.status, await r.text().catch(() => ""));
}

function buildExpenseKeyboard(expenseId: string) {
  return [
    [{ text: "✏️ Editar valor", callback_data: `edit:${expenseId}` }],
    [
      { text: "📂 Mudar categoria", callback_data: `cat:${expenseId}` },
      { text: "🗑️ Apagar", callback_data: `del:${expenseId}` },
    ],
  ];
}

/**
 * Resolve the data owner id (used by piggy banks). Falls back to the user id
 * itself if the user has no explicit owner mapping.
 */
async function resolvePiggyOwner(admin: any, userId: string): Promise<string> {
  try {
    const { data } = await admin.rpc("get_data_owner_id", { _user_id: userId });
    if (typeof data === "string" && data) return data;
  } catch (_) { /* ignore */ }
  return userId;
}

/** List the caixinhas (piggy banks) the user can deposit into. */
async function listUserPiggyBanks(admin: any, userId: string) {
  const ownerId = await resolvePiggyOwner(admin, userId);
  const { data } = await admin
    .from("cofrinhos")
    .select("id, nome, descricao, ativo, created_at")
    .eq("usuario_id", ownerId)
    .order("created_at", { ascending: true });
  const banks = ((data ?? []) as any[])
    .filter((b) => b.ativo !== false)
    .map((b) => ({
      id: b.id as string,
      name: b.nome as string,
      shortId: parseCofrinhoMeta(b.descricao).shortId,
    }));
  return { ownerId, banks };
}


function buildPiggyBanksKeyboard(banks: { id: string; name: string; shortId?: number | null }[]) {
  const rows: any[] = [];
  for (let i = 0; i < banks.length; i += 2) {
    const labelFor = (b: { name: string; shortId?: number | null }) =>
      b.shortId != null ? `🐷 #${b.shortId} ${b.name}` : `🐷 ${b.name}`;
    const row = [{ text: labelFor(banks[i]), callback_data: `pgapt:${banks[i].id}` }];
    if (banks[i + 1]) {
      row.push({ text: labelFor(banks[i + 1]), callback_data: `pgapt:${banks[i + 1].id}` });
    }
    rows.push(row);
  }
  rows.push([{ text: "❌ Cancelar", callback_data: "pgaptc" }]);
  return rows;
}

function parseAmount(input: string): number | null {
  const m = input.trim().match(/^R?\$?\s*([\d.,]+)\s*$/i);
  if (!m) return null;
  let raw = m[1];
  // pt-BR: "." milhar, "," decimal. Se houver vírgula, ponto é milhar.
  if (raw.includes(",")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if ((raw.match(/\./g) || []).length > 1) {
    // múltiplos pontos = separadores de milhar
    raw = raw.replace(/\./g, "");
  }
  const n = Number(raw);
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

// Parse "<amount> <optional note>" — note may be wrapped in quotes.
// Returns { amount, note } or null when no amount is found at the start.
function parseAmountWithNote(input: string): { amount: number; note: string | null } | null {
  const trimmed = input.trim();
  const m = trimmed.match(/^R?\$?\s*([\d.,]+)\s*(.*)$/i);
  if (!m) return null;
  const amount = parseAmount(m[1]);
  if (amount === null) return null;
  let rest = (m[2] || "").trim();
  // Strip surrounding quotes if present
  const q = rest.match(/^(["'“”‘’])([\s\S]*)\1$/);
  if (q) rest = q[2].trim();
  // Cap length to protect DB / UI
  if (rest.length > 280) rest = rest.slice(0, 280);
  return { amount, note: rest.length > 0 ? rest : null };
}

type PiggyBankRef = { id: string; name: string; shortId?: number | null };

// Resolve a piggy bank from a user-supplied token. Match priority:
//   1) short_id number (1..99) — preferred shortcut
//   2) exact UUID / UUID prefix (>=4 chars)
//   3) exact name / substring (case-insensitive)
function resolvePiggyBankByToken(
  banks: PiggyBankRef[],
  token: string,
): { bank?: PiggyBankRef | null; ambiguous?: PiggyBankRef[] } {
  const t = token.trim();
  if (!t) return { bank: null };

  // 1) short_id (1..99) — accept "5", "#5", "n5"
  const numMatch = t.match(/^#?n?(\d{1,2})$/i);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (n >= 1 && n <= 99) {
      const byShort = banks.find((b) => b.shortId === n);
      if (byShort) return { bank: byShort };
      // Numeric tokens are unambiguous: if not found, don't fall through to name search.
      return { bank: null };
    }
  }

  // 2) exact UUID
  const byId = banks.find((b) => b.id.toLowerCase() === t.toLowerCase());
  if (byId) return { bank: byId };

  // 3) UUID prefix (>=4 chars, hex-only)
  if (/^[0-9a-f-]{4,}$/i.test(t)) {
    const prefMatches = banks.filter((b) => b.id.toLowerCase().startsWith(t.toLowerCase()));
    if (prefMatches.length === 1) return { bank: prefMatches[0] };
    if (prefMatches.length > 1) return { ambiguous: prefMatches };
  }

  // 4) exact name (case-insensitive)
  const lower = t.toLowerCase();
  const exactName = banks.filter((b) => b.name.toLowerCase() === lower);
  if (exactName.length === 1) return { bank: exactName[0] };
  if (exactName.length > 1) return { ambiguous: exactName };

  // 5) substring/contains
  const contains = banks.filter((b) => b.name.toLowerCase().includes(lower));
  if (contains.length === 1) return { bank: contains[0] };
  if (contains.length > 1) return { ambiguous: contains };

  return { bank: null };
}

// Format the list of available piggy banks with short numbers for quick reference.
function formatPiggyBanksList(banks: PiggyBankRef[]): string {
  if (banks.length === 0) {
    return "🐷 Você ainda não tem nenhuma caixinha. Crie uma no app primeiro.";
  }
  const lines = banks.map((b) => {
    const tag = b.shortId != null ? `\`#${b.shortId}\`` : `\`${b.id.slice(0, 8)}\``;
    return `${tag} — *${b.name}*`;
  });
  const example = banks[0].shortId != null
    ? `aporte ${banks[0].shortId} 200`
    : `aporte ${banks[0].id.slice(0, 8)} 200`;
  return [
    "🐷 *Suas caixinhas*",
    ...lines,
    "",
    "Use: `aporte <nº|nome> <valor>`",
    `Ex.: \`${example}\``,
  ].join("\n");
}

function buildCategoryKeyboard(expenseId: string, categories: string[] = CATEGORIES) {
  const rows: any[] = [];
  // Telegram callback_data limit is 64 bytes — truncate long names defensively.
  const safe = (n: string) => n.length > 40 ? n.slice(0, 40) : n;
  for (let i = 0; i < categories.length; i += 2) {
    const row = [{ text: categories[i], callback_data: `setcat:${expenseId}:${safe(categories[i])}` }];
    if (categories[i + 1]) {
      row.push({ text: categories[i + 1], callback_data: `setcat:${expenseId}:${safe(categories[i + 1])}` });
    }
    rows.push(row);
  }
  rows.push([{ text: "❌ Cancelar", callback_data: `canc:${expenseId}` }]);
  return rows;
}

/** Returns the union of built-in CATEGORIES + user's custom personal_expense_categories. */
async function getAvailableCategories(admin: any, userId: string): Promise<string[]> {
  try {
    const { data: ownerData } = await admin.rpc("get_data_owner_id", { _user_id: userId });
    const ownerId = (ownerData as string | null) ?? userId;
    const { data } = await admin
      .from("personal_expense_categories")
      .select("name")
      .eq("user_id", ownerId);
    const customs = (data ?? []).map((r: any) => String(r.name || "").trim()).filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of [...CATEGORIES, ...customs]) {
      const key = n.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(n); }
    }
    return out;
  } catch (e) {
    console.error("getAvailableCategories err", e);
    return [...CATEGORIES];
  }
}

async function extractExpense(text: string) {
  const today = todayBR();
  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${GEMINI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Você extrai despesas pessoais de mensagens em português brasileiro, mesmo escritas em linguagem natural e desestruturada. Hoje é ${today} (timezone America/Sao_Paulo). Categorias permitidas: ${CATEGORIES.join(", ")}.

VALOR (campo "amount", número decimal em reais):
- Aceite formatos numéricos: "45", "R$ 12,50", "1.234,56", "20.00".
- Aceite valores por extenso em PT-BR: "vinte reais"=20, "vinte e cinco"=25, "cem reais"=100, "mil e duzentos"=1200, "dois mil e quinhentos"=2500.
- "20 reais", "20 pila", "20 conto", "20 contos", "20 mangos" → 20.
- Se houver mais de um número, use o que claramente representa o valor da despesa (ignore datas, quantidades de itens, parcelas, anos).
- Sempre retorne o valor TOTAL da despesa (não da parcela).

DESCRIÇÃO (campo "description"):
- Texto curto descrevendo a despesa, SEM o valor, SEM o meio de pagamento, SEM a data e SEM o parcelamento.
- Ex.: "almocei no japonês com cartão nubank ontem por 80 reais" → "almoço no japonês".
- Ex.: "20 reais uber pix" → "uber".
- Mantenha em minúsculas, natural, sem emojis.

MEIO DE PAGAMENTO (campo "payment_method", string opcional):
- Se mencionado, retorne uma string curta:
  - "pix" para Pix.
  - "dinheiro" para dinheiro/cash/espécie.
  - "débito" para cartão de débito.
  - "cartão <nome>" para crédito quando houver banco/apelido (ex.: "cartão nubank", "cartão itaú", "cartão final 1234").
  - "cartão" se for crédito sem identificação.
  - "boleto" para boleto.
- Se NÃO houver menção de meio de pagamento, OMITA o campo.

DATA (campo "date" no formato YYYY-MM-DD):
- "hoje" ou sem menção de data → use ${today}.
- "ontem" → subtraia 1 dia de hoje.
- "anteontem" ou "antes de ontem" → subtraia 2 dias.
- "há N dias" / "faz N dias" → subtraia N dias.
- "há uma semana" / "semana passada" → subtraia 7 dias.
- "segunda", "terça", etc. (sem "que vem") → última ocorrência passada desse dia da semana.
- "dia 15", "no dia 10" → dia 15/10 do MÊS ATUAL (ou mês anterior se for data futura).
- "17/04", "17-04", "15/02/2025" → essa data exata; assuma o ano atual quando omitido.
- NUNCA retorne data no futuro (limite máximo: hoje).
- NUNCA retorne data com mais de 1 ano atrás.

PARCELAMENTO (campo "installments"):
- Detecte expressões como "10x", "em 3x", "em 12 vezes", "parcelado em 6", "6 parcelas", "dividido em 4".
- Quando o usuário disser "3 vezes de 50", o valor TOTAL é 3*50=150 e installments=3.
- Quando o usuário disser "300 em 3x", o valor TOTAL é 300 e installments=3.
- Se NÃO houver menção de parcelas, omita o campo (ou retorne 1).

Se faltar valor numérico interpretável, retorne confidence baixo (<0.6).`,
        },
        { role: "user", content: text },
      ],
      tools: [{
        type: "function",
        function: {
          name: "register_expense",
          description: "Registra uma despesa pessoal extraída da mensagem",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string", description: "Descrição curta (sem o valor, meio de pagamento, data e parcelamento)" },
              amount: { type: "number", description: "Valor TOTAL em reais (não o valor da parcela)" },
              category: { type: "string", enum: CATEGORIES },
              date: { type: "string", description: "Data YYYY-MM-DD; default hoje" },
              installments: { type: "number", description: "Número de parcelas (2 a 36). Omitir ou 1 se à vista." },
              payment_method: { type: "string", description: "Meio de pagamento informado (pix, dinheiro, débito, cartão <nome>, boleto). Omita se não mencionado." },
              confidence: { type: "number", description: "0 a 1" },
            },
            required: ["description", "amount", "category", "date", "confidence"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "register_expense" } },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI err", resp.status, t);
    return null;
  }
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;
  try { return JSON.parse(call.function.arguments); } catch { return null; }
}

// =====================================================
// INCOMES (receitas) — bot detection & registration
// =====================================================

const INCOME_CATEGORIES = [
  "Vendas",
  "Serviços",
  "Comissões",
  "Aluguel",
  "Investimentos",
  "Salário",
  "Reembolso",
  "Outros",
];

// Keywords that strongly suggest the message is about money received.
const INCOME_KEYWORDS = [
  "recebi", "recebido", "recebida", "recebimento",
  "entrou", "entrada", "caiu", "ca\u00edu",
  "receita", "renda",
  "vendi", "venda", "vendas",
  "sal\u00e1rio", "salario",
  "comiss\u00e3o", "comissao", "comiss\u00f5es",
  "freelance", "freela",
  "aluguel recebido", "aluguel pago", "aluguel do",
  "rendimento", "rendeu", "rendimentos",
  "pagamento recebido", "me pagaram", "me pagou", "pagaram",
  "reembolso",
];

function looksLikeIncome(text: string): boolean {
  const t = text.toLowerCase();
  return INCOME_KEYWORDS.some((kw) => t.includes(kw));
}

async function extractIncome(text: string) {
  const today = todayBR();
  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${GEMINI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Voc\u00ea extrai RECEITAS (dinheiro recebido) de mensagens em portugu\u00eas brasileiro. Hoje \u00e9 ${today} (timezone America/Sao_Paulo). Categorias permitidas: ${INCOME_CATEGORIES.join(", ")}.

VALOR (campo "amount", n\u00famero decimal em reais):
- Aceite formatos num\u00e9ricos: "1500", "R$ 250,00", "1.234,56".
- Aceite valores por extenso PT-BR: "mil reais"=1000, "dois mil e quinhentos"=2500.
- Sempre retorne o valor TOTAL recebido.

DESCRI\u00c7\u00c3O (campo "description"):
- Texto curto (sem o valor, sem meio de pagamento, sem data).
- Ex.: "recebi 500 do cliente Jo\u00e3o pix" \u2192 "cliente Jo\u00e3o".
- Ex.: "salario 3500" \u2192 "sal\u00e1rio".

CATEGORIA: escolha entre as permitidas. Se incerto, use "Outros".

DATA (campo "date" YYYY-MM-DD):
- "hoje"/sem men\u00e7\u00e3o \u2192 ${today}.
- "ontem" \u2192 -1 dia. "anteontem" \u2192 -2 dias.
- "h\u00e1 N dias" \u2192 -N dias.
- "dia 15" \u2192 dia 15 do m\u00eas atual (anterior se for futuro).
- "17/04" \u2192 essa data exata; ano atual quando omitido.
- NUNCA data futura.

STATUS:
- Se a mensagem indicar que J\u00c1 RECEBEU (recebi, caiu, entrou, me pagaram) \u2192 "received".
- Se indicar que vai receber, est\u00e1 a receber, pendente, vai cair \u2192 "pending".
- Default: "received".

Se faltar valor interpret\u00e1vel, retorne confidence baixo (<0.6).`,
        },
        { role: "user", content: text },
      ],
      tools: [{
        type: "function",
        function: {
          name: "register_income",
          description: "Registra uma receita extra\u00edda da mensagem",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string" },
              amount: { type: "number" },
              category: { type: "string", enum: INCOME_CATEGORIES },
              date: { type: "string", description: "YYYY-MM-DD" },
              status: { type: "string", enum: ["received", "pending"] },
              source: { type: "string", description: "Origem (cliente, empresa) se mencionada" },
              confidence: { type: "number" },
            },
            required: ["description", "amount", "category", "date", "confidence"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "register_income" } },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI income err", resp.status, t);
    return null;
  }
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;
  try { return JSON.parse(call.function.arguments); } catch { return null; }
}

async function downloadTelegramFile(fileId: string, telegramKey: string): Promise<{ base64: string; filePath: string } | null> {
  try {
    const fileResp = await fetch(telegramMethodUrl("getFile", telegramKey), {
      method: "POST",
      headers: telegramHeaders(telegramKey),
      body: JSON.stringify({ file_id: fileId }),
    });
    const fileData = await fileResp.json();
    if (!fileResp.ok) {
      console.error("getFile failed", fileData);
      return null;
    }
    const filePath = fileData.result?.file_path;
    if (!filePath) return null;

    const dl = await fetch(
      isRawTelegramToken(telegramKey)
        ? `https://api.telegram.org/file/bot${telegramKey}/${filePath}`
        : `${GATEWAY_URL}/bot${telegramKey}/file/${filePath}`,
      { headers: telegramHeaders(telegramKey, false) },
    );
    if (!dl.ok) {
      console.error("file download failed", dl.status);
      return null;
    }
    const buf = new Uint8Array(await dl.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return { base64: btoa(binary), filePath };
  } catch (e) {
    console.error("downloadTelegramFile err", e);
    return null;
  }
}

async function downloadTelegramPhoto(fileId: string, telegramKey: string): Promise<string | null> {
  const f = await downloadTelegramFile(fileId, telegramKey);
  if (!f) return null;
  const ext = f.filePath.split(".").pop()?.toLowerCase() || "jpg";
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${f.base64}`;
}

async function transcribeAudio(fileId: string, mimeHint: string, telegramKey: string): Promise<string | null> {
  const f = await downloadTelegramFile(fileId, telegramKey);
  if (!f) return null;
  const ext = f.filePath.split(".").pop()?.toLowerCase() || "";
  let mime = mimeHint;
  if (!mime) {
    if (ext === "oga" || ext === "ogg") mime = "audio/ogg";
    else if (ext === "mp3") mime = "audio/mpeg";
    else if (ext === "m4a" || ext === "mp4") mime = "audio/mp4";
    else if (ext === "wav") mime = "audio/wav";
    else if (ext === "webm") mime = "audio/webm";
    else mime = "audio/ogg";
  }
  const dataUrl = `data:${mime};base64,${f.base64}`;

  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${GEMINI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Transcreva o áudio em português brasileiro. Retorne apenas o texto transcrito, sem comentários ou formatação adicional." },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcreva este áudio:" },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    console.error("transcribe err", resp.status, await resp.text());
    return null;
  }
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") return null;
  return text.trim();
}

async function extractExpenseFromImage(imageDataUrl: string, caption: string) {
  const today = todayBR();
  const sysPrompt = `Você extrai despesas pessoais de imagens de cupons fiscais, notas fiscais ou comprovantes em português brasileiro. Hoje é ${today} (timezone America/Sao_Paulo). Categorias permitidas: ${CATEGORIES.join(", ")}.

REGRAS:
- Some o valor TOTAL do comprovante (não item por item).
- Para o campo "date" (YYYY-MM-DD): use a DATA IMPRESSA NO COMPROVANTE quando legível (data da compra/emissão). Se ilegível, use ${today}.
- Se o usuário mencionar uma data na legenda (ex: "ontem", "dia 10", "15/03"), priorize essa data sobre a do comprovante.
- NUNCA retorne data no futuro.
- Se a imagem não for um comprovante legível, retorne confidence baixo.${caption ? `\n\nLegenda do usuário: "${caption}"` : ""}`;

  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${GEMINI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: sysPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: caption || "Extraia a despesa total deste comprovante." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "register_expense",
          description: "Registra uma despesa pessoal extraída do comprovante",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string", description: "Nome do estabelecimento ou descrição curta" },
              amount: { type: "number", description: "Valor TOTAL do comprovante em reais" },
              category: { type: "string", enum: CATEGORIES },
              date: { type: "string", description: "Data YYYY-MM-DD; use a data do comprovante ou hoje" },
              confidence: { type: "number", description: "0 a 1" },
            },
            required: ["description", "amount", "category", "date", "confidence"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "register_expense" } },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI image err", resp.status, t);
    return null;
  }
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;
  try { return JSON.parse(call.function.arguments); } catch { return null; }
}

// ============================================================
// 🗣️ Natural-language financial Q&A (perguntas conversacionais)
// ============================================================

// Detecta se a mensagem parece uma pergunta financeira (não um lançamento de despesa).
function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 4) return false;
  if (t.startsWith("/")) return false;
  // Pergunta direta
  if (t.endsWith("?")) return true;
  // Verbos/palavras-chave interrogativas no início
  return /^(quanto|qual|quais|quando|como|onde|me\s+(diga|mostra|mostre)|mostra|mostre|liste|lista|ver|vi|exibe|exiba)\b/i.test(t)
    || /\b(maiores\s+gastos|maior\s+gasto|gastei\s+(esse|este|nesse|neste|esta|essa|nessa|nesta|no|de|com|em|nos|nas|nos|na))\b/i.test(t)
    || /\b(recebi|gastei|paguei)\s+(?:esse|este|nesse|neste|esta|essa|nessa|nesta|no|de|com|em|nos|nas|na|hoje|ontem|essa|esta|este|nessa|nesta|nesse|neste|semana|mes|m[eê]s|ano)\b/i.test(t);
}

interface NLQueryFilters {
  intent: "expenses" | "income" | "loans_received" | "biggest_expenses" | "list_expenses";
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  category?: string | null;
  scope?: "personal" | "business" | null;
  period_label?: string;
  limit?: number;
}

async function parseNLQueryWithAI(
  text: string,
  customCategories: string[],
  lovableKey: string,
): Promise<NLQueryFilters | null> {
  const today = todayBR();
  const allCats = Array.from(new Set([...CATEGORIES, ...customCategories]));
  const sys = `Você interpreta perguntas financeiras em português brasileiro e retorna filtros estruturados. Hoje é ${today} (timezone America/Sao_Paulo, fuso -03:00). Categorias conhecidas: ${allCats.join(", ")}.

INTENT (detecte o tipo de consulta):
- "expenses": "quanto gastei", "quanto paguei", "meus gastos" → soma de despesas no período.
- "income": "quanto recebi", "quanto entrou", "minha receita" → soma de pagamentos recebidos de empréstimos no período.
- "biggest_expenses": "maiores gastos", "onde gastei mais" → top despesas do período.
- "list_expenses": "lista", "mostra as despesas", "minhas últimas despesas" → listagem detalhada.
- Se ambíguo, prefira "expenses".

DATAS (start_date / end_date no formato YYYY-MM-DD):
- "hoje" → start=end=hoje.
- "ontem" → start=end=ontem.
- "anteontem" → start=end=anteontem.
- "esta semana" / "essa semana" → segunda-feira desta semana até hoje.
- "semana passada" → segunda a domingo da semana anterior.
- "este mês" / "esse mês" / "no mês" → primeiro dia do mês atual até hoje.
- "mês passado" → primeiro ao último dia do mês anterior.
- "este ano" → 01/01 do ano atual até hoje.
- "últimos N dias" / "nos últimos N dias" → hoje-(N-1) até hoje.
- "de sexta até hoje" / "de quarta até hoje" → última ocorrência passada do dia da semana até hoje.
- "dia 10", "no dia 15" → mesmo dia/mês atual (start=end).
- "10/05", "10-05" → essa data exata.
- "em maio", "no mês de março" → primeiro ao último dia do mês citado (ano atual ou anterior se mês citado for futuro).
- Se nenhum período for citado → use o mês atual (primeiro dia até hoje).

CATEGORIA (campo "category"):
- Se o usuário citar uma categoria (mesmo abreviada ou com erro de digitação), retorne o nome canônico da lista de categorias.
- Ex.: "alimentaçao", "comida", "rango" → "Alimentação". "uber", "transporte" → "Transporte".
- Se não citar categoria, omita o campo.

SCOPE (escopo):
- "personal" para despesas pessoais (padrão).
- "business" se mencionar "empresa", "negócio", "trabalho".

period_label: descrição curta legível (ex.: "este mês", "de sexta (01/05) até hoje (03/05)", "últimos 7 dias").

limit: para "biggest_expenses" use 5; para "list_expenses" use 10; senão omita.`;

  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${GEMINI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: text },
      ],
      tools: [{
        type: "function",
        function: {
          name: "answer_query",
          description: "Filtros estruturados para responder a pergunta financeira",
          parameters: {
            type: "object",
            properties: {
              intent: { type: "string", enum: ["expenses", "income", "biggest_expenses", "list_expenses"] },
              start_date: { type: "string" },
              end_date: { type: "string" },
              category: { type: "string", description: "Nome canônico da categoria (omitir se não citada)" },
              scope: { type: "string", enum: ["personal", "business"] },
              period_label: { type: "string", description: "Descrição curta do período" },
              limit: { type: "number" },
            },
            required: ["intent", "start_date", "end_date", "period_label"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "answer_query" } },
    }),
  });
  if (!resp.ok) {
    console.error("parseNLQueryWithAI err", resp.status, await resp.text());
    return null;
  }
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;
  try { return JSON.parse(call.function.arguments); } catch { return null; }
}

async function answerNaturalQuery(
  admin: any,
  userId: string,
  text: string,
): Promise<string | null> {
  // Carrega categorias customizadas para enriquecer o prompt
  const { data: customCats } = await admin
    .from("personal_expense_categories")
    .select("name")
    .eq("user_id", userId);
  const customNames: string[] = (customCats ?? []).map((c: any) => c.name).filter(Boolean);

  const filters = await parseNLQueryWithAI(text, customNames);
  if (!filters) return null;

  const { intent, start_date, end_date, category, period_label } = filters;
  const scope = filters.scope || "personal";
  const periodTxt = period_label || `${start_date} a ${end_date}`;

  if (intent === "income") {
    // Receitas = pagamentos recebidos de empréstimos no período
    const { data: pays } = await admin
      .from("payments")
      .select("amount, date")
      .eq("user_id", userId)
      .gte("date", start_date)
      .lte("date", end_date);
    const total = (pays ?? []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    const count = (pays ?? []).length;
    if (count === 0) return `📥 *Receitas (${periodTxt})*\n\nNenhuma receita encontrada nesse período.`;
    return `📥 *Receitas (${periodTxt})*\n\nTotal recebido: *${fmtBRL(total)}*\nPagamentos: ${count}`;
  }

  // Despesas (expenses / biggest_expenses / list_expenses)
  let q = admin
    .from("expenses")
    .select("amount, description, category, paid_date, due_date")
    .eq("user_id", userId)
    .eq("scope", scope)
    .eq("paid", true);
  // Usa paid_date quando existir; aplica filtro como OR no resultado.
  const { data: rows } = await q;
  const inRange = (rows ?? []).filter((e: any) => {
    const ref = (e.paid_date || e.due_date || "") as string;
    if (!ref) return false;
    return ref >= start_date && ref <= end_date;
  });

  let filtered = inRange;
  if (category) {
    const catNorm = category.toLowerCase().trim();
    filtered = inRange.filter((e: any) => (e.category || "").toLowerCase().trim() === catNorm);
  }

  if (filtered.length === 0) {
    const catTxt = category ? ` em *${category}*` : "";
    return `💸 *Gastos${catTxt} (${periodTxt})*\n\nNenhuma despesa encontrada nesse período.`;
  }

  const total = filtered.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

  if (intent === "biggest_expenses") {
    const sorted = [...filtered].sort((a: any, b: any) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
    const top = sorted.slice(0, filters.limit ?? 5);
    let msg = `🏆 *Maiores gastos (${periodTxt})*\nTotal: ${fmtBRL(total)}\n\n`;
    top.forEach((e: any, i: number) => {
      const date = e.paid_date || e.due_date || "";
      const dateStr = date ? fmtDayMonth(date) : "—";
      msg += `${i + 1}. ${fmtBRL(Number(e.amount) || 0)} — ${e.description || "—"} _(${e.category || "Outros"})_ — ${dateStr}\n`;
    });
    return msg.trimEnd();
  }

  if (intent === "list_expenses") {
    const sorted = [...filtered].sort((a: any, b: any) => {
      const da = (a.paid_date || a.due_date || "") as string;
      const db = (b.paid_date || b.due_date || "") as string;
      return db.localeCompare(da);
    });
    const top = sorted.slice(0, filters.limit ?? 10);
    let msg = `🧾 *Despesas (${periodTxt})*\nTotal: ${fmtBRL(total)} (${filtered.length} lançamento${filtered.length === 1 ? "" : "s"})\n\n`;
    top.forEach((e: any, i: number) => {
      const date = e.paid_date || e.due_date || "";
      const dateStr = date ? fmtDayMonth(date) : "—";
      msg += `${i + 1}. ${fmtBRL(Number(e.amount) || 0)} — ${e.description || "—"} _(${e.category || "Outros"})_ — ${dateStr}\n`;
    });
    if (filtered.length > top.length) msg += `\n_… e mais ${filtered.length - top.length}._`;
    return msg.trimEnd();
  }

  // intent === "expenses": total + breakdown por categoria
  const catTxt = category ? ` em *${category}*` : "";
  let msg = `💸 *Gastos${catTxt} (${periodTxt})*\nTotal: *${fmtBRL(total)}*`;
  if (!category) {
    const byCat = new Map<string, number>();
    for (const e of filtered) {
      const c = e.category || "Outros";
      byCat.set(c, (byCat.get(c) || 0) + (Number(e.amount) || 0));
    }
    const sorted = [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
    msg += `\n\n📂 *Por categoria:*\n`;
    for (const [c, v] of sorted) {
      msg += `• ${c}: ${fmtBRL(v)}\n`;
    }
  } else {
    msg += `\n${filtered.length} lançamento${filtered.length === 1 ? "" : "s"}.`;
  }
  return msg.trimEnd();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = getExternalAdmin();


  const { data: messages, error } = await admin
    .from("telegram_messages")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let processed = 0;

  // Group messages by chat_id so we can process different chats in parallel
  // while preserving order within the same chat.
  const byChat = new Map<number, any[]>();
  for (const m of messages ?? []) {
    const arr = byChat.get(m.chat_id as number) ?? [];
    arr.push(m);
    byChat.set(m.chat_id as number, arr);
  }

  const reportsBotIdForSkip = await getReportsBotId(admin);
  const processChat = async (chatMessages: any[]) => {
    for (const msg of chatMessages) {
      const chatId = msg.chat_id as number;
      const text = (msg.text as string | null)?.trim() ?? "";
      const photos = (msg.raw_update as any)?.message?.photo as any[] | undefined;
      const caption = ((msg.raw_update as any)?.message?.caption as string | null)?.trim() ?? "";
      const callback = (msg.raw_update as any)?.callback_query;
      const messageBotId = (msg.bot_id as string | null | undefined) ?? (msg.raw_update as any)?._system_bot_id ?? null;

      // Skip messages originating from the reports bot — they are handled by
      // telegram-reports-poll. Mark them processed so they don't accumulate.
      if (reportsBotIdForSkip && messageBotId === reportsBotIdForSkip) {
        await admin.from("telegram_messages")
          .update({ processed: true })
          .eq("update_id", msg.update_id);
        processed++;
        continue;
      }

      const telegramKey = await getExpenseBotTokenForMessage(admin, msg, TELEGRAM_API_KEY);


      try {
      // 🎛️ Callback query (inline button press)
      if (callback) {
        const cbId = callback.id as string;
        const data = (callback.data as string) ?? "";
        const messageId = callback.message?.message_id as number | undefined;

        const userId = await getLinkedUserId(admin, chatId, messageBotId);
        const link = userId ? { user_id: userId } : null;
        if (!link || !messageId) {
          await tgAnswerCallback(cbId, "Conta não vinculada", telegramKey);
        } else if (data.startsWith("del:")) {
          const expenseId = data.slice(4);
          const { error: delErr } = await admin.from("expenses")
            .delete().eq("id", expenseId).eq("user_id", link.user_id);
          if (delErr) {
            await tgAnswerCallback(cbId, "Erro ao apagar", telegramKey);
          } else {
            await tgAnswerCallback(cbId, "Despesa removida", telegramKey);
            await tgEditMessage(chatId, messageId, "🗑️ *Despesa removida.*", null, telegramKey);
          }
        } else if (data.startsWith("cat:")) {
          const expenseId = data.slice(4);
          await tgAnswerCallback(cbId, undefined, telegramKey);
          const cats = await getAvailableCategories(admin, link.user_id);
          await tgEditReplyMarkup(chatId, messageId, buildCategoryKeyboard(expenseId, cats), telegramKey);
        } else if (data.startsWith("setcat:")) {
          const rest = data.slice(7);
          const sep = rest.indexOf(":");
          const expenseId = rest.slice(0, sep);
          const newCat = rest.slice(sep + 1);
          const allowedCats = await getAvailableCategories(admin, link.user_id);
          const matched = allowedCats.find((c) => c.toLowerCase() === newCat.toLowerCase()) || null;
          if (!matched) {
            await tgAnswerCallback(cbId, "Categoria inválida", telegramKey);
          } else {
            const { data: exp, error: updErr } = await admin.from("expenses")
              .update({ category: matched })
              .eq("id", expenseId).eq("user_id", link.user_id)
              .select("amount, description, paid_date, due_date").maybeSingle();
            if (updErr || !exp) {
              await tgAnswerCallback(cbId, "Erro ao atualizar", telegramKey);
            } else {
              await tgAnswerCallback(cbId, "Categoria atualizada", telegramKey);
              const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(exp.amount) || 0);
              const date = exp.paid_date || exp.due_date || "";
              await tgEditMessage(
                chatId, messageId,
                `✏️ *Despesa atualizada*\n\n💰 ${fmt}\n📂 ${matched}\n📝 ${exp.description}\n📅 ${date}`,
                buildExpenseKeyboard(expenseId),
                telegramKey,
              );
              await checkBudgetAndAlert(admin, link.user_id, chatId, matched, telegramKey);
              if (exp.description) {
                learnCategoryFromExpense(admin, link.user_id, exp.description, matched)
                  .catch((e) => console.error("learn (setcat) err", e));
              }
            }
          }
        } else if (data.startsWith("canc:")) {
          const expenseId = data.slice(5);
          await tgAnswerCallback(cbId, undefined, telegramKey);
          await tgEditReplyMarkup(chatId, messageId, buildExpenseKeyboard(expenseId), telegramKey);
        } else if (data.startsWith("edit:")) {
          const expenseId = data.slice(5);
          const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          const { error: upErr } = await admin.from("telegram_pending_edits").upsert({
            chat_id: chatId,
            expense_id: expenseId,
            user_id: link.user_id,
            message_id: messageId,
            expires_at: expiresAt,
          }, { onConflict: "chat_id" });
          if (upErr) {
            await tgAnswerCallback(cbId, "Erro ao iniciar edição", telegramKey);
          } else {
            await tgAnswerCallback(cbId, "Envie o novo valor", telegramKey);
            await tgEditReplyMarkup(chatId, messageId, [], telegramKey);
            await tgSend(chatId, "✏️ *Editar valor*\nEnvie o novo valor (ex: `45,90`) ou `/cancelar`.", telegramKey);
          }
        } else if (data.startsWith("pgapt:")) {
          // User chose a piggy bank.
          const piggyBankId = data.slice(6);
          const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          // Validate the piggy bank still exists for this user (or owner).
          const { banks } = await listUserPiggyBanks(admin, link.user_id);
          const bank = banks.find((b) => b.id === piggyBankId);
          if (!bank) {
            await tgAnswerCallback(cbId, "Caixinha não encontrada", telegramKey);
          } else {
            // Read any pre-filled amount/note from the pending row (set by /aporte <amount> <note>).
            const { data: existingPending } = await admin
              .from("telegram_pending_piggy_aporte")
              .select("pending_amount, notes")
              .eq("chat_id", chatId)
              .maybeSingle();
            const preAmount = existingPending?.pending_amount != null
              ? Number(existingPending.pending_amount)
              : null;
            const preNote: string | null = existingPending?.notes ?? null;

            if (preAmount && preAmount > 0) {
              // Auto-finalize: amount was provided inline with /aporte.
              await admin.from("telegram_pending_piggy_aporte").delete().eq("chat_id", chatId);
              await tgAnswerCallback(cbId, "Registrando aporte…", telegramKey);
              const reply = await finalizePiggyAporte(admin, link.user_id, bank, preAmount, preNote);
              await tgEditMessage(
                chatId, messageId,
                `🐷 *Aporte na caixinha "${bank.name}"*`,
                null, telegramKey,
              );
              await tgSend(chatId, reply, telegramKey);
            } else {
              const { error: upErr } = await admin.from("telegram_pending_piggy_aporte").upsert({
                chat_id: chatId,
                user_id: link.user_id,
                piggy_bank_id: piggyBankId,
                pending_amount: null,
                notes: preNote, // preserve any note already typed
                expires_at: expiresAt,
              }, { onConflict: "chat_id" });
              if (upErr) {
                await tgAnswerCallback(cbId, "Erro ao iniciar aporte", telegramKey);
              } else {
                await tgAnswerCallback(cbId, "Envie o valor do aporte", telegramKey);
                const noteLine = preNote ? `\n📝 Nota: _${preNote}_` : "";
                await tgEditMessage(
                  chatId, messageId,
                  `🐷 *Aporte na caixinha "${bank.name}"*${noteLine}\n\nEnvie o valor do aporte (ex: \`200\` ou \`200,50 nota opcional\`) ou \`/cancelar\` para sair.`,
                  null, telegramKey,
                );
              }
            }
          }
        } else if (data === "pgaptc") {
          await admin.from("telegram_pending_piggy_aporte").delete().eq("chat_id", chatId);
          await tgAnswerCallback(cbId, "Aporte cancelado", telegramKey);
          await tgEditMessage(chatId, messageId, "❌ Aporte cancelado.", null, telegramKey);
        } else {
          await tgAnswerCallback(cbId, undefined, telegramKey);
        }

        await admin.from("telegram_messages")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("update_id", msg.update_id);
        processed++;
        continue;
      }

      // 📸 Photo handling
      if (photos && photos.length > 0) {
        const userId = await getLinkedUserId(admin, chatId, messageBotId);
        const link = userId ? { user_id: userId } : null;
        if (!link) {
          await tgSend(chatId, "🔒 Conta não vinculada. Use o app para gerar um código e envie `/start CODIGO`.", telegramKey);
        } else {
          const largest = photos[photos.length - 1];
          const dataUrl = await downloadTelegramPhoto(largest.file_id, telegramKey);
          if (!dataUrl) {
            await tgSend(chatId, "❌ Não consegui baixar a imagem. Tente novamente.", telegramKey);
          } else {
            const extracted = await extractExpenseFromImage(dataUrl, caption);
            if (!extracted || !extracted.amount || extracted.confidence < 0.5) {
              await tgSend(chatId, "🤔 Não consegui ler o comprovante. Tente uma foto mais nítida ou envie por texto.", telegramKey);
            } else {
              const finalDate = sanitizeDate(extracted.date);
              const initialCat = CATEGORIES.includes(extracted.category) ? extracted.category : "Outros";
              const finalCategory = await resolveCategoryHybrid(admin, link.user_id, extracted.description || "Comprovante", initialCat);
              const userCards = await getUserCards(admin, link.user_id);
              const card = caption ? detectCardInText(caption, userCards) : null;

              const basePayload: Record<string, any> = {
                user_id: link.user_id,
                description: capitalizeFirst(extracted.description || "Comprovante"),
                amount: extracted.amount,
                category: nonVehicleCategory(finalCategory),
                type: "fixa",
                scope: "personal",
              };
              let displayDate = finalDate;
              if (card) {
                const cc = buildCreditCardExpense(card, basePayload.description);
                basePayload.due_date = cc.due_date;
                basePayload.paid = cc.paid;
                basePayload.paid_date = cc.paid_date;
                basePayload.notes = cc.notes;
                // FK: payment_method_id referencia payment_methods; o cartão vai no marcador {ID:} da nota.
                basePayload.payment_method_id = null;
                displayDate = cc.invoiceDueDate;
              } else {
                basePayload.due_date = finalDate;
                basePayload.paid = true;
                basePayload.paid_date = finalDate;
              }

              basePayload.notes = basePayload.notes ? `[bot]\n${basePayload.notes}` : "[bot]";
              const { data: ins, error: insErr } = await admin
                .from("expenses")
                .insert(basePayload)
                .select("id").single();
              await logExpenseInsertAttempt(admin, "photo", link.user_id, chatId, basePayload, {
                ok: !insErr && !!ins, expenseId: (ins as any)?.id ?? null, error: insErr,
              });
              if (insErr || !ins) {
                await tgSend(chatId, "❌ Erro ao salvar: " + (insErr?.message ?? "desconhecido"), telegramKey);
              } else {
                const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(extracted.amount);
                const header = card
                  ? `💳 *Compra no cartão (comprovante)*`
                  : `📸 *Despesa extraída do comprovante*`;
                const cardLine = card ? `\n💳 ${card.nickname || card.bank} (vence ${displayDate})` : "";
                let invoiceLine = "";
                if (card) {
                  const invoiceTotal = await computeCurrentInvoiceTotal(admin, link.user_id, card);
                  const fmtInvoice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(invoiceTotal);
                  invoiceLine = `\n💳 Fatura atual: ${fmtInvoice}`;
                }
                await tgSendWithKeyboard(chatId,
                  `${header}\n\n💰 ${fmt}\n📂 ${finalCategory}${cardLine}\n📝 ${extracted.description}\n📅 ${displayDate}${invoiceLine}`,
                  buildExpenseKeyboard(ins.id),
                  telegramKey);
                if (!card) {
                  await checkBudgetAndAlert(admin, link.user_id, chatId, finalCategory, telegramKey);
                }
                learnCategoryFromExpense(admin, link.user_id, extracted.description || "Comprovante", finalCategory)
                  .catch((e) => console.error("learn (photo) err", e));
              }
            }
          }
        }
        await admin.from("telegram_messages")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("update_id", msg.update_id);
        processed++;
        continue;
      }

      // 🎤 Voice / Audio handling
      const voice = (msg.raw_update as any)?.message?.voice;
      const audio = (msg.raw_update as any)?.message?.audio;
      const audioMsg = voice || audio;
      if (audioMsg) {
        const userId = await getLinkedUserId(admin, chatId, messageBotId);
        const link = userId ? { user_id: userId } : null;
        if (!link) {
          await tgSend(chatId, "🔒 Conta não vinculada. Use o app para gerar um código e envie `/start CODIGO`.", telegramKey);
        } else {
          const transcript = await transcribeAudio(
            audioMsg.file_id,
            audioMsg.mime_type || "",
            telegramKey,
          );
          if (!transcript) {
            await tgSend(chatId, "🤔 Não consegui transcrever o áudio. Tente novamente ou envie por texto.", telegramKey);
          } else if (looksLikeQuestion(transcript)) {
            // 🗣️ Áudio com pergunta em linguagem natural — interpreta com IA e consulta o banco.
            try {
              const reply = await answerNaturalQuery(admin, link.user_id, transcript);
              if (reply) {
                await tgSend(chatId, `🎤 _"${transcript}"_\n\n${reply}`, telegramKey);
              } else {
                await tgSend(chatId, `🎤 Transcrevi: _"${transcript}"_\n\n🤔 Não consegui entender a pergunta. Tente reformular.`, telegramKey);
              }
            } catch (e) {
              console.error("answerNaturalQuery (audio) err", e);
              await tgSend(chatId, "❌ Erro ao processar sua pergunta. Tente novamente.", telegramKey);
            }
          } else {
            const extracted = await extractExpense(transcript);
            if (!extracted || !extracted.amount || extracted.confidence < 0.6) {
              await tgSend(chatId, `🎤 Transcrevi: _"${transcript}"_\n\n🤔 Mas não consegui identificar a despesa. Tente reformular.`, telegramKey);
            } else {
              const finalDate = sanitizeDate(extracted.date);
              const initialCat = CATEGORIES.includes(extracted.category) ? extracted.category : "Outros";
              const finalCategory = await resolveCategoryHybrid(admin, link.user_id, extracted.description || transcript.slice(0, 80), initialCat);
              const installmentsN = extracted.installments && Number(extracted.installments) >= 2
                ? Math.min(36, Math.floor(Number(extracted.installments)))
                : null;

              // 💳 Card detection — uses transcript text
              const userCards = await getUserCards(admin, link.user_id);
              const card = detectCardInText(transcript, userCards);

              const basePayload: Record<string, any> = {
                user_id: link.user_id,
                description: capitalizeFirst(extracted.description || transcript.slice(0, 80)),
                amount: extracted.amount,
                category: nonVehicleCategory(finalCategory),
                type: installmentsN ? "recorrente" : "fixa",
                scope: "personal",
              };
              if (installmentsN) {
                basePayload.installments = installmentsN;
                basePayload.paid_installments = 0;
              }
              let displayDate = finalDate;
              if (card) {
                const cc = buildCreditCardExpense(card, basePayload.description);
                basePayload.due_date = cc.due_date;
                basePayload.paid = cc.paid;
                basePayload.paid_date = cc.paid_date;
                basePayload.notes = cc.notes;
                // FK: payment_method_id referencia payment_methods; o cartão vai no marcador {ID:} da nota.
                basePayload.payment_method_id = null;
                displayDate = cc.invoiceDueDate;
              } else {
                basePayload.due_date = finalDate;
                basePayload.paid = installmentsN ? false : true;
                basePayload.paid_date = installmentsN ? null : finalDate;
              }

              basePayload.notes = basePayload.notes ? `[bot]\n${basePayload.notes}` : "[bot]";
              const { data: ins, error: insErr } = await admin
                .from("expenses")
                .insert(basePayload)
                .select("id").single();
              await logExpenseInsertAttempt(admin, "voice", link.user_id, chatId, basePayload, {
                ok: !insErr && !!ins, expenseId: (ins as any)?.id ?? null, error: insErr,
              });
              if (insErr || !ins) {
                await tgSend(chatId, "❌ Erro ao salvar: " + (insErr?.message ?? "desconhecido"), telegramKey);
              } else {
                const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(extracted.amount);
                const installmentValue = installmentsN ? extracted.amount / installmentsN : extracted.amount;
                const fmtParcel = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(installmentValue);
                const header = installmentsN
                  ? (card ? `💳 *Compra parcelada no cartão (áudio)*` : `🧾 *Compra parcelada (áudio)*`)
                  : (card ? `💳 *Compra no cartão (áudio)*` : `🎤 *Despesa registrada por áudio*`);
                const cardLine = card ? `\n💳 ${card.nickname || card.bank} (vence ${displayDate})` : "";
                const parcelLine = installmentsN ? `\n🔢 ${installmentsN}x de ${fmtParcel}` : "";
                let invoiceLine = "";
                if (card) {
                  const invoiceTotal = await computeCurrentInvoiceTotal(admin, link.user_id, card);
                  const fmtInvoice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(invoiceTotal);
                  invoiceLine = `\n💳 Fatura atual: ${fmtInvoice}`;
                }
                await tgSendWithKeyboard(chatId,
                  `${header}\n\n_"${transcript}"_\n\n💰 ${fmt}${parcelLine}\n📂 ${finalCategory}${cardLine}\n📝 ${extracted.description}\n📅 ${displayDate}${invoiceLine}`,
                  buildExpenseKeyboard(ins.id),
                  telegramKey);
                if (!card) {
                  await checkBudgetAndAlert(admin, link.user_id, chatId, finalCategory, telegramKey);
                }
                learnCategoryFromExpense(admin, link.user_id, extracted.description || transcript.slice(0, 80), finalCategory)
                  .catch((e) => console.error("learn (audio) err", e));
              }
            }
          }
        }
        await admin.from("telegram_messages")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("update_id", msg.update_id);
        processed++;
        continue;
      }

      // /start CODE → link account
      const startMatch = text.match(/^\/start(?:@\w+)?\s+(\d{6})\b/i);
      if (startMatch) {
        const code = startMatch[1];
        const rawBotId = (msg.raw_update as any)?._system_bot_id as string | undefined;
        const reportsBotIdEx = await getReportsBotId(admin);
        // Lookup expenses code only (exclui códigos do bot de relatórios)
        let codeQ = admin.from("telegram_link_codes")
          .select("id, code, user_id, bot_id, expires_at, created_at")
          .eq("code", code)
          .order("created_at", { ascending: false })
          .limit(1);
        if (reportsBotIdEx) codeQ = codeQ.or(`bot_id.is.null,bot_id.neq.${reportsBotIdEx}`);
        const { data: codeRow } = await codeQ.maybeSingle();
        if (!codeRow) {
          const { data: anyCode } = await admin.from("telegram_link_codes")
            .select("expires_at")
            .eq("code", code)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const message = anyCode
            ? "❌ Este código foi gerado para outro bot. Abra o app, gere um novo código e envie no mesmo bot indicado."
            : "❌ Código não encontrado. No app, gere um novo código e envie exatamente `/start CÓDIGO` aqui.";
          await tgSend(chatId, message, telegramKey);
        } else if (new Date(codeRow.expires_at).getTime() < Date.now()) {
          await admin.from("telegram_link_codes").delete().eq("id", codeRow.id);
          await tgSend(chatId, "⏰ Código expirado. Gere um novo no app e envie logo em seguida neste bot.", telegramKey);
        } else {
          let targetBotId = codeRow.bot_id ?? rawBotId ?? null;
          if (!targetBotId) {
            const { data: activeExpenseBot } = await admin.from("system_telegram_bots")
              .select("id")
              .eq("purpose", "expenses")
              .eq("active", true)
              .order("bot_id", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            targetBotId = (activeExpenseBot as any)?.id ?? null;
          }
          // Remove somente o vínculo do MESMO bot; mantém despesas e relatórios conectados em paralelo.
          // Se não conseguimos resolver o bot, não apagamos vínculos legados com bot_id nulo,
          // pois eles podem representar outro bot já conectado.
          if (targetBotId) {
            await admin.from("telegram_links")
              .delete()
              .eq("bot_id", targetBotId)
              .or(`chat_id.eq.${chatId},user_id.eq.${codeRow.user_id}`);
          }
          invalidateLinkCache(chatId);
          const { error: linkErr } = await admin.from("telegram_links")
            .insert({ user_id: codeRow.user_id, chat_id: chatId, bot_id: targetBotId });
          if (linkErr) {
            await tgSend(chatId, "❌ Erro ao vincular: " + linkErr.message, telegramKey);
          } else {
            await admin.from("telegram_link_codes").delete().eq("id", codeRow.id);
            invalidateLinkCache(chatId);
            await tgSend(chatId, "✅ *Conta vinculada!*\n\n" + HELP_TEXT, telegramKey);
          }
        }
      } else if (/^\/start\b/i.test(text)) {
        await tgSend(chatId, "👋 Para vincular sua conta, abra o app, gere o comando */start* na aba Financeiro e envie aqui exatamente como recebeu.", telegramKey);
      } else if (/^\/help\b/i.test(text)) {
        await tgSend(chatId, HELP_TEXT, telegramKey);
      } else if (text) {
        // Resolve user (cached)
        const userId = await getLinkedUserId(admin, chatId, messageBotId);
        const link = userId ? { user_id: userId } : null;
        if (!link) {
          await tgSend(chatId, "🔒 Conta não vinculada. Abra o app, gere o comando */start* na aba Financeiro e envie aqui para vincular.", telegramKey);
        } else {
          // 🐷 Pending piggy-bank aporte interception (highest priority)
          const { data: pendingPiggy } = await admin.from("telegram_pending_piggy_aporte")
            .select("*").eq("chat_id", chatId).maybeSingle();

          let pendingHandled = false;

          if (pendingPiggy) {
            const expiredP = new Date(pendingPiggy.expires_at).getTime() < Date.now();
            if (expiredP) {
              await admin.from("telegram_pending_piggy_aporte").delete().eq("chat_id", chatId);
            } else if (/^\/cancelar\b/i.test(text)) {
              await admin.from("telegram_pending_piggy_aporte").delete().eq("chat_id", chatId);
              await tgSend(chatId, "❌ Aporte cancelado.", telegramKey);
              pendingHandled = true;
            } else {
              const parsed = parseAmountWithNote(text);
              if (!parsed) {
                await tgSend(chatId, "❌ Não entendi o valor. Envie `200`, `200,50` ou `200 aniversário` (ou `/cancelar`).", telegramKey);
                pendingHandled = true;
              } else if (!pendingPiggy.piggy_bank_id) {
                // Bank not yet picked — store amount/note and re-ask the user to pick one.
                const { banks } = await listUserPiggyBanks(admin, link.user_id);
                if (banks.length === 0) {
                  await admin.from("telegram_pending_piggy_aporte").delete().eq("chat_id", chatId);
                  await tgSend(chatId, "🐷 Você ainda não tem nenhuma caixinha. Crie uma no app.", telegramKey);
                } else {
                  await admin.from("telegram_pending_piggy_aporte").update({
                    pending_amount: parsed.amount,
                    notes: parsed.note,
                  }).eq("chat_id", chatId);
                  const noteLine = parsed.note ? `\n📝 Nota: _${parsed.note}_` : "";
                  await tgSendWithKeyboard(
                    chatId,
                    `🐷 *Aporte em caixinha*\n💰 Valor: *${fmtBRL(parsed.amount)}*${noteLine}\n\nEscolha em qual caixinha:`,
                    buildPiggyBanksKeyboard(banks),
                    telegramKey,
                  );
                }
                pendingHandled = true;
              } else {
                const ownerId = await resolvePiggyOwner(admin, link.user_id);
                const { data: bankRow } = await admin
                  .from("cofrinhos")
                  .select("id, nome")
                  .eq("id", pendingPiggy.piggy_bank_id)
                  .eq("usuario_id", ownerId)
                  .maybeSingle();
                const bank = bankRow ? { id: (bankRow as any).id, name: (bankRow as any).nome } : null;
                await admin.from("telegram_pending_piggy_aporte").delete().eq("chat_id", chatId);
                if (!bank) {
                  await tgSend(chatId, "❌ Caixinha não encontrada.", telegramKey);
                } else {
                  // Note priority: inline note (this message) overrides any previously stored note.
                  const finalNote = parsed.note ?? (pendingPiggy.notes ?? null);
                  const reply = await finalizePiggyAporte(admin, link.user_id, bank, parsed.amount, finalNote);
                  await tgSend(chatId, reply, telegramKey);
                }

                pendingHandled = true;
              }
            }
          }

          // ✏️ Pending edit interception (before any other text handling)
          const { data: pending } = pendingHandled
            ? { data: null as any }
            : await admin.from("telegram_pending_edits")
                .select("*").eq("chat_id", chatId).maybeSingle();

          if (pending) {
            const expired = new Date(pending.expires_at).getTime() < Date.now();
            if (expired) {
              await admin.from("telegram_pending_edits").delete().eq("chat_id", chatId);
            } else if (/^\/cancelar\b/i.test(text)) {
              await admin.from("telegram_pending_edits").delete().eq("chat_id", chatId);
              await tgEditReplyMarkup(chatId, pending.message_id, buildExpenseKeyboard(pending.expense_id), telegramKey);
              await tgSend(chatId, "✏️ Edição cancelada.", telegramKey);
              pendingHandled = true;
            } else {
              const newAmount = parseAmount(text);
              if (newAmount === null) {
                await tgSend(chatId, "❌ Não entendi o valor. Envie só o número (ex: `45,90`) ou `/cancelar` para sair.", telegramKey);
                pendingHandled = true;
              } else {
                const { data: exp, error: updErr } = await admin.from("expenses")
                  .update({ amount: newAmount })
                  .eq("id", pending.expense_id).eq("user_id", link.user_id)
                  .select("description, category, paid_date, due_date").maybeSingle();
                await admin.from("telegram_pending_edits").delete().eq("chat_id", chatId);
                if (updErr || !exp) {
                  await tgSend(chatId, "❌ Erro ao atualizar valor.", telegramKey);
                } else {
                  const fmt = fmtBRL(newAmount);
                  const date = exp.paid_date || exp.due_date || "";
                  await tgEditMessage(
                    chatId, pending.message_id,
                    `✏️ *Despesa atualizada*\n\n💰 ${fmt}\n📂 ${exp.category}\n📝 ${exp.description}\n📅 ${date}`,
                    buildExpenseKeyboard(pending.expense_id),
                    telegramKey,
                  );
                  await tgSend(chatId, `✅ Valor atualizado para *${fmt}*`, telegramKey);
                  await checkBudgetAndAlert(admin, link.user_id, chatId, exp.category, telegramKey);
                }
                pendingHandled = true;
              }
            }
          }

          if (!pendingHandled) {
            if (/^\/saldo(?:@\w+)?\b/i.test(text)) {
              const reply = await handleSaldo(admin, link.user_id);
              await tgSend(chatId, reply, telegramKey);
            } else if (/^\/mes(?:@\w+)?\b/i.test(text)) {
              const reply = await handleMes(admin, link.user_id);
              await tgSend(chatId, reply, telegramKey);
            } else if (/^\/semana(?:@\w+)?\b/i.test(text)) {
              const reply = await handleSemana(admin, link.user_id);
              await tgSend(chatId, reply, telegramKey);
            } else if (/^\/comparar(?:@\w+)?\b/i.test(text)) {
              const reply = await handleComparar(admin, link.user_id);
              await tgSend(chatId, reply, telegramKey);
            } else if (/^\/orcamento(?:s)?(?:@\w+)?\b/i.test(text)) {
              const reply = await handleOrcamento(admin, link.user_id);
              await tgSend(chatId, reply, telegramKey);
            } else if (/^\/ultimas(?:@\w+)?\b/i.test(text)) {
              const reply = await handleUltimas(admin, link.user_id);
              await tgSend(chatId, reply, telegramKey);
            } else if (/^\/apagar(?:@\w+)?\b/i.test(text)) {
              const reply = await handleApagar(admin, link.user_id);
              await tgSend(chatId, reply, telegramKey);
            } else if (/^\/?aportes?[_\s-]*(saldo|saldos)(?:@\w+)?\b/i.test(text)) {
              const reply = await handleAportesSaldo(admin, link.user_id);
              await tgSend(chatId, reply, telegramKey);
            } else if (looksLikeResgate(text)) {
              await handleResgateCommand(admin, link.user_id, chatId, text, telegramKey);
            } else if (/^\/?aporte(?:@\w+)?\b/i.test(text)) {
              // Accepts both /aporte and plain "aporte" (any message containing
              // the word at the start). Supported forms:
              //   aporte                              → list available caixinhas
              //   aporte <valor>                      → ask which caixinha (picker)
              //   aporte <id|nome> <valor> [nota]     → finalize directly
              //   /aporte <valor> [nota]              → legacy picker flow
              const rest = text.replace(/^\/?aporte(?:@\w+)?\s*/i, "").trim();
              const { banks } = await listUserPiggyBanks(admin, link.user_id);

              if (banks.length === 0) {
                await tgSend(
                  chatId,
                  "🐷 Você ainda não tem nenhuma caixinha (cofrinho).\nCrie uma no app e tente novamente.",
                  telegramKey,
                );
              } else if (!rest) {
                // No args → list available caixinhas with short IDs.
                await tgSend(chatId, formatPiggyBanksList(banks), telegramKey);
              } else {
                // Try "<ref> <valor> [nota]" first when there are >=2 tokens.
                // A short_id like "5" looks like a valid amount on its own, so we
                // can't decide based on the first token alone — we must try the
                // structured parse first and only fall back to picker on failure.
                const tokens = rest.split(/\s+/);
                let resolvedBank: PiggyBankRef | null = null;
                let amount: number | null = null;
                let note: string | null = null;
                let aporteHandled = false;

                if (tokens.length >= 2) {
                  // First token is the bank reference. Greedily try 1..N tokens
                  // as the bank name so multi-word names like "Reserva Casa" work,
                  // stopping at the largest prefix that still leaves an amount.
                  for (let take = Math.min(tokens.length - 1, 5); take >= 1; take--) {
                    const candidate = tokens.slice(0, take).join(" ");
                    const remaining = tokens.slice(take).join(" ").trim();
                    if (!remaining) continue;
                    const parsedRem = parseAmountWithNote(remaining);
                    if (!parsedRem) continue;
                    const r = resolvePiggyBankByToken(banks, candidate);
                    if (r.bank) {
                      resolvedBank = r.bank;
                      amount = parsedRem.amount;
                      note = parsedRem.note;
                      break;
                    }
                    if (r.ambiguous && r.ambiguous.length > 0) {
                      const list = r.ambiguous.map((b) => `• *${b.name}* — \`${b.id.slice(0, 8)}\``).join("\n");
                      await tgSend(
                        chatId,
                        `⚠️ Encontrei mais de uma caixinha com "${candidate}":\n${list}\n\nUse o ID curto, ex: \`aporte ${r.ambiguous[0].id.slice(0, 8)} <valor>\``,
                        telegramKey,
                      );
                      aporteHandled = true;
                      break;
                    }
                  }

                  if (!aporteHandled && (!resolvedBank || amount === null)) {
                    // No bank resolved. If the very first token looks like a plain
                    // amount (e.g. "aporte 200 obs"), fall through to the picker
                    // flow rather than treating it as a missing-bank error.
                    const firstAsAmount = parseAmount(tokens[0]);
                    if (firstAsAmount !== null) {
                      // Intentionally do nothing here — handled by the legacy
                      // picker block below by leaving aporteHandled=false and
                      // amount/resolvedBank null. We re-enter that flow now:
                      const inline = parseAmountWithNote(rest);
                      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
                      await admin.from("telegram_pending_piggy_aporte").upsert({
                        chat_id: chatId,
                        user_id: link.user_id,
                        piggy_bank_id: null,
                        pending_amount: inline?.amount ?? null,
                        notes: inline?.note ?? null,
                        expires_at: expiresAt,
                      }, { onConflict: "chat_id" });
                      const headerLines = ["🐷 *Aporte em caixinha*"];
                      if (inline) headerLines.push(`💰 Valor: *${fmtBRL(inline.amount)}*`);
                      if (inline?.note) headerLines.push(`📝 Nota: _${inline.note}_`);
                      headerLines.push("");
                      headerLines.push("Escolha em qual caixinha você quer fazer o aporte:");
                      await tgSendWithKeyboard(
                        chatId,
                        headerLines.join("\n"),
                        buildPiggyBanksKeyboard(banks),
                        telegramKey,
                      );
                      aporteHandled = true;
                    } else {
                      const firstTok = tokens[0];
                      await tgSend(
                        chatId,
                        `❌ Caixinha "${firstTok}" não encontrada.\n\n${formatPiggyBanksList(banks)}`,
                        telegramKey,
                      );
                      aporteHandled = true;
                    }
                  }

                  if (!aporteHandled && resolvedBank && amount !== null) {
                    // Direct finalize — no extra prompts, no expense created.
                    const reply = await finalizePiggyAporte(admin, link.user_id, resolvedBank, amount, note);
                    await tgSend(chatId, reply, telegramKey);
                  }
                } else {
                  // Legacy flow: only amount given → show picker.
                  const inline = parseAmountWithNote(rest);
                  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
                  await admin.from("telegram_pending_piggy_aporte").upsert({
                    chat_id: chatId,
                    user_id: link.user_id,
                    piggy_bank_id: null,
                    pending_amount: inline?.amount ?? null,
                    notes: inline?.note ?? null,
                    expires_at: expiresAt,
                  }, { onConflict: "chat_id" });
                  const headerLines = ["🐷 *Aporte em caixinha*"];
                  if (inline) headerLines.push(`💰 Valor: *${fmtBRL(inline.amount)}*`);
                  if (inline?.note) headerLines.push(`📝 Nota: _${inline.note}_`);
                  headerLines.push("");
                  headerLines.push("Escolha em qual caixinha você quer fazer o aporte:");
                  await tgSendWithKeyboard(
                    chatId,
                    headerLines.join("\n"),
                    buildPiggyBanksKeyboard(banks),
                    telegramKey,
                  );
                }
              }
            } else if (/^\/(meus[_-]?aportes|meusaportes)(?:@\w+)?\b/i.test(text)) {
              const reply = await handleMeusAportes(admin, link.user_id);
              await tgSend(chatId, reply, telegramKey);
            } else if (looksLikeQuestion(text)) {
              // 🗣️ Pergunta em linguagem natural — interpreta com IA e consulta o banco.
              try {
                const reply = await answerNaturalQuery(admin, link.user_id, text);
                if (reply) {
                  await tgSend(chatId, reply, telegramKey);
                } else {
                  await tgSend(chatId, "🤔 Não consegui entender sua pergunta. Tente reformular, ex.:\n_\"quanto gastei esta semana?\"_\n_\"quanto recebi em maio?\"_\n_\"meus maiores gastos nos últimos 30 dias\"_", telegramKey);
                }
              } catch (e) {
                console.error("answerNaturalQuery err", e);
                await tgSend(chatId, "❌ Erro ao processar sua pergunta. Tente novamente.", telegramKey);
              }
            } else if (looksLikeIncome(text)) {
              // 💵 Receita detectada — extrai e cadastra em "incomes".
              const extracted = await extractIncome(text);
              if (!extracted || !extracted.amount || extracted.confidence < 0.6) {
                await tgSend(chatId, "🤔 Não consegui entender a receita. Tente algo como:\n_\"recebi 500 do cliente João pix\"_ ou _\"salário 3500 hoje\"_", telegramKey);
              } else {
                const finalDate = sanitizeDate(extracted.date);
                const initialIncomeCat = INCOME_CATEGORIES.includes(extracted.category) ? extracted.category : "Outros";
                const category = await resolveIncomeCategoryHybrid(
                  admin,
                  link.user_id,
                  extracted.description || text.slice(0, 80),
                  initialIncomeCat
                );
                const status = extracted.status === "pending" ? "pending" : "received";
                const ownerId = await resolvePiggyOwner(admin, link.user_id);
                const payload: Record<string, any> = {
                  user_id: ownerId,
                  description: capitalizeFirst(extracted.description || text.slice(0, 80)),
                  amount: extracted.amount,
                  category,
                  source: extracted.source || "Telegram",
                  received_date: finalDate,
                  status,
                  recurrence: "once",
                  notes: "[bot]",
                };
                const { error: insErr } = await admin.from("incomes").insert(payload);
                if (insErr) {
                  await tgSend(chatId, "❌ Erro ao salvar receita: " + insErr.message, telegramKey);
                } else {
                  // Reinforce learning for next time
                  learnIncomeCategory(admin, link.user_id, payload.description, category)
                    .catch((e) => console.error("learnIncomeCategory err", e));
                  const fmtV = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(extracted.amount);
                  const statusLine = status === "received" ? "✅ Recebido" : "⏳ Pendente";
                  const sourceLine = extracted.source ? `\n👤 ${extracted.source}` : "";
                  await tgSend(
                    chatId,
                    `💵 *Receita registrada*\n\n💰 ${fmtV}\n📂 ${category}${sourceLine}\n📝 ${payload.description}\n📅 ${finalDate}\n${statusLine}`,
                    telegramKey,
                  );
                }
              }
            } else {
              // Regex-first: skip AI for clear "<amount> <description>" or "<description> <amount>" inputs.
              const quick = quickParseExpense(text);
              const today = todayBR();
              let extracted: any = null;
              if (quick) {
                extracted = {
                  description: quick.description,
                  amount: quick.amount,
                  category: nonVehicleCategory(quick.category),
                  date: today,
                  installments: quick.installments ?? undefined,
                  confidence: 1,
                };
              } else {
                extracted = await extractExpense(text);
              }
              if (!extracted || !extracted.amount || extracted.confidence < 0.6) {
                await tgSend(chatId, "🤔 Não consegui entender. Tente algo como:\n_\"mercado 80 alimentação\"_ ou _\"uber 25 ontem\"_", telegramKey);
              } else {
                const finalDate = sanitizeDate(extracted.date);
                const initialCat = CATEGORIES.includes(extracted.category) ? extracted.category : "Outros";
                const installmentsN = extracted.installments && Number(extracted.installments) >= 2
                  ? Math.min(36, Math.floor(Number(extracted.installments)))
                  : null;

                // 💳 Credit-card detection — register as pending invoice item.
                // Search both the original message and any payment_method hint extracted by the AI.
                const userCards = await getUserCards(admin, link.user_id);
                const aiPayMethod: string | undefined = typeof extracted.payment_method === "string"
                  ? extracted.payment_method.trim()
                  : undefined;
                const cardSearchText = aiPayMethod ? `${text}\n${aiPayMethod}` : text;
                const card = detectCardInText(cardSearchText, userCards);

                const description = capitalizeFirst(extracted.description || text.slice(0, 80));

                let displayDate = finalDate;
                let ccBuilt: ReturnType<typeof buildCreditCardExpense> | null = null;
                if (card) {
                  ccBuilt = buildCreditCardExpense(card, description);
                  displayDate = ccBuilt.invoiceDueDate;
                }

                const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(extracted.amount);
                const installmentValue = installmentsN ? extracted.amount / installmentsN : extracted.amount;
                const fmtParcel = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(installmentValue);
                const parcelLine = installmentsN ? `\n🔢 ${installmentsN}x de ${fmtParcel}` : "";
                const cardLine = card ? `\n💳 ${card.nickname || card.bank} (vence ${displayDate})` : "";
                const labelFromAi = (() => {
                  if (!aiPayMethod) return null;
                  const a = aiPayMethod.toLowerCase();
                  if (/p[ií]x/.test(a)) return "Pix";
                  if (/dinheiro|esp[eé]cie|cash/.test(a)) return "Dinheiro";
                  if (/d[eé]bito/.test(a)) return "Débito";
                  if (/boleto/.test(a)) return "Boleto";
                  if (/cart[ãa]o/.test(a)) {
                    const rest = aiPayMethod.replace(/cart[ãa]o/i, "").trim();
                    return rest ? `Cartão ${rest}` : "Cartão";
                  }
                  return aiPayMethod.charAt(0).toUpperCase() + aiPayMethod.slice(1);
                })();
                const paymentMethod = card
                  ? `Cartão${card.nickname ? ` ${card.nickname}` : ""}`
                  : (labelFromAi
                    ?? (/\bpix\b/i.test(text) ? "Pix"
                      : /(dinheiro|cash|esp[eé]cie)/i.test(text) ? "Dinheiro"
                      : /\bd[eé]bito\b/i.test(text) ? "Débito"
                      : "Não informado"));

                const header = installmentsN
                  ? (card ? `💳 *Compra parcelada no cartão*` : `🧾 *Compra parcelada registrada*`)
                  : (card ? `💳 *Compra no cartão registrada*` : `✅ *Despesa registrada*`);

                // ⚡ Confirmação instantânea — usa categoria inicial detectada.
                // O refinamento (AI) e o insert acontecem em segundo plano,
                // e o teclado de ações é anexado a esta mesma mensagem ao concluir.
                const buildSummary = (cat: string, invoiceLine?: string) =>
                  `${header}\n\n💰 ${fmt}${parcelLine}\n📂 ${cat}${cardLine}\n📝 ${description}\n📅 ${displayDate}\n💳 ${paymentMethod}${invoiceLine ? `\n${invoiceLine}` : ""}`;
                const instantSummary = buildSummary(initialCat);
                const instantMsgId = await tgSend(chatId, instantSummary, telegramKey);

                // 🔄 Processamento em background: refina categoria, persiste e
                // anexa o teclado de ações à mensagem original (resumo + ações juntos).
                const bgPersist = (async () => {
                  try {
                    const finalCategory = await resolveCategoryHybrid(
                      admin, link.user_id, description, initialCat,
                    );
                    const basePayload: Record<string, any> = {
                      user_id: link.user_id,
                      description,
                      amount: extracted.amount,
                      category: nonVehicleCategory(finalCategory),
                      type: installmentsN ? "recorrente" : "fixa",
                      scope: "personal",
                    };
                    if (installmentsN) {
                      basePayload.installments = installmentsN;
                      basePayload.paid_installments = 0;
                    }
                    if (ccBuilt) {
                      basePayload.due_date = ccBuilt.due_date;
                      basePayload.paid = ccBuilt.paid;
                      basePayload.paid_date = ccBuilt.paid_date;
                      basePayload.notes = ccBuilt.notes;
                      // FK: payment_method_id referencia payment_methods; o cartão vai no marcador {ID:} da nota.
                      basePayload.payment_method_id = null;
                      displayDate = ccBuilt.invoiceDueDate;
                    } else {
                      basePayload.due_date = finalDate;
                      basePayload.paid = installmentsN ? false : true;
                      basePayload.paid_date = installmentsN ? null : finalDate;
                    }
                    basePayload.notes = basePayload.notes ? `[bot]\n${basePayload.notes}` : "[bot]";

                    const { data: ins, error: insErr } = await admin
                      .from("expenses")
                      .insert(basePayload)
                      .select("id").single();

                    await logExpenseInsertAttempt(admin, "text", link.user_id, chatId, basePayload, {
                      ok: !insErr && !!ins, expenseId: (ins as any)?.id ?? null, error: insErr,
                    });

                    if (insErr || !ins) {
                      console.error("bg insert err", insErr);
                      await tgSend(chatId, "⚠️ Não consegui salvar o lançamento no app: " + (insErr?.message ?? "erro desconhecido"), telegramKey);
                      return;
                    }

                    let invoiceLine: string | undefined;
                    if (card) {
                      const invoiceTotal = await computeCurrentInvoiceTotal(admin, link.user_id, card);
                      const fmtInvoice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(invoiceTotal);
                      invoiceLine = `💳 Fatura atual: ${fmtInvoice}`;
                    }
                    const finalSummary = buildSummary(finalCategory, invoiceLine);
                    const keyboard = buildExpenseKeyboard(ins.id);
                    if (instantMsgId) {
                      await tgEditMessage(chatId, instantMsgId, finalSummary, keyboard, telegramKey);
                    } else {
                      await tgSendWithKeyboard(chatId, finalSummary, keyboard, telegramKey);
                    }

                    if (!card) {
                      checkBudgetAndAlert(admin, link.user_id, chatId, finalCategory, telegramKey)
                        .catch((e) => console.error("budget alert bg err", e));
                    }
                    learnCategoryFromExpense(admin, link.user_id, description, finalCategory)
                      .catch((e) => console.error("learn (text) err", e));
                  } catch (e) {
                    console.error("bg expense persist err", e);
                    await tgSend(chatId, "⚠️ Houve um erro ao concluir o registro em segundo plano. Tente reenviar se o lançamento não aparecer no app.", telegramKey).catch(() => {});
                  }
                })();
                // @ts-ignore - EdgeRuntime is available in Supabase edge runtime
                if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any)?.waitUntil) {
                  // @ts-ignore
                  EdgeRuntime.waitUntil(bgPersist);
                } else {
                  await bgPersist;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("processing error", e);
    }

      await admin.from("telegram_messages")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("update_id", msg.update_id);
      processed++;
    }
  };

  // Run all chats in parallel; messages within the same chat stay sequential.
  await Promise.all([...byChat.values()].map(processChat));

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

