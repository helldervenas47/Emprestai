---
trigger: model_decision
---

# Regras Financeiras — Emprestaii

Esta regra deve ser aplicada sempre que uma alteração envolver:

* Empréstimos
* Parcelas
* Juros
* Multas
* Pagamentos
* Amortizações
* Inadimplência
* Receitas
* Despesas
* Cartões de crédito
* Faturas
* Saldos
* Fluxo de caixa
* Metas financeiras
* Patrimônio
* Dashboard financeiro
* Indicadores financeiros

## Princípio central

O valor exibido na interface deve representar corretamente os dados e regras armazenados no sistema.

Nunca corrija apenas a interface para mascarar um problema de cálculo ou de banco de dados.

Antes de corrigir um valor incorreto, determine se o problema está:

1. na origem dos dados;
2. no banco;
3. na consulta;
4. no cálculo;
5. no estado/cache;
6. no componente;
7. na formatação;
8. na sincronização.

## Empréstimos

Preserve as regras existentes para:

* principal;
* juros;
* parcelas;
* pagamentos;
* pagamentos parciais;
* amortização;
* juros avulsos;
* juros de ciclo;
* multas;
* saldo devedor;
* valor recebido;
* valor a receber;
* inadimplência.

Não altere a lógica de distribuição de juros sem analisar primeiro as funções existentes de cálculo e distribuição.

Quando houver pagamentos parciais, verifique sempre:

* saldo anterior;
* valor pago;
* saldo restante;
* juros;
* principal;
* parcela afetada;
* histórico de pagamentos.

## Parcelas

O número da parcela deve representar corretamente o ciclo da obrigação.

Não permita que pagamentos parciais, pagamentos antecipados ou parcelas não pagas causem duplicação ou avanço incorreto do contador.

Sempre valide:

* parcela atual;
* parcelas pagas;
* parcelas restantes;
* total de parcelas;
* vencimento;
* status.

## Cartões de crédito

Ao alterar faturas ou despesas de cartão:

1. Verifique data da compra.
2. Verifique data de fechamento.
3. Verifique vencimento.
4. Verifique número da parcela.
5. Verifique fatura correspondente.
6. Verifique se a despesa já está sendo considerada em outro cálculo.
7. Verifique se existe risco de dupla contagem.

Nunca inclua uma despesa em uma fatura apenas com base no mês do vencimento.

## Receitas e despesas

Diferencie claramente:

* registrado;
* previsto;
* vencido;
* vencendo hoje;
* pago;
* parcialmente pago;
* cancelado.

Não trate um registro pago como pendente.

Não trate uma fatura de cartão como uma nova despesa quando o sistema já considera suas despesas individuais.

Evite dupla contagem em:

* dashboard;
* gráficos;
* fluxo de caixa;
* totais mensais;
* relatórios;
* metas.

## Datas

Use a mesma lógica de timezone e comparação de datas já utilizada pelo projeto.

Nunca altere uma data para corrigir um problema de exibição sem investigar primeiro a origem.

Ao trabalhar com vencimento, fechamento ou competência, diferencie:

* data do lançamento;
* data de vencimento;
* data de pagamento;
* data de fechamento;
* mês de competência.

## Metas e indicadores

Indicadores históricos devem representar o resultado que existia naquele período.

Não altere retroativamente um indicador histórico simplesmente porque um evento atual modificou o banco.

Antes de alterar indicadores históricos, determine se o sistema trabalha com:

* snapshot histórico;
* cálculo dinâmico;
* competência;
* data de pagamento;
* data de vencimento.

## Regra de dupla contagem

Sempre procure por possíveis duplicações antes de alterar totais financeiros.

Exemplos:

* despesa + fatura;
* salário + bônus;
* parcela + pagamento;
* juros + pagamento;
* venda + receita;
* cartão + despesa individual.

Se o mesmo evento financeiro estiver sendo contabilizado em dois lugares, corrija a origem da duplicação em vez de simplesmente subtrair o valor no dashboard.

## Validação

Para qualquer alteração financeira, teste pelo menos:

* valor zero;
* valor positivo;
* valor negativo quando aplicável;
* pagamento integral;
* pagamento parcial;
* múltiplas parcelas;
* primeira parcela;
* última parcela;
* registro vencido;
* registro pago;
* registro cancelado;
* datas de fechamento e vencimento quando aplicável.

Nunca considere uma alteração financeira concluída sem verificar possíveis regressões.
