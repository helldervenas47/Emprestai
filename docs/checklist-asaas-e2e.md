# Checklist de Testes Ponta a Ponta — Integração Asaas (EmprestAI)

> **Objetivo:** validar checkout, webhook, liberação de acesso após confirmação de pagamento e bloqueio automático em caso de inadimplência.

---

## 1. Ambiente & Pré-requisitos

Antes de iniciar, confirme que:

- [ ] O SQL `supabase/sql/asaas_access_unification.sql` foi executado no Supabase do projeto.
- [ ] As Edge Functions `asaas-checkout` e `asaas-webhook` foram deployadas (`supabase functions deploy asaas-checkout` e `supabase functions deploy asaas-webhook`).
- [ ] O secret `ASAAS_API_KEY` está configurado no Supabase (sandbox para testes).
- [ ] O secret `ASAAS_WEBHOOK_SECRET` está configurado e copiado no dashboard do Asaas (Sandbox).
- [ ] A URL do webhook está cadastrada no Asaas: `<SUPABASE_URL>/functions/v1/asaas-webhook`.
- [ ] O `ASAAS_BASE_URL` aponta para sandbox (`https://sandbox.asaas.com/api/v3`).
- [ ] A tabela `plans` possui pelo menos um plano ativo com preços preenchidos (`price`, `price_semestral`, `price_anual`).
- [ ] O usuário de teste possui `email`, `display_name` e um `cpf_cnpj` válido no `profiles`.
- [ ] A aplicação frontend está acessível (preview local ou Vercel) e consegue logar com o usuário de teste.

---

## 2. Checkout (Geração da Cobrança PIX)

### 2.1 Fluxo normal via UI
- [ ] Acesse `/planos` logado com um usuário não-admin.
- [ ] Selecione um plano e um ciclo (Mensal / Semestral / Anual).
- [ ] Clique em **Assinar / Pagar**.
- [ ] Verifique se o modal/página de PIX foi exibido com QR Code e código copia-e-cola.
- [ ] Confirme que o valor exibido corresponde ao preço do plano/ciclo cadastrado no banco.
- [ ] Confirme no painel do Asaas (Sandbox) que a cobrança foi criada para o cliente correto.
- [ ] Verifique no banco que `profiles.asaas_customer_id` foi preenchido para o usuário.
- [ ] Verifique que `profiles.current_plan_id` e `profiles.current_plan_cycle` foram atualizados.

### 2.2 Segurança do preço (resolução server-side)
- [ ] Tente chamar a Edge Function diretamente enviando `value` ou `description` no body — o servidor deve ignorar e resolver por `planId` + `cycle`.
- [ ] Confirme que a Edge Function rejeita requisições sem `Authorization: Bearer <jwt>` com `401`.
- [ ] Confirme que a Edge Function rejeita `planId` inexistente/inativo com `404`.

### 2.3 Criação de cliente Asaas
- [ ] Crie um novo usuário que ainda não tenha `asaas_customer_id` e execute o checkout.
- [ ] Confirme que o cliente foi criado no Asaas e que o `externalReference` corresponde ao `user_id` do Supabase.
- [ ] Refaça o checkout com o mesmo usuário e confirme que reutiliza o mesmo `asaas_customer_id` (não duplica no Asaas).

### 2.4 Cenários de erro
- [ ] Chame `asaas-checkout` sem `ASAAS_API_KEY` configurado → deve retornar `server_misconfigured` (`500`).
- [ ] Chame com um JWT inválido → `401 unauthorized`.
- [ ] Chame com um `planId` vazio → `400 missing_plan`.
- [ ] Chame com um plano cujo preço calculado seja `0` ou negativo → `400 invalid_plan_price`.

---

## 3. Webhook (Confirmação de Pagamento)

