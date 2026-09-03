---
trigger: model_decision
---

# Supabase e Banco de Dados — Emprestaii

O Emprestaii utiliza Supabase como backend.

## Regra principal

Antes de alterar código que acessa o banco:

1. Identifique a tabela envolvida.
2. Identifique as colunas utilizadas.
3. Identifique relacionamentos.
4. Identifique RLS.
5. Identifique RPCs relacionadas.
6. Identifique Edge Functions relacionadas.
7. Verifique migrations existentes.
8. Procure outros pontos do código que utilizam a mesma estrutura.

Nunca suponha a estrutura do banco.

## Queries

Evite consultas desnecessárias.

Não crie múltiplas chamadas ao banco para obter informações que podem ser obtidas de forma segura e eficiente em uma única consulta.

Preserve mecanismos existentes de:

* cache;
* paginação;
* filtros;
* agregações;
* RPCs;
* carregamento incremental.

## RLS

Nunca desative RLS para solucionar um problema de acesso.

Antes de alterar políticas:

1. identifique o usuário;
2. identifique o papel/permissão;
3. identifique a política atual;
4. explique o problema;
5. proponha a alteração.

## Migrations

Migrations devem ser:

* incrementais;
* reversíveis quando possível;
* documentadas;
* compatíveis com dados existentes.

Nunca remova dados de produção como parte de uma correção sem autorização explícita.

## RPCs

Antes de alterar uma RPC utilizada pelo sistema:

* procure todos os consumidores;
* verifique parâmetros;
* verifique retorno;
* verifique permissões;
* verifique impacto nos módulos existentes.

## Edge Functions

Antes de modificar uma Edge Function:

* identifique quem a chama;
* identifique payload esperado;
* identifique autenticação;
* identifique tratamento de erros;
* identifique idempotência;
* identifique impacto em webhooks.

Webhooks de pagamento devem ser tratados como operações potencialmente repetíveis.

## Integridade

Não altere dados diretamente para corrigir uma inconsistência sem primeiro identificar a causa.

Sempre prefira corrigir:

origem → regra → persistência → consulta → interface

em vez de mascarar o problema na interface.
