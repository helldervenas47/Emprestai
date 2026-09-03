import { useMemo } from "react";
import { Loan, Payment, InstallmentSchedule } from "@/types/loan";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { getDaysOverdue, getLoanCategory, getTotalPaid } from "@/features/loans/components/list/calculations";
import { statusMap } from "@/features/loans/components/list/constants";
import { getInstallmentAmount, getOverdueAmount } from "@/features/loans/lib/loanInstallmentAmount";
import { getLoanLateFees, getBaseRemainingAmount, getLoanReceivable } from "@/features/loans/lib/loanLateFees";

export function useLoanCalculations(loan: Loan, allPayments: Payment[], installmentSchedules: InstallmentSchedule[] = []) {
  return useMemo(() => {
    const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
    const totalPaid = getTotalPaid(loan, allPayments);
    const unpaidSchedules = installmentSchedules
      .filter((s) => s.loanId === loan.id && s.installmentNumber > loan.paidInstallments)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    const allUnpaidScheduleSum = unpaidSchedules.reduce((sum, s) => sum + s.amount, 0);
    
    // Source of truth: loan.remainingAmount
    const baseRemaining = loan.status === "paid"
      ? 0
      : loan.remainingAmount != null && loan.remainingAmount > 0
        ? loan.remainingAmount
        : Math.max(0, total - totalPaid);

    const daysOverdue = getDaysOverdue(loan, installmentSchedules);
    const effectiveDaysLate = Math.max(0, daysOverdue);
    
    let lateInterestTotal = 0;
    if (loan.lateInterestValue != null && loan.lateInterestValue > 0 && effectiveDaysLate > 0 && loan.status !== "paid") {
      if (loan.lateInterestType === "fixed") {
        lateInterestTotal = loan.lateInterestValue * effectiveDaysLate;
      } else {
        lateInterestTotal = baseRemaining * (loan.lateInterestValue / 100) * effectiveDaysLate;
      }
    }
    const penaltyTotal = (loan.penaltyValue != null && loan.penaltyValue > 0 && loan.status !== "paid") 
      ? loan.penaltyValue 
      : 0;
    const renegPenaltyPending = (loan.installments < 2 && loan.status !== "paid")
      ? Number(loan.renegotiationPenaltyTotal || 0)
      : 0;
    const lateFees = lateInterestTotal + penaltyTotal + renegPenaltyPending;
    
    const interestPaymentsReceived = allPayments
      .filter((p) => p.loanId === loan.id && p.installmentNumber === 0)
      .reduce((sum, p) => sum + p.amount, 0);
      
    const remaining = baseRemaining + lateFees;
    const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
    const nextSchedule = unpaidSchedules[0];
    
    const fullInstallmentValue = nextSchedule
      ? nextSchedule.amount
      : loan.customInstallmentValue != null && loan.customInstallmentValue > 0
        ? loan.customInstallmentValue
        : (loan.installments >= 2 ? total / loan.installments : baseRemaining);
        
    const actualRemainingRow = loan.status === "paid"
      ? 0
      : loan.remainingAmount != null && loan.remainingAmount > 0
        ? loan.remainingAmount
        : Math.max(0, total - totalPaid);
        
    const expectedRemainingRow = nextSchedule
      ? allUnpaidScheduleSum
      : fullInstallmentValue * remainingInstallments;
      
    const partialPaidOnCurrentRow = Math.max(0, expectedRemainingRow - actualRemainingRow);
    const installmentValue = Math.max(0, fullInstallmentValue - partialPaidOnCurrentRow);
    
    const interestOnlyRow = loan.customInterestValue != null && loan.customInterestValue > 0
      ? loan.customInterestValue
      : loan.amount * (loan.interestRate / 100);
      
    const interestCyclePartialPaymentsRow = allPayments
      .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
        && (p as any).metadata?.kind === "interest_partial"
        && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate))
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      
    const interestCyclePartialsRow = interestCyclePartialPaymentsRow.reduce((s, p) => s + Number(p.amount || 0), 0);
    const lastCyclePartialRow = interestCyclePartialPaymentsRow[interestCyclePartialPaymentsRow.length - 1];
    const lastCyclePendingAfterRow = lastCyclePartialRow ? Number((lastCyclePartialRow as any).metadata?.cycle_pending_after) : NaN;
    
    const interestPendingRow = Number.isFinite(lastCyclePendingAfterRow)
      ? Math.max(0, Math.round(lastCyclePendingAfterRow * 100) / 100)
      : Math.max(0, Math.round((interestOnlyRow - interestCyclePartialsRow) * 100) / 100);
      
    const isParcelado = (loan.paymentType === "Parcelado" || loan.installments >= 2) && loan.status !== "paid" && loan.paidInstallments < loan.installments;
    
    const category = getLoanCategory(loan, allPayments, installmentSchedules);
    const badge = statusMap[category];
    const overdueAmount = getOverdueAmount(loan, installmentSchedules, new Date().toISOString().split("T")[0], allPayments);

    return {
      total,
      totalPaid,
      unpaidSchedules,
      allUnpaidScheduleSum,
      baseRemaining,
      daysOverdue,
      effectiveDaysLate,
      lateInterestTotal,
      penaltyTotal,
      renegPenaltyPending,
      lateFees,
      interestPaymentsReceived,
      remaining,
      remainingInstallments,
      nextSchedule,
      fullInstallmentValue,
      actualRemainingRow,
      expectedRemainingRow,
      partialPaidOnCurrentRow,
      installmentValue,
      interestOnlyRow,
      interestCyclePartialPaymentsRow,
      interestCyclePartialsRow,
      lastCyclePartialRow,
      lastCyclePendingAfterRow,
      interestPendingRow,
      isParcelado,
      category,
      badge,
      overdueAmount
    };
  }, [loan, allPayments, installmentSchedules]);
}
