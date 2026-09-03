# Plano de Correção: Status de Pagamento em Despesas Recorrentes

Identificamos que a regressão no status das despesas (meses futuros aparecendo como pagos) foi causada por uma alteração na lógica de determinação do status `paid`. O sistema passou a priorizar o campo `paid` do registro "pai" da despesa recorrente, ignorando o contador de competência (`paidInstallments`).

## Alterações Técnicas

### 1. Ajuste na Lógica de Mapeamento (PersonalExpenseList e ExpenseList)
Corrigiremos a determinação do status `isPaid` para despesas recorrentes em ambos os módulos (Pessoal e Empresa). A lógica voltará a ser baseada exclusivamente no `paidInstallments`: uma parcela é considerada paga se o índice do mês selecionado for menor que o número de parcelas já quitadas.
- **Arquivo:** `src/features/financial/components/PersonalExpenseList.tsx`
- **Arquivo:** `src/features/financial/components/ExpenseList.tsx`

### 2. Sincronização de Totais e Resumos
Ajustaremos o cálculo de totais (`totalPaid`, `totalPending`) no `useMemo` para garantir que a soma exibida no "Hero Card" e no resumo por categoria reflita exatamente o que está sendo mostrado na lista, evitando discrepâncias visuais.

### 3. Ajuste no Badge de Parcelas
Corrigiremos o indicador visual `current/total parcelas` para que ele não force o valor máximo (`total`) quando o registro pai está marcado como pago, mantendo a contagem real de competência.

## Verificação
Validaremos se, ao navegar para um mês futuro, as despesas recorrentes (como Aluguel ou Internet) aparecem como "Pendente" ou "A pagar", a menos que o número de parcelas pagas realmente cubra aquele período.

---
**Nota:** Esta correção restaura o comportamento funcional do commit `ff99da7`, garantindo que o status `paid` no banco de dados (usado para sinalizar a conclusão de toda a série) não afete a visualização individual de cada mês.
