# Plano de Auditoria e Correção Definitiva: Duplicação de Despesas em Cartões

O objetivo deste plano é garantir que cada despesa vinculada a um cartão de crédito seja única, persistida corretamente e exibida exclusivamente na fatura do cartão selecionado, eliminando qualquer duplicação ou associação cruzada.

## Ações Técnicas

### 1. Fortalecimento da Identificação (Persistência)
*   **Problema:** A vinculação depende de strings em `notes`, o que é frágil contra nomes similares (ex: "Nubank" vs "Nubank 2").
*   **Solução:** 
    *   Habilitar filtros de Regex estritos em `creditCardInvoiceTotals.ts` para garantir que o match da tag seja exato (já iniciado).
    *   Garantir que o `ExpenseForm.tsx` gere a tag `[Crédito] Cartão: {Nickname}` de forma consistente usando o `nickname` único do cartão.

### 2. Idempotência no Fluxo de Pagamento (Backend/Hooks)
*   **Problema:** Cliques duplos ou reprocessamento de estado podem gerar parcelas "filhas" duplicadas ou entradas duplicadas no extrato.
*   **Solução:**
    *   Hardening do hook `useExpenses.ts`: Adicionar travas de segurança que verificam se uma parcela (`parent_id` + `due_date`) já existe no banco antes de permitir uma nova inserção.
    *   Garantir que a gravação no `account_ledger` use o `expense_id` como chave de deduplicação.

### 3. Integridade na Visualização e Cache (Frontend)
*   **Problema:** Lógica de filtragem no `LedgerView.tsx` ou estados de cache locais podem estar misturando despesas de diferentes origens.
*   **Solução:**
    *   Refinar `LedgerView.tsx` para garantir que a exclusão visual de pagamentos de fatura seja baseada em critérios inequívocos.
    *   Auditar o `ExpenseEditDialog.tsx` para que a alteração de um campo não resulte na perda da tag do cartão original ou na atribuição acidental de um novo cartão.

### 4. Critérios de Validação (QA)
*   Criar 3 cartões distintos com nomes similares.
*   Lançar despesas específicas em cada um.
*   Validar no banco de dados que não existem registros com o mesmo `parent_expense_id` e `due_date`.
*   Confirmar que a troca de mês/filtro no dashboard não faz despesas de um cartão "vazarem" para outro.

## Detalhes Técnicos
*   **Arquivos afetados:** `src/features/financial/hooks/useExpenses.ts`, `src/features/creditCards/lib/creditCardInvoiceTotals.ts`, `src/features/financial/components/ExpenseForm.tsx`.
*   **Banco de Dados:** Auditoria direta via Supabase Client para confirmar unicidade dos registros.
