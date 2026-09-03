/**
 * Ponte do núcleo de agregação financeira para o frontend.
 *
 * O arquivo real vive em `supabase/functions/_shared/financial-aggregates-core.ts`
 * (puro, sem imports) para que Edge Functions (relatórios / Telegram) e o app
 * usem EXATAMENTE a mesma implementação — nada é copiado ou reescrito.
 */
export * from "../../../../supabase/functions/_shared/financial-aggregates-core";
