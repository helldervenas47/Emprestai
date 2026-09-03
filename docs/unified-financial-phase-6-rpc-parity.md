# RPC `dashboard_loan_totals` — Etapa 2: correção e validação de paridade

> Status: **RPC V3 implementada e coberta por testes; substituição dos cards AINDA NÃO liberada** (depende da instalação no Supabase oficial e da execução do harness por contrato com dados reais).
> Nenhuma consulta antiga foi removida. O layout do Dashboard não foi alterado.

Arquivo SQL: `supabase/sql/dashboard_loan_totals_v3.sql`
Núcleo TS espelhado: `src/services/dashboardLoanTotalsCore.ts`

---

## 1. Fórmula final de cada métrica

| Campo | Fórmula oficial aplicada |
|---|---|
| `emprestado` | Σ `loans.amount` cujo `start_date` ∈ [início, fim] |
| `emprestado_total` | Σ `loans.amount` (todo o histórico) |
| `capital_ativo` | Σ `amount × (installments − min(paid_installments, installments)) / installments`, apenas contratos `status <> 'paid'` (capital na rua, proporcional) |
| `receber` | Σ `max(0, base_remaining + encargos)` dos contratos ativos, onde `base_remaining` = `remaining_amount` (se > 0) → soma das parcelas em aberto (parcelados) → `max(0, round(amount×(1+taxa/100)) − pago)` |
| `multas_pendentes` | juros de atraso (fixo/dia ou % da base/dia) + multa fixa + multa de renegociação (só parcela única) |
| `juros_recebidos` | Σ juros dos pagamentos do período pela **alocação oficial** (`allocateInterestByPayment`) |
| `principal_recebido` | Σ (valor do pagamento − juros alocado) no período |
| `total_recebido_periodo` | Σ `payments.amount` no período |
| `juros_receber` | **regra oficial atual do card, preservada**: `receber − capital_ativo` |
| `juros_contratados` *(novo)* | Σ juros do cronograma (`buildInstallmentBreakdown`) dos contratos ativos — inclui multa de renegociação diluída |
| `juros_pendentes` *(novo)* | `max(0, juros_contratados − juros já recebidos)` por contrato ativo |
| `juros_receber_spec` *(novo)* | leitura literal da especificação: `receber − Σ amount dos contratos ativos` |
| `taxa_juros_media` | média ponderada por valor, ignorando contratos com taxa 0% |
| `reference_date` *(novo)* | data única no fuso do app |

### Sobre “juros a receber”
As duas fórmulas **não são equivalentes** e por isso não foram unificadas:

* `receber − capital_ativo` (regra oficial exibida hoje) desconta apenas o principal **ainda na rua**, proporcional às parcelas em aberto;
* `receber − valor emprestado` (especificação original) desconta o principal **total do contrato**, mesmo o já amortizado.

Decisão: o card existente continua com `juros_receber` (`receber − capital_ativo`) — nenhum significado foi alterado silenciosamente. As outras leituras ficam disponíveis em campos novos (`juros_receber_spec`, `juros_contratados`, `juros_pendentes`), sem uso na UI.

---

## 2. Diferenças encontradas entre SQL (V2) e frontend, e o que mudou na V3

| # | Divergência da V2 | Correção na V3 |
|---|---|---|
| 1 | Juros recebidos por rateio simplificado (`taxa do contrato`) | Reimplementada a alocação oficial pagamento a pagamento (`public.loan_interest_allocation`) |
| 2 | `CURRENT_DATE` (UTC) nas multas diárias | Data única `public.app_reference_date(owner)` — `now() AT TIME ZONE 'America/Sao_Paulo'`, ou o fuso salvo em `account_settings.timezone` |
| 3 | `juros_receber` sem definição formal | Documentado + campos separados `juros_contratados` / `juros_pendentes` / `juros_receber_spec` |
| 4 | Só existia comparação agregada | Nova RPC `dashboard_loan_totals_by_loan` + diff por contrato no frontend |
| 5 | Pagamentos com valores persistidos ignorados | `metadata.interest_amount` / `principal_amount` e `allocation_version` respeitados |

---

## 3. Como pagamentos legados e novos são tratados

Ordem determinística: `date → created_at → id` (idêntica ao TS).

