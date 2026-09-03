-- ============================================================
-- Rodar este SQL no SEU Supabase externo (syyxnqzxqabeuqbuptkh)
-- via Dashboard → SQL Editor → New query → Run
-- Cria as tabelas que as edge functions de Telegram usam.
-- ============================================================

-- 1) system_telegram_bots: bots de despesas/receitas/relatórios
CREATE TABLE IF NOT EXISTS public.system_telegram_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,                    -- 'expenses' | 'incomes' | 'reports'
  name text,
  bot_username text,
  token text NOT NULL,                      -- bot token Telegram
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_telegram_bots TO authenticated;
GRANT ALL ON public.system_telegram_bots TO service_role;
ALTER TABLE public.system_telegram_bots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read bots" ON public.system_telegram_bots FOR SELECT TO authenticated USING (true);

-- 2) telegram_messages: mensagens recebidas (webhook)
CREATE TABLE IF NOT EXISTS public.telegram_messages (
  update_id bigint PRIMARY KEY,
  chat_id bigint NOT NULL,
  text text,
  raw_update jsonb NOT NULL,
  bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE SET NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tg_messages_chat ON public.telegram_messages (chat_id);
CREATE INDEX IF NOT EXISTS idx_tg_messages_unproc ON public.telegram_messages (processed, created_at);
GRANT SELECT ON public.telegram_messages TO authenticated;
GRANT ALL ON public.telegram_messages TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

-- 3) telegram_links: vincula user_id ↔ chat_id ↔ bot_id
CREATE TABLE IF NOT EXISTS public.telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chat_id bigint NOT NULL,
  bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, bot_id)
);
CREATE INDEX IF NOT EXISTS idx_tg_links_user ON public.telegram_links (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_links TO authenticated;
GRANT ALL ON public.telegram_links TO service_role;
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own links" ON public.telegram_links FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) telegram_link_codes: códigos numéricos temporários
CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_link_codes TO authenticated;
GRANT ALL ON public.telegram_link_codes TO service_role;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own codes" ON public.telegram_link_codes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5) telegram_image_delivery_prefs
CREATE TABLE IF NOT EXISTS public.telegram_image_delivery_prefs (
  user_id uuid PRIMARY KEY,
  send_image boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_image_delivery_prefs TO authenticated;
GRANT ALL ON public.telegram_image_delivery_prefs TO service_role;
ALTER TABLE public.telegram_image_delivery_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.telegram_image_delivery_prefs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6) telegram_job_logs (opcional, p/ logs do webhook)
CREATE TABLE IF NOT EXISTS public.telegram_job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  ok boolean NOT NULL,
  processed int,
  error text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_job_logs TO service_role;
ALTER TABLE public.telegram_job_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DEPOIS de criar as tabelas, insira os bots em system_telegram_bots:
--
-- INSERT INTO public.system_telegram_bots (purpose, name, bot_username, token, active)
-- VALUES
--   ('expenses', 'Despesas', 'seu_bot_despesas', 'TOKEN_DO_BOTFATHER', true),
--   ('reports',  'Relatórios', 'seu_bot_relatorios', 'TOKEN_DO_BOTFATHER', true);
-- ============================================================
