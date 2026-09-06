# Análise da integração Asaas e das liberações administrativas

Data: 05/09/2026, horário da Bahia. Escopo: código local da contratação, notificações de pagamento, assinaturas, permissões, aprovação, painel administrativo e SQL associado. Nenhuma cobrança ou alteração em contas reais foi executada.

## Conclusão

A estrutura permite gerar PIX e liberar acesso, mas ainda não garante que o pagamento resulte no plano, prazo e permissões corretos. O principal problema é usar a assinatura atual e o perfil como substitutos de um histórico de pedidos e pagamentos. As liberações administrativas escrevem nesses mesmos registros e podem ser sobrescritas pelo gateway.

Há falhas comprovadas no código e em simulações locais. O alcance em produção depende das funções e regras SQL efetivamente publicadas. Não foram consultados secrets, logs, registros de clientes nem configurações da conta Asaas. Este relatório não atesta a homologação da conta, a saúde da fila de webhooks ou o schema real do banco.

## Fluxos existentes

| Fluxo | Implementação atual | Limitação principal |
|---|---|---|
| Contratar pela página de planos | `Pricing` → `useAsaasCheckout` → `asaas-checkout` → `POST /payments`, PIX | Cobrança avulsa; não cria recorrência |
| Liberar após pagamento | `asaas-webhook` → `subscriptions` → `profiles` | Escritas separadas; plano inferido do estado atual |
| Criar recorrência | `asaas-create-subscription` → `POST /subscriptions` | Função existente, sem chamada encontrada no frontend atual |
| Liberar pelo admin | `admin-subscription-manage` altera assinatura e espelha perfil | Não movimenta dinheiro nem sincroniza cancelamento com o Asaas |
| Autorizar funcionalidades | `useSubscription`, `usePlanEntitlements`, `SubscriptionGate` | Critérios diferentes dos usados pelo banco |
| Bloquear gravações | Funções SQL e políticas restritivas de acesso/trial | Várias versões manuais e exceções que liberam acesso |
| Aprovar cadastro | `user_approvals` e `useUserApproval` | Aprovação é independente de pagamento e plano |

Não localizei operações de transferência/saque pelo Asaas nas funções analisadas. A integração identificada cobra pelo uso do SaaS; não executa desembolso dos empréstimos cadastrados para clientes.

## Achados prioritários

### 1. Potencial alteração dos próprios direitos pelo usuário — crítico, condicionado ao banco publicado

A política em `supabase/migrations/20260410232728_1c150819-1179-44c5-962d-8505f9b8b009.sql:44` permite atualizar o próprio perfil, restringindo a linha por `user_id`. Os SQLs de acesso adicionam ao perfil campos como `financial_status` e `current_period_end`. Não localizei restrição por coluna ou trigger que impeça o usuário de alterar esses campos financeiros e administrativos.

Se essa política estiver publicada com permissão ampla de UPDATE, o usuário poderá manipular os campos que controlam o acesso por uma chamada direta à API. Restringir a interface não resolve isso. É necessário consultar grants, policies e triggers reais e testar com usuário comum em ambiente isolado. Não executei exploração contra produção.

Correção: separar os campos privados de cobrança/acesso do perfil editável, ou restringir explicitamente as colunas atualizáveis. Somente operações confiáveis devem alterar direitos.

### 2. Cobrança pendente é considerada assinatura ativa na interface — alta, reproduzido

`src/hooks/useSubscription.ts:161` aceita status não terminal sem data de expiração. Uma linha `pending`, com produto pago e `current_period_end = null`, resulta em `isActive = true`. É precisamente o registro criado pelo checkout para quem não tem assinatura vigente.

Consequência: gerar um PIX, sem pagar, pode liberar os componentes que usam `isActive`/`isPaid`. O bloqueio de escrita no banco pode continuar impedindo ações; portanto não é correto afirmar que todo o sistema fica liberado. O defeito produz tanto acesso visual indevido quanto telas liberadas com operações recusadas.

Correção: lista explícita de estados que concedem direitos, com período válido e origem identificada. Cobrança pendente não deve substituir uma concessão de acesso.

### 3. Upgrade e mudança de ciclo podem entregar o plano anterior — alta

Em `supabase/functions/asaas-checkout/index.ts:325`, quando já existe assinatura ativa, a nova compra não é persistida com seu plano/ciclo. A cobrança usa `externalReference: user.id`, sem identificar um pedido específico. O webhook mantém `existingSub.product_id` e `existingSub.price_id`.