### 3.1 Evento `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED`
- [ ] No painel do Asaas Sandbox, localize a cobrança gerada no checkout.
- [ ] Simule o pagamento (Asaas Sandbox permite marcar como pago).
- [ ] Verifique na tabela `asaas_webhook_events` que o evento foi registrado com `status = 'processed'`.
- [ ] Confirme que `profiles.financial_status` passou para `ACTIVE`.
- [ ] Confirme que `profiles.current_period_end` foi atualizado para uma data futura:
  - Mensal: +30 dias
  - Semestral: +180 dias
  - Anual: +365 dias
- [ ] Confirme que `profiles.last_payment_id` contém o `payment.id` do Asaas.
- [ ] Confirme que `profiles.last_payment_at` foi preenchido.
- [ ] Confirme que `profiles.is_blocked` foi definido como `false`.

### 3.2 Renovação a partir do fim do período vigente
- [ ] Pague uma cobrança quando `current_period_end` ainda está no futuro (ex: pagamento antecipado).
- [ ] Confirme que o novo `current_period_end` foi somado **a partir do fim do período atual**, não a partir de `now()`.
- [ ] Pague novamente o mesmo `payment_id` e confirme que o período **não é somado duas vezes** (idempotência por `last_payment_id`).

### 3.3 Idempotência por evento
- [ ] Reenvie manualmente o mesmo payload do webhook com o mesmo `eventId`.
- [ ] Confirme que a tabela `asaas_webhook_events` rejeita a duplicata (único em `event_id`).
- [ ] Confirme que o retorno foi `200` com `duplicated: true` e que o perfil não foi alterado.

### 3.4 Autenticação do webhook
- [ ] Envie um POST para `asaas-webhook` sem o header `asaas-access-token` → deve retornar `403`.
- [ ] Envie com um token incorreto → `403`.
- [ ] Envie com o token correto → `200`.

### 3.5 Eventos de inadimplência
- [ ] Simule o evento `PAYMENT_OVERDUE` no Asaas (ou envie manualmente para a Edge Function).
- [ ] Confirme que `profiles.financial_status` passou para `PAST_DUE`.
- [ ] Confirme que o acesso do usuário foi bloqueado (veja seção 4).
- [ ] Envie `PAYMENT_DELETED`, `PAYMENT_REFUNDED` ou `PAYMENT_REVERSED` e confirme que o status muda para `CANCELED`.

### 3.6 Tratamento de eventos ignorados
- [ ] Envie um evento não mapeado (ex: `PAYMENT_CREATED`) e confirme que foi registrado como `status = 'ignored'`.
- [ ] Envie um evento sem `payment.customer` e confirme `ignored: missing_customer`.
- [ ] Envie um evento para um `customerId` não vinculado a nenhum `profiles.asaas_customer_id` e confirme `ignored: unknown_customer`.

### 3.7 Recuperação de falha
- [ ] Force um erro no banco durante o processamento (ex: remova temporariamente uma coluna ou desconecte a função do banco — **somente em ambiente de teste**).
- [ ] Envie um evento e confirme que a Edge Function retorna `500` para que o Asaas reenvie.
- [ ] Confirme que o evento foi registrado como `status = 'error'`.
- [ ] Restaure o ambiente, reenvie o evento e confirme que agora é processado com sucesso.

---

## 4. Bloqueio e Liberação de Acesso

### 4.1 Liberação após pagamento
- [ ] Após o evento `PAYMENT_CONFIRMED`, acesse o app com o usuário pagante.
- [ ] Confirme que o `useAccessLock` retorna `locked: false`.
- [ ] Confirme que o `AccessLockRouteGuard` não redireciona para `/?tab=system`.
- [ ] Confirme que a tela `AccessLockScreen` não é exibida.
- [ ] Navegue entre rotas protegidas (`/emprestimos`, `/financeiro`, `/clientes`, etc.) e confirme que permanecem acessíveis.

