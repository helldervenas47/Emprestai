# Plano de Auditoria e Correção: Duplicação de Despesas em Cartões de Crédito

Foi reportado que despesas lançadas em um cartão de crédito estão sendo duplicadas e associadas indevidamente a outros cartões. Este plano visa auditar o fluxo de lançamento e garantir a integridade da vinculação entre despesas e cartões.

## Auditoria e Diagnóstico

### 1. Frontend e Gerenciamento de Estado
*   **Identificação de Conflitos de Notas:** O sistema utiliza marcadores em texto no campo `notes` (ex: `[Crédito] Cartão: NomeDoCartão`) para vincular despesas a cartões. Se dois cartões tiverem nomes semelhantes ou se a lógica de detecção for falha, uma despesa pode ser atribuída incorretamente.
*   **Cache e Sincronização:** Verificar se o `sharedResource` ou o cache offline (`indexedDB`) está misturando dados de cartões diferentes durante a renderização da `CreditCardList` ou do extrato.
*   **Formulários de Edição:** O `ExpenseEditDialog` tenta detectar o cartão a partir das notas. Se a lógica de `detectCardTag` falhar, ele pode sugerir o cartão errado na edição, causando associação cruzada ao salvar.

### 2. Banco de Dados e Queries
*   **Filtragem por Tag:** As queries na `CreditCardList` e no `LedgerView` filtram despesas comparando o nickname/banco do cartão com o conteúdo da nota. Se um cartão for "Nubank" e outro "Nubank 2", uma busca simples por "Nubank" retornará ambos.
*   **Duplicação de Registro:** Confirmar se o `payExpense` no hook `useExpenses` está criando registros filhos duplicados quando disparado múltiplas vezes em condições de rede instável ou falta de idempotência.

## Ações de Correção

### 1. Fortalecimento da Vinculação (Backend/Lib)
*   Refinar a lógica de `isCreditCardExpense` e filtros de cartão em `creditCardInvoiceTotals.ts` para usar regex mais estritas, evitando que "Nubank" dê match em "Nubank Platinum" indevidamente.
*   Garantir que o `payment_method_id` seja a fonte da verdade primária para a carteira/conta, usando a tag no `notes` apenas como metadado visual ou fallback.

### 2. Ajuste no Fluxo de Pagamento de Fatura (`useExpenses.ts`)
*   Implementar verificação de idempotência no `payExpense` para parcelas de cartão, garantindo que o registro filho (`parent_expense_id`) não seja inserido se já existir um para aquele mês/parcela.

### 3. Correção na Exibição do Extrato (`LedgerView.tsx`)
*   Refinar o filtro `isCreditCardInvoiceLedgerEntry` para garantir que pagamentos de faturas sejam consistentemente ocultados do extrato geral, evitando a percepção de "duplicação" (onde aparece a compra e o pagamento da fatura no mesmo lugar).

### 4. Ajuste nos Formulários (`ExpenseForm.tsx` e `ExpenseEditDialog.tsx`)
*   Garantir que, ao selecionar um cartão, a tag inserida no `notes` seja única e inequívoca.
*   Corrigir o `ExpenseEditDialog` para que ele não resete o cartão selecionado para um padrão (como Nubank) se não encontrar um match perfeito na detecção inicial.

## Validação Técnica
*   Criar 2 cartões com nomes similares.
*   Lançar despesa no Cartão A.
*   Verificar se aparece no Cartão B.
*   Pagar a fatura do Cartão A e verificar se o saldo é deduzido corretamente sem afetar o Cartão B.
*   Validar se o extrato (`LedgerView`) permanece limpo de duplicatas.

---
**Observação:** O sistema atual depende fortemente de strings em `notes`. A longo prazo, a migração para uma coluna `credit_card_id` na tabela `expenses` seria o ideal, mas para esta correção imediata, focaremos em tornar a lógica de tags e filtros infalível.
