import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import {
  allocateInterestByPayment,
  buildInstallmentBreakdown,
} from "@/features/financial/lib/interestAllocation";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Composição oficial dos juros do CICLO/PARCELA ATUAL.
 *
 * Conceitos (nunca reutilizar um pelo outro):
 *  - `totalContractInterest`      → todos os juros previstos no contrato;
 *  - `currentInstallmentInterest` → juros que pertencem SOMENTE à parcela atual;
 *  - `currentInterestPaid`        → juros já pagos dentro dessa mesma parcela;
 *  - `currentInterestPending`     → parcela atual − já pago nela.
 *
 * Contratos parcelados (`installments > 1`) NUNCA usam o juro total do contrato
 * como juro do ciclo: o valor vem do cronograma oficial da parcela vigente.
 */
export interface CurrentCycleInterest {
  installments: number;
  /** Número da parcela vigente (1..N). 1 para contratos de parcela única. */
  currentInstallmentNumber: number;
  totalContractInterest: number;
  currentInstallmentInterest: number;
  currentInterestPaid: number;
  currentInterestPending: number;
  /** "schedule" = cronograma real de valores; "uniform" = divisão uniforme; "single" = ciclo único. */
  source: "schedule" | "uniform" | "single";
}

const totalWithInterest = (principal: number, rate: number) =>
  Math.round(principal * (1 + rate / 100));

function paymentsOf(loan: Loan, payments: Payment[]): Payment[] {
  return payments.filter((p) => p.loanId === loan.id);
}

/** Parcelas regulares já quitadas (installmentNumber >= 1) presentes no histórico. */
function paidInstallmentNumbers(loanPayments: Payment[]): Set<number> {
  const set = new Set<number>();
  for (const p of loanPayments) {
    if (p.installmentNumber >= 1) set.add(p.installmentNumber);
  }
  return set;
}

/**
 * Determina a parcela vigente. O cronograma (parcelas ainda não pagas)
 * prevalece; caso contrário usa `paidInstallments + 1`.
 */
export function getCurrentInstallmentNumber(
  loan: Loan,
  payments: Payment[],
  schedules?: InstallmentSchedule[],
): number {
  const N = Math.max(1, Math.floor(Number(loan.installments) || 1));
  const loanPayments = paymentsOf(loan, payments);
  const paid = paidInstallmentNumbers(loanPayments);

  const own = (schedules ?? [])
    .filter((s) => s.loanId === loan.id)
    .map((s) => s.installmentNumber)
    .filter((n) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b);

  for (const n of own) {
    if (!paid.has(n)) return Math.min(N, n);
  }

  if (own.length === 0) {
    for (let n = 1; n <= N; n++) {
      if (!paid.has(n)) return n;
    }
  }

  const fromCounter = Math.min(N, Math.max(1, (Number(loan.paidInstallments) || 0) + 1));
  return fromCounter;
}

/** Juros já pagos DENTRO da parcela `installmentNumber` (nunca de outra parcela). */
function interestPaidOnInstallment(
  loan: Loan,
  loanPayments: Payment[],
  installmentNumber: number,
): number {
  const interestByPayment = allocateInterestByPayment([loan as any], loanPayments as any);
  let paid = 0;
  for (const p of loanPayments) {
    const md = (p.metadata ?? null) as any;
    // Encargos de atraso jamais abatem juros do ciclo.
    if (md?.kind === "late_fee" || md?.kind === "penalty") continue;

    const target = Number(
      md?.installment_number ?? md?.installmentNumber ?? NaN,
    );
    const belongs = p.installmentNumber === installmentNumber
      || (p.installmentNumber <= 0 && Number.isFinite(target) && target === installmentNumber);
    if (!belongs) continue;

    const persisted = md?.interest_amount != null ? Number(md.interest_amount) : NaN;
    if (Number.isFinite(persisted) && persisted >= 0) {
      paid += persisted;
      continue;
    }
    paid += interestByPayment.get(p.id) ?? 0;
  }
  return round2(Math.max(0, paid));
}

export function getCurrentCycleInterest(params: {
  loan: Loan;
  payments: Payment[];
  schedules?: InstallmentSchedule[];
  /** Juros do ciclo já calculado para contratos de parcela única (regra legada). */
  singleCycleInterest?: number;
}): CurrentCycleInterest {
  const { loan, payments, schedules } = params;
  const principal = Math.max(0, Number(loan.amount) || 0);
  const rate = Number(loan.interestRate) || 0;
  const N = Math.max(1, Math.floor(Number(loan.installments) || 1));
  const totalContract = totalWithInterest(principal, rate);
  const totalContractInterest = round2(Math.max(0, totalContract - principal));
  const loanPayments = paymentsOf(loan, payments);
  const isPaid = loan.status === "paid";

  // ---- Regra 7: contrato de parcela única mantém a regra do ciclo integral.
  if (N <= 1) {
    const cycle = params.singleCycleInterest != null
      ? Math.max(0, params.singleCycleInterest)
      : loan.customInterestValue != null && loan.customInterestValue > 0
        ? loan.customInterestValue
        : principal * (rate / 100);
    return {
      installments: 1,
      currentInstallmentNumber: 1,
      totalContractInterest,
      currentInstallmentInterest: round2(cycle),
      currentInterestPaid: 0,
      currentInterestPending: isPaid ? 0 : round2(cycle),
      source: "single",
    };
  }

  if (isPaid) {
    return {
      installments: N,
      currentInstallmentNumber: N,
      totalContractInterest,
      currentInstallmentInterest: 0,
      currentInterestPaid: 0,
      currentInterestPending: 0,
      source: "schedule",
    };
  }

  // ---- Regra 2/3: cronograma oficial como fonte prioritária; fallback uniforme.
  const ownSchedules = (schedules ?? [])
    .filter((s) => s.loanId === loan.id && s.installmentNumber >= 1 && s.installmentNumber <= N)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  let customAmounts: number[] | undefined;
  let source: CurrentCycleInterest["source"] = "uniform";
  if (ownSchedules.length === N) {
    customAmounts = ownSchedules.map((s) => round2(Number(s.amount) || 0));
    source = "schedule";
  }

  // Regra 4: `buildInstallmentBreakdown` distribui os centavos de forma
  // determinística — a última parcela absorve o resíduo, então a soma dos
  // juros das parcelas fecha EXATAMENTE o juro total do contrato.
  const breakdown = buildInstallmentBreakdown(
    { amount: principal, interestRate: rate, installments: N },
    customAmounts,
  );

  const currentInstallmentNumber = getCurrentInstallmentNumber(loan, payments, schedules);
  const entry = breakdown.find((e) => e.installmentNumber === currentInstallmentNumber)
    ?? breakdown[breakdown.length - 1];
  const currentInstallmentInterest = round2(Math.max(0, entry?.interest ?? 0));

  // Regra 6: só descontar juros pagos DENTRO da parcela atual.
  const currentInterestPaid = Math.min(
    currentInstallmentInterest,
    interestPaidOnInstallment(loan, loanPayments, currentInstallmentNumber),
  );

  return {
    installments: N,
    currentInstallmentNumber,
    totalContractInterest,
    currentInstallmentInterest,
    currentInterestPaid: round2(currentInterestPaid),
    currentInterestPending: round2(Math.max(0, currentInstallmentInterest - currentInterestPaid)),
    source,
  };
}
