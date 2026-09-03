// supabase/functions/ai-assistant/index.ts
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// supabase/functions/ai-assistant/external-supabase.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
var EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";
function required(name) {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(
      `[external-supabase] secret ${name} n\xE3o configurado. Configure-o em Settings \u2192 Secrets para apontar ao projeto externo (syyxnqzxqabeuqbuptkh).`
    );
  }
  return v;
}
function getExternalSupabaseUrl() {
  const external = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (external?.includes(EXTERNAL_PROJECT_REF)) return external;
  const nativeUrl = Deno.env.get("SUPABASE_URL");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF)) return nativeUrl;
  return `https://${EXTERNAL_PROJECT_REF}.supabase.co`;
}
function getExternalServiceRoleKey() {
  const external = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (external) return external;
  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;
  return required("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
}
function getExternalAnonKey() {
  const external = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (external) return external;
  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;
  return required("EXTERNAL_SUPABASE_ANON_KEY");
}
function getExternalAdmin() {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey(), {
    auth: {
      persistSession: false
    }
  });
}

// supabase/functions/ai-assistant/rate-limit.ts
async function checkRateLimit(opts) {
  try {
    const admin = getExternalAdmin();
    const { data, error } = await admin.rpc("check_rate_limit", {
      _bucket: opts.bucket,
      _key: opts.key,
      _max: opts.max,
      _window_secs: opts.windowSecs
    });
    if (error) {
      console.error("[rate-limit] rpc error", error);
      return true;
    }
    return data === true;
  } catch (e) {
    console.error("[rate-limit] exception", e);
    return true;
  }
}
function rateLimitResponse(corsHeaders2) {
  return new Response(
    JSON.stringify({ error: "Muitas requisi\xE7\xF5es. Aguarde alguns segundos e tente novamente." }),
    { status: 429, headers: { ...corsHeaders2, "Content-Type": "application/json" } }
  );
}

// supabase/functions/ai-assistant/knowledge.ts
var KNOWLEDGE = {
  architecture: `# Arquitetura e origem dos dados
- App: React 18 + TypeScript + Vite, PWA. Backend: Supabase (projeto externo syyxnqzxqabeuqbuptkh).
- Todo acesso a dados passa por RLS. O assistente usa o JWT do pr\xF3prio usu\xE1rio: s\xF3 enxerga o que o usu\xE1rio enxerga no app.
- Escopo dos dados: \`data_owner_id\` (RPC get_data_owner_id). Colaboradores compartilham o owner do titular.
- Fonte \xFAnica de c\xE1lculo financeiro: _shared/financial-aggregates-core.ts (buildFinancialAggregates) e
  _shared/interest-allocation.ts (aloca\xE7\xE3o de juros por pagamento). Nunca recalcule fora dessas fontes.
- Tabelas principais: loans, payments, clients, incomes, expenses, credit_cards, products, product_sales,
  payrolls, goals, account_ledger, piggy_banks, subscriptions, user_roles, system_telegram_bots.
- Modos: Pessoal e Empresa. Despesas/receitas s\xE3o segregadas por modo; faturas de cart\xE3o n\xE3o entram no extrato.`,
  dashboard: `# Dashboard
- "Saldo em Conta": receitas \u2212 despesas do modo ativo, mais movimenta\xE7\xF5es do account_ledger e cofrinhos; exclui pagamentos de fatura de cart\xE3o.
- "Valores Recebidos": soma dos pagamentos recebidos no per\xEDodo (principal + juros + multa + juros de atraso).
- "Capital ativo / na rua": principal contratado ainda n\xE3o amortizado dos contratos ativos.
- "Total a receber": soma dos payoffs dos contratos ativos (principal restante + juros restantes + multa + juros de atraso).
- "Lucro realizado": juros + multa + juros de atraso efetivamente recebidos no per\xEDodo (nunca inclui principal).
- Juros pendentes t\xEAm subtotal separado de vencido e a vencer.
- Cards suportam at\xE9 9 d\xEDgitos e usam container queries (ajustam com a sidebar recolhida/expandida).`,
  loans: `# Empr\xE9stimos
- Contrato: valor emprestado (amount), taxa mensal (interest_rate), n\xFAmero de parcelas (installments), status (active/paid/overdue).
- Total com juros = amount \xD7 (1 + interest_rate/100) para contrato de parcela \xFAnica; parcelado usa o cronograma oficial (buildInstallmentBreakdown).
- Principal restante = valor emprestado \u2212 principal efetivamente pago. NUNCA maior que o valor original.
- Juros do ciclo atual = juros pendentes apenas da parcela corrente, nunca o total do contrato.
- Contrato vencido: due_date < hoje e saldo > 0. Dias de atraso contam a partir do vencimento.
- Limite de cr\xE9dito do cliente considera o principal em aberto (amortiza\xE7\xE3o estrita), n\xE3o o total contratado.
- Renegocia\xE7\xE3o gera novo contrato mantendo original_amount para rastreio.`,
  "loan-payments": `# Pagamentos de empr\xE9stimo (Payment Hub)
- Modalidades: pagamento de parcela, pagamento parcial, pagamento s\xF3 de juros, quita\xE7\xE3o total.
- Ordem oficial de aloca\xE7\xE3o de um pagamento: multa \u2192 juros de atraso \u2192 juros contratuais \u2192 principal.
- Pagamento parcial rateia pr\xF3-rata pelo saldo remanescente (ALLOCATION_VERSION_REMAINING_PRORATA).
- Quita\xE7\xE3o: saldo sugerido = principal restante + juros restantes + multa pendente + juros de atraso pendentes.
- O resumo do contrato precisa fechar linha a linha com o saldo sugerido.
- Multa e juros de atraso N\xC3O entram nos c\xE1lculos b\xE1sicos de juros contratuais.`,
  sales: `# Vendas de produtos
- Produtos t\xEAm custo, pre\xE7o de venda e estoque. Vendas (product_sales) geram recebimento separado da carteira de empr\xE9stimos.
- Lucro da venda = pre\xE7o de venda \u2212 custo do produto.
- Recebimentos de venda entram em "receita com vendas" e s\xF3 se misturam com empr\xE9stimos na m\xE9trica de receita total do per\xEDodo.`,
  income: `# Receitas
- Receitas manuais e recorrentes, segregadas por modo (Pessoal/Empresa).
- Receitas recorrentes projetam parcelas futuras; a exclus\xE3o pode ser da ocorr\xEAncia, das futuras ou de toda a s\xE9rie.
- Pagamentos de empr\xE9stimo n\xE3o s\xE3o lan\xE7ados como receita manual \u2014 s\xE3o recebimentos da carteira.`,
  expenses: `# Despesas e cart\xF5es
- Despesas por categoria, com suporte a parcelamento e recorr\xEAncia. Parceladas projetam todas as parcelas futuras (installments \u2212 paidInstallments).
- Cart\xF5es de cr\xE9dito t\xEAm fatura mensal; pagamentos de fatura (credit_card_invoice_payment) N\xC3O aparecem no extrato nem no saldo.
- Cart\xF5es s\xE3o ordenados pelo valor da fatura atual.
- Mini-cards de status (pago, a pagar, atrasado) s\xE3o clic\xE1veis e listam os registros considerados.`,
  payroll: `# Folha de pagamento
- payrolls guarda sal\xE1rio base, benef\xEDcios, adiantamentos, descontos e comiss\xF5es por funcion\xE1rio/compet\xEAncia.
- Comiss\xF5es por gerente aparecem no Dashboard em card recolh\xEDvel.
- L\xEDquido = base + benef\xEDcios + comiss\xE3o \u2212 adiantamentos \u2212 descontos.`,
  goals: `# Metas
- Metas por per\xEDodo (m\xEAs, trimestre, semestre, ano) com pontua\xE7\xE3o e evolu\xE7\xE3o dia a dia.
- Progresso usa os mesmos agregados oficiais do Dashboard \u2014 nunca uma soma paralela.
- Clicar no gr\xE1fico abre a estratifica\xE7\xE3o di\xE1ria da meta.`,
  reports: `# Relat\xF3rios
- Tr\xEAs relat\xF3rios centrais: KPIs gerais, resumo do dia e inadimpl\xEAncia.
- Todos usam _shared/interest-allocation.ts + financial-aggregates-core.ts, garantindo paridade com o Dashboard.
- Exporta\xE7\xF5es em JSON e CSV (financialReportToJson / financialReportToCsv).`,
  telegram: `# Telegram
- Bots ficam em system_telegram_bots; a arquitetura \xE9 unificada por webhook (telegram-webhook).
- V\xEDnculo do usu\xE1rio por c\xF3digo de link (telegramLinkCode).
- O bot registra despesas e consulta indicadores usando os mesmos agregados oficiais.
- Tokens de bot nunca s\xE3o exibidos ao usu\xE1rio.`,
  "piggy-banks": `# Cofrinhos
- Reservas com aportes, resgates e rendimento (% do CDI). Comp\xF5em o Saldo em Conta.
- Rendimento \xE9 projetado, n\xE3o \xE9 receita realizada at\xE9 o resgate.`,
  calendar: `# Calend\xE1rio / Cobran\xE7as
- Mostra vencimentos por dia com filtro de m\xEAs (navega\xE7\xE3o por chevrons; clicar no m\xEAs volta ao m\xEAs atual).
- O card de atrasado respeita o filtro de m\xEAs selecionado.`,
  subscriptions: `# Planos e assinaturas
- Assinaturas via Asaas (PIX). Webhook asaas-webhook atualiza status e dias restantes.
- Sem plano ativo, o app entra em bloqueio global: Calend\xE1rio, Empr\xE9stimos e Cadastros ficam bloqueados como as demais abas.
- Administradores podem liberar acesso e gerenciar dias manualmente em Sistema \u2192 Administra\xE7\xE3o \u2192 Libera\xE7\xE3o de Planos.`,
  admin: `# Administra\xE7\xE3o
- Pap\xE9is ficam em user_roles (nunca no perfil). Verifica\xE7\xE3o por fun\xE7\xE3o security definer has_role.
- Matriz de pap\xE9is e permiss\xF5es em Sistema \u2192 Administra\xE7\xE3o.
- Nome de usu\xE1rio (login) \xE9 \xFAnico; login aceita e-mail ou username.`,
  faq: `# Uso geral
- O assistente responde sobre como usar o app e sobre os dados reais do usu\xE1rio.
- Quando faltar informa\xE7\xE3o, ele pergunta antes de supor. Quando n\xE3o houver registros, ele diz que n\xE3o encontrou \u2014 nunca inventa n\xFAmeros.`
};
function buildKnowledgeBlock(domains) {
  return domains.map((d) => KNOWLEDGE[d]).filter(Boolean).join("\n\n---\n\n");
}