Exemplo: cliente Básico mensal paga Empresarial anual. A cobrança tem o valor anual correto, mas o webhook pode renovar Básico mensal por 30 dias. Para usuário sem assinatura ativa, gerar duas cobranças de planos distintos também permite que o último checkout sobrescreva o contexto do primeiro pagamento.

Há um defeito adicional em `supabase/functions/asaas-webhook/index.ts:233`: a consulta seleciona somente usuário, vencimento e último pagamento; depois o código acessa `current_plan_cycle` e `current_plan_id`, que não foram selecionados. O ciclo cai no fallback da assinatura. Isso não significa que todo anual recebe 30 dias: uma primeira contratação cujo `price_id` anual foi salvo corretamente pode receber 365 dias. O problema aparece quando a assinatura existente não representa a compra paga.

Correção: pedido persistente com usuário/dono da conta, plano por ID, ciclo, preço contratado, moeda, ambiente e ID da cobrança. O webhook deve conceder o que consta nesse pedido.

### 4. Pagamento remove bloqueio manual e pode sobrescrever concessão — alta, reproduzido

`supabase/functions/asaas-webhook/index.ts:320` define `is_blocked = false` ao confirmar pagamento. Não distingue bloqueio por atraso de bloqueio aplicado pelo administrador. Também não consulta `subscriptions.manual_override` antes de atualizar a assinatura.

Consequências: uma conta suspensa administrativamente pode voltar a funcionar após pagar; uma cortesia pode ter datas/status alterados por evento financeiro. O registro ainda pode exibir a marca de alteração manual, embora o webhook tenha sobrescrito seus valores.

Correção: bloqueio administrativo separado da inadimplência; concessões manuais com vigência, motivo e precedência definidos. Pagamento deve atualizar direitos financeiros sem apagar bloqueio administrativo.

### 5. Excluir ou estornar uma cobrança afeta a conta inteira — alta, reproduzido

Em `supabase/functions/asaas-webhook/index.ts:324`, eventos de exclusão, estorno e chargeback definem o vencimento como agora. A busca identifica o cliente, mas não verifica se a cobrança afetada originou o período vigente.

Exemplo: usuário tem acesso pago até janeiro; o operador exclui um PIX antigo e não pago do mesmo cliente; o webhook encerra o período vigente. Um pagamento sem relação com o plano, recebido para esse mesmo cliente Asaas, também pode conceder acesso porque não há vínculo obrigatório a um pedido nem validação do valor contratado.

Correção: processar alterações por cobrança e recalcular somente os direitos atribuídos a ela. Preservar outros pagamentos e concessões independentes.

### 6. Proteção contra duplicidade incompleta e sem transação — alta, reproduzido parcialmente

O webhook compara somente `profiles.last_payment_id` (`index.ts:275`). Sequência reproduzida: confirmação A, confirmação B, recebimento A. O último pagamento passa a ser B, então A é creditado novamente. Dois pagamentos mensais adicionaram 90 dias ao período inicial.

O UNIQUE em `event_id` não impede esse caso: confirmação e recebimento são eventos distintos. Eventos encontrados como `received`/`error` são reprocessados sem aquisição de trava, permitindo trabalho concorrente. Atualizações de assinatura e perfil são separadas; falhas parciais e pagamentos simultâneos podem deixar divergências ou perder acréscimos. Esses últimos cenários foram identificados por inspeção, não por teste concorrente contra PostgreSQL.

Correção: histórico de pagamentos creditados com unicidade por ambiente/pagamento e operação transacional que registre evento, crédito e estado de acesso com bloqueio da conta quando necessário.

### 7. Auditoria do webhook escreve coluna inexistente no SQL fornecido — alta, reproduzido com schema simulado

`supabase/sql/asaas_access_unification.sql:20` cria `error_message`. A função `finish`, em `supabase/functions/asaas-webhook/index.ts:208`, envia `error`. O retorno da atualização é ignorado.

Com o schema fornecido, o evento permanece em `received`, inclusive após sucesso; o HTTP continua 200. O painel de auditoria perde confiabilidade e a deduplicação por evento processado deixa de funcionar como planejado. Uma coluna adicionada diretamente em produção pode mudar esse resultado; é necessário conferir o schema real.

