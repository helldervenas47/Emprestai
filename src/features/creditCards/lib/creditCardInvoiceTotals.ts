import type { Expense } from "@/types/loan";
import type { CreditCard } from "@/features/creditCards/hooks/useCreditCards";
import type { InvoiceOpening } from "@/features/creditCards/hooks/useCreditCardOpenings";
import { expandCreditCardExpenses } from "@/features/creditCards/lib/creditCardInstallments";

/** Detecta se a despesa foi feita no cartão de crédito (tag [crédito] na nota). */
export function isCreditCardExpense(e: Pick<Expense, "notes">): boolean {
  return /\[\s*cr[eé]dito\s*\]/i.test(e?.notes ?? "");
}

/** Lê uma override manual do "Valor pago da fatura" gravada em opening.notes como [PAID:1234.56]. */
export function readPaidOverride(notes: string | null | undefined): number | null {
  const m = /\[PAID:([0-9]+(?:\.[0-9]+)?)\]/i.exec(notes ?? "");
  return m ? Number(m[1]) : null;
}

/** Atualiza o trecho [PAID:xxx] dentro de um notes existente. Passe null para remover. */
export function writePaidOverride(notes: string | null | undefined, value: number | null): string {
  const base = (notes ?? "").replace(/\s*\[PAID:[0-9]+(?:\.[0-9]+)?\]/gi, "").trim();
  if (value === null || !Number.isFinite(value)) return base;
  return base ? `${base} [PAID:${value.toFixed(2)}]` : `[PAID:${value.toFixed(2)}]`;
}

/** Lê uma override manual do "Valor total da fatura" gravada como [TOTAL:1234.56].
 *  Usada quando o pagamento total real difere da prévia estimada — o valor real
 *  passa a ser o total efetivo da fatura. */
export function readTotalOverride(notes: string | null | undefined): number | null {
  const m = /\[TOTAL:([0-9]+(?:\.[0-9]+)?)\]/i.exec(notes ?? "");
  return m ? Number(m[1]) : null;
}

/** Atualiza o trecho [TOTAL:xxx] dentro de um notes existente. Passe null para remover. */
export function writeTotalOverride(notes: string | null | undefined, value: number | null): string {
  const base = (notes ?? "").replace(/\s*\[TOTAL:[0-9]+(?:\.[0-9]+)?\]/gi, "").trim();
  if (value === null || !Number.isFinite(value)) return base;
  return base ? `${base} [TOTAL:${value.toFixed(2)}]` : `[TOTAL:${value.toFixed(2)}]`;
}


/** Lê a data efetiva do pagamento gravada em opening.notes como [PAID_DATE:YYYY-MM-DD]. */
function readPaidDate(notes: string | null | undefined): string | null {
  const m = /\[PAID_DATE:(\d{4}-\d{2}-\d{2})\]/i.exec(notes ?? "");
  return m ? m[1] : null;
}

/** Detecta se o pagamento da fatura já foi lançado no extrato (ledger). */
export function creditCardLedgerHandled(notes: string | null | undefined): boolean {
  return /\[LEDGER\]/i.test(notes ?? "");
}

/** Retorna o cycleKey (YYYY-MM do fechamento) ao qual uma data pertence para um dado cartão. */
export function cycleKeyForDate(dueDateISO: string, closingDay: number): string {
  const d = new Date(dueDateISO + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  // Despesas com dueDate >= closingDay pertencem ao próximo ciclo (fechamento no próximo mês).
  const cy = day >= closingDay ? (m === 11 ? y + 1 : y) : y;
  const cm = day >= closingDay ? (m === 11 ? 0 : m + 1) : m;
  return `${cy}-${String(cm + 1).padStart(2, "0")}`;
}

/** Reconstrói o ciclo (from, to, dueDate) ancorado em uma data de referência. */
function getCycleForRef(ref: Date, closingDay: number, dueDay: number) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  const closingThis = new Date(y, m, Math.min(closingDay, new Date(y, m + 1, 0).getDate()));
  // Compras feitas no dia do fechamento (ou depois) entram no próximo ciclo.
  const closingNext =
    day >= closingDay
      ? new Date(y, m + 1, Math.min(closingDay, new Date(y, m + 2, 0).getDate()))
      : closingThis;
  const closingPrev =
    day >= closingDay
      ? closingThis
      : new Date(y, m - 1, Math.min(closingDay, new Date(y, m, 0).getDate()));
  const dueMonth = dueDay > closingDay ? closingNext.getMonth() : closingNext.getMonth() + 1;
  const dueYear = closingNext.getFullYear();
  const dueDate = new Date(
    dueYear,
    dueMonth,
    Math.min(dueDay, new Date(dueYear, dueMonth + 1, 0).getDate())
  );
  return { from: closingPrev, to: closingNext, dueDate };
}

