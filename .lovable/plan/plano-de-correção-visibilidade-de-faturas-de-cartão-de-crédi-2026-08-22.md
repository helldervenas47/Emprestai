# Plano de Correção: Visibilidade de Faturas de Cartão de Crédito

O objetivo deste plano é garantir que as faturas de cartão de crédito sejam exibidas exclusivamente na aba de **Despesas Pessoais**, removendo-as da aba de **Despesas Empresariais** (Business mode) e de qualquer lugar onde não devam aparecer no contexto corporativo.

## Alterações

### 1. Componente `PersonalExpenseList` (src/features/financial/components/PersonalExpenseList.tsx)
- No `useMemo` que filtra as despesas iniciais (lines 115-137), reforçar a lógica para o modo `business`:
  - Atualmente já existe um filtro que remove itens com `paymentMethodId` vinculado a cartões.
  - Vou adicionar um filtro explícito para garantir que o registro agregado de faturas (`invoiceRows`) não seja renderizado no modo `business`.
- Na renderização do loop `combined.map` (lines 1094+), adicionar uma verificação `if (isBusiness && item.kind === "invoice") return null;`.
- Ajustar o contador do botão "Cartões" para ser ocultado ou retornar 0 se `isBusiness` for true.

### 2. Componente `ExpenseList` (src/features/financial/components/ExpenseList.tsx)
- Este componente parece ser usado principalmente na aba de despesas empresariais (ou modo geral do financeiro).
- O filtro de "Cartões" nele (lines 521-524) será removido ou desativado, pois faturas de cartão são tratadas como despesas pessoais conforme as instruções.
- Garantir que não haja lógica de agregação de faturas neste componente.

## Detalhes Técnicos
- Utilizar a prop `mode="business"` como discriminador.
- Manter a imutabilidade das despesas pessoais, garantindo que elas continuem visíveis na aba correta.
- A consistência será validada verificando as contagens nos filtros rápidos.
