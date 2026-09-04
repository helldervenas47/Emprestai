import type { Loan, InstallmentSchedule, Payment } from "@/types/loan";
import { calculateInstallment } from "@/features/loans/hooks/useLoans";
import { todayInAppTz } from "@/lib/timezone";
import { getBaseRemainingAmount } from "./loanLateFees";

/**
 * Retorna o valor da próxima parcela em aberto do contrato (apenas a próxima).
 */
export function getInstallmentAmount(loan: Loan, schedules: InstallmentSchedule[], payments: Payment[] = []): number {
  // Para parcela única (installments <= 1), usar remaining_amount diretamente
  if (loan.installments <= 1) {
    if (loan.remainingAmount != null && loan.remainingAmount > 0) {
      return loan.remainingAmount;
    }
    if (payments.length > 0) {
      return getBaseRemainingAmount(loan, payments, schedules);
    }
    return loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, 1);
  }

  const nextNum = (loan.paidInstallments || 0) + 1;
  const schedule = schedules.find(
    (s) => s.loanId === loan.id && s.installmentNumber === nextNum,
  );
  if (schedule) {
    // Considera pagamentos parciais já aplicados ao saldo do contrato:
    let currentBalance = -1;
    if (loan.remainingAmount != null && loan.remainingAmount >= 0) {
      currentBalance = Number(loan.remainingAmount);
    } else if (payments.length > 0) {
      // Fallback: calcula o saldo via sum(schedules) - sum(payments)
      const totalExpected = schedules.filter(s => s.loanId === loan.id).reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const totalPaid = payments.filter(p => p.loanId === loan.id).reduce((s, x) => s + (Number(x.amount) || 0), 0);
      currentBalance = Math.max(0, totalExpected - totalPaid);
    }

    if (currentBalance >= 0) {
      const futureSum = schedules
        .filter((s) => s.loanId === loan.id && s.installmentNumber > nextNum)
        .reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
      currentBalance = Math.max(0, currentBalance - futureSum);
      return Math.round(Math.min(Number(schedule.amount), currentBalance) * 100) / 100;
    }
    return Number(schedule.amount);
  }

  // Contrato parcelado sem cronograma persistido:
  const rawInstallments = loan.installments || 1;
  const defaultAmt = loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, rawInstallments);
  if (loan.remainingAmount != null && loan.remainingAmount > 0) {
    return Math.round(Math.min(defaultAmt, loan.remainingAmount) * 100) / 100;
  }
  return Math.round(defaultAmt * 100) / 100;
}

/**
 * Retorna o valor exibido/cobrado para uma parcela específica em aberto.
 * Pagamentos parciais abatem somente a próxima parcela pendente; parcelas futuras
 * preservam o valor original do cronograma.
 */
export function getOpenInstallmentAmount(
  loan: Loan,
  schedules: InstallmentSchedule[],
  installmentNumber: number,
): number {
  const schedule = schedules.find(
    (s) => s.loanId === loan.id && s.installmentNumber === installmentNumber,
  );

  if (installmentNumber === (loan.paidInstallments || 0) + 1) {
    return getInstallmentAmount(loan, schedules);
  }

  if (schedule) return Number(schedule.amount || 0);

  const rawInstallments = loan.installments || 1;
  const defaultAmt = loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, rawInstallments);
  if (loan.remainingAmount != null && loan.remainingAmount > 0) {
    return Math.round(Math.min(defaultAmt, loan.remainingAmount) * 100) / 100;
  }
  return Math.round(defaultAmt * 100) / 100;
}

/**
 * Retorna a lista de parcelas vencidas (dueDate < hoje, ainda não pagas).
 * Usado para somar o valor TOTAL em atraso quando há múltiplas parcelas vencidas.
 */
