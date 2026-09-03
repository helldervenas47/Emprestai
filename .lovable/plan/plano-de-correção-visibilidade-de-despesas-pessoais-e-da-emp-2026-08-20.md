# Plano de Correção: Visibilidade de Despesas Pessoais e da Empresa

O usuário reportou que apenas faturas de cartões são visíveis na aba de despesas. A análise identificou que as despesas padrão estão sendo filtradas ou não exibidas corretamente devido a conflitos de lógica entre os componentes `ExpenseList` (empresa) e `PersonalExpenseList` (pessoal), e o uso de filtros de competência que podem estar ocultando registros sem `card_id`.

## Alterações Propostas

### 1. Componente ExpenseList (`src/features/financial/components/ExpenseList.tsx`)
- Ajustar a lógica de filtragem para garantir que despesas do tipo `fixa` (que representam despesas únicas no banco) e `recorrente` sejam exibidas corretamente.
- Corrigir o cálculo de `totalPending` e `totalPaid` no Hero para incluir todas as despesas filtradas do mês, não apenas as "visíveis" (que excluíam recorrentes totalmente pagas).

### 2. Componente PersonalExpenseList (`src/features/financial/components/PersonalExpenseList.tsx`)
- Revisar a lógica do `useMemo` inicial que filtra as despesas. Atualmente, ele pode estar sendo agressivo demais ao filtrar itens que parecem faturas.
- Garantir que a distinção entre `mode="business"` e `mode="personal"` não oculte despesas legítimas que não possuem metadados de cartão.

### 3. Hook de Métricas (`src/features/dashboard/components/dashboard/useDashboardMetrics.ts`)
- Sincronizar a lógica de agregação de despesas para que o Dashboard reflita exatamente o que é visto nas abas financeiras, evitando discrepâncias de saldo.

## Detalhes Técnicos
- As despesas no banco usam a coluna `scope` ('business' ou 'personal').
- O componente `ExpenseList` é usado para `business`.
- O componente `PersonalExpenseList` é usado para `personal`.
- A falha parece estar no `monthFiltered` ou no mapeamento de status de parcelas que pode estar retornando vazio para despesas simples.

## Verificação
- Validar se despesas sem `card_id` aparecem em ambas as sub-abas.
- Confirmar se o saldo no Hero reflete a soma correta.
