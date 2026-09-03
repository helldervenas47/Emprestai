# Fase 5 — Validação operacional, ativação gradual e estabilização

Versão de cálculo: `unified_financial_v1`
Branch: `fix/unified-financial-phase-5`
Status: **infraestrutura operacional entregue; rollout NÃO iniciado.**

> Nenhum dado histórico foi alterado. Nenhum backfill foi executado. Nenhuma
> migration de escrita foi executada. Todas as flags financeiras continuam
> desligadas.

---

## 1. O que esta fase entrega

A Fase 5 **não cria fórmulas novas**. Ela transforma a arquitetura das Fases 1–4
em uma implantação auditável, adicionando as camadas que faltavam para provar a
migração com dados reais:

| Arquivo | Responsabilidade |
| --- | --- |
| `src/features/financial/lib/financialBaseline.ts` | Linha de base legada (`baseline_legacy_<data>_<commit>`), captura por módulo e comparação com a flag ligada |
| `src/features/financial/lib/financialRolloutStages.ts` | Ordem obrigatória das 7 etapas, portões por etapa, janela mínima de observação, allowlist registrada, decisão de avanço percentual |
| `src/features/financial/lib/financialIncidents.ts` | Classificação de divergências (11 causas), critérios de pausa imediata, registro de incidentes, teste de rollback, decisão do backfill |
| `src/features/financial/lib/financialPhase5Report.ts` | Ficha de revisão dos contratos críticos e relatório consolidado de evidências |
| `src/features/loans/components/diagnostics/FinancialPhase5Section.tsx` | Painel somente leitura em `/diagnostico-financeiro` |
| `src/features/financial/lib/__tests__/phase5Rollout.test.ts` | 44 testes novos (nenhum teste anterior removido) |

Todas as funções de decisão são **puras**: elas dizem se algo *pode* ser ligado,
nunca ligam. Nenhum arquivo desta fase executa SQL.

---

## 2. Ambiente e pré-condição do painel

O painel exibe, no topo da seção Fase 5:

- branch, ambiente (`preview` / `production`), versão de cálculo;
- commit e data do build (`VITE_VERCEL_GIT_COMMIT_SHA`, `VITE_BUILD_DATE`);
- estado e origem de cada uma das 6 flags (`explicit`, `inherited_global`,
  `default_off`, `edge_runtime`) e o escopo (`build-time` × `edge-runtime`).

Regra: **não iniciar a análise se o painel não refletir o ambiente esperado com
todas as flags OFF.** O acesso continua restrito a admin ou dev/preview.

---

## 3. Linha de base legada

Antes de ligar qualquer flag é obrigatório capturar a linha de base dos 7
módulos: Empréstimos, Payment Hub, Dashboard, Metas, Relatórios, Exportações e
Telegram. Para cada módulo registram-se valores exibidos, tempo de carregamento,
número de queries, warnings, erros, resposta das Edge Functions e artefatos
gerados.

O identificador segue o padrão oficial:

```text
baseline_legacy_20260726_<commit12>
```

Enquanto `baseline.complete === false`, **todas as etapas ficam bloqueadas** —
isso é verificado por `evaluateStageGates`.

Tolerâncias da comparação linha de base × flag ligada:

| Diferença | Status |
| --- | --- |
| ≤ R$ 0,01 | OK |
| > R$ 0,01 e ≤ R$ 10,00 | WARNING |
| > R$ 10,00 | CRITICAL |

Diferenças de formatação não entram na comparação: apenas números.

---

## 4. Base real e classificação

O diagnóstico continua somente leitura e produz, por contrato:
classificação operacional (`SAFE_TO_ENABLE`, `SAFE_WITH_LEGACY_FALLBACK`,
`CACHE_ONLY_DIVERGENCE`, `REQUIRES_MANUAL_REVIEW`,
`HISTORICAL_DATA_INCONSISTENCY`, `POSSIBLE_CALCULATION_DEFECT`,
`BLOCKED_FROM_MIGRATION`), severidade, diferença legado × unificado, cache
armazenado × calculado e marcadores (sem metadata, cronograma incompleto,
renegociado, saldo negativo, quitado com saldo).

