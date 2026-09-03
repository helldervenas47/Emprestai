import type { Client, Loan, InstallmentSchedule, Payment } from "@/types/loan";
import { getDueStatus, type DueStatus } from "@/features/financial/lib/dueStatus";
import { getLoanLateFees, getBaseRemainingAmount } from "@/features/loans/lib/loanLateFees";

export type BillingMessageStatus = "upcoming" | "due_today" | "overdue" | "very_overdue";

export interface WhatsappBillingMessages {
  message_upcoming: string;
  message_due_today: string;
  message_overdue: string;
  message_very_overdue: string;
  message_manager_weekly: string;
  pix_link: string;
  very_overdue_days: number;
}

export const DEFAULT_WHATSAPP_MESSAGES: WhatsappBillingMessages = {
  message_upcoming:
    "Olá {nome_cliente}, sua parcela de {valor_parcela} vence em {data_vencimento}. Evite juros pagando antecipadamente.\n{link_pagamento}",
  message_due_today:
    "Olá {nome_cliente}, sua parcela de {valor_parcela} vence hoje ({data_vencimento}). Por favor, regularize para evitar encargos.\n{link_pagamento}",
  message_overdue:
    "Olá {nome_cliente}, sua parcela de {valor_parcela} venceu há {dias_atraso} dia(s). Com juros/multa de {juros}, o valor atual é {valor_total}. Entre em contato para regularizar.\n{link_pagamento}",
  message_very_overdue:
    "Olá {nome_cliente}, identificamos um atraso significativo de {dias_atraso} dias na sua parcela de {valor_parcela}. Total atualizado com encargos: {valor_total} ({juros} de juros/multa). É urgente regularizar.\n{link_pagamento}",
  message_manager_weekly:
    "Olá! Resumo da semana:\n• {total_emprestimos_semana} empréstimo(s) vencendo\n• Total: {valores_totais}\n\nClientes:\n{lista_clientes}",
  pix_link: "",
  very_overdue_days: 30,
};

