import { todayInAppTz } from "@/lib/timezone";
import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";

function calculateTotalWithInterest(principal: number, rate: number) {
  return Math.round(principal * (1 + rate / 100));
}

function getFirstPendingDueDate(loan: Loan, schedules: InstallmentSchedule[]) {
  const nextInstallmentNumber = loan.paidInstallments + 1;
  const nextSchedule = schedules.find(
    (schedule) => schedule.loanId === loan.id && schedule.installmentNumber === nextInstallmentNumber,
  );

  return nextSchedule?.dueDate ?? loan.dueDate;
}

export function getBaseRemainingAmount(loan: Loan, payments: Payment[], schedules: InstallmentSchedule[]) {
  // Fonte de verdade alinhada ao card por contrato (LoanList): prioriza loan.remainingAmount
  // quando preenchido. Cai para a soma de schedules pendentes apenas como fallback.
  if (loan.remainingAmount != null && loan.remainingAmount > 0) {
    return loan.remainingAmount;
  }

  const unpaidSchedules = schedules.filter(
    (schedule) => schedule.loanId === loan.id && schedule.installmentNumber > loan.paidInstallments,
  );
  const unpaidSchedulesTotal = unpaidSchedules.reduce((sum, schedule) => sum + schedule.amount, 0);

  if (loan.installments >= 2 && unpaidSchedulesTotal > 0) {
    return unpaidSchedulesTotal;
  }

  const totalExpected = calculateTotalWithInterest(loan.amount, loan.interestRate);
  const totalPaid = payments
    .filter((payment) => payment.loanId === loan.id)
    .reduce((sum, payment) => sum + payment.amount, 0);

  return Math.max(0, totalExpected - totalPaid);
}


export function getLoanLateFees(loan: Loan, payments: Payment[], schedules: InstallmentSchedule[]) {
  // Mesmo para contratos quitados, calculamos se houve multas/mora geradas,
  // mas o foco da análise de "Atrasados" geralmente é para contratos abertos.
  if (loan.status === "paid") {
    return { daysOverdue: 0, lateInterestTotal: 0, penaltyTotal: 0, lateFees: 0 };
  }

  const todayStr = todayInAppTz();
  const today = new Date(`${todayStr}T00:00:00`);

  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const paidByInstallment = new Map<number, number>();

  // Mapeamos pagamentos por parcela (considerando principal + juros contratuais apenas para amortizar a parcela)
  loanPayments.forEach(p => {
    const inst = p.installmentNumber;
    if (inst > 0) {
      paidByInstallment.set(inst, (paidByInstallment.get(inst) ?? 0) + p.amount);
    }
  });

  const unpaidSchedules = schedules
    .filter((s) => s.loanId === loan.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  let lateInterestTotal = 0;
  let penaltyTotal = 0;
  let maxDaysOverdue = 0;

  if (loan.installments > 1 && unpaidSchedules.length > 0) {
    let overdueSchedulesCount = 0;
    // Para parcelados, calculamos encargos de juros de mora para CADA parcela vencida
    unpaidSchedules.forEach(s => {
      const paid = paidByInstallment.get(s.installmentNumber) ?? 0;
      if (paid < s.amount - 0.01) {
        const due = new Date(`${s.dueDate}T00:00:00`);
        const days = Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

        if (days > 0) {
          maxDaysOverdue = Math.max(maxDaysOverdue, days);
          overdueSchedulesCount++;

          const pending = Math.max(0, s.amount - paid);
          // Juros por atraso (mora diária) aplicam estritamente para dias vencidos
          if (loan.lateInterestValue != null && loan.lateInterestValue > 0) {
            if (loan.lateInterestType === "fixed") {
              lateInterestTotal += loan.lateInterestValue * days;
            } else {
              lateInterestTotal += pending * (loan.lateInterestValue / 100) * days;
            }
          }
        }
      }
    });

    // Multa: compõe o valor ativo mesmo que ainda não vencido (multiplica por parcelas vencidas se houver atraso)
    if (loan.penaltyValue != null && Number(loan.penaltyValue) > 0) {
      penaltyTotal = Number(loan.penaltyValue) * (overdueSchedulesCount > 0 ? overdueSchedulesCount : 1);
    }
  } else {
    // Parcela única
    const dueDate = loan.dueDate;
    const due = new Date(`${dueDate}T00:00:00`);
    const days = Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

    if (days > 0) {
      maxDaysOverdue = days;
      const baseRemaining = getBaseRemainingAmount(loan, payments, schedules);

      // Juros por atraso (mora diária) aplicam estritamente para dias vencidos
      if (loan.lateInterestValue != null && loan.lateInterestValue > 0) {
        if (loan.lateInterestType === "fixed") {
          lateInterestTotal = loan.lateInterestValue * days;
        } else {
          lateInterestTotal = baseRemaining * (loan.lateInterestValue / 100) * days;
        }
      }
    }

    // Multa: compõe o valor ativo mesmo que o empréstimo não esteja vencido
    if (loan.penaltyValue != null && Number(loan.penaltyValue) > 0) {
      penaltyTotal = Number(loan.penaltyValue);
    }
  }

  return {
    daysOverdue: maxDaysOverdue,
    lateInterestTotal: Math.round(lateInterestTotal * 100) / 100,
    penaltyTotal: Math.round(penaltyTotal * 100) / 100,
    lateFees: Math.round((lateInterestTotal + penaltyTotal) * 100) / 100,
  };
}
/**
 * Fórmula única do "Total a Receber" por contrato.
 * Usada tanto pelo card individual (LoanList row) quanto pelo card agregado
 * "Total a Receber" do topo da aba Empréstimos.
 *
 * Regras:
 *  - base = getBaseRemainingAmount (prioriza loan.remainingAmount)
 *  - + multa/juros de atraso (getLoanLateFees)
 *  - + multa de renegociação SOMENTE em contratos de parcela única;
 *    em parcelados ela já está diluída nas próximas parcelas.
 */
export function getLoanReceivable(loan: Loan, payments: Payment[], schedules: InstallmentSchedule[]) {
  if (loan.status === "paid") return 0;
  const base = getBaseRemainingAmount(loan, payments, schedules);
  const fees = getLoanLateFees(loan, payments, schedules);
  const renegPenalty = loan.installments < 2 ? Number(loan.renegotiationPenaltyTotal || 0) : 0;
  return Math.max(0, base + fees.lateFees + renegPenalty);
}