Correção: alinhar contrato de colunas e tratar erro de persistência. A auditoria deve fazer parte do processamento confiável, sem registrar sucesso que não foi gravado.

### 8. Plano contratado não resolve corretamente as permissões — alta

`src/features/admin/hooks/usePlanEntitlements.ts:96` compara o nome do plano, como `Profissional`, com o identificador `profissional_plan`. A comparação falha para os nomes convencionais usados pelos mapeamentos do próprio app. O hook tenta o plano de teste e depois o primeiro plano ativo.

Consequência: o plano mostrado e o nível usado por `SubscriptionGate` podem discordar dos limites, permissões e abas resolvidos pelo hook.

Além disso, a alteração pela aba Usuários sincroniza `user_tab_permissions` no frontend (`UserManagement.tsx:594`). A ação equivalente na aba Assinaturas e o webhook Asaas não fazem essa sincronização. A atualização depende do caminho usado pelo operador; erros dessa escrita também não são conferidos.

Correção: relacionamento estável por ID e uma única operação de atualização dos direitos, preservando deliberadamente permissões personalizadas quando existirem.

### 9. Admin pode receber sucesso com aplicação parcial — alta

`admin-subscription-manage/index.ts:199` espelha a assinatura no perfil. Se ambas as tentativas de atualização falharem, apenas registra erro e continua. `writeAudit` (`:297`) também não confere o resultado. Suspensão, reativação e ajustes de trial possuem outras escritas sem verificação de erro.

Consequência: o operador vê “Alteração aplicada”, mas o perfil pode continuar bloqueado, a suspensão pode não bloquear ou a auditoria não registrar a operação.

Correção: mutação transacional e auditada, ou estratégia explícita de recuperação de falha parcial. Retorno de sucesso deve significar que o estado efetivo foi atualizado.

### 10. Regras SQL e interface discordam sobre cancelamento, override e vencimento — alta

Existem redefinições de `is_access_blocked` e `has_active_subscription` em arquivos SQL manuais. Sua ordem de aplicação muda o comportamento. `access_block_respects_subscription.sql:22` e `asaas_subscriptions_sync.sql:35` aceitam `manual_override = true` como alternativa a status ativo. Não excluem explicitamente todos os estados terminais quando há override.

Como o admin marca override em várias ações, uma assinatura cancelada com data futura pode continuar liberada pelo banco enquanto `useSubscription` a considera inativa. O cancelamento informa `cancel_at_period_end = true`, mas a interface invalida `canceled` imediatamente.

`trial_expired_block_writes.sql:41` referencia `plan_slug`, `plan_id`, `trial_expires_at` e `plans.slug`, ausentes no schema de assinatura identificado nas migrations analisadas. Erros são capturados com retorno `false`, ou seja, trial não expirado. A função também não lê `trial_days_override`. Outras regras podem compensar parcialmente o defeito, mas não eliminam a inconsistência.

O frontend reconhece `profiles.manual_override` textual (`FREE_PASS`/`BANNED`), enquanto o admin usa um booleano em `subscriptions`. As funções SQL de acesso analisadas não implementam a mesma precedência do campo textual. Não há um contrato único para essas modalidades.

Correção: migration consolidada e versionada com a regra definitiva, schema compatível e testes de concordância entre API, banco e interface. Não reaplicar os arquivos indiscriminadamente.

## Efeito de cada ação administrativa

