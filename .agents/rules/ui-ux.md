---
trigger: model_decision
---

# UI e UX — Emprestaii

## Princípios

O Emprestaii possui interface responsiva para:

* desktop;
* tablet;
* celular.

Ao modificar uma tela, preserve o comportamento responsivo existente.

## Design

Preserve:

* identidade visual;
* paleta de cores;
* hierarquia visual;
* espaçamentos;
* componentes existentes;
* padrões de navegação.

Não introduza uma nova biblioteca visual sem necessidade.

Não altere o design global para corrigir um problema localizado.

## Responsividade

Sempre verificar:

* desktop;
* tablet;
* mobile.

Uma alteração feita para desktop não pode prejudicar mobile.

Uma alteração feita para mobile não pode prejudicar desktop.

## Dados

A interface deve refletir os dados reais.

Não utilize valores fictícios para mascarar dados ausentes.

Não esconda erros de backend apenas removendo o indicador visual.

## Estados

Quando aplicável, tratar corretamente:

* carregando;
* vazio;
* erro;
* sucesso;
* sem permissão;
* parcialmente carregado.

## Filtros

Filtros devem alterar efetivamente os dados exibidos.

Não implemente filtros apenas visualmente.

Quando houver filtros financeiros, verificar se a filtragem ocorre:

* no banco;
* no backend;
* no frontend;

e escolher a abordagem compatível com a arquitetura existente.
