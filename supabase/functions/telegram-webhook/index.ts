import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// ===== INLINED: interest-allocation.ts =====
/**
 * Alocação de juros pró-rata por parcela.
 *
 * Fonte única para reconhecer juros em pagamentos de empréstimos:
 * - Contratos parcelados (installments > 1): cada parcela reconhece
 *   `installmentAmount * ratio` como juros, onde
 *   `ratio = 1 - principal / totalWithInterest`. Na ÚLTIMA parcela do
 *   cronograma o valor absorve o resíduo de arredondamento para fechar
 *   exatamente `totalInterest`.
 * - Contrato de parcela única (installments === 1): mantém a regra
 *   antiga (todo o excedente sobre o principal é juros).
 * - Casos avulsos (installmentNumber ∈ {0, -2}): 100% juros.
 * - Amortização (-3): 0% juros.
 * - Parcial (-1): "juros primeiro" respeitando o saldo remanescente
 *   de juros do contrato.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

interface AllocLoanLike {
  id: string;
  amount: number;
  interestRate: number;
  installments: number;
  status?: string;
  originalAmount?: number | null;
}

interface AllocPaymentLike {
  id: string;
  loanId: string;
  amount: number;
  date?: string;
  installmentNumber: number;
  createdAt?: string;
  metadata?: Record<string, any> | null;
}

/**
 * Marca de versão da regra de alocação. Pagamentos parciais gravados com
 * este marcador em `metadata.allocation_version` foram calculados pela nova
 * regra proporcional (juros/principal proporcional aos SALDOS remanescentes
 * no momento do pagamento). O `metadata.interest_amount` correspondente é
 * definitivo — nunca recalculado depois.
 *
 * Pagamentos sem esse marcador seguem a regra legada "juros primeiro" e são
 * preservados exatamente como foram registrados no histórico.
 */
const ALLOCATION_VERSION_REMAINING_PRORATA = "remaining_balance_prorata" as const;

