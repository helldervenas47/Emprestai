# Versões prontas para deploy manual no Supabase Dashboard

O Dashboard do Supabase **não** resolve imports relativos (`../_shared/...`).
Os arquivos desta pasta são versões "flat" das 5 Edge Functions de Cofrinhos,
com todo o código de `_shared/` já embutido.

## Como usar

1. Abra o Supabase Dashboard → **Edge Functions**.
2. Selecione (ou crie) a função com o nome correspondente:

| Arquivo aqui | Nome da função no Dashboard |
|---|---|
| `calcular-rendimento-cofrinhos.ts` | `calcular-rendimento-cofrinhos` |
| `processar-deposito-cofrinho.ts` | `processar-deposito-cofrinho` |
| `processar-resgate-cofrinho.ts` | `processar-resgate-cofrinho` |
| `recalcular-cofrinho.ts` | `recalcular-cofrinho` |
| `recalcular-historico-cofrinhos.ts` | `recalcular-historico-cofrinhos` |

3. Apague todo o conteúdo do `index.ts` da função no Dashboard.
4. Copie o conteúdo **inteiro** do arquivo correspondente desta pasta e cole.
5. Clique em **Deploy**.

## Secrets necessários

Antes de invocar, confirme em **Settings → Edge Functions → Secrets**:

- `EXTERNAL_SUPABASE_URL`
- `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`

(Se as functions rodam no próprio projeto externo, `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` já bastam.)

## Passo final — recálculo histórico

Depois do deploy das 5, invoque uma vez:

```bash
curl -X POST "https://<SEU-REF>.supabase.co/functions/v1/recalcular-historico-cofrinhos" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Depois confira os saldos na aba **Cofrinhos** do app.

## Regeneração

Estes arquivos são gerados automaticamente. Após alterar qualquer função de
cofrinho ou `_shared/piggy-yield-core.ts`, rode:

```bash
node scripts/bundle-piggy-functions.mjs
```

Não edite os `.ts` desta pasta à mão.
