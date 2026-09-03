# Fase 4 — Validação com dados reais, ativação gradual e backfill controlado

> Status: arquitetura de implantação entregue. **Todas as flags continuam desligadas por
> padrão, nenhum backfill foi executado e nenhum dado histórico foi alterado.**

Versão oficial do cálculo: `unified_financial_v1` (`src/features/financial/lib/financialVersion.ts`).

## 1. Escopo e arquivos

| Arquivo | Papel |
| --- | --- |
| `src/features/financial/lib/financialVersion.ts` | Versão explícita + metadados de build (ambiente, commit, data) |
| `src/features/financial/lib/financialFlagInventory.ts` | `FinancialFeatureFlagState`, valor efetivo, origem e escopo de cada flag |
| `src/features/financial/lib/financialRollout.ts` | `FinancialRolloutContext`, bucket determinístico, etapas de rollout |
| `src/features/financial/lib/financialObservability.ts` | Eventos estruturados, sanitização, alertas com deduplicação |
| `src/features/loans/lib/realLoanValidation.ts` | `RealLoanValidationRow`, classificação operacional, amostragem, prontidão, export CSV/JSON |
| `src/features/loans/lib/cacheBackfill.ts` | Dry-run, elegibilidade, lotes, concorrência otimista, rollback, validação pós-lote |
| `src/features/loans/components/diagnostics/FinancialRolloutValidationSection.tsx` | Seção “Validação para ativação” no painel `/diagnostico-financeiro` |
| `supabase/sql/financial_cache_backfill_audit.sql` | Tabela de auditoria append-only (**não executada**) |
| `src/features/loans/lib/__tests__/phase4Rollout.test.ts` | 54 testes de rollout, diagnóstico, backfill e benchmark |

Nenhum arquivo legado foi removido: `loanOutstanding`, `loanLateFees`, `currentCycleInterest`,
`financialDiagnostics`, `financialCalculationDiff` e o adaptador com flag seguem intactos.

## 2. Inventário de flags

| Flag | Escopo | Default |
| --- | --- | --- |
| `VITE_USE_UNIFIED_FINANCIAL_CALCULATION` | build-time | `false` |
| `VITE_USE_UNIFIED_DASHBOARD` | build-time | `false` |
| `VITE_USE_UNIFIED_GOALS` | build-time | `false` |
| `VITE_USE_UNIFIED_REPORTS` | build-time | `false` |
| `VITE_FINANCIAL_DIFF_DIAGNOSTICS` | build-time | `false` |
| `USE_UNIFIED_REPORTS` (Edge) | runtime | `false` |

O painel exibe valor efetivo, origem (`explicit`, `inherited_global`, `default_off`, `edge_runtime`),
ambiente, versão do cálculo, commit e data de build. Nenhum secret é lido ou exibido.

**Limitação documentada:** as flags `VITE_*` são build-time. O rollback delas exige redeploy
(procedimento: remover a variável no ambiente Vercel e redeployar o último build validado —
segundos, sem migração). A flag Edge `USE_UNIFIED_REPORTS` é runtime e reverte sem deploy.

## 3. Classificação operacional dos contratos

`buildRealLoanValidation` roda as duas regras por contrato e devolve uma das classes:

- `SAFE_TO_ENABLE` — diferença ≤ R$ 0,01, cache alinhado, sem warnings.
- `SAFE_WITH_LEGACY_FALLBACK` — pagamentos antigos sem metadata; fallback legado reproduz o esperado.
- `CACHE_ONLY_DIVERGENCE` — a diferença é integralmente explicada por `remaining_amount` /
  `paid_installments` desatualizados (a regra legada lê o cache; a unificada reconstrói o histórico).
- `REQUIRES_MANUAL_REVIEW` — diferença material, cronograma incompleto ou contrato renegociado.
- `HISTORICAL_DATA_INCONSISTENCY` — diferença pequena de origem histórica.
- `POSSIBLE_CALCULATION_DEFECT` — principal restante acima do valor emprestado.
- `BLOCKED_FROM_MIGRATION` — saldo negativo, quitado com saldo, pagamento duplicado,
  principal pago acima do original ou soma das alocações ≠ valor do pagamento.

Severidade: `INFO` / `WARNING` / `CRITICAL`. Toda a operação é somente leitura.

## 4. Amostragem manual obrigatória

`buildSamplingPlan` monta 10 grupos: sem pagamentos, parcialmente pagos, parcelados, com juros
pagos, amortizados, com multa, em atraso e — de forma **exaustiva** — renegociados, quitados
divergentes e todos os `CRITICAL`. Quando um grupo tem menos de 10 contratos, todos entram.

## 5. Casos históricos

- **Wendel Cerqueira** (principal 1.000, total 1.200, multa 300, parciais de 200 e 1.200):
  coberto por testes que garantem principal restante ≤ valor emprestado, ausência de saldo
  negativo e composição fechando `principal + juros + multa + juros de atraso = saldo`.
