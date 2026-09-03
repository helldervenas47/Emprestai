-- Permite manter bot de despesas e bot de relatórios conectados ao mesmo usuário/chat.
-- Antes havia unicidade apenas por user_id/chat_id, o que fazia um vínculo substituir o outro.

ALTER TABLE public.telegram_links DROP CONSTRAINT IF EXISTS telegram_links_user_id_key;
ALTER TABLE public.telegram_links DROP CONSTRAINT IF EXISTS telegram_links_chat_id_key;
ALTER TABLE public.telegram_links DROP CONSTRAINT IF EXISTS telegram_links_user_chat_unique;

DROP INDEX IF EXISTS telegram_links_user_chat_bot_unique;
CREATE UNIQUE INDEX telegram_links_user_chat_bot_unique
  ON public.telegram_links (user_id, chat_id, COALESCE(bot_id, '00000000-0000-0000-0000-000000000000'::uuid));