### 4.2 Bloqueio por inadimplência
- [ ] Simule `PAYMENT_OVERDUE` para um usuário ativo.
- [ ] Confirme que `my_access_state()` retorna `locked: true` e `reason: 'past_due'`.
- [ ] Confirme que `useAccessLock` reflete o bloqueio sem precisar de F5 (Realtime ou `window.focus`).
- [ ] Confirme que o `AccessLockRouteGuard` redireciona rotas protegidas para `/?tab=system`.
- [ ] Confirme que a tela `AccessLockScreen` aparece com a mensagem correta e botão **Regularizar assinatura**.
- [ ] Confirme que a aba **Sistema** continua acessível na Home (`/?tab=system`).
- [ ] Confirme que `/planos` continua acessível (rota pública) para permitir renovação.

### 4.3 Bloqueio manual pelo administrador
- [ ] No painel de admin, marque `profiles.is_blocked = true` e preencha `blocked_reason` para um usuário.
- [ ] Confirme que `my_access_state()` retorna `locked: true` e `reason: 'admin_blocked'`.
- [ ] Confirme que o motivo aparece na tela `AccessLockScreen`.
- [ ] Desbloqueie o usuário (`is_blocked = false`) e confirme que o acesso volta instantaneamente.

### 4.4 Bloqueio por expiração do período
- [ ] Crie um usuário com `current_period_end` no passado e `financial_status = 'ACTIVE'`.
- [ ] Confirme que `is_access_blocked()` retorna `true` (falha segura quando o webhook de atraso não chegou).
- [ ] Confirme que `useRouteGuard` retorna `payment_required`.
- [ ] Confirme que o app redireciona para o fluxo de pagamento.

### 4.5 Regra de não-bloqueio para admin
- [ ] Deixe um usuário com `role = 'admin'` inadimplente (`PAST_DUE`) ou com plano expirado.
- [ ] Confirme que `useAccessLock` retorna `locked: false`.
- [ ] Confirme que `useRouteGuard` retorna `ready`.
- [ ] Confirme que o admin consegue acessar todas as rotas e gerenciar a assinatura.

### 4.6 Regra de free pass / manual override
- [ ] Defina `profiles.manual_override = 'FREE_PASS'` para um usuário inadimplente.
- [ ] Confirme que `useRouteGuard` retorna `ready` e o acesso é liberado.
- [ ] Defina `profiles.manual_override = 'BANNED'` e confirme que `useRouteGuard` retorna `rejected`.

### 4.7 RLS (Row-Level Security)
- [ ] Confirme que a função `is_access_blocked()` é usada em todas as políticas RLS sensíveis (tabelas de dados financeiros, empréstimos, clientes, etc.).
- [ ] Tente consultar dados protegidos via PostgREST com um usuário bloqueado → deve retornar zero linhas / erro de permissão.
- [ ] Tente consultar o mesmo dado com o usuário desbloqueado → deve retornar normalmente.

---

## 5. Cenários de Teste Negativos / Segurança

- [ ] Tente chamar `asaas-checkout` com um plano de outro usuário (planId é público, mas cobrança é gerada para o usuário autenticado) — confirme que não há vazamento de dados.
- [ ] Tente chamar `asaas-webhook` com um payload malformado — confirme que é registrado como `ignored` ou retorna `200` sem crashar.
- [ ] Tente enviar um evento duplicado muito rapidamente (race condition) — confirme que o `UNIQUE` em `asaas_webhook_events.event_id` protege contra double-spend.
- [ ] Tente alterar `current_period_end` manualmente no banco e confirme que `is_access_blocked` respeita a nova data.
- [ ] Confirme que o usuário anônimo (`anon`) não consegue acessar `asaas_webhook_events` (sem policies).
- [ ] Confirme que o usuário autenticado não consegue ler `asaas_webhook_events` (sem policies).

---

## 6. Validação Final de Integração