function readPersistedInterest(p: AllocPaymentLike): number | null {
  const md = (p.metadata ?? null) as any;
  if (!md) return null;
  const v = md.interest_amount;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

/**
 * Calcula a nova alocação proporcional para um pagamento parcial contra os
 * saldos remanescentes atuais (principal e juros). Retorna a parcela de
 * juros — o resto é principal. Nunca ultrapassa os saldos ou o próprio valor.
 */
function allocatePartialProrata(params: {
  amount: number;
  principalRemaining: number;
  interestRemaining: number;
}): { interest: number; principal: number } {
  const amt = Math.max(0, Number(params.amount) || 0);
  const iRem = Math.max(0, Number(params.interestRemaining) || 0);
  const pRem = Math.max(0, Number(params.principalRemaining) || 0);
  const totalRem = iRem + pRem;
  if (amt <= 0 || totalRem <= 0) return { interest: 0, principal: round2(Math.min(amt, pRem)) };
  const ratio = iRem / totalRem;
  let interest = round2(amt * ratio);
  interest = Math.min(interest, iRem, amt);
  let principal = round2(amt - interest);
  if (principal > pRem) {
    principal = pRem;
    interest = Math.min(iRem, round2(amt - principal));
  }
  return { interest: round2(interest), principal: round2(principal) };
}

function totalWithInterest(principal: number, rate: number): number {
  return Math.round(principal * (1 + rate / 100));
}

interface InstallmentBreakdownEntry {
  installmentNumber: number;
  amount: number;
  interest: number;
  principal: number;
}

/**
 * Constrói o cronograma de parcelas de UM contrato com o juros e o principal
 * já pré-calculados por parcela.
 *
 * Regra (spec oficial):
 *   jurosTotal        = total - principal
 *   jurosPorParcela   = round2(jurosTotal / N)          (parcelas 1..N-1)
 *   principalParcela  = round2(amount - jurosPorParcela)
 *   última parcela    = absorve o resíduo de centavos para fechar
 *                       Σ juros = jurosTotal e Σ principal = principal.
 *
 * Para cronogramas com parcelas de valores diferentes, passe `customAmounts`
 * na ordem das parcelas — o juros por parcela é distribuído proporcionalmente
 * ao valor da parcela; a última também absorve o resíduo.
 *
 * Uma vez gerado, cada entrada é a fonte oficial: pagou parcela K → some
 * `interest`/`principal` da entrada K. O(1) por pagamento.
 */
function buildInstallmentBreakdown(
  loan: Pick<AllocLoanLike, "amount" | "interestRate" | "installments">,
  customAmounts?: number[],
): InstallmentBreakdownEntry[] {
  const principal = Math.max(0, Number(loan.amount) || 0);
  const N = Math.max(1, Math.floor(Number(loan.installments) || 1));
  const rawTotal = totalWithInterest(principal, Number(loan.interestRate) || 0);

  if (N === 1) {
    const amt = customAmounts?.[0] ?? rawTotal;
    // Se o pago acordado (amt) for maior que principal+juros contratado,
    // o excedente é multa de renegociação e também deve ser reconhecido
    // como juros/receita (aparece em "Juros Recebidos").
    const totalInterest1 = Math.max(0, Math.max(rawTotal, amt) - principal);
    return [{ installmentNumber: 1, amount: round2(amt), interest: round2(totalInterest1), principal: round2(amt - totalInterest1) }];
  }

  const hasCustom = Array.isArray(customAmounts) && customAmounts.length === N;
  const amounts: number[] = hasCustom
    ? customAmounts!.map((v) => round2(Number(v) || 0))
    : Array.from({ length: N }, () => round2(rawTotal / N));
  const amountsSum = amounts.reduce((s, v) => s + v, 0);
  // Em contratos renegociados com multa, a multa é diluída nas parcelas,
  // então a soma real das parcelas ultrapassa `principal*(1+rate)`. O
  // excedente é receita adicional e precisa entrar no juros total.
  const total = hasCustom ? Math.max(rawTotal, amountsSum) : rawTotal;
  const totalInterest = Math.max(0, total - principal);

  const entries: InstallmentBreakdownEntry[] = [];
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

/**
 * Retorna o juros/principal pré-calculados para a parcela `installmentNumber`
 * do contrato. Lookup O(1) sobre o cronograma — evita recalcular histórico.
 */
function getInstallmentInterest(
  loan: Pick<AllocLoanLike, "amount" | "interestRate" | "installments">,
  installmentNumber: number,
  customAmounts?: number[],
): { interest: number; principal: number; amount: number } | null {
  if (!Number.isFinite(installmentNumber) || installmentNumber < 1) return null;
  const schedule = buildInstallmentBreakdown(loan, customAmounts);
  const entry = schedule.find((e) => e.installmentNumber === installmentNumber);
  return entry ? { interest: entry.interest, principal: entry.principal, amount: entry.amount } : null;
}

/**
 * Calcula parte de juros e principal para UM pagamento de parcela regular
 * (`installmentNumber >= 1`) de contrato parcelado. Lê do cronograma
 * pré-calculado (fonte oficial). `priorInterestAllocated` é usado apenas
 * como salvaguarda na última parcela.
 */
function computeInstallmentInterest(params: {
  principal: number;
  rate: number;
  installments: number;
  installmentAmount: number;
  installmentNumber: number;
  priorInterestAllocated: number;
}): { interestPart: number; principalPart: number } {
  const { principal, rate, installments, installmentAmount, installmentNumber, priorInterestAllocated } = params;
  const total = totalWithInterest(principal, rate);
  const totalInterest = Math.max(0, total - principal);

  if (installments <= 1) {
    const interestPart = Math.max(0, round2(Math.min(installmentAmount, totalInterest)));
    return { interestPart, principalPart: round2(installmentAmount - interestPart) };
  }

  // Fonte oficial: sempre lê o juros pré-calculado do cronograma da parcela K.
  // O `installmentAmount` afeta APENAS o principal reconhecido — descontos/
  // bônus/multas de atraso NÃO alteram o juros contratado da parcela.
  const schedule = buildInstallmentBreakdown({ amount: principal, interestRate: rate, installments });
  const scheduled = schedule.find((e) => e.installmentNumber === installmentNumber)
    ?? schedule[schedule.length - 1];
  if (scheduled) {
    const interestPart = Math.max(0, round2(scheduled.interest));
    const cappedInterest = Math.min(interestPart, Math.max(0, installmentAmount));
    return { interestPart: cappedInterest, principalPart: round2(installmentAmount - cappedInterest) };
  }
  // Fallback (contrato sem shape válido): usa razão global.
  const ratio = total > 0 ? Math.max(0, 1 - principal / total) : 0;
  const interestPart = round2(installmentAmount * ratio);
  return { interestPart, principalPart: round2(installmentAmount - interestPart) };
}

/**
 * Alocação global de juros por pagamento, seguindo a fórmula pró-rata
 * descrita acima. Retorna `Map<paymentId, interestAmount>`.
 *
 * Consumidores (Dashboard, Contador, Histórico do Cliente) devem
 * chamar esta função em vez de reimplementar a regra.
 */
function allocateInterestByPayment(
  loans: AllocLoanLike[],
  payments: AllocPaymentLike[],
): Map<string, number> {
  const byId = new Map<string, number>();
  const loanById = new Map(loans.map((l) => [l.id, l]));

  // Ordenação determinística: data → created_at → id (tie-break estável para
  // que a mesma coleção sempre produza o mesmo resultado, independente da
  // ordem devolvida pelo backend/cache/render).
  const sorted = [...payments].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return da.localeCompare(db);
    const ca = a.createdAt ?? "";
    const cb = b.createdAt ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return (a.id ?? "").localeCompare(b.id ?? "");
  });

  const priorInterestByLoan = new Map<string, number>();
  // Principal já reconhecido por contrato — usado em contratos de parcela
  // única (installments === 1) para calcular quanto do payoff é juros.
  // ATENÇÃO: mantém o comportamento HISTÓRICO (não inclui amortizações -3)
  // para preservar a composição de pagamentos legados.
  const priorPrincipalByLoan = new Map<string, number>();
  // Acumulador SEPARADO usado exclusivamente pelo cálculo pró-rata do
  // parcial NOVO: reflete o principal real reduzido no contrato (inclui
  // amortizações e parciais legados). Não afeta pagamentos históricos.
  const prorataPrincipalReducedByLoan = new Map<string, number>();
  // Saldo de juros restante por contrato (para casos parciais -1 "juros primeiro").
  const interestRemainingByLoan = new Map<string, number>();
  loans.forEach((l) => {
    const total = totalWithInterest(l.amount, l.interestRate);
    interestRemainingByLoan.set(l.id, Math.max(0, total - l.amount));
  });

  // Pré-cronograma por contrato com os valores REAIS pagos por parcela
  // (para suportar contratos com parcelas de valores diferentes, ex.: 300+270).
  // Parcelas ainda não pagas ficam com o valor uniforme como placeholder.
  const scheduleByLoan = new Map<string, ReturnType<typeof buildInstallmentBreakdown>>();
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
    // Sincroniza o saldo de juros com o cronograma real (que já inclui
    // eventual multa de renegociação diluída nas parcelas).
    const scheduledInterest = schedule.reduce((s, e) => s + e.interest, 0);
    interestRemainingByLoan.set(loan.id, Math.max(interestRemainingByLoan.get(loan.id) ?? 0, scheduledInterest));
  }

  for (const p of sorted) {
    const amt = Number(p.amount) || 0;
    if (amt <= 0) { byId.set(p.id, 0); continue; }

    const inst = p.installmentNumber;
    const loan = loanById.get(p.loanId);

    // Casos avulsos
    if (inst === 0 || inst === -2) {
      byId.set(p.id, round2(amt));
      const rem = interestRemainingByLoan.get(p.loanId) ?? 0;
      interestRemainingByLoan.set(p.loanId, Math.max(0, rem - amt));
      continue;
    }
    if (inst === -3) {
      byId.set(p.id, 0);
      // Amortização reduz o principal APENAS no acumulador pró-rata (usado
      // por parciais NOVOS). Não toca `priorPrincipalByLoan` para não
      // alterar a composição histórica de contratos de parcela única ou
      // parciais legados.
      prorataPrincipalReducedByLoan.set(
        p.loanId,
        (prorataPrincipalReducedByLoan.get(p.loanId) ?? 0) + amt,
      );
      continue;
    }

    if (!loan) {
      byId.set(p.id, round2(amt));
      continue;
    }

    // Parcial (-1): 4 caminhos, em ordem de prioridade —
    //   1) Marcador de nova versão + `interest_amount`/`principal_amount`
    //      persistidos e VÁLIDOS (soma = valor ± R$ 0,01, ambos ≥ 0):
    //      valor definitivo, nunca recalculado.
    //   2) Marcador de nova versão com valores AUSENTES/INVÁLIDOS: erro de
    //      integridade — não recalcula silenciosamente; usa a legada como
    //      fallback visual e sinaliza no console para correção.
    //   3) Sem marcador (legado): mantém "juros primeiro" — histórico intocado.
    if (inst === -1) {
      const iRemBefore = interestRemainingByLoan.get(p.loanId) ?? 0;
      const persisted = readPersistedInterest(p);
      const md = (p.metadata ?? null) as any;
      const version = md?.allocation_version;
      const persistedPrincipal = md?.principal_amount != null ? Number(md.principal_amount) : null;
      let interest = 0;

      if (version === ALLOCATION_VERSION_REMAINING_PRORATA) {
        const valid =
          persisted != null
          && persistedPrincipal != null
          && Number.isFinite(persistedPrincipal)
          && persistedPrincipal >= -0.005
          && Math.abs((persisted + persistedPrincipal) - amt) <= 0.01;
        if (valid) {
          interest = Math.min(persisted!, amt);
        } else {
          // Integridade violada — não recalcula pró-rata silenciosamente
          // (o resultado divergiria do que foi persistido no ledger). Cai
          // no legado como fallback visual e alerta.
          // eslint-disable-next-line no-console
          console.error(
            "[interestAllocation] pagamento parcial marcado como nova versão sem interest_amount/principal_amount válidos — corrigir metadata",
            { paymentId: p.id, loanId: p.loanId, amount: amt, persisted, persistedPrincipal },
          );
          interest = round2(Math.min(iRemBefore, amt));
        }
      } else if (persisted != null) {
        // Pagamento legado que já traz interest_amount persistido (ex.:
        // gerado por regra antiga que gravava valor no metadata): honra.
        interest = Math.min(persisted, amt);
      } else {
        // Legado puro: juros primeiro.
        interest = round2(Math.min(iRemBefore, amt));
      }
      byId.set(p.id, interest);
      interestRemainingByLoan.set(p.loanId, Math.max(0, round2(iRemBefore - interest)));
      priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + interest);
      const principalPart = Math.max(0, round2(amt - interest));
      prorataPrincipalReducedByLoan.set(
        p.loanId,
        (prorataPrincipalReducedByLoan.get(p.loanId) ?? 0) + principalPart,
      );
      continue;
    }

    // Parcela regular — lê juros do cronograma real, mas SEMPRE limitado ao
    // saldo remanescente de juros do contrato. Sem esse cap, pagamentos
    // parciais anteriores (-1) que já consumiram juros seriam contados de
    // novo quando a parcela final fosse quitada.
    const schedule = scheduleByLoan.get(p.loanId);
    let interestPart = 0;
    const remBefore = interestRemainingByLoan.get(p.loanId) ?? 0;
    if (schedule) {
      const entry = schedule.find((e) => e.installmentNumber === inst) ?? schedule[schedule.length - 1];
      interestPart = Math.max(0, Math.min(round2(entry.interest), amt, remBefore));
    } else {
      // Contrato de parcela única (installments === 1). Aqui `remBefore` NÃO
      // pode ser usado como cap: pagamentos de juros avulsos (inst=0) de
      // ciclos anteriores já zeraram o saldo de juros "de um ciclo", mas o
      // contrato pode ter rodado vários ciclos. Regra: o excedente sobre o
      // principal do contrato é juros do ciclo final; o restante é principal.
      const principalRemaining = Math.max(
        0,
        round2((loan.amount || 0) - (priorPrincipalByLoan.get(p.loanId) ?? 0)),
      );
      const principalPart = Math.min(amt, principalRemaining);
      interestPart = Math.max(0, round2(amt - principalPart));
    }
    byId.set(p.id, interestPart);
    priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + interestPart);
    interestRemainingByLoan.set(p.loanId, Math.max(0, remBefore - interestPart));
    priorPrincipalByLoan.set(
      p.loanId,
      (priorPrincipalByLoan.get(p.loanId) ?? 0) + Math.max(0, round2(amt - interestPart)),
    );
    prorataPrincipalReducedByLoan.set(
      p.loanId,
      (prorataPrincipalReducedByLoan.get(p.loanId) ?? 0) + Math.max(0, round2(amt - interestPart)),
    );
  }

  // Reconciliação para contratos quitados (`paid`):
  // 1) Resíduos ≤ R$ 0,02 → fecha na última parcela (arredondamentos).
  // 2) Quando um único pagamento quita várias parcelas restantes (ex.: payoff),
  //    o alocador regular só reconhece o juros de UMA entrada do cronograma;
  //    o restante do juros contratado deve ser atribuído a esse pagamento
  //    final, respeitando o valor pago (não pode exceder o próprio pagamento
  //    menos o que ele já reconheceu como juros).
  // Descontos/bônus reais permanecem como principal (o `diff` positivo só
  // aparece quando faltou juros — se o cliente pagou menos que o esperado,
  // `diff` será negativo e não fazemos nada).
  const lastPaymentByLoan = new Map<string, { id: string; amount: number }>();
  sorted.forEach((p) => { lastPaymentByLoan.set(p.loanId, { id: p.id, amount: Number(p.amount) || 0 }); });

  const paymentAmountById = new Map<string, number>();
  payments.forEach((p) => paymentAmountById.set(p.id, Number(p.amount) || 0));

  for (const loan of loans) {
    if (loan.status !== "paid") continue;
    const last = lastPaymentByLoan.get(loan.id);
    if (!last) continue;
    const total = totalWithInterest(loan.amount, loan.interestRate);
    // Considera também juros do cronograma real (inclui multa de renegociação
    // diluída nas parcelas), para não deixar penalidade sem alocação.
    const scheduled = scheduleByLoan.get(loan.id);
    const scheduledInterest = scheduled ? scheduled.reduce((s, e) => s + e.interest, 0) : 0;
    const expectedInterest = Math.max(0, Math.max(total - loan.amount, scheduledInterest));
    const allocated = payments
      .filter((p) => p.loanId === loan.id)
      .reduce((s, p) => s + (byId.get(p.id) ?? 0), 0);
    const diff = round2(expectedInterest - allocated);
    if (diff <= 0) continue;
    const cur = byId.get(last.id) ?? 0;
    const cap = Math.max(0, round2(last.amount - cur));
    const add = Math.min(diff, cap);
    if (add > 0) byId.set(last.id, round2(cur + add));
  }

  return byId;
}

// ===== END INLINED =====


const TZ = "America/Sao_Paulo";

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function todayInTZ(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthBounds(date = todayInTZ()): { start: string; end: string; prefix: string } {
  const [year, month] = date.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end, prefix: `${year}-${String(month).padStart(2, "0")}` };
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.floor((b - a) / 86_400_000);
}

function inMonth(date: string | null | undefined, month: string): boolean {
  return !!date && String(date).slice(0, 7) === month;
}

function num(value: unknown): number {
  return Number(value || 0);
}

function totalWithInterestLoan(loan: any): number {
  return Math.round(num(loan.amount) * (1 + num(loan.interest_rate) / 100));
}