| Ação | Efeito atual | Gargalo ou cuidado funcional |
|---|---|---|
| Liberar plano | Define ativo, produto, datas e override; espelha perfil | Não cobra nem dá baixa no Asaas; não protege contra webhook posterior |
| Alterar plano na aba Usuários | Concede 30 dias contados de agora | Pode reduzir um período maior já pago; sincroniza abas por caminho separado |
| Definir datas | Altera datas e conserva status existente | Uma assinatura cancelada pode continuar cancelada; data inicial futura não impede liberação imediata pelas regras atuais |
| Iniciar teste | Altera campos de trial e cria/atualiza assinatura `trialing` | Usa produto anterior ou Básico na assinatura, apesar do plano de teste escolhido |
| Prorrogar teste | Soma dias ao vencimento e ao override de trial | Duas bases de cálculo; conserva estados como cancelado, que impedem recursos na interface |
| Gerenciar dias | Redefine validade como agora + dias; reativa se positivo | Substitui saldo de dias existente, não apenas acrescenta; zero produz inconsistência no hook de trial |
| Renovar | Soma dias ao maior entre agora e vencimento | Não registra recebimento; pode ser uma cortesia, não receita |
| Suspender | Marca suspenso e tenta bloquear perfil | Não suspende recorrência Asaas; bloqueio pode falhar silenciosamente ou ser apagado por pagamento |
| Reativar | Ativa e desbloqueia; concede 30 dias se vencido | Pode conceder acesso sem pagamento, conforme implementação atual |
| Cancelar | Marca cancelado e cancelamento ao fim do período | Não cancela no Asaas; banco e tela divergem sobre dias restantes |
| Atualizar observação | Usa a rotina geral de criação/alteração de assinatura | Também marca override e sincroniza acesso; em certos estados pode desbloquear ou criar assinatura |
| Remover override | Apaga sinalizadores e override de trial | Não restaura estado anterior nem consulta situação atual no Asaas |
| Bloquear usuário | Define bloqueio no perfil | É removido pelo webhook de pagamento |
| Desbloquear usuário | Remove bloqueio do perfil | Não concede plano nem regulariza assinatura vencida |
| Aprovar cadastro | Altera aprovação de entrada | Pagamento/liberação de plano não substituem essa aprovação |

## Outros gargalos operacionais

