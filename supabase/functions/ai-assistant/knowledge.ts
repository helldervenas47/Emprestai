/**
 * Base de conhecimento de domínio do assistente EmprestAI.
 *
 * Regras de negócio em texto — NUNCA números reais. Todo valor citado ao
 * usuário vem de uma tool (dados reais via RLS), nunca destes documentos.
 */

import type { KnowledgeDomain } from "./pure.ts";

export const KNOWLEDGE: Record<KnowledgeDomain, string> = {
  architecture: `# Arquitetura e origem dos dados
- App: React 18 + TypeScript + Vite, PWA. Backend: Supabase (projeto externo syyxnqzxqabeuqbuptkh).
- Todo acesso a dados passa por RLS. O assistente usa o JWT do próprio usuário: só enxerga o que o usuário enxerga no app.
- Escopo dos dados: \`data_owner_id\` (RPC get_data_owner_id). Colaboradores compartilham o owner do titular.
- Fonte única de cálculo financeiro: _shared/financial-aggregates-core.ts (buildFinancialAggregates) e
  _shared/interest-allocation.ts (alocação de juros por pagamento). Nunca recalcule fora dessas fontes.
- Tabelas principais: loans, payments, clients, incomes, expenses, credit_cards, products, product_sales,
  payrolls, goals, account_ledger, piggy_banks, subscriptions, user_roles, system_telegram_bots.
- Modos: Pessoal e Empresa. Despesas/receitas são segregadas por modo; faturas de cartão não entram no extrato.`,

  dashboard: `# Dashboard
- "Saldo em Conta": receitas − despesas do modo ativo, mais movimentações do account_ledger e cofrinhos; exclui pagamentos de fatura de cartão.
- "Valores Recebidos": soma dos pagamentos recebidos no período (principal + juros + multa + juros de atraso).
- "Capital ativo / na rua": principal contratado ainda não amortizado dos contratos ativos.
- "Total a receber": soma dos payoffs dos contratos ativos (principal restante + juros restantes + multa + juros de atraso).
- "Lucro realizado": juros + multa + juros de atraso efetivamente recebidos no período (nunca inclui principal).
- Juros pendentes têm subtotal separado de vencido e a vencer.
- Cards suportam até 9 dígitos e usam container queries (ajustam com a sidebar recolhida/expandida).`,

  loans: `# Empréstimos
- Contrato: valor emprestado (amount), taxa mensal (interest_rate), número de parcelas (installments), status (active/paid/overdue).
- Total com juros = amount × (1 + interest_rate/100) para contrato de parcela única; parcelado usa o cronograma oficial (buildInstallmentBreakdown).
- Principal restante = valor emprestado − principal efetivamente pago. NUNCA maior que o valor original.
- Juros do ciclo atual = juros pendentes apenas da parcela corrente, nunca o total do contrato.
- Contrato vencido: due_date < hoje e saldo > 0. Dias de atraso contam a partir do vencimento.
- Limite de crédito do cliente considera o principal em aberto (amortização estrita), não o total contratado.
- Renegociação gera novo contrato mantendo original_amount para rastreio.`,

  "loan-payments": `# Pagamentos de empréstimo (Payment Hub)
- Modalidades: pagamento de parcela, pagamento parcial, pagamento só de juros, quitação total.
- Ordem oficial de alocação de um pagamento: multa → juros de atraso → juros contratuais → principal.
- Pagamento parcial rateia pró-rata pelo saldo remanescente (ALLOCATION_VERSION_REMAINING_PRORATA).
- Quitação: saldo sugerido = principal restante + juros restantes + multa pendente + juros de atraso pendentes.
- O resumo do contrato precisa fechar linha a linha com o saldo sugerido.
- Multa e juros de atraso NÃO entram nos cálculos básicos de juros contratuais.`,

  sales: `# Vendas de produtos
- Produtos têm custo, preço de venda e estoque. Vendas (product_sales) geram recebimento separado da carteira de empréstimos.
- Lucro da venda = preço de venda − custo do produto.
- Recebimentos de venda entram em "receita com vendas" e só se misturam com empréstimos na métrica de receita total do período.`,

  income: `# Receitas
- Receitas manuais e recorrentes, segregadas por modo (Pessoal/Empresa).
- Receitas recorrentes projetam parcelas futuras; a exclusão pode ser da ocorrência, das futuras ou de toda a série.
- Pagamentos de empréstimo não são lançados como receita manual — são recebimentos da carteira.`,

  expenses: `# Despesas e cartões
- Despesas por categoria, com suporte a parcelamento e recorrência. Parceladas projetam todas as parcelas futuras (installments − paidInstallments).
- Cartões de crédito têm fatura mensal; pagamentos de fatura (credit_card_invoice_payment) NÃO aparecem no extrato nem no saldo.
- Cartões são ordenados pelo valor da fatura atual.
- Mini-cards de status (pago, a pagar, atrasado) são clicáveis e listam os registros considerados.`,

  payroll: `# Folha de pagamento
- payrolls guarda salário base, benefícios, adiantamentos, descontos e comissões por funcionário/competência.
- Comissões por gerente aparecem no Dashboard em card recolhível.
- Líquido = base + benefícios + comissão − adiantamentos − descontos.`,

  goals: `# Metas
- Metas por período (mês, trimestre, semestre, ano) com pontuação e evolução dia a dia.
- Progresso usa os mesmos agregados oficiais do Dashboard — nunca uma soma paralela.
- Clicar no gráfico abre a estratificação diária da meta.`,

  reports: `# Relatórios
- Três relatórios centrais: KPIs gerais, resumo do dia e inadimplência.
- Todos usam _shared/interest-allocation.ts + financial-aggregates-core.ts, garantindo paridade com o Dashboard.
- Exportações em JSON e CSV (financialReportToJson / financialReportToCsv).`,

  telegram: `# Telegram
- Bots ficam em system_telegram_bots; a arquitetura é unificada por webhook (telegram-webhook).
- Vínculo do usuário por código de link (telegramLinkCode).
- O bot registra despesas e consulta indicadores usando os mesmos agregados oficiais.
- Tokens de bot nunca são exibidos ao usuário.`,

  "piggy-banks": `# Cofrinhos
- Reservas com aportes, resgates e rendimento (% do CDI). Compõem o Saldo em Conta.
- Rendimento é projetado, não é receita realizada até o resgate.`,

  calendar: `# Calendário / Cobranças
- Mostra vencimentos por dia com filtro de mês (navegação por chevrons; clicar no mês volta ao mês atual).
- O card de atrasado respeita o filtro de mês selecionado.`,

  subscriptions: `# Planos e assinaturas
- Assinaturas via Asaas (PIX). Webhook asaas-webhook atualiza status e dias restantes.
- Sem plano ativo, o app entra em bloqueio global: Calendário, Empréstimos e Cadastros ficam bloqueados como as demais abas.
- Administradores podem liberar acesso e gerenciar dias manualmente em Sistema → Administração → Liberação de Planos.`,

  admin: `# Administração
- Papéis ficam em user_roles (nunca no perfil). Verificação por função security definer has_role.
- Matriz de papéis e permissões em Sistema → Administração.
- Nome de usuário (login) é único; login aceita e-mail ou username.`,

  faq: `# Uso geral
- O assistente responde sobre como usar o app e sobre os dados reais do usuário.
- Quando faltar informação, ele pergunta antes de supor. Quando não houver registros, ele diz que não encontrou — nunca inventa números.`,
};

export function buildKnowledgeBlock(domains: KnowledgeDomain[]): string {
  return domains.map((d) => KNOWLEDGE[d]).filter(Boolean).join("\n\n---\n\n");
}
