ALTER TABLE public.telegram_reports_links
  ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE SET NULL;

ALTER TABLE public.telegram_links
  ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_reports_links_bot_id ON public.telegram_reports_links(bot_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_bot_id ON public.telegram_links(bot_id);