---
trigger: always_on
---

# Testes e Validação — Emprestaii

Toda alteração deve ser validada de acordo com seu nível de risco.

## Alterações simples

Executar:

* lint, quando disponível;
* testes diretamente relacionados;
* build quando aplicável.

## Alterações financeiras

Executar testes específicos para:

* cálculos;
* parcelas;
* juros;
* pagamentos;
* saldos;
* datas;
* status;
* totais.

## Alterações de banco

Validar:

* queries;
* tipos;
* permissões;
* RLS;
* RPCs;
* migrations;
* compatibilidade com código existente.

## Alterações de UI

Validar:

* desktop;
* tablet;
* mobile;
* estados vazios;
* loading;
* erro;
* dados reais;
* filtros;
* paginação quando aplicável.

## Regra de regressão

Depois de corrigir um bug, procure funcionalidades relacionadas que possam ter sido afetadas.

Não altere testes existentes apenas para fazê-los passar.

Se um teste falhar porque a regra de negócio mudou intencionalmente, explique isso antes de atualizar o teste.

## Resultado

Ao concluir uma tarefa, informe:

TESTES EXECUTADOS:

* teste 1 — resultado
* teste 2 — resultado
* teste 3 — resultado

Se algum teste não puder ser executado, informe claramente o motivo.

Nunca invente resultados de testes.