function calcLateFees(loan: any, baseAmount: number, daysOverdue: number): number {
  if (daysOverdue <= 0) return 0;
  const lateValue = num(loan.late_interest_value);
  const lateInterest = lateValue > 0
    ? loan.late_interest_type === "fixed"
      ? lateValue * daysOverdue
      : baseAmount * (lateValue / 100) * daysOverdue
    : 0;
  const penalty = num(loan.penalty_value);
  return lateInterest + (penalty > 0 ? penalty : 0);
}

const REPORT_COMMANDS = new Set([
  "relatorios", "dashboard",
  "kpi_geral", "carteira_ativa",
  "inadimplencia",
  "resumo_operacional", "resumooperacional", "operacional",
]);

function parseReportCommand(text: string): string | null {
  const normalized = text.trim().replace(/\\_/g, "_");
  const match = normalized.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+(.+))?\s*$/i);
  if (!match) return null;
  const command = match[1].toLowerCase();
  if (!REPORT_COMMANDS.has(command)) return null;
  const arg = (match[2] || "").trim();
  return arg ? `${command}|${arg}` : command;
}

function renderMenu(brand = "Relatórios"): string {
  return [
    `📊 *${brand} — Menu de Relatórios*`,
    "",
    "Use um dos comandos abaixo:",
    "",
    "*Relatórios do Negócio*",
    "/resumo\\_operacional — Resumo operacional consolidado",
    "/dashboard — Visão executiva consolidada",
    "/kpi\\_geral — Indicadores principais",
    "/carteira\\_ativa — Capital e pendências",
    "/inadimplencia — Taxa e faixas de atraso",
  ].join("\n");
}

interface Ctx {
  supabase: any;
  userId: string;
  today: string;
}

interface Snapshot {
  loans: any[];
  installments: any[];
  payments: any[];
  clients: any[];
  active: any[];
  totalLent: number;
  totalToReceive: number;
  pendingReceivable: number;
  estimatedProfit: number;
  overdueLoans: number;
}

async function loadLoans(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase.from("loans").select("*").eq("user_id", ctx.userId);
  if (error) throw error;
  return data ?? [];
}

async function loadInstallments(ctx: Ctx, loanIds: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < loanIds.length; i += 50) {
    const chunk = loanIds.slice(i, i + 50);
    const { data, error } = await ctx.supabase
      .from("loan_installments")
      .select("loan_id, installment_number, amount, due_date")
      .in("loan_id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function loadPayments(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase
    .from("payments")
    .select("id, loan_id, amount, date, installment_number, created_at, metadata")
    .eq("user_id", ctx.userId)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadClients(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase
    .from("clients")
    .select("id, name, phone, active, created_at")
    .eq("user_id", ctx.userId);
  if (error) throw error;
  return data ?? [];
}

function dueEntriesForLoan(loan: any, installments: any[]) {
  const count = Math.max(1, num(loan.installments) || 1);
  const total = totalWithInterestLoan(loan);
  const installmentValue = total / count;
  const paidInstallments = num(loan.paid_installments);
  const schedules = installments
    .filter((schedule) => schedule.loan_id === loan.id)
    .sort((a, b) => num(a.installment_number) - num(b.installment_number));

  if (schedules.length > 0) {
    return schedules.map((schedule) => ({
      loan_id: loan.id,
      installment_number: num(schedule.installment_number),
      due_date: schedule.due_date,
      amount: num(schedule.amount) || installmentValue,
      paid: loan.status === "paid" || schedule.paid === true || num(schedule.installment_number) <= paidInstallments,
    }));
  }

  if (count <= 1) {
    return [{
      loan_id: loan.id,
      installment_number: 1,
      due_date: loan.due_date,
      amount: total,
      paid: loan.status === "paid" || paidInstallments >= 1,
    }];
  }

  const base = new Date(`${String(loan.due_date).slice(0, 10)}T00:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const due = new Date(base.getFullYear(), base.getMonth() + index, base.getDate());
    return {
      loan_id: loan.id,
      installment_number: index + 1,
      due_date: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
      amount: installmentValue,
      paid: loan.status === "paid" || index + 1 <= paidInstallments,
    };
  });
}

function paymentsInRange(payments: any[], from: string, to: string): any[] {
  return payments.filter((payment) => payment.date >= from && payment.date <= to);
}

function totalPaidByLoan(payments: any[]): Record<string, number> {
  return payments.reduce<Record<string, number>>((acc, payment) => {
    acc[payment.loan_id] = (acc[payment.loan_id] || 0) + num(payment.amount);
    return acc;
  }, {});
}

function getOverdueByLoan(ctx: Ctx, snap: Snapshot) {
  const paidByLoan = totalPaidByLoan(snap.payments);
  const overdue = new Map<string, { value: number; oldest: string }>();

  for (const loan of snap.loans) {
    const count = Math.max(1, num(loan.installments) || 1);
    for (const entry of dueEntriesForLoan(loan, snap.installments)) {
      if (entry.paid || !entry.due_date || entry.due_date >= ctx.today) continue;
      const fallbackRemaining = Math.max(0, totalWithInterestLoan(loan) - (paidByLoan[loan.id] || 0));
      const value = count === 1 ? Math.max(0, num(loan.remaining_amount) || fallbackRemaining) : entry.amount;
      const current = overdue.get(loan.id) ?? { value: 0, oldest: entry.due_date };
      current.value += value;
      if (entry.due_date < current.oldest) current.oldest = entry.due_date;
      overdue.set(loan.id, current);
    }
  }

  return overdue;
}

function computeDefaultRate(ctx: Ctx, snap: Snapshot, month: string): number {
  const paidByLoan = totalPaidByLoan(snap.payments);
  let portfolio = 0;
  let overdue = 0;

  for (const loan of snap.loans) {
    const count = Math.max(1, num(loan.installments) || 1);
    for (const entry of dueEntriesForLoan(loan, snap.installments)) {
      if (!inMonth(entry.due_date, month)) continue;
      portfolio += entry.amount;
      if (entry.paid || entry.due_date >= ctx.today) continue;
      if (count === 1) {
        const fallbackRemaining = Math.max(0, totalWithInterestLoan(loan) - (paidByLoan[loan.id] || 0));
        overdue += Math.max(0, num(loan.remaining_amount) || fallbackRemaining);
      } else {
        overdue += entry.amount;
      }
    }
  }

  return portfolio > 0 ? (overdue / portfolio) * 100 : 0;
}

function computeExpectedReceivable(loans: any[], month: string): number {
  return loans.reduce((sum, loan) => {
    const count = Math.max(1, num(loan.installments) || 1);
    const total = totalWithInterestLoan(loan);
    if (count <= 1) return inMonth(loan.due_date, month) ? sum + total : sum;

    const [year, startMonth, day] = String(loan.start_date || "").split("-").map(Number);
    if (!year || !startMonth || !day) return sum;
    const installmentValue = total / count;
    let monthlyTotal = 0;
    for (let i = 0; i < count; i++) {
      const due = new Date(year, (startMonth - 1) + (i + 1), day);
      const key = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
      if (key === month) monthlyTotal += installmentValue;
    }
    return sum + monthlyTotal;
  }, 0);
}

function computeProfitRealized(loans: any[], payments: any[], month: string): number {
  const allocLoans = loans.map((l) => ({
    id: String(l.id),
    amount: num(l.amount),
    interestRate: num(l.interest_rate),
    installments: Math.max(1, Math.floor(num(l.installments) || 1)),
    status: l.status,
    originalAmount: l.original_amount != null ? Number(l.original_amount) : null,
  }));
  const allocPayments = payments.map((p) => ({
    id: String(p.id),
    loanId: String(p.loan_id),
    amount: num(p.amount),
    date: p.date ?? undefined,
    installmentNumber: num(p.installment_number),
    createdAt: p.created_at ?? undefined,
    metadata: (p.metadata ?? null) as Record<string, any> | null,
  }));
  const interestByPayment = allocateInterestByPayment(allocLoans, allocPayments);
  return payments
    .filter((payment) => inMonth(payment.date, month))
    .reduce((sum, payment) => sum + (interestByPayment.get(String(payment.id)) ?? 0), 0);
}


async function snapshot(ctx: Ctx): Promise<Snapshot> {
  const [loans, clients, payments] = await Promise.all([loadLoans(ctx), loadClients(ctx), loadPayments(ctx)]);
  const installments = await loadInstallments(ctx, loans.map((loan) => loan.id));
  const active = loans.filter((loan) => loan.status !== "paid");
  // Capital na rua = principal proporcional ao número de parcelas em aberto
  // (espelha a lógica do card "Capital na Rua" do app).
  const totalLent = active.reduce((sum, loan) => {
    const n = num(loan.installments) > 0 ? num(loan.installments) : 1;
    const paid = Math.min(num(loan.paid_installments), n);
    const remainingRatio = Math.max(0, (n - paid) / n);
    return sum + num(loan.amount) * remainingRatio;
  }, 0);
  const totalToReceive = active.reduce((sum, loan) => {
    const total = totalWithInterestLoan(loan);
    const dueDate = new Date(`${loan.due_date}T00:00:00`);
    const today = new Date(`${ctx.today}T00:00:00`);
    const daysLate = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000));
    const paidForLoan = payments.filter((payment) => payment.loan_id === loan.id).reduce((s, payment) => s + num(payment.amount), 0);
    const baseRemaining = num(loan.remaining_amount) > 0 ? num(loan.remaining_amount) : Math.max(0, total - paidForLoan);
    let lateFees = 0;
    if (num(loan.late_interest_value) > 0 && daysLate > 0) {
      lateFees += loan.late_interest_type === "fixed"
        ? num(loan.late_interest_value) * daysLate
        : baseRemaining * (num(loan.late_interest_value) / 100) * daysLate;
    }
    if (num(loan.penalty_value) > 0 && daysLate > 0) lateFees += num(loan.penalty_value);
    const interestPaymentsReceived = payments
      .filter((payment) => payment.loan_id === loan.id && num(payment.installment_number) === 0)
      .reduce((s, payment) => s + num(payment.amount), 0);
    return sum + Math.round((total + lateFees + interestPaymentsReceived) * 100) / 100;
  }, 0);
  const pendingReceivable = active.reduce((sum, loan) => sum + num(loan.remaining_amount), 0);
  const estimatedProfit = pendingReceivable - totalLent;
  const overdueLoans = loans.filter((loan) => loan.status === "overdue" && loan.due_date < ctx.today).length;

  return { loans, installments, payments, clients, active, totalLent, totalToReceive, pendingReceivable, estimatedProfit, overdueLoans };
}

async function recebimentosHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const payments = paymentsInRange(snap.payments, ctx.today, ctx.today);
  const total = payments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const byClient = new Map<string, number>();
  for (const payment of payments) {
    const loan = snap.loans.find((item) => item.id === payment.loan_id);
    const name = loan?.borrower_name || "—";
    byClient.set(name, (byClient.get(name) ?? 0) + num(payment.amount));
  }
  const dueEntries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments));
  const dueToday = dueEntries.filter((entry) => entry.due_date === ctx.today);

  const lines = [
    `📅 *Recebimentos de hoje* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `💰 Total recebido: *${fmtBRL(total)}*`,
    `🧾 Pagamentos: *${payments.length}*`,
  ];
  if (byClient.size > 0) {
    lines.push("", "*Clientes que pagaram:*");
    for (const [name, value] of [...byClient.entries()].sort((a, b) => b[1] - a[1])) lines.push(`• ${name} — ${fmtBRL(value)}`);
  }
  lines.push("", `📆 Parcelas com vencimento hoje: *${dueToday.length}* (pendentes: ${dueToday.filter((entry) => !entry.paid).length})`);
  lines.push(`⏳ Parcelas pendentes totais: *${dueEntries.filter((entry) => !entry.paid).length}*`);
  return lines.join("\n");
}

async function carteiraAtiva(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdueCount = getOverdueByLoan(ctx, snap).size;
  return [
    "💰 *Carteira Ativa*",
    "",
    `📤 Capital na rua: *${fmtBRL(snap.totalLent)}*`,
    `⏳ Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `📈 Lucro estimado: *${fmtBRL(snap.estimatedProfit)}*`,
    `📑 Empréstimos ativos: *${snap.active.length}*`,
    overdueCount > 0 ? `🚨 Em atraso: *${overdueCount}*` : "✅ Nenhum empréstimo em atraso",
  ].join("\n");
}

async function emprestimosAtrasados(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const sorted = [...overdue.entries()]
    .map(([loanId, item]) => {
      const loan = snap.loans.find((entry) => entry.id === loanId);
      const days = daysBetween(item.oldest, ctx.today);
      const fees = loan ? calcLateFees(loan, item.value, days) : 0;
      return { name: loan?.borrower_name || "—", days, value: item.value + fees };
    })
    .sort((a, b) => b.days - a.days);
  const total = sorted.reduce((sum, r) => sum + r.value, 0);
  const lines = ["🚨 *Empréstimos em Atraso*", "", `📑 Contratos: *${overdue.size}*`, `💸 Valor em atraso (com juros/multa): *${fmtBRL(total)}*`];
  if (overdue.size === 0) return [...lines, "", "_Nenhum contrato em atraso. 🎉_"].join("\n");

  lines.push("", "*Clientes:*");

  const nameWidth = Math.min(14, Math.max(...sorted.map((r) => r.name.length)));
  const daysWidth = Math.max(...sorted.map((r) => `${r.days}d`.length));
  const valueWidth = Math.max(...sorted.map((r) => fmtBRL(r.value).length));
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
  const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

  for (const row of sorted) {
    const shortName = row.name.length > nameWidth ? row.name.slice(0, nameWidth) : row.name;
    const marker = row.days > 20 ? " 🔴" : "";
    lines.push(`\`${pad(shortName, nameWidth)} ${padL(`${row.days}d`, daysWidth)} ${padL(fmtBRL(row.value), valueWidth)}\`${marker}`);
  }
  return lines.join("\n");
}

async function vencimentosHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const rows = snap.loans.flatMap((loan) =>
    dueEntriesForLoan(loan, snap.installments)
      .filter((e) => e.due_date === ctx.today && !e.paid)
      .map((e) => ({ name: loan.borrower_name || "—", value: num(e.amount) }))
  );
  const total = rows.reduce((s, r) => s + r.value, 0);
  const dateBR = ctx.today.split("-").reverse().join("/");
  const lines = [`📆 *Vencem hoje — ${dateBR}*`, "", `📑 Contratos: *${rows.length}*`, `💰 Valor previsto: *${fmtBRL(total)}*`];
  if (rows.length === 0) return [...lines, "", "_Nenhum vencimento para hoje. 🎉_"].join("\n");

  lines.push("", "*Clientes:*");
  const sorted = rows.sort((a, b) => b.value - a.value);

  const nameWidth = Math.min(14, Math.max(...sorted.map((r) => r.name.length)));
  const valueWidth = Math.max(...sorted.map((r) => fmtBRL(r.value).length));
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
  const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

  for (const row of sorted) {
    const shortName = row.name.length > nameWidth ? row.name.slice(0, nameWidth) : row.name;
    lines.push(`\`${pad(shortName, nameWidth)} ${padL(fmtBRL(row.value), valueWidth)}\``);
  }
  return lines.join("\n");
}

