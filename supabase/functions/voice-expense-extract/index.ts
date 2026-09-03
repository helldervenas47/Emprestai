// Recebe áudio (base64) gravado pelo usuário, transcreve e extrai os campos
// de uma despesa (descrição, valor, categoria, vencimento, observações)
// usando a API nativa do Gemini (suporta audio/webm inline).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORIES = [
  "Aluguel", "Energia", "Água", "Internet", "Telefone",
  "Alimentação", "Transporte", "Salários", "Impostos", "Outros",
];

function todayBR(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date());
}

function extractJson(raw: string): any {
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const a = s.search(/[\{\[]/);
  const isArr = a !== -1 && s[a] === "[";
  const b = s.lastIndexOf(isArr ? "]" : "}");
  if (a === -1 || b === -1) throw new Error("JSON não encontrado");
  s = s.substring(a, b + 1);
  try { return JSON.parse(s); }
  catch {
    s = s.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(s);
  }
}

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function callGemini(apiKey: string, payload: unknown) {
  let lastError = "";

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const body = await resp.text();
      if (resp.ok) return { body, model };

      lastError = `Gemini ${model} ${resp.status}: ${body}`;
      console.error("Gemini error", { model, attempt, status: resp.status, body });

      if (![429, 500, 502, 503, 504].includes(resp.status)) {
        throw new Error(lastError);
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 450));
    }
  }

  throw new Error(lastError || "Gemini indisponível");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Require an authenticated Supabase user to prevent Gemini-API abuse.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ?? Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
    let userId: string | null = null;
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.8");
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u, error: ue } = await userClient.auth.getUser();
      if (ue || !u?.user) return jsonResponse({ error: "Unauthorized" }, 401);
      userId = u.user.id;
    }

    // Rate limit: 30 req/min por usuário
    if (userId) {
      const { checkRateLimit, rateLimitResponse } = await import("../_shared/rate-limit.ts");
      const ok = await checkRateLimit({ bucket: "voice-expense", key: userId, max: 30, windowSecs: 60 });
      if (!ok) return rateLimitResponse(corsHeaders);
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return jsonResponse({ error: "Configuração de IA ausente" });
    }

    const { audioBase64, mimeType } = await req.json();
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return jsonResponse({ error: "Áudio obrigatório" }, 400);
    }
    // Cap payload at ~5 MB of base64 (~3.75 MB raw audio).
    if (audioBase64.length > 5 * 1024 * 1024) {
      return jsonResponse({ error: "Áudio muito grande (limite ~5 MB)" }, 413);
    }

    // Normalizar mimeType para algo que o Gemini aceita
    let mt = (mimeType || "audio/webm").split(";")[0].trim();
    const allowed = ["audio/webm", "audio/mp3", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/aac", "audio/flac", "audio/mp4"];
    if (!allowed.includes(mt)) mt = "audio/webm";

    const today = todayBR();
    const prompt = `Você recebe um áudio em português brasileiro com uma despesa ditada pelo usuário.
Transcreva e extraia os campos. Hoje é ${today}.
Responda APENAS um JSON válido (sem markdown, sem texto extra) com:
{
  "description": string,
  "amount": number,
  "category": string,  // OBRIGATORIAMENTE uma de: ${CATEGORIES.join(", ")}
  "dueDate": string,   // YYYY-MM-DD, padrão hoje
  "notes": string,
  "scope": "business" | "personal",
  "transcript": string
}
Se não conseguir identificar valor ou descrição, retorne {"error":"motivo"}.`;

    const payload = {
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mt, data: audioBase64 } },
        ],
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    };

    const { body } = await callGemini(GEMINI_API_KEY, payload);

    let data: any;
    try { data = JSON.parse(body); } catch { data = {}; }
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("") ?? "";
    if (!text) {
      return jsonResponse({ error: "Não consegui entender o áudio. Tente gravar novamente mais perto do microfone." });
    }

    let parsed: any;
    try { parsed = extractJson(text); }
    catch (e) {
      console.error("Invalid AI response", text);
      return jsonResponse({ error: "Não consegui extrair os dados da despesa. Tente informar descrição e valor no áudio." });
    }

    return jsonResponse(parsed);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Serviço de áudio temporariamente indisponível. Tente novamente em instantes." });
  }
});
