-- Tabela telegram_bots: cada chat do Telegram (despesas ou relatórios)
-- gera um bot_code curto que pode ser digitado no app para vincular relatórios
-- a esse chat sem depender do fluxo /start CODIGO.
CREATE TABLE IF NOT EXISTS public.telegram_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_code text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('expenses','reports')),
  chat_id bigint NOT NULL,
  created_by_user_id uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_bots_bot_code ON public.telegram_bots (bot_code);
CREATE INDEX IF NOT EXISTS idx_telegram_bots_kind_chat ON public.telegram_bots (kind, chat_id);

ALTER TABLE public.telegram_bots ENABLE ROW LEVEL SECURITY;

-- Apenas service_role gerencia (pollers e edge functions). Usuários não leem direto.
CREATE POLICY "Service role manages telegram_bots"
  ON public.telegram_bots
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_telegram_bots_updated_at
  BEFORE UPDATE ON public.telegram_bots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();