Exportações disponíveis: CSV e JSON da validação, CSV das fichas críticas e JSON
do relatório consolidado da fase.

---

## 5. Revisão obrigatória dos contratos críticos

`buildCriticalReviewRecords` gera uma ficha para todo contrato CRITICAL,
bloqueado, com possível defeito de cálculo ou inconsistência histórica, com:
loan_id, status, tipo de divergência, valor legado, valor unificado, diferença,
pagamentos envolvidos, metadata, cronograma, cache armazenado, cache calculado,
risco financeiro, causa provável e ação recomendada.

Decisões possíveis: `APPROVED`, `APPROVED_WITH_FALLBACK`, `BLOCKED`,
`DATA_FIX_REQUIRED`, `CALCULATION_FIX_REQUIRED`, `IGNORED_WITH_JUSTIFICATION`.

`evaluateCriticalReviewStatus` só devolve `allDecided: true` quando **nenhuma**
ficha está sem decisão. `BLOCKED` e `CALCULATION_FIX_REQUIRED` aparecem como
bloqueadores. Se surgir um possível erro de cálculo, o rollout para e o caso é
tratado fora desta fase.

---

## 6. Casos históricos

Os casos **Wendel Cerqueira** (principal R$ 1.000, total R$ 1.200, multa R$ 300,
pagamentos de R$ 200 e R$ 1.200, saldo esperado R$ 100) e **Antonio Carlos**
(juros exibidos R$ 4.080 × soma R$ 4.880) permanecem cobertos pelos testes da
Fase 4 (`phase4Rollout.test.ts`) e continuam listados na amostragem exaustiva do
painel (grupos `CRITICAL` e `SETTLED_DIVERGENT`).

Invariantes reafirmadas e testadas: principal restante nunca acima do principal
original; multa não amortiza principal; pagamento de juros não amortiza
principal; multa paga não reaparece; saldo nunca negativo.

A conferência com os registros reais depende de rodar o painel em preview com a
base do tenant — ela é registrada nas fichas críticas exportadas.

---

## 7. Amostragem manual

O painel monta o plano de amostragem: 10 contratos por grupo (sem pagamentos,
parcialmente pagos, parcelados, com juros pagos, amortizados, com multa, com
juros de atraso, quitados) e **exaustivo** para renegociados, quitados
divergentes e CRITICAL. Quando um grupo tem menos de 10, todos são analisados.

---

## 8. Ordem obrigatória de ativação

```text
1 Empréstimos   → VITE_USE_UNIFIED_FINANCIAL_CALCULATION   (build-time)
2 Payment Hub   → VITE_USE_UNIFIED_FINANCIAL_CALCULATION   (build-time)
3 Dashboard     → VITE_USE_UNIFIED_DASHBOARD               (build-time)
4 Metas         → VITE_USE_UNIFIED_GOALS                   (build-time)
5 Relatórios    → VITE_USE_UNIFIED_REPORTS                 (build-time)
6 Exportações   → VITE_USE_UNIFIED_REPORTS                 (build-time)
7 Telegram      → USE_UNIFIED_REPORTS                      (edge-runtime)
```

Cada etapa só é liberada quando: a linha de base está completa, a prontidão real
está aprovada e **todas as etapas anteriores estão aprovadas**. A aprovação de
uma etapa exige 8 checks: validação funcional, validação financeira (R$ 0,01),
paridade, performance, logs, alertas, rollback da etapa e aprovação manual.

Início sempre por **allowlist explícita** (admin, conta de teste, internos), nunca
direto por percentual. Cada inclusão registra hash do usuário, data, ambiente,
flags, responsável, motivo e resultado — o `user_id` nunca é gravado em claro.

---

## 9. Janela de observação e percentuais

| Nível | Dias úteis mínimos | Alternativa por volume |
| --- | --- | --- |
| Allowlist | 1 | 50 contratos, 20 Payment Hub, 10 pagamentos, 20 dashboards, 10 relatórios, 5 Telegram |
| 5% | 2 | idem |
| 25% | 3 | idem |
| 50% | 5 | idem |
| 100% | aprovação formal | — |

