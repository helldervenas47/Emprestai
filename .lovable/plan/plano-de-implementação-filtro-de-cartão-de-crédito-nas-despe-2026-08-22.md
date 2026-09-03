# Plano de Implementação - Filtro de Cartão de Crédito nas Despesas

Adicionar um filtro rápido "Cartões" na aba de despesas pessoais (Financeiro) para isolar gastos vinculados a cartões de crédito, permitindo uma visualização clara das faturas.

## Alterações

### 1. Componente `PersonalExpenseList.tsx`
- Adicionar estado `cardFilter` (boolean) para o novo filtro.
- Incluir o botão de filtro "Cartões" na interface, ao lado dos filtros "Automáticas" e "Manuais".
- Atualizar a lógica de `listVisibleMonth` para filtrar despesas vinculadas a cartões quando o filtro estiver ativo.
- Ajustar a exibição da lista combinada (`combined`) para priorizar ou filtrar faturas de cartão conforme o estado do filtro.

### 2. Componente `ExpenseList.tsx` (Empresarial)
- Aplicar o mesmo padrão visual e funcional para manter a consistência entre os modos Pessoal e Empresarial.

## Detalhes Técnicos
- Utilizar a função `isCreditCardExpense(e)` e a verificação de `paymentMethodId` contra a lista de `cards` para identificar despesas de cartão.
- Manter a compatibilidade com a expansão virtual de parcelas e competência mensal.
- Garantir que o filtro interaja corretamente com a busca textual e o filtro de categorias.
