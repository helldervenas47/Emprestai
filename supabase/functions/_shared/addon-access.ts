import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

/**
 * Verifica se um usuário possui o add-on Premium especificado ativo.
 * Permite acesso caso o usuário possua registro ativo em user_addons
 * ou caso possua perfil de administrador.
 */
export async function hasAddonAccess(
  admin: SupabaseClient,
  userId: string,
  addonKey: string = "telegram",
  env: string = "live"
): Promise<boolean> {
  if (!userId) return false;

  try {
    // 1. Checa a tabela user_addons
    const { data: addon, error } = await admin
      .from("user_addons")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .eq("environment", env)
      .eq("addon_key", addonKey)
      .maybeSingle();

    if (!error && addon) {
      const isActiveStatus = addon.status === "active" || addon.status === "trialing";
      const notExpired = !addon.current_period_end || new Date(addon.current_period_end).getTime() > Date.now();
      if (isActiveStatus && notExpired) {
        return true;
      }
    }

    // 2. Fallback para verificar se é admin
    const { data: hasAdminRole } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    if (hasAdminRole === true) {
      return true;
    }

    return false;
  } catch (e) {
    console.warn("[addon-access] Erro ao verificar acesso ao add-on:", e);
    // Em caso de erro na checagem, permite para não interromper indevidamente se a tabela estiver sendo criada
    return false;
  }
}
