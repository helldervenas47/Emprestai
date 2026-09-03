-- Rodar no SQL editor do LOVABLE CLOUD (projeto antigo das functions).
-- Desativa todos os cron jobs que ainda apontam para edge functions do Cloud
-- que foram migradas para o Supabase externo.

DO $$
DECLARE
  job_name TEXT;
  jobs TEXT[] := ARRAY[
    'telegram-daily-summary',
    'telegram-weekly-summary',
    'telegram-monthly-summary',
    'telegram-billing-summary',
    'telegram-accumulated-delinquency-summary',
    'telegram-manager-weekly-summary',
    'incomes-expenses-summary',
    'daily-planning-summary',
    'send-personal-insights-telegram',
    'telegram-poll',
    'telegram-reports-poll'
  ];
BEGIN
  FOREACH job_name IN ARRAY jobs LOOP
    BEGIN
      PERFORM cron.unschedule(job_name);
      RAISE NOTICE 'Unscheduled: %', job_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped % (not scheduled): %', job_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- Conferir o que sobrou agendado no Cloud
SELECT jobid, jobname, schedule, command
FROM cron.job
ORDER BY jobname;