async function inadimplencia(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { prefix } = monthBounds(ctx.today);
  const overdue = getOverdueByLoan(ctx, snap);
  const overdueValue = [...overdue.values()].reduce((sum, item) => sum + item.value, 0);
  const buckets = { b1: 0, b2: 0, b3: 0, b4: 0 };
  for (const item of overdue.values()) {
    const days = daysBetween(item.oldest, ctx.today);
    if (days <= 30) buckets.b1 += item.value;
    else if (days <= 60) buckets.b2 += item.value;
    else if (days <= 90) buckets.b3 += item.value;
    else buckets.b4 += item.value;
  }

  return [
    "📉 *Inadimplência*",
    "",
    `💼 Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `⚠️ Valor vencido em aberto: *${fmtBRL(overdueValue)}*`,
    `📊 Taxa do mês (igual Metas): *${computeDefaultRate(ctx, snap, prefix).toFixed(2)}%*`,
    "",
    "*Faixas de atraso:*",
    `• 1–30 dias: ${fmtBRL(buckets.b1)}`,
    `• 31–60 dias: ${fmtBRL(buckets.b2)}`,
    `• 61–90 dias: ${fmtBRL(buckets.b3)}`,
    `• 90+ dias: ${fmtBRL(buckets.b4)}`,
  ].join("\n");
}

async function resumoDiario(ctx: Ctx, snap: Snapshot): Promise<string> {
  const newLoans = snap.loans.filter((loan) => loan.start_date === ctx.today);
  const payments = paymentsInRange(snap.payments, ctx.today, ctx.today);
  const dueToday = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments)).filter((entry) => entry.due_date === ctx.today).length;

  return [
    `📅 *Resumo do dia* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `🆕 Novos empréstimos: *${newLoans.length}*`,
    `📤 Valor emprestado hoje: *${fmtBRL(newLoans.reduce((sum, loan) => sum + num(loan.amount), 0))}*`,
    `💰 Recebimentos: *${fmtBRL(payments.reduce((sum, payment) => sum + num(payment.amount), 0))}* (${payments.length})`,
    `📆 Parcelas vencendo hoje: *${dueToday}*`,
    `✅ Pagamentos registrados hoje: *${payments.length}*`,
    `🚨 Contratos inadimplentes: *${getOverdueByLoan(ctx, snap).size}*`,
  ].join("\n");
}

async function resumoMensal(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const newLoans = snap.loans.filter((loan) => loan.start_date >= start && loan.start_date <= end);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const interest = computeProfitRealized(snap.loans, snap.payments, prefix);
  const expected = computeExpectedReceivable(snap.loans, prefix);
  const paidOff = snap.loans.filter((loan) => {
    if (loan.status !== "paid") return false;
    const last = snap.payments.filter((payment) => payment.loan_id === loan.id).map((payment) => String(payment.date || "")).sort().pop();
    return !!last && last >= start && last <= end;
  }).length;

  return [
    `📆 *Resumo mensal* — ${prefix.split("-").reverse().join("/")}`,
    "",
    `🆕 Novos contratos: *${newLoans.length}*`,
    `📤 Valor emprestado: *${fmtBRL(newLoans.reduce((sum, loan) => sum + num(loan.amount), 0))}*`,
    `💰 Valor recebido: *${fmtBRL(received)}*`,
    `📌 Previsto no mês: *${fmtBRL(expected)}*`,
    `📈 Juros recebidos: *${fmtBRL(interest)}*`,
    `✅ Contratos quitados: *${paidOff}*`,
    `🚨 Contratos em atraso: *${getOverdueByLoan(ctx, snap).size}*`,
    `🎯 Faturamento do período: *${(expected > 0 ? (received / expected) * 100 : 0).toFixed(2)}%*`,
    `📊 Rentabilidade s/ carteira: *${(snap.totalLent > 0 ? (interest / snap.totalLent) * 100 : 0).toFixed(2)}%*`,
  ].join("\n");
}

