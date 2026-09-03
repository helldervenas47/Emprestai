# Cálculo financeiro unificado (fonte única de verdade)

> Status: camada de cálculo e leitura concluída. **Nenhum registro do banco foi
> alterado, recriado ou recalculado.** Nenhuma função legada foi removida.

## 1. Auditoria — onde as fórmulas viviam (antes)

| Conceito | Locais que calculavam sozinhos | Divergência encontrada |
|---|---|---|
| Total a receber | `loanLateFees.getLoanReceivable`, `list/calculations.getLoanTotalReceivable`, `useDashboardLoanTotals`, relatórios/Telegram (`_shared/interest-allocation.ts`) | Cada camada somava encargos de forma própria |
| Principal restante | `loanOutstanding.getLoanOutstandingBreakdown`, UI do Payment Hub | UI subtraía juros do saldo → principal maior que o emprestado |
| Juros restantes | `loanOutstanding`, `currentCycleInterest`, `interestAllocation` | juro do ciclo x juro contratual usados como sinônimos |
| Juros do ciclo/parcela | `PaymentHubDialog` (inline) → depois `currentCycleInterest` | parcelado usava o juro TOTAL do contrato |
| Multa / juros de atraso | `loanLateFees` | multa recontada mesmo após paga em alguns caminhos |
| Arredondamento | `Math.round(x)` inteiro em `calculateTotalWithInterest`, `round2` local em vários arquivos | perda/ganho de centavos entre módulos |
| Saldo | `loan.remainingAmount` usado como verdade | cache desatualizado propagava erro |

## 2. Fonte única

`src/features/loans/lib/calculateLoanFinancialState.ts` →
`calculateLoanFinancialState({ loan, payments, installmentSchedules, renegotiations, calculationDate, lateInterestBase })`

Função **pura**: sem Supabase, sem hooks, sem escrita. Retorna
`LoanFinancialState` com principal, juros contratuais, parcela vigente,
multa, juros de atraso, atraso, saldo, total a receber, `calculationSource`
e `warnings`.

## 3. Fórmulas oficiais

```
principalRemaining           = clamp(principal − principalPago, 0, principal)
contractualInterestTotal     = Σ juros das parcelas do plano oficial
contractualInterestRemaining = max(0, contractualInterestTotal − jurosContratuaisPagos)
contractualBalanceRemaining  = principalRemaining + contractualInterestRemaining
penaltyPending               = max(0, multaAplicada − multaPaga)
lateInterestPending          = max(0, jurosAtrasoAplicado − jurosAtrasoPago)
totalReceivable = payoffAmount = contractualBalanceRemaining
                               + penaltyPending + lateInterestPending
```

Regras invioláveis:

1. Principal restante nunca > valor emprestado e nunca < 0.
2. Multa e juros de atraso **nunca** abatem principal ou juros contratuais.
3. Pagamento de juros avulsos = 0% principal; amortização = 100% principal.
4. Parcelado **nunca** usa o juro total do contrato como juro do ciclo: usa a
   parcela vigente do plano oficial.
5. `loan.remainingAmount` e `loan.paidInstallments` são **cache validável** —
   divergências entram em `warnings`; o cálculo por histórico prevalece.
6. Histórico e metadados antigos são respeitados: `principal_amount`,
   `interest_amount`, `penalty_amount`, `late_interest_amount` têm prioridade;
   parciais sem metadata usam a alocação legada oficial.

## 4. Arredondamento

`src/lib/money.ts`: `roundCurrency` (2 casas), `toCents/fromCents`,
`distributeCurrency` (rateio em centavos inteiros, resíduo para as maiores
frações → a soma fecha exatamente o total) e `isMoneyDivergent`.
`Math.round(valor)` inteiro é proibido em dinheiro novo.

## 5. Feature flag

`src/features/financial/lib/financialFlags.ts`

- `VITE_USE_UNIFIED_FINANCIAL_CALCULATION=false` (default) → regras atuais intactas.
- `=true` → módulos migrados passam a ler a fonte única.
- `VITE_FINANCIAL_DIFF_DIAGNOSTICS=true` → diagnóstico antigo × novo.

## 6. Comparador (somente leitura)

`src/features/loans/lib/financialCalculationDiff.ts`:
`compareLoanFinancialCalculations(loans, payments, schedules, { onlyDivergent })`
devolve `FinancialCalculationDiff[]` (antigo, novo, diferença, avisos) com
export `financialDiffToCsv` / `financialDiffToJson`. Não grava nada.

## 7. Próximos passos (migração gradual, com flag ligada)

1. Payment Hub e cards de contrato.
2. Dashboard / Metas.
3. Relatórios e Telegram (`_shared`).
4. Só após paridade confirmada por contrato: avaliar backfill dos caches.
