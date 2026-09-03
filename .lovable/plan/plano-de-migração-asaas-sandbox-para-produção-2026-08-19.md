# Plano de Migração: Asaas Sandbox para Produção

Este plano descreve as etapas necessárias para alterar o gateway de pagamento Asaas do ambiente de teste (Sandbox) para produção.

## Passos para o Usuário

1. **Obter chaves de Produção**:
   - Acesse sua conta Asaas em produção.
   - Vá em **Configurações da Conta** > **Integrações** > **Gerar Chave de API**.
   - Obtenha também o **Token de Webhook** (se configurado).

2. **Configurar Segredos**:
   - As chaves de produção devem ser inseridas através da ferramenta de segredos (Secrets) do projeto para garantir segurança.

## Alterações Técnicas

### 1. Atualizar Variáveis de Ambiente (Segredos)
Usar a ferramenta `add_secret` para atualizar as seguintes chaves:
- `ASAAS_API_KEY`: Inserir a chave de produção (começa com `$aact_` no sandbox, em produção tem formato diferente).
- `ASAAS_WEBHOOK_SECRET`: (Se aplicável) Atualizar para o token de produção configurado no painel do Asaas.

### 2. Modificar Edge Functions
- **`supabase/functions/asaas-checkout/index.ts`**:
  - Alterar `ASAAS_BASE_URL` para `https://api.asaas.com/v3`.
- **`supabase/functions/asaas-create-subscription/index.ts`**:
  - Confirmar que já utiliza `https://api.asaas.com/v3` (já parece configurado, mas validaremos).
  - Validar a lógica de `environment` ("sandbox" vs "live") baseada no prefixo da chave.

### 3. Validação
- Realizar um deploy das Edge Functions atualizadas.
- Testar a geração de um checkout PIX (em produção o valor será real).
- Verificar se o webhook de produção está apontando corretamente para a URL da função.

## Detalhes Adicionais
O código atual nas Edge Functions possui detecção automática de ambiente baseada no prefixo da `ASAAS_API_KEY`. Se a chave inserida não começar com `$aact_`, o sistema entenderá como ambiente de Produção ("live").
