-- Migration para criar a tabela de preferências e agendar o cron do Relatório Financeiro Diário
-- Projeto oficial: syyxnqzxqabeuqbuptkh

CREATE TABLE IF NOT EXISTS public.telegram_daily_financial_summary_prefs (
  user_id UUID PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  send_whatsapp BOOLEAN NOT NULL DEFAULT false,
  whatsapp_phone TEXT,
  send_time_1 TEXT,
  send_time_2 TEXT,
  send_time_3 TEXT,
  last_sent JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.telegram_daily_financial_summary_prefs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'telegram_daily_financial_summary_prefs' 
    AND policyname = 'Users can manage own telegram_daily_financial_summary_prefs'
  ) THEN
    CREATE POLICY "Users can manage own telegram_daily_financial_summary_prefs"
      ON public.telegram_daily_financial_summary_prefs
      FOR ALL
      TO authenticated
      USING (user_id = auth.uid() OR user_id = public.get_data_owner_id(auth.uid()))
      WITH CHECK (user_id = auth.uid() OR user_id = public.get_data_owner_id(auth.uid()));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_daily_financial_summary_prefs TO authenticated;
GRANT ALL ON public.telegram_daily_financial_summary_prefs TO service_role;

-- Agendamento no pg_cron (a cada 1 minuto para verificação pontual dos horários cadastrados)
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('telegram-daily-financial-summary');
  EXCEPTION WHEN others THEN NULL;
  END;

  PERFORM cron.schedule(
    'telegram-daily-financial-summary',
    '* * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-daily-financial-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-source', 'pg_cron',
        'x-cron-secret', 'emprestai_cron_internal_secret_2026'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );
END $$;
