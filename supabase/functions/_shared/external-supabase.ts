// Helper para acessar EXCLUSIVAMENTE o banco externo do usuário
// (syyxnqzxqabeuqbuptkh). Quando a function roda no projeto Lovable Cloud,
// usa EXTERNAL_*; quando roda diretamente no projeto externo, usa SUPABASE_*.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// Permite sobrescrever via secret EXTERNAL_PROJECT_REF; mantém o valor
// histórico como fallback para não quebrar deploys existentes.
const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(
      `[external-supabase] secret ${name} não configurado. Configure-o em Settings → Secrets para apontar ao projeto externo (syyxnqzxqabeuqbuptkh).`,
    );
  }
  return v;
}

export function getExternalSupabaseUrl(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (external?.includes(EXTERNAL_PROJECT_REF)) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF)) return nativeUrl;

  // Evita registrar webhooks no projeto antigo quando EXTERNAL_SUPABASE_URL
  // ficou stale em Secrets. A URL pública do projeto é derivável pelo ref.
  return `https://${EXTERNAL_PROJECT_REF}.supabase.co`;
}

export function getExternalServiceRoleKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return required("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
}

export function getExternalAnonKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return required("EXTERNAL_SUPABASE_ANON_KEY");
}

/** Admin client (service role) apontando ao Supabase EXTERNO. */
export function getExternalAdmin(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey(), {
    auth: {
      persistSession: false,
    },
  });
}

/** Anon client usado para validar JWTs emitidos pelo Supabase EXTERNO. */
export function getExternalUserClient(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalAnonKey(), {
    auth: {
      persistSession: false,
    },
  });
}

