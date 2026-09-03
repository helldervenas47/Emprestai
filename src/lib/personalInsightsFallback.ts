import type { PersonalInsight } from "@/hooks/usePersonalInsights";

const CREDIT_ERROR_PATTERN = /AI_CREDITS_EXHAUSTED|credit_limit_reached|credit limit|Workspace credit limit|Not enough credits|payment_required|AI gateway error 40[23]/i;
const RATE_LIMIT_PATTERN = /AI_RATE_LIMITED|rate.?limit|429/i;

export function getPersonalInsightsFallbackContent(kind: "credits" | "rate" | "generic" = "generic") {
  if (kind === "credits") {
    return "## ⚠️ Análise indisponível\n\nO relatório inteligente não pôde ser gerado porque o limite de créditos de IA do workspace foi atingido. Seus dados financeiros continuam disponíveis normalmente; tente novamente após o ajuste do limite.";
  }

  if (kind === "rate") {
    return "## ⏳ Limite temporário\n\nMuitas análises foram solicitadas em sequência. Aguarde alguns instantes e tente gerar o relatório novamente.";
  }

  return "## ❌ Análise indisponível\n\nNão foi possível gerar o relatório inteligente neste momento. Seus dados financeiros continuam disponíveis normalmente.";
}

export function getPersonalInsightsErrorKind(message: string): "credits" | "rate" | "generic" {
  if (CREDIT_ERROR_PATTERN.test(message)) return "credits";
  if (RATE_LIMIT_PATTERN.test(message)) return "rate";
  return "generic";
}

export async function readFunctionErrorMessage(error: any): Promise<string> {
  const baseMessage = String(error?.message || error || "Erro ao gerar relatório");

  try {
    const context = error?.context;
    if (context && typeof context.text === "function") {
      const text = await context.text();
      if (!text) return baseMessage;
      try {
        const parsed = JSON.parse(text);
        return [baseMessage, parsed?.error, parsed?.message, parsed?.details, text]
          .filter(Boolean)
          .join("\n");
      } catch {
        return `${baseMessage}\n${text}`;
      }
    }
  } catch {
    return baseMessage;
  }

  return baseMessage;
}

export function buildFallbackInsight(message: string, month?: string): PersonalInsight {
  const kind = getPersonalInsightsErrorKind(message);
  return {
    content: getPersonalInsightsFallbackContent(kind),
    summary:
      kind === "credits"
        ? "IA indisponível por limite de créditos"
        : kind === "rate"
          ? "IA temporariamente limitada"
          : "IA indisponível no momento",
    exceeded_categories: [],
    generated_at: new Date().toISOString(),
    cached: false,
    fallback: true,
    error_code: kind,
    month,
  };
}

export function isFallbackFunctionPayload(payload: any): boolean {
  const message = String([payload?.error, payload?.code, payload?.message, payload?.content].filter(Boolean).join("\n"));
  return Boolean(payload?.fallback || payload?.content) && (
    CREDIT_ERROR_PATTERN.test(message)
    || RATE_LIMIT_PATTERN.test(message)
    || payload?.error === "AI_CREDITS_EXHAUSTED"
    || payload?.error === "AI_RATE_LIMITED"
  );
}
