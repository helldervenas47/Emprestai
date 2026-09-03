# Plano: Correção da Reatividade na Meta de Variação Mensal do Patrimônio

A meta de "Variação Mensal do Patrimônio" na aba Metas não atualiza o valor "Realizado Atual" imediatamente ao abrir a aba, exigindo navegação intermediária. O objetivo é garantir que os dados sejam recalculados e exibidos corretamente na primeira renderização útil da aba.

## Alterações

### Frontend

- **`src/features/piggyBanks/hooks/useMonthlyGoals.ts`**:
    - Adicionar suporte a um evento global de reatualização (`metas:reload`) para forçar o recarregamento das metas do banco.
- **`src/features/piggyBanks/hooks/useGoalSnapshots.ts`**:
    - Adicionar listener para o evento `metas:reload` para invalidar o estado local e buscar snapshots atualizados.
- **`src/features/piggyBanks/components/metas/MetasTab.tsx`**:
    - Implementar um `useEffect` que dispara o evento `metas:reload` e solicita o recarregamento de todas as dependências (loans, payments, expenses) através de suas respectivas funções de `reload` quando a aba é montada.
    - Garantir que a renderização do `GoalsYearlyGrid` ocorra com dados frescos.
- **`src/features/piggyBanks/components/metas/GoalsYearlyGrid.tsx`**:
    - Ajustar o cálculo do `currentActiveCapital` para garantir que ele use as referências de props mais recentes.
    - Adicionar um mecanismo de "pull-to-refresh" interno ou gatilho automático de sincronização ao detectar que o componente foi montado em uma visualização ativa.
- **`src/lib/appUIEvents.ts`**:
    - Registrar o novo tipo de evento `METAS_RELOAD`.

### Technical Details

- Utilizar o barramento de eventos centralizado em `src/lib/appUIEvents.ts` para coordenar a invalidação de cache.
- Forçar o `reload()` dos hooks `useLoans`, `useExpenses` e `useMonthlyGoals` no ponto de entrada da aba Metas.
- Otimizar o `useMemo` em `GoalsYearlyGrid` para reagir a mudanças de estado globais que não estavam sendo capturadas.
