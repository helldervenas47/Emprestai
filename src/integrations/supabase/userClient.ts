// Cliente principal do backend.
// PRIORIDADE: URL/KEY do banco de dados EXTERNO do Helder (syyxnqzxqabeuqbuptkh).
import { createClient } from '@supabase/supabase-js';
// We use any for Database to avoid build breaks when the generated types are empty or stale,
// which often happens in this project due to direct ZIP-based migration of external projects.
type Database = any;

// Fallbacks embutidos para o projeto Supabase deste app. São chaves PÚBLICAS
// (publishable/anon) — seguras para o bundle do frontend. Assim o app funciona
// em qualquer máquina/deploy mesmo sem .env, e as variáveis de ambiente
// continuam podendo sobrescrever quando definidas (dev/staging/prod).
const FALLBACK_SUPABASE_URL = "https://syyxnqzxqabeuqbuptkh.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_1cN15xxS-f-ajzu7nlS3UA_0cwObBLW";

const EXTERNAL_SUPABASE_URL = import.meta.env.VITE_EXTERNAL_SUPABASE_URL as string | undefined;
const EXTERNAL_SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY as string | undefined;
const CLOUD_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CLOUD_SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const USER_SUPABASE_URL =
  EXTERNAL_SUPABASE_URL || CLOUD_SUPABASE_URL || FALLBACK_SUPABASE_URL;
export const USER_SUPABASE_PUBLISHABLE_KEY =
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY || CLOUD_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;

export const MISSING_SUPABASE_ENV: string[] = [
  !USER_SUPABASE_URL && "VITE_SUPABASE_URL ou VITE_EXTERNAL_SUPABASE_URL",
  !USER_SUPABASE_PUBLISHABLE_KEY && "VITE_SUPABASE_PUBLISHABLE_KEY ou VITE_EXTERNAL_SUPABASE_ANON_KEY",
].filter(Boolean) as string[];

export const IS_SUPABASE_CONFIGURED = MISSING_SUPABASE_ENV.length === 0;

if (!IS_SUPABASE_CONFIGURED && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.error(
    "[supabase] Variáveis de ambiente ausentes:",
    MISSING_SUPABASE_ENV.join(", "),
    "\nDefina-as no .env (veja .env.example) ou use as variáveis nativas do backend do projeto.",
  );
}

// Chave de storage EXCLUSIVA do projeto externo. Evita colisão caso o
// client auto-gerado da Lovable Cloud (src/integrations/supabase/client.ts)
// seja instanciado em paralelo por alguma dependência — sem isso ambos
// compartilhariam a mesma chave `sb-*-auth-token` e causariam logout
// silencioso / sessão trocada entre projetos.
export const USER_SUPABASE_STORAGE_KEY = "sb-user-external-auth";

// Se as variáveis estiverem ausentes, exportamos um placeholder inerte para
// evitar que o import quebre o bundle. O `main.tsx` intercepta esse estado
// e renderiza uma tela de erro amigável antes de qualquer uso do client.
export const supabase = IS_SUPABASE_CONFIGURED
  ? createClient<Database>(USER_SUPABASE_URL, USER_SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: localStorage,
        storageKey: USER_SUPABASE_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        // PWA-friendly OAuth: usa PKCE (sem expor token na URL) e troca o
        // ?code=... automaticamente no retorno do Google, sem reload extra.
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(
            `[supabase] Client não inicializado. Variáveis ausentes: ${MISSING_SUPABASE_ENV.join(", ")}`,
          );
        },
      },
    ) as ReturnType<typeof createClient<Database>>);
