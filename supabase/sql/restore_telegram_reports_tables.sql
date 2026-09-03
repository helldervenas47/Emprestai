CREATE TABLE IF NOT EXISTS public.telegram_summary_prefs (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  send_time text NOT NULL DEFAULT '19:00',
  last_sent_date text,
  weekly_enabled boolean NOT NULL DEFAULT false,
  weekly_send_time text NOT NULL DEFAULT '09:00',
  weekly_send_weekday smallint NOT NULL DEFAULT 1,
  last_weekly_sent_date text,
  monthly_enabled boolean NOT NULL DEFAULT false,
  monthly_send_time text NOT NULL DEFAULT '09:00',
  monthly_send_day smallint NOT NULL DEFAULT 1,
  last_monthly_sent_month text,
  monthly_format text NOT NULL DEFAULT 'text' CHECK (monthly_format IN ('text','image')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_summary_prefs TO authenticated;
GRANT ALL ON public.telegram_summary_prefs TO service_role;

ALTER TABLE public.telegram_summary_prefs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_summary_prefs' AND policyname = 'Users view own summary prefs') THEN
    CREATE POLICY "Users view own summary prefs" ON public.telegram_summary_prefs FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_summary_prefs' AND policyname = 'Users insert own summary prefs') THEN
    CREATE POLICY "Users insert own summary prefs" ON public.telegram_summary_prefs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_summary_prefs' AND policyname = 'Users update own summary prefs') THEN
    CREATE POLICY "Users update own summary prefs" ON public.telegram_summary_prefs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_summary_prefs' AND policyname = 'Users delete own summary prefs') THEN
    CREATE POLICY "Users delete own summary prefs" ON public.telegram_summary_prefs FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_summary_prefs' AND policyname = 'Service role manages summary prefs') THEN
    CREATE POLICY "Service role manages summary prefs" ON public.telegram_summary_prefs FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_telegram_summary_prefs_updated ON public.telegram_summary_prefs;
CREATE TRIGGER trg_telegram_summary_prefs_updated
  BEFORE UPDATE ON public.telegram_summary_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_reports_bot_state' AND policyname = 'Service role manages reports bot state') THEN
    CREATE POLICY "Service role manages reports bot state" ON public.telegram_reports_bot_state FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_reports_links' AND policyname = 'Service role manages reports links') THEN
    CREATE POLICY "Service role manages reports links" ON public.telegram_reports_links FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_reports_links' AND policyname = 'Users view own reports link') THEN
    CREATE POLICY "Users view own reports link" ON public.telegram_reports_links FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_reports_links' AND policyname = 'Users delete own reports link') THEN
    CREATE POLICY "Users delete own reports link" ON public.telegram_reports_links FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_reports_link_codes' AND policyname = 'Service role manages reports link codes') THEN
    CREATE POLICY "Service role manages reports link codes" ON public.telegram_reports_link_codes FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_reports_link_codes' AND policyname = 'Users view own reports link codes') THEN
    CREATE POLICY "Users view own reports link codes" ON public.telegram_reports_link_codes FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.telegram_manager_weekly_prefs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  send_weekday smallint NOT NULL DEFAULT 1,
  send_time text NOT NULL DEFAULT '09:00',
  message_template text NOT NULL DEFAULT $$Olá {nome_gerente}! 👋
Resumo da próxima semana:

⚠️ Atrasados: {total_emprestimos_atrasados}
📅 Vencendo na próxima semana: {total_emprestimos_semana}
💰 Valor restante total: {valor_total}

Clientes:
{lista_clientes}$$,
  last_sent_date text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_manager_weekly_prefs TO authenticated;
GRANT ALL ON public.telegram_manager_weekly_prefs TO service_role;

ALTER TABLE public.telegram_manager_weekly_prefs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_manager_weekly_prefs' AND policyname = 'Users view own manager weekly prefs') THEN
    CREATE POLICY "Users view own manager weekly prefs" ON public.telegram_manager_weekly_prefs FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_manager_weekly_prefs' AND policyname = 'Users insert own manager weekly prefs') THEN
    CREATE POLICY "Users insert own manager weekly prefs" ON public.telegram_manager_weekly_prefs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_manager_weekly_prefs' AND policyname = 'Users update own manager weekly prefs') THEN
    CREATE POLICY "Users update own manager weekly prefs" ON public.telegram_manager_weekly_prefs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_manager_weekly_prefs' AND policyname = 'Users delete own manager weekly prefs') THEN
    CREATE POLICY "Users delete own manager weekly prefs" ON public.telegram_manager_weekly_prefs FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_manager_weekly_prefs' AND policyname = 'Service role manages manager weekly prefs') THEN
    CREATE POLICY "Service role manages manager weekly prefs" ON public.telegram_manager_weekly_prefs FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_telegram_manager_weekly_prefs_updated_at ON public.telegram_manager_weekly_prefs;
CREATE TRIGGER update_telegram_manager_weekly_prefs_updated_at
  BEFORE UPDATE ON public.telegram_manager_weekly_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.telegram_bots ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE SET NULL;
GRANT ALL ON public.telegram_bots TO service_role;

NOTIFY pgrst, 'reload schema';