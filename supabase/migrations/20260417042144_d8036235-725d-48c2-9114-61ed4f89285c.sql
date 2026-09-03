
-- Independent Telegram bot for billing reports
CREATE TABLE public.telegram_reports_bot_state (
  id INT PRIMARY KEY CHECK (id = 1),
  update_offset BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.telegram_reports_bot_state (id, update_offset) VALUES (1, 0);
ALTER TABLE public.telegram_reports_bot_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages reports bot state" ON public.telegram_reports_bot_state
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE public.telegram_reports_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  chat_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_reports_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages reports links" ON public.telegram_reports_links
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users view own reports link" ON public.telegram_reports_links
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own reports link" ON public.telegram_reports_links
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.telegram_reports_link_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_telegram_reports_link_codes_code ON public.telegram_reports_link_codes(code);
ALTER TABLE public.telegram_reports_link_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages reports link codes" ON public.telegram_reports_link_codes
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users view own reports link codes" ON public.telegram_reports_link_codes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
