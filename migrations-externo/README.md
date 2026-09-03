# Migração Edge Functions → Supabase Externo

Este diretório contém SQL e instruções para concluir a migração das edge functions
do Lovable Cloud para o projeto Supabase externo (`syyxnqzxqabeuqbuptkh`).

O código das functions (em `supabase/functions/<nome>/index.ts`) **não foi alterado** —
ele usa `Deno.env.get('SUPABASE_URL')` / `SUPABASE_SERVICE_ROLE_KEY` nativos, que
no projeto externo já apontam para o externo.

## Ordem de execução

1. **Deploy das 33 functions no Supabase externo** (manual via dashboard ou CLI).
   Lista completa abaixo. Copie o conteúdo de cada `supabase/functions/<nome>/index.ts`
   para o projeto externo.

2. **Confirmar secrets no projeto externo** (Project Settings → Edge Functions → Secrets):
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_BOT_TOKEN_REPORTS`
   - `GEMINI_API_KEY`
   - `LOVABLE_API_KEY` (se alguma function usa AI Gateway)
   - `TURNSTILE_SECRET_KEY` (se cadastro/login usa)
   - `PADDLE_*` (para get-paddle-price, se aplicável)

3. **Rodar `01-unschedule-cloud.sql` no Lovable Cloud** (SQL editor do Cloud) — desativa
   os crons antigos.

4. **Rodar `02-schedule-externo.sql` no Supabase externo** (SQL editor do externo) —
   recria os crons apontando para a URL nova.

5. **Repontar o webhook do Telegram** chamando uma vez (no externo):
   `POST https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-webhook-setup`

6. Validar e, quando estável, **deletar as 33 functions do Cloud** para evitar execução
   duplicada (peça ao agente para usar `supabase--delete_edge_functions`).

## Functions a deployar no externo (33)

### Telegram
- telegram-accumulated-delinquency-summary
- telegram-billing-summary
- telegram-daily-summary
- telegram-due-today-loans-summary
- telegram-link-code
- telegram-manager-weekly-summary
- telegram-monthly-summary
- telegram-overdue-loans-summary
- telegram-poll
- telegram-process
- telegram-reports-link-code
- telegram-reports-poll
- telegram-set-commands
- telegram-vencimentos-semana
- telegram-webhook
- telegram-webhook-setup
- telegram-weekly-summary
- link-telegram-bot
- validate-telegram-bot
- debug-telegram

### Outras
- add-products-active
- daily-planning-summary
- debug-cron-jobs
- ensure-user-role
- fix-sales-product-fk
- generate-income-health-report
- generate-personal-insights
- get-paddle-price
- html-to-image-usage
- incomes-expenses-summary
- seed-new-user
- send-personal-insights-telegram
- setup-dashboard-prefs