1. `allocation_version = 'remaining_balance_prorata'` + `interest_amount`/`principal_amount` válidos (ambos ≥ 0 e somando o valor ± R$ 0,01) → **valor persistido é definitivo**.
2. Mesmo marcador com valores ausentes/inválidos → **não recalcula em silêncio**: cai na regra legada (juros primeiro), igual ao frontend.
3. Sem marcador, mas com `interest_amount` persistido → honra o persistido.
4. Legado puro (`installment_number = -1`) → “juros primeiro” contra o saldo de juros remanescente.
5. Juros avulsos (`0` e `-2`) → 100% juros; amortização (`-3`) → 0% juros.
6. Parcela regular de contrato parcelado → juros do cronograma real (valores efetivamente pagos por parcela), com cap no saldo de juros remanescente.
7. Contrato de parcela única → excedente sobre o principal remanescente é juros.
8. Contratos `paid` → reconciliação final: o resíduo de juros contratado é atribuído ao último pagamento, limitado ao próprio valor pago (payoff de várias parcelas, resíduo de centavos, multa diluída).

Nenhum pagamento histórico é recalculado, alterado ou gravado — as funções são `STABLE`, somente leitura.

---

## 4. Fuso horário

* `public.app_reference_date(_owner)` devolve a data “hoje” no fuso do app.
* A data é calculada **uma única vez por chamada** e propagada para atraso, multas diárias e contagem de atrasados (`dashboard_loan_metrics`).
* A RPC devolve `reference_date` para permitir auditoria/conferência com `todayInAppTz()` no frontend.
* Teste dedicado cobre a virada de dia UTC × America/São Paulo (não antecipa multa).

---

## 5. Validação por contrato (modo diagnóstico)

* RPC: `public.dashboard_loan_totals_by_loan(_start, _end)` — id, cliente, emprestado, principal recebido, juros recebidos, multas, capital ativo, a receber, juros contratados, juros pendentes.
* Frontend: `computeDashboardLoanMetrics` + `diffDashboardLoanRows` (tolerância R$ 0,01, sem compensação entre contratos).
* UI: `DashboardRpcParitySection`, dentro do painel de migração (`/painel-migracao`), somente leitura. Nome do cliente aparece apenas em desenvolvimento.

### Egress
`useDashboardLoanTotalsRpc` só executa quando `dashboardRpcHarnessEnabled()` é verdadeiro:
`import.meta.env.DEV` **ou** `VITE_FINANCIAL_DIFF_DIAGNOSTICS=true` **e** papel administrativo. Em produção, para usuários finais, nenhuma chamada extra é feita.

---

## 6. Resultado dos testes

* `src/services/__tests__/dashboardLoanTotalsCore.test.ts` — 16 testes ✅
* `src/services/__tests__/dashboardLoanTotalsParity.test.ts` — 13 testes ✅ (parcial legado, parcial pró-rata persistido, metadata inválido, juros avulsos, amortização, quitação com desconto, pagamento acima do contratado, multa fixa, multa diária percentual, atraso de 1 dia, virada de fuso, renegociação, parcelado, taxa 0%, não compensação entre contratos)
* Suíte total: sem regressões (apenas os smoke tests pesados de import estouram o tempo no sandbox — comportamento pré-existente, sem relação com esta etapa).

Contratos comparados com dados reais: **0 até o momento** — depende da instalação da V3 no Supabase e da execução do painel de paridade. Maior divergência observada: **não medida ainda**.

---

## 7. Critérios de liberação (checklist)

| Critério | Status |
|---|---|
| Regra de “juros a receber” formalmente definida | ✅ |
| Alocação histórica preservada | ✅ (paridade 1:1 com `allocateInterestByPayment`) |
| Fuso das multas consistente | ✅ |
| Harness sem custo em produção | ✅ |
| Todos os testes passando | ✅ |
| RPC instalada no Supabase oficial | ⛔ pendente (aplicar `dashboard_loan_totals_v3.sql`) |
| Diferença agregada ≤ R$ 0,01 com dados reais | ⛔ pendente |
| Nenhum contrato individual divergente | ⛔ pendente |

**Conclusão: a RPC ainda NÃO está liberada para substituir as consultas antigas.**

---

## 8. Consultas removíveis na próxima etapa (após aprovação)

Somente quando o painel de paridade fechar zerado por alguns dias:

* download completo de `loans`, `payments` e `loan_installments` usado exclusivamente pelos cards agregados do Dashboard (`useLoans` → `useDashboardMetrics`, trechos de `portfolio`/`incomeFromPayments`);
* cálculo duplicado de `capitalOnStreet`, `pendingReceivable` e juros do período em `useDashboardMetrics.ts`;
* `supabase/sql/p0_03_dashboard_loan_totals.sql` e `dashboard_loan_totals_v2.sql` (substituídos pela V3).

Nada disso foi tocado nesta etapa.