export function getOverdueInstallments(
  loan: Loan,
  schedules: InstallmentSchedule[],
  todayStr: string = todayInAppTz(),
  payments: Payment[] = [],
): { installmentNumber: number; dueDate: string; amount: number }[] {
  const paid = loan.paidInstallments || 0;
  // Parcela única: trata como uma única parcela vencida se dueDate < hoje
  if (loan.installments <= 1) {
    if (loan.dueDate < todayStr && paid < 1) {
      const baseRem = loan.remainingAmount != null && loan.remainingAmount >= 0
        ? Number(loan.remainingAmount)
        : getBaseRemainingAmount(loan, payments, schedules);

      if (baseRem <= 0.01) return [];

      return [{
        installmentNumber: 1,
        dueDate: loan.dueDate,
        amount: baseRem,
      }];
    }
    return [];
  }

  const hasAnySchedule = schedules.some((s) => s.loanId === loan.id);
  const loanSchedules = schedules
    .filter((s) => s.loanId === loan.id && s.installmentNumber > paid && s.dueDate < todayStr)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  if (loanSchedules.length > 0) {
    const nextNum = paid + 1;
    return loanSchedules.map((s) => ({
      installmentNumber: s.installmentNumber,
      dueDate: s.dueDate,
      amount: s.installmentNumber === nextNum
        ? getInstallmentAmount(loan, schedules)
        : s.amount,
    }));
  }

  // Se já existe cronograma carregado para este contrato e nenhuma parcela vencida foi
  // encontrada acima, NÃO usar loan.dueDate como fallback — ele pode estar desatualizado
  // (renegociações, pagamentos antecipados). O cronograma é a fonte da verdade.
  if (hasAnySchedule) return [];

  // Fallback: somente próxima parcela se vencida (contratos sem cronograma persistido)
  if (loan.dueDate < todayStr) {
    return [{
      installmentNumber: paid + 1,
      dueDate: loan.dueDate,
      amount: getInstallmentAmount(loan, schedules),
    }];
  }
  return [];
}

/**
 * Soma o valor total em atraso de um contrato (todas as parcelas vencidas + encargos).
 */
export function getOverdueAmount(
  loan: Loan,
  schedules: InstallmentSchedule[],
  todayStr: string = todayInAppTz(),
  payments: Payment[] = [],
): number {
  const overdueInsts = getOverdueInstallments(loan, schedules, todayStr);
  const nominalOverdue = overdueInsts.reduce((s, i) => s + i.amount, 0);

  // Mapeamos os pagamentos para alocação nominal (excluindo juros puros/parcela 0)
  const totalNominalPaid = payments
    .filter((p) => p.loanId === loan.id && p.installmentNumber !== 0 && p.installmentNumber !== -2)
    .reduce((sum, p) => {
      const md = (p.metadata ?? {}) as any;
      const fees = (Number(md.late_interest_amount || 0) + Number(md.penalty_amount || 0));
      return sum + Math.max(0, p.amount - fees);
    }, 0);

  const totalFeesPaid = payments
    .filter((p) => p.loanId === loan.id)
    .reduce((sum, p) => {
      const md = (p.metadata ?? {}) as any;
      return sum + (Number(md.late_interest_amount || 0) + Number(md.penalty_amount || 0));
    }, 0);

  // Calculamos encargos para cada parcela vencida seguindo a mesma lógica da Análise Anual
  let runningNominalPaid = totalNominalPaid;
  let runningFeesPaid = totalFeesPaid;
  let totalFeesPending = 0;

  // Precisamos do plano completo para abater pagamentos nominais anteriores
  // Para simplificar aqui, assumimos que as parcelas do getOverdueInstallments 
  // já consideram pagamentos parciais no seu '.amount' (o que getInstallmentAmount faz).
  // Porém, para mora e multa, precisamos da base exata.

  for (const inst of overdueInsts) {
    const dueDate = new Date(inst.dueDate + "T00:00:00");
    const days = Math.max(0, Math.floor((new Date(todayStr + "T00:00:00").getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    if (days > 0) {
      const penalty = Number(loan.penaltyValue) || 0;
      let mora = 0;
      if (loan.lateInterestValue != null && loan.lateInterestValue > 0) {
        // Base da mora: parcela individual para paridade total
        const lateBase = inst.amount;
        mora = loan.lateInterestType === "fixed"
          ? loan.lateInterestValue * days
          : lateBase * (loan.lateInterestValue / 100) * days;
      }

      const totalAppliedFees = Math.round((penalty + mora) * 100) / 100;
      const feesPaidOnThisInst = Math.min(totalAppliedFees, runningFeesPaid);
      runningFeesPaid = Math.max(0, runningFeesPaid - feesPaidOnThisInst);

      totalFeesPending += Math.max(0, Math.round((totalAppliedFees - feesPaidOnThisInst) * 100) / 100);
    }
  }

  return Math.round((nominalOverdue + totalFeesPending) * 100) / 100;
}
