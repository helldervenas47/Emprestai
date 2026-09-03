import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

type WhatsappAuthorizedNumber = {
  id: string;
  phone: string;
  label: string | null;
  enabled: boolean;
};

export function useWhatsappAssistant() {
  const { user } = useAuth();
  const [numbers, setNumbers] = useState<WhatsappAuthorizedNumber[]>([]);
  const [loading, setLoading] = useState(false);

  const webhookUrl = useMemo(() => {
    const base =
      (import.meta.env.VITE_EXTERNAL_SUPABASE_URL as string | undefined) ||
      (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
      "";
    return `${base.replace(/\/$/, "")}/functions/v1/whatsapp-assistant-webhook`;
  }, []);

  const load = useCallback(async () => {
    if (!user?.id) {
      setNumbers([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_assistant_authorized")
      .select("id, phone, label, enabled")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (!error && data) {
      setNumbers(
        data.map((d: any) => ({
          id: d.id,
          phone: d.phone,
          label: d.label,
          enabled: d.enabled ?? true,
        })),
      );
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const addNumber = useCallback(
    async (phone: string, label: string) => {
      if (!user?.id) return { error: new Error("Usuário não autenticado") };
      const digits = phone.replace(/\D/g, "");
      const { error } = await supabase.from("whatsapp_assistant_authorized").insert({
        owner_id: user.id,
        phone: digits,
        label: label.trim() || null,
        enabled: true,
      } as any);
      if (!error) await load();
      return { error };
    },
    [user?.id, load],
  );

  const toggleNumber = useCallback(
    async (id: string, enabled: boolean) => {
      const { error } = await supabase
        .from("whatsapp_assistant_authorized")
        .update({ enabled } as any)
        .eq("id", id);
      if (!error) await load();
      return { error };
    },
    [load],
  );

  const removeNumber = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("whatsapp_assistant_authorized").delete().eq("id", id);
      if (!error) await load();
      return { error };
    },
    [load],
  );

  return { numbers, loading, addNumber, toggleNumber, removeNumber, webhookUrl, reload: load };
}


const APP_FUNCTIONS_URL =
  (import.meta.env.VITE_EXTERNAL_SUPABASE_URL as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "";
const APP_FUNCTIONS_PUBLISHABLE_KEY =
  (import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  "";

if (!APP_FUNCTIONS_URL || !APP_FUNCTIONS_PUBLISHABLE_KEY) {
  throw new Error(
    "[telegram] As variáveis do backend são obrigatórias para chamar as funções do app.",
  );
}

type TelegramLinkCodeFunction = "telegram-link-code" | "telegram-reports-link-code";

export function normalizeTelegramBotCode(input: string) {
  const readableInput = input.replace(/[|]/g, "1");
  const commandMatch = readableInput.match(/\/start(?:@\w+)?\s+(\d{6})\b/i);
  if (commandMatch) return commandMatch[1];

  for (const line of readableInput.split(/\r?\n/)) {
    const candidate = line
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z0-9]{6,12}$/.test(candidate)) return candidate;
  }

  const tokens = readableInput.toUpperCase().match(/[A-Z0-9]{6,12}/g) ?? [];
  const mixedToken = tokens.find((token) => /[A-Z]/.test(token) && /\d/.test(token));
  if (mixedToken) return mixedToken;
  const numericToken = tokens.find((token) => /^\d{6}$/.test(token));
  if (numericToken) return numericToken;
  const compact = readableInput
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return compact;
}

export async function invokeUserFunction(functionName: string, body: unknown = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error("Sessão expirada. Saia e entre novamente para continuar.");
  }

  const response = await fetch(`${APP_FUNCTIONS_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: APP_FUNCTIONS_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text };
  }

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || `Erro ${response.status} ao gerar código do Telegram`);
  }

  return payload;
}

export async function generateTelegramLinkCode(functionName: TelegramLinkCodeFunction = "telegram-link-code") {
  return invokeUserFunction(functionName);
}