/** Pick the next relevant installment due date for a loan. */
export function getNextLoanDueDate(
  loan: Loan,
  schedules: InstallmentSchedule[] = [],
  payments: Payment[] = [],
): { dueDate: string; amount: number; status: DueStatus } {
  const loanSchedules = schedules
    .filter((s) => s.loanId === loan.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const paidNumbers = new Set(
    payments.filter((p) => p.loanId === loan.id && p.installmentNumber > 0).map((p) => p.installmentNumber),
  );

  const next = loanSchedules.find((s) => !paidNumbers.has(s.installmentNumber));
  if (next) {
    return {
      dueDate: next.dueDate,
      amount: Number(next.amount) || 0,
      status: getDueStatus(next.dueDate, false),
    };
  }
  return {
    dueDate: loan.dueDate,
    amount: Number(loan.remainingAmount ?? loan.amount) || 0,
    status: getDueStatus(loan.dueDate, loan.status === "paid"),
  };
}

export function dueStatusToBilling(s: DueStatus): BillingMessageStatus | null {
  if (s === "overdue") return "overdue";
  if (s === "due_today") return "due_today";
  if (s === "upcoming") return "upcoming";
  return null;
}

function formatBR(date: string | undefined | null): string {
  if (!date) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function daysBetween(dueDate: string): number {
  if (!dueDate) return 0;
  const due = new Date(`${dueDate.substring(0, 10)}T00:00:00`).getTime();
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.floor((today - due) / (1000 * 60 * 60 * 24));
}

export interface MessageRenderContext {
  nome_cliente: string;
  valor_parcela: number;
  data_vencimento: string;
  dias_atraso: number;
  juros: number;
  valor_total: number;
  etiqueta: string;
  link_pagamento: string;
}

export function applyMessageVariables(
  message: string,
  ctx: Partial<MessageRenderContext> & { name?: string; amount?: number; dueDate?: string },
): string {
  const nome = ctx.nome_cliente ?? ctx.name ?? "";
  const valorParcela = ctx.valor_parcela ?? ctx.amount ?? 0;
  const dataVenc = ctx.data_vencimento ?? ctx.dueDate ?? "";
  const dias = ctx.dias_atraso ?? 0;
  const juros = ctx.juros ?? 0;
  const valorTotal = ctx.valor_total ?? valorParcela;
  const etiqueta = ctx.etiqueta ?? "";
  const link = ctx.link_pagamento ?? "";

  return message
    .replace(/\{nome_cliente\}/g, nome)
    .replace(/\{nome\}/g, nome)
    .replace(/\{valor_parcela\}/g, formatBRL(valorParcela))
    .replace(/\{valor\}/g, formatBRL(valorParcela))
    .replace(/\{data_vencimento\}/g, formatBR(dataVenc))
    .replace(/\{dias_atraso\}/g, String(Math.max(0, dias)))
    .replace(/\{juros\}/g, formatBRL(juros))
    .replace(/\{valor_total\}/g, formatBRL(valorTotal))
    .replace(/\{etiqueta\}/g, etiqueta)
    .replace(/\{link_pagamento\}/g, link);
}

export function pickMessage(messages: WhatsappBillingMessages, status: BillingMessageStatus): string {
  if (status === "very_overdue") return messages.message_very_overdue || messages.message_overdue;
  if (status === "overdue") return messages.message_overdue;
  if (status === "due_today") return messages.message_due_today;
  return messages.message_upcoming;
}

export function normalizePhoneBR(raw: string | undefined | null): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

export function buildWhatsappLink(phone: string, message: string): string {
  const normalized = normalizePhoneBR(phone);
  const text = encodeURIComponent(message);
  if (!normalized) return `https://wa.me/?text=${text}`;
  return `https://wa.me/${normalized}?text=${text}`;
}

/** Validate a template — returns list of unknown variable names found. */
const KNOWN_VARS = new Set([
  "nome_cliente", "nome", "valor_parcela", "valor", "data_vencimento",
  "dias_atraso", "juros", "valor_total", "etiqueta", "link_pagamento",
  // manager-only
  "total_emprestimos_semana", "lista_clientes", "valores_totais", "etiquetas",
]);
export function findUnknownVariables(template: string): string[] {
  const matches = template.match(/\{([a-z_]+)\}/g) ?? [];
  const unknown: string[] = [];
  for (const m of matches) {
    const name = m.slice(1, -1);
    if (!KNOWN_VARS.has(name) && !unknown.includes(name)) unknown.push(name);
  }
  return unknown;
}

export function buildBillingWhatsappLink(params: {
  client?: Client | null;
  loan: Loan;
  schedules?: InstallmentSchedule[];
  payments?: Payment[];
  messages: WhatsappBillingMessages;
}): { url: string; status: BillingMessageStatus | null; phone: string; message: string } {
  const { client, loan, schedules = [], payments = [], messages } = params;
  const next = getNextLoanDueDate(loan, schedules, payments);
  const billingStatus = dueStatusToBilling(next.status);
  let status: BillingMessageStatus = billingStatus ?? "upcoming";

  // Compute late fees / days overdue
  const fees = getLoanLateFees(loan, payments, schedules);
  const dias = fees.daysOverdue || Math.max(0, daysBetween(next.dueDate));
  if (status === "overdue" && dias >= (messages.very_overdue_days || 30)) {
    status = "very_overdue";
  }

  const juros = fees.lateFees || 0;
  const valorTotal = next.amount + juros;
  const etiqueta = Array.isArray(loan.tags)
    ? loan.tags
        .map((t) => (t == null ? "" : String(t).trim()))
        .filter((t) => t.length > 0 && t.toLowerCase() !== "null" && t.toLowerCase() !== "undefined")
        .join(", ")
    : "";

  const template = pickMessage(messages, status);
  const message = applyMessageVariables(template, {
    nome_cliente: client?.name || loan.borrowerName,
    valor_parcela: next.amount,
    data_vencimento: next.dueDate,
    dias_atraso: dias,
    juros,
    valor_total: valorTotal,
    etiqueta,
    link_pagamento: messages.pix_link || "",
  });
  const phone = client?.phone || "";
  return { url: buildWhatsappLink(phone, message), status: billingStatus, phone, message };
}

// avoid unused import warning — used above only when computing remaining; keep export available
export { getBaseRemainingAmount };
