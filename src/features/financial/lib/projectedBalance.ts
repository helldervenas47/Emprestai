import type { Income } from "@/features/financial/hooks/useIncomes";
import type { Expense } from "@/types/loan";
import type { PiggyBankDeposit } from "@/features/piggyBanks/hooks/usePiggyBanks";
import type { CreditCard } from "@/features/creditCards/hooks/useCreditCards";
import type { InvoiceOpening } from "@/features/creditCards/hooks/useCreditCardOpenings";
import {
  getCardInvoiceTotalsForMonth,
  isCreditCardExpense,
} from "@/features/creditCards/lib/creditCardInvoiceTotals";

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

export type DailyDelta = { income: number; expense: number };

/**
 * Constrói os deltas diários (receitas - despesas) considerando:
 *  - Receitas (recebidas e pendentes) na sua data efetiva.
 *  - Despesas pessoais (não-cartão), com parcelas mensais para recorrentes.
 *  - Faturas de cartão (apenas o saldo em aberto) no dia do vencimento.
 */
export function buildDailyDeltas(opts: {
  incomes: Income[];
  expenses: Expense[];
  cards: CreditCard[];
  openings: InvoiceOpening[];
  piggyDeposits?: PiggyBankDeposit[];
  /** Faixa de meses (inclusiva, 0-indexed) coberta pelas faturas de cartão. */
  fromYear: number;
  fromMonth: number;
  toYear: number;
  toMonth: number;
}): Record<string, DailyDelta> {
  const map: Record<string, DailyDelta> = {};
  const ensure = (d: string) =>
    map[d] ?? (map[d] = { income: 0, expense: 0 });

  for (const i of opts.incomes) {
    const d =
      i.status === "received"
        ? i.actualReceivedDate || i.receivedDate
        : i.receivedDate;
    if (!d) continue;
    ensure(d).income += Number(i.amount) || 0;
  }

  const personalExpenses = opts.expenses.filter(
    (e) => (e.scope ?? "business") === "personal" && !isCreditCardExpense(e),
  );
  // Limite final da projeção (último dia de toMonth) para materializar recorrências.
  const projectionEnd = new Date(opts.toYear, opts.toMonth + 1, 0);
  for (const ex of personalExpenses) {
    const isRecParent =
      ex.type === "recorrente" && (ex.installments ?? 0) > 1;

    if (isRecParent) {
      // Materializa cada parcela restante (uma por mês) a partir da PRÓXIMA
      // parcela não paga — não da dueDate original. Caso contrário, despesas
      // recorrentes antigas com várias parcelas pagas teriam suas parcelas
      // futuras agendadas em meses já passados e nunca entrariam na projeção.
      const totalInstallments = ex.installments as number;
      const installmentAmount = (Number(ex.amount) || 0) / totalInstallments;
      const paidCount = ex.paidInstallments ?? 0;
      const remaining = totalInstallments - paidCount;
      if (remaining <= 0 || !ex.dueDate) continue;
      const start = new Date(ex.dueDate + "T00:00:00");
      for (let i = 0; i < remaining; i++) {
        const occ = new Date(start);
        occ.setMonth(start.getMonth() + paidCount + i);
        if (occ > projectionEnd) break;
        ensure(fmt(occ)).expense += installmentAmount;
      }
      continue;
    }

    // Despesa simples (type === "fixa" no schema atual = lançamento único).
    const d = ex.paid && ex.paidDate ? ex.paidDate : ex.dueDate;
    if (!d) continue;
    ensure(d).expense += Number(ex.amount) || 0;
  }

  // Faturas de cartão (apenas em aberto) no dia do vencimento.
  let curY = opts.fromYear;
  let curM = opts.fromMonth;
  while (curY < opts.toYear || (curY === opts.toYear && curM <= opts.toMonth)) {
    const ym = `${curY}-${String(curM + 1).padStart(2, "0")}`;
    const totals = getCardInvoiceTotalsForMonth(
      opts.expenses,
      opts.cards,
      opts.openings,
      ym,
    );
    for (const t of totals) {
      if (t.total <= 0) continue;
      if (t.paid) continue;
      const remaining = Math.max(0, t.total - t.paidTotal);
      if (remaining <= 0) continue;
      const lastDay = new Date(curY, curM + 1, 0).getDate();
      const day = Math.min(t.card.dueDay, lastDay);
      const ds = `${curY}-${String(curM + 1).padStart(2, "0")}-${String(
        day,
      ).padStart(2, "0")}`;
      ensure(ds).expense += remaining;
    }
    curM += 1;
    if (curM > 11) {
      curM = 0;
      curY += 1;
    }
  }

  // Movimentações manuais de cofrinhos (guardar/resgatar). Aportes vinculados
  // a despesa (expenseId) já estão refletidos via despesa correspondente.
  if (opts.piggyDeposits) {
    for (const d of opts.piggyDeposits) {
      if (d.expenseId) continue;
      if (!d.depositDate) continue;
      const amt = Number(d.amount) || 0;
      if (amt >= 0) ensure(d.depositDate).expense += amt;
      else ensure(d.depositDate).income += -amt;
    }
  }

  return map;
}

