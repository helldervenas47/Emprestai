import type { Client, InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { getInstallmentAmount, getOverdueInstallments } from "@/features/loans/lib/loanInstallmentAmount";
import { getLoanLateFees } from "@/features/loans/lib/loanLateFees";
import { getLoanPendingBreakdown } from "@/features/loans/lib/portfolioPending";
import {
  applyMessageVariables,
  DEFAULT_WHATSAPP_MESSAGES,
  normalizePhoneBR,
  pickMessage,
  type WhatsappBillingMessages,
} from "@/lib/whatsappBilling";

export type BillingPriority = "requested_today" | "overdue" | "today" | "tomorrow" | "in_two_days" | "in_three_days" | "in_four_days" | "future_later";

export interface PaymentPromise {
  loan_id: string;
  installment_number: number;
  promised_date: string;
}

export interface BillingCandidate {
  key: string;
  loanId: string;
  clientId: string;
  clientName: string;
  phone: string;
  validPhone: boolean;
  installmentNumber: number;
  contractLabel: string;
  amount: number;
  baseAmount: number;
  lateFees: number;
  interestAmount: number;
  overdueInstallmentCount: number;
  dueDate: string;
  billingDate: string;
  promisedDate?: string;
  promisedDateSource?: "stored";
  daysOverdue: number;
  priority: BillingPriority;
  message: string;
}

export const DEFAULT_CENTER_TEMPLATE =
  "Olá, {nome_cliente}!\n\nPassando para lembrar sobre sua parcela de {valor_parcela}, com vencimento em {data_vencimento}.\n\nCaso já tenha realizado o pagamento, desconsidere esta mensagem.\n\nEmprestAI";

export function isValidWhatsappPhone(raw: string): boolean {
  const normalized = normalizePhoneBR(raw);
  return /^55\d{10,11}$/.test(normalized);
}

const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const diffDays = (a: string, b: string) => Math.round(
  (new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86_400_000,
);

const finiteMoney = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
};

export function buildBillingCandidates(params: {
  loans: Loan[];
  clients: Client[];
  schedules: InstallmentSchedule[];
  payments: Payment[];
  promises?: PaymentPromise[];
  today: string;
  template?: string;
  messages?: Partial<WhatsappBillingMessages>;
}): BillingCandidate[] {
  const { loans, clients, schedules, payments, promises = [], today } = params;
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const tomorrow = addDays(today, 1);
  const inTwoDays = addDays(today, 2);
  const inThreeDays = addDays(today, 3);
  const inFourDays = addDays(today, 4);

  return loans.flatMap((loan): BillingCandidate[] => {
    if (loan.status === "paid" || loan.paidInstallments >= loan.installments) return [];
    const client = loan.borrowerId ? clientById.get(loan.borrowerId) : undefined;
    const clientId = client?.id || loan.borrowerId || `loan:${loan.id}`;
    const clientName = client?.name || loan.borrowerName || "Cliente não identificado";
    const clientPhone = client?.phone || "";
    const installmentNumber = loan.paidInstallments + 1;
    const schedule = schedules.find((s) => s.loanId === loan.id && s.installmentNumber === installmentNumber);
    const dueDate = (schedule?.dueDate || loan.dueDate).slice(0, 10);
    const storedPromise = promises.find((p) => p.loan_id === loan.id && p.installment_number === installmentNumber);
    const promisedDate = storedPromise?.promised_date;
    const billingDate = promisedDate || dueDate;
    const delta = diffDays(dueDate, today);
    const billingDelta = diffDays(billingDate, today);
    let priority: BillingPriority | null = null;
    if (billingDate === today) priority = promisedDate ? "requested_today" : "today";
    else if (billingDate < today) priority = "overdue";
    else if (billingDate === tomorrow) priority = "tomorrow";
    else if (billingDate === inTwoDays) priority = "in_two_days";
    else if (billingDate === inThreeDays) priority = "in_three_days";
    else if (billingDate === inFourDays) priority = "in_four_days";
    else priority = "future_later";
    const safeRemaining = finiteMoney(loan.remainingAmount);
    const safePrincipal = finiteMoney(loan.amount);
    const calculatedInstallment = getInstallmentAmount(loan, schedules, payments);
    const nextInstallmentAmount = finiteMoney(
      calculatedInstallment,
      safeRemaining > 0 ? safeRemaining : safePrincipal,
    );
    const overdueInstallments = loan.installments > 1
      ? getOverdueInstallments(loan, schedules, today, payments)
      : [];
    const overdueInstallmentCount = overdueInstallments.length;
    const overdueBase = overdueInstallments.reduce(
      (sum, installment) => sum + finiteMoney(installment.amount),
      0,
    );
    const baseAmount = overdueInstallmentCount > 1 ? overdueBase : nextInstallmentAmount;
    const lateFees = finiteMoney(getLoanLateFees(loan, payments, schedules, today).lateFees);
    const renegotiationPenalty = loan.installments < 2
      ? finiteMoney(loan.renegotiationPenaltyTotal)
      : 0;
    const amount = Math.round((baseAmount + lateFees + renegotiationPenalty) * 100) / 100;
    const loanBreakdown = getLoanPendingBreakdown(loan, payments, schedules, today);
    const interestAmount = Math.round(finiteMoney(loanBreakdown.interestPending) * 100) / 100;
    const phone = normalizePhoneBR(clientPhone);
    const contractLabel = Array.isArray(loan.tags)
      ? loan.tags.map(String).map((tag) => tag.trim()).filter(Boolean).join(", ")
      : "";
    const messages = { ...DEFAULT_WHATSAPP_MESSAGES, ...(params.messages || {}) };
    const messageDaysOverdue = Math.max(0, -billingDelta);
    const messageStatus = daysOverdueStatus(priority, messageDaysOverdue, messages.very_overdue_days);
    const template = params.template || pickMessage(messages, messageStatus);
    return [{
      key: `${loan.id}:${installmentNumber}`,
      loanId: loan.id,
      clientId,
      clientName,
      phone,
      validPhone: isValidWhatsappPhone(clientPhone),
      installmentNumber,
      contractLabel: contractLabel || clientName,
      amount,
      baseAmount,
      lateFees: lateFees + renegotiationPenalty,
      interestAmount,
      overdueInstallmentCount,
      dueDate,
      billingDate,
      promisedDate,
      promisedDateSource: storedPromise ? "stored" : undefined,
      daysOverdue: Math.max(0, -delta),
      priority,
      message: `${applyMessageVariables(template, {
        nome_cliente: clientName, valor_parcela: amount, data_vencimento: billingDate,
        dias_atraso: messageDaysOverdue, etiqueta: contractLabel,
      })}${overdueInstallmentCount > 1 ? `\n\n${overdueInstallmentCount} parcelas vencidas. Valor total: ${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.` : ""}${promisedDate ? `\n\nVenc. ${promisedDate.split("-").reverse().join("/")}.` : ""}`,
    }];
  }).sort((a, b) => {
    const order: BillingPriority[] = ["requested_today", "today", "overdue", "tomorrow", "in_two_days", "in_three_days", "in_four_days", "future_later"];
    return order.indexOf(a.priority) - order.indexOf(b.priority) || a.billingDate.localeCompare(b.billingDate);
  });
}

function daysOverdueStatus(
  priority: BillingPriority,
  daysOverdue: number,
  veryOverdueDays: number,
): "upcoming" | "due_today" | "overdue" | "very_overdue" {
  if (daysOverdue > 0 || priority === "overdue") {
    return daysOverdue >= (veryOverdueDays || 30) ? "very_overdue" : "overdue";
  }
  if (priority === "today" || priority === "requested_today") return "due_today";
  return "upcoming";
}