/** Localiza o ciclo cujo vencimento cai no mês YYYY-MM informado (ou null se não houver). */
export function getCycleForDueMonth(yyyymm: string, closingDay: number, dueDay: number) {
  const [ty, tm] = yyyymm.split("-").map(Number);
  for (let off = -36; off <= 36; off++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + off);
    const c = getCycleForRef(d, closingDay, dueDay);
    if (c.dueDate.getFullYear() === ty && c.dueDate.getMonth() + 1 === tm) {
      return c;
    }
  }
  return null;
}

export function cycleKeyFromDate(closingTo: Date): string {
  return `${closingTo.getFullYear()}-${String(closingTo.getMonth() + 1).padStart(2, "0")}`;
}

export interface CardInvoiceMonthTotal {
  card: CreditCard;
  /** Total atual da fatura (compras do ciclo + saldo inicial). */
  total: number;
  /** True se a fatura do ciclo está totalmente paga. */
  paid: boolean;
  /** Valor efetivamente pago (soma dos amounts pagos do ciclo, ou override). */
  paidTotal: number;
  /** True quando o usuário definiu manualmente o valor pago via [PAID:xxx]. */
  hasPaidOverride: boolean;
}

/**
 * Para um mês YYYY-MM, calcula o total de cada fatura (uma por cartão) cujo
 * vencimento cai dentro desse mês. Inclui status de pagamento e valor pago.
 */
export function getCardInvoiceTotalsForMonth(
  expenses: Expense[],
  cards: CreditCard[],
  openings: InvoiceOpening[],
  yyyymm: string,
): CardInvoiceMonthTotal[] {
  const expanded = expandCreditCardExpenses(expenses);
  const result: CardInvoiceMonthTotal[] = [];
  for (const card of cards) {
    if (card.active === false) continue;
    const cycle = getCycleForDueMonth(yyyymm, card.closingDay, card.dueDay);
    if (!cycle) continue;

    const items = expanded.filter((e) => belongsToCardInvoice(e, card, cycle.from, cycle.to));
    const installmentValue = invoiceItemValue;
    const itemsTotal = items.reduce((s, e) => s + installmentValue(e), 0);

    const cycleKey = cycleKeyFromDate(cycle.to);
    const opening = openings.find((o) => o.cardId === card.id && o.cycleKey === cycleKey);
    const openingAmount = opening?.openingAmount ?? 0;
    const openingPaidFlag = /\[PAGA\]/i.test(opening?.notes ?? "");
    const override = readPaidOverride(opening?.notes);
    const totalOverride = readTotalOverride(opening?.notes);

    // O total da fatura deve considerar o totalOverride se existir, 
    // caso contrário a soma dos itens do ciclo + saldo inicial.
    const total = totalOverride ?? (itemsTotal + openingAmount);

    const itemsPaidTotal = items.filter((e) => e.paid).reduce((s, e) => s + installmentValue(e), 0);
    const paidTotal = override ?? Number((itemsPaidTotal + (openingPaidFlag ? openingAmount : 0)).toFixed(2));
    const cycleHasPending = Math.max(0, total - paidTotal) > 0.005;
    const cycleEverHadValue = items.length > 0 || openingAmount > 0 || openingPaidFlag || override !== null;
    const paid = cycleEverHadValue && !cycleHasPending;

    if (total > 0 || (paid && paidTotal > 0) || override !== null) {
      result.push({ card, total, paid, paidTotal, hasPaidOverride: override !== null });
    }
  }
  return result;
}


/** Resultado do vínculo despesa ↔ cartão. */
export type CardLinkMatch = "match" | "other" | "unknown";

