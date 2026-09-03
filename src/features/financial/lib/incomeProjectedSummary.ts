import type { Income } from "@/features/financial/hooks/useIncomes";
import type { CreditCard } from "@/features/creditCards/hooks/useCreditCards";
import type { InvoiceOpening } from "@/features/creditCards/hooks/useCreditCardOpenings";
import { isPiggyExpense } from "@/features/piggyBanks/hooks/usePiggyBanks";
import type { Expense } from "@/types/loan";
import { isVehicleExpenseForVehicles } from "@/features/vehicles/components/VehicleExpenseForm";
import { getCardInvoiceTotalsForMonth, isCreditCardExpense } from "@/features/creditCards/lib/creditCardInvoiceTotals";

export interface IncomeProjectedSummary {
  futureIn: number;
  futureOut: number;
  projected: number;
  projectedDiff: number;
  pendingInCount: number;
}

export function calculateIncomeProjectedSummary(opts: {
  baseBalance: number;
  incomes: Income[];
  expenses: Expense[];
  cards: CreditCard[];
  openings: InvoiceOpening[];
  monthKey: string;
}): IncomeProjectedSummary {
  const { baseBalance, incomes, expenses, cards, openings, monthKey } = opts;

  const pendingOccurrencesInMonth = (i: Income): number => {
    if (i.status !== "pending" && i.status !== "overdue") return 0;
    if (
      i.recurrence === "once" ||
      i.recurrence === "weekly" ||
      i.recurrence === "biweekly" ||
      i.recurrence === "monthly" ||
      i.recurrence === "yearly"
    ) {
      return i.receivedDate.startsWith(monthKey) ? 1 : 0;
    }
    return 0;
  };

  const monthlyExpenseAmount = (e: Expense) => {
    if (e.type === "recorrente" && e.installments && e.installments > 1) {
      return e.amount / e.installments;
    }
    return e.amount;
  };

  const occursInMonth = (e: Expense) => {
    const isRec = e.type === "recorrente" && !!e.installments && e.installments > 1;
    if (!isRec) return (e.dueDate || "").startsWith(monthKey);
    const [curY, curM] = monthKey.split("-").map(Number);
    const sel = curY * 12 + curM;
    const [dY, dM] = (e.dueDate || "0-0").split("-").map(Number);
    const start = dY * 12 + dM;
    const end = start + (e.installments! - 1);
    return sel >= start && sel <= end;
  };

  const isRecFullyPaid = (e: Expense) =>
    e.type === "recorrente" && !!e.installments && e.installments > 1 && e.paid;

  const futureIn = incomes.reduce((s, i) => s + pendingOccurrencesInMonth(i) * i.amount, 0);
  const pendingInCount = incomes.reduce((s, i) => s + pendingOccurrencesInMonth(i), 0);
  const personalPendingExpenses = expenses
    .filter((e) => {
      if ((e.scope ?? "business") !== "personal") return false;
      if (isPiggyExpense(e.notes)) return false;
      if (isCreditCardExpense(e)) return false;
      if (isVehicleExpenseForVehicles(e)) return false;
      if (isRecFullyPaid(e)) return false;
      return (e.paid && (e.paidDate || "").startsWith(monthKey)) || occursInMonth(e);
    })
    .filter((e) => !e.paid)
    .reduce((s, e) => s + monthlyExpenseAmount(e), 0);

  const cardInvoicePendingMonth = getCardInvoiceTotalsForMonth(expenses, cards, openings, monthKey)
    .reduce((s, x) => {
      if (x.hasPaidOverride) return s;
      if (x.paid) return s;
      return s + x.total;
    }, 0);

  const futureOut = personalPendingExpenses + cardInvoicePendingMonth;
  const projected = baseBalance + futureIn - futureOut;

  return {
    futureIn,
    futureOut,
    projected,
    projectedDiff: projected - baseBalance,
    pendingInCount,
  };
}