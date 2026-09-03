---
trigger: always_on
---

# Regras Principais — Emprestaii

## Objetivo

Você está trabalhando no Emprestaii, um sistema financeiro/ERP SaaS.

O sistema possui módulos de:

* Dashboard
* Financeiro
* Receitas
* Despesas
* Cartões de Crédito
* Empréstimos
* Clientes
* Vendas
* Metas
* Veículos
* Transportadores
* Relatórios
* Administração
* Sistema

O sistema utiliza dados financeiros reais e possui regras de negócio interdependentes.

## Regra fundamental

NUNCA altere uma regra de negócio existente sem antes compreender completamente seu funcionamento atual.

Antes de modificar código relacionado a uma funcionalidade existente:

1. Localize todos os arquivos envolvidos.
2. Identifique onde os dados são criados.
3. Identifique onde os dados são armazenados.
4. Identifique onde os dados são calculados.
5. Identifique onde os dados são exibidos.
6. Identifique funções, hooks, RPCs, Edge Functions e componentes que dependem dessa informação.
7. Verifique se existem testes relacionados.
8. Avalie possíveis efeitos colaterais.

## Preservação de funcionalidades

Uma solicitação de alteração deve modificar somente o comportamento necessário para resolver o problema solicitado.

NÃO:

* refatore código sem necessidade;
* altere componentes não relacionados;
* remova funcionalidades existentes;
* altere nomes de tabelas ou colunas sem necessidade;
* altere regras financeiras por iniciativa própria;
* substitua uma implementação funcional simplesmente por uma implementação "mais moderna";
* faça mudanças estéticas não solicitadas.

Se encontrar outro problema durante a implementação, registre-o e informe ao usuário em vez de corrigi-lo automaticamente, salvo se ele for diretamente necessário para a alteração solicitada.

## Antes de programar

Para tarefas que possam afetar regras de negócio:

1. Analise o código atual.
2. Explique resumidamente a causa do problema.
3. Apresente o plano de alteração.
4. Identifique os arquivos que serão modificados.
5. Identifique possíveis riscos.
6. Só então implemente.

Para alterações pequenas e claramente delimitadas, pode executar diretamente, desde que não exista risco significativo para dados ou regras financeiras.

## Banco de dados

Nunca execute alterações destrutivas no banco de dados sem autorização explícita.

Considere como operações de alto risco:

* DROP;
* DELETE em massa;
* TRUNCATE;
* alteração estrutural de tabelas existentes;
* alteração de tipos de colunas;
* remoção de colunas;
* alterações de RLS;
* alterações de permissões;
* alterações de funções/RPCs utilizadas em produção.

Antes dessas operações, explique:

* o que será alterado;
* por que é necessário;
* quais dados podem ser afetados;
* como realizar rollback.

## Dados financeiros

Valores financeiros devem ser tratados com precisão.

Nunca utilize arredondamentos arbitrários.

Evite operações financeiras baseadas em floating point quando a arquitetura existente utilizar outra estratégia de precisão.

Sempre preserve:

* centavos;
* sinais positivo/negativo;
* datas;
* status;
* relacionamentos;
* parcelas;
* juros;
* multas;
* pagamentos;
* saldos.

## Segurança

Nunca exponha ou copie para o código:

* senhas;
* tokens;
* API keys;
* service role keys;
* secrets;
* credenciais do Supabase;
* credenciais do Asaas;
* credenciais de terceiros.

Nunca coloque secrets diretamente em arquivos versionados.

Não altere arquivos `.env` para inserir credenciais reais.

## Git

NUNCA faça push para o GitHub automaticamente sem autorização explícita do usuário.

Antes de um commit:

1. Execute os testes relevantes.
2. Verifique o diff.
3. Confirme que nenhuma credencial foi adicionada.
4. Confirme que nenhum arquivo não relacionado foi alterado.
5. Informe os arquivos modificados.
6. Informe resumidamente o que mudou.

Nunca faça `git reset --hard`, `git clean -fd` ou operações destrutivas semelhantes sem autorização explícita.

## Comunicação

Se uma alteração puder quebrar outra funcionalidade, informe antes de executá-la.

Nunca diga que uma tarefa está "corrigida" apenas porque o código foi alterado.

Considere uma tarefa concluída somente após:

* implementação;
* validação;
* testes relevantes;
* análise de erros;
* confirmação de que não existem regressões conhecidas.

Ao terminar, apresente:

1. O que foi alterado.
2. Arquivos alterados.
3. Testes executados.
4. Resultado dos testes.
5. Possíveis riscos.
6. O que precisa ser validado manualmente.