// supabase/functions/ai-assistant/tools.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2";

// supabase/functions/ai-assistant/interest-allocation.ts
var round2 = (n) => Math.round(n * 100) / 100;
var ALLOCATION_VERSION_REMAINING_PRORATA = "remaining_balance_prorata";
function readPersistedInterest(p) {
  const md = p.metadata ?? null;
  if (!md) return null;
  const v = md.interest_amount;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}
function totalWithInterest(principal, rate) {
  return Math.round(principal * (1 + rate / 100));
}
function buildInstallmentBreakdown(loan, customAmounts) {
  const principal = Math.max(0, Number(loan.amount) || 0);
  const N = Math.max(1, Math.floor(Number(loan.installments) || 1));
  const rawTotal = totalWithInterest(principal, Number(loan.interestRate) || 0);
  if (N === 1) {
    const amt = customAmounts?.[0] ?? rawTotal;
    const totalInterest1 = Math.max(0, Math.max(rawTotal, amt) - principal);
    return [{ installmentNumber: 1, amount: round2(amt), interest: round2(totalInterest1), principal: round2(amt - totalInterest1) }];
  }
  const hasCustom = Array.isArray(customAmounts) && customAmounts.length === N;
  const amounts = hasCustom ? customAmounts.map((v) => round2(Number(v) || 0)) : Array.from({ length: N }, () => round2(rawTotal / N));
  const amountsSum = amounts.reduce((s, v) => s + v, 0);
  const total = hasCustom ? Math.max(rawTotal, amountsSum) : rawTotal;
  const totalInterest = Math.max(0, total - principal);
  const entries = [];
  let interestAccum = 0;
  let principalAccum = 0;
  for (let i = 0; i < N; i++) {
    const amount = amounts[i];
    if (i < N - 1) {
      const share = amountsSum > 0 ? amount / amountsSum : 1 / N;
      const interest = round2(totalInterest * share);
      const principalPart = round2(amount - interest);
      entries.push({ installmentNumber: i + 1, amount, interest, principal: principalPart });
      interestAccum += interest;
      principalAccum += principalPart;
    } else {
      const interest = Math.max(0, round2(totalInterest - interestAccum));
      const principalPart = Math.max(0, round2(principal - principalAccum));
      const amt = round2(interest + principalPart);
      entries.push({ installmentNumber: i + 1, amount: amt || amount, interest, principal: principalPart });
    }
  }
  return entries;
}
function allocateInterestByPayment(loans, payments) {
  const byId = /* @__PURE__ */ new Map();
  const loanById = new Map(loans.map((l) => [l.id, l]));
  const sorted = [...payments].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return da.localeCompare(db);
    const ca = a.createdAt ?? "";
    const cb = b.createdAt ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
  const priorInterestByLoan = /* @__PURE__ */ new Map();
  const priorPrincipalByLoan = /* @__PURE__ */ new Map();
  const prorataPrincipalReducedByLoan = /* @__PURE__ */ new Map();
  const interestRemainingByLoan = /* @__PURE__ */ new Map();
  loans.forEach((l) => {
    const total = totalWithInterest(l.amount, l.interestRate);
    interestRemainingByLoan.set(l.id, Math.max(0, total - l.amount));
  });
  const scheduleByLoan = /* @__PURE__ */ new Map();
  for (const loan of loans) {
    if (loan.installments <= 1) continue;
    const totalDue = totalWithInterest(loan.amount, loan.interestRate);
    const N = loan.installments;
    const amounts = Array.from({ length: N }, () => round2(totalDue / N));
    for (const p of sorted) {
      if (p.loanId !== loan.id) continue;
      const k = p.installmentNumber;
      if (k >= 1 && k <= N) amounts[k - 1] = round2(Number(p.amount) || amounts[k - 1]);
    }
    const schedule = buildInstallmentBreakdown(loan, amounts);
    scheduleByLoan.set(loan.id, schedule);
    const scheduledInterest = schedule.reduce((s, e) => s + e.interest, 0);
    interestRemainingByLoan.set(loan.id, Math.max(interestRemainingByLoan.get(loan.id) ?? 0, scheduledInterest));
  }
  for (const p of sorted) {
    const amt = Number(p.amount) || 0;
    if (amt <= 0) {
      byId.set(p.id, 0);
      continue;
    }
    const inst = p.installmentNumber;
    const loan = loanById.get(p.loanId);
    if (inst === 0 || inst === -2) {
      byId.set(p.id, round2(amt));
      const rem = interestRemainingByLoan.get(p.loanId) ?? 0;
      interestRemainingByLoan.set(p.loanId, Math.max(0, rem - amt));
      continue;
    }
    if (inst === -3) {
      byId.set(p.id, 0);
      prorataPrincipalReducedByLoan.set(
        p.loanId,
        (prorataPrincipalReducedByLoan.get(p.loanId) ?? 0) + amt
      );
      continue;
    }
    if (!loan) {
      byId.set(p.id, round2(amt));
      continue;
    }
    if (inst === -1) {
      const iRemBefore = interestRemainingByLoan.get(p.loanId) ?? 0;
      const persisted = readPersistedInterest(p);
      const md = p.metadata ?? null;
      const version = md?.allocation_version;
      const persistedPrincipal = md?.principal_amount != null ? Number(md.principal_amount) : null;
      let interest = 0;
      if (version === ALLOCATION_VERSION_REMAINING_PRORATA) {
        const valid = persisted != null && persistedPrincipal != null && Number.isFinite(persistedPrincipal) && persistedPrincipal >= -5e-3 && Math.abs(persisted + persistedPrincipal - amt) <= 0.01;
        if (valid) {
          interest = Math.min(persisted, amt);
        } else {
          console.error(
            "[interestAllocation] pagamento parcial marcado como nova vers\xE3o sem interest_amount/principal_amount v\xE1lidos \u2014 corrigir metadata",
            { paymentId: p.id, loanId: p.loanId, amount: amt, persisted, persistedPrincipal }
          );
          interest = round2(Math.min(iRemBefore, amt));
        }
      } else if (persisted != null) {
        interest = Math.min(persisted, amt);
      } else {
        interest = round2(Math.min(iRemBefore, amt));
      }
      byId.set(p.id, interest);
      interestRemainingByLoan.set(p.loanId, Math.max(0, round2(iRemBefore - interest)));
      priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + interest);
      const principalPart = Math.max(0, round2(amt - interest));
      prorataPrincipalReducedByLoan.set(
        p.loanId,
        (prorataPrincipalReducedByLoan.get(p.loanId) ?? 0) + principalPart
      );
      continue;
    }
    const schedule = scheduleByLoan.get(p.loanId);
    let interestPart = 0;
    const remBefore = interestRemainingByLoan.get(p.loanId) ?? 0;
    if (schedule) {
      const entry = schedule.find((e) => e.installmentNumber === inst) ?? schedule[schedule.length - 1];
      interestPart = Math.max(0, Math.min(round2(entry.interest), amt, remBefore));
    } else {
      const principalRemaining = Math.max(
        0,
        round2((loan.amount || 0) - (priorPrincipalByLoan.get(p.loanId) ?? 0))
      );
      const principalPart = Math.min(amt, principalRemaining);
      interestPart = Math.max(0, round2(amt - principalPart));
    }
    byId.set(p.id, interestPart);
    priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + interestPart);
    interestRemainingByLoan.set(p.loanId, Math.max(0, remBefore - interestPart));
    priorPrincipalByLoan.set(
      p.loanId,
      (priorPrincipalByLoan.get(p.loanId) ?? 0) + Math.max(0, round2(amt - interestPart))
    );
    prorataPrincipalReducedByLoan.set(
      p.loanId,
      (prorataPrincipalReducedByLoan.get(p.loanId) ?? 0) + Math.max(0, round2(amt - interestPart))
    );
  }
  const lastPaymentByLoan = /* @__PURE__ */ new Map();
  sorted.forEach((p) => {
    lastPaymentByLoan.set(p.loanId, { id: p.id, amount: Number(p.amount) || 0 });
  });
  const paymentAmountById = /* @__PURE__ */ new Map();
  payments.forEach((p) => paymentAmountById.set(p.id, Number(p.amount) || 0));
  for (const loan of loans) {
    if (loan.status !== "paid") continue;
    const last = lastPaymentByLoan.get(loan.id);
    if (!last) continue;
    const total = totalWithInterest(loan.amount, loan.interestRate);
    const scheduled = scheduleByLoan.get(loan.id);
    const scheduledInterest = scheduled ? scheduled.reduce((s, e) => s + e.interest, 0) : 0;
    const expectedInterest = Math.max(0, Math.max(total - loan.amount, scheduledInterest));
    const allocated = payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + (byId.get(p.id) ?? 0), 0);
    const diff = round2(expectedInterest - allocated);
    if (diff <= 0) continue;
    const cur = byId.get(last.id) ?? 0;
    const cap = Math.max(0, round2(last.amount - cur));
    const add = Math.min(diff, cap);
    if (add > 0) byId.set(last.id, round2(cur + add));
  }
  return byId;
}

