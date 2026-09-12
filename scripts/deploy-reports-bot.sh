#!/usr/bin/env bash
# Deploy das edge functions do bot de relatórios no Supabase EXTERNO.
#
# Pré-requisitos:
#   - Supabase CLI instalado (https://supabase.com/docs/guides/cli)
#   - Logado: `supabase login`
#   - Variáveis de ambiente:
#       EXTERNAL_PROJECT_REF=syyxnqzxqabeuqbuptkh
#
# Uso:
#   chmod +x scripts/deploy-reports-bot.sh
#   EXTERNAL_PROJECT_REF=syyxnqzxqabeuqbuptkh ./scripts/deploy-reports-bot.sh

set -euo pipefail

PROJECT_REF="${EXTERNAL_PROJECT_REF:-}"
if [[ -z "$PROJECT_REF" ]]; then
  echo "ERRO: defina EXTERNAL_PROJECT_REF (ex: syyxnqzxqabeuqbuptkh)" >&2
  exit 1
fi

FUNCTIONS=(
  "telegram-reports-poll"
  "telegram-reports-link-code"
  "telegram-vencimentos-semana"
)

echo "▶ Deploy no projeto: $PROJECT_REF"
for fn in "${FUNCTIONS[@]}"; do
  echo ""
  echo "── Deployando: $fn"
  supabase functions deploy "$fn" \
    --project-ref "$PROJECT_REF" \
    --no-verify-jwt
done

echo ""
echo "✅ Deploy concluído. Funções publicadas:"
printf '   - %s\n' "${FUNCTIONS[@]}"
echo ""
echo "Lembrete: rode o SQL consolidado (supabase/sql/consolidated_reports_bot_setup.sql)"
echo "antes de testar — as funções dependem das tabelas telegram_reports_*."
