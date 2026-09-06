# Correções de pagamentos e acesso — publicação e validação

## Estado da entrega

Em 06/09/2026, a migração `supabase/migrations/20260906030000_billing_integrity.sql` foi aplicada ao projeto de produção `syyxnqzxqabeuqbuptkh` e validada pelo `scripts/billing/postflight.sql`. As seis Edge Functions também foram publicadas no mesmo projeto:

- `asaas-checkout` v17;
- `asaas-create-subscription` v25;
- `asaas-payment-status` v1;
- `asaas-webhook` v39;
- `asaas-reconcile` v1;
- `admin-subscription-manage` v36.

As quatro funções chamadas por usuários exigem JWT. O webhook exige `ASAAS_WEBHOOK_SECRET`; a conciliação exige `CRON_SECRET`, service role ou sessão de administrador. Chamadas anônimas retornaram 401 nas funções autenticadas e na conciliação, e 403 no webhook.

O ambiente remoto está configurado como `live`. A validação confirmou os sete objetos de billing, as nove funções SQL, as colunas de auditoria do webhook, 34 tabelas protegidas por 102 políticas restritivas e nenhum dos dois riscos residuais consultados. Nenhuma cobrança real foi criada durante a validação.

O frontend do commit `8d0751a` foi publicado primeiro como preview, validado no navegador e promovido para produção pela Vercel. O deployment de produção `AvHQcE5aRAT5po5rTDgLLqbqNgBg` ficou pronto em 34 segundos e atende `https://www.emprestaii.com.br`. A página redirecionou para `/auth`, exibiu login e acesso aos planos, sem overlay ou registro de erro no navegador.

O job `asaas-reconcile` (job ID 94) foi criado no `pg_cron`, está ativo e roda a cada cinco minutos. Seu segredo foi rotacionado, permanece criptografado no Vault e corresponde ao `CRON_SECRET` das Edge Functions. A primeira chamada controlada retornou HTTP 200, sem timeout e com `{"results":[]}`.

O webhook manteve a mesma URL pública; deve-se conferir no painel do Asaas que o token configurado corresponde ao `ASAAS_WEBHOOK_SECRET` do Supabase. As alterações anteriores do usuário nos componentes de empréstimos permanecem preservadas na pasta local.

## Comportamento definido

- Cobrança PIX avulsa continua sendo o fluxo da página de planos. Criar cobrança não concede acesso.
- Cada pedido mantém plano, ciclo, valor em centavos, ambiente, cliente e cobrança próprios.
- Repetir a solicitação reutiliza o pedido/cobrança. Timeout após envio ao gateway exige consulta de recuperação; não cria outra cobrança por suposição.
- Falha conhecida antes da cobrança, ou rejeição HTTP 400 do gateway, libera a tentativa local para nova solicitação. Resultado incerto permanece para conciliação/conferência.
- Somente o titular compra para a conta; membros vinculados recebem mensagem explicativa.
- Webhook consulta o estado atual da cobrança, valida seu vínculo e usa uma transação SQL para crédito e auditoria. Eventos repetidos do mesmo pagamento não acrescentam dias.
- Períodos comerciais permanecem 30/180/365 dias, como no código anterior. Não foi introduzida proporcionalidade de preço em upgrades: a compra entrega o produto contratado e soma o período contratado ao saldo automático existente.
- Estorno/remoção afeta apenas a contribuição daquela cobrança. Uma concessão manual não é apagada por webhook.
- Bloqueio administrativo é independente. Pagar ou renovar não o remove; desbloqueio é ação explícita.
- Concessão manual é prioritária até a remoção explícita, inclusive quando o admin determina zero dias. Pagamentos continuam registrados no histórico automático. Remover override recalcula o acesso pago, sem inventar uma situação anterior.
- Atualizar nota não cria nem reativa assinatura. Reativar uma assinatura vencida exige primeiro conceder dias com Renovar/Liberar plano.
- Cancelamento no painel significa encerrar acesso ao fim do período; não é um comando financeiro de cancelamento ou estorno no gateway. A interface informa essa separação.
- A função existente `asaas-create-subscription` compartilha autenticação/preço/pedido com PIX. Usa `planId`, `cycle`, `requestKey` e cria contrato recorrente vinculado ao histórico. Continua sem botão novo na página de planos; não foi criada uma experiência nova de cartão ou boleto.
- Permissões de plano são resolvidas por ID e combinadas com permissões pessoais existentes. A concessão pela aba Usuários não sobrescreve mais permissões pessoais. Restrições pessoais antigas que vieram de planos precisam ser identificadas antes de remover qualquer restrição manual.

## Antes de publicar

1. Rodar `scripts/billing/preflight.sql`, somente leitura, no banco externo; guardar as definições atuais das funções/policies/triggers.
2. Fazer backup do banco e das versões implantadas das funções. Conferir principalmente assinaturas sem vencimento, acesso futuro existente apenas no perfil, flags FREE_PASS/BANNED e assinaturas manuais antigas. Esses estados não possuem histórico suficiente para reconstrução automática segura.
3. Conferir manualmente os pedidos/cobranças pendentes e assinaturas recorrentes anteriores à entrega. Não inferir produto/ciclo pelo valor ou nome do cliente. Importar vínculos somente quando comprovados, ou conceder acesso manual auditado durante a transição.
4. Resolver duplicidades de `(user_id, environment)` ou incompatibilidade dos nomes de parâmetros das funções preexistentes antes da migration. Ela foi testada com o schema essencial das migrations do repositório; não substitui a validação de uma cópia real do banco.
5. Instalar primeiro em uma cópia isolada com dados anonimizados. A migration adiciona tabelas de histórico, proteção dos campos de perfil e políticas restritivas de escrita; qualquer estado sem comprovação de validade deixa de ser aceito como plano pago.