// supabase/functions/ai-assistant/financial-aggregates-core.ts
var FINANCIAL_AGGREGATES_VERSION = "unified_financial_aggregates_v1";
function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function isDateInsidePeriod(dateIso, bounds) {
  if (!dateIso) return false;
  if (!bounds) return true;
  const day = String(dateIso).slice(0, 10);
  return day >= bounds.startIso && day <= bounds.endIso;
}
function emptyReceived() {
  return { total: 0, principal: 0, interest: 0, penalty: 0, lateInterest: 0, count: 0 };
}
function addPayment(acc, p) {
  acc.total += Number(p.amount) || 0;
  acc.principal += Number(p.principalAmount) || 0;
  acc.interest += Number(p.interestAmount) || 0;
  acc.penalty += Number(p.penaltyAmount) || 0;
  acc.lateInterest += Number(p.lateInterestAmount) || 0;
  acc.count += 1;
}
function sealReceived(acc) {
  return {
    total: roundMoney(acc.total),
    principal: roundMoney(acc.principal),
    interest: roundMoney(acc.interest),
    penalty: roundMoney(acc.penalty),
    lateInterest: roundMoney(acc.lateInterest),
    count: acc.count
  };
}
function buildFinancialAggregates(input) {
  const period = input.period ?? null;
  const states = Array.isArray(input.loanStates) ? input.loanStates : [];
  const payments = Array.isArray(input.payments) ? input.payments : [];
  const saleReceipts = Array.isArray(input.saleReceipts) ? input.saleReceipts : [];
  const warnings = [];
  let contractsActive = 0;
  let contractsPaid = 0;
  let contractsOverdue = 0;
  let contractsStartedInPeriod = 0;
  let principalLentActive = 0;
  let principalLentInPeriod = 0;
  let principalRemaining = 0;
  let contractualInterestRemaining = 0;
  let penaltyPending = 0;
  let lateInterestPending = 0;
  let totalReceivable = 0;
  let overdueAmount = 0;
  const seen = /* @__PURE__ */ new Set();
  for (const state of states) {
    if (seen.has(state.loanId)) {
      warnings.push(`Contrato ${state.loanId} apareceu duplicado na agrega\xE7\xE3o (ignorado).`);
      continue;
    }
    seen.add(state.loanId);
    if (isDateInsidePeriod(state.startDateIso ?? null, period)) {
      contractsStartedInPeriod += 1;
      principalLentInPeriod += positive(state.principal);
    }
    if (state.isActive) {
      contractsActive += 1;
      principalLentActive += positive(state.principal);
      principalRemaining += positive(state.principalRemaining);
      contractualInterestRemaining += positive(state.contractualInterestRemaining);
      penaltyPending += positive(state.penaltyPending);
      lateInterestPending += positive(state.lateInterestPending);
      totalReceivable += positive(state.totalReceivable);
      overdueAmount += positive(state.overdueAmount);
      if (state.isOverdue) contractsOverdue += 1;
      if (positive(state.principalRemaining) > positive(state.principal) + 0.01) {
        warnings.push(`Contrato ${state.loanId}: principal restante maior que o valor emprestado.`);
      }
    } else {
      contractsPaid += 1;
    }
    if (state.warnings && state.warnings.length > 0) {
      for (const w of state.warnings) warnings.push(`Contrato ${state.loanId}: ${w}`);
    }
  }
  const inPeriod = emptyReceived();
  const allTime = emptyReceived();
  for (const payment of payments) {
    addPayment(allTime, payment);
    if (isDateInsidePeriod(payment.dateIso, period)) addPayment(inPeriod, payment);
  }
  const receivedInPeriod = sealReceived(inPeriod);
  const receivedAllTime = sealReceived(allTime);
  const salesReceivedInPeriod = roundMoney(
    saleReceipts.filter((sale) => isDateInsidePeriod(sale.dateIso, period)).reduce((sum, sale) => sum + (Number(sale.amount) || 0), 0)
  );
  const realizedProfitInPeriod = roundMoney(
    receivedInPeriod.interest + receivedInPeriod.penalty + receivedInPeriod.lateInterest
  );
  const realizedProfitAllTime = roundMoney(
    receivedAllTime.interest + receivedAllTime.penalty + receivedAllTime.lateInterest
  );
  const interestAndFeesPending = roundMoney(
    contractualInterestRemaining + penaltyPending + lateInterestPending
  );
  return {
    calculationVersion: FINANCIAL_AGGREGATES_VERSION,
    calculationDate: input.calculationDate ?? null,
    period,
    contractsTotal: seen.size,
    contractsActive,
    contractsPaid,
    contractsOverdue,
    contractsStartedInPeriod,
    principalLentActive: roundMoney(principalLentActive),
    principalLentInPeriod: roundMoney(principalLentInPeriod),
    principalRemaining: roundMoney(principalRemaining),
    contractualInterestRemaining: roundMoney(contractualInterestRemaining),
    penaltyPending: roundMoney(penaltyPending),
    lateInterestPending: roundMoney(lateInterestPending),
    interestAndFeesPending,
    totalReceivable: roundMoney(totalReceivable),
    overdueAmount: roundMoney(overdueAmount),
    receivedInPeriod,
    receivedAllTime,
    realizedProfitInPeriod,
    realizedProfitAllTime,
    salesReceivedInPeriod,
    revenueInPeriodWithSales: roundMoney(receivedInPeriod.total + salesReceivedInPeriod),
    warnings
  };
}