/**
 * Calcula o saldo previsto acumulado dia a dia entre `startDate` e `endDate`.
 * Em todo dia 01, se houver `overrides[YYYY-MM]`, o saldo é resetado para o valor manual
 * (ancorando a projeção). Caso contrário, o saldo do dia 01 herda do último dia do mês anterior.
 */
export function computeRunningBalance(opts: {
  baseBalance: number;
  startDate: Date;
  endDate: Date;
  deltas: Record<string, DailyDelta>;
  /** Ajustes manuais por data (YYYY-MM-DD). Quando presente, o saldo do dia
   *  é fixado neste valor (nova âncora) e em seguida o delta do próprio dia
   *  é somado normalmente. */
  adjustments?: Record<string, number>;
  /** @deprecated Use `adjustments` (chave por data). Mantido por compatibilidade —
   *  é interpretado como ajuste no dia 01 do mês informado. */
  overrides?: Record<string, number>;
}): Record<string, number> {
  const map: Record<string, number> = {};
  let running = opts.baseBalance;
  const cursor = new Date(opts.startDate);
  const adjustments = opts.adjustments ?? {};
  while (cursor <= opts.endDate) {
    const ds = fmt(cursor);
    // 1) Ajuste manual por data (nova lógica genérica).
    if (adjustments[ds] !== undefined) {
      running = adjustments[ds];
    } else if (cursor.getDate() === 1 && opts.overrides) {
      // 2) Compat: override legado por mês, aplicado no dia 01.
      const mk = ds.slice(0, 7);
      if (opts.overrides[mk] !== undefined) {
        running = opts.overrides[mk];
        map[ds] = running;
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }
    }
    const d = opts.deltas[ds];
    running += (d?.income ?? 0) - (d?.expense ?? 0);
    map[ds] = running;
    cursor.setDate(cursor.getDate() + 1);
  }
  return map;
}

/**
 * Retorna o saldo previsto do último dia do mês `monthKey` (YYYY-MM),
 * encadeando a projeção a partir do início do mês corrente (onde `baseBalance` é válido).
 * Para meses passados, retorna `null` — não é a projeção que faz sentido para histórico.
 */
export function getMonthEndProjectedBalance(opts: {
  baseBalance: number;
  monthKey: string; // YYYY-MM
  today: Date;
  incomes: Income[];
  expenses: Expense[];
  cards: CreditCard[];
  openings: InvoiceOpening[];
  piggyDeposits?: PiggyBankDeposit[];
  /** Ajustes manuais por data (YYYY-MM-DD). Nova âncora oficial. */
  adjustments?: Record<string, number>;
  /** @deprecated Use `adjustments`. Mantido por compat. */
  overrides?: Record<string, number>;
}): number | null {
  const [tgtY, tgtM] = opts.monthKey.split("-").map(Number);
  if (!tgtY || !tgtM) return null;
  const targetEnd = new Date(tgtY, tgtM, 0); // último dia do mês
  const todayMonthStart = new Date(
    opts.today.getFullYear(),
    opts.today.getMonth(),
    1,
  );
  if (targetEnd < todayMonthStart) return null;

  // A projeção começa NO DIA SEGUINTE a hoje, pois `baseBalance` já reflete
  // todas as movimentações até a data atual (inclusive). Iniciar no dia 1 do
  // mês corrente provoca dupla contagem das receitas/despesas já realizadas.
  const startDate = new Date(
    opts.today.getFullYear(),
    opts.today.getMonth(),
    opts.today.getDate() + 1,
  );

  if (startDate > targetEnd) return opts.baseBalance;

  const deltas = buildDailyDeltas({
    incomes: opts.incomes,
    expenses: opts.expenses,
    cards: opts.cards,
    openings: opts.openings,
    piggyDeposits: opts.piggyDeposits,
    fromYear: startDate.getFullYear(),
    fromMonth: startDate.getMonth(),
    toYear: targetEnd.getFullYear(),
    toMonth: targetEnd.getMonth(),
  });
  const map = computeRunningBalance({
    baseBalance: opts.baseBalance,
    startDate,
    endDate: targetEnd,
    deltas,
    adjustments: opts.adjustments,
    overrides: opts.overrides,
  });
  const ds = fmt(targetEnd);
  return map[ds] ?? null;
}