- **Recorrência:** a página atual gera PIX avulso. Chamar o produto de mensal/anual define duração comercial, não débito automático. O Asaas distingue criação de assinatura e cobranças geradas por ela ([documentação oficial](https://docs.asaas.com/docs/assinaturas)).
- **Função alternativa de recorrência:** `asaas-create-subscription` tem cálculo de preço diferente, busca cliente por e-mail e infere URL de campos da assinatura, sem listar sua primeira cobrança. O fluxo oficial oferece consulta das cobranças por assinatura ([documentação oficial](https://docs.asaas.com/docs/criando-uma-assinatura)). Sua publicação/uso externo não foi confirmada.
- **Ambiente:** checkout, webhook e admin fixam `live`; `ASAAS_BASE_URL` pode apontar para sandbox. A função alternativa interpreta ambiente por configuração. O frontend prioriza override antes de ambiente, e o admin prioriza ambiente antes de override. Testes podem poluir o estado lógico live se usados no mesmo banco; separar chave, URL, dados e notificações.
- **Idempotência de criação:** o checkout principal sempre cria cobrança; não reutiliza um pedido pendente nem possui limite distribuído de tentativas. Reenvio após timeout pode criar duplicata. Falhas ao salvar cliente/assinatura são apenas registradas, embora a cobrança continue válida no gateway.
- **Conciliação:** o cron encontrado apenas marca perfis vencidos como inadimplentes. Não consulta pagamentos no Asaas nem recupera eventos perdidos. Cliente desconhecido é respondido com 200 e ignorado; não há recuperação automática identificada.
- **Eventos:** há tratamento de confirmado, recebido, atraso, exclusão, estorno e chargeback solicitado. Faltam políticas explícitas para eventos como estorno parcial, recebimento em dinheiro desfeito, restauração e outros estados de disputa. Não basta mapear todos como cancelamento; cada um exige regra proporcional ao direito concedido ([eventos oficiais](https://docs.asaas.com/docs/webhook-para-cobrancas)).
- **Confirmação na tela:** “já paguei” faz até 50 novas leituras de perfil, com intervalo de 100 ms entre respostas. Não consulta a cobrança nem dispara conciliação. Pode apresentar não confirmado por atraso de webhook; não há retomada persistente da compra após recarga nem invalidação explícita do cache de assinatura nesse caminho. Há canais Realtime de perfil que ajudam, se configurados e conectados.
- **Trial:** o contador dispara renderização a cada minuto, mas o `useMemo` não depende desse contador. A passagem do tempo sozinha não recalcula o resultado memorizado. Com override zero, o hook retorna `expired: false`, em desacordo com “expirar imediatamente”.
- **Dono da conta:** assinaturas/permissões usam `dataOwnerId`; checkout cobra e salva em `user.id`. Um membro vinculado pode pagar por um registro próprio e continuar dependendo do plano vencido do dono. Falta definir quem pode contratar para a conta.
- **Painel em escala:** lista até 100 perfis no hook, sem navegação de páginas identificada; filtra status depois da paginação do servidor; busca e-mail com uma requisição administrativa por usuário. Pode omitir assinaturas do filtro, mostrar total incoerente e aumentar a latência.
- **Artefatos de publicação:** existem três variantes da função admin. `admin-subscription-manage-standalone.ts` não contém a sincronização financeira do perfil presente no `index.ts`. Confirmar qual arquivo foi publicado é essencial.
- **Preço inválido:** valor computado zero cai em `ASAAS_DEFAULT_PLAN_VALUE` (padrão 49,90), em vez de ser rejeitado/tratado como gratuito. A tela evita normalmente esse caminho, mas a API continua acessível diretamente.

## O que já está bem encaminhado

- Checkout valida a identidade pelo JWT e resolve o preço no servidor.
- A função administrativa verifica o papel admin no servidor.
- Webhook exige secret e trata algumas falhas de escrita com HTTP 500.
- Existem estrutura de auditoria, identificadores de evento/pagamento e preservação de dias em renovação antecipada.
- A criação de uma nova cobrança tenta preservar a assinatura vigente.
- Há regras de bloqueio no banco além dos componentes visuais.

Esses mecanismos são úteis, mas as inconsistências acima impedem tratá-los como garantia completa.

## Validação realizada e limites

1. Leitura cruzada do frontend, funções Asaas, variantes administrativas, SQLs, migrations e roteiro E2E.
2. Execução do código real do webhook, transpilado localmente, com API Supabase simulada em memória: reprodução de remoção de bloqueio, crédito intercalado em duplicidade, revogação por cobrança antiga e fallback de ciclo. A simulação do schema também reproduziu a falha de auditoria. Não substitui teste de integração com PostgreSQL.
3. Execução das expressões reais de `useSubscription`: `pending` sem vencimento resultou em ativo.
4. Teste existente `SubscriptionGate`: três testes aprovados. Eles usam hooks simulados e não validam o checkout ou webhook.
5. Suíte geral `npm test`: não concluiu; houve falha de memória/processo e canal de comunicação fechado. Não há resultado global aprovado.
6. Roteiro `scripts/test-asaas-e2e.mjs` inspecionado, não executado: cria cobranças e envia eventos que alteram acesso. Não oferece homologação automática segura de produção, nem cobre os principais casos cruzados encontrados. Seus testes sequenciais de duplicidade não cobrem A/B/A.

O Asaas documenta entrega de webhook ao menos uma vez e novas tentativas quando a resposta não é 2xx; a fila pode ser interrompida após falhas consecutivas. Por isso, evento não pode ser assumido único e falha interna não deve ser reconhecida como sucesso sem recuperação persistente ([documentação oficial](https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint)).

## Ordem recomendada de correção

1. Verificar e fechar a edição de campos de acesso pelo usuário; corrigir `pending` como ativo; preservar bloqueio administrativo.
2. Criar histórico de pedidos/pagamentos, com vínculo imutável a plano, ciclo, conta e ambiente.
3. Tornar crédito, auditoria e atualização de acesso transacionais e idempotentes por pagamento; corrigir estornos/exclusões por origem.
4. Unificar permissões, regras de validade e ações manuais; tornar falhas visíveis e auditáveis.
5. Consolidar migrations e publicação; separar sandbox/live; implementar conciliação e diagnóstico por cobrança.
6. Homologar PIX avulso e, se for requisito comercial, recorrência/cartão/boleto com fluxo próprio conectado à interface.

Critérios mínimos de aceite: primeira compra mensal/semestral/anual correta; upgrade com período vigente; dois PIX abertos e pagamento do mais antigo; A confirmado/B confirmado/A recebido; eventos simultâneos; erro entre duas escritas; exclusão de PIX abandonado; estorno de pagamento antigo; suspensão seguida de pagamento; concessão manual seguida de webhook; cancelamento com dias restantes; zero dias; pagamento por membro vinculado; ambientes separados; tentativa de alteração de acesso por usuário comum; concordância de plano/dias/permissões no admin, app e banco.

Para concluir a análise do ambiente publicado, faltam evidências de leitura: versões das funções implantadas, definições SQL/policies/triggers atuais, jobs instalados, configuração e saúde da fila do webhook no Asaas, amostras anonimizadas de cobranças com seus eventos e concessões. Essas verificações determinam quais riscos do repositório já afetam usuários reais.
