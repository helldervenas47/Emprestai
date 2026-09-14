import type { Client, InstallmentSchedule, Loan, Payment } from "@/types/loan";
import {
  getDueInstallmentsUntilToday,
  getInstallmentAmount,
  getOverdueInstallments,
} from "@/features/loans/lib/loanInstallmentAmount";
import { calculateInstallment } from "@/features/loans/hooks/useLoans";
import { getLoanLateFees } from "@/features/loans/lib/loanLateFees";
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
    const rawPromisedDate = storedPromise?.promised_date;
    const promisedDate = (rawPromisedDate && rawPromisedDate >= dueDate) ? rawPromisedDate : undefined;
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
    const totalPaid = payments
      .filter((p) => p.loanId === loan.id)
      .reduce((sum, p) => sum + finiteMoney(p.amount), 0);
    const totalExpected = Math.round(safePrincipal * (1 + (Number(loan.interestRate) || 0) / 100));

    // Matriz de 1 parcela (exatamente o campo "Restante" da aba Empréstimos):
    const singleInstallmentRemaining = loan.status === "paid"
      ? 0
      : safeRemaining > 0
        ? safeRemaining
        : Math.max(0, totalExpected - totalPaid);

    const dueInstallments = loan.installments > 1
      ? getDueInstallmentsUntilToday(loan, schedules, today, payments)
      : [];
    const dueInstallmentCount = dueInstallments.length;
    const dueBase = dueInstallments.reduce(
      (sum, installment) => sum + finiteMoney(installment.amount),
      0,
    );

    const overdueInstallments = loan.installments > 1
      ? getOverdueInstallments(loan, schedules, today, payments)
      : [];
    const overdueInstallmentCount = overdueInstallments.length;

    let amount = 0;
    let baseAmount = 0;
    let installmentCount = 1;

    if (loan.installments > 1) {
      // Para empréstimos parcelados: soma dos valores vencidos ou a vencer no dia da cobrança
      if (dueInstallmentCount > 0) {
        amount = dueBase;
        installmentCount = dueInstallmentCount;
      } else {
        // Sem parcelas vencidas/hoje (lembrete de parcela futura no dia da cobrança)
        const nextInstallment = getInstallmentAmount(loan, schedules, payments);
        const fallbackUnit = finiteMoney(
          loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, Math.max(1, loan.installments))
        );
        amount = nextInstallment > 0 ? nextInstallment : fallbackUnit;
        installmentCount = 1;
      }
      if (safeRemaining > 0 && amount > safeRemaining) {
        amount = safeRemaining;
      }
      baseAmount = amount;
    } else {
      // Para empréstimos com apenas 1 parcela: usa a matriz do campo Restante da aba Empréstimos
      amount = singleInstallmentRemaining;
      baseAmount = singleInstallmentRemaining;
      installmentCount = 1;
    }

    amount = Math.round(amount * 100) / 100;
    baseAmount = Math.round(baseAmount * 100) / 100;

    let chargedPrincipal = 0;
    if (loan.installments > 1) {
      const principalPerInstallment = safePrincipal / Math.max(1, loan.installments);
      chargedPrincipal = Math.min(amount, principalPerInstallment * installmentCount);
    } else {
      const contractualInterestRate = Number(loan.interestRate) || 0;
      const nominalInterest = (safePrincipal * contractualInterestRate) / 100;
      chargedPrincipal = Math.max(0, amount - nominalInterest);
      if (chargedPrincipal > safePrincipal) {
        chargedPrincipal = safePrincipal;
      }
    }

    let interestAmount = Math.max(0, Math.round((amount - chargedPrincipal) * 100) / 100);
    // Elimina resíduos de ponto flutuante/dízimas periódicas de parcelamento (ex: R$ 50,03 -> R$ 50,00 ou R$ 850,01 -> R$ 850,00)
    const cents = Math.round((Math.abs(interestAmount) % 1) * 100);
    if ((cents >= 1 && cents <= 3) || (cents >= 97 && cents <= 99)) {
      const nearestInteger = Math.round(interestAmount);
      if (Math.abs(interestAmount - nearestInteger) <= 0.035) {
        interestAmount = nearestInteger;
      }
    }
    interestAmount = Math.min(interestAmount, amount);
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
      lateFees: 0,
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
