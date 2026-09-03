-- Permitir múltiplos vínculos paralelos (1 usuário → N bots) preservando dados
-- e mantendo o bot_code consumido no vínculo para rastreabilidade.

-- 1) telegram_links (despesas) — múltiplos chats por usuário
ALTER TABLE public.telegram_links DROP CONSTRAINT IF EXISTS telegram_links_user_id_key;
ALTER TABLE public.telegram_links
  ADD COLUMN IF NOT EXISTS bot_code text,
  ADD COLUMN IF NOT EXISTS label text;
DO $$ BEGIN
  ALTER TABLE public.telegram_links
    ADD CONSTRAINT telegram_links_user_chat_unique UNIQUE (user_id, chat_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- 2) telegram_reports_links (relatórios) — múltiplos chats por usuário
ALTER TABLE public.telegram_reports_links DROP CONSTRAINT IF EXISTS telegram_reports_links_user_id_key;
ALTER TABLE public.telegram_reports_links
  ADD COLUMN IF NOT EXISTS bot_code text,
  ADD COLUMN IF NOT EXISTS label text;
DO $$ BEGIN
  ALTER TABLE public.telegram_reports_links
    ADD CONSTRAINT telegram_reports_links_user_chat_unique UNIQUE (user_id, chat_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- 3) Política para permitir o usuário inserir/atualizar vínculos próprios via SDK (opcional — mantemos service_role como caminho principal)
DO $$ BEGIN
  CREATE POLICY "Users update own reports link"
    ON public.telegram_reports_links FOR UPDATE TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users update own telegram link"
    ON public.telegram_links FOR UPDATE TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;