/**
 * Determina se uma despesa de crédito pertence ao cartão informado.
 * Prioridade: marcador {ID:uuid} → paymentMethodId → tag "Cartão: <apelido>".
 * "other" = está explicitamente vinculada a outro cartão; "unknown" = sem vínculo.
 */
export function matchCardLink(
  e: Pick<Expense, "notes" | "paymentMethodId">,
  card: Pick<CreditCard, "id" | "nickname" | "lastFour">,
): CardLinkMatch {
  const n = (e.notes ?? "").toLowerCase();
  const idMatch = /\{id:([a-f0-9-]{36})\}/i.exec(n);
  if (idMatch) return idMatch[1] === String(card.id).toLowerCase() ? "match" : "other";
  if (e.paymentMethodId && e.paymentMethodId === card.id) return "match";
  const cardTag = (card.nickname || card.lastFour || "").toLowerCase();
  if (cardTag) {
    const pattern = new RegExp(`cart[a\u00e3]o:\\s*${cardTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    if (pattern.test(n)) return "match";
  }
  if (/cart[a\u00e3]o[:\s]/i.test(n)) return "other";
  return "unknown";
}

/** Ciclo: [from inclusivo, to exclusivo) — o dia do fechamento abre o próximo ciclo. */
export function isExpenseInCycle(e: Pick<Expense, "dueDate">, from: Date, to: Date): boolean {
  if (!e.dueDate) return false;
  const d = new Date(e.dueDate + "T00:00:00");
  return d >= from && d < to;
}

/**
 * Fonte única de verdade da composição da fatura: a despesa precisa ser de crédito,
 * pertencer ao ciclo (data de fechamento anterior → fechamento atual) E não estar
 * vinculada a outro cartão. Vínculo de cartão NUNCA dispensa a janela do ciclo.
 */
export function belongsToCardInvoice(
  e: Pick<Expense, "notes" | "paymentMethodId" | "dueDate">,
  card: Pick<CreditCard, "id" | "nickname" | "lastFour">,
  from: Date,
  to: Date,
): boolean {
  if (!isCreditCardExpense(e)) return false;
  if (!isExpenseInCycle(e, from, to)) return false;
  return matchCardLink(e, card) !== "other";
}

/** Valor que a despesa representa numa fatura (parcela/mensalidade, não o total). */
export function invoiceItemValue(e: Pick<Expense, "type" | "amount" | "installments">): number {
  const isRec = e.type === "recorrente" && !!e.installments && e.installments > 1;
  return isRec ? e.amount / e.installments! : e.amount;
}

/** Categoria virtual usada para agregar faturas de cartão no resumo. */
export const CREDIT_CARD_INVOICE_CATEGORY = "Cartão de Crédito";

export interface PaidInvoiceEntry {
  card: CreditCard;
  cycleKey: string;
  /** Data de vencimento do ciclo (YYYY-MM-DD). */
  dueDate: string;
  /** Data efetiva do pagamento (último paid_date dentre os itens) ou dueDate como fallback. */
  paidDate: string;
  /** Valor total da fatura. */
  total: number;
  /** Valor efetivamente pago (com override [PAID:xxx] se houver). */
  paidTotal: number;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Lista todas as faturas de cartão pagas cujo pagamento ocorreu dentro do intervalo
 * [fromISO, toISO] (datas YYYY-MM-DD inclusivas). Uma entrada por (cartão, ciclo).
 */
export function listPaidInvoicesInRange(
  expenses: Expense[],
  cards: CreditCard[],
  openings: InvoiceOpening[],
  fromISO: string,
  toISO: string,
): PaidInvoiceEntry[] {
  if (!fromISO || !toISO) return [];
  const expanded = expandCreditCardExpenses(expenses);
  const fromDate = new Date(fromISO + "T00:00:00");
  const toDate = new Date(toISO + "T23:59:59");

  // Cobre meses entre from e to com folga de ±1 para pegar faturas cuja due cai fora
  // do range mas o pagamento foi dentro.
  const months: string[] = [];
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth() - 1, 1);
  const end = new Date(toDate.getFullYear(), toDate.getMonth() + 1, 1);
  while (cursor <= end) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const out: PaidInvoiceEntry[] = [];
  for (const card of cards) {
    if (card.active === false) continue;
    for (const yyyymm of months) {
      const cycle = getCycleForDueMonth(yyyymm, card.closingDay, card.dueDay);
      if (!cycle) continue;

      const items = expanded.filter((e) => belongsToCardInvoice(e, card, cycle.from, cycle.to));
      const installmentValue = invoiceItemValue;
      const itemsTotal = items.reduce((s, e) => s + installmentValue(e), 0);

      const cycleKey = cycleKeyFromDate(cycle.to);
      const opening = openings.find((o) => o.cardId === card.id && o.cycleKey === cycleKey);
      const openingAmount = opening?.openingAmount ?? 0;
      const openingPaidFlag = /\[PAGA\]/i.test(opening?.notes ?? "");
      const override = readPaidOverride(opening?.notes);
      const totalOverride = readTotalOverride(opening?.notes);

      const total = totalOverride ?? (itemsTotal + openingAmount);


      const itemsPaidTotal = items
        .filter((e) => e.paid)
        .reduce((s, e) => s + installmentValue(e), 0);
      const paidTotal = override ?? Number((itemsPaidTotal + (openingPaidFlag ? openingAmount : 0)).toFixed(2));
      const invoiceTotal = Math.max(total, paidTotal);
      if (paidTotal <= 0) continue;

      // Data efetiva do pagamento: último paid_date entre os itens; fallback = dueDate.
      const paidDates = items
        .map((e) => e.paidDate)
        .filter((d): d is string => !!d)
        .sort();
      const paidDate = readPaidDate(opening?.notes) ?? (paidDates.length > 0 ? paidDates[paidDates.length - 1] : toISO_(cycle.dueDate));

      // Filtra pelo intervalo (pela data do pagamento).
      if (paidDate < fromISO || paidDate > toISO) continue;

      out.push({
        card,
        cycleKey,
        dueDate: toISO_(cycle.dueDate),
        paidDate,
        total: Number(invoiceTotal.toFixed(2)),
        paidTotal: Number(paidTotal.toFixed(2)),
      });
    }
  }
  return out;
}

function toISO_(d: Date): string {
  return toISO(d);
}

/**
 * Soma o "excedente pago" das faturas de cartão — quando o valor pago real
 * (override [PAID:xxx] ou saldo inicial já pago) supera o que foi registrado
 * como itens individuais pagos. Esse delta precisa sair do saldo em conta
 * porque representa uma saída real que não está em nenhuma despesa individual.
 */
export function creditCardInvoiceExtraPaid(
  expenses: Expense[],
  cards: CreditCard[],
  openings: InvoiceOpening[],
): number {
  const expanded = expandCreditCardExpenses(expenses);
  let extra = 0;
  for (const opening of openings) {
    const card = cards.find((c) => c.id === opening.cardId);
    if (!card) continue;
    // Quando o pagamento já foi lançado no extrato (ledger), o débito real ocorre
    // via external.total (balance table). Não somar ccExtra para evitar dupla saída.
    if (creditCardLedgerHandled(opening.notes)) continue;
    const override = readPaidOverride(opening.notes);
    const openingPaidFlag = /\[PAGA\]/i.test(opening.notes ?? "");
    // Só conta quando há saldo inicial pago (override OU [PAGA] com opening_amount original).
    if (override === null && !openingPaidFlag) continue;

    // Reconstrói o ciclo a partir do cycleKey (YYYY-MM do fechamento).
    const [cy, cm] = opening.cycleKey.split("-").map(Number);
    const cycleTo = new Date(cy, cm - 1, Math.min(card.closingDay, new Date(cy, cm, 0).getDate()));
    const cycleFrom = new Date(cy, cm - 2, Math.min(card.closingDay, new Date(cy, cm - 1, 0).getDate()));

    const items = expanded.filter((e) => belongsToCardInvoice(e, card, cycleFrom, cycleTo));
    const installmentValue = invoiceItemValue;
    const itemsPaidTotal = items
      .filter((e) => e.paid)
      .reduce((s, e) => s + installmentValue(e), 0);
    const paidTotal = override ?? (opening.openingAmount + itemsPaidTotal);
    const delta = paidTotal - itemsPaidTotal;
    if (delta > 0) extra += delta;
  }
  return extra;
}
