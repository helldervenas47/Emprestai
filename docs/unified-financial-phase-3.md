# Fase 3 — Dashboard, Metas, Relatórios e Telegram na fonte única

> Status: camada de **agregação e leitura** concluída. **Nenhum registro do
> banco foi alterado, recriado ou recalculado.** Nenhuma função legada foi
> removida. Toda migração está atrás de feature flag (default: desligada).

## 1. Auditoria — onde os agregados viviam (antes)

| Indicador | Quem calculava | Divergência |
|---|---|---|
| Capital na rua | `useDashboardMetrics` (rateio por parcelas), `reports-commands.snapshot` (mesmo rateio) | rateio ignora o principal realmente amortizado |
| Total a receber | `useDashboardMetrics` (total + encargos + juros já recebidos), `useLoanListController`, `snapshot.totalToReceive` | somava juros JÁ recebidos ao que falta receber |
| Pendente de recebimento | `getLoanReceivable` (app), `loan.remaining_amount` (Telegram) | cache do banco x cálculo por histórico |
| Lucro estimado | Dashboard e Telegram, cada um com sua fórmula de `baseRemaining × ratio + encargos` | duas implementações do mesmo número |
| Lucro realizado | `calculateRealizedProfitForRange` (Dashboard), `computeProfitRealized` (bot) | regimes diferentes de reconhecimento |
| Capital ativo (Metas) | `useMonthlyScoreProvider` (`getLoanReceivable`) | terceira definição de "capital" |
| Período | cada módulo montava `start/end` com `Date` e fuso local | borda final às vezes exclusiva |

## 2. Fonte única de agregação

`supabase/functions/_shared/financial-aggregates-core.ts`

Arquivo **puro e sem imports** — roda em Deno (Edge Functions) e no browser.
O app importa exatamente este arquivo via
`src/features/financial/lib/financialAggregatesCore.ts` (re-export). Nada é
copiado: existe uma única implementação de cada soma.

Camadas:

```text
contrato → calculateLoanFinancialState / adapter (Fase 1-2)
              ↓  AggregateLoanState
        buildFinancialAggregates  ← FONTE ÚNICA DE AGREGAÇÃO (Fase 3)
              ↓  FinancialAggregates
   Dashboard   Metas   Relatórios   Telegram   Exportações
```

- App: `src/features/financial/lib/financialAggregates.ts`
  (`buildAppFinancialAggregates`) monta os estados via adaptador oficial.
- Edge: `supabase/functions/_shared/financial-aggregates.ts`
  (`buildAggregatesFromRows`) monta os estados a partir das linhas do banco,
  usando a alocação oficial `allocateInterestByPayment`.

## 3. Definições oficiais (matriz de métricas)

`src/features/financial/lib/financialMetricsMatrix.ts` documenta cada
indicador: definição, fórmula, se inclui encargos de atraso, se inclui vendas,
regime (caixa × competência), consumidores e ambiguidades conhecidas.

```
principalRemaining (capital ativo) = Σ max(0, principal − principal pago)   [ativos]
contractualInterestRemaining       = Σ max(0, juros do plano − juros pagos)
interestAndFeesPending             = juros restantes + multa + juros de atraso
totalReceivable                    = Σ payoff dos contratos ativos
receivedInPeriod                   = Σ pagamentos com data ∈ [início, fim]  (caixa)
realizedProfitInPeriod             = Σ (juros + multa + juros atraso) recebidos
revenueInPeriodWithSales           = receivedInPeriod + vendas do período
```

Regras invioláveis mantidas: multa e juros de atraso nunca abatem principal ou
juros contratuais; principal restante nunca excede o valor emprestado; vendas
de produtos só aparecem no indicador que declara incluir vendas.

## 4. Período

`getPeriodBounds(kind, anchor)` e `isDateInsidePeriod(dateIso, bounds)`:
limites em texto ISO `YYYY-MM-DD`, **início e fim inclusivos**, semana
começando no domingo (regra atual do Dashboard). Sem `Date` local, sem fuso.

## 5. Feature flags (default: OFF)

| Flag | Efeito |
|---|---|
| `VITE_USE_UNIFIED_FINANCIAL_CALCULATION` | liga tudo (contratos + agregados) |
| `VITE_USE_UNIFIED_DASHBOARD` | só Dashboard (carteira, capital ativo, total a receber, lucro estimado) |
| `VITE_USE_UNIFIED_GOALS` | só Metas (capital ativo da pontuação) |
| `VITE_USE_UNIFIED_REPORTS` | relatórios internos/exportados |
| `USE_UNIFIED_REPORTS` (Edge/env) | relatórios e Telegram (`reports-commands`) |
| `VITE_FINANCIAL_DIFF_DIAGNOSTICS` | painel de diagnóstico e paridade |

`resolveFinancialFlags()` é o único lugar que lê as flags no frontend.
Desligar a flag restaura instantaneamente os números anteriores.

## 6. Paridade entre módulos (somente leitura)

`src/features/financial/lib/financialModuleParity.ts` +
`FinancialParitySection` (exibido em `/diagnostico-financeiro`):
mostra, lado a lado, o que Dashboard, Metas e Relatórios/Telegram exibiriam
contra a agregação oficial, com Δ por métrica, tolerância de R$ 0,01, avisos e
export CSV. Nenhum botão grava, corrige ou recalcula dados.

## 7. Próximos passos

1. Observar paridade por alguns dias com `VITE_FINANCIAL_DIFF_DIAGNOSTICS=true`.
2. Ligar `VITE_USE_UNIFIED_DASHBOARD` em preview e comparar com produção.
3. Ligar Metas, depois Relatórios/Telegram (`USE_UNIFIED_REPORTS`).
4. Só após paridade estável em todos os módulos: avaliar backfill dos caches
   (`remaining_amount`, `paid_installments`) — hoje tratados como cache
   validável, nunca como verdade.
