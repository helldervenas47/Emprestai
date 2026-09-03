ALTER TABLE public.telegram_bots
  ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_bots_bot_id ON public.telegram_bots(bot_id);

UPDATE public.system_telegram_bots
SET purpose = 'reports', updated_at = now()
WHERE lower(coalesce(bot_username, '') || ' ' || coalesce(name, '') || ' ' || coalesce(description, '')) ~ '(relat[óo]rio|relatorios|report)';

UPDATE public.system_telegram_bots
SET purpose = 'expenses', updated_at = now()
WHERE purpose <> 'reports'
  AND lower(coalesce(bot_username, '') || ' ' || coalesce(name, '') || ' ' || coalesce(description, '')) ~ '(despesa|despesas|expense)';

WITH reports_bot AS (
  SELECT id
  FROM public.system_telegram_bots
  WHERE active = true AND purpose = 'reports'
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.telegram_reports_links l
SET bot_id = reports_bot.id
FROM reports_bot
WHERE l.bot_id IS NULL;

WITH expenses_bot AS (
  SELECT id
  FROM public.system_telegram_bots
  WHERE active = true AND purpose = 'expenses'
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.telegram_links l
SET bot_id = expenses_bot.id
FROM expenses_bot
WHERE l.bot_id IS NULL;