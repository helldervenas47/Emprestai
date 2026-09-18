import { Expense } from "@/types/loan";

export interface IndividualInstallmentEdit {
  index: number; // 0-based
  id?: string; // id do registro no banco se já for um registro individual
  dueDate: string;
  amount: number;
  paid: boolean;
  description: string;
}

/** Marcador imutável da data do 1º vencimento da série parcelada. */
const SERIES_START_RE = /\[SerieStart:\s*(\d{4}-\d{2}-\d{2})\]/i;

export function readSeriesStart(notes?: string | null): string | null {
  const m = (notes ?? "").match(SERIES_START_RE);
  return m ? m[1] : null;
}

export function withSeriesStart(notes: string | null | undefined, startDate: string): string {
  const base = (notes ?? "").replace(SERIES_START_RE, "").replace(/\n{2,}/g, "\n").trim();
  return base ? `${base}\n[SerieStart: ${startDate}]` : `[SerieStart: ${startDate}]`;
}

/**
 * Fonte única de verdade da posição das parcelas: a data do 1º vencimento.
 * Quando o marcador [SerieStart] existe (registros novos e já curados), ele é
 * usado diretamente — a numeração NUNCA depende de quantas parcelas foram pagas.
 * Fallback (registros legados): recupera a data recuando o vencimento atual
 * pelo número de parcelas pagas, limitado à última parcela da série.
 */
