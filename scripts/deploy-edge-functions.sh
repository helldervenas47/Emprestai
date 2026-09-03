#!/usr/bin/env bash
# =============================================================================
# Deploy de TODAS as edge functions para o projeto Supabase do usuário
# Projeto: syyxnqzxqabeuqbuptkh
#
# Pré-requisitos (instalar uma vez):
#   - Supabase CLI: https://supabase.com/docs/guides/cli
#       macOS:  brew install supabase/tap/supabase
#       Linux:  npm i -g supabase   (ou veja docs)
#       Windows (scoop): scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase
#   - Docker NÃO é necessário para "functions deploy".
#
# Como rodar (com as credenciais no ambiente, nunca neste arquivo):
#   chmod +x scripts/deploy-edge-functions.sh
#   ./scripts/deploy-edge-functions.sh
#
# Para definir/atualizar os SECRETS extras (TELEGRAM_BOT_TOKEN, LOVABLE_API_KEY,
# GEMINI_API_KEY, etc.), preencha o bloco SECRETS abaixo e descomente.
# =============================================================================
set -euo pipefail

# ---- Credenciais ------------------------------------------------------------
: "${SUPABASE_ACCESS_TOKEN:?Defina SUPABASE_ACCESS_TOKEN antes do deploy}"
: "${DB_PASSWORD:?Defina DB_PASSWORD antes do deploy}"
export SUPABASE_ACCESS_TOKEN
PROJECT_REF="${PROJECT_REF:-syyxnqzxqabeuqbuptkh}"

# ---- Link ao projeto --------------------------------------------------------
echo "==> Linkando projeto $PROJECT_REF ..."
supabase link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD"

# ---- Lista de functions -----------------------------------------------------
FUNCTIONS=(
  admin-create-user
  admin-manage-user
  daily-planning-summary
  debug-telegram
  export-full-backup
  generate-income-health-report
  generate-personal-insights
  generate-risk-reduction-report
  get-paddle-price
  html-to-image-usage
  incomes-expenses-summary
  link-telegram-bot
  list-app-integrations
  list-backups
  login-with-username
  manage-sessions
  migrate-sql
  notify-approval-request
  notify-budget-overrun
  painel-migracao
  payments-webhook
  process-auto-debit-expenses
  recalculate-credit-limits
  send-personal-insights-telegram
  send-push-notifications
  send-webhook-report
  send-whatsapp-billing
  send-whatsapp-manager-summary
  sync-cdi-rate
  sync-client-analysis
  telegram-accumulated-delinquency-summary
  telegram-billing-summary
  telegram-daily-summary
  telegram-link-code
  telegram-manager-weekly-summary
  telegram-monthly-summary
  telegram-poll
  telegram-process
  telegram-reports-link-code
  telegram-reports-poll
  telegram-set-commands
  telegram-webhook
  telegram-webhook-setup
  telegram-weekly-summary
  validate-telegram-bot
  whatsapp-assistant-webhook
  wipe-all-data
)

# ---- Deploy -----------------------------------------------------------------
FAILED=()
for fn in "${FUNCTIONS[@]}"; do
  echo ""
  echo "==> Deploy: $fn"
  if supabase functions deploy "$fn" --project-ref "$PROJECT_REF"; then
    echo "    OK"
  else
    echo "    FALHOU: $fn"
    FAILED+=("$fn")
  fi
done

echo ""
echo "============================================================"
echo "Deploy finalizado. Total: ${#FUNCTIONS[@]}  Falhas: ${#FAILED[@]}"
if [ ${#FAILED[@]} -gt 0 ]; then
  printf '  - %s\n' "${FAILED[@]}"
fi
echo "============================================================"

# ---- (Opcional) Definir SECRETS --------------------------------------------
# Preencha e descomente para enviar de uma vez:
#
# supabase secrets set --project-ref "$PROJECT_REF" \
#   TELEGRAM_BOT_TOKEN="..." \
#   TELEGRAM_BOT_TOKEN_REPORTS="..." \
#   LOVABLE_API_KEY="..." \
#   GEMINI_API_KEY="..." \
#   WHATSMIAU_API_KEY="..." \
#   HTML_TO_IMAGE_USER_ID="..." \
#   HTML_TO_IMAGE_API_KEY="..." \
#   VAPID_PUBLIC_KEY="..." \
#   VAPID_PRIVATE_KEY="..." \
#   BACKUP_CRON_SECRET="..." \
#   PADDLE_API_KEY="..." \
#   PADDLE_WEBHOOK_SECRET="..." \
#   PADDLE_ENV="sandbox"