- [ ] Um usuário novo consegue se cadastrar, escolher plano, pagar o PIX e acessar o app em até 2 minutos.
- [ ] Um usuário inadimplente é bloqueado automaticamente e consegue renovar a assinatura sem intervenção manual.
- [ ] Um admin consegue bloquear/desbloquear manualmente e o efeito é imediato no app.
- [ ] O processo de pagamento e bloqueio não gera erros nos logs das Edge Functions nem no console do navegador.
- [ ] A tabela `asaas_webhook_events` possui apenas eventos com `status` consistente (`processed`, `ignored`, `error`) e sem duplicatas.
- [ ] O `financial_status` do perfil está sempre consistente com o estado atual no Asaas.

---

## 7. Comandos e Ferramentas Úteis

### Deploy das Edge Functions
```bash
supabase functions deploy asaas-checkout
supabase functions deploy asaas-webhook
```

### Invocar webhook manualmente (teste de autenticação)
```bash
curl -X POST "<SUPABASE_URL>/functions/v1/asaas-webhook" \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: <ASAAS_WEBHOOK_SECRET>" \
  -d '{
    "id": "evt_test_001",
    "event": "PAYMENT_CONFIRMED",
    "payment": {
      "id": "pay_test_001",
      "customer": "cus_test_001",
      "value": 49.90,
      "status": "CONFIRMED"
    }
  }'
```

### Consultar estado de acesso no banco
```sql
SELECT user_id, financial_status, current_period_end, is_blocked, last_payment_id
FROM public.profiles
WHERE user_id = '<USER_ID>';
```

### Verificar eventos recebidos
```sql
SELECT event_id, event_type, payment_id, customer_id, status, created_at
FROM public.asaas_webhook_events
ORDER BY created_at DESC
LIMIT 20;
```

### Invocar a RPC de acesso diretamente
```sql
-- Execute como o usuário autenticado (impersonate no Supabase SQL Editor)
SELECT public.my_access_state();
```

---

## Dicas para Testes no Asaas Sandbox

1. **Cobrança PIX:** no Sandbox, após criar a cobrança, você pode simular o pagamento pelo próprio dashboard do Asaas sem precisar de app bancário real.
2. **Webhook:** o Asaas Sandbox pode demorar alguns segundos para enviar o evento. Para testes controlados, use o `curl` manual com o payload real do Asaas.
3. **Duplicatas:** guarde os `eventId` reais para testar idempotência.
4. **Limpeza:** ao final dos testes, delete os eventos de teste de `asaas_webhook_events` e resete os campos `asaas_customer_id`, `financial_status` e `current_period_end` do perfil de teste.

---

*Última atualização: 2026-07-29*

---

## Execução automatizada (API/webhook)

Boa parte deste checklist roda via script:

```bash
SUPABASE_URL="https://<ref>.supabase.co" \
SUPABASE_ANON_KEY="<anon>" \
SUPABASE_SERVICE_ROLE_KEY="<service_role>" \
ASAAS_WEBHOOK_SECRET="<secret>" \
TEST_USER_EMAIL="teste@exemplo.com" \
TEST_USER_PASSWORD="<senha>" \
node scripts/test-asaas-e2e.mjs
```

Opcionais: `TEST_PLAN_ID`, `TEST_CYCLE` (`monthly` | `semestral` | `annual`),
`RESTORE_AFTER=1` (restaura o profile ao estado anterior no fim).

O script cobre: checkout autenticado, rejeição sem JWT / plano inválido, preço
ignorado do cliente, webhook com token inválido, evento não mapeado, cliente
desconhecido, liberação por `PAYMENT_CONFIRMED`, idempotência por `event_id` e
por `payment_id`, auditoria em `asaas_webhook_events`, `my_access_state()` e
`PAYMENT_OVERDUE`.

Continuam **manuais**: pagar o PIX real no Asaas Sandbox, conferir o QR Code na
tela e validar visualmente o bloqueio/redirecionamento da UI.
