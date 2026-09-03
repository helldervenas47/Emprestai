import { Loan } from "@/types/loan";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";

export interface MonthlyInterestRateSummary {
  totalLent: number;
  totalToReceive: number;
  rate: number | null;
  hasData: boolean;
}

export function calculateMonthlyInterestRate(loans: Loan[]): MonthlyInterestRateSummary {
  // Contratos com taxa 0% não entram no cálculo da taxa média de juros / rentabilidade.
  const interestBearing = loans.filter((l) => (Number(l.interestRate) || 0) > 0);
  const totalLent = interestBearing.reduce((sum, loan) => sum + (Number(loan.amount) || 0), 0);
  const totalToReceive = interestBearing.reduce((sum, loan) => {
    return sum + calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  }, 0);

  if (totalLent <= 0) {
    return {
      totalLent,
      totalToReceive,
      rate: null,
      hasData: false,
    };
  }

  // Taxa total ponderada pelo valor emprestado (para contratos parcelados é a taxa total do contrato)
  const rate = ((totalToReceive - totalLent) / totalLent) * 100;

  return {
    totalLent,
    totalToReceive,
    rate,
    hasData: true,
  };
}