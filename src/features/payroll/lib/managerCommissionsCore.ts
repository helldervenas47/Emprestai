import { Client, Loan, ManagerCommission, Payment } from "@/types/loan";

/**
 * FONTE ÚNICA DE VERDADE das "Comissões pagas" por gerente.
 *
 * Regras de imutabilidade histórica:
 * - Uma comissão registrada (tabela manager_commissions) SEMPRE conta, mesmo que
 *   o gerente tenha sido desativado ou deixado de ser marcado como gerente.
 *   Só desaparece quando o registro é realmente excluído/estornado.
 * - Comissões vinculadas a um pagamento são ancoradas na data do pagamento
 *   (imutável), evitando que regenerações com generated_at = now() movam valores
 *   de meses passados para o mês atual.
 * - A dedupe de comissões derivadas é determinística: os pagamentos são ordenados
 *   cronologicamente e o primeiro pagamento de cada parcela é o que conta. Assim o
 *   valor não "pula" de mês nem diminui a cada refresh por ordem de array instável.
 */

export interface PaidCommissionEntry {
  managerId: string;
  managerName: string;
  loanId: string;
  paymentId?: string | null;
  amount: number;
  /** Data efetiva (YYYY-MM-DD ou ISO) usada para alocar a comissão no período. */
  date: string;
  source: "registered" | "derived";
}

/** Gerentes considerados para o histórico: inclui inativos (histórico é imutável). */
export function getHistoryManagers(clients: Client[]): Client[] {
  return clients.filter((c) => c.isManager);
}

/** Gerentes considerados para projeções/pendências: apenas ativos. */
export function getActiveManagers(clients: Client[]): Client[] {
  return clients.filter((c) => c.isManager && c.active !== false);
}

export function resolveLoanManagerId(loan: Loan, managers: Client[]): string | null {
  if (!loan.hasManager) return null;
  if (loan.managerId) return loan.managerId;
  if (loan.borrowerId && managers.some((m) => m.id === loan.borrowerId)) return loan.borrowerId;
  const nm = loan.borrowerName?.trim().toLocaleLowerCase("pt-BR");
  if (!nm) return null;
  return managers.find((m) => m.name.trim().toLocaleLowerCase("pt-BR") === nm)?.id ?? null;
}

/**
 * Ajusta valores de comissão que terminam com .99 para .00 (arredondamento para o próximo inteiro).
 * Ex: 99.99 -> 100.00, 0.99 -> 1.00, 33.99 -> 34.00
 */
export function roundCommission99(val: number): number {
  if (!Number.isFinite(val)) return 0;
  const rounded = Math.round(val * 100) / 100;
  const cents = Math.round((Math.abs(rounded) % 1) * 100);
  if (cents === 99) {
    return Math.round(rounded);
  }
  return rounded;
}

/**
 * Base da comissão CONGELADA no principal original do contrato.
 * Renegociações/amortizações alteram `loan.amount`, então usar `amount` fazia o
 * histórico de comissões mudar retroativamente.
 */
export function getCommissionConfig(loan: Loan) {
  const rate = loan.managerCommissionRate ?? 10;
  const base = loan.originalAmount ?? loan.amount;
  const totalCommission = roundCommission99((base * rate) / 100);
  const perInstallment = roundCommission99(totalCommission / Math.max(1, loan.installments));
  return { rate, base, totalCommission, perInstallment };
}

/** Pagamento parcial de ciclo de juros (ainda não quitou o ciclo). */
function isPartialInterestPayment(payment: Payment): boolean {
  return (payment.metadata as any)?.kind === "interest_partial";
}

/**
 * Comissão derivada de um pagamento.
 *
 * Regras vigentes:
 * - Parcela cheia (installmentNumber > 0): comissão da parcela. Parciais são
 *   gravados com installmentNumber = -1, logo aqui a parcela já está quitada.
 * - Pagamento de juros (installmentNumber === 0): comissão A CADA ciclo de juros
 *   pago (taxa% do valor original). Parciais de ciclo não geram comissão; o
 *   pagamento que fecha o ciclo gera.
 * - Parcial (installmentNumber === -1): só gera comissão quando quita o contrato
 *   de parcela única (compatibilidade com histórico legado).
 */
export function getDerivedPaymentCommission(loan: Loan, payment: Payment): number {
  const { totalCommission, perInstallment } = getCommissionConfig(loan);
  if (payment.installmentNumber > 0) return roundCommission99(perInstallment);
  if (payment.installmentNumber === 0) {
    return isPartialInterestPayment(payment) ? 0 : roundCommission99(totalCommission);
  }
  if (payment.installmentNumber === -1 && loan.installments === 1 && loan.status === "paid") {
    return roundCommission99(totalCommission);
  }
  return 0;
}


