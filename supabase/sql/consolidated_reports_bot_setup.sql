-- =====================================================================
-- CONSOLIDATED SETUP - Bot de Relatórios (Supabase externo)
-- Rode este arquivo inteiro no SQL Editor do projeto externo.
-- Idempotente: pode rodar várias vezes sem quebrar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) telegram_reports_links  (vínculo user <-> chat_id do bot relatórios)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_reports_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chat_id bigint NOT NULL,
  bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE SET NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_reports_links_user_id ON public.telegram_reports_links(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_reports_links_bot_id ON public.telegram_reports_links(bot_id);

GRANT SELECT, DELETE ON public.telegram_reports_links TO authenticated;
GRANT ALL ON public.telegram_reports_links TO service_role;

ALTER TABLE public.telegram_reports_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='telegram_reports_links' AND policyname='Service role manages reports links') THEN
    CREATE POLICY "Service role manages reports links" ON public.telegram_reports_links
      FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='telegram_reports_links' AND policyname='Users view own reports link') THEN
    CREATE POLICY "Users view own reports link" ON public.telegram_reports_links
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='telegram_reports_links' AND policyname='Users delete own reports link') THEN
    CREATE POLICY "Users delete own reports link" ON public.telegram_reports_links
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2) telegram_reports_link_codes  (códigos temporários de vinculação)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_reports_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_reports_link_codes_code ON public.telegram_reports_link_codes(code);
CREATE INDEX IF NOT EXISTS idx_telegram_reports_link_codes_user_id ON public.telegram_reports_link_codes(user_id);

GRANT SELECT ON public.telegram_reports_link_codes TO authenticated;
GRANT ALL ON public.telegram_reports_link_codes TO service_role;

ALTER TABLE public.telegram_reports_link_codes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='telegram_reports_link_codes' AND policyname='Service role manages reports link codes') THEN
    CREATE POLICY "Service role manages reports link codes" ON public.telegram_reports_link_codes
      FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='telegram_reports_link_codes' AND policyname='Users view own reports link codes') THEN
    CREATE POLICY "Users view own reports link codes" ON public.telegram_reports_link_codes
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) telegram_weekly_vencimentos_prefs  (toggle do relatório semanal)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_weekly_vencimentos_prefs (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_weekly_vencimentos_prefs TO authenticated;
GRANT ALL ON public.telegram_weekly_vencimentos_prefs TO service_role;

ALTER TABLE public.telegram_weekly_vencimentos_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own weekly prefs" ON public.telegram_weekly_vencimentos_prefs;
CREATE POLICY "users manage own weekly prefs"
  ON public.telegram_weekly_vencimentos_prefs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 4) telegram_reports_bot_state  (offset do long-polling)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_reports_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.telegram_reports_bot_state (id, update_offset)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

GRANT ALL ON public.telegram_reports_bot_state TO service_role;

ALTER TABLE public.telegram_reports_bot_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='telegram_reports_bot_state' AND policyname='Service role manages reports bot state') THEN
    CREATE POLICY "Service role manages reports bot state" ON public.telegram_reports_bot_state
      FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- =====================================================================
-- FIM. Verifique com:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name LIKE 'telegram_reports%'
--      OR table_name='telegram_weekly_vencimentos_prefs';
-- =====================================================================