- **Antonio Carlos** (juros exibidos 4.080 × soma reportada 4.880): coberto por teste que garante
  que os juros restantes nunca excedem os juros contratuais do contrato — a diferença histórica
  vinha da soma de juros de parcelas futuras com juros já pagos na fonte antiga do card.

## 6. Checklist de prontidão

`evaluateFinancialRolloutReadiness` devolve `ready`, `score`, `blockers`, `warnings` e métricas
(`parityRate`, `cacheDivergenceRate`, contratos safe/blocked/critical). `ready` é `true` **somente**
quando não há blockers — o score nunca compensa um blocker absoluto. Blockers: saldo negativo,
quitado com saldo, pagamento duplicado, possível defeito de cálculo, `CRITICAL` sem revisão,
paridade < 99%, rollback não testado, testes falhando.

## 7. Rollout gradual

Ordem obrigatória em preview: Empréstimos → Payment Hub → Dashboard → Metas → Relatórios
internos → exportações → Telegram. Uma flag por etapa, com testes, painel de paridade,
amostragem e medição de performance entre etapas.

Em produção, `resolveFinancialRollout` decide por usuário: flag desligada e ambiente não
habilitado sempre mantêm o legado; allowlist ativa; percentual usa bucket determinístico
(FNV-1a sobre `versão:tenant:usuário`), então o mesmo usuário nunca alterna de grupo e aumentar
o percentual só adiciona usuários. Etapas: admin/teste → internos → 5% → 25% → 50% → 100%,
sem avanço automático.

Rollback: desligar a flag devolve imediatamente o comportamento legado (nenhum dado muda).

## 8. Observabilidade e alertas

Eventos: `financial_unified_calculation_used`, `financial_legacy_calculation_used`,
`financial_calculation_divergence`, `financial_module_parity_failure`,
`financial_payment_simulation_mismatch`, `financial_negative_balance_detected`,
`financial_settled_contract_positive_balance`, `financial_cache_divergence`,
`financial_rollout_flag_changed`, `financial_rollout_rollback`.

Todo payload passa por `sanitizeEventPayload`: nome, CPF/CNPJ, RG, telefone, e-mail, dados
bancários, token, JWT e segredos são removidos; o usuário aparece apenas como hash curto.

Alertas: diferença > R$ 10,00, saldo negativo, quitado com saldo, Payment Hub ≠ contrato,
Dashboard ≠ Telegram, soma de alocações ≠ pagamento, pico de warnings e pico de erros.
`shouldEmitAlert` deduplica o mesmo alerta por 5 minutos.

## 9. Métricas e performance

Acompanhar taxa de uso unificado × legado, taxa e valor das divergências, contratos bloqueados,
erros do Payment Hub, tempo de cálculo, tempo do Dashboard, erros das Edge Functions e falhas do
Telegram — antes e depois de cada etapa. O benchmark automatizado do teste roda carteiras de
10, 100 e 1.000 contratos (5.000 fica para execução manual em preview) sem N+1 nem recálculo por card.

## 10. Backfill dos caches (planejado, **não executado**)

`remaining_amount` e `paid_installments` seguem sendo caches derivados. Fluxo obrigatório:

1. `buildCacheBackfillDryRun` — nenhuma escrita, gera `batchId` estável, contagem de elegíveis e
   bloqueados, soma e maior diferença, export CSV/JSON.
2. Elegibilidade: somente `CACHE_ONLY_DIVERGENCE`, sem `CRITICAL`, sem saldo negativo, sem quitado
   com saldo, sem duplicidade, sem mismatch de alocação, sem cronograma incompleto e **nunca**
   renegociado.
3. Backup lógico em `financial_cache_backfill_audit` (append-only, sem UPDATE/DELETE por política).
4. `chunkBackfillBatches` em lotes de 50; `applyCacheBackfillBatch` exige `approved: true` e um
   `applier` externo — sem eles o status é `PLANNED` e nada é escrito.
5. Concorrência otimista: `updated_at`/valores diferentes do dry-run → `CONFLICT` (volta ao
   diagnóstico); valor já correto → `SKIPPED` (idempotência); erro isolado → `FAILED` sem
   interromper o lote.
6. `buildCacheBackfillRollbackPlan` restaura apenas os dois campos e somente se a linha ainda está
   no valor produzido pelo lote.
7. `validateAfterBackfill` confirma cache alinhado, estado financeiro inalterado, nenhum saldo
   negativo e nenhum contrato quitado reaparecendo.

## 11. Critérios de pausa imediata

Cobrança acima do saldo real, contrato quitado com saldo, saldo negativo, pagamento duplicado,
divergência entre prévia e persistência, Payment Hub ≠ contrato, aumento de erros, perda de
performance grave, Telegram divergente ou diferença não explicada acima do limite →
desligar a flag afetada (e redeployar, no caso das flags build-time).

## 12. Legado

Nada de legado foi removido nesta fase: cálculo antigo, adaptadores, flags, comparadores, painel
de diagnóstico e rollback permanecem disponíveis durante toda a estabilização. A remoção será
objeto de uma Fase 5 específica.
