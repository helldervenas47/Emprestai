#!/usr/bin/env bash
# Deploy da edge function "voice-expense-extract" no Supabase externo.
#
# Pré-requisitos (uma vez):
#   npm i -g supabase
#   supabase login
#
# Variáveis necessárias (export ou em .env.deploy):
#   EXTERNAL_PROJECT_REF   ref do projeto externo (ex.: abcd1234...)
#   GEMINI_API_KEY         chave do Gemini (opcional - só se quiser (re)setar)

set -euo pipefail

FUNCTION_NAME="voice-expense-extract"

# Carrega .env.deploy se existir
if [ -f ".env.deploy" ]; then
  set -a; source .env.deploy; set +a
fi

: "${EXTERNAL_PROJECT_REF:?defina EXTERNAL_PROJECT_REF (ref do projeto Supabase externo)}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI não encontrada. Instale com: npm i -g supabase" >&2
  exit 1
fi

echo "→ Linkando projeto $EXTERNAL_PROJECT_REF..."
supabase link --project-ref "$EXTERNAL_PROJECT_REF" >/dev/null

if [ -n "${GEMINI_API_KEY:-}" ]; then
  echo "→ Atualizando secret GEMINI_API_KEY..."
  supabase secrets set GEMINI_API_KEY="$GEMINI_API_KEY" --project-ref "$EXTERNAL_PROJECT_REF" >/dev/null
fi

echo "→ Fazendo deploy de $FUNCTION_NAME (verify_jwt=false)..."
supabase functions deploy "$FUNCTION_NAME" \
  --project-ref "$EXTERNAL_PROJECT_REF" \
  --no-verify-jwt

echo "✓ Deploy concluído."
echo "Endpoint: https://${EXTERNAL_PROJECT_REF}.supabase.co/functions/v1/${FUNCTION_NAME}"