function sortKey(p: Payment): string {
  return `${p.date ?? ""}|${(p as any).createdAt ?? ""}|${p.id}`;
}

/** Ordena pagamentos cronologicamente de forma determinística. */
export function sortPaymentsChronologically(payments: Payment[]): Payment[] {
  return [...payments].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

export function toDate(value: string): Date {
  return new Date(value + (value.length > 10 ? "" : "T00:00:00"));
}

/**
 * Constrói a lista completa de comissões pagas (registradas + derivadas),
 * sem filtro de período. O consumidor aplica o filtro que precisar.
 */
export function buildPaidCommissionEntries(params: {
  clients: Client[];
  loans: Loan[];
  payments: Payment[];
  commissions: ManagerCommission[];
}): PaidCommissionEntry[] {
  const { clients, loans, payments, commissions } = params;
  const historyManagers = getHistoryManagers(clients);
  const nameById = new Map(clients.map((c) => [c.id, c.name]));

  const entries: PaidCommissionEntry[] = [];

  const paymentDateById = new Map<string, string>();
  payments.forEach((p) => paymentDateById.set(p.id, p.date));

  const registeredKeys = new Set<string>();
  const registeredInstallments = new Set<string>();
  const loansWithFullCommission = new Set<string>();
  commissions.forEach((c) => {
    if (c.paymentId) registeredKeys.add(`${c.loanId}::${c.paymentId}`);
    // Só parcelas reais (> 0) bloqueiam a derivação. Comissões de ciclo de juros
    // usam installmentNumber 0/null e agora podem existir várias por contrato.
    if (typeof c.installmentNumber === "number" && c.installmentNumber > 0) {
      registeredInstallments.add(`${c.loanId}::${c.installmentNumber}`);
    }
    if (c.commissionType === "full") loansWithFullCommission.add(c.loanId);
  });


  // 1) Comissões registradas (congeladas no banco) — nunca filtradas por
  //    status do gerente e nunca recalculadas a partir do contrato.
  commissions.forEach((c) => {
    const effective = (c.paymentId && paymentDateById.get(c.paymentId)) || c.generatedAt;
    if (!effective) return;
    entries.push({
      managerId: c.managerId,
      managerName:
        nameById.get(c.managerId) ?? c.managerNameSnapshot ?? "Gerente removido",
      loanId: c.loanId,
      paymentId: c.paymentId ?? null,
      amount: roundCommission99(Number(c.amount) || 0),
      date: effective,
      source: "registered",
    });
  });


  // 2) Comissões derivadas dos pagamentos (quando não há registro explícito).
  const paymentsByLoan = new Map<string, Payment[]>();
  payments.forEach((p) => {
    const list = paymentsByLoan.get(p.loanId);
    if (list) list.push(p);
    else paymentsByLoan.set(p.loanId, [p]);
  });

  loans.forEach((loan) => {
    const managerId = resolveLoanManagerId(loan, historyManagers);
    if (!managerId) return;
    const loanPayments = sortPaymentsChronologically(paymentsByLoan.get(loan.id) ?? []);
    const processedInstallments = new Set<number>();
    const settledPartial = new Set<string>();
    // Contrato de parcela única quitado só por parciais: apenas o ÚLTIMO parcial
    // (o que quitou) gera a comissão.
    if (loan.installments === 1 && loan.status === "paid" && !loansWithFullCommission.has(loan.id)) {
      const lastPartial = [...loanPayments].reverse().find((p) => p.installmentNumber === -1);
      if (lastPartial) settledPartial.add(lastPartial.id);
    }
    loanPayments.forEach((p) => {
      if (p.installmentNumber === -1 && !settledPartial.has(p.id)) return;
      const amount = getDerivedPaymentCommission(loan, p);
      if (amount <= 0) return;
      if (registeredKeys.has(`${loan.id}::${p.id}`)) return;
      if (p.installmentNumber > 0) {
        if (registeredInstallments.has(`${loan.id}::${p.installmentNumber}`)) return;
        if (processedInstallments.has(p.installmentNumber)) return;
        processedInstallments.add(p.installmentNumber);
      }
      if (p.installmentNumber === -1 && loansWithFullCommission.has(loan.id)) return;
      entries.push({
        managerId,
        managerName: nameById.get(managerId) ?? "Gerente removido",
        loanId: loan.id,
        paymentId: p.id,
        amount: roundCommission99(amount),
        date: p.date,
        source: "derived",
      });
    });
  });


  return entries;
}

/** Soma por mês (0-11) das comissões pagas em um ano. */
export function sumPaidByMonth(entries: PaidCommissionEntry[], year: number): number[] {
  const totals = Array(12).fill(0) as number[];
  entries.forEach((e) => {
    const d = toDate(e.date);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== year) return;
    totals[d.getMonth()] += e.amount;
  });
  return totals;
}
