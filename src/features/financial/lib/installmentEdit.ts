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

  for (let i = 0; i < count; i++) {
    const installmentNumber = i + 1;
    const label = `(${installmentNumber}/${count})`;
    
    // Procura se já existe um registro físico para esta parcela (filho pago)
    const physicalChild = siblings.find(s => s.description.includes(label));
    
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
      const instDateStr = instDate.toISOString().split('T')[0];
      
      installments.push({
        index: i,
        dueDate: instDateStr,
        amount: baseInstallmentAmount,
        paid: (parent.paidInstallments || 0) > i,
        description: `${parent.description} ${label}`
      });
    }
  }
  
  return installments;
}

/**
 * Filtra metadados e notas de parcelas para salvar estados customizados.
 * Para suportar datas/valores customizados em parcelas virtuais (ainda não pagas),
 * podemos usar um objeto JSON nas notas do pai.
 */
export function serializeCustomInstallments(edits: IndividualInstallmentEdit[]): string {
  // Apenas parcelas que diferem do padrão (ou todas para garantir?)
  // Por enquanto, vamos salvar apenas se houver mudanças.
  return JSON.stringify(edits.map(e => ({ i: e.index, d: e.dueDate, a: e.amount })));
}

export function deserializeCustomInstallments(notes: string | undefined): IndividualInstallmentEdit[] | null {
  if (!notes) return null;
  const match = notes.match(/\[CustomInstallments:(.*?)\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Registros "filhos" (recibos) criados ao pagar uma parcela de uma despesa
 * parcelada. O pai já é expandido virtualmente em todas as competências, então
 * exibir o filho no mesmo mês gera DUPLICIDADE na lista e nos totais.
 * Estes registros continuam existindo no banco (histórico/extrato), mas não
 * devem ser renderizados como uma despesa própria.
 */
export function isInstallmentReceipt(
  e: Pick<Expense, "id" | "parentExpenseId">,
  all: Pick<Expense, "id" | "installments" | "type">[],
): boolean {
  if (!e.parentExpenseId) return false;
  const parent = all.find((p) => p.id === e.parentExpenseId);
  if (!parent) return false;
  return (parent.installments ?? 1) > 1;
}

/** Remove os recibos de parcelas da lista exibida. */
export function withoutInstallmentReceipts<T extends Pick<Expense, "id" | "parentExpenseId" | "installments" | "type">>(
  list: T[],
): T[] {
  return list.filter((e) => !isInstallmentReceipt(e, list));
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
    .replace(/\[PrevDue:\s*[\d-]+\]/gi, "")
    .replace(/\[Partial:[^\]]*\]/gi, "")
    .replace(/\[Skip:[^\]]*\]/gi, "")
    .replace(/\[SkipFrom:[^\]]*\]/gi, "")
    .replace(/\[NextAfter:[^\]]*\]/gi, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
