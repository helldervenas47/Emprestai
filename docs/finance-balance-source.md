# Fonte oficial do "Saldo em Conta"

> Status: P0-01 (fase 1 — service oficial criado, UI ainda em legado).

## Fonte oficial

`public.account_ledger` é a fonte única do saldo em conta.

Fórmula:

```
saldo_oficial(owner) =
    SUM(amount) WHERE direction = 'in'
  − SUM(amount) WHERE direction = 'out'
  , filtrado por user_id = owner
  , excluindo linhas com metadata->>'scope' = 'vehicle'
```

Implementação: `src/lib/accountLedgerBalance.ts`
(`getOfficialBalance`, `useOfficialAccountBalance`, `sumOfficialBalance`).

## O que fica FORA do saldo oficial

- Veículos (`metadata.scope = 'vehicle'`) — possuem saldo próprio em `vehicle_balance`, por regra de negócio. Mantido.
- Cofrinhos — a decidir em P0-01d. Hoje o saldo dos cofrinhos vive em `cofrinhos.saldo_principal` e não deve entrar no saldo em conta.

## Hooks legados (a substituir)

Os hooks abaixo continuam alimentando a UI enquanto o backfill do ledger não é feito. NÃO usar em código novo:

- `src/hooks/useAccountBalance.ts`
- `src/hooks/useUnifiedAccountBalance.ts`
- `src/components/dashboard/useAccountBalance.ts`
- `src/components/IncomeBalanceCard.tsx` (cálculo local)

## Roteiro

- **P0-01a (feito):** service oficial + doc + comentários nos hooks legados.
- **P0-01b:** backfill + triggers no banco para que todo income/expense/sale pago gere linha no `account_ledger`.
- **P0-01c:** migrar UI para `useOfficialAccountBalance` e remover hooks derivados.
- **P0-01d:** decidir tratamento de cofrinhos e da carteira "dinheiro" (`balance.cash_amount`).
- **P0-01e:** remover `balance` / `vehicle_balance` se aplicável.

## Regras para evitar dupla contagem

Ao gerar lançamentos no ledger a partir de fluxos existentes (fase P0-01b):

1. Cada evento financeiro que hoje "vira dinheiro em conta" gera exatamente uma linha no ledger.
2. Pagamento de fatura de cartão já é lançado — expenses que compõem a fatura NÃO devem gerar débito adicional no ledger.
3. Despesas de veículos usam `metadata.scope = 'vehicle'` e não afetam o saldo geral.
4. Depósitos/resgates em cofrinho não passam pelo saldo em conta.