// supabase/functions/ai-assistant/financial-aggregates.ts
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function totalWithInterest2(loan) {
  const principal = num(loan.amount);
  const rate = num(loan.interest_rate);
  return Math.round(principal * (1 + rate / 100));
}
function daysLate(dueDateIso, todayIso) {
  if (!dueDateIso) return 0;
  const due = (/* @__PURE__ */ new Date(`${String(dueDateIso).slice(0, 10)}T00:00:00`)).getTime();
  const today = (/* @__PURE__ */ new Date(`${todayIso}T00:00:00`)).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(today)) return 0;
  return Math.max(0, Math.floor((today - due) / 864e5));
}
function mapLoanStatesFromRows(loanRows, paymentRows, todayIso) {
  const allocLoans = loanRows.map((loan) => ({
    id: String(loan.id),
    amount: num(loan.amount),
    interestRate: num(loan.interest_rate),
    installments: Math.max(1, Math.floor(num(loan.installments) || 1)),
    status: loan.status,
    originalAmount: loan.original_amount != null ? Number(loan.original_amount) : null
  }));
  const allocPayments = paymentRows.map((p) => ({
    id: String(p.id),
    loanId: String(p.loan_id),
    amount: num(p.amount),
    date: p.date ?? void 0,
    installmentNumber: num(p.installment_number),
    createdAt: p.created_at ?? void 0,
    metadata: p.metadata ?? null
  }));
  const interestByPayment = allocateInterestByPayment(allocLoans, allocPayments);
  return loanRows.map((loan) => {
    const id = String(loan.id);
    const principal = num(loan.amount);
    const total = totalWithInterest2(loan);
    const contractualInterestTotal = roundMoney(Math.max(0, total - principal));
    const loanPayments = allocPayments.filter((p) => p.loanId === id);
    let interestPaid = 0;
    let principalPaid = 0;
    let penaltyPaid = 0;
    let lateInterestPaid = 0;
    for (const p of loanPayments) {
      const md = p.metadata ?? null;
      const penalty = num(md?.penalty_amount);
      const late2 = num(md?.late_interest_amount);
      penaltyPaid += penalty;
      lateInterestPaid += late2;
      const interest = md?.interest_amount != null ? num(md.interest_amount) : interestByPayment.get(p.id) ?? 0;
      const capped = Math.min(interest, Math.max(0, p.amount - penalty - late2));
      interestPaid += capped;
      principalPaid += Math.max(0, p.amount - capped - penalty - late2);
    }
    const principalRemaining = roundMoney(Math.min(principal, Math.max(0, principal - principalPaid)));
    const contractualInterestRemaining = roundMoney(Math.max(0, contractualInterestTotal - interestPaid));
    const late = daysLate(loan.due_date ?? null, todayIso);
    const balanceForLateInterest = principalRemaining + contractualInterestRemaining;
    let lateInterestApplied = 0;
    let penaltyApplied = 0;
    if (late > 0) {
      if (num(loan.late_interest_value) > 0) {
        lateInterestApplied = loan.late_interest_type === "fixed" ? num(loan.late_interest_value) * late : balanceForLateInterest * (num(loan.late_interest_value) / 100) * late;
      }
      if (num(loan.penalty_value) > 0) penaltyApplied = num(loan.penalty_value);
    }
    const penaltyPending = roundMoney(Math.max(0, penaltyApplied - penaltyPaid));
    const lateInterestPending = roundMoney(Math.max(0, lateInterestApplied - lateInterestPaid));
    const isActive = loan.status !== "paid" && loan.status !== "completed";
    return {
      loanId: id,
      status: loan.status ?? null,
      isActive,
      isOverdue: isActive && late > 0,
      daysLate: late,
      startDateIso: loan.start_date ?? null,
      dueDateIso: loan.due_date ?? null,
      principal: roundMoney(principal),
      principalRemaining,
      contractualInterestTotal,
      contractualInterestRemaining,
      penaltyPending,
      lateInterestPending,
      totalReceivable: roundMoney(
        principalRemaining + contractualInterestRemaining + penaltyPending + lateInterestPending
      ),
      overdueAmount: isActive && late > 0 ? principalRemaining + contractualInterestRemaining : 0,
      warnings: []
    };
  });
}
function mapPaymentsFromRows(loanRows, paymentRows) {
  const allocLoans = loanRows.map((loan) => ({
    id: String(loan.id),
    amount: num(loan.amount),
    interestRate: num(loan.interest_rate),
    installments: Math.max(1, Math.floor(num(loan.installments) || 1)),
    status: loan.status,
    originalAmount: loan.original_amount != null ? Number(loan.original_amount) : null
  }));
  const allocPayments = paymentRows.map((p) => ({
    id: String(p.id),
    loanId: String(p.loan_id),
    amount: num(p.amount),
    date: p.date ?? void 0,
    installmentNumber: num(p.installment_number),
    createdAt: p.created_at ?? void 0,
    metadata: p.metadata ?? null
  }));
  const interestByPayment = allocateInterestByPayment(allocLoans, allocPayments);
  return allocPayments.map((p) => {
    const md = p.metadata ?? null;
    const penalty = roundMoney(num(md?.penalty_amount));
    const lateInterest = roundMoney(num(md?.late_interest_amount));
    const n = p.installmentNumber;
    let interest;
    if (md?.interest_amount != null) {
      interest = roundMoney(num(md.interest_amount));
    } else if (n === 0 || n === -2) {
      interest = roundMoney(Math.max(0, p.amount - penalty - lateInterest));
    } else if (n === -3) {
      interest = 0;
    } else {
      interest = roundMoney(Math.min(interestByPayment.get(p.id) ?? 0, Math.max(0, p.amount - penalty - lateInterest)));
    }
    const principal = md?.principal_amount != null ? roundMoney(num(md.principal_amount)) : roundMoney(Math.max(0, p.amount - interest - penalty - lateInterest));
    return {
      id: p.id,
      loanId: p.loanId,
      dateIso: String(p.date ?? "").slice(0, 10),
      amount: roundMoney(p.amount),
      principalAmount: principal,
      interestAmount: interest,
      penaltyAmount: penalty,
      lateInterestAmount: lateInterest
    };
  });
}
function buildAggregatesFromRows(params) {
  return buildFinancialAggregates({
    loanStates: mapLoanStatesFromRows(params.loanRows, params.paymentRows, params.todayIso),
    payments: mapPaymentsFromRows(params.loanRows, params.paymentRows),
    period: params.period ?? null,
    calculationDate: params.todayIso
  });
}