## Ambientes

Manter banco, chave e webhook de sandbox separados de produção.

- Edge Functions: `ASAAS_ENVIRONMENT=live` ou `sandbox`; `ASAAS_API_KEY`, `ASAAS_WEBHOOK_SECRET`; configuração EXTERNAL_SUPABASE já existente. `ASAAS_BASE_URL`, se definida, deve corresponder ao ambiente. `APP_ENVIRONMENT=production` é aceito como live por compatibilidade, mas prefira ASAAS_ENVIRONMENT explícita.
- Frontend: `VITE_ASAAS_ENVIRONMENT=live` ou `sandbox`.
- Banco: `billing_runtime_config.environment` define qual ambiente autoriza acesso naquele banco. O padrão da migration é live. Na cópia sandbox, configurar sandbox explicitamente antes dos testes.
- Não alternar o banco de produção para sandbox para realizar testes. Dados de sandbox nunca devem autorizar contas live.

## Sequência de publicação

1. Em janela controlada, impedir novas contratações enquanto a entrega conjunta é instalada; preservar/reter as notificações no Asaas conforme seu procedimento operacional.
2. Aplicar a migration após preflight/backup e validação em cópia isolada.
3. Publicar: `asaas-checkout`, `asaas-webhook`, `asaas-create-subscription`, `asaas-payment-status`, `asaas-reconcile`, `admin-subscription-manage`, incluindo seus módulos `_shared` e as entradas do `supabase/config.toml`.
4. Publicar o frontend com o ambiente correto. As variantes standalone do admin são geradas pelo script `scripts/billing/build-admin-standalone.mjs`; não manter correções manuais divergentes nelas.
5. Configurar invocação periódica de `asaas-reconcile` com `x-cron-secret`/`CRON_SECRET` usando o agendador da infraestrutura. A função processa lotes e mantém cursor das cobranças recorrentes. O agendamento remoto não foi criado nesta tarefa.
6. Conferir eventos com `status=review` e pedidos com `review_reason`; investigar os motivos. `unknown_order` identifica notificações sem vínculo confiável, incluindo pagamentos antigos. `creation_result_unknown` precisa de conferência no gateway antes de liberar nova tentativa.
7. Reativar o fluxo e verificar o recebimento real dos webhooks. HTTP 500 provoca nova tentativa; HTTP 200 com revisão significa evento persistido para conferência, não necessariamente acesso concedido.

## Testes locais

- `npm test -- src/lib/billing src/components/__tests__/SubscriptionGate.test.tsx`: regras de status/período, cancelamento com dias restantes, mapeamento de plano, preço/ambiente e componente de acesso.
- `node scripts/billing/test-edge.mjs`: executa handlers transpilados com dependências simuladas; valida secret, consulta autoritativa, erro da transação, preço no servidor, reutilização e timeout sem cobrança duplicada.
- `scripts/billing/test-database.mjs`: executa a migration e RPCs em PostgreSQL local via PGlite. O runtime é de desenvolvimento e não entra no bundle do app. Instalar `@electric-sql/pglite` em diretório temporário e passar o caminho absoluto de seu `dist/index.js` pela variável `PGLITE_MODULE`.
- Banco: A/B/A, auditoria, bloqueio manual preservado, estorno versus manual, remoção de override, zero dias, notas isoladas, proteção de campos/RPC, anual, valor incorreto, exclusão de pedido não pago, rollback por auditoria, recorrência, início futuro, filtros/paginação e isolamento de ambiente.
- Os testes de banco usam PostgreSQL/WASM em uma conexão; não comprovam contenção real entre múltiplas instâncias de Edge Functions. Homologar essa concorrência em staging.

Build local passou. A checagem TypeScript geral encontrou erros em arquivos de empréstimos/clientes não modificados por esta correção; a revisão dos arquivos de billing não apontou erros. O lint direcionado aos hooks/telas de cobrança revisados passou. Não foi repetida a suíte geral que anteriormente encerrou por memória; os testes relevantes foram executados separadamente.

## Homologação externa ainda necessária

Pagar PIX real em sandbox e conferir cobrança → evento → pedido → dias → permissões; assinatura recorrente gerando o segundo ciclo; repetir webhook e testar duas entregas simultâneas; parar uma função durante transação; retirar acesso manual; confirmar que o bloqueio admin persiste após pagamento; estornar cobrança antiga; testar com titular e membro; verificar desktop/mobile autenticados no banco de staging.

Estorno parcial fica em revisão e preserva os direitos atuais: a regra de reduzir proporcionalmente dias/valor não foi inventada. Cobranças antigas sem pedido/contrato comprovado também ficam em revisão; o acesso pago legado é preservado no snapshot quando existe uma assinatura identificável. Perfis liberados sem assinatura e liberações sem prazo precisam de tratamento explícito no preflight.

## Rollback

Não apagar tabelas de pedidos, contratos, eventos ou auditoria. Após a primeira cobrança no fluxo novo, voltar só o webhook antigo pode creditar pagamentos incorretamente.

Em incidente, suspender novas contratações, preservar as notificações e o histórico, identificar se ocorreu movimento financeiro real e usar concessão administrativa auditada quando necessário. Antes de restaurar as funções/policies guardadas no preflight, reconciliar os pagamentos recebidos durante a janela. Fazer restauração a partir do backup somente com plano que preserve os dados posteriores. Não há script de rollback destrutivo automático.