export function getInstallmentScheduleStart(parent: Expense): string {
  const marked = readSeriesStart(parent.notes);
  if (marked) return marked;

  const total = Math.max(1, parent.installments ?? 1);
  const paidCount = Math.max(0, Math.min(parent.paidInstallments ?? 0, total - 1));
  const [year, month, day] = parent.dueDate.split("-").map(Number);
  const start = new Date(year, month - 1 - paidCount, day);
  return [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, "0"),
    String(start.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Posição (1-based) da parcela cujo vencimento cai no mês informado (YYYY-MM). */
export function getInstallmentNumberForMonth(parent: Expense, month: string): number {
  const total = Math.max(1, parent.installments ?? 1);
  const [sy, sm] = getInstallmentScheduleStart(parent).split("-").map(Number);
  const [my, mm] = month.split("-").map(Number);
  const diff = (my * 12 + mm) - (sy * 12 + sm);
  return Math.min(Math.max(1, diff + 1), total);
}

/** Posição (1-based) da parcela correspondente a uma data de vencimento. */
export function getInstallmentNumberForDueDate(parent: Expense, dueDate: string): number {
  return getInstallmentNumberForMonth(parent, dueDate.slice(0, 7));
}

/** Data de vencimento correspondente à parcela do mês selecionado (YYYY-MM). */
export function getDueDateForMonth(parent: Expense, month: string): string {
  if (parent.type !== "recorrente" || (parent.installments ?? 0) <= 1) return parent.dueDate;
  const idx = getInstallmentNumberForMonth(parent, month) - 1;
  const customList = deserializeCustomInstallments(parent.notes);
  const customItem = customList?.find(c => c.index === idx);
  if (customItem?.dueDate) return customItem.dueDate;

  const scheduleStart = getInstallmentScheduleStart(parent);
  const [dYear, dMonth, dDay] = scheduleStart.split("-").map(Number);
  const dt = new Date(dYear, dMonth - 1 + idx, dDay);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Recalcula o total de uma despesa recorrente baseada em edições individuais.
 */
export function calculateTotalFromInstallments(installments: IndividualInstallmentEdit[]): number {
  return installments.reduce((sum, inst) => sum + inst.amount, 0);
}

/**
 * Gera a lista de parcelas "virtuais" ou reais para edição.
 */
export function getInstallmentEdits(parent: Expense, siblings: Expense[]): IndividualInstallmentEdit[] {
  const count = parent.installments || 1;
  const installments: IndividualInstallmentEdit[] = [];

  const scheduleStart = getInstallmentScheduleStart(parent);
  const [dYear, dMonth, dDay] = scheduleStart.split("-").map(Number);
  const baseInstallmentAmount = parent.amount / count;
  const customList = deserializeCustomInstallments(parent.notes);

  for (let i = 0; i < count; i++) {
    const installmentNumber = i + 1;
    const label = `(${installmentNumber}/${count})`;
    
    // Procura se já existe um registro físico para esta parcela (filho pago)
    const physicalChild = siblings.find(s => s.description.includes(label));
    const customItem = customList?.find(c => c.index === i);
    
    if (physicalChild) {
      installments.push({
        index: i,
        id: physicalChild.id,
        dueDate: physicalChild.dueDate,
        amount: physicalChild.amount,
        paid: physicalChild.paid,
        description: physicalChild.description
      });
    } else {
      // Parcela virtual
      const instDate = new Date(dYear, dMonth - 1 + i, dDay);
      const instDateStr = customItem?.dueDate || instDate.toISOString().split('T')[0];
      const instAmount = customItem ? customItem.amount : baseInstallmentAmount;
      
      installments.push({
        index: i,
        dueDate: instDateStr,
        amount: instAmount,
        paid: (parent.paidInstallments || 0) > i,
        description: `${parent.description} ${label}`
      });
    }
  }
  
  return installments;
}

/**
 * Filtra metadados e notas de parcelas para salvar estados customizados.
 */
export function serializeCustomInstallments(edits: IndividualInstallmentEdit[]): string {
  return encodeURIComponent(JSON.stringify(edits.map(e => ({ i: e.index, d: e.dueDate, a: e.amount }))));
}

export function deserializeCustomInstallments(notes: string | undefined | null): IndividualInstallmentEdit[] | null {
  if (!notes) return null;
  const match = notes.match(/\[CustomInstallments:([^\]]+)\]/);
  if (!match) return null;
  try {
    const raw = match[1].trim();
    const jsonStr = raw.startsWith("%") || raw.startsWith("[") || raw.startsWith("{")
      ? (raw.startsWith("%") ? decodeURIComponent(raw) : raw)
      : decodeURIComponent(raw);
    const parsed = JSON.parse(jsonStr);
    const list = Array.isArray(parsed) ? parsed : (parsed as any)?.items;
    if (!Array.isArray(list)) return null;
    return list.map((item: any) => ({
      index: item.index ?? item.i ?? 0,
      dueDate: item.dueDate ?? item.d ?? "",
      amount: item.amount ?? item.a ?? 0,
      paid: false,
      description: "",
    }));
  } catch {
    return null;
  }
}

export function withoutCustomInstallments(notes: string | null | undefined): string {
  return (notes ?? "").replace(/\[CustomInstallments:[^\]]*\]/gi, "").replace(/\n{2,}/g, "\n").trim();
}

export function withCustomInstallments(notes: string | null | undefined, edits: IndividualInstallmentEdit[]): string {
  const base = withoutCustomInstallments(notes);
  const serialized = serializeCustomInstallments(edits);
  return base ? `${base}\n[CustomInstallments:${serialized}]` : `[CustomInstallments:${serialized}]`;
}

/**
 * Retorna o valor de uma única parcela específica (customizada ou padrão proporcional).
 */
export function getSingleInstallmentAmount(
  expense: Pick<Expense, "amount" | "installments" | "notes" | "parentExpenseId" | "type" | "dueDate">,
  indexOrDueDate?: number | string,
): number {
  if (expense.parentExpenseId) {
    return expense.amount;
  }
  const isParcelada = expense.type === "recorrente" && (expense.installments ?? 0) > 1;
  if (!isParcelada) {
    return expense.amount;
  }
  const count = expense.installments || 1;
  const defaultAmount = expense.amount / count;
  const customList = deserializeCustomInstallments(expense.notes);
  if (!customList || customList.length === 0) {
    return defaultAmount;
  }

  let targetIndex = -1;
  if (typeof indexOrDueDate === "number") {
    targetIndex = indexOrDueDate;
  } else if (typeof indexOrDueDate === "string" && indexOrDueDate) {
    targetIndex = getInstallmentNumberForDueDate(expense as Expense, indexOrDueDate) - 1;
  }

  if (targetIndex >= 0) {
    const found = customList.find(c => c.index === targetIndex);
    if (found && typeof found.amount === "number") {
      return found.amount;
    }
  }

  return defaultAmount;
}

/**
 * Registros "filhos" (recibos) criados ao pagar uma parcela de uma despesa
 * parcelada. O pai já é expandido virtualmente em todas as competências, então
 * exibir o filho no mesmo mês gera DUPLICIDADE na lista e nos totais.
 * Estes registros continuam existindo no banco (histórico/extrato), mas não
 * devem ser renderizados como uma despesa própria.
 *
 * @param allRecords - Array completo de despesas (sem filtros de scope/tipo).
 *   Necessário para localizar o pai quando ele foi excluído do array `all`
 *   filtrado. Se não fornecido, usa `all` como fallback.
 */
export function isInstallmentReceipt(
  e: Pick<Expense, "id" | "parentExpenseId">,
  all: Pick<Expense, "id" | "installments" | "type">[],
  allRecords?: Pick<Expense, "id" | "installments" | "type">[],
): boolean {
  if (!e.parentExpenseId) return false;
  // Busca o pai primeiro no array filtrado, depois no array completo (se fornecido).
  // Isso garante que filhos cujo pai foi excluído do array por scope/tipo
  // ainda sejam corretamente identificados como recibos e filtrados.
  const pool = allRecords ?? all;
  const parent = all.find((p) => p.id === e.parentExpenseId) ?? pool.find((p) => p.id === e.parentExpenseId);
  if (!parent) {
    // Pai não encontrado em nenhum array: se o registro tem parentExpenseId
    // definido, é seguro assumir que é um filho orfão — tratar como recibo.
    return true;
  }
  return (parent.installments ?? 1) > 1;
}

/**
 * Remove os recibos de parcelas da lista exibida.
 *
 * @param allRecords - Array completo de despesas (sem filtros de scope/tipo)
 *   para identificar o pai mesmo quando ele foi excluído de `list`.
 */
export function withoutInstallmentReceipts<T extends Pick<Expense, "id" | "parentExpenseId" | "installments" | "type">>(
  list: T[],
  allRecords?: Pick<Expense, "id" | "installments" | "type">[],
): T[] {
  return list.filter((e) => !isInstallmentReceipt(e, list, allRecords));
}

/**
 * Cura registros legados sem o marcador [SerieStart]: deduz a data do 1º
 * vencimento a partir dos recibos filhos "(k/N)" já existentes. Assim a
 * numeração deixa de depender de `paidInstallments` (que podia ter sido
 * incrementado duas vezes em pagamentos concorrentes).
 */
export function withHealedSeriesStart(list: Expense[]): Expense[] {
  const parents = list.filter((e) => (e.installments ?? 1) > 1 && e.type === "recorrente");
  if (parents.length === 0) return list;
  const patch = new Map<string, string>();

  for (const parent of parents) {
    if (readSeriesStart(parent.notes)) continue;
    const children = list.filter((c) => c.parentExpenseId === parent.id);
    let start: string | null = null;
    for (const child of children) {
      const m = child.description.match(/\((\d+)\/(\d+)\)\s*$/);
      if (!m) continue;
      const k = Number(m[1]);
      if (!Number.isFinite(k) || k < 1) continue;
      const [y, mo, d] = child.dueDate.split("-").map(Number);
      const dt = new Date(y, mo - 1 - (k - 1), d);
      const candidate = [
        dt.getFullYear(),
        String(dt.getMonth() + 1).padStart(2, "0"),
        String(dt.getDate()).padStart(2, "0"),
      ].join("-");
      if (!start || candidate < start) start = candidate;
    }
    if (start) patch.set(parent.id, start);
  }

  if (patch.size === 0) return list;
  return list.map((e) => {
    const start = patch.get(e.id);
    return start ? { ...e, notes: withSeriesStart(e.notes, start) } : e;
  });
}

/** Remove marcadores internos das notas antes de exibir ao usuário. */
export function displayNotes(notes?: string | null): string {
  return (notes ?? "")
    .replace(SERIES_START_RE, "")
    .replace(/\[CustomInstallments:[^\]]*\]/gi, "")
    .replace(/\[PrevDue:\s*[\d-]+\]/gi, "")
    .replace(/\[Partial:[^\]]*\]/gi, "")
    .replace(/\[Skip:[^\]]*\]/gi, "")
    .replace(/\[SkipFrom:[^\]]*\]/gi, "")
    .replace(/\[NextAfter:[^\]]*\]/gi, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