// supabase/functions/ai-assistant/pure.ts
var TAB_TO_DOMAIN = {
  overview: "dashboard",
  dashboard: "loans",
  products: "sales",
  vehicles: "dashboard",
  calendar: "calendar",
  clients: "loans",
  expenses: "expenses",
  boletos: "expenses",
  salary: "payroll",
  accountant: "reports",
  overdue: "reports",
  settings: "subscriptions",
  system: "admin",
  ajuda: "faq"
};
var DOMAIN_KEYWORDS = {
  architecture: ["arquitetura", "tabela", "banco", "tecnico", "sistema", "origem do dado"],
  dashboard: ["dashboard", "visao geral", "capital ativo", "patrimonio", "indicador", "resumo", "saldo em conta", "a receber", "receber"],
  loans: ["emprestimo", "contrato", "cliente", "principal", "inadimplencia", "atrasado", "carteira", "quitado", "renegocia"],
  "loan-payments": ["pagamento", "quitar", "quitacao", "amortiza", "parcial", "juros", "multa", "parcela", "baixa"],
  sales: ["venda", "vendi", "produto", "estoque", "faturamento", "lucro"],
  income: ["receita", "recebi", "entrada", "recorrente"],
  expenses: ["despesa", "gastei", "gasto", "cartao", "fatura", "categoria", "orcamento", "boleto"],
  payroll: ["salario", "folha", "funcionario", "holerite", "comissao", "adiantamento", "beneficio"],
  goals: ["meta", "pontuacao", "score", "atingid", "trimestre", "semestre"],
  reports: ["relatorio", "exportar", "pdf", "csv", "comparativo", "fluxo de caixa"],
  telegram: ["telegram", "bot", "webhook", "polling", "vincular"],
  "piggy-banks": ["cofrinho", "guardado", "rendimento", "cdi", "resgate", "aporte", "poupanca"],
  calendar: ["calendario", "vence", "vencimento", "hoje", "amanha", "semana", "agenda"],
  subscriptions: ["plano", "assinatura", "expirou", "dias restantes", "trial", "teste", "bloquead"],
  admin: ["admin", "permissao", "papel", "usuario", "liberar", "convite", "username"],
  faq: []
};
function stripAccents(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function selectDomains(question, tab, max = 4) {
  const q = stripAccents(question || "");
  const scored = [];
  for (const [domain, words] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const w of words) if (q.includes(w)) score += 1;
    if (score > 0) scored.push({ domain, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const picked = ["architecture"];
  const tabDomain = tab ? TAB_TO_DOMAIN[tab] : void 0;
  if (tabDomain && !picked.includes(tabDomain)) picked.push(tabDomain);
  for (const { domain } of scored) {
    if (picked.length >= max) break;
    if (!picked.includes(domain)) picked.push(domain);
  }
  if (picked.length === 1) picked.push("faq");
  return picked.slice(0, max);
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function iso(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
var MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];
function lastDay(y, m) {
  return new Date(y, m, 0).getDate();
}
function resolvePeriod(expression, todayIso) {
  const [ty, tm, td] = todayIso.slice(0, 10).split("-").map(Number);
  const raw = stripAccents(expression || "").trim();
  const explicit = raw.match(/(\d{4})-(\d{2})-(\d{2})\s*(?:a|ate|->|→)\s*(\d{4})-(\d{2})-(\d{2})/);
  if (explicit) {
    const start = `${explicit[1]}-${explicit[2]}-${explicit[3]}`;
    const end = `${explicit[4]}-${explicit[5]}-${explicit[6]}`;
    return { kind: "custom", startIso: start, endIso: end, label: `${start} a ${end}` };
  }
  const monthYear = raw.match(/(\d{4})-(\d{2})$/);
  if (monthYear) {
    const y = Number(monthYear[1]);
    const m = Number(monthYear[2]);
    return { kind: "month", startIso: iso(y, m, 1), endIso: iso(y, m, lastDay(y, m)), label: `${pad2(m)}/${y}` };
  }
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (raw.includes(MONTH_NAMES[i])) {
      const yMatch = raw.match(/(20\d{2})/);
      const y = yMatch ? Number(yMatch[1]) : ty;
      const m = i + 1;
      return { kind: "month", startIso: iso(y, m, 1), endIso: iso(y, m, lastDay(y, m)), label: `${MONTH_NAMES[i]} de ${y}` };
    }
  }
  if (raw.includes("hoje")) {
    return { kind: "day", startIso: todayIso, endIso: todayIso, label: `hoje (${todayIso})` };
  }
  if (raw.includes("ontem")) {
    const d = new Date(ty, tm - 1, td - 1);
    const s = iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return { kind: "day", startIso: s, endIso: s, label: `ontem (${s})` };
  }
  if (raw.includes("semana")) {
    const ref = new Date(ty, tm - 1, td);
    const start = new Date(ty, tm - 1, td - ref.getDay());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const s = iso(start.getFullYear(), start.getMonth() + 1, start.getDate());
    const e = iso(end.getFullYear(), end.getMonth() + 1, end.getDate());
    return { kind: "week", startIso: s, endIso: e, label: `semana de ${s} a ${e}` };
  }
  if (raw.includes("trimestre")) {
    const q = Math.floor((tm - 1) / 3);
    const sm = q * 3 + 1;
    const em = sm + 2;
    return { kind: "quarter", startIso: iso(ty, sm, 1), endIso: iso(ty, em, lastDay(ty, em)), label: `${q + 1}\xBA trimestre de ${ty}` };
  }
  if (raw.includes("semestre")) {
    const first = tm <= 6;
    const sm = first ? 1 : 7;
    const em = first ? 6 : 12;
    return { kind: "semester", startIso: iso(ty, sm, 1), endIso: iso(ty, em, lastDay(ty, em)), label: `${first ? "1\xBA" : "2\xBA"} semestre de ${ty}` };
  }
  if (raw.includes("ano") || raw.match(/^20\d{2}$/)) {
    const yMatch = raw.match(/(20\d{2})/);
    const y = yMatch ? Number(yMatch[1]) : ty;
    return { kind: "year", startIso: iso(y, 1, 1), endIso: iso(y, 12, 31), label: String(y) };
  }
  if (raw.includes("mes passado") || raw.includes("mes anterior")) {
    const y = tm === 1 ? ty - 1 : ty;
    const m = tm === 1 ? 12 : tm - 1;
    return { kind: "month", startIso: iso(y, m, 1), endIso: iso(y, m, lastDay(y, m)), label: `${pad2(m)}/${y}` };
  }
  return {
    kind: "month",
    startIso: iso(ty, tm, 1),
    endIso: iso(ty, tm, lastDay(ty, tm)),
    label: `${pad2(tm)}/${ty}`
  };
}
function formatBRL(value) {
  const n = Number(value) || 0;
  const neg = n < 0;
  const [intPart, decPart] = Math.abs(n).toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}R$ ${grouped},${decPart}`;
}
var SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  // JWT
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g,
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g,
  // token de bot do Telegram
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /AIza[0-9A-Za-z_-]{20,}/g
];
function redactSecrets(text) {
  let out = String(text ?? "");
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[credencial omitida]");
  return out;
}
function missingPeriodDisclosure(reply) {
  const hasMoney = /R\$\s?\d/.test(reply);
  if (!hasMoney) return false;
  const r = stripAccents(reply);
  return !/(periodo|hoje|ontem|semana|mes|mês|trimestre|semestre|ano|\d{2}\/\d{4}|\d{4}-\d{2})/.test(r);
}
function isLearnableAnswer(question, answer) {
  if (!question || !answer) return false;
  if (/R\$\s?\d/.test(answer)) return false;
  if (answer.startsWith("\u26A0\uFE0F")) return false;
  if (/nao encontrei registros/i.test(stripAccents(answer))) return false;
  return true;
}

// supabase/functions/ai-assistant/tools.ts
function createUserClient(authHeader) {
  return createClient2(getExternalSupabaseUrl(), getExternalAnonKey(), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
function num2(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function sumBy(rows, keys) {
  return rows.reduce((acc, row) => {
    for (const k of keys) {
      if (row?.[k] != null) return acc + num2(row[k]);
    }
    return acc;
  }, 0);
}
function pickDate(row) {
  for (const k of ["date", "due_date", "sale_date", "created_at", "start_date"]) {
    if (row?.[k]) return String(row[k]).slice(0, 10);
  }
  return "";
}
function effectiveDueDate(loan, installments) {
  const rows = installments.filter((i) => String(i.loan_id) === String(loan.id)).sort((a, b) => num2(a.installment_number) - num2(b.installment_number));
  if (rows.length > 0) {
    const open = rows.find((i) => i.paid !== true);
    if (open?.due_date) return String(open.due_date).slice(0, 10);
    const next = num2(loan.paid_installments) + 1;
    const byNumber = rows.find((i) => num2(i.installment_number) === next);
    if (byNumber?.due_date) return String(byNumber.due_date).slice(0, 10);
  }
  return String(loan.due_date ?? "").slice(0, 10);
}
async function loadLoansAndPayments(ctx) {
  const { data: loans, error: loansError } = await ctx.client.from("loans").select("*").eq("user_id", ctx.ownerId);
  if (loansError) throw new Error(`loans: ${loansError.message}`);
  const { data: payments, error: paymentsError } = await ctx.client.from("payments").select("*").eq("user_id", ctx.ownerId);
  if (paymentsError) throw new Error(`payments: ${paymentsError.message}`);
  const loanIds = (loans ?? []).map((l) => String(l.id));
  let installmentRows = [];
  if (loanIds.length > 0) {
    const { data: inst } = await ctx.client.from("loan_installments").select("loan_id, installment_number, due_date, amount, paid").in("loan_id", loanIds);
    installmentRows = inst ?? [];
  }
  const loanRows = (loans ?? []).map((l) => {
    const effective = effectiveDueDate(l, installmentRows);
    return effective && effective !== String(l.due_date ?? "").slice(0, 10) ? { ...l, due_date: effective, contract_due_date: l.due_date } : l;
  });
  return { loanRows, paymentRows: payments ?? [], installmentRows };
}
function aggregatesFor(ctx, rows, period) {
  return buildAggregatesFromRows({
    loanRows: rows.loanRows,
    paymentRows: rows.paymentRows,
    todayIso: ctx.todayIso,
    period: { kind: "custom", startIso: period.startIso, endIso: period.endIso, label: period.label }
  });
}
async function clientNameMap(ctx) {
  const { data } = await ctx.client.from("clients").select("id, name").eq("user_id", ctx.ownerId);
  const map = /* @__PURE__ */ new Map();
  for (const row of data ?? []) map.set(String(row.id), String(row.name ?? ""));
  return map;
}
function loanClientName(loan, names) {
  const direct = String(loan?.borrower_name ?? "").trim();
  if (direct) return direct;
  const id = String(loan?.borrower_id ?? loan?.client_id ?? "");
  return names.get(id) ?? "\u2014";
}
var periodParam = {
  type: "string",
  description: "Per\xEDodo em linguagem natural pt-BR (ex.: 'hoje', 'esta semana', 'm\xEAs passado', 'julho de 2026', '2026-01-01 a 2026-03-31'). Padr\xE3o: m\xEAs atual."
};
var TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "get_financial_overview",
      description: "Indicadores oficiais da carteira no per\xEDodo: capital ativo, total a receber, recebido, lucro realizado, juros pendentes, contratos e inadimpl\xEAncia.",
      parameters: { type: "object", properties: { period: periodParam }, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "list_loans",
      description: "Lista contratos de empr\xE9stimo do usu\xE1rio, com filtro opcional por status ou nome do cliente.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "active, paid ou overdue" },
          client_name: { type: "string", description: "Parte do nome do cliente" },
          limit: { type: "number", description: "M\xE1ximo de contratos (padr\xE3o 20)" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_loan_details",
      description: "Detalhe de um contrato: valor, taxa, parcelas, pagamentos recebidos e situa\xE7\xE3o atual.",
      parameters: {
        type: "object",
        properties: {
          loan_id: { type: "string" },
          client_name: { type: "string", description: "Alternativa ao id: nome do cliente" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_overdue",
      description: "Contratos vencidos com dias de atraso e valor em aberto (inadimpl\xEAncia).",
      parameters: { type: "object", properties: { limit: { type: "number" } }, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "get_client_summary",
      description: "Resumo de um cliente: contratos, total emprestado, pago e em aberto.",
      parameters: {
        type: "object",
        properties: { client_name: { type: "string" } },
        required: ["client_name"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_income_expense_summary",
      description: "Receitas e despesas do per\xEDodo, com as maiores categorias de despesa.",
      parameters: { type: "object", properties: { period: periodParam }, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "list_sales",
      description: "Vendas de produtos no per\xEDodo, com total faturado.",
      parameters: { type: "object", properties: { period: periodParam }, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "get_goals_progress",
      description: "Metas mensais do usu\xE1rio e progresso frente aos agregados oficiais.",
      parameters: { type: "object", properties: { period: periodParam }, additionalProperties: false }
    }
  }
];
async function executeTool(name, args, ctx) {
  const period = resolvePeriod(args?.period ?? null, ctx.todayIso);
  switch (name) {
    case "get_financial_overview": {
      const rows = await loadLoansAndPayments(ctx);
      const agg = aggregatesFor(ctx, rows, period);
      return {
        periodo: period.label,
        contratos: {
          total: agg.contractsTotal,
          ativos: agg.contractsActive,
          quitados: agg.contractsPaid,
          vencidos: agg.contractsOverdue,
          iniciados_no_periodo: agg.contractsStartedInPeriod
        },
        capital_ativo: formatBRL(agg.principalRemaining),
        total_a_receber: formatBRL(agg.totalReceivable),
        composicao_total_a_receber: {
          capital_ativo: formatBRL(agg.principalRemaining),
          juros_pendentes: formatBRL(agg.contractualInterestRemaining),
          multa_pendente: formatBRL(agg.penaltyPending),
          juros_atraso_pendentes: formatBRL(agg.lateInterestPending),
          formula: "total_a_receber = capital_ativo + juros_pendentes + multa_pendente + juros_atraso_pendentes"
        },
        juros_pendentes: formatBRL(agg.contractualInterestRemaining),
        multa_pendente: formatBRL(agg.penaltyPending),
        juros_atraso_pendentes: formatBRL(agg.lateInterestPending),
        valor_vencido: formatBRL(agg.overdueAmount),
        observacao_valor_vencido: "valor_vencido \xE9 um recorte do total a receber (parcelas j\xE1 vencidas) e N\xC3O deve ser somado \xE0 composi\xE7\xE3o acima.",
        recebido_no_periodo: {
          total: formatBRL(agg.receivedInPeriod.total),
          principal: formatBRL(agg.receivedInPeriod.principal),
          juros: formatBRL(agg.receivedInPeriod.interest),
          multa: formatBRL(agg.receivedInPeriod.penalty),
          juros_atraso: formatBRL(agg.receivedInPeriod.lateInterest),
          pagamentos: agg.receivedInPeriod.count
        },
        lucro_realizado_no_periodo: formatBRL(agg.realizedProfitInPeriod),
        versao_calculo: agg.calculationVersion
      };
    }
    case "list_loans": {
      const rows = await loadLoansAndPayments(ctx);
      const names = await clientNameMap(ctx);
      const limit = Math.min(Math.max(num2(args?.limit) || 20, 1), 50);
      const wanted = String(args?.status ?? "").trim().toLowerCase();
      const clientFilter = String(args?.client_name ?? "").trim().toLowerCase();
      const list = rows.loanRows.filter((l) => wanted ? String(l.status ?? "").toLowerCase() === wanted : true).filter(
        (l) => clientFilter ? loanClientName(l, names).toLowerCase().includes(clientFilter) : true
      ).slice(0, limit).map((l) => {
        const paid = rows.paymentRows.filter((p) => String(p.loan_id) === String(l.id)).reduce((acc, p) => acc + num2(p.amount), 0);
        return {
          id: String(l.id),
          cliente: loanClientName(l, names),
          valor_emprestado: formatBRL(num2(l.amount)),
          taxa_mensal: `${num2(l.interest_rate)}%`,
          parcelas: num2(l.installments) || 1,
          status: l.status,
          vencimento: pickDate(l),
          total_pago: formatBRL(paid)
        };
      });
      return { periodo: "todos os contratos", quantidade: list.length, contratos: list };
    }
    case "get_loan_details": {
      const rows = await loadLoansAndPayments(ctx);
      const names = await clientNameMap(ctx);
      const id = String(args?.loan_id ?? "").trim();
      const clientFilter = String(args?.client_name ?? "").trim().toLowerCase();
      const loan = rows.loanRows.find(
        (l) => id ? String(l.id) === id : clientFilter && loanClientName(l, names).toLowerCase().includes(clientFilter)
      );
      if (!loan) return { encontrado: false, motivo: "Nenhum contrato correspondente ao filtro informado." };
      const payments = rows.paymentRows.filter((p) => String(p.loan_id) === String(loan.id)).sort((a, b) => pickDate(a).localeCompare(pickDate(b)));
      const agg = aggregatesFor(
        ctx,
        { loanRows: [loan], paymentRows: payments },
        resolvePeriod("ano", ctx.todayIso)
      );
      return {
        encontrado: true,
        id: String(loan.id),
        cliente: loanClientName(loan, names),
        valor_emprestado: formatBRL(num2(loan.amount)),
        taxa_mensal: `${num2(loan.interest_rate)}%`,
        parcelas: num2(loan.installments) || 1,
        status: loan.status,
        vencimento: pickDate(loan),
        principal_restante: formatBRL(agg.principalRemaining),
        juros_restantes: formatBRL(agg.contractualInterestRemaining),
        saldo_total_a_receber: formatBRL(agg.totalReceivable),
        pagamentos: payments.map((p) => ({ data: pickDate(p), valor: formatBRL(num2(p.amount)) }))
      };
    }
    case "list_overdue": {
      const rows = await loadLoansAndPayments(ctx);
      const names = await clientNameMap(ctx);
      const limit = Math.min(Math.max(num2(args?.limit) || 20, 1), 50);
      const today = ctx.todayIso;
      const overdue = rows.loanRows.filter((l) => !["paid", "completed"].includes(String(l.status ?? "").toLowerCase())).filter((l) => {
        const due = String(l.due_date ?? "").slice(0, 10);
        return due && due < today;
      }).map((l) => {
        const due = String(l.due_date ?? "").slice(0, 10);
        const dias = Math.max(
          0,
          Math.floor(
            ((/* @__PURE__ */ new Date(`${today}T00:00:00`)).getTime() - (/* @__PURE__ */ new Date(`${due}T00:00:00`)).getTime()) / 864e5
          )
        );
        const single = aggregatesFor(
          ctx,
          { loanRows: [l], paymentRows: rows.paymentRows.filter((p) => String(p.loan_id) === String(l.id)) },
          resolvePeriod("ano", ctx.todayIso)
        );
        const parcelaVencida = rows.installmentRows.find(
          (i) => String(i.loan_id) === String(l.id) && String(i.due_date ?? "").slice(0, 10) === due
        );
        return {
          id: String(l.id),
          cliente: loanClientName(l, names),
          vencimento: due,
          dias_atraso: dias,
          valor_emprestado: formatBRL(num2(l.amount)),
          parcela_vencida: parcelaVencida ? formatBRL(num2(parcelaVencida.amount)) : null,
          saldo_devedor: formatBRL(single.overdueAmount),
          multa_pendente: formatBRL(single.penaltyPending ?? 0),
          juros_atraso_pendentes: formatBRL(single.lateInterestPending ?? 0),
          total_em_aberto: formatBRL(single.totalReceivable)
        };
      }).sort((a, b) => b.dias_atraso - a.dias_atraso).slice(0, limit);
      return {
        referencia: today,
        quantidade: overdue.length,
        observacao: "vencimento = data da primeira parcela em aberto (mesma regra do app). total_em_aberto = saldo_devedor + multa_pendente + juros_atraso_pendentes; parcela_vencida \xE9 apenas o valor daquela parcela.",
        contratos_vencidos: overdue
      };
    }
    case "get_client_summary": {
      const filter = String(args?.client_name ?? "").trim().toLowerCase();
      const names = await clientNameMap(ctx);
      const matches = [...names.entries()].filter(([, name2]) => name2.toLowerCase().includes(filter));
      if (matches.length === 0) return { encontrado: false, motivo: "Nenhum cliente com esse nome." };
      const rows = await loadLoansAndPayments(ctx);
      const ids = new Set(matches.map(([id]) => id));
      const loanRows = rows.loanRows.filter(
        (l) => ids.has(String(l.borrower_id ?? l.client_id)) || loanClientName(l, names).toLowerCase().includes(filter)
      );
      const loanIds = new Set(loanRows.map((l) => String(l.id)));
      const paymentRows = rows.paymentRows.filter((p) => loanIds.has(String(p.loan_id)));
      const agg = aggregatesFor(ctx, { loanRows, paymentRows }, resolvePeriod("ano", ctx.todayIso));
      return {
        encontrado: true,
        clientes: matches.map(([, name2]) => name2),
        contratos: loanRows.length,
        contratos_ativos: agg.contractsActive,
        total_emprestado: formatBRL(agg.principalLentActive),
        principal_restante: formatBRL(agg.principalRemaining),
        total_recebido: formatBRL(agg.receivedAllTime.total),
        saldo_a_receber: formatBRL(agg.totalReceivable)
      };
    }
    case "get_income_expense_summary": {
      const [{ data: incomes }, { data: expenses }] = await Promise.all([
        ctx.client.from("incomes").select("*").eq("user_id", ctx.ownerId).gte("received_date", period.startIso).lte("received_date", period.endIso),
        ctx.client.from("expenses").select("*").eq("user_id", ctx.ownerId).gte("due_date", period.startIso).lte("due_date", period.endIso)
      ]);
      const incomeRows = incomes ?? [];
      const expenseRows = (expenses ?? []).filter(
        (e) => String(e.type ?? e.category ?? "") !== "credit_card_invoice_payment"
      );
      const totalIncome = sumBy(incomeRows, ["amount", "value"]);
      const totalExpense = sumBy(expenseRows, ["amount", "value"]);
      const byCategory = /* @__PURE__ */ new Map();
      for (const e of expenseRows) {
        const key = String(e.category ?? e.description ?? "Sem categoria");
        byCategory.set(key, (byCategory.get(key) ?? 0) + num2(e.amount ?? e.value));
      }
      const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([categoria, valor]) => ({ categoria, valor: formatBRL(valor) }));
      return {
        periodo: period.label,
        receitas: formatBRL(totalIncome),
        despesas: formatBRL(totalExpense),
        resultado: formatBRL(totalIncome - totalExpense),
        lancamentos: { receitas: incomeRows.length, despesas: expenseRows.length },
        maiores_categorias_de_despesa: top
      };
    }
    case "list_sales": {
      const { data } = await ctx.client.from("sales").select("*").eq("user_id", ctx.ownerId);
      const rows = (data ?? []).filter((s) => {
        const d = pickDate(s);
        return d >= period.startIso && d <= period.endIso;
      });
      const total = sumBy(rows, ["total", "total_amount", "amount", "value"]);
      return {
        periodo: period.label,
        quantidade: rows.length,
        total_faturado: formatBRL(total),
        vendas: rows.slice(0, 20).map((s) => ({
          data: pickDate(s),
          descricao: String(s.product_name ?? s.description ?? "\u2014"),
          valor: formatBRL(num2(s.total ?? s.total_amount ?? s.amount ?? s.value))
        }))
      };
    }
    case "get_goals_progress": {
      const { data } = await ctx.client.from("monthly_goals").select("*").eq("user_id", ctx.ownerId);
      const rows = data ?? [];
      const rowsInPeriod = rows.filter((g) => {
        const ref = String(g.month ?? g.reference_month ?? pickDate(g)).slice(0, 7);
        return !ref || ref >= period.startIso.slice(0, 7) && ref <= period.endIso.slice(0, 7);
      });
      if (rowsInPeriod.length === 0) return { periodo: period.label, encontrado: false, motivo: "Nenhuma meta cadastrada no per\xEDodo." };
      const loans = await loadLoansAndPayments(ctx);
      const agg = aggregatesFor(ctx, loans, period);
      return {
        periodo: period.label,
        encontrado: true,
        metas: rowsInPeriod,
        realizado_no_periodo: {
          recebido: formatBRL(agg.receivedInPeriod.total),
          lucro_realizado: formatBRL(agg.realizedProfitInPeriod),
          contratos_iniciados: agg.contractsStartedInPeriod,
          principal_emprestado: formatBRL(agg.principalLentInPeriod)
        }
      };
    }
    default:
      return { erro: `Tool desconhecida: ${name}` };
  }
}

// supabase/functions/ai-assistant/index.ts
var MODEL_CHAIN = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"];
var AI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
var MAX_TOOL_STEPS = 6;
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
function buildSystemPrompt(params) {
  return `Voc\xEA \xE9 o EmprestAI, assistente financeiro s\xEAnior do aplicativo Emprestaii.

# Identidade
Voc\xEA conhece profundamente o produto E tem acesso aos dados reais do usu\xE1rio atrav\xE9s de tools.
Voc\xEA N\xC3O \xE9 um tutor gen\xE9rico: quando a pergunta envolve n\xFAmeros, voc\xEA consulta os dados antes de responder.

# Contexto atual
- Data de hoje: ${params.todayIso}
- Per\xEDodo padr\xE3o quando o usu\xE1rio n\xE3o especificar: ${params.periodLabel}
- Aba aberta no app: ${params.tab ?? "desconhecida"}
- Modo: ${params.mode ?? "n\xE3o informado"}

# Regras inviol\xE1veis
1. NUNCA invente n\xFAmeros. Todo valor citado deve vir de uma tool executada nesta conversa.
2. Se a tool n\xE3o retornar registros, diga explicitamente que n\xE3o encontrou registros no per\xEDodo \u2014 n\xE3o estime.
3. Sempre informe o per\xEDodo a que os valores se referem.
4. Formate dinheiro como R$ 1.234,56 (nunca abreviado).
5. Se a pergunta for amb\xEDgua (cliente, per\xEDodo ou m\xF3dulo), pergunte antes de consultar.
6. Nunca exiba tokens, chaves, IDs internos de credenciais ou dados de outros usu\xE1rios.
7. Ao explicar um c\xE1lculo, use as f\xF3rmulas oficiais do conhecimento abaixo \u2014 n\xE3o crie f\xF3rmulas pr\xF3prias.
8. Respostas curtas e diretas em portugu\xEAs do Brasil, com listas quando houver mais de dois n\xFAmeros.
9. Ao decompor um total, use apenas os campos de "composicao_*" devolvidos pela tool e respeite a f\xF3rmula indicada. Nunca liste "valor_vencido" como parcela da composi\xE7\xE3o do total a receber \u2014 ele \xE9 um recorte (parcelas vencidas), n\xE3o uma parcela som\xE1vel.

# Conhecimento de dom\xEDnio
${params.knowledge}`;
}
async function callModel(messages, apiKey) {
  let lastError = "";
  for (const model of MODEL_CHAIN) {
    const resp = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
        temperature: 0.2
      })
    });
    if (resp.ok) return await resp.json();
    lastError = `${resp.status} ${await resp.text()}`;
    if (resp.status === 404 || resp.status === 429 || resp.status >= 500) continue;
    break;
  }
  throw new Error(`AI request failed: ${lastError}`);
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);
    const userClient = createUserClient(authHeader);
    const { data: userRes, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;
    try {
      const allowed = await checkRateLimit({
        bucket: "ai-assistant",
        key: userId,
        max: 30,
        windowSecs: 300
      });
      if (!allowed) return rateLimitResponse(corsHeaders);
    } catch (e) {
      console.error("[ai-assistant] rate limit skipped:", e);
    }
    let ownerId = userId;
    try {
      const admin = getExternalAdmin();
      const { data: ownerRow } = await admin.rpc("get_data_owner_id", { _user_id: userId });
      if (typeof ownerRow === "string" && ownerRow) ownerId = ownerRow;
    } catch (e) {
      console.error("[ai-assistant] owner resolution fallback:", e);
    }
    const body = await req.json().catch(() => ({}));
    const question = String(body?.message ?? body?.question ?? "").trim().slice(0, 2e3);
    if (!question) return json({ error: "Mensagem vazia" }, 400);
    const history = Array.isArray(body?.history) ? body.history.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-10).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4e3) })) : [];
    const tab = body?.context?.tab ?? null;
    const mode = body?.context?.mode ?? null;
    const todayIso = String(body?.context?.today ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
    const defaultPeriod = resolvePeriod(body?.context?.period ?? null, todayIso);
    const domains = selectDomains(question, tab);
    const systemPrompt = buildSystemPrompt({
      knowledge: buildKnowledgeBlock(domains),
      todayIso,
      periodLabel: defaultPeriod.label,
      tab,
      mode
    });
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "GEMINI_API_KEY missing" }, 500);
    const ctx = { client: userClient, ownerId, todayIso };
    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: question }
    ];
    const toolsUsed = [];
    let reply = "";
    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      let data;
      try {
        data = await callModel(messages, apiKey);
      } catch (e) {
        console.error("[ai-assistant] model call failed:", e);
        return json({
          error: "Assistente indispon\xEDvel no momento (falha no provedor de IA).",
          detail: String(e?.message ?? e).slice(0, 500)
        }, 502);
      }
      const choice = data?.choices?.[0]?.message;
      if (!choice) break;
      const calls = choice.tool_calls ?? [];
      if (calls.length === 0) {
        reply = String(choice.content ?? "").trim();
        break;
      }
      messages.push({ role: "assistant", content: choice.content ?? null, tool_calls: calls });
      for (const call of calls) {
        const name = call?.function?.name ?? "";
        let args = {};
        try {
          args = JSON.parse(call?.function?.arguments || "{}");
        } catch {
          args = {};
        }
        toolsUsed.push(name);
        let result;
        try {
          result = await executeTool(name, args, ctx);
        } catch (error) {
          console.error(`[ai-assistant] tool ${name} failed:`, error);
          result = { erro: "N\xE3o foi poss\xEDvel consultar os dados agora." };
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 2e4)
        });
      }
    }
    if (!reply) {
      reply = "N\xE3o consegui concluir a consulta agora. Reformule a pergunta ou tente novamente em instantes.";
    }
    reply = redactSecrets(reply);
    if (missingPeriodDisclosure(reply)) {
      reply += `

_Per\xEDodo considerado: ${defaultPeriod.label}._`;
    }
    return json({
      reply,
      tools_used: toolsUsed,
      domains,
      period: defaultPeriod,
      learnable: isLearnableAnswer(question, reply)
    });
  } catch (error) {
    console.error("[ai-assistant] error:", error);
    return json({
      error: "Erro interno do assistente",
      detail: String(error?.message ?? error).slice(0, 500)
    }, 500);
  }
});