`evaluatePercentageAdvance` só autoriza o avanço com janela satisfeita, zero
incidente crítico, zero cobrança indevida, zero saldo negativo, zero contrato
quitado reaparecendo, paridade ≤ R$ 0,01, taxa de erro estável, performance
aceitável, todas as etapas aprovadas e aprovação manual. O avanço nunca é
automático e `mergeAllowlist` garante que aumentar o percentual **não remove**
quem já estava incluído.

---

## 10. Paridade entre módulos

`compareModuleParity` (Fase 3) roda após cada etapa e o painel mostra métrica,
período, valor oficial e valor de cada módulo. Critérios: OK ≤ R$ 0,01, WARNING
até R$ 10,00, CRITICAL acima disso ou com risco financeiro. Métricas com nome
parecido e definição diferente são documentadas, não forçadas à igualdade.

---

## 11. Critérios de pausa imediata

Disparam pausa (e rollback quando houver risco financeiro direto): cobrança
acima do saldo real, saldo negativo indevido, contrato quitado com saldo
positivo, divergência prévia × persistência, pagamento duplicado, principal
amortizado incorretamente, multa reaparecendo, juros pagos reaparecendo,
Dashboard × Telegram acima de R$ 0,01, aumento de erros acima de 2 p.p., timeout
de Edge Function e tempo de carregamento acima de 1,5× a linha de base.

Cada ocorrência gera um `IncidentRecord` (etapa, critérios, severidade,
divergências, ação) antes de qualquer nova tentativa.

Causas de divergência classificáveis: `DATA_ISSUE`, `CACHE_ISSUE`,
`LEGACY_BEHAVIOR`, `METRIC_DEFINITION`, `ROUNDING`, `TIMEZONE`, `PERIOD_FILTER`,
`CALCULATION_DEFECT`, `UI_MAPPING`, `EDGE_MAPPING`, `UNKNOWN`. `CALCULATION_DEFECT`,
`UNKNOWN` e impacto acima de R$ 10,00 bloqueiam o rollout.

---

## 12. Rollback

`evaluateRollbackTest` valida o rollback real de cada etapa: valores voltam ao
legado, nenhum dado histórico muda, módulo continua funcional e o escopo é
coerente (build-time exige redeploy; `USE_UNIFIED_REPORTS` do Telegram deve
voltar **sem deploy**). O resultado registra passos, duração e falhas.

---

## 13. Backfill — decisão, nunca execução

O dry-run real continua disponível no painel (elegíveis, bloqueados, soma das
alterações, maior alteração, renegociados e críticos excluídos, conflitos).
`evaluateBackfillApproval` recomenda `APPROVE` somente com: lógica unificada
estável em produção, rollout 100% concluído, estabilização encerrada, caches
deixando de ser fonte absoluta, todos os elegíveis em `CACHE_ONLY_DIVERGENCE`,
nenhum warning crítico, rollback testado, tabela de auditoria revisada e lote
piloto definido (10 contratos, depois 50 por lote).

Hoje a recomendação é **BLOCK** — o backfill segue pendente de aprovação
explícita. `financial_cache_backfill_audit.sql` continua **não executado**.

---

## 14. Legado preservado

Mesmo após 100% de ativação permanecem disponíveis: cálculo legado, flags,
comparadores, painel de diagnóstico, eventos de observabilidade, fallback e
rollback. A remoção do legado é uma fase separada.

---

## 15. Estado atual das evidências

| Item | Situação |
| --- | --- |
| Infraestrutura de validação, etapas, incidentes, rollback e relatório | Entregue |
| Linha de base legada | Pendente de captura em preview com a base real |
| Contratos críticos | Fichas geradas automaticamente; decisões pendentes |
| Etapas 1–7 | Todas bloqueadas (linha de base + prontidão pendentes) |
| Allowlist | Vazia |
| Rollout percentual | Não iniciado |
| Rollback | A comprovar por etapa |
| Backfill | Dry-run disponível; recomendação BLOCK |
| Testes | 44 novos, todos passando; nenhum teste anterior removido |

A Fase 5 só pode ser declarada concluída quando
`report.completionBlockers` estiver vazio no painel — hoje ele lista as
pendências acima.
