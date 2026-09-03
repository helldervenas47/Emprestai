import { supabase } from "@/integrations/supabase/client";

export const USERNAME_REGEX = /^[a-z0-9._-]{4,30}$/;
export const USERNAME_MIN = 4;
export const USERNAME_MAX = 30;

/** Normaliza (lowercase, sem espaços). Não valida. */
export function normalizeUsername(raw: string): string {
  return (raw || "").toLowerCase().replace(/\s+/g, "").trim();
}

/** Retorna null se válido, ou mensagem de erro em pt-BR. */
export function validateUsernameFormat(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (!u) return "Informe um nome de usuário.";
  if (u.length < USERNAME_MIN) return `Mínimo de ${USERNAME_MIN} caracteres.`;
  if (u.length > USERNAME_MAX) return `Máximo de ${USERNAME_MAX} caracteres.`;
  if (!USERNAME_REGEX.test(u)) {
    return "Use apenas letras, números, ponto (.), underline (_) e hífen (-).";
  }
  return null;
}

/**
 * Retorna true se o username está disponível. Ignora erros silenciosamente
 * (falha aberta) — a validação final é feita server-side na edge function.
 */
export async function isUsernameAvailable(
  raw: string,
  ignoreUserId?: string,
): Promise<boolean> {
  const err = validateUsernameFormat(raw);
  if (err) return false;
  const username = normalizeUsername(raw);

  try {
    const { data, error } = await supabase.rpc('is_username_available', {
      username_to_check: username,
      ignore_user_id: ignoreUserId || null,
    });
    
    if (error) {
      console.error("Erro ao verificar disponibilidade de usuário:", error);
      return false; // Falha fechada: assume como indisponível se houver erro
    }
    
    return data === true;
  } catch (error) {
    console.error("Exceção ao verificar disponibilidade de usuário:", error);
    return false;
  }
}

/** Wrapper detalhado para UIs que precisam do motivo. */
export async function checkUsernameAvailability(
  raw: string,
  ignoreUserId?: string,
): Promise<
  | { available: true }
  | { available: false; reason: "invalid" | "taken"; message: string }
> {
  const err = validateUsernameFormat(raw);
  if (err) return { available: false, reason: "invalid", message: err };
  const ok = await isUsernameAvailable(raw, ignoreUserId);
  return ok
    ? { available: true }
    : { available: false, reason: "taken", message: "Nome de usuário já está em uso." };
}
