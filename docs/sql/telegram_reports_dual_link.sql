-- Execute este SQL no SQL Editor do seu Supabase EXTERNO
-- (o mesmo apontado por EXTERNAL_SUPABASE_URL).
-- Cria as tabelas dedicadas ao bot de Relatórios, isoladas do bot de Despesas.

-- =========================================
-- telegram_reports_links
-- =========================================
CREATE TABLE IF NOT EXISTS public.telegram_reports_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  chat_id     text NOT NULL,
  bot_id      uuid NOT NULL,
  label       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_reports_links_user_bot_uniq
  ON public.telegram_reports_links (user_id, bot_id);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_reports_links_chat_bot_uniq
  ON public.telegram_reports_links (chat_id, bot_id);
CREATE INDEX IF NOT EXISTS telegram_reports_links_user_idx
  ON public.telegram_reports_links (user_id);
CREATE INDEX IF NOT EXISTS telegram_reports_links_chat_idx
  ON public.telegram_reports_links (chat_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_reports_links TO authenticated;
GRANT ALL ON public.telegram_reports_links TO service_role;

ALTER TABLE public.telegram_reports_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own reports links" ON public.telegram_reports_links;
CREATE POLICY "Users manage own reports links"
  ON public.telegram_reports_links
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================
-- telegram_reports_link_codes
-- =========================================
CREATE TABLE IF NOT EXISTS public.telegram_reports_link_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  user_id     uuid,
  chat_id     text,
  bot_id      uuid NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_reports_link_codes_code_uniq
  ON public.telegram_reports_link_codes (code);
CREATE INDEX IF NOT EXISTS telegram_reports_link_codes_user_bot_idx
  ON public.telegram_reports_link_codes (user_id, bot_id);
CREATE INDEX IF NOT EXISTS telegram_reports_link_codes_chat_bot_idx
  ON public.telegram_reports_link_codes (chat_id, bot_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_reports_link_codes TO authenticated;
GRANT ALL ON public.telegram_reports_link_codes TO service_role;

ALTER TABLE public.telegram_reports_link_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own reports link codes" ON public.telegram_reports_link_codes;
CREATE POLICY "Users manage own reports link codes"
  ON public.telegram_reports_link_codes
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================
-- Validação rápida (opcional)
-- =========================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('telegram_reports_links','telegram_reports_link_codes');
