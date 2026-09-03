#!/usr/bin/env bash
# =============================================================================
# Deploy das edge functions do Telegram no projeto Supabase do usuário
# Projeto: syyxnqzxqabeuqbuptkh
#
# Pré-requisitos:
#   - Supabase CLI instalado (https://supabase.com/docs/guides/cli)
#       macOS:  brew install supabase/tap/supabase
#       Linux:  npm i -g supabase
#       Windows (scoop): scoop install supabase
#   - Docker NÃO é necessário para "functions deploy".
#
# Como rodar:
#   chmod +x scripts/deploy-telegram-functions.sh
#   ./scripts/deploy-telegram-functions.sh
#
# Variáveis de ambiente:
#   SUPABASE_ACCESS_TOKEN  Token pessoal do Supabase (sbp_...)
#   PROJECT_REF            Ref do projeto (default: syyxnqzxqabeuqbuptkh)
#   DB_PASSWORD            Senha do banco (usada no link)
# =============================================================================
set -euo pipefail

# ---- Credenciais ------------------------------------------------------------
: "${SUPABASE_ACCESS_TOKEN:?Defina SUPABASE_ACCESS_TOKEN antes do deploy}"
: "${DB_PASSWORD:?Defina DB_PASSWORD antes do deploy}"
export SUPABASE_ACCESS_TOKEN
PROJECT_REF="${PROJECT_REF:-syyxnqzxqabeuqbuptkh}"

# ---- Sanity check -----------------------------------------------------------
if ! command -v supabase >/dev/null 2>&1; then
  echo "ERRO: Supabase CLI não encontrado no PATH."
  echo "      Instale: https://supabase.com/docs/guides/cli"
  exit 1
fi

# ---- Link ao projeto --------------------------------------------------------
echo "==> Linkando projeto $PROJECT_REF ..."
supabase link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD" || true

# ---- Functions do Telegram --------------------------------------------------
FUNCTIONS=(
  telegram-webhook
  telegram-webhook-setup
  telegram-process
  telegram-poll
  telegram-reports-poll
  telegram-link-code
  telegram-reports-link-code
  link-telegram-bot
  debug-telegram
  telegram-set-commands
  telegram-billing-summary
  telegram-daily-summary
  telegram-weekly-summary
  telegram-monthly-summary
  telegram-accumulated-delinquency-summary
  telegram-manager-weekly-summary
  validate-telegram-bot
  send-personal-insights-telegram
  daily-planning-summary
  incomes-expenses-summary
)

# ---- Deploy (sem verificação de JWT, igual ao webhook do Telegram) ----------
FAILED=()
for fn in "${FUNCTIONS[@]}"; do
  echo ""
  echo "==> Deploy: $fn"
  if supabase functions deploy "$fn" \
       --project-ref "$PROJECT_REF" \
       --no-verify-jwt; then
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

# ---- Lembrete sobre secrets -------------------------------------------------
cat <<'EOF'

Próximo passo (uma única vez) — definir os SECRETS no projeto externo:

  supabase secrets set --project-ref "$PROJECT_REF" \
    TELEGRAM_BOT_TOKEN="..." \
    TELEGRAM_BOT_TOKEN_REPORTS="..." \
    TELEGRAM_API_KEY="..." \
    LOVABLE_API_KEY="..." \
    GEMINI_API_KEY="..."

OBS: SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são
injetados automaticamente pelo Supabase em cada function — não precisa setar.

Em seguida, registre o webhook de cada bot apontando para:
  https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-webhook
EOF
