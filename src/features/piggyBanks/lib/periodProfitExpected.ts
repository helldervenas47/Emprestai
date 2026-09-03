import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { allocateInterestByPaymentUpTo } from "@/features/financial/lib/interestAllocation";

interface LoanLike {
  id: string;
  amount: number;
  interestRate: number;
  installments: number;
  status: string;
  paidInstallments?: number;
  dueDate?: string | null;
}

interface PaymentLike {
  loanId: string;
  amount: number;
  date: string;
  installmentNumber: number;
}

interface ScheduleLike {
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
}

function isInRange(dateStr: string, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return false;
  return d >= start && d <= end;
}

/**
 * Calcula o "Previsto restante" do período (juros previstos das parcelas com
 * vencimento no período). Pagamentos de juros-only (installmentNumber === 0)
 * empurram a parcela seguinte para o próximo vencimento, removendo-a do
 * "Previsto" do período. Para manter o Previsto estável, somamos de volta o
 * valor desses juros pagos no período.
 */
export function computePeriodProfitExpected(
  loans: LoanLike[],
  payments: PaymentLike[],
  schedules: ScheduleLike[],
  range: { start: Date; end: Date }
): number {
  const periodProfitExpected = loans.reduce((sum, loan) => {
    const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
    const totalInterest = Math.max(0, totalWithInterest - loan.amount);
    if (totalInterest <= 0) return sum;
    const interestRatio = totalWithInterest > 0 ? 1 - loan.amount / totalWithInterest : 0;

    if (loan.installments >= 2) {
      const interestPerInstallment = totalInterest / loan.installments;
      const loanSchedules = schedules.filter((sc) => sc.loanId === loan.id);
      if (loanSchedules.length > 0) {
        let acc = 0;
        loanSchedules
          .filter((sc) => isInRange(sc.dueDate, range.start, range.end))
          .forEach((sc) => {
            acc += sc.amount * interestRatio;
          });
        return sum + acc;
      }
      if (!loan.dueDate) return sum;
      const baseDate = new Date(loan.dueDate + "T00:00:00");
      if (isNaN(baseDate.getTime())) return sum;
      let acc = 0;
      for (let i = 0; i < loan.installments; i++) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (isInRange(dStr, range.start, range.end)) acc += interestPerInstallment;
      }
      return sum + acc;
    }
    if (loan.dueDate && isInRange(loan.dueDate, range.start, range.end)) {
      return sum + totalInterest;
    }
    return sum;
  }, 0);

  const interestOnlyInPeriod = payments
    .filter((p) => p.installmentNumber === 0 && isInRange(p.date, range.start, range.end))
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  return periodProfitExpected + interestOnlyInPeriod;
}

/**
 * ——— Fonte única do indicador "Faturamento do Período" ———
 * Replica EXATAMENTE a regra do card do Dashboard:
 *   Realizado  = juros alocados aos pagamentos com data no mês (regime travado)
 *   Previsto   = Realizado + juros das parcelas NÃO pagas com vencimento no mês
 *   Percentual = Realizado ÷ Previsto × 100
 * Usa `installmentSchedules` (datas remarcadas/renegociadas são respeitadas)
 * e NÃO considera principal, multa ou quitação antecipada no numerador.
 */
export function computeMonthProfitGoal(
  loans: any[],
  payments: any[],
  schedules: ScheduleLike[],
  m: string,
): { realized: number; expectedTotal: number; pct: number } {
  const [yy, mm] = m.split("-").map(Number);
  if (!yy || !mm) return { realized: 0, expectedTotal: 0, pct: 0 };
  const start = new Date(yy, mm - 1, 1, 0, 0, 0);
  const end = new Date(yy, mm, 0, 23, 59, 59);
  const pad = (n: number) => String(n).padStart(2, "0");
  const cutoff = `${yy}-${pad(mm)}-${pad(new Date(yy, mm, 0).getDate())}`;

  const paymentsSorted = [...payments].sort((a: any, b: any) => {
    const d = (a.date || "").localeCompare(b.date || "");
    if (d !== 0) return d;
    return (a.createdAt ?? a.created_at ?? "").localeCompare(b.createdAt ?? b.created_at ?? "");
  });
  const interestByPaymentId = allocateInterestByPaymentUpTo(loans as any, paymentsSorted as any, cutoff);
  const realized = payments
    .filter((p: any) => isInRange((p.date || "").slice(0, 10), start, end))
    .reduce((s: number, p: any) => s + (interestByPaymentId.get(p.id) ?? 0), 0);

  // Calcula o total pago por empréstimo considerando estritamente pagamentos até o fim do mês
  const totalPaidByLoanUpToCutoff = payments.reduce<Record<string, number>>((acc, payment: any) => {
    const loanId = payment.loanId || payment.loan_id;
    const pDate = (payment.date || "").slice(0, 10);
    if (!loanId || !pDate || pDate > cutoff) return acc;
    acc[loanId] = (acc[loanId] || 0) + (Number(payment.amount) || 0);
    return acc;
  }, {});

  const expectedUnpaid = loans.reduce((sum: number, loan: any) => {
    const principal = Number(loan.amount) || 0;
    const rate = Number(loan.interestRate ?? loan.interest_rate) || 0;
    const inst = Number(loan.installments) || 1;
    const totalWithInterest = calculateTotalWithInterest(principal, rate, inst);
    const totalInterest = Math.max(0, totalWithInterest - principal);
    if (totalInterest <= 0) return sum;
    const interestRatio = totalWithInterest > 0 ? 1 - principal / totalWithInterest : 0;

    // Para evitar que quitações ocorridas em meses posteriores zerem as parcelas não pagas deste mês,
    // calculamos as parcelas quitadas estritamente com base nos valores pagos até a data de corte.
    const paidAmountUpToCutoff = totalPaidByLoanUpToCutoff[loan.id] || 0;
    const installmentVal = totalWithInterest / Math.max(1, inst);
    const paidInstsUpToCutoff = Math.floor((paidAmountUpToCutoff + 0.01) / installmentVal);
    const isPaidInstallment = (n: number) => n <= paidInstsUpToCutoff;
    const dueDate = (loan.dueDate || loan.due_date || "").slice(0, 10);

    if (inst >= 2) {
      const loanSchedules = schedules.filter((sc: any) => (sc.loanId || (sc as any).loan_id) === loan.id);
      if (loanSchedules.length > 0) {
        return sum + loanSchedules
          .filter((sc) => isInRange(sc.dueDate, start, end) && !isPaidInstallment(sc.installmentNumber))
          .reduce((s, sc) => s + sc.amount * interestRatio, 0);
      }
      if (!dueDate) return sum;
      const base = new Date(dueDate + "T00:00:00");
      if (isNaN(base.getTime())) return sum;
      const interestPerInstallment = totalInterest / inst;
      let acc = 0;
      for (let i = 0; i < inst; i++) {
        const d = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
        const dStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        if (isInRange(dStr, start, end) && !isPaidInstallment(i + 1)) acc += interestPerInstallment;
      }
      return sum + acc;
    }

    if (dueDate && isInRange(dueDate, start, end) && !isPaidInstallment(1)) return sum + totalInterest;
    return sum;
  }, 0);

  const expectedTotal = realized + expectedUnpaid;
  return { realized, expectedTotal, pct: expectedTotal > 0 ? (realized / expectedTotal) * 100 : 0 };
}