async function dashboard(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const activeClients = snap.clients.filter((client) => client.active !== false).length;
  const overdueCount = getOverdueByLoan(ctx, snap).size;

  return [
    "📊 *Dashboard Executivo*",
    "",
    "*Visão geral*",
    `👥 Clientes ativos: *${activeClients}*`,
    `📑 Empréstimos ativos: *${snap.active.length}*`,
    `🚨 Contratos em atraso: *${overdueCount}*`,
    "",
    "*Financeiro do mês*",
    `📤 Capital na rua: *${fmtBRL(snap.totalLent)}*`,
    `💰 Recebido no mês: *${fmtBRL(received)}*`,
    `⏳ Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `💎 Lucro estimado: *${fmtBRL(snap.estimatedProfit)}*`,
  ].join("\n");
}

async function kpiGeral(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const interest = computeProfitRealized(snap.loans, snap.payments, prefix);
  const defaultRate = computeDefaultRate(ctx, snap, prefix);
  const avgTicket = snap.active.length > 0 ? snap.pendingReceivable / snap.active.length : 0;
  const portfolioYield = snap.totalLent > 0 ? (interest / snap.totalLent) * 100 : 0;
  const collectionRate = snap.pendingReceivable + received > 0
    ? (received / (received + snap.pendingReceivable)) * 100
    : 0;
  const overdueCount = getOverdueByLoan(ctx, snap).size;
  const overdueRatio = snap.active.length > 0 ? (overdueCount / snap.active.length) * 100 : 0;

  return [
    "📈 *KPIs Gerais*",
    "",
    "*Performance da carteira*",
    `🎯 Ticket médio: *${fmtBRL(avgTicket)}*`,
    `💎 Rentabilidade: *${portfolioYield.toFixed(2)}%*`,
    `📈 Juros recebidos no mês: *${fmtBRL(interest)}*`,
    "",
    "*Cobrança e inadimplência*",
    `📊 Taxa de inadimplência: *${defaultRate.toFixed(2)}%*`,
    `🚨 Contratos em atraso: *${overdueCount}* (${overdueRatio.toFixed(1)}% da carteira)`,
    `✅ Eficiência de cobrança: *${collectionRate.toFixed(2)}%*`,
  ].join("\n");
}

function phoneByName(snap: Snapshot, name: string): string {
  const c = snap.clients.find((cl) => (cl.name || "").toLowerCase() === (name || "").toLowerCase());
  return c?.phone ? ` 📞 ${c.phone}` : "";
}

async function topClientes(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const stats = new Map<string, { lent: number; paid: number; overdue: number; days: number }>();
  for (const loan of snap.loans) {
    const name = loan.borrower_name || "—";
    const s = stats.get(name) ?? { lent: 0, paid: 0, overdue: 0, days: 0 };
    s.lent += num(loan.amount);
    s.paid += snap.payments.filter((p) => p.loan_id === loan.id).reduce((a, p) => a + num(p.amount), 0);
    const od = overdue.get(loan.id);
    if (od) {
      s.overdue += od.value;
      s.days = Math.max(s.days, daysBetween(od.oldest, ctx.today));
    }
    stats.set(name, s);
  }
  const arr = [...stats.entries()].map(([name, s]) => ({ name, ...s }));
  const best = [...arr].filter((x) => x.paid > 0).sort((a, b) => b.paid - a.paid).slice(0, 5);
  const worst = [...arr].filter((x) => x.overdue > 0).sort((a, b) => b.days - a.days || b.overdue - a.overdue).slice(0, 5);
  const lines = ["🏆 *Top Clientes*", "", "*Melhores pagadores*"];
  if (best.length === 0) lines.push("_Sem dados._");
  for (const b of best) {
    lines.push(`• ${b.name} — pago ${fmtBRL(b.paid)} / emprestado ${fmtBRL(b.lent)}`);
  }
  lines.push("", "*Maiores devedores*");
  if (worst.length === 0) lines.push("_Nenhum cliente em atraso. 🎉_");
  for (const w of worst) lines.push(`• ${w.name} — ${w.days}d em atraso — ${fmtBRL(w.overdue)}`);
  return lines.join("\n");
}

async function vencimentosSemana(ctx: Ctx, snap: Snapshot): Promise<string> {
  const start = new Date(`${ctx.today}T00:00:00`);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const entries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments).map((e) => ({ ...e, borrower: loan.borrower_name || "—" })));
  const upcoming = entries
    .filter((e) => !e.paid && e.due_date >= ctx.today && e.due_date <= endStr)
    .sort(
      (a, b) => a.due_date.localeCompare(b.due_date) || b.amount - a.amount || a.borrower.localeCompare(b.borrower),
    );
  const total = upcoming.reduce((s, e) => s + e.amount, 0);
  const lines = [`📆 *Vencimentos — próximos 7 dias*`, "", `📑 Parcelas: *${upcoming.length}* — Total: *${fmtBRL(total)}*`];
  if (upcoming.length === 0) return [...lines, "", "_Nada a vencer no período._"].join("\n");

  const byDay = new Map<string, typeof upcoming>();
  for (const it of upcoming) {
    if (!byDay.has(it.due_date)) byDay.set(it.due_date, [] as any);
    byDay.get(it.due_date)!.push(it);
  }
  for (const [day, items] of byDay) {
    items.sort((a, b) => b.amount - a.amount || a.borrower.localeCompare(b.borrower));
    const dayTotal = items.reduce((s, e) => s + e.amount, 0);
    lines.push("", `*${day.split("-").reverse().join("/")}* — ${items.length} parcela(s) — ${fmtBRL(dayTotal)}`);
    for (const it of items) {
      lines.push(`• ${it.borrower} — ${fmtBRL(it.amount)}`);
    }
  }
  return lines.join("\n");
}

async function projecaoMes(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((s, p) => s + num(p.amount), 0);
  const entries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments));
  const monthEntries = entries.filter((e) => inMonth(e.due_date, prefix) && !e.paid);
  const remainingMonth = monthEntries.filter((e) => e.due_date >= ctx.today).reduce((s, e) => s + e.amount, 0);
  const overdueInMonth = monthEntries.filter((e) => e.due_date < ctx.today).reduce((s, e) => s + e.amount, 0);
  const expected = computeExpectedReceivable(snap.loans, prefix);
  const projected = received + remainingMonth + overdueInMonth;
  return [
    `📡 *Projeção de Caixa — ${prefix.split("-").reverse().join("/")}*`,
    "",
    `📌 Previsto no mês: *${fmtBRL(expected)}*`,
    `💰 Já recebido: *${fmtBRL(received)}*`,
    `📆 A vencer ainda no mês: *${fmtBRL(remainingMonth)}*`,
    `🚨 Atrasado (mês corrente): *${fmtBRL(overdueInMonth)}*`,
    `🎯 Projeção final: *${fmtBRL(projected)}*`,
    `📊 Realizado vs previsto: *${(expected > 0 ? (received / expected) * 100 : 0).toFixed(1)}%*`,
  ].join("\n");
}

async function novosContratos(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const newLoans = snap.loans.filter((l) => l.start_date >= start && l.start_date <= end);
  const totalLent = newLoans.reduce((s, l) => s + num(l.amount), 0);
  const avgRate = newLoans.length > 0 ? newLoans.reduce((s, l) => s + num(l.interest_rate), 0) / newLoans.length : 0;
  const avgTerm = newLoans.length > 0 ? newLoans.reduce((s, l) => s + (num(l.installments) || 1), 0) / newLoans.length : 0;
  const existingNames = new Set(snap.loans.filter((l) => l.start_date < start).map((l) => l.borrower_name));
  const newClients = new Set(newLoans.filter((l) => !existingNames.has(l.borrower_name)).map((l) => l.borrower_name));
  const lines = [
    `🆕 *Novos Contratos — ${prefix.split("-").reverse().join("/")}*`,
    "",
    `📑 Contratos: *${newLoans.length}*`,
    `📤 Volume emprestado: *${fmtBRL(totalLent)}*`,
    `📈 Taxa média: *${avgRate.toFixed(2)}%*`,
    `📅 Prazo médio: *${avgTerm.toFixed(1)} parcelas*`,
    `👥 Clientes novos: *${newClients.size}* / recorrentes: *${newLoans.length - newClients.size}*`,
  ];
  if (newLoans.length > 0) {
    lines.push("", "*Contratos:*");
    for (const l of newLoans) lines.push(`• ${l.borrower_name || "—"} — ${fmtBRL(num(l.amount))} (${num(l.installments) || 1}x)`);
  }
  return lines.join("\n");
}

async function cobrancaHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const overdueRows = [...overdue.entries()].map(([loanId, item]) => {
    const loan = snap.loans.find((l) => l.id === loanId);
    return { name: loan?.borrower_name || "—", days: daysBetween(item.oldest, ctx.today), value: item.value };
  }).sort((a, b) => b.days - a.days);
  const dueToday = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments).filter((e) => e.due_date === ctx.today && !e.paid).map((e) => ({ name: loan.borrower_name || "—", value: e.amount })));
  const totalOverdue = overdueRows.reduce((s, r) => s + r.value, 0);
  const totalToday = dueToday.reduce((s, r) => s + r.value, 0);
  const lines = [
    `📞 *Cobrança de hoje* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `🚨 Em atraso: *${overdueRows.length}* — ${fmtBRL(totalOverdue)}`,
    `📆 Vencem hoje: *${dueToday.length}* — ${fmtBRL(totalToday)}`,
  ];
  if (overdueRows.length > 0) {
    lines.push("", "*Em atraso (prioridade):*");
    for (const r of overdueRows) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}${phoneByName(snap, r.name)}`);
  }
  if (dueToday.length > 0) {
    lines.push("", "*Vencem hoje:*");
    for (const r of dueToday) lines.push(`• ${r.name} — ${fmtBRL(r.value)}${phoneByName(snap, r.name)}`);
  }
  if (overdueRows.length === 0 && dueToday.length === 0) lines.push("", "_Nada para cobrar hoje. 🎉_");
  return lines.join("\n");
}

async function historicoCliente(ctx: Ctx, snap: Snapshot, query: string): Promise<string> {
  if (!query) return "Use: `/historico_cliente <nome do cliente>`";
  const q = query.toLowerCase();
  const matches = snap.loans.filter((l) => (l.borrower_name || "").toLowerCase().includes(q));
  const names = [...new Set(matches.map((l) => l.borrower_name))];
  if (names.length === 0) return `Nenhum cliente encontrado para *${query}*.`;
  if (names.length > 1) return ["Vários clientes encontrados:", "", ...names.map((n) => `• ${n}`), "", "Refine o nome."].join("\n");
  const name = names[0];
  const loans = matches;
  const overdue = getOverdueByLoan(ctx, snap);
  const totalLent = loans.reduce((s, l) => s + num(l.amount), 0);
  const totalDue = loans.reduce((s, l) => s + totalWithInterestLoan(l), 0);
  const paid = snap.payments.filter((p) => loans.some((l) => l.id === p.loan_id)).reduce((s, p) => s + num(p.amount), 0);
  const overdueValue = loans.reduce((s, l) => s + (overdue.get(l.id)?.value ?? 0), 0);
  const active = loans.filter((l) => l.status !== "paid").length;
  const paidOff = loans.filter((l) => l.status === "paid").length;
  const lines = [
    `👤 *${name}*${phoneByName(snap, name)}`,
    "",
    `📑 Contratos: *${loans.length}* (ativos: ${active} | quitados: ${paidOff})`,
    `📤 Total emprestado: *${fmtBRL(totalLent)}*`,
    `📊 Total a receber (com juros): *${fmtBRL(totalDue)}*`,
    `💰 Total pago: *${fmtBRL(paid)}*`,
    `🚨 Valor em atraso: *${fmtBRL(overdueValue)}*`,
    "",
    "*Contratos:*",
  ];
  for (const l of loans.sort((a, b) => String(b.due_date).localeCompare(String(a.due_date)))) {
    const od = overdue.get(l.id);
    const tag = l.status === "paid" ? "✅ quitado" : od ? `🚨 ${daysBetween(od.oldest, ctx.today)}d atraso` : "⏳ em dia";
    const tagsArr = Array.isArray(l.tags) ? l.tags.filter(Boolean) : [];
    const tagsStr = tagsArr.length > 0 ? ` — 🏷️ ${tagsArr.join(", ")}` : "";
    const dueStr = l.due_date ? String(l.due_date).slice(0, 10).split("-").reverse().join("/") : "—";
    lines.push(`• venc. ${dueStr} — ${fmtBRL(num(l.amount))} (${num(l.installments) || 1}x) — ${tag}${tagsStr}`);
  }
  return lines.join("\n");
}

async function alertas(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const recentOverdue: { name: string; days: number; value: number }[] = [];
  for (const [loanId, item] of overdue) {
    const days = daysBetween(item.oldest, ctx.today);
    if (days <= 7) {
      const loan = snap.loans.find((l) => l.id === loanId);
      recentOverdue.push({ name: loan?.borrower_name || "—", days, value: item.value });
    }
  }
  const critical: { name: string; days: number; value: number }[] = [];
  for (const [loanId, item] of overdue) {
    const days = daysBetween(item.oldest, ctx.today);
    if (days > 60) {
      const loan = snap.loans.find((l) => l.id === loanId);
      critical.push({ name: loan?.borrower_name || "—", days, value: item.value });
    }
  }
  const exposureByClient = new Map<string, number>();
  for (const l of snap.active) {
    const n = l.borrower_name || "—";
    exposureByClient.set(n, (exposureByClient.get(n) ?? 0) + num(l.amount));
  }
  const totalActive = [...exposureByClient.values()].reduce((s, v) => s + v, 0);
  const concentration = [...exposureByClient.entries()]
    .map(([name, value]) => ({ name, value, pct: totalActive > 0 ? (value / totalActive) * 100 : 0 }))
    .filter((r) => r.pct >= 20)
    .sort((a, b) => b.pct - a.pct);

  const lines = ["⚠️ *Alertas de Risco*", ""];
  lines.push(`🆕 Atrasos novos (≤7d): *${recentOverdue.length}*`);
  for (const r of recentOverdue.slice(0, 10)) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}`);
  lines.push("", `🔥 Atrasos críticos (>60d): *${critical.length}*`);
  for (const r of critical.slice(0, 10)) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}`);
  lines.push("", `📊 Concentração de carteira (≥20%): *${concentration.length}*`);
  for (const r of concentration) lines.push(`• ${r.name} — ${r.pct.toFixed(1)}% (${fmtBRL(r.value)})`);
  if (recentOverdue.length === 0 && critical.length === 0 && concentration.length === 0) {
    lines.push("", "_Nenhum sinal de risco no momento. 🎉_");
  }
  return lines.join("\n");
}

function roundCommission99(val: number): number {
  if (!Number.isFinite(val)) return 0;
  const rounded = Math.round(val * 100) / 100;
  const cents = Math.round((Math.abs(rounded) % 1) * 100);
  if (cents === 99) {
    return Math.round(rounded);
  }
  return rounded;
}

function fmtDateBR(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  return (y && m && d) ? `${d}/${m}/${y}` : (iso || "");
}

function allocateInterestByPaymentUpTo(
  loans: AllocLoanLike[],
  payments: AllocPaymentLike[],
  cutoffIsoDate: string,
): Map<string, number> {
  const filteredPayments = payments.filter((p) => {
    const d = (p.date ?? "").slice(0, 10);
    return !d || d <= cutoffIsoDate;
  });
  return allocateInterestByPayment(loans, filteredPayments);
}

function sumInterestReceivedInPeriod(
  loans: AllocLoanLike[],
  payments: AllocPaymentLike[],
  startIso: string,
  endIso: string,
): number {
  const alloc = allocateInterestByPaymentUpTo(loans, payments, endIso);
  let total = 0;
  for (const p of payments) {
    const d = (p.date ?? "").slice(0, 10);
    if (d < startIso || d > endIso) continue;
    total += alloc.get(p.id) ?? 0;
  }
  return round2(total);
}

function computeDefaultRateFromGoals(
  loans: any[],
  payments: any[],
  installmentSchedules: any[],
  m: string,
  cutoffDate: string,
): number {
  const totalPaidByLoan = payments.reduce<Record<string, number>>((acc, payment: any) => {
    const loanId = String(payment.loan_id || payment.loanId || "");
    const pDate = (payment.date || "").slice(0, 10);
    if (!loanId || !pDate || pDate > cutoffDate) return acc;
    acc[loanId] = (acc[loanId] || 0) + (Number(payment.amount) || 0);
    return acc;
  }, {});

  let periodPortfolio = 0;
  let overdueAmount = 0;

  loans.forEach((loan: any) => {
    const installments = Math.max(1, Number(loan.installments) || 1);
    const principal = Number(loan.amount) || 0;
    const rate = Number(loan.interest_rate ?? loan.interestRate) || 0;
    const totalWithInterestVal = totalWithInterest(principal, rate);
    const installmentValue = totalWithInterestVal / installments;

    const paidAmount = totalPaidByLoan[String(loan.id)] || 0;
    const calculatedPaidInstallments = Math.floor((paidAmount + 0.01) / installmentValue);

    const loanSchedules = installmentSchedules
      .filter((s: any) => String(s.loan_id || s.loanId) === String(loan.id))
      .sort((a: any, b: any) => Number(a.installment_number ?? a.installmentNumber) - Number(b.installment_number ?? b.installmentNumber));

    const dueEntries = loanSchedules.length > 0
      ? loanSchedules.map((s: any) => ({
          installmentNumber: Number(s.installment_number ?? s.installmentNumber),
          dueDate: (s.due_date || s.dueDate || "").slice(0, 10),
          amount: Number(s.amount) || installmentValue,
        }))
      : installments <= 1
        ? [{ installmentNumber: 1, dueDate: (loan.due_date || loan.dueDate || "").slice(0, 10), amount: totalWithInterestVal }]
        : Array.from({ length: installments }, (_, index) => {
            const baseStr = (loan.due_date || loan.dueDate || "").slice(0, 10);
            if (!baseStr) return { installmentNumber: index + 1, dueDate: "", amount: installmentValue };
            const [by, bm, bd] = baseStr.split("-").map(Number);
            const due = new Date(by, (bm - 1) + index, bd);
            return {
              installmentNumber: index + 1,
              dueDate: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
              amount: installmentValue,
            };
          });

    dueEntries.forEach((entry) => {
      if (!entry.dueDate || entry.dueDate.slice(0, 7) !== m) return;
      periodPortfolio += entry.amount;

      const isPaidAtCutoff = entry.installmentNumber <= calculatedPaidInstallments;
      if (isPaidAtCutoff || entry.dueDate >= cutoffDate) return;

      if (installments === 1) {
        overdueAmount += Math.max(0, totalWithInterestVal - paidAmount);
        return;
      }

      overdueAmount += entry.amount;
    });
  });

  return periodPortfolio > 0 ? (overdueAmount / periodPortfolio) * 100 : 0;
}

async function generateOperationalSummaryReport(admin: any, userId: string, date: string): Promise<string> {
  const currentMonthPrefix = date.slice(0, 7);
  const monthStart = `${currentMonthPrefix}-01`;

  const [yearNum, monthNum] = currentMonthPrefix.split("-").map(Number);
  const prevDateObj = new Date(yearNum, (monthNum - 1) - 1, 1);
  const prevMonthPrefix = `${prevDateObj.getFullYear()}-${String(prevDateObj.getMonth() + 1).padStart(2, "0")}`;

  let loans: any[] = [];
  let payments: any[] = [];
  let schedules: any[] = [];
  let expenses: any[] = [];
  let clients: any[] = [];
  let commissions: any[] = [];
  let snaps: any[] = [];

  try {
    const res = await admin.from("loans").select("*").eq("user_id", userId);
    loans = res.data ?? [];
  } catch (_) {}

  try {
    const res = await admin.from("payments").select("*").eq("user_id", userId);
    payments = res.data ?? [];
  } catch (_) {}

  try {
    const loanIds = loans.map((l: any) => l.id);
    if (loanIds.length > 0) {
      for (let i = 0; i < loanIds.length; i += 50) {
        const chunk = loanIds.slice(i, i + 50);
        const res = await admin.from("loan_installments").select("*").in("loan_id", chunk);
        if (res.data) schedules.push(...res.data);
      }
    }
  } catch (_) {}

  try {
    const res = await admin.from("expenses").select("*").eq("user_id", userId);
    expenses = res.data ?? [];
  } catch (_) {}

  try {
    const res = await admin.from("clients").select("*").eq("user_id", userId);
    clients = res.data ?? [];
  } catch (_) {}

  try {
    const res = await admin.from("manager_commissions").select("*").eq("user_id", userId);
    commissions = res.data ?? [];
  } catch (_) {}

  try {
    const res = await admin.from("patrimonio_snapshots").select("*").eq("owner_id", userId);
    snaps = res.data ?? [];
  } catch (_) {
    try {
      const res2 = await admin.from("patrimonio_snapshots").select("*").eq("user_id", userId);
      snaps = res2.data ?? [];
    } catch (_) {}
  }

  const loansById = new Map(loans.map((l: any) => [l.id, l]));

  const allocLoans: AllocLoanLike[] = loans.map((l: any) => ({
    id: String(l.id),
    amount: Number(l.amount) || 0,
    interestRate: Number(l.interest_rate) || 0,
    installments: Math.max(1, Number(l.installments) || 1),
    status: l.status,
  }));

  const allocPayments: AllocPaymentLike[] = payments.map((p: any) => ({
    id: String(p.id),
    loanId: String(p.loan_id),
    amount: Number(p.amount) || 0,
    date: p.date,
    installmentNumber: Number(p.installment_number),
    createdAt: p.created_at || p.createdAt,
    metadata: p.metadata,
  }));

  const paymentsToday = payments.filter((p: any) => p.date === date);
  const totalReceivedToday = paymentsToday.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  const interestReceivedToday = sumInterestReceivedInPeriod(allocLoans, allocPayments, date, date);
  const interestReceivedMonth = sumInterestReceivedInPeriod(allocLoans, allocPayments, monthStart, date);

  const managers = clients.filter((c: any) => c.is_manager || c.isManager);
  const managerIds = new Set(managers.map((m: any) => m.id));

  let commissionPaidToday = 0;
  let commissionPaidMonth = 0;

  commissions.forEach((c: any) => {
    const p = payments.find((pay: any) => pay.id === c.payment_id);
    const effDate = p?.date || (c.generated_at ? c.generated_at.slice(0, 10) : "");
    const amt = roundCommission99(Number(c.amount) || 0);
    if (effDate === date) commissionPaidToday += amt;
    if (effDate >= monthStart && effDate <= date) commissionPaidMonth += amt;
  });

  const registeredPaymentIds = new Set(commissions.map((c: any) => c.payment_id).filter(Boolean));
  payments.forEach((p: any) => {
    if (registeredPaymentIds.has(p.id)) return;
    const loan = loansById.get(p.loan_id);
    if (!loan || !loan.has_manager) return;

    let mgrId = loan.manager_id || loan.borrower_id;
    if (!mgrId || !managerIds.has(mgrId)) return;

    const rate = Number(loan.manager_commission_rate ?? 10);
    const base = Number(loan.original_amount ?? loan.amount ?? 0);
    const totalCom = roundCommission99((base * rate) / 100);
    const perInst = roundCommission99(totalCom / Math.max(1, Number(loan.installments) || 1));

    let derived = 0;
    if (Number(p.installment_number) > 0) derived = perInst;
    else if (Number(p.installment_number) === 0) derived = totalCom;
    else if (Number(p.installment_number) === -1 && loan.installments === 1 && loan.status === "paid") derived = totalCom;

    if (derived > 0) {
      if (p.date === date) commissionPaidToday += derived;
      if (p.date >= monthStart && p.date <= date) commissionPaidMonth += derived;
    }
  });

  commissionPaidToday = roundCommission99(commissionPaidToday);
  commissionPaidMonth = roundCommission99(commissionPaidMonth);

  const businessExpensesToday = expenses.filter((e: any) => {
    const isPaid = e.paid === true;
    const paidDate = e.paid_date || e.paidDate || "";
    const isBusiness = (e.scope ?? "business") !== "personal";
    return isPaid && paidDate === date && isBusiness;
  });
  const businessExpensesPaidToday = businessExpensesToday.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

  const loansToday = loans.filter((l: any) => l.start_date === date || l.startDate === date);
  const totalLentToday = loansToday.reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
  const loansCountToday = loansToday.length;

  const paymentsMonth = payments.filter((p: any) => p.date >= monthStart && p.date <= date);
  const totalInMonth = paymentsMonth.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);

  const loansMonth = loans.filter((l: any) => {
    const st = l.start_date || l.startDate || "";
    return st >= monthStart && st <= date;
  });
  const loansOutgoingMonth = loansMonth.reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);

  const businessExpensesMonth = expenses.filter((e: any) => {
    const isPaid = e.paid === true;
    const paidDate = e.paid_date || e.paidDate || e.due_date || e.dueDate || "";
    const isBusiness = (e.scope ?? "business") !== "personal";
    return isPaid && isBusiness && paidDate >= monthStart && paidDate <= date;
  });
  const expensesOutgoingMonth = businessExpensesMonth.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

  const totalOutMonth = loansOutgoingMonth + expensesOutgoingMonth;
  const saldoMes = totalInMonth - totalOutMonth;

  const defaultRate = computeDefaultRateFromGoals(loans, payments, schedules, currentMonthPrefix, date);

  const activeLoans = loans.filter((l: any) => l.status !== "paid");
  let totalActivePortfolio = 0;
  activeLoans.forEach((l: any) => {
    const principal = Number(l.amount) || 0;
    const rate = Number(l.interest_rate) || 0;
    const totalWithInt = totalWithInterest(principal, rate);
    const paidForLoan = payments
      .filter((p: any) => p.loan_id === l.id)
      .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
    const remaining = l.remaining_amount != null && Number(l.remaining_amount) > 0
      ? Number(l.remaining_amount)
      : Math.max(0, totalWithInt - paidForLoan);
    totalActivePortfolio += remaining;
  });

  const currentSnap = snaps.find((s: any) => s.month === currentMonthPrefix);
  const prevSnap = snaps.find((s: any) => s.month === prevMonthPrefix);

  const currentTotalPatrimonio = currentSnap?.total != null
    ? Number(currentSnap.total)
    : (Number(currentSnap?.account || 0) + totalActivePortfolio);

  const prevTotalPatrimonio = prevSnap?.total != null
    ? Number(prevSnap.total)
    : (prevSnap ? Number(prevSnap.account || 0) + Number(prevSnap.rua || 0) : null);

  let monthlyVariationPct = 0;
  if (prevTotalPatrimonio != null && prevTotalPatrimonio !== 0 && currentTotalPatrimonio != null) {
    monthlyVariationPct = ((currentTotalPatrimonio - prevTotalPatrimonio) / Math.abs(prevTotalPatrimonio)) * 100;
  }

  const variationFormatted = Number.isNaN(monthlyVariationPct) || (prevTotalPatrimonio == null)
    ? "0,00%"
    : `${monthlyVariationPct >= 0 ? "+" : ""}${monthlyVariationPct.toFixed(2).replace(".", ",")}%`;

  const lines = [
    "📊 *RESUMO OPERACIONAL*",
    `📅 Data: ${fmtDateBR(date)}`,
    "",
    `💰 Total recebido: *${fmtBRL(totalReceivedToday)}*`,
    `📈 Juros recebidos hoje: *${fmtBRL(interestReceivedToday)}*`,
    `📅 Juros recebidos no mês: *${fmtBRL(interestReceivedMonth)}*`,
    `👤 Comissão gerente paga hoje: *${fmtBRL(commissionPaidToday)}*`,
    `📅 Comissões de gerentes pagas no mês: *${fmtBRL(commissionPaidMonth)}*`,
    `🏢 Despesas empresariais: *${fmtBRL(businessExpensesPaidToday)}*`,
    `💸 Total emprestado: *${fmtBRL(totalLentToday)}*`,
    `📝 Empréstimos realizados: *${loansCountToday}*`,
    `💵 Saldo do mês: *${fmtBRL(saldoMes)}*`,
    `⚠️ Inadimplência atual: *${defaultRate.toFixed(2).replace(".", ",")}%*`,
    `📊 Variação do patrimônio: *${variationFormatted}*`,
  ];

  return lines.join("\n");
}

async function runReportCommand(supabase: any, userId: string, command: string): Promise<string> {
  if (command === "relatorios") return renderMenu();
  const [base, ...rest] = command.split("|");
  const arg = rest.join("|");
  const ctx: Ctx = { supabase, userId, today: todayInTZ() };
  if (base === "resumo_operacional" || base === "resumooperacional" || base === "operacional") {
    return generateOperationalSummaryReport(ctx.supabase, ctx.userId, ctx.today);
  }
  const snap = await snapshot(ctx);
  switch (base) {
    case "dashboard": return dashboard(ctx, snap);
    case "kpi_geral": return kpiGeral(ctx, snap);
    case "carteira_ativa": return carteiraAtiva(ctx, snap);
    case "resumo_operacional":
    case "resumooperacional":
    case "operacional":
      return generateOperationalSummaryReport(ctx.supabase, ctx.userId, ctx.today);
    case "emprestimos_atrasados": return emprestimosAtrasados(ctx, snap);
    case "vencimentos_hoje": return vencimentosHoje(ctx, snap);
    case "inadimplencia": return inadimplencia(ctx, snap);
    case "resumo_diario": return resumoDiario(ctx, snap);
    case "resumo_mensal": return resumoMensal(ctx, snap);
    case "top_clientes": return topClientes(ctx, snap);
    case "vencimentos_semana": return vencimentosSemana(ctx, snap);
    case "projecao_mes": return projecaoMes(ctx, snap);
    case "novos_contratos": return novosContratos(ctx, snap);
    
    case "historico_cliente": return historicoCliente(ctx, snap, arg);
    case "alertas": return alertas(ctx, snap);
    default: return renderMenu();
  }
}

const EXTERNAL_PROJECT_REF = Deno.env.get("EXTERNAL_PROJECT_REF") ?? "syyxnqzxqabeuqbuptkh";

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`[telegram-webhook] secret ${name} não configurado`);
  return value;
}

function getExternalSupabaseUrl(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_URL");
  if (external?.includes(EXTERNAL_PROJECT_REF)) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF)) return nativeUrl;

  // Não confiar em EXTERNAL_SUPABASE_URL se ela apontar para outro projeto:
  // isso mantém o webhook/processamento no projeto correto.
  return `https://${EXTERNAL_PROJECT_REF}.supabase.co`;
}

function getExternalServiceRoleKey(): string {
  const external = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (external) return external;

  const nativeUrl = Deno.env.get("SUPABASE_URL");
  const nativeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (nativeUrl?.includes(EXTERNAL_PROJECT_REF) && nativeKey) return nativeKey;

  return required("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
}

function getExternalAdmin() {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey(), {
    auth: { persistSession: false },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function deriveTelegramWebhookSecret(telegramApiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${telegramApiKey}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function safeEqual(a: string | null, b: string): boolean {
  if (!a) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function persistedUpdateId(updateId: number, purpose: string | null): number {
  // Telegram update_id is scoped per bot. The telegram_messages table still has
  // update_id as the conflict key, so reports updates are stored as negative ids
  // to avoid colliding/overwriting expense updates from another bot.
  return purpose === "reports" ? -Math.abs(updateId) : updateId;
}

async function tgSend(token: string, chatId: number, text: string) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[telegram-webhook] reports sendMessage failed ${response.status}`, body);
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      }).catch(() => null);
    }
  } catch (error) {
    console.error("[telegram-webhook] reports sendMessage exception", error);
  }
}

async function processReportsMessage(
  supabase: any,
  token: string,
  botId: string,
  chatId: number,
  text: string,
) {
  const startMatch = text.match(/^\/start(?:@\w+)?\s+([A-Z0-9]{6}|\d{6})\s*$/i);

  if (startMatch) {
    const code = startMatch[1].toUpperCase();
    const { data: codeRow, error: codeErr } = await supabase
      .from("telegram_reports_link_codes")
      .select("id, user_id, expires_at, bot_id")
      .eq("code", code)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeErr) {
      console.error("[telegram-webhook] reports code lookup failed", codeErr);
      await tgSend(token, chatId, "❌ Erro ao validar o código. Tente novamente em instantes.");
      return;
    }

    if (!codeRow) {
      await tgSend(token, chatId, "❌ Código inválido ou expirado. Gere um novo no app.");
      return;
    }

    if (new Date((codeRow as any).expires_at).getTime() < Date.now()) {
      await supabase.from("telegram_reports_link_codes").delete().eq("id", (codeRow as any).id);
      await tgSend(token, chatId, "⌛ Código expirado. Gere um novo no app.");
      return;
    }

    const { error: cleanupErr } = await supabase
      .from("telegram_reports_links")
      .delete()
      .or(`chat_id.eq.${chatId},user_id.eq.${(codeRow as any).user_id}`);
    if (cleanupErr) console.error("[telegram-webhook] reports link cleanup failed", cleanupErr);

    const { error: insertErr } = await supabase.from("telegram_reports_links").insert({
      user_id: (codeRow as any).user_id,
      chat_id: chatId,
      bot_id: botId,
    });

    if (insertErr) {
      console.error("[telegram-webhook] reports link insert failed", insertErr);
      await tgSend(token, chatId, "❌ Erro ao conectar o bot. Gere um novo código e tente novamente.");
      return;
    }

    await supabase.from("telegram_reports_link_codes").delete().eq("id", (codeRow as any).id);
    await tgSend(token, chatId, "✅ *Bot de Relatórios conectado!*\n\nVocê receberá os relatórios nos horários configurados e pode usar /relatorios para ver os comandos.");
    return;
  }

  if (text === "/start" || text === "/help") {
    await tgSend(token, chatId, "👋 Este é o *Bot de Relatórios*.\n\nAbra o app, gere o comando */start* em *Configurações → Bots do Telegram → Bot de Relatórios* e envie aqui para vincular.\n\nApós conectar, use /relatorios para ver os comandos disponíveis.");
    return;
  }

  const command = parseReportCommand(text);
  if (!command) return;

  let userId: string | undefined;
  const { data: dedicatedLink } = await supabase
    .from("telegram_reports_links")
    .select("user_id")
    .eq("chat_id", chatId)
    .eq("bot_id", botId)
    .maybeSingle();
  userId = (dedicatedLink as any)?.user_id;

  if (!userId) {
    const { data: legacyLink } = await supabase
      .from("telegram_links")
      .select("user_id")
      .eq("chat_id", chatId)
      .eq("bot_id", botId)
      .maybeSingle();
    userId = (legacyLink as any)?.user_id;
  }

  if (!userId) {
    await tgSend(token, chatId, "🔒 Este chat não está vinculado.\n\nAbra o app, gere o comando */start* em *Configurações → Bots do Telegram → Bot de Relatórios* e envie aqui para vincular.");
    return;
  }

  try {
    const { data: ownerId, error: ownerErr } = await supabase.rpc("get_data_owner_id", { _user_id: userId });
    if (ownerErr) console.error("[telegram-webhook] get_data_owner_id failed", ownerErr);
    const response = command === "relatorios"
      ? renderMenu()
      : await runReportCommand(supabase, (ownerId as string) || userId, command);
    await tgSend(token, chatId, response);
  } catch (error: any) {
    console.error(`[telegram-webhook] runReportCommand failed command=${command}`, error);
    await tgSend(token, chatId, `❌ Falha ao gerar o relatório: ${error?.message || "Erro desconhecido"}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const tokens = [
      Deno.env.get("TELEGRAM_BOT_TOKEN"),
      Deno.env.get("TELEGRAM_BOT_TOKEN_REPORTS"),
    ].filter(Boolean) as string[];

    const supabase = getExternalAdmin();
    const { data: activeDbBots } = await supabase
      .from("system_telegram_bots")
      .select("id, token")
      .eq("active", true)
      .not("token", "is", null);
    for (const bot of activeDbBots ?? []) {
      const token = String((bot as any)?.token ?? "");
      if (token && !tokens.includes(token)) tokens.push(token);
    }

    if (tokens.length === 0) {
      throw new Error("Nenhum TELEGRAM_BOT_TOKEN configurado");
    }

    const actualSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    let authenticated = false;
    let matchedToken: string | null = null;

    for (const token of tokens) {
      const expectedSecret = await deriveTelegramWebhookSecret(token);
      if (safeEqual(actualSecret, expectedSecret)) {
        authenticated = true;
        matchedToken = token;
        break;
      }
    }

    if (!authenticated) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const update = await req.json();
    const message = update.message ?? update.edited_message ?? update.callback_query?.message;

    if (!message?.chat?.id || typeof update.update_id !== "number") {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: systemBot } = matchedToken
      ? await supabase
        .from("system_telegram_bots")
        .select("id, purpose")
        .eq("token", matchedToken)
        .eq("active", true)
        .order("bot_id", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      : { data: null };
    const botId = (systemBot as any)?.id ?? null;
    const botPurpose = (systemBot as any)?.purpose ?? null;
    const isReportsBot = botPurpose === "reports";
    const dbUpdateId = persistedUpdateId(update.update_id, botPurpose);
    const text = update.message?.text
      ?? update.message?.caption
      ?? update.edited_message?.text
      ?? update.edited_message?.caption
      ?? null;

    // Store message for async processing. Keep payload aligned with the live
    // telegram_messages schema: it has bot_id, but no Telegram sender user_id.
    const rawUpdate = botId ? { ...update, _system_bot_id: botId, _telegram_update_id: update.update_id } : update;
    const { error } = await supabase.from("telegram_messages").upsert(
      {
        update_id: dbUpdateId,
        chat_id: message.chat.id,
        text,
        raw_update: rawUpdate,
        bot_id: botId,
        processed: isReportsBot,
        ...(isReportsBot ? { processed_at: new Date().toISOString() } : {}),
      },
      { onConflict: "update_id" },
    );

    if (error) {
      console.error("[telegram-webhook] upsert failed", error);
      await supabase.from("telegram_job_logs").insert({
        job: "telegram-webhook", ok: false, error: error.message,
        details: { update_id: update.update_id, db_update_id: dbUpdateId, chat_id: message.chat.id, bot_purpose: botPurpose },
      }).then(() => null).catch(() => null);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("telegram_job_logs").insert({
      job: "telegram-webhook", ok: true, processed: 1,
      details: { update_id: update.update_id, db_update_id: dbUpdateId, chat_id: message.chat.id, has_text: !!text, bot_purpose: botPurpose },
    }).then(() => null).catch(() => null);

    if (isReportsBot && matchedToken && botId) {
      await processReportsMessage(supabase, matchedToken, botId, Number(message.chat.id), (text ?? "").trim());
      return new Response(JSON.stringify({ ok: true, processed_by: "reports-webhook" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Immediately trigger async processing
    const functionBaseUrl = getExternalSupabaseUrl();
    const serviceRoleKey = getExternalServiceRoleKey();
    fetch(`${functionBaseUrl}/functions/v1/telegram-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: "{}",
    }).catch((e) => console.error("[telegram-webhook] process trigger failed", e));

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[telegram-webhook] error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
