SELECT cron.schedule(
  'telegram-weekly-summary',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tovwnqbjeaecwtymbncy.supabase.co/functions/v1/telegram-weekly-summary',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvdnducWJqZWFlY3d0eW1ibmN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzc1MzMsImV4cCI6MjA5MTM1MzUzM30.g_7gM6sHSq0NbSqrXMSVQAWF4RZdSzs4GYxSRtEO_eo"